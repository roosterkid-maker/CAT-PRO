import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import {
  INR_ROUTE_HEDGE_VENUES,
  INR_ROUTE_SUPPORTED_INR_VENUES,
} from "../../execution/live/inr-routes/InrRouteExecutionPolicy";

import {
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY,
} from "../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  getInrArbitrageScanner,
  type InrRouteKind,
  type OpportunityWindow,
} from "./InrArbitrageScannerService";

/*
 * COIN STUDY: which coins keep producing real (valid, executable) edges,
 * in which direction, at which hours, and therefore which small basket of
 * coins is worth holding, where, and how much.
 *
 * The scanner keeps only its last ~2,000 closed windows (a few hours), so
 * this service folds every closed window into durable per-day, per-route
 * aggregates kept for 14 days. The report ranks coins over the last 7 days
 * by edge-minutes x average net x depth coverage and proposes placement:
 * hold the coin on the exchange where it is SOLD, and the cash (INR or
 * USDT) on the exchange where it is BOUGHT, sized in trades of the live
 * per-leg target. Read-only: no order, balance or transfer authority.
 */

const IST_OFFSET_MS = 330 * 60_000;
const RETAIN_DAYS = 14;
const STUDY_DAYS = 7;
const CORE_BASKET_SIZE = 6;
const MINIMUM_CORE_EDGE_MINUTES = 5;
const SUFFICIENT_SPAN_HOURS = 24;
const SYNC_INTERVAL_MS = 30_000;
/* A window seen in one scan still lasted about one scan interval. */
const MINIMUM_WINDOW_MS = 1_000;

export interface RouteAggregate {
  readonly coin: string;
  readonly kind: InrRouteKind;
  readonly buyVenue: string;
  readonly buyQuote: "INR" | "USDT";
  readonly sellVenue: string;
  readonly sellQuote: "INR" | "USDT";
  windows: number;
  edgeMs: number;
  /** Sum of peak net x duration, for a time-weighted average. */
  netMs: number;
  bestNetPercent: number;
  depthSumInr: number;
  depthSamples: number;
  /** Edge time by IST hour of day. */
  hourMs: number[];
}

interface StudyState {
  readonly schemaVersion: "1.0";
  firstWindowAt: number | null;
  lastIngestedEndedAt: number;
  /** Window ids already counted at exactly lastIngestedEndedAt. */
  boundaryIds: string[];
  /** IST day (YYYY-MM-DD) -> route key -> aggregate. */
  days: Record<string, Record<string, RouteAggregate>>;
}

export interface HoldingLookup {
  /** INR value currently held of `asset` on `venue`; null when unknown. */
  (venue: string, asset: string): number | null;
}

export interface CoinStudyDirection {
  readonly kind: InrRouteKind;
  readonly buyVenue: string;
  readonly buyQuote: "INR" | "USDT";
  readonly sellVenue: string;
  readonly sellQuote: "INR" | "USDT";
  readonly edgeMinutes: number;
  readonly sharePercent: number;
}

export interface CoinStudyEntry {
  readonly coin: string;
  readonly rank: number;
  readonly core: boolean;
  readonly windows: number;
  readonly edgeMinutes: number;
  readonly sharePercent: number;
  readonly activeDays: number;
  readonly averageNetPercent: number;
  readonly bestNetPercent: number;
  readonly averageDepthInr: number | null;
  readonly peakHoursIst: readonly number[];
  readonly hourlyEdgeMinutes: readonly number[];
  readonly directions: readonly CoinStudyDirection[];
  /** A reverse direction carries >= 20% of the main one: inventory partly rebalances itself. */
  readonly twoWay: boolean;
  readonly placement: {
    readonly trades: number;
    readonly coin: {readonly venue: string; readonly needInr: number; readonly haveInr: number | null};
    readonly cash: {readonly venue: string; readonly asset: "INR" | "USDT"; readonly needInr: number; readonly haveInr: number | null};
  };
}

export interface CoinStudyReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly studyDays: number;
  readonly dataSpanHours: number;
  readonly dataSufficient: boolean;
  readonly tradeSizeInr: number;
  readonly totals: {
    readonly windows: number;
    readonly edgeMinutes: number;
    readonly coins: number;
    /** Edge time on routes no live executor can trade (not ranked). */
    readonly nonExecutableEdgeMinutes: number;
  };
  readonly coreBasket: readonly string[];
  readonly coins: readonly CoinStudyEntry[];
}

export function istDay(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istHour(timestamp: number): number {
  return new Date(timestamp + IST_OFFSET_MS).getUTCHours();
}

/*
 * Only routes a live executor can actually trade feed the ranking:
 * USDT<->USDT on Strategy #1's venues; INR legs on an INR venue with an
 * order contract, USDT legs on a hedge venue. Everything else (e.g. a
 * CoinSwitch USDT market) is reported as non-executable edge time only.
 */
export function isExecutableAggregate(route: {
  readonly kind: InrRouteKind;
  readonly buyVenue: string;
  readonly buyQuote: "INR" | "USDT";
  readonly sellVenue: string;
  readonly sellQuote: "INR" | "USDT";
}): boolean {
  const usdtUsdtVenues = STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY.venues as readonly string[];
  const hedgeVenues = INR_ROUTE_HEDGE_VENUES as readonly string[];
  if (route.kind === "USDT_USDT") {
    return usdtUsdtVenues.includes(route.buyVenue) && usdtUsdtVenues.includes(route.sellVenue);
  }
  return [[route.buyVenue, route.buyQuote], [route.sellVenue, route.sellQuote]].every(([venue, quote]) =>
    quote === "INR" ? INR_ROUTE_SUPPORTED_INR_VENUES[venue] !== undefined : hedgeVenues.includes(venue));
}

function quoteOf(market: string): "INR" | "USDT" {
  return market.toUpperCase().replace(/[^A-Z]/gu, "").endsWith("INR") ? "INR" : "USDT";
}

function emptyState(): StudyState {
  return {schemaVersion: "1.0", firstWindowAt: null, lastIngestedEndedAt: 0, boundaryIds: [], days: {}};
}

/** Pure aggregation: folds closed windows into the state (idempotent across repeated feeds). */
export function ingestWindows(state: StudyState, windows: readonly OpportunityWindow[]): number {
  let added = 0;
  const sorted = [...windows].filter((window) => window.endedAt !== null).sort((a, b) => (a.endedAt as number) - (b.endedAt as number));
  for (const window of sorted) {
    const endedAt = window.endedAt as number;
    if (endedAt < state.lastIngestedEndedAt) continue;
    if (endedAt === state.lastIngestedEndedAt && state.boundaryIds.includes(window.id)) continue;

    const day = istDay(window.startedAt);
    const buyQuote = quoteOf(window.buyMarket);
    const sellQuote = quoteOf(window.sellMarket);
    const key = `${window.coin}|${window.kind}|${window.buyVenue}:${buyQuote}>${window.sellVenue}:${sellQuote}`;
    const byRoute = (state.days[day] ??= {});
    const aggregate = (byRoute[key] ??= {
      coin: window.coin,
      kind: window.kind,
      buyVenue: window.buyVenue,
      buyQuote,
      sellVenue: window.sellVenue,
      sellQuote,
      windows: 0,
      edgeMs: 0,
      netMs: 0,
      bestNetPercent: 0,
      depthSumInr: 0,
      depthSamples: 0,
      hourMs: new Array<number>(24).fill(0),
    });
    const edgeMs = Math.max(MINIMUM_WINDOW_MS, window.durationMs);
    aggregate.windows += 1;
    aggregate.edgeMs += edgeMs;
    aggregate.netMs += window.peakNetPercent * edgeMs;
    aggregate.bestNetPercent = Math.max(aggregate.bestNetPercent, window.peakNetPercent);
    if (Number.isFinite(window.peakDepthInr) && window.peakDepthInr > 0) {
      aggregate.depthSumInr += window.peakDepthInr;
      aggregate.depthSamples += 1;
    }
    aggregate.hourMs[istHour(window.startedAt)] += edgeMs;

    state.firstWindowAt = state.firstWindowAt === null ? window.startedAt : Math.min(state.firstWindowAt, window.startedAt);
    if (endedAt > state.lastIngestedEndedAt) {
      state.lastIngestedEndedAt = endedAt;
      state.boundaryIds = [];
    }
    state.boundaryIds.push(window.id);
    added += 1;
  }
  return added;
}

export function pruneDays(state: StudyState, now: number): void {
  const oldest = istDay(now - RETAIN_DAYS * 86_400_000);
  for (const day of Object.keys(state.days)) {
    if (day < oldest) delete state.days[day];
  }
}

/** Pure report over the last STUDY_DAYS of aggregates. */
export function buildCoinStudyReport(state: StudyState, input: {
  readonly now: number;
  readonly tradeSizeInr: number;
  readonly holding: HoldingLookup;
}): CoinStudyReport {
  const since = istDay(input.now - (STUDY_DAYS - 1) * 86_400_000);
  const byCoin = new Map<string, {routes: Map<string, RouteAggregate>; days: Set<string>}>();
  let nonExecutableEdgeMs = 0;
  for (const [day, routes] of Object.entries(state.days)) {
    if (day < since) continue;
    for (const [key, aggregate] of Object.entries(routes)) {
      if (!isExecutableAggregate(aggregate)) {
        nonExecutableEdgeMs += aggregate.edgeMs;
        continue;
      }
      const entry = byCoin.get(aggregate.coin) ?? {routes: new Map<string, RouteAggregate>(), days: new Set<string>()};
      entry.days.add(day);
      const merged = entry.routes.get(key);
      if (merged) {
        merged.windows += aggregate.windows;
        merged.edgeMs += aggregate.edgeMs;
        merged.netMs += aggregate.netMs;
        merged.bestNetPercent = Math.max(merged.bestNetPercent, aggregate.bestNetPercent);
        merged.depthSumInr += aggregate.depthSumInr;
        merged.depthSamples += aggregate.depthSamples;
        merged.hourMs = merged.hourMs.map((value, hour) => value + aggregate.hourMs[hour]);
      } else {
        entry.routes.set(key, {...aggregate, hourMs: [...aggregate.hourMs]});
      }
      byCoin.set(aggregate.coin, entry);
    }
  }

  const totalEdgeMs = [...byCoin.values()].reduce((sum, entry) => sum + [...entry.routes.values()].reduce((s, r) => s + r.edgeMs, 0), 0);
  const totalWindows = [...byCoin.values()].reduce((sum, entry) => sum + [...entry.routes.values()].reduce((s, r) => s + r.windows, 0), 0);

  const scored = [...byCoin.entries()].map(([coin, entry]) => {
    const routes = [...entry.routes.values()].sort((a, b) => b.edgeMs - a.edgeMs);
    const edgeMs = routes.reduce((sum, route) => sum + route.edgeMs, 0);
    const netMs = routes.reduce((sum, route) => sum + route.netMs, 0);
    const depthSum = routes.reduce((sum, route) => sum + route.depthSumInr, 0);
    const depthSamples = routes.reduce((sum, route) => sum + route.depthSamples, 0);
    const hourMs = new Array<number>(24).fill(0);
    for (const route of routes) route.hourMs.forEach((value, hour) => (hourMs[hour] += value));
    const averageNetPercent = edgeMs > 0 ? netMs / edgeMs : 0;
    const averageDepthInr = depthSamples > 0 ? depthSum / depthSamples : null;
    const depthCoverage = averageDepthInr === null ? 0.5 : Math.min(1, averageDepthInr / input.tradeSizeInr);
    const main = routes[0];
    const reverse = routes.find((route) => route.buyVenue === main.sellVenue && route.sellVenue === main.buyVenue);
    return {
      coin,
      routes,
      edgeMs,
      windows: routes.reduce((sum, route) => sum + route.windows, 0),
      activeDays: entry.days.size,
      averageNetPercent,
      bestNetPercent: Math.max(...routes.map((route) => route.bestNetPercent)),
      averageDepthInr,
      hourMs,
      score: (edgeMs / 60_000) * averageNetPercent * depthCoverage,
      twoWay: reverse !== undefined && reverse.edgeMs >= main.edgeMs * 0.2,
    };
  }).sort((a, b) => b.score - a.score);

  const coreBasket = scored
    .filter((entry) => entry.edgeMs / 60_000 >= MINIMUM_CORE_EDGE_MINUTES)
    .slice(0, CORE_BASKET_SIZE)
    .map((entry) => entry.coin);

  const coins: CoinStudyEntry[] = scored.slice(0, 40).map((entry, index) => {
    const main = entry.routes[0];
    const core = coreBasket.includes(entry.coin);
    // Leading coins get more depth of stock; one-way coins drain faster.
    const trades = core ? (coreBasket.indexOf(entry.coin) < 3 ? 5 : 3) + (entry.twoWay ? -1 : 0) : 0;
    const perTradeInr = entry.averageDepthInr === null ? input.tradeSizeInr : Math.min(input.tradeSizeInr, entry.averageDepthInr);
    const needInr = Math.round(trades * perTradeInr);
    return {
      coin: entry.coin,
      rank: index + 1,
      core,
      windows: entry.windows,
      edgeMinutes: entry.edgeMs / 60_000,
      sharePercent: totalEdgeMs > 0 ? (entry.edgeMs / totalEdgeMs) * 100 : 0,
      activeDays: entry.activeDays,
      averageNetPercent: entry.averageNetPercent,
      bestNetPercent: entry.bestNetPercent,
      averageDepthInr: entry.averageDepthInr,
      peakHoursIst: entry.hourMs
        .map((ms, hour) => ({ms, hour}))
        .filter((item) => item.ms > 0)
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 3)
        .map((item) => item.hour),
      hourlyEdgeMinutes: entry.hourMs.map((ms) => ms / 60_000),
      directions: entry.routes.slice(0, 3).map((route) => ({
        kind: route.kind,
        buyVenue: route.buyVenue,
        buyQuote: route.buyQuote,
        sellVenue: route.sellVenue,
        sellQuote: route.sellQuote,
        edgeMinutes: route.edgeMs / 60_000,
        sharePercent: entry.edgeMs > 0 ? (route.edgeMs / entry.edgeMs) * 100 : 0,
      })),
      twoWay: entry.twoWay,
      placement: {
        trades,
        coin: {venue: main.sellVenue, needInr, haveInr: input.holding(main.sellVenue, entry.coin)},
        cash: {venue: main.buyVenue, asset: main.buyQuote, needInr, haveInr: input.holding(main.buyVenue, main.buyQuote)},
      },
    };
  });

  const spanHours = state.firstWindowAt === null ? 0 : (input.now - state.firstWindowAt) / 3_600_000;
  return {
    schemaVersion: "1.0",
    generatedAt: input.now,
    studyDays: STUDY_DAYS,
    dataSpanHours: spanHours,
    dataSufficient: spanHours >= SUFFICIENT_SPAN_HOURS,
    tradeSizeInr: input.tradeSizeInr,
    totals: {
      windows: totalWindows,
      edgeMinutes: totalEdgeMs / 60_000,
      coins: byCoin.size,
      nonExecutableEdgeMinutes: nonExecutableEdgeMs / 60_000,
    },
    coreBasket,
    coins,
  };
}

export interface LiveCoinSignal {
  readonly coin: string;
  /** Edge minutes in the window x average net % x depth coverage. */
  readonly score: number;
  readonly edgeMinutes: number;
  readonly averageNetPercent: number;
  readonly averageDepthInr: number | null;
  /**
   * Rough INR/day: windows are counted as trades only as fast as a live
   * session can repeat (one per window, at most one per 5 minutes of edge),
   * capped at 10 trades a day per coin.
   */
  readonly expectedDailyProfitInr: number;
  /** The route that carried the most edge time in the window. */
  readonly main: {
    readonly buyVenue: string;
    readonly buyQuote: "INR" | "USDT";
    readonly sellVenue: string;
    readonly sellQuote: "INR" | "USDT";
  };
}

interface LiveRoute {
  readonly aggregate: RouteAggregate;
  edgeMs: number;
  netMs: number;
  windows: number;
  depthSum: number;
  depthSamples: number;
}

/**
 * Pure: which coins produced executable edge in the last `hours` hours.
 * Built from the durable per-hour edge time (so it survives restarts); a
 * route's net and depth are its day averages. Smoothed over hours, not
 * seconds, so capital does not chase windows that flicker for a scan.
 */
export function buildLiveSignal(state: StudyState, input: {
  readonly now: number;
  readonly hours: number;
  readonly tradeSizeInr: number;
}): readonly LiveCoinSignal[] {
  const routes = new Map<string, LiveRoute>();
  for (let offset = 0; offset < Math.min(24, Math.max(1, input.hours)); offset += 1) {
    const at = input.now - offset * 3_600_000;
    const day = state.days[istDay(at)];
    if (!day) continue;
    const hour = istHour(at);
    for (const [key, aggregate] of Object.entries(day)) {
      const edgeMs = aggregate.hourMs[hour] ?? 0;
      if (!(edgeMs > 0) || !isExecutableAggregate(aggregate)) continue;
      const entry = routes.get(key) ?? {aggregate, edgeMs: 0, netMs: 0, windows: 0, depthSum: 0, depthSamples: 0};
      const averageNet = aggregate.edgeMs > 0 ? aggregate.netMs / aggregate.edgeMs : 0;
      entry.edgeMs += edgeMs;
      entry.netMs += averageNet * edgeMs;
      entry.windows += aggregate.edgeMs > 0 ? aggregate.windows * (edgeMs / aggregate.edgeMs) : 0;
      if (aggregate.depthSamples > 0) {
        entry.depthSum += aggregate.depthSumInr / aggregate.depthSamples;
        entry.depthSamples += 1;
      }
      routes.set(key, entry);
    }
  }

  const byCoin = new Map<string, LiveRoute[]>();
  for (const entry of routes.values()) {
    const list = byCoin.get(entry.aggregate.coin) ?? [];
    list.push(entry);
    byCoin.set(entry.aggregate.coin, list);
  }

  const scale = 24 / Math.min(24, Math.max(1, input.hours));
  const MINUTES_PER_REPEAT = 5;
  const MAXIMUM_TRADES_PER_DAY = 10;
  return [...byCoin.entries()].map(([coin, list]) => {
    const sorted = [...list].sort((a, b) => b.edgeMs - a.edgeMs);
    const edgeMs = sorted.reduce((sum, entry) => sum + entry.edgeMs, 0);
    const netMs = sorted.reduce((sum, entry) => sum + entry.netMs, 0);
    const depthSum = sorted.reduce((sum, entry) => sum + entry.depthSum, 0);
    const depthSamples = sorted.reduce((sum, entry) => sum + entry.depthSamples, 0);
    const averageNetPercent = edgeMs > 0 ? netMs / edgeMs : 0;
    const averageDepthInr = depthSamples > 0 ? depthSum / depthSamples : null;
    const perTradeInr = averageDepthInr === null ? input.tradeSizeInr : Math.min(input.tradeSizeInr, averageDepthInr);
    // Flickering books open many windows a minute; only repeatable trades count.
    const expectedDailyProfitInr = Math.min(
      sorted.reduce((sum, entry) => {
        const net = entry.edgeMs > 0 ? entry.netMs / entry.edgeMs : 0;
        const trades = Math.min(entry.windows, 1 + entry.edgeMs / 60_000 / MINUTES_PER_REPEAT);
        return sum + trades * (net / 100) * perTradeInr;
      }, 0) * scale,
      MAXIMUM_TRADES_PER_DAY * (averageNetPercent / 100) * perTradeInr,
    );
    const main = sorted[0]!.aggregate;
    return {
      coin,
      score: (edgeMs / 60_000) * averageNetPercent * (averageDepthInr === null ? 0.5 : Math.min(1, averageDepthInr / input.tradeSizeInr)),
      edgeMinutes: edgeMs / 60_000,
      averageNetPercent,
      averageDepthInr,
      expectedDailyProfitInr,
      main: {buyVenue: main.buyVenue, buyQuote: main.buyQuote, sellVenue: main.sellVenue, sellQuote: main.sellQuote},
    };
  }).sort((a, b) => b.score - a.score);
}

/* A reverse direction must carry this share of a route's edge to refill it. */
const TWO_WAY_SHARE = 0.2;
const TWO_WAY_MINIMUM_EDGE_MINUTES = 5;

/**
 * Pure: "COIN|buyVenue>sellVenue" for every executable direction whose
 * reverse (buy on the sell venue, sell on the buy venue) also produced edge
 * over the study days - at least 20% of this direction's edge time and 5
 * minutes. Such a route's inventory rebalances by trading back.
 */
export function twoWayPairs(state: StudyState, now: number): Set<string> {
  const since = istDay(now - (STUDY_DAYS - 1) * 86_400_000);
  const edge = new Map<string, number>();
  for (const [day, routes] of Object.entries(state.days)) {
    if (day < since) continue;
    for (const aggregate of Object.values(routes)) {
      if (!isExecutableAggregate(aggregate)) continue;
      const key = `${aggregate.coin}|${aggregate.buyVenue}>${aggregate.sellVenue}`;
      edge.set(key, (edge.get(key) ?? 0) + aggregate.edgeMs);
    }
  }
  const pairs = new Set<string>();
  for (const [key, edgeMs] of edge) {
    const [coin, venues] = key.split("|");
    const [buy, sell] = (venues ?? "").split(">");
    const reverse = edge.get(`${coin}|${sell}>${buy}`) ?? 0;
    if (reverse >= edgeMs * TWO_WAY_SHARE && reverse >= TWO_WAY_MINIMUM_EDGE_MINUTES * 60_000) pairs.add(key);
  }
  return pairs;
}

function isState(value: unknown): value is StudyState {
  const state = value as Partial<StudyState> | null;
  return !!state && state.schemaVersion === "1.0" && typeof state.days === "object" && state.days !== null;
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "coin-study.jsonl");

export class CoinStudyService {
  private readonly store: JsonlSnapshotStore<StudyState>;
  private state: StudyState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;
  private twoWay: {at: number; pairs: Set<string>} | null = null;

  constructor(
    private readonly getClosedWindowsSince: (endedAtOrAfter: number) => readonly OpportunityWindow[] =
      (since) => getInrArbitrageScanner()?.getClosedWindowsSince(since) ?? [],
    filePath = DEFAULT_FILE,
    private readonly now: () => number = Date.now,
  ) {
    this.store = new JsonlSnapshotStore({filePath, isPayload: isState});
    this.state = this.store.readLatest() ?? emptyState();
  }

  start(): void {
    if (this.timer !== null) return;
    this.sync();
    this.timer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.persist();
  }

  /** Pull newly closed scanner windows into the durable aggregates. */
  sync(): void {
    try {
      const added = ingestWindows(this.state, this.getClosedWindowsSince(this.state.lastIngestedEndedAt));
      if (added > 0) {
        pruneDays(this.state, this.now());
        this.dirty = true;
      }
      this.persist();
    } catch (error: unknown) {
      console.warn("[Coin-Study] Sync failed:", error instanceof Error ? error.message : error);
    }
  }

  /** Whether buying `coin` on `buyVenue` and selling on `sellVenue` is two-way (cached 5 minutes). */
  isTwoWay(coin: string, buyVenue: string, sellVenue: string): boolean {
    const now = this.now();
    if (!this.twoWay || now - this.twoWay.at > 5 * 60_000) {
      this.sync();
      this.twoWay = {at: now, pairs: twoWayPairs(this.state, now)};
    }
    return this.twoWay.pairs.has(`${coin.toUpperCase()}|${buyVenue.toLowerCase()}>${sellVenue.toLowerCase()}`);
  }

  getLiveSignal(tradeSizeInr: number, hours = 6): readonly LiveCoinSignal[] {
    this.sync();
    return buildLiveSignal(this.state, {now: this.now(), hours, tradeSizeInr});
  }

  getReport(tradeSizeInr: number, holding: HoldingLookup): CoinStudyReport {
    this.sync();
    return buildCoinStudyReport(this.state, {now: this.now(), tradeSizeInr, holding});
  }

  private persist(): void {
    if (!this.dirty) return;
    try {
      this.store.replaceAllAtomically([this.state]);
      this.dirty = false;
    } catch (error: unknown) {
      console.warn("[Coin-Study] Persist failed:", error instanceof Error ? error.message : error);
    }
  }
}

let shared: CoinStudyService | null = null;

export function getCoinStudyService(): CoinStudyService {
  shared ??= new CoinStudyService();
  return shared;
}
