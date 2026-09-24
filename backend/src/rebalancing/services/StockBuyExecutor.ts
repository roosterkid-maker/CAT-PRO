import {
  marketCache,
} from "../../services/cache.service";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  centralLiveOrderExecutionGateway,
  type CentralLiveOrderGatewayResponse,
} from "../../execution/live/central/CentralLiveOrderExecutionGateway";

import {
  liveTradingInterlock,
} from "../../execution/live/LiveTradingInterlock";

import {
  coinSwitchCapability,
  priceStepOf,
  quantityStepOf,
} from "../../execution/live/inr-routes/InrRouteLiveRunner";

import {
  orderRequest,
} from "../../execution/live/inr-routes/InrRouteSessionExecutor";

import {
  floorToStep,
} from "../../execution/live/inr-routes/InrRoutePlanner";

/*
 * Capital manager: buys core-basket stock (a coin on the exchange where its
 * route SELLS) with that exchange's own cash, through the same audited
 * per-venue order contracts and central gateway as the arbitrage legs. It
 * holds the shared live-trading slot while it works, never buys at more than
 * 1% above the cheapest other venue, and reports an unresolved order as
 * UNKNOWN instead of guessing.
 */
export interface StockBuyRequest {
  readonly venue: string;
  readonly coin: string;
  readonly quote: "INR" | "USDT";
  readonly amountInr: number;
  readonly usdtInr: number;
  readonly now: number;
}

export interface StockBuyResult {
  readonly status: "FILLED" | "PARTIAL" | "NO_FILL" | "SKIPPED" | "UNKNOWN";
  readonly spentInr: number;
  readonly filledQuantity: number;
  readonly averagePrice: number | null;
  readonly orderId: string | null;
  readonly detail: string;
}

export interface StockBuyPort {
  buy(request: StockBuyRequest): Promise<StockBuyResult>;
}

const QUOTE_MAX_AGE_MS = 10_000;
const PRICE_BUFFER = 1.003;
const MAXIMUM_PREMIUM = 1.01;
const BOUNDED_WAIT_MS = 2_500;
const LATE_READS = 6;
const LATE_READ_INTERVAL_MS = 2_500;
const TERMINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "FAILED"]);
const INR_VENUES = ["coindcx", "coinswitch", "unocoin"];
const USDT_VENUES = ["binance", "bybit", "coindcx"];

export function venueMarket(venue: string, coin: string, quote: "INR" | "USDT"): string {
  return venue === "coinswitch" || venue === "unocoin" ? `${coin}_${quote}` : `${coin}${quote}`;
}

function freshAsk(venue: string, market: string, now: number): number | null {
  const quote = marketCache.get(venue, market) ?? marketCache.get(venue, market.replace(/_/gu, ""));
  if (!quote || quote.bestAskPrice === null || !(quote.bestAskPrice > 0) || now - quote.timestamp > QUOTE_MAX_AGE_MS) return null;
  return quote.bestAskPrice;
}

/** Cheapest fresh ask for the coin in INR on any other venue. */
function cheapestElsewhereInr(coin: string, venue: string, usdtInr: number, now: number): number | null {
  const prices: number[] = [];
  for (const other of INR_VENUES) {
    if (other === venue) continue;
    const ask = freshAsk(other, venueMarket(other, coin, "INR"), now);
    if (ask !== null) prices.push(ask);
  }
  for (const other of USDT_VENUES) {
    if (other === venue) continue;
    const ask = freshAsk(other, venueMarket(other, coin, "USDT"), now);
    if (ask !== null) prices.push(ask * usdtInr);
  }
  return prices.length > 0 ? Math.min(...prices) : null;
}

async function rulesFor(venue: string, market: string): Promise<ExchangeMarketCapability | null> {
  if (venue === "coinswitch") return coinSwitchCapability(market);
  return exchangeCapabilityService.getCachedCapability(venue, market, "spot") ??
    (await exchangeCapabilityService.getCapability({exchange: venue, market, product: "spot"}).catch(() => null));
}

function roundUp(price: number, step: number | null): number {
  if (!(step !== null && step > 0)) return price;
  const decimals = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 2));
  return Number((Math.ceil(price / step - 1e-9) * step).toFixed(decimals));
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class DefaultStockBuyExecutor implements StockBuyPort {
  async buy(request: StockBuyRequest): Promise<StockBuyResult> {
    const skip = (detail: string): StockBuyResult => ({status: "SKIPPED", spentInr: 0, filledQuantity: 0, averagePrice: null, orderId: null, detail});
    const market = venueMarket(request.venue, request.coin, request.quote);
    const toInr = request.quote === "USDT" ? request.usdtInr : 1;

    const ask = freshAsk(request.venue, market, request.now);
    if (ask === null) return skip(`No fresh ${market} price on ${request.venue}.`);
    const cheapest = cheapestElsewhereInr(request.coin, request.venue, request.usdtInr, request.now);
    if (cheapest !== null && ask * toInr > cheapest * MAXIMUM_PREMIUM) {
      return skip(`${request.coin} on ${request.venue} is ${(((ask * toInr) / cheapest - 1) * 100).toFixed(2)}% above the cheapest venue; not buying stock at a premium.`);
    }

    const rules = await rulesFor(request.venue, market);
    if (!rules || !rules.tradingEnabled || rules.maintenanceMode) return skip(`${market} rules unavailable or market not trading on ${request.venue}.`);
    const step = quantityStepOf(rules);
    if (!(step !== null && step > 0)) return skip(`${market} lot step unknown on ${request.venue}.`);

    const limit = roundUp(ask * PRICE_BUFFER, priceStepOf(rules));
    const quantity = floorToStep(request.amountInr / toInr / limit, step);
    if (quantity <= 0) return skip("Amount rounds to zero at the venue lot step.");
    if (rules.quantity.minimumQuantity !== null && quantity < rules.quantity.minimumQuantity) return skip(`Below ${request.venue} minimum quantity.`);
    if (rules.notional.minimumNotional !== null && quantity * limit < rules.notional.minimumNotional) return skip(`Below ${request.venue} minimum order value.`);

    if (!liveTradingInterlock.tryAcquire("capital-manager")) return skip("A live trade is in progress; buying later.");
    try {
      const key = `refill-buy:${request.venue}:${request.coin}:${request.now}`;
      const order = orderRequest(request.venue, market, "buy", quantity, limit, key, BOUNDED_WAIT_MS);
      try {
        centralLiveOrderExecutionGateway.validateNewSubmission(order);
      } catch (error: unknown) {
        return skip(`Order shape rejected before dispatch: ${error instanceof Error ? error.message : String(error)}`);
      }

      let response: CentralLiveOrderGatewayResponse | null = null;
      try {
        response = await centralLiveOrderExecutionGateway.executeOrReconcile({request: order, idempotencyKey: key, allowNewSubmission: true, now: Date.now()});
        if (response.record?.result && !TERMINAL.has(response.record.result.status)) {
          response = await centralLiveOrderExecutionGateway.cancelOrReconcile(key, Date.now());
        }
        for (let read = 0; read < LATE_READS && response.record?.result?.orderId && !TERMINAL.has(response.record.result.status); read += 1) {
          await sleep(LATE_READ_INTERVAL_MS);
          response = await centralLiveOrderExecutionGateway.readOrReconcile(key, Date.now());
        }
      } catch (error: unknown) {
        return {status: "UNKNOWN", spentInr: request.amountInr, filledQuantity: 0, averagePrice: null, orderId: null,
          detail: `Order outcome unknown: ${error instanceof Error ? error.message : String(error)}`};
      }

      const result = response?.record?.result ?? null;
      if (response?.state === "BLOCKED" && response.record === null) return skip(response.reasons.join(" "));
      if (!result || !TERMINAL.has(result.status) || response?.state === "UNCERTAIN_SUBMISSION") {
        return {status: "UNKNOWN", spentInr: request.amountInr, filledQuantity: result?.filledQuantity ?? 0, averagePrice: null,
          orderId: result?.orderId ?? null, detail: `Order ${result?.orderId ?? "(no id)"} outcome unknown: ${(response?.reasons ?? []).join(" ")}`};
      }
      const filled = result.filledQuantity;
      const average = filled > 0 ? result.averageFillPrice : null;
      return {
        status: filled <= 0 ? "NO_FILL" : filled + 1e-12 >= quantity ? "FILLED" : "PARTIAL",
        spentInr: average !== null ? filled * average * toInr : 0,
        filledQuantity: filled,
        averagePrice: average,
        orderId: result.orderId,
        detail: `Bought ${filled} of ${quantity} ${request.coin} on ${request.venue} at limit ${limit}.`,
      };
    } finally {
      liveTradingInterlock.release("capital-manager");
    }
  }
}
