import {
  resolve,
} from "node:path";

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

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import type {
  OrderBookLevel,
} from "../../orderbook/models/OrderBookLevel";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

/*
 * INR ARBITRAGE SCANNER - scan and alert only.
 *
 * Venues: CoinDCX, UnoCoin, CoinSwitch (INR books) and Binance, Bybit,
 * CoinDCX, CoinSwitch (USDT books). Every second it prices:
 *
 *   INR_USDT  coin X bought/sold for INR on an INR venue against X/USDT on
 *             any USDT venue (same venue included), linked through the best
 *             available USDT/INR book. USDT proceeds use the best USDT/INR
 *             bid, USDT costs the best ask, and that venue's USDT/INR taker
 *             fee is charged once for the conversion back.
 *   INR_INR   X/INR on one INR venue against X/INR on another.
 *
 * Net edge = gross - every taker fee on the route (with GST surcharges from
 * the cash-cost profiles). TDS is a recoverable cash lock reported beside
 * the edge, never netted; unverified venue TDS is flagged, not assumed 0.
 *
 * Evidence tiers, weakest leg wins:
 *   BOOK    executable bid/ask with quantities, inside the venue's age limit
 *   QUOTE   bid/ask prices without quantities (e.g. CoinSwitch INR tickers)
 *   TICKER  last traded price only
 * Only BOOK routes are REAL. Depth is walked through the published books:
 * `depthAtThresholdInr` is the INR that can be matched while every marginal
 * unit still clears the net threshold. A REAL route qualifies only when
 * that depth also covers both venues' minimum order.
 *
 * Each qualifying route opens a WINDOW that tracks how long the edge lasts
 * (a short grace absorbs single missed scans). Windows that persist past
 * the alert delay are flagged as alerts. Closed windows are checkpointed
 * to disk so persistence statistics survive restarts.
 *
 * Gross edges above the suspect ceiling are shown but never alerted: on
 * Indian venues they are almost always a stale resting order or a coin
 * whose deposits/withdrawals are closed.
 *
 * This service has no order, balance or transfer authority of any kind.
 */

export type InrRouteKind = "INR_USDT" | "INR_INR";
export type EvidenceTier = "BOOK" | "QUOTE" | "TICKER";

const TIER_RANK: Record<EvidenceTier, number> = {BOOK: 3, QUOTE: 2, TICKER: 1};

export interface InrScannerConfig {
  readonly minimumNetPercent: number;
  readonly nearMissNetPercent: number;
  readonly suspectGrossPercent: number;
  readonly windowGraceMs: number;
  readonly alertAfterMs: number;
  /** An open window stays open until net falls below minimumNet minus this. */
  readonly exitHysteresisPercent: number;
  /** A route that alerted is not alerted again within this. */
  readonly alertCooldownMs: number;
  readonly maximumTickerAgeMs: number;
  readonly maximumBookAgeMs: Readonly<Record<string, number>>;
  readonly scanIntervalMs: number;
}

function readNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function loadInrScannerConfig(): InrScannerConfig {
  return {
    minimumNetPercent: readNumberEnv("CAT_PRO_INR_SCAN_MIN_NET_PERCENT", 3, 0.1, 50),
    nearMissNetPercent: readNumberEnv("CAT_PRO_INR_SCAN_NEAR_MISS_NET_PERCENT", 1, 0, 50),
    suspectGrossPercent: readNumberEnv("CAT_PRO_INR_SCAN_SUSPECT_GROSS_PERCENT", 25, 5, 500),
    windowGraceMs: readNumberEnv("CAT_PRO_INR_SCAN_WINDOW_GRACE_MS", 5_000, 0, 60_000),
    alertAfterMs: readNumberEnv("CAT_PRO_INR_SCAN_ALERT_AFTER_MS", 2_000, 0, 60_000),
    exitHysteresisPercent: readNumberEnv("CAT_PRO_INR_SCAN_EXIT_HYSTERESIS_PERCENT", 0.5, 0, 10),
    alertCooldownMs: readNumberEnv("CAT_PRO_INR_SCAN_ALERT_COOLDOWN_MS", 5 * 60_000, 0, 24 * 3_600_000),
    maximumTickerAgeMs: 60_000,
    maximumBookAgeMs: {
      coindcx: 5_000,
      binance: 5_000,
      bybit: 5_000,
      coinswitch: 5_000,
      // CoinSwitch's public socket never streams INR books; they come from
      // the signed REST depth poller rotating through nominations.
      "coinswitch:INR": 12_000,
      // UnoCoin books are REST-polled (~14s cadence).
      unocoin: 20_000,
    },
    scanIntervalMs: 1_000,
  };
}

/* ------------------------------------------------------------- pure math */

export interface RouteEvaluation {
  readonly grossEdgePercent: number;
  readonly feesPercent: number;
  readonly netEdgePercent: number;
  readonly cashLockedPercent: number;
}

export function evaluateRoute(input: {
  readonly costInr: number;
  readonly proceedsInr: number;
  readonly feePercents: readonly number[];
  readonly withholdingPercents: readonly number[];
}): RouteEvaluation | null {
  if (
    !Number.isFinite(input.costInr) ||
    !Number.isFinite(input.proceedsInr) ||
    input.costInr <= 0 ||
    input.proceedsInr <= 0 ||
    input.feePercents.some((fee) => !Number.isFinite(fee) || fee < 0)
  ) {
    return null;
  }
  const grossEdgePercent = ((input.proceedsInr - input.costInr) / input.costInr) * 100;
  const feesPercent = input.feePercents.reduce((sum, fee) => sum + fee, 0);
  return {
    grossEdgePercent,
    feesPercent,
    netEdgePercent: grossEdgePercent - feesPercent,
    cashLockedPercent: input.withholdingPercents.reduce((sum, value) => sum + value, 0),
  };
}

/**
 * Walks best asks against best bids in lockstep and returns the buy-side
 * INR notional (and its average net edge) that can be matched while every
 * marginal unit's edge after `feesPercent` stays at or above
 * `minimumNetPercent`.
 */
export function depthAtThreshold(
  asks: readonly OrderBookLevel[],
  bids: readonly OrderBookLevel[],
  buyToInr: number,
  sellToInr: number,
  feesPercent: number,
  minimumNetPercent: number,
): {notionalInr: number; averageNetPercent: number | null} {
  let askIndex = 0;
  let bidIndex = 0;
  let askLeft = asks[0]?.quantity ?? 0;
  let bidLeft = bids[0]?.quantity ?? 0;
  let costInr = 0;
  let proceedsInr = 0;

  while (askIndex < asks.length && bidIndex < bids.length) {
    const askInr = asks[askIndex].price * buyToInr;
    const bidInr = bids[bidIndex].price * sellToInr;
    if (!(askInr > 0) || !(bidInr > 0)) break;
    if (((bidInr - askInr) / askInr) * 100 - feesPercent < minimumNetPercent) break;

    const take = Math.min(askLeft, bidLeft);
    if (take > 0) {
      costInr += take * askInr;
      proceedsInr += take * bidInr;
    }
    askLeft -= take;
    bidLeft -= take;
    if (askLeft <= 0) askLeft = asks[++askIndex]?.quantity ?? 0;
    if (bidLeft <= 0) bidLeft = bids[++bidIndex]?.quantity ?? 0;
  }

  return {
    notionalInr: costInr,
    averageNetPercent: costInr > 0 ? ((proceedsInr - costInr) / costInr) * 100 - feesPercent : null,
  };
}

/* ----------------------------------------------------------------- types */

export interface ScannedRoute {
  readonly routeKey: string;
  readonly kind: InrRouteKind;
  readonly coin: string;
  readonly buyVenue: string;
  readonly buyMarket: string;
  readonly sellVenue: string;
  readonly sellMarket: string;
  readonly conversionVenue: string | null;
  readonly usdtInrRate: number | null;
  readonly evidence: EvidenceTier;
  readonly buyEvidence: EvidenceTier;
  readonly sellEvidence: EvidenceTier;
  readonly buyPriceInr: number;
  readonly sellPriceInr: number;
  readonly grossEdgePercent: number;
  readonly feesPercent: number;
  readonly netEdgePercent: number;
  readonly cashLockedPercent: number;
  readonly tdsVerified: boolean;
  /** INR tradable while each marginal unit stays >= the net threshold (BOOK only). */
  readonly depthAtThresholdInr: number | null;
  readonly averageNetAtDepthPercent: number | null;
  /** Largest venue minimum order across both legs, in INR; null if unknown. */
  readonly minimumOrderInr: number | null;
  readonly suspect: boolean;
  /** REAL: BOOK evidence, net >= threshold, not suspect, depth covers min order. */
  readonly qualifies: boolean;
  readonly observedAt: number;
}

export interface OpportunityWindow {
  readonly id: string;
  readonly routeKey: string;
  readonly kind: InrRouteKind;
  readonly coin: string;
  readonly buyVenue: string;
  readonly buyMarket: string;
  readonly sellVenue: string;
  readonly sellMarket: string;
  readonly startedAt: number;
  lastSeenAt: number;
  endedAt: number | null;
  durationMs: number;
  scans: number;
  peakNetPercent: number;
  lastNetPercent: number;
  peakDepthInr: number;
  minimumOrderInr: number | null;
  tdsVerified: boolean;
  alertedAt: number | null;
}

export interface CoinPersistence {
  readonly coin: string;
  readonly windows: number;
  readonly activeWindows: number;
  readonly longestMs: number;
  readonly averageMs: number;
  readonly totalMs: number;
  readonly bestNetPercent: number;
  readonly lastSeenAt: number;
  readonly routes: readonly string[];
}

export interface InrScannerReport {
  readonly schemaVersion: "3.0";
  readonly generatedAt: number;
  readonly running: boolean;
  readonly scans: number;
  readonly lastScanAt: number | null;
  readonly lastScanDurationMs: number | null;
  readonly config: InrScannerConfig;
  readonly venues: Readonly<Record<string, {
    readonly inrMarkets: number;
    readonly inrBooks: number;
    readonly inrQuotes: number;
    readonly usdtBooks: number;
  }>>;
  readonly conversion: ReadonlyArray<{
    readonly venue: string;
    readonly market: string;
    readonly bid: number | null;
    readonly ask: number | null;
    readonly evidence: EvidenceTier | null;
  }>;
  readonly routesEvaluated: number;
  /** Currently qualifying REAL opportunities, best net first. */
  readonly opportunities: readonly ScannedRoute[];
  /** Best non-qualifying routes above the near-miss line (hints, thin, suspect). */
  readonly nearMisses: readonly ScannedRoute[];
  readonly activeWindows: readonly OpportunityWindow[];
  readonly recentWindows: readonly OpportunityWindow[];
  readonly coinPersistence: readonly CoinPersistence[];
  readonly alerts: readonly OpportunityWindow[];
  readonly depthNominations: Readonly<Record<string, readonly string[]>>;
  readonly minimumOrderCoverage: {readonly known: number; readonly pending: number};
  readonly safety: {
    readonly scanOnly: true;
    readonly orderSubmissionAllowed: false;
    readonly balanceMutationAllowed: false;
    readonly tdsNettedIntoEdge: false;
  };
}

export interface InrDemandSubscriber {
  requestTemporarySubscription(market: string, ttlMs?: number): boolean;
}

export interface InrScannerDependencies {
  readonly getAllQuotes: () => readonly ExecutableQuote[];
  readonly getTakerFeePercent: (exchange: string, market: string) => number | null;
  readonly getCostProfile: typeof getStrategyOneTinyLiveCashCostProfile;
  readonly getBook: (exchange: string, market: string) => OrderBook | null;
  /** Cached venue minimums: notional in quote currency and base quantity. */
  readonly getMinimums: (exchange: string, market: string) => {minimumNotional: number | null; minimumQuantity: number | null} | null | undefined;
  readonly requestMinimums: (exchange: string, market: string) => void;
  readonly loadWindows: () => OpportunityWindow[];
  readonly saveWindows: (windows: readonly OpportunityWindow[]) => void;
  readonly now: () => number;
}

const WINDOW_FILE = resolve(process.cwd(), "logs", "live", "inr-arbitrage-windows.jsonl");

function isWindowRecord(value: unknown): value is OpportunityWindow {
  const record = value as Partial<OpportunityWindow> | null;
  return !!record && typeof record.routeKey === "string" && typeof record.startedAt === "number" && typeof record.coin === "string";
}

const windowStore = new JsonlSnapshotStore<OpportunityWindow>({filePath: WINDOW_FILE, isPayload: isWindowRecord});

/* Background capability lookups: bounded, each key tried at most every 30 min. */
const minimumsAttemptedAt = new Map<string, number>();
let minimumsInFlight = 0;

function requestMinimumsInBackground(exchange: string, market: string): void {
  const key = `${exchange}|${market}`;
  const now = Date.now();
  if (minimumsInFlight >= 2 || now - (minimumsAttemptedAt.get(key) ?? 0) < 30 * 60_000) return;
  minimumsAttemptedAt.set(key, now);
  minimumsInFlight += 1;
  void exchangeCapabilityService
    .getCapability({exchange, market})
    .catch(() => null)
    .finally(() => {
      minimumsInFlight -= 1;
    });
}

const DEFAULT_DEPENDENCIES: InrScannerDependencies = {
  getAllQuotes: () => marketCache.getAll(),
  getTakerFeePercent: (exchange, market) => getExchangeTakerFeePercent(exchange, market),
  getCostProfile: getStrategyOneTinyLiveCashCostProfile,
  getBook: (exchange, market) => orderBookService.get(exchange, market),
  getMinimums: (exchange, market) => {
    const capability = exchangeCapabilityService.getCachedCapability(exchange, market);
    return capability ? {minimumNotional: capability.notional.minimumNotional, minimumQuantity: capability.quantity.minimumQuantity} : undefined;
  },
  requestMinimums: requestMinimumsInBackground,
  loadWindows: () => {
    try {
      return windowStore.readAll();
    } catch {
      return [];
    }
  },
  saveWindows: (windows) => windowStore.replaceAllAtomically(windows),
  now: Date.now,
};

const INR_VENUES = ["coindcx", "unocoin", "coinswitch"] as const;
const USDT_VENUES = ["binance", "bybit", "coindcx", "coinswitch"] as const;
const CONVERSION_MARKETS: Readonly<Record<string, string>> = {coindcx: "USDTINR", coinswitch: "USDTINR", unocoin: "USDTINR"};
const STABLE_COINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI"]);

interface Leg {
  readonly venue: string;
  readonly market: string;
  readonly quote: ExecutableQuote;
  readonly tier: EvidenceTier;
}

interface Conversion {
  readonly venue: string;
  readonly quote: ExecutableQuote;
  readonly tier: EvidenceTier;
  readonly bid: number;
  readonly ask: number;
}

export class InrArbitrageScannerService {
  private static readonly MAXIMUM_REPORTED_OPPORTUNITIES = 60;
  private static readonly MAXIMUM_NEAR_MISSES = 60;
  private static readonly MAXIMUM_CLOSED_WINDOWS = 2_000;
  private static readonly CHECKPOINT_INTERVAL_MS = 30_000;
  private static readonly COINDCX_DEMAND_REQUESTS_PER_SCAN = 4;
  private static readonly COINDCX_MAXIMUM_OPEN_DEMAND = 16;
  private static readonly COINDCX_DEMAND_TTL_MS = 45_000;
  private static readonly NOMINATIONS_PER_VENUE = 40;

  readonly config: InrScannerConfig;
  private readonly dependencies: InrScannerDependencies;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scans = 0;
  private lastScanAt: number | null = null;
  private lastScanDurationMs: number | null = null;
  private routesEvaluated = 0;
  private opportunities: ScannedRoute[] = [];
  private nearMisses: ScannedRoute[] = [];
  private venues: Record<string, {inrMarkets: number; inrBooks: number; inrQuotes: number; usdtBooks: number}> = {};
  private conversion: InrScannerReport["conversion"] = [];
  private readonly active = new Map<string, OpportunityWindow>();
  private closed: OpportunityWindow[] = [];
  private closedDirty = false;
  private lastCheckpointAt = 0;
  private depthNominations: Record<string, string[]> = {};
  private minimumsKnown = 0;
  private minimumsPending = 0;
  private readonly demandExpiry = new Map<string, number>();
  /** `venue|NORMALIZEDMARKET` -> the venue's own market spelling (e.g. LRC_INR). */
  private readonly rawMarkets = new Map<string, string>();
  private readonly lastAlertAtByRoute = new Map<string, number>();
  private minimumsCache = new Map<string, {minimumNotional: number | null; minimumQuantity: number | null} | null | undefined>();

  constructor(
    private readonly coinDCXSubscriber: InrDemandSubscriber | null,
    dependencies: Partial<InrScannerDependencies> = {},
    config: InrScannerConfig = loadInrScannerConfig(),
  ) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
    this.config = config;
    this.closed = this.dependencies
      .loadWindows()
      .filter((window) => window.endedAt !== null)
      .slice(-InrArbitrageScannerService.MAXIMUM_CLOSED_WINDOWS);
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      try {
        this.scan();
      } catch (error: unknown) {
        console.warn("[INR-Scanner] Scan failed:", error instanceof Error ? error.message : error);
      }
    }, this.config.scanIntervalMs);
    this.timer.unref?.();
    console.log(`[INR-Scanner] Started: venues=${INR_VENUES.join(",")} (INR) + ${USDT_VENUES.join(",")} (USDT) | minNet=${this.config.minimumNetPercent}% | scan-only.`);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.checkpoint(true);
  }

  /** Markets on `venue` whose INR route looks promising but has no book yet. */
  getDepthNominations(venue: string): readonly string[] {
    return this.depthNominations[venue] ?? [];
  }

  scan(): void {
    const startedAt = Date.now();
    const now = this.dependencies.now();
    this.minimumsCache = new Map();
    this.scans += 1;
    this.lastScanAt = now;

    const profileCache = new Map<string, {feePercent: number; withholdingPercent: number; verified: boolean} | null>();
    const legCost = (leg: {venue: string; market: string}, side: "BUY" | "SELL") => {
      const key = `${leg.venue}|${leg.market}|${side}`;
      if (profileCache.has(key)) return profileCache.get(key)!;
      let value: {feePercent: number; withholdingPercent: number; verified: boolean} | null = null;
      try {
        const fee = this.dependencies.getTakerFeePercent(leg.venue, leg.market);
        if (fee !== null) {
          const profile = this.dependencies.getCostProfile(leg.venue, leg.market, side);
          value = {
            feePercent: fee * (1 + profile.tradingFeeSurchargeMultiplier),
            withholdingPercent: profile.withholdingPercent,
            verified: profile.withholdingEvidenceComplete,
          };
        }
      } catch {
        value = null;
      }
      profileCache.set(key, value);
      return value;
    };

    /* ---- index quotes ---- */
    const inrLegs = new Map<string, Map<string, Leg>>();
    const usdtLegs = new Map<string, Leg[]>();
    const conversions: Conversion[] = [];
    const venues: Record<string, {inrMarkets: number; inrBooks: number; inrQuotes: number; usdtBooks: number}> = {};
    for (const venue of new Set<string>([...INR_VENUES, ...USDT_VENUES])) venues[venue] = {inrMarkets: 0, inrBooks: 0, inrQuotes: 0, usdtBooks: 0};

    for (const quote of this.dependencies.getAllQuotes()) {
      const venue = quote.exchange;
      if (!venues[venue]) continue;
      const market = normalizeMarket(quote.market);

      if (CONVERSION_MARKETS[venue] === market) {
        const tier = this.tier(quote, venue, now);
        if (tier !== "TICKER" && tier !== null && quote.bestBidPrice !== null && quote.bestAskPrice !== null) {
          conversions.push({venue, quote, tier, bid: quote.bestBidPrice, ask: quote.bestAskPrice});
        }
        continue;
      }

      if ((INR_VENUES as readonly string[]).includes(venue) && market.endsWith("INR") && market.length > 3) {
        const coin = market.slice(0, -3);
        if (STABLE_COINS.has(coin)) continue;
        venues[venue].inrMarkets += 1;
        this.rawMarkets.set(`${venue}|${market}`, quote.market);
        let legQuote = quote;
        let tier = this.tier(quote, venue, now, true);
        if (tier !== "BOOK") {
          // A fresh polled book (CoinSwitch REST, UnoCoin REST) upgrades a
          // quantity-less ticker quote to real BOOK evidence.
          const book = this.dependencies.getBook(venue, quote.market);
          const bestBid = book?.bids.reduce<OrderBookLevel | null>((best, level) => (!best || level.price > best.price ? level : best), null) ?? null;
          const bestAsk = book?.asks.reduce<OrderBookLevel | null>((best, level) => (!best || level.price < best.price ? level : best), null) ?? null;
          if (book && bestBid && bestAsk && bestAsk.price > bestBid.price && now - book.timestamp <= this.bookAgeLimit(venue, true)) {
            legQuote = {
              ...quote,
              bestBidPrice: bestBid.price,
              bestBidQty: bestBid.quantity,
              bestAskPrice: bestAsk.price,
              bestAskQty: bestAsk.quantity,
              timestamp: book.timestamp,
              executable: true,
            };
            tier = "BOOK";
          }
        }
        if (tier === null) continue;
        if (tier === "BOOK") venues[venue].inrBooks += 1;
        if (tier === "QUOTE") venues[venue].inrQuotes += 1;
        const byVenue = inrLegs.get(coin) ?? new Map<string, Leg>();
        byVenue.set(venue, {venue, market, quote: legQuote, tier});
        inrLegs.set(coin, byVenue);
      } else if ((USDT_VENUES as readonly string[]).includes(venue) && market.endsWith("USDT") && market.length > 4) {
        if (this.tier(quote, venue, now) !== "BOOK") continue;
        venues[venue].usdtBooks += 1;
        const list = usdtLegs.get(market) ?? [];
        list.push({venue, market, quote, tier: "BOOK"});
        usdtLegs.set(market, list);
      }
    }
    this.venues = venues;

    // Best conversion per direction, strongest evidence first.
    const byTierThen = (pick: (c: Conversion) => number) => (first: Conversion, second: Conversion) =>
      TIER_RANK[second.tier] - TIER_RANK[first.tier] || pick(second) - pick(first);
    const sellUsdt = [...conversions].sort(byTierThen((c) => c.bid))[0] ?? null;   // USDT -> INR: highest bid
    const buyUsdt = [...conversions].sort(byTierThen((c) => -c.ask))[0] ?? null;   // INR -> USDT: lowest ask
    this.conversion = conversions.map((c) => ({venue: c.venue, market: c.quote.market, bid: c.bid, ask: c.ask, evidence: c.tier}));

    /* ---- price routes ---- */
    const routes: ScannedRoute[] = [];
    let evaluated = 0;
    const consider = (route: ScannedRoute | null) => {
      evaluated += 1;
      if (route) routes.push(route);
    };

    for (const [coin, byVenue] of inrLegs) {
      const usdtBooks = usdtLegs.get(`${coin}USDT`) ?? [];
      for (const inrLeg of byVenue.values()) {
        for (const usdtLeg of usdtBooks) {
          if (sellUsdt) consider(this.priceInrUsdt(coin, inrLeg, usdtLeg, sellUsdt, true, now, legCost));
          if (buyUsdt) consider(this.priceInrUsdt(coin, inrLeg, usdtLeg, buyUsdt, false, now, legCost));
        }
      }
      const inrVenues = [...byVenue.values()];
      for (const buy of inrVenues) {
        for (const sell of inrVenues) {
          if (buy.venue !== sell.venue) consider(this.priceInrInr(coin, buy, sell, now, legCost));
        }
      }
    }
    this.routesEvaluated = evaluated;

    /* ---- classify ---- */
    const qualifying = routes.filter((route) => route.qualifies).sort((a, b) => b.netEdgePercent - a.netEdgePercent);
    this.opportunities = qualifying.slice(0, InrArbitrageScannerService.MAXIMUM_REPORTED_OPPORTUNITIES);
    this.nearMisses = routes
      .filter((route) => !route.qualifies && route.netEdgePercent >= this.config.nearMissNetPercent)
      .sort((a, b) =>
        Number(a.suspect) - Number(b.suspect) ||
        TIER_RANK[b.evidence] - TIER_RANK[a.evidence] ||
        b.netEdgePercent - a.netEdgePercent)
      .slice(0, InrArbitrageScannerService.MAXIMUM_NEAR_MISSES);

    this.trackWindows(qualifying, routes, now);
    this.nominateDepth(routes, now);
    const shown = routes.filter((route) => route.netEdgePercent >= this.config.nearMissNetPercent);
    this.minimumsKnown = shown.filter((route) => route.minimumOrderInr !== null).length;
    this.minimumsPending = shown.length - this.minimumsKnown;
    this.checkpoint(false);
    this.lastScanDurationMs = Date.now() - startedAt;
  }

  getReport(): InrScannerReport {
    const now = this.dependencies.now();
    const activeWindows = [...this.active.values()].map((window) => ({...window, durationMs: window.lastSeenAt - window.startedAt}));
    const recentWindows = this.closed.slice(-150).reverse().map((window) => ({...window}));

    return {
      schemaVersion: "3.0",
      generatedAt: now,
      running: this.timer !== null,
      scans: this.scans,
      lastScanAt: this.lastScanAt,
      lastScanDurationMs: this.lastScanDurationMs,
      config: this.config,
      venues: structuredClone(this.venues),
      conversion: this.conversion.map((c) => ({...c})),
      routesEvaluated: this.routesEvaluated,
      opportunities: this.opportunities.map((route) => ({...route})),
      nearMisses: this.nearMisses.map((route) => ({...route})),
      activeWindows: activeWindows.sort((a, b) => b.peakNetPercent - a.peakNetPercent),
      recentWindows,
      coinPersistence: this.buildCoinPersistence(activeWindows),
      alerts: [...this.closed.slice(-300), ...activeWindows]
        .filter((window) => window.alertedAt !== null)
        .sort((a, b) => (b.alertedAt ?? 0) - (a.alertedAt ?? 0))
        .slice(0, 50)
        .map((window) => ({...window})),
      depthNominations: structuredClone(this.depthNominations),
      minimumOrderCoverage: {known: this.minimumsKnown, pending: this.minimumsPending},
      safety: {scanOnly: true, orderSubmissionAllowed: false, balanceMutationAllowed: false, tdsNettedIntoEdge: false},
    };
  }

  /* ------------------------------------------------------------- pricing */

  /** `venue:INR` overrides the venue default for REST-polled INR books. */
  private bookAgeLimit(venue: string, inr: boolean): number {
    return (inr ? this.config.maximumBookAgeMs[`${venue}:INR`] : undefined) ?? this.config.maximumBookAgeMs[venue] ?? 5_000;
  }

  private tier(quote: ExecutableQuote, venue: string, now: number, inr = false): EvidenceTier | null {
    const age = now - quote.timestamp;
    const bid = quote.bestBidPrice;
    const ask = quote.bestAskPrice;
    const twoSided = bid !== null && ask !== null && bid > 0 && ask > 0 && ask > bid;
    if (
      quote.executable &&
      twoSided &&
      quote.bestBidQty !== null && quote.bestBidQty > 0 &&
      quote.bestAskQty !== null && quote.bestAskQty > 0 &&
      age <= this.bookAgeLimit(venue, inr)
    ) {
      return "BOOK";
    }
    // bid == ask (UnoCoin copies last into both) is not a real two-sided quote.
    if (twoSided && age <= this.config.maximumTickerAgeMs) return "QUOTE";
    if (quote.lastPrice !== null && quote.lastPrice > 0 && age <= this.config.maximumTickerAgeMs) return "TICKER";
    return null;
  }

  private price(leg: Leg, side: "BUY" | "SELL"): number | null {
    if (leg.tier === "TICKER") return leg.quote.lastPrice;
    return side === "BUY" ? leg.quote.bestAskPrice : leg.quote.bestBidPrice;
  }

  private priceInrUsdt(
    coin: string,
    inrLeg: Leg,
    usdtLeg: Leg,
    conversion: Conversion,
    buyInr: boolean,
    now: number,
    legCost: (leg: {venue: string; market: string}, side: "BUY" | "SELL") => {feePercent: number; withholdingPercent: number; verified: boolean} | null,
  ): ScannedRoute | null {
    const inrPrice = this.price(inrLeg, buyInr ? "BUY" : "SELL");
    const usdtPrice = this.price(usdtLeg, buyInr ? "SELL" : "BUY");
    const rate = buyInr ? conversion.bid : conversion.ask;
    if (inrPrice === null || usdtPrice === null) return null;

    const inrCost = legCost(inrLeg, buyInr ? "BUY" : "SELL");
    const usdtCost = legCost(usdtLeg, buyInr ? "SELL" : "BUY");
    const conversionCost = legCost({venue: conversion.venue, market: CONVERSION_MARKETS[conversion.venue]}, buyInr ? "SELL" : "BUY");
    if (!inrCost || !usdtCost || !conversionCost) return null;

    const usdtInInr = usdtPrice * rate;
    const buy = buyInr ? inrLeg : usdtLeg;
    const sell = buyInr ? usdtLeg : inrLeg;
    const feePercents = [inrCost.feePercent, usdtCost.feePercent, conversionCost.feePercent];

    return this.finish({
      kind: "INR_USDT",
      coin,
      buy,
      sell,
      buyToInr: buyInr ? 1 : rate,
      sellToInr: buyInr ? rate : 1,
      costInr: buyInr ? inrPrice : usdtInInr,
      proceedsInr: buyInr ? usdtInInr : inrPrice,
      feePercents,
      withholdingPercents: [inrCost.withholdingPercent, usdtCost.withholdingPercent],
      tdsVerified: inrCost.verified && usdtCost.verified,
      evidence: minTier(inrLeg.tier, usdtLeg.tier, conversion.tier),
      conversionVenue: conversion.venue,
      usdtInrRate: rate,
      now,
    });
  }

  private priceInrInr(
    coin: string,
    buy: Leg,
    sell: Leg,
    now: number,
    legCost: (leg: {venue: string; market: string}, side: "BUY" | "SELL") => {feePercent: number; withholdingPercent: number; verified: boolean} | null,
  ): ScannedRoute | null {
    const buyPrice = this.price(buy, "BUY");
    const sellPrice = this.price(sell, "SELL");
    if (buyPrice === null || sellPrice === null) return null;
    const buyCost = legCost(buy, "BUY");
    const sellCost = legCost(sell, "SELL");
    if (!buyCost || !sellCost) return null;

    return this.finish({
      kind: "INR_INR",
      coin,
      buy,
      sell,
      buyToInr: 1,
      sellToInr: 1,
      costInr: buyPrice,
      proceedsInr: sellPrice,
      feePercents: [buyCost.feePercent, sellCost.feePercent],
      withholdingPercents: [buyCost.withholdingPercent, sellCost.withholdingPercent],
      tdsVerified: buyCost.verified && sellCost.verified,
      evidence: minTier(buy.tier, sell.tier),
      conversionVenue: null,
      usdtInrRate: null,
      now,
    });
  }

  private finish(input: {
    kind: InrRouteKind;
    coin: string;
    buy: Leg;
    sell: Leg;
    buyToInr: number;
    sellToInr: number;
    costInr: number;
    proceedsInr: number;
    feePercents: number[];
    withholdingPercents: number[];
    tdsVerified: boolean;
    evidence: EvidenceTier;
    conversionVenue: string | null;
    usdtInrRate: number | null;
    now: number;
  }): ScannedRoute | null {
    const evaluation = evaluateRoute(input);
    if (!evaluation) return null;

    const suspect = evaluation.grossEdgePercent > this.config.suspectGrossPercent;
    const worthDepth = input.evidence === "BOOK" && evaluation.netEdgePercent >= this.config.minimumNetPercent && !suspect;

    let depthAtThresholdInr: number | null = null;
    let averageNetAtDepthPercent: number | null = null;
    if (worthDepth) {
      const buyBook = this.freshBook(input.buy, input.now);
      const sellBook = this.freshBook(input.sell, input.now);
      if (buyBook && sellBook) {
        const depth = depthAtThreshold(
          [...buyBook.asks].sort((a, b) => a.price - b.price),
          [...sellBook.bids].sort((a, b) => b.price - a.price),
          input.buyToInr,
          input.sellToInr,
          evaluation.feesPercent,
          this.config.minimumNetPercent,
        );
        depthAtThresholdInr = depth.notionalInr;
        averageNetAtDepthPercent = depth.averageNetPercent;
      } else {
        // No multi-level book: fall back to the smaller top-of-book side.
        const buyQty = input.buy.quote.bestAskQty ?? 0;
        const sellQty = input.sell.quote.bestBidQty ?? 0;
        depthAtThresholdInr = Math.min(buyQty, sellQty) * input.costInr;
        averageNetAtDepthPercent = evaluation.netEdgePercent;
      }
    }

    // Minimums are only resolved for routes worth showing; the lookup clones.
    const minimumOrderInr = evaluation.netEdgePercent >= this.config.nearMissNetPercent
      ? this.minimumOrderInr(input.buy, input.costInr / input.buyToInr, input.buyToInr, input.sell, input.proceedsInr / input.sellToInr, input.sellToInr)
      : null;
    const qualifies =
      worthDepth &&
      depthAtThresholdInr !== null &&
      depthAtThresholdInr > 0 &&
      depthAtThresholdInr >= (minimumOrderInr ?? 0);

    return {
      routeKey: `${input.kind}|${input.coin}|${input.buy.venue}:${input.buy.market}>${input.sell.venue}:${input.sell.market}`,
      kind: input.kind,
      coin: input.coin,
      buyVenue: input.buy.venue,
      buyMarket: input.buy.market,
      sellVenue: input.sell.venue,
      sellMarket: input.sell.market,
      conversionVenue: input.conversionVenue,
      usdtInrRate: input.usdtInrRate,
      evidence: input.evidence,
      buyEvidence: input.buy.tier,
      sellEvidence: input.sell.tier,
      buyPriceInr: input.costInr,
      sellPriceInr: input.proceedsInr,
      ...evaluation,
      tdsVerified: input.tdsVerified,
      depthAtThresholdInr,
      averageNetAtDepthPercent,
      minimumOrderInr,
      suspect,
      qualifies,
      observedAt: input.now,
    };
  }

  private freshBook(leg: Leg, now: number): OrderBook | null {
    const book = this.dependencies.getBook(leg.venue, leg.quote.market);
    return book && book.asks.length && book.bids.length && now - book.timestamp <= this.bookAgeLimit(leg.venue, leg.market.endsWith("INR")) ? book : null;
  }

  /** Largest venue minimum across both legs, converted to INR. */
  private minimumOrderInr(buy: Leg, buyPrice: number, buyToInr: number, sell: Leg, sellPrice: number, sellToInr: number): number | null {
    let result: number | null = null;
    for (const [leg, price, toInr] of [[buy, buyPrice, buyToInr], [sell, sellPrice, sellToInr]] as const) {
      const cacheKey = `${leg.venue}|${leg.quote.market}`;
      if (!this.minimumsCache.has(cacheKey)) this.minimumsCache.set(cacheKey, this.dependencies.getMinimums(leg.venue, leg.quote.market));
      const minimums = this.minimumsCache.get(cacheKey);
      if (minimums === undefined) {
        this.dependencies.requestMinimums(leg.venue, leg.quote.market);
        continue;
      }
      if (!minimums) continue;
      const candidates = [
        minimums.minimumNotional !== null ? minimums.minimumNotional * toInr : null,
        minimums.minimumQuantity !== null ? minimums.minimumQuantity * price * toInr : null,
      ].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
      for (const value of candidates) result = result === null ? value : Math.max(result, value);
    }
    return result;
  }

  /* ------------------------------------------------------------- windows */

  /**
   * Opens a window when a route qualifies; keeps it open (hysteresis) while
   * the route stays a non-suspect BOOK route above `minimumNet - exit
   * hysteresis`, so an edge hovering around the threshold is one window,
   * not dozens. A route that already alerted within the cooldown opens new
   * windows silently.
   */
  private trackWindows(qualifying: readonly ScannedRoute[], routes: readonly ScannedRoute[], now: number): void {
    const exitNet = this.config.minimumNetPercent - this.config.exitHysteresisPercent;
    const continuing = routes.filter((route) =>
      this.active.has(route.routeKey) &&
      !route.qualifies &&
      route.evidence === "BOOK" &&
      !route.suspect &&
      route.netEdgePercent >= exitNet);

    const seen = new Set<string>();
    for (const route of [...qualifying, ...continuing]) {
      if (seen.has(route.routeKey)) continue;
      seen.add(route.routeKey);
      const existing = this.active.get(route.routeKey);
      if (existing) {
        existing.lastSeenAt = now;
        existing.scans += 1;
        existing.lastNetPercent = route.netEdgePercent;
        existing.peakNetPercent = Math.max(existing.peakNetPercent, route.netEdgePercent);
        existing.peakDepthInr = Math.max(existing.peakDepthInr, route.depthAtThresholdInr ?? 0);
        existing.minimumOrderInr = route.minimumOrderInr ?? existing.minimumOrderInr;
        existing.durationMs = now - existing.startedAt;
        const lastAlertAt = this.lastAlertAtByRoute.get(route.routeKey) ?? Number.NEGATIVE_INFINITY;
        if (
          existing.alertedAt === null &&
          existing.durationMs >= this.config.alertAfterMs &&
          now - lastAlertAt >= this.config.alertCooldownMs
        ) {
          existing.alertedAt = now;
          this.lastAlertAtByRoute.set(route.routeKey, now);
          console.log(`[INR-Scanner] ALERT ${route.coin} ${route.kind} ${route.buyVenue}>${route.sellVenue} net=${route.netEdgePercent.toFixed(2)}% depth=Rs${Math.round(route.depthAtThresholdInr ?? 0)} lasted=${existing.durationMs}ms`);
        }
      } else if (route.qualifies) {
        const cooledDown = now - (this.lastAlertAtByRoute.get(route.routeKey) ?? Number.NEGATIVE_INFINITY) >= this.config.alertCooldownMs;
        const alertNow = this.config.alertAfterMs === 0 && cooledDown;
        if (alertNow) this.lastAlertAtByRoute.set(route.routeKey, now);
        this.active.set(route.routeKey, {
          id: `${route.routeKey}@${now}`,
          routeKey: route.routeKey,
          kind: route.kind,
          coin: route.coin,
          buyVenue: route.buyVenue,
          buyMarket: route.buyMarket,
          sellVenue: route.sellVenue,
          sellMarket: route.sellMarket,
          startedAt: now,
          lastSeenAt: now,
          endedAt: null,
          durationMs: 0,
          scans: 1,
          peakNetPercent: route.netEdgePercent,
          lastNetPercent: route.netEdgePercent,
          peakDepthInr: route.depthAtThresholdInr ?? 0,
          minimumOrderInr: route.minimumOrderInr,
          tdsVerified: route.tdsVerified,
          alertedAt: alertNow ? now : null,
        });
      }
    }

    for (const [key, window] of this.active) {
      if (seen.has(key) || now - window.lastSeenAt <= this.config.windowGraceMs) continue;
      window.endedAt = window.lastSeenAt;
      window.durationMs = window.lastSeenAt - window.startedAt;
      this.active.delete(key);
      this.closed.push(window);
      this.closedDirty = true;
    }
    if (this.closed.length > InrArbitrageScannerService.MAXIMUM_CLOSED_WINDOWS) {
      this.closed = this.closed.slice(-InrArbitrageScannerService.MAXIMUM_CLOSED_WINDOWS);
    }
  }

  private buildCoinPersistence(activeWindows: readonly OpportunityWindow[]): CoinPersistence[] {
    const byCoin = new Map<string, {windows: number; active: number; longest: number; total: number; best: number; last: number; routes: Set<string>}>();
    for (const window of [...this.closed, ...activeWindows]) {
      const entry = byCoin.get(window.coin) ?? {windows: 0, active: 0, longest: 0, total: 0, best: Number.NEGATIVE_INFINITY, last: 0, routes: new Set<string>()};
      const duration = window.endedAt === null ? window.lastSeenAt - window.startedAt : window.durationMs;
      entry.windows += 1;
      if (window.endedAt === null) entry.active += 1;
      entry.longest = Math.max(entry.longest, duration);
      entry.total += duration;
      entry.best = Math.max(entry.best, window.peakNetPercent);
      entry.last = Math.max(entry.last, window.lastSeenAt);
      entry.routes.add(`${window.buyVenue}>${window.sellVenue}`);
      byCoin.set(window.coin, entry);
    }
    return [...byCoin.entries()]
      .map(([coin, entry]) => ({
        coin,
        windows: entry.windows,
        activeWindows: entry.active,
        longestMs: entry.longest,
        averageMs: entry.windows ? entry.total / entry.windows : 0,
        totalMs: entry.total,
        bestNetPercent: entry.best,
        lastSeenAt: entry.last,
        routes: [...entry.routes].slice(0, 6),
      }))
      .sort((a, b) => b.activeWindows - a.activeWindows || b.totalMs - a.totalMs)
      .slice(0, 60);
  }

  private checkpoint(force: boolean): void {
    const now = Date.now();
    if (!this.closedDirty || (!force && now - this.lastCheckpointAt < InrArbitrageScannerService.CHECKPOINT_INTERVAL_MS)) return;
    try {
      this.dependencies.saveWindows(this.closed);
      this.closedDirty = false;
      this.lastCheckpointAt = now;
    } catch (error: unknown) {
      console.warn("[INR-Scanner] Window checkpoint failed:", error instanceof Error ? error.message : error);
    }
  }

  /* ---------------------------------------------------- depth nominations */

  /**
   * Promising routes (>= near-miss net, not suspect) whose INR leg has no
   * book yet are nominated for depth: CoinDCX gets on-demand books here;
   * CoinSwitch and UnoCoin nominations are read by the websocket manager and
   * put at the front of those venues' bounded depth subscriptions.
   */
  private nominateDepth(routes: readonly ScannedRoute[], now: number): void {
    const scores = new Map<string, Map<string, number>>();
    for (const route of routes) {
      if (route.suspect || route.netEdgePercent < this.config.nearMissNetPercent) continue;
      for (const [venue, market, tier, otherTier] of [
        [route.buyVenue, route.buyMarket, route.buyEvidence, route.sellEvidence],
        [route.sellVenue, route.sellMarket, route.sellEvidence, route.buyEvidence],
      ] as const) {
        if (!market.endsWith("INR")) continue;
        // Depth for this leg only helps when it is the one missing piece:
        // a route whose other leg is still a ticker cannot be completed.
        if (otherTier !== "BOOK") continue;
        // CoinDCX books stream once opened. Polled venues (CoinSwitch REST,
        // UnoCoin REST) must keep being refreshed while the route is live,
        // or the book goes stale and the window flaps closed and open.
        if (venue === "coindcx" && tier === "BOOK") continue;
        const byVenue = scores.get(venue) ?? new Map<string, number>();
        byVenue.set(market, Math.max(byVenue.get(market) ?? Number.NEGATIVE_INFINITY, route.netEdgePercent));
        scores.set(venue, byVenue);
      }
    }

    const nominations: Record<string, string[]> = {};
    for (const [venue, byMarket] of scores) {
      const ranked = [...byMarket.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, InrArbitrageScannerService.NOMINATIONS_PER_VENUE)
        .map(([market]) => this.rawMarkets.get(`${venue}|${market}`) ?? market);
      // CoinSwitch's REST poller wants best-first; UnoCoin's subscription
      // set wants a stable order so its signature does not churn.
      nominations[venue] = venue === "unocoin" ? ranked.sort() : ranked;
    }
    this.depthNominations = nominations;

    for (const [market, expiresAt] of this.demandExpiry) if (expiresAt <= now) this.demandExpiry.delete(market);
    if (!this.coinDCXSubscriber) return;
    const ranked = [...(scores.get("coindcx") ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
    let requested = 0;
    for (const [market] of ranked) {
      if (requested >= InrArbitrageScannerService.COINDCX_DEMAND_REQUESTS_PER_SCAN) break;
      if (this.demandExpiry.size >= InrArbitrageScannerService.COINDCX_MAXIMUM_OPEN_DEMAND) break;
      if (this.demandExpiry.has(market)) continue;
      requested += 1;
      if (this.coinDCXSubscriber.requestTemporarySubscription(market, InrArbitrageScannerService.COINDCX_DEMAND_TTL_MS)) {
        this.demandExpiry.set(market, now + InrArbitrageScannerService.COINDCX_DEMAND_TTL_MS);
      }
    }
  }
}

function minTier(...tiers: EvidenceTier[]): EvidenceTier {
  return tiers.reduce((weakest, tier) => (TIER_RANK[tier] < TIER_RANK[weakest] ? tier : weakest));
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

let sharedInstance: InrArbitrageScannerService | null = null;

/** Created by the websocket manager, which owns the CoinDCX order-book adapter. */
export function registerInrArbitrageScanner(service: InrArbitrageScannerService): void {
  sharedInstance = service;
}

export function getInrArbitrageScanner(): InrArbitrageScannerService | null {
  return sharedInstance;
}
