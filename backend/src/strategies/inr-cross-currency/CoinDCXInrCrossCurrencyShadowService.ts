import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  marketCache,
} from "../../services/cache.service";

import {
  getExchangeTakerFeePercent,
} from "../../arbitrage/config/fees";

import {
  getStrategyOneTinyLiveCashCostProfile,
} from "../../execution/live/evidence/StrategyOneTinyLiveCashCostService";

/*
 * CoinDCX INR <-> USDT cross-currency arbitrage: SHADOW study only.
 *
 * Route: the same coin quoted in INR on CoinDCX and in USDT on a USDT venue
 * (Binance/Bybit), linked through CoinDCX's executable USDTINR book.
 *
 *   BUY_INR_SELL_USDT  buy X/INR on CoinDCX, sell X/USDT on the venue;
 *                      the USDT proceeds are valued at the USDTINR bid.
 *   BUY_USDT_SELL_INR  buy X/USDT on the venue (USDT valued at the USDTINR
 *                      ask), sell X/INR on CoinDCX.
 *
 * Economic net = gross edge minus both taker fees (with any GST surcharge)
 * minus one USDTINR taker fee for the conversion that restores the
 * starting currency. TDS is a tax-credit cash lock, not an economic cost,
 * so it is reported separately and never netted into the edge.
 *
 * CoinDCX INR tickers are non-executable, so they only nominate a route;
 * a route is CONFIRMED only when an executable INR book (opened on demand)
 * reproduces the edge. This service owns no order, balance or transfer
 * authority of any kind.
 */

export type InrCrossDirection =
  | "BUY_INR_SELL_USDT"
  | "BUY_USDT_SELL_INR";

export interface InrCrossEvaluationInput {
  readonly direction: InrCrossDirection;
  /** X/INR price on CoinDCX (ask when buying INR, bid when selling INR). */
  readonly inrPrice: number;
  /** X/USDT price on the venue (bid when selling USDT, ask when buying). */
  readonly usdtPrice: number;
  /** USDTINR bid (for BUY_INR_SELL_USDT) or ask (for BUY_USDT_SELL_INR). */
  readonly usdtInrRate: number;
  readonly inrTakerFeePercent: number;
  readonly usdtTakerFeePercent: number;
  readonly conversionTakerFeePercent: number;
  readonly inrWithholdingPercent: number;
  readonly usdtWithholdingPercent: number;
}

export interface InrCrossEvaluation {
  readonly grossEdgePercent: number;
  readonly feesPercent: number;
  readonly netEdgePercent: number;
  readonly cashLockedPercent: number;
}

export function evaluateInrCrossRoute(
  input: InrCrossEvaluationInput,
): InrCrossEvaluation | null {
  const values = [
    input.inrPrice,
    input.usdtPrice,
    input.usdtInrRate,
  ];

  if (
    values.some(
      (value) =>
        !Number.isFinite(value) ||
        value <= 0,
    )
  ) {
    return null;
  }

  const usdtLegInInr =
    input.usdtPrice *
    input.usdtInrRate;
  const costInr =
    input.direction === "BUY_INR_SELL_USDT"
      ? input.inrPrice
      : usdtLegInInr;
  const proceedsInr =
    input.direction === "BUY_INR_SELL_USDT"
      ? usdtLegInInr
      : input.inrPrice;

  const grossEdgePercent =
    ((proceedsInr - costInr) / costInr) * 100;
  const feesPercent =
    input.inrTakerFeePercent +
    input.usdtTakerFeePercent +
    input.conversionTakerFeePercent;

  return {
    grossEdgePercent,
    feesPercent,
    netEdgePercent:
      grossEdgePercent -
      feesPercent,
    cashLockedPercent:
      input.inrWithholdingPercent +
      input.usdtWithholdingPercent,
  };
}

export interface InrCrossRoute {
  readonly routeKey: string;
  readonly coin: string;
  readonly inrMarket: string;
  readonly usdtMarket: string;
  readonly usdtVenue: string;
  readonly direction: InrCrossDirection;
  readonly confirmed: boolean;
  readonly inrPrice: number;
  readonly usdtPrice: number;
  readonly usdtInrRate: number;
  readonly grossEdgePercent: number;
  readonly feesPercent: number;
  readonly netEdgePercent: number;
  readonly cashLockedPercent: number;
  /** Smaller top-of-book side, in INR; null for ticker-only nominations. */
  readonly topOfBookDepthInr: number | null;
  readonly observedAt: number;
}

export interface InrCrossShadowReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly running: boolean;
  readonly scans: number;
  readonly lastScanAt: number | null;
  readonly conversion: {
    readonly market: "USDTINR";
    readonly bid: number | null;
    readonly ask: number | null;
    readonly executable: boolean;
  };
  readonly coverage: {
    readonly inrMarkets: number;
    readonly pairedWithUsdtVenue: number;
    readonly executableInrBooks: number;
  };
  readonly thresholds: {
    readonly nominationGrossEdgePercent: number;
    readonly maximumQuoteAgeMs: number;
  };
  readonly demandSubscriptions: {
    readonly requested: number;
    readonly accepted: number;
    readonly rejected: number;
  };
  /** Best current routes, confirmed first. */
  readonly routes: readonly InrCrossRoute[];
  /** Rolling log of confirmed routes with a positive net edge. */
  readonly recentConfirmed: readonly InrCrossRoute[];
  readonly bestConfirmedNetEdgePercent: number | null;
  readonly safety: {
    readonly shadowOnly: true;
    readonly orderSubmissionAllowed: false;
    readonly balanceMutationAllowed: false;
    readonly tdsNettedIntoEdge: false;
  };
}

export interface InrCrossDemandSubscriber {
  requestTemporarySubscription(
    market: string,
    ttlMs?: number,
  ): boolean;
}

export interface InrCrossShadowDependencies {
  readonly getAllQuotes: () => readonly ExecutableQuote[];
  readonly getQuote: (exchange: string, market: string) => ExecutableQuote | undefined;
  readonly getTakerFeePercent: (exchange: string, market: string) => number | null;
  readonly getCostProfile: typeof getStrategyOneTinyLiveCashCostProfile;
  readonly now: () => number;
}

const DEFAULT_DEPENDENCIES: InrCrossShadowDependencies = {
  getAllQuotes: () => marketCache.getAll(),
  getQuote: (exchange, market) => marketCache.get(exchange, market),
  getTakerFeePercent: (exchange, market) => getExchangeTakerFeePercent(exchange, market),
  getCostProfile: getStrategyOneTinyLiveCashCostProfile,
  now: Date.now,
};

const USDT_VENUES = ["binance", "bybit"] as const;

export class CoinDCXInrCrossCurrencyShadowService {
  private static readonly SCAN_INTERVAL_MS = 1_000;
  /** Ticker-level gross edge that earns an executable-book confirmation. */
  private static readonly NOMINATION_GROSS_EDGE_PERCENT = 0.8;
  private static readonly MAXIMUM_QUOTE_AGE_MS = 5_000;
  private static readonly MAXIMUM_TICKER_AGE_MS = 60_000;
  private static readonly MAXIMUM_DEMAND_REQUESTS_PER_SCAN = 2;
  /** Stays under the adapter's shared 10-slot temporary budget. */
  private static readonly MAXIMUM_OPEN_DEMAND_MARKETS = 4;
  private static readonly DEMAND_TTL_MS = 45_000;
  private static readonly MAXIMUM_REPORTED_ROUTES = 25;
  private static readonly MAXIMUM_CONFIRMED_LOG = 60;

  private readonly dependencies: InrCrossShadowDependencies;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scans = 0;
  private lastScanAt: number | null = null;
  private routes: InrCrossRoute[] = [];
  private recentConfirmed: InrCrossRoute[] = [];
  private coverage = {inrMarkets: 0, pairedWithUsdtVenue: 0, executableInrBooks: 0};
  private conversion: InrCrossShadowReport["conversion"] = {market: "USDTINR", bid: null, ask: null, executable: false};
  private readonly demandExpiry = new Map<string, number>();
  private readonly demand = {requested: 0, accepted: 0, rejected: 0};

  constructor(
    private readonly subscriber: InrCrossDemandSubscriber | null,
    dependencies: Partial<InrCrossShadowDependencies> = {},
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      try {
        this.scan();
      } catch (error: unknown) {
        console.warn("[INR-Cross] Shadow scan failed:", error instanceof Error ? error.message : error);
      }
    }, CoinDCXInrCrossCurrencyShadowService.SCAN_INTERVAL_MS);
    this.timer.unref?.();
    console.log("[INR-Cross] CoinDCX INR cross-currency shadow study started.");
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  scan(): void {
    const now = this.dependencies.now();
    this.scans += 1;
    this.lastScanAt = now;

    const usdtInr = this.dependencies.getQuote("coindcx", "USDTINR");
    const conversionUsable =
      !!usdtInr &&
      usdtInr.executable &&
      usdtInr.bestBidPrice !== null &&
      usdtInr.bestAskPrice !== null &&
      now - usdtInr.timestamp <= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_QUOTE_AGE_MS;
    this.conversion = {
      market: "USDTINR",
      bid: usdtInr?.bestBidPrice ?? null,
      ask: usdtInr?.bestAskPrice ?? null,
      executable: conversionUsable,
    };

    const quotes = this.dependencies.getAllQuotes();
    const usdtBooks = new Map<string, ExecutableQuote[]>();
    const inrQuotes: ExecutableQuote[] = [];

    for (const quote of quotes) {
      const market = normalizeMarket(quote.market);
      if (quote.exchange === "coindcx" && market.endsWith("INR") && market !== "USDTINR" && market.length > 3) {
        inrQuotes.push(quote);
      } else if (
        (USDT_VENUES as readonly string[]).includes(quote.exchange) &&
        market.endsWith("USDT") &&
        quote.executable &&
        now - quote.timestamp <= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_QUOTE_AGE_MS
      ) {
        const list = usdtBooks.get(market) ?? [];
        list.push(quote);
        usdtBooks.set(market, list);
      }
    }

    let paired = 0;
    let executableInr = 0;
    const found: InrCrossRoute[] = [];
    const nominations: Array<{market: string; gross: number}> = [];

    if (conversionUsable) {
      for (const inrQuote of inrQuotes) {
        const inrMarket = normalizeMarket(inrQuote.market);
        const coin = inrMarket.slice(0, -3);
        const usdtMarket = `${coin}USDT`;
        const venueBooks = usdtBooks.get(usdtMarket);
        if (!venueBooks?.length) continue;
        paired += 1;

        const inrExecutable =
          inrQuote.executable &&
          inrQuote.bestBidPrice !== null &&
          inrQuote.bestAskPrice !== null &&
          now - inrQuote.timestamp <= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_QUOTE_AGE_MS;
        if (inrExecutable) executableInr += 1;
        const tickerUsable =
          inrQuote.lastPrice !== null &&
          now - inrQuote.timestamp <= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_TICKER_AGE_MS;
        if (!inrExecutable && !tickerUsable) continue;

        let bestTickerGross = Number.NEGATIVE_INFINITY;

        for (const venueBook of venueBooks) {
          for (const direction of ["BUY_INR_SELL_USDT", "BUY_USDT_SELL_INR"] as const) {
            let route: InrCrossRoute | null = null;
            try {
              route = this.evaluate({
                direction, coin, inrMarket, usdtMarket, inrQuote, venueBook,
                usdtInr: usdtInr!, confirmed: inrExecutable, now,
              });
            } catch {
              // A market the cost-profile resolver rejects is skipped, not fatal.
            }
            if (!route) continue;
            if (!inrExecutable) bestTickerGross = Math.max(bestTickerGross, route.grossEdgePercent);
            found.push(route);
          }
        }

        if (!inrExecutable && bestTickerGross >= CoinDCXInrCrossCurrencyShadowService.NOMINATION_GROSS_EDGE_PERCENT) {
          nominations.push({market: inrMarket, gross: bestTickerGross});
        }
      }
    }

    this.coverage = {inrMarkets: inrQuotes.length, pairedWithUsdtVenue: paired, executableInrBooks: executableInr};
    this.requestDemandBooks(nominations, now);

    found.sort((first, second) =>
      Number(second.confirmed) - Number(first.confirmed) || second.netEdgePercent - first.netEdgePercent);
    this.routes = found.slice(0, CoinDCXInrCrossCurrencyShadowService.MAXIMUM_REPORTED_ROUTES);

    for (const route of found) {
      if (!route.confirmed || route.netEdgePercent <= 0) continue;
      const previous = this.recentConfirmed.find((item) => item.routeKey === route.routeKey);
      // One log entry per route per 30s keeps a persistent edge from
      // flooding the log while still recording that it persisted.
      if (previous && route.observedAt - previous.observedAt < 30_000) continue;
      this.recentConfirmed.unshift(route);
    }
    this.recentConfirmed = this.recentConfirmed.slice(0, CoinDCXInrCrossCurrencyShadowService.MAXIMUM_CONFIRMED_LOG);
  }

  getReport(): InrCrossShadowReport {
    const best = this.recentConfirmed.reduce<number | null>(
      (max, route) => (max === null || route.netEdgePercent > max ? route.netEdgePercent : max), null);

    return {
      schemaVersion: "1.0",
      generatedAt: this.dependencies.now(),
      running: this.timer !== null,
      scans: this.scans,
      lastScanAt: this.lastScanAt,
      conversion: {...this.conversion},
      coverage: {...this.coverage},
      thresholds: {
        nominationGrossEdgePercent: CoinDCXInrCrossCurrencyShadowService.NOMINATION_GROSS_EDGE_PERCENT,
        maximumQuoteAgeMs: CoinDCXInrCrossCurrencyShadowService.MAXIMUM_QUOTE_AGE_MS,
      },
      demandSubscriptions: {...this.demand},
      routes: this.routes.map((route) => ({...route})),
      recentConfirmed: this.recentConfirmed.map((route) => ({...route})),
      bestConfirmedNetEdgePercent: best,
      safety: {
        shadowOnly: true,
        orderSubmissionAllowed: false,
        balanceMutationAllowed: false,
        tdsNettedIntoEdge: false,
      },
    };
  }

  private evaluate(input: {
    direction: InrCrossDirection;
    coin: string;
    inrMarket: string;
    usdtMarket: string;
    inrQuote: ExecutableQuote;
    venueBook: ExecutableQuote;
    usdtInr: ExecutableQuote;
    confirmed: boolean;
    now: number;
  }): InrCrossRoute | null {
    const buyingInr = input.direction === "BUY_INR_SELL_USDT";
    const inrPrice = input.confirmed
      ? (buyingInr ? input.inrQuote.bestAskPrice : input.inrQuote.bestBidPrice)
      : input.inrQuote.lastPrice;
    const usdtPrice = buyingInr ? input.venueBook.bestBidPrice : input.venueBook.bestAskPrice;
    const usdtInrRate = buyingInr ? input.usdtInr.bestBidPrice : input.usdtInr.bestAskPrice;
    if (inrPrice === null || usdtPrice === null || usdtInrRate === null) return null;

    const inrFee = this.dependencies.getTakerFeePercent("coindcx", input.inrMarket);
    const venueFee = this.dependencies.getTakerFeePercent(input.venueBook.exchange, input.usdtMarket);
    const conversionFee = this.dependencies.getTakerFeePercent("coindcx", "USDTINR");
    if (inrFee === null || venueFee === null || conversionFee === null) return null;

    const inrProfile = this.dependencies.getCostProfile("coindcx", input.inrMarket, buyingInr ? "BUY" : "SELL");
    const venueProfile = this.dependencies.getCostProfile(input.venueBook.exchange, input.usdtMarket, buyingInr ? "SELL" : "BUY");

    const evaluation = evaluateInrCrossRoute({
      direction: input.direction,
      inrPrice,
      usdtPrice,
      usdtInrRate,
      inrTakerFeePercent: inrFee * (1 + inrProfile.tradingFeeSurchargeMultiplier),
      usdtTakerFeePercent: venueFee * (1 + venueProfile.tradingFeeSurchargeMultiplier),
      conversionTakerFeePercent: conversionFee,
      inrWithholdingPercent: inrProfile.withholdingPercent,
      usdtWithholdingPercent: venueProfile.withholdingPercent,
    });
    if (!evaluation) return null;

    const inrQty = buyingInr ? input.inrQuote.bestAskQty : input.inrQuote.bestBidQty;
    const usdtQty = buyingInr ? input.venueBook.bestBidQty : input.venueBook.bestAskQty;
    const topOfBookDepthInr =
      input.confirmed && inrQty !== null && usdtQty !== null
        ? Math.min(inrQty * inrPrice, usdtQty * usdtPrice * usdtInrRate)
        : null;

    return {
      routeKey: `${input.inrMarket}|${input.venueBook.exchange}|${input.direction}`,
      coin: input.coin,
      inrMarket: input.inrMarket,
      usdtMarket: input.usdtMarket,
      usdtVenue: input.venueBook.exchange,
      direction: input.direction,
      confirmed: input.confirmed,
      inrPrice,
      usdtPrice,
      usdtInrRate,
      ...evaluation,
      topOfBookDepthInr,
      observedAt: input.now,
    };
  }

  private requestDemandBooks(nominations: Array<{market: string; gross: number}>, now: number): void {
    for (const [market, expiresAt] of this.demandExpiry) {
      if (expiresAt <= now) this.demandExpiry.delete(market);
    }
    if (!this.subscriber) return;

    let requested = 0;
    for (const nomination of nominations.sort((first, second) => second.gross - first.gross)) {
      if (requested >= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_DEMAND_REQUESTS_PER_SCAN) break;
      if (this.demandExpiry.has(nomination.market)) continue;
      if (this.demandExpiry.size >= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_OPEN_DEMAND_MARKETS) break;

      requested += 1;
      this.demand.requested += 1;
      const accepted = this.subscriber.requestTemporarySubscription(
        nomination.market,
        CoinDCXInrCrossCurrencyShadowService.DEMAND_TTL_MS,
      );
      if (accepted) {
        this.demand.accepted += 1;
        this.demandExpiry.set(nomination.market, now + CoinDCXInrCrossCurrencyShadowService.DEMAND_TTL_MS);
      } else {
        this.demand.rejected += 1;
      }
    }
  }
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

let sharedInstance: CoinDCXInrCrossCurrencyShadowService | null = null;

/** Created by the websocket manager, which owns the CoinDCX order-book adapter. */
export function registerCoinDCXInrCrossCurrencyShadowService(
  service: CoinDCXInrCrossCurrencyShadowService,
): void {
  sharedInstance = service;
}

export function getCoinDCXInrCrossCurrencyShadowReport(): InrCrossShadowReport | null {
  return sharedInstance?.getReport() ?? null;
}
