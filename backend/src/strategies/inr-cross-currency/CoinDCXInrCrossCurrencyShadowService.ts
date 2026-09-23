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
 * INR route study: SHADOW only. Two route kinds are priced every second:
 *
 *   INR_USDT  X/INR on an INR venue (CoinDCX, UnoCoin) against X/USDT on a
 *             USDT venue (Binance, Bybit), linked through CoinDCX's
 *             executable USDTINR book. USDT proceeds are valued at the
 *             USDTINR bid, USDT costs at the ask, and one USDTINR taker fee
 *             is charged for the conversion that restores the start
 *             currency.
 *   INR_INR   X/INR on one INR venue against X/INR on the other - no
 *             currency conversion at all.
 *
 * Economic net = gross edge minus every taker fee on the route (with any
 * GST surcharge from the cash-cost profiles). TDS is a tax-credit cash
 * lock, reported separately and never netted into the edge; a venue whose
 * withholding treatment is unverified is flagged rather than assumed zero.
 *
 * INR tickers are non-executable, so they only nominate a route. A route
 * is CONFIRMED only when every INR leg is an executable book with depth.
 * CoinDCX INR books can be opened on demand for nominated markets; UnoCoin
 * books cannot, so most UnoCoin legs stay ticker-level evidence. This
 * service owns no order, balance or transfer authority of any kind.
 */

export type InrRouteKind = "INR_USDT" | "INR_INR";

export interface InrRouteEvaluationInput {
  /** Cost of one unit of the coin, in INR, on the BUY leg. */
  readonly costInr: number;
  /** Proceeds of one unit of the coin, in INR, on the SELL leg. */
  readonly proceedsInr: number;
  readonly feePercents: readonly number[];
  readonly withholdingPercents: readonly number[];
}

export interface InrRouteEvaluation {
  readonly grossEdgePercent: number;
  readonly feesPercent: number;
  readonly netEdgePercent: number;
  readonly cashLockedPercent: number;
}

export function evaluateInrRoute(
  input: InrRouteEvaluationInput,
): InrRouteEvaluation | null {
  if (
    !Number.isFinite(input.costInr) ||
    !Number.isFinite(input.proceedsInr) ||
    input.costInr <= 0 ||
    input.proceedsInr <= 0 ||
    input.feePercents.some((fee) => !Number.isFinite(fee) || fee < 0)
  ) {
    return null;
  }

  const grossEdgePercent =
    ((input.proceedsInr - input.costInr) / input.costInr) * 100;
  const feesPercent =
    input.feePercents.reduce((sum, fee) => sum + fee, 0);

  return {
    grossEdgePercent,
    feesPercent,
    netEdgePercent: grossEdgePercent - feesPercent,
    cashLockedPercent:
      input.withholdingPercents.reduce((sum, value) => sum + value, 0),
  };
}

export interface InrRoute {
  readonly routeKey: string;
  readonly kind: InrRouteKind;
  readonly coin: string;
  readonly buyVenue: string;
  readonly buyMarket: string;
  readonly sellVenue: string;
  readonly sellMarket: string;
  /** Effective per-unit INR cost/proceeds used for the edge. */
  readonly buyPriceInr: number;
  readonly sellPriceInr: number;
  /** USDTINR rate applied on the USDT leg; null for INR_INR routes. */
  readonly usdtInrRate: number | null;
  readonly confirmed: boolean;
  readonly grossEdgePercent: number;
  readonly feesPercent: number;
  readonly netEdgePercent: number;
  readonly cashLockedPercent: number;
  /** False when any leg's venue withholding treatment is unverified. */
  readonly tdsVerified: boolean;
  /** Smaller top-of-book side, in INR; null unless every leg has depth. */
  readonly topOfBookDepthInr: number | null;
  readonly observedAt: number;
}

export interface InrRouteShadowReport {
  readonly schemaVersion: "2.0";
  readonly generatedAt: number;
  readonly running: boolean;
  readonly scans: number;
  readonly lastScanAt: number | null;
  readonly conversion: {
    readonly market: "USDTINR";
    readonly venue: "coindcx";
    readonly bid: number | null;
    readonly ask: number | null;
    readonly executable: boolean;
  };
  readonly coverage: {
    readonly venues: Readonly<Record<string, {
      readonly inrMarkets: number;
      readonly executableInrBooks: number;
      readonly pairedWithUsdtVenue: number;
    }>>;
    readonly inrInrPairs: number;
  };
  readonly thresholds: {
    readonly nominationGrossEdgePercent: number;
    readonly maximumBookAgeMs: Readonly<Record<string, number>>;
  };
  readonly demandSubscriptions: {
    readonly requested: number;
    readonly accepted: number;
    readonly rejected: number;
  };
  /** Best current routes, confirmed first. */
  readonly routes: readonly InrRoute[];
  /** Rolling log of confirmed routes with a positive net edge. */
  readonly recentConfirmed: readonly InrRoute[];
  readonly bestConfirmedNetEdgePercent: number | null;
  readonly safety: {
    readonly shadowOnly: true;
    readonly orderSubmissionAllowed: false;
    readonly balanceMutationAllowed: false;
    readonly tdsNettedIntoEdge: false;
  };
}

export interface InrDemandSubscriber {
  requestTemporarySubscription(
    market: string,
    ttlMs?: number,
  ): boolean;
}

export interface InrRouteShadowDependencies {
  readonly getAllQuotes: () => readonly ExecutableQuote[];
  readonly getQuote: (exchange: string, market: string) => ExecutableQuote | undefined;
  readonly getTakerFeePercent: (exchange: string, market: string) => number | null;
  readonly getCostProfile: typeof getStrategyOneTinyLiveCashCostProfile;
  readonly now: () => number;
}

const DEFAULT_DEPENDENCIES: InrRouteShadowDependencies = {
  getAllQuotes: () => marketCache.getAll(),
  getQuote: (exchange, market) => marketCache.get(exchange, market),
  getTakerFeePercent: (exchange, market) => getExchangeTakerFeePercent(exchange, market),
  getCostProfile: getStrategyOneTinyLiveCashCostProfile,
  now: Date.now,
};

const INR_VENUES = ["coindcx", "unocoin"] as const;
const USDT_VENUES = ["binance", "bybit"] as const;

/*
 * UnoCoin publishes its books by REST polling (~14s cadence here), so an
 * executable UnoCoin book is necessarily older than a streamed one. It still
 * counts as a book, with its own age ceiling, rather than being dropped.
 */
const MAXIMUM_BOOK_AGE_MS: Readonly<Record<string, number>> = {
  coindcx: 5_000,
  binance: 5_000,
  bybit: 5_000,
  unocoin: 20_000,
};

interface Leg {
  readonly venue: string;
  readonly market: string;
  readonly quote: ExecutableQuote;
  readonly book: boolean;
}

export class CoinDCXInrCrossCurrencyShadowService {
  private static readonly SCAN_INTERVAL_MS = 1_000;
  /** Ticker-level gross edge that earns an executable-book confirmation. */
  private static readonly NOMINATION_GROSS_EDGE_PERCENT = 0.8;
  private static readonly MAXIMUM_TICKER_AGE_MS = 60_000;
  private static readonly MAXIMUM_DEMAND_REQUESTS_PER_SCAN = 2;
  /** Stays under the adapter's shared 10-slot temporary budget. */
  private static readonly MAXIMUM_OPEN_DEMAND_MARKETS = 4;
  private static readonly DEMAND_TTL_MS = 45_000;
  private static readonly MAXIMUM_REPORTED_ROUTES = 30;
  private static readonly MAXIMUM_CONFIRMED_LOG = 60;

  private readonly dependencies: InrRouteShadowDependencies;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scans = 0;
  private lastScanAt: number | null = null;
  private routes: InrRoute[] = [];
  private recentConfirmed: InrRoute[] = [];
  private coverage: InrRouteShadowReport["coverage"] = {venues: {}, inrInrPairs: 0};
  private conversion: InrRouteShadowReport["conversion"] = {market: "USDTINR", venue: "coindcx", bid: null, ask: null, executable: false};
  private readonly demandExpiry = new Map<string, number>();
  private readonly demand = {requested: 0, accepted: 0, rejected: 0};

  constructor(
    private readonly coinDCXSubscriber: InrDemandSubscriber | null,
    dependencies: Partial<InrRouteShadowDependencies> = {},
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
    console.log("[INR-Cross] INR route shadow study started (CoinDCX, UnoCoin).");
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
      this.isBook(usdtInr, "coindcx", now);
    this.conversion = {
      market: "USDTINR",
      venue: "coindcx",
      bid: usdtInr?.bestBidPrice ?? null,
      ask: usdtInr?.bestAskPrice ?? null,
      executable: conversionUsable,
    };

    const inrLegs = new Map<string, Map<string, Leg>>();
    const usdtBooks = new Map<string, Leg[]>();
    const coverage: Record<string, {inrMarkets: number; executableInrBooks: number; pairedWithUsdtVenue: number}> = {};
    for (const venue of INR_VENUES) coverage[venue] = {inrMarkets: 0, executableInrBooks: 0, pairedWithUsdtVenue: 0};

    for (const quote of this.dependencies.getAllQuotes()) {
      const market = normalizeMarket(quote.market);
      const venue = quote.exchange;

      if ((INR_VENUES as readonly string[]).includes(venue) && market.endsWith("INR") && market.length > 3 && market !== "USDTINR" && market !== "USDCINR") {
        const book = this.isBook(quote, venue, now);
        const tickerUsable = quote.lastPrice !== null && now - quote.timestamp <= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_TICKER_AGE_MS;
        coverage[venue].inrMarkets += 1;
        if (book) coverage[venue].executableInrBooks += 1;
        if (!book && !tickerUsable) continue;
        const coin = market.slice(0, -3);
        const byVenue = inrLegs.get(coin) ?? new Map<string, Leg>();
        byVenue.set(venue, {venue, market, quote, book});
        inrLegs.set(coin, byVenue);
      } else if ((USDT_VENUES as readonly string[]).includes(venue) && market.endsWith("USDT") && this.isBook(quote, venue, now)) {
        const list = usdtBooks.get(market) ?? [];
        list.push({venue, market, quote, book: true});
        usdtBooks.set(market, list);
      }
    }

    const found: InrRoute[] = [];
    const nominations = new Map<string, number>();
    let inrInrPairs = 0;
    const consider = (route: InrRoute | null, coinDCXMarketToNominate: string | null) => {
      if (!route) return;
      found.push(route);
      if (!route.confirmed && coinDCXMarketToNominate && route.grossEdgePercent >= CoinDCXInrCrossCurrencyShadowService.NOMINATION_GROSS_EDGE_PERCENT) {
        nominations.set(coinDCXMarketToNominate, Math.max(nominations.get(coinDCXMarketToNominate) ?? 0, route.grossEdgePercent));
      }
    };

    for (const [coin, byVenue] of inrLegs) {
      const usdtLegs = conversionUsable ? usdtBooks.get(`${coin}USDT`) ?? [] : [];

      for (const inrLeg of byVenue.values()) {
        if (usdtLegs.length) coverage[inrLeg.venue].pairedWithUsdtVenue += 1;
        const nominate = inrLeg.venue === "coindcx" && !inrLeg.book ? inrLeg.market : null;
        for (const usdtLeg of usdtLegs) {
          consider(this.safe(() => this.priceInrUsdt(coin, inrLeg, usdtLeg, usdtInr!, "BUY_INR", now)), nominate);
          consider(this.safe(() => this.priceInrUsdt(coin, inrLeg, usdtLeg, usdtInr!, "SELL_INR", now)), nominate);
        }
      }

      const coinDCX = byVenue.get("coindcx");
      const unoCoin = byVenue.get("unocoin");
      if (coinDCX && unoCoin) {
        inrInrPairs += 1;
        const nominate = coinDCX.book ? null : coinDCX.market;
        consider(this.safe(() => this.priceInrInr(coin, coinDCX, unoCoin, now)), nominate);
        consider(this.safe(() => this.priceInrInr(coin, unoCoin, coinDCX, now)), nominate);
      }
    }

    this.coverage = {venues: coverage, inrInrPairs};
    this.requestDemandBooks([...nominations.entries()], now);

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

  getReport(): InrRouteShadowReport {
    const best = this.recentConfirmed.reduce<number | null>(
      (max, route) => (max === null || route.netEdgePercent > max ? route.netEdgePercent : max), null);

    return {
      schemaVersion: "2.0",
      generatedAt: this.dependencies.now(),
      running: this.timer !== null,
      scans: this.scans,
      lastScanAt: this.lastScanAt,
      conversion: {...this.conversion},
      coverage: structuredClone(this.coverage),
      thresholds: {
        nominationGrossEdgePercent: CoinDCXInrCrossCurrencyShadowService.NOMINATION_GROSS_EDGE_PERCENT,
        maximumBookAgeMs: {...MAXIMUM_BOOK_AGE_MS},
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

  private isBook(quote: ExecutableQuote, venue: string, now: number): boolean {
    return quote.executable &&
      quote.bestBidPrice !== null &&
      quote.bestAskPrice !== null &&
      quote.bestBidQty !== null &&
      quote.bestAskQty !== null &&
      now - quote.timestamp <= (MAXIMUM_BOOK_AGE_MS[venue] ?? 5_000);
  }

  private safe(price: () => InrRoute | null): InrRoute | null {
    try {
      return price();
    } catch {
      // A market the fee/cost resolvers reject is skipped, not fatal.
      return null;
    }
  }

  /** Buy price (ask) or sell price (bid) of an INR leg; last price if not a book. */
  private inrPrice(leg: Leg, side: "BUY" | "SELL"): number | null {
    if (!leg.book) return leg.quote.lastPrice;
    return side === "BUY" ? leg.quote.bestAskPrice : leg.quote.bestBidPrice;
  }

  private legCost(leg: Leg, side: "BUY" | "SELL") {
    const fee = this.dependencies.getTakerFeePercent(leg.venue, leg.market);
    if (fee === null) return null;
    const profile = this.dependencies.getCostProfile(leg.venue, leg.market, side);
    return {
      feePercent: fee * (1 + profile.tradingFeeSurchargeMultiplier),
      withholdingPercent: profile.withholdingPercent,
      verified: profile.withholdingEvidenceComplete,
    };
  }

  private priceInrUsdt(
    coin: string,
    inrLeg: Leg,
    usdtLeg: Leg,
    usdtInr: ExecutableQuote,
    mode: "BUY_INR" | "SELL_INR",
    now: number,
  ): InrRoute | null {
    const buyingInr = mode === "BUY_INR";
    const inrPrice = this.inrPrice(inrLeg, buyingInr ? "BUY" : "SELL");
    const usdtPrice = buyingInr ? usdtLeg.quote.bestBidPrice : usdtLeg.quote.bestAskPrice;
    const rate = buyingInr ? usdtInr.bestBidPrice : usdtInr.bestAskPrice;
    if (inrPrice === null || usdtPrice === null || rate === null) return null;

    const inrCost = this.legCost(inrLeg, buyingInr ? "BUY" : "SELL");
    const usdtCost = this.legCost(usdtLeg, buyingInr ? "SELL" : "BUY");
    const conversionFee = this.dependencies.getTakerFeePercent("coindcx", "USDTINR");
    if (!inrCost || !usdtCost || conversionFee === null) return null;

    const usdtLegInr = usdtPrice * rate;
    const evaluation = evaluateInrRoute({
      costInr: buyingInr ? inrPrice : usdtLegInr,
      proceedsInr: buyingInr ? usdtLegInr : inrPrice,
      feePercents: [inrCost.feePercent, usdtCost.feePercent, conversionFee],
      withholdingPercents: [inrCost.withholdingPercent, usdtCost.withholdingPercent],
    });
    if (!evaluation) return null;

    const inrQty = buyingInr ? inrLeg.quote.bestAskQty : inrLeg.quote.bestBidQty;
    const usdtQty = buyingInr ? usdtLeg.quote.bestBidQty : usdtLeg.quote.bestAskQty;
    const buy = buyingInr ? inrLeg : usdtLeg;
    const sell = buyingInr ? usdtLeg : inrLeg;

    return {
      routeKey: `INR_USDT|${coin}|${buy.venue}>${sell.venue}`,
      kind: "INR_USDT",
      coin,
      buyVenue: buy.venue,
      buyMarket: buy.market,
      sellVenue: sell.venue,
      sellMarket: sell.market,
      buyPriceInr: buyingInr ? inrPrice : usdtLegInr,
      sellPriceInr: buyingInr ? usdtLegInr : inrPrice,
      usdtInrRate: rate,
      confirmed: inrLeg.book,
      ...evaluation,
      tdsVerified: inrCost.verified && usdtCost.verified,
      topOfBookDepthInr:
        inrLeg.book && inrQty !== null && usdtQty !== null
          ? Math.min(inrQty * inrPrice, usdtQty * usdtLegInr)
          : null,
      observedAt: now,
    };
  }

  private priceInrInr(coin: string, buy: Leg, sell: Leg, now: number): InrRoute | null {
    const buyPrice = this.inrPrice(buy, "BUY");
    const sellPrice = this.inrPrice(sell, "SELL");
    if (buyPrice === null || sellPrice === null) return null;

    const buyCost = this.legCost(buy, "BUY");
    const sellCost = this.legCost(sell, "SELL");
    if (!buyCost || !sellCost) return null;

    const evaluation = evaluateInrRoute({
      costInr: buyPrice,
      proceedsInr: sellPrice,
      feePercents: [buyCost.feePercent, sellCost.feePercent],
      withholdingPercents: [buyCost.withholdingPercent, sellCost.withholdingPercent],
    });
    if (!evaluation) return null;

    const confirmed = buy.book && sell.book;
    const buyQty = buy.quote.bestAskQty;
    const sellQty = sell.quote.bestBidQty;

    return {
      routeKey: `INR_INR|${coin}|${buy.venue}>${sell.venue}`,
      kind: "INR_INR",
      coin,
      buyVenue: buy.venue,
      buyMarket: buy.market,
      sellVenue: sell.venue,
      sellMarket: sell.market,
      buyPriceInr: buyPrice,
      sellPriceInr: sellPrice,
      usdtInrRate: null,
      confirmed,
      ...evaluation,
      tdsVerified: buyCost.verified && sellCost.verified,
      topOfBookDepthInr:
        confirmed && buyQty !== null && sellQty !== null
          ? Math.min(buyQty * buyPrice, sellQty * sellPrice)
          : null,
      observedAt: now,
    };
  }

  private requestDemandBooks(nominations: Array<[string, number]>, now: number): void {
    for (const [market, expiresAt] of this.demandExpiry) {
      if (expiresAt <= now) this.demandExpiry.delete(market);
    }
    if (!this.coinDCXSubscriber) return;

    let requested = 0;
    for (const [market] of nominations.sort((first, second) => second[1] - first[1])) {
      if (requested >= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_DEMAND_REQUESTS_PER_SCAN) break;
      if (this.demandExpiry.has(market)) continue;
      if (this.demandExpiry.size >= CoinDCXInrCrossCurrencyShadowService.MAXIMUM_OPEN_DEMAND_MARKETS) break;

      requested += 1;
      this.demand.requested += 1;
      const accepted = this.coinDCXSubscriber.requestTemporarySubscription(
        market,
        CoinDCXInrCrossCurrencyShadowService.DEMAND_TTL_MS,
      );
      if (accepted) {
        this.demand.accepted += 1;
        this.demandExpiry.set(market, now + CoinDCXInrCrossCurrencyShadowService.DEMAND_TTL_MS);
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

export function getCoinDCXInrCrossCurrencyShadowReport(): InrRouteShadowReport | null {
  return sharedInstance?.getReport() ?? null;
}
