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
 * route SELLS) with that exchange's own cash, and sells idle or surplus
 * stock back into cash, through the same audited per-venue order contracts
 * and central gateway as the arbitrage legs. It holds the shared
 * live-trading slot while it works, never buys at more than 1% above the
 * cheapest other venue or sells at more than 0.5% below the best other
 * venue, and reports an unresolved order as UNKNOWN instead of guessing.
 */
export interface StockBuyRequest {
  readonly venue: string;
  readonly coin: string;
  readonly quote: "INR" | "USDT";
  readonly amountInr: number;
  readonly usdtInr: number;
  readonly now: number;
}

export interface StockSellRequest extends StockBuyRequest {
  /** Free units of the coin on the venue: never sell more than this. */
  readonly maximumQuantity: number;
}

export interface StockBuyResult {
  readonly status: "FILLED" | "PARTIAL" | "NO_FILL" | "SKIPPED" | "UNKNOWN";
  /** INR paid (buy) or received (sell). */
  readonly spentInr: number;
  readonly filledQuantity: number;
  readonly averagePrice: number | null;
  readonly orderId: string | null;
  readonly detail: string;
}

export interface StockBuyPort {
  buy(request: StockBuyRequest): Promise<StockBuyResult>;
  sell?(request: StockSellRequest): Promise<StockBuyResult>;
}

const QUOTE_MAX_AGE_MS = 10_000;
const PRICE_BUFFER = 1.003;
const MAXIMUM_PREMIUM = 1.01;
/* A stock sale may clear at most 0.5% below the best bid on any other venue. */
const MAXIMUM_SELL_DISCOUNT = 0.995;
const BOUNDED_WAIT_MS = 2_500;
const LATE_READS = 6;
const LATE_READ_INTERVAL_MS = 2_500;
const TERMINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "FAILED"]);
const INR_VENUES = ["coindcx", "coinswitch", "unocoin"];
const USDT_VENUES = ["binance", "bybit", "coindcx"];

export function venueMarket(venue: string, coin: string, quote: "INR" | "USDT"): string {
  return venue === "coinswitch" || venue === "unocoin" ? `${coin}_${quote}` : `${coin}${quote}`;
}

function freshQuote(venue: string, market: string, now: number) {
  const quote = marketCache.get(venue, market) ?? marketCache.get(venue, market.replace(/_/gu, ""));
  if (!quote || now - quote.timestamp > QUOTE_MAX_AGE_MS) return null;
  return quote;
}

function freshAsk(venue: string, market: string, now: number): number | null {
  const quote = freshQuote(venue, market, now);
  return quote && quote.bestAskPrice !== null && quote.bestAskPrice > 0 ? quote.bestAskPrice : null;
}

function freshBid(venue: string, market: string, now: number): {price: number; quantity: number | null} | null {
  const quote = freshQuote(venue, market, now);
  if (!quote || quote.bestBidPrice === null || !(quote.bestBidPrice > 0)) return null;
  const quantity = Number(quote.bestBidQty);
  return {price: quote.bestBidPrice, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null};
}

/** Best fresh price for the coin in INR on any other venue: lowest ask (buy) or highest bid (sell). */
function bestElsewhereInr(coin: string, venue: string, usdtInr: number, now: number, side: "buy" | "sell"): number | null {
  const prices: number[] = [];
  const read = (other: string, quote: "INR" | "USDT") => {
    const market = venueMarket(other, coin, quote);
    const price = side === "buy" ? freshAsk(other, market, now) : freshBid(other, market, now)?.price ?? null;
    if (price !== null) prices.push(quote === "USDT" ? price * usdtInr : price);
  };
  for (const other of INR_VENUES) if (other !== venue) read(other, "INR");
  for (const other of USDT_VENUES) if (other !== venue) read(other, "USDT");
  if (prices.length === 0) return null;
  return side === "buy" ? Math.min(...prices) : Math.max(...prices);
}

async function rulesFor(venue: string, market: string): Promise<ExchangeMarketCapability | null> {
  if (venue === "coinswitch") return coinSwitchCapability(market);
  return exchangeCapabilityService.getCachedCapability(venue, market, "spot") ??
    (await exchangeCapabilityService.getCapability({exchange: venue, market, product: "spot"}).catch(() => null));
}

function roundToStep(price: number, step: number | null, direction: "up" | "down"): number {
  if (!(step !== null && step > 0)) return price;
  const decimals = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 2));
  const units = direction === "up" ? Math.ceil(price / step - 1e-9) : Math.floor(price / step + 1e-9);
  return Number((units * step).toFixed(decimals));
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function skipped(detail: string): StockBuyResult {
  return {status: "SKIPPED", spentInr: 0, filledQuantity: 0, averagePrice: null, orderId: null, detail};
}

export class DefaultStockBuyExecutor implements StockBuyPort {
  async buy(request: StockBuyRequest): Promise<StockBuyResult> {
    const market = venueMarket(request.venue, request.coin, request.quote);
    const toInr = request.quote === "USDT" ? request.usdtInr : 1;

    const ask = freshAsk(request.venue, market, request.now);
    if (ask === null) return skipped(`No fresh ${market} price on ${request.venue}.`);
    const cheapest = bestElsewhereInr(request.coin, request.venue, request.usdtInr, request.now, "buy");
    if (cheapest !== null && ask * toInr > cheapest * MAXIMUM_PREMIUM) {
      return skipped(`${request.coin} on ${request.venue} is ${(((ask * toInr) / cheapest - 1) * 100).toFixed(2)}% above the cheapest venue; not buying stock at a premium.`);
    }

    const rules = await rulesFor(request.venue, market);
    if (!rules || !rules.tradingEnabled || rules.maintenanceMode) return skipped(`${market} rules unavailable or market not trading on ${request.venue}.`);
    const step = quantityStepOf(rules);
    if (!(step !== null && step > 0)) return skipped(`${market} lot step unknown on ${request.venue}.`);

    const limit = roundToStep(ask * PRICE_BUFFER, priceStepOf(rules), "up");
    const quantity = floorToStep(request.amountInr / toInr / limit, step);
    return this.place(request, market, "buy", quantity, limit, rules, toInr);
  }

  async sell(request: StockSellRequest): Promise<StockBuyResult> {
    const market = venueMarket(request.venue, request.coin, request.quote);
    const toInr = request.quote === "USDT" ? request.usdtInr : 1;

    const bid = freshBid(request.venue, market, request.now);
    if (bid === null) return skipped(`No fresh ${market} bid on ${request.venue}.`);
    const best = bestElsewhereInr(request.coin, request.venue, request.usdtInr, request.now, "sell");
    if (best === null) return skipped(`No other venue prices ${request.coin}; not selling without a price check.`);
    if (bid.price * toInr < best * MAXIMUM_SELL_DISCOUNT) {
      return skipped(`${request.coin} bid on ${request.venue} is ${((1 - (bid.price * toInr) / best) * 100).toFixed(2)}% below the best venue; not selling stock at a discount.`);
    }

    const rules = await rulesFor(request.venue, market);
    if (!rules || !rules.tradingEnabled || rules.maintenanceMode) return skipped(`${market} rules unavailable or market not trading on ${request.venue}.`);
    const step = quantityStepOf(rules);
    if (!(step !== null && step > 0)) return skipped(`${market} lot step unknown on ${request.venue}.`);

    const limit = roundToStep(bid.price / PRICE_BUFFER, priceStepOf(rules), "down");
    // Only what the best bid can absorb: never walk a thin book.
    const quantity = floorToStep(Math.min(
      request.amountInr / toInr / bid.price,
      request.maximumQuantity,
      bid.quantity ?? Number.POSITIVE_INFINITY,
    ), step);
    return this.place(request, market, "sell", quantity, limit, rules, toInr);
  }

  private async place(
    request: StockBuyRequest,
    market: string,
    side: "buy" | "sell",
    quantity: number,
    limit: number,
    rules: ExchangeMarketCapability,
    toInr: number,
  ): Promise<StockBuyResult> {
    if (quantity <= 0) return skipped("Amount rounds to zero at the venue lot step.");
    if (rules.quantity.minimumQuantity !== null && quantity < rules.quantity.minimumQuantity) return skipped(`Below ${request.venue} minimum quantity.`);
    if (rules.notional.minimumNotional !== null && quantity * limit < rules.notional.minimumNotional) return skipped(`Below ${request.venue} minimum order value.`);

    if (!liveTradingInterlock.tryAcquire("capital-manager")) return skipped("A live trade is in progress; trying later.");
    try {
      // The buy key keeps its original spelling so journal keys stay comparable.
      const key = `refill-${side}:${request.venue}:${request.coin}:${request.now}`;
      const order = orderRequest(request.venue, market, side, quantity, limit, key, BOUNDED_WAIT_MS);
      try {
        centralLiveOrderExecutionGateway.validateNewSubmission(order);
      } catch (error: unknown) {
        return skipped(`Order shape rejected before dispatch: ${error instanceof Error ? error.message : String(error)}`);
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
      if (response?.state === "BLOCKED" && response.record === null) return skipped(response.reasons.join(" "));
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
        detail: `${side === "buy" ? "Bought" : "Sold"} ${filled} of ${quantity} ${request.coin} on ${request.venue} at limit ${limit}.`,
      };
    } finally {
      liveTradingInterlock.release("capital-manager");
    }
  }
}
