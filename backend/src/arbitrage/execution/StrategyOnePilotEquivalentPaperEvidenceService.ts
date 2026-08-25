import {resolve} from "node:path";

import {
  isStrategyOneTinyLiveBasketRoute,
  type StrategyOneTinyLiveBasketBookObservation,
} from "./StrategyOneTinyLiveBasketPolicy";

import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import {PROFIT_TIER_POLICY} from "../config/profitTiers";
import type {ArbitrageOpportunity} from "../models/ArbitrageOpportunity";
import type {OpportunitySnapshot} from "../services/OpportunityService";

export const STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS = 250;
export const STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS = 250;

/*
 * The absolute 250 ms pilot ceiling is unchanged. The first Tiny-LIVE lane
 * also needs room for the measured decision-to-dispatch path (target P99
 * 40 ms). The independently enforced action-time cohort stays capped at
 * 190 ms even when the route-specific controlled timing profile uses a 5 ms
 * dispatch reserve and requires a further 5 ms measured operating reserve.
 * Generations above this stricter boundary remain valid historical 250 ms
 * evidence, but cannot enter the dispatch-reserved calibration cohort.
 */
export const STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS = 190;

export type StrategyOnePilotExchange =
  | "binance"
  | "bybit"
  | "coindcx";

export type StrategyOnePilotFreshnessRejection =
  | "NON_EXECUTE_DECISION"
  | "FALLBACK_QUOTE"
  | "NON_EXECUTABLE_QUOTE"
  | "INVALID_QUOTE_TIMESTAMP"
  | "BUY_BOOK_STALE"
  | "SELL_BOOK_STALE"
  | "BOOK_TIMESTAMP_SKEW";

export interface StrategyOnePilotTimingDistribution {
  readonly retainedSamples: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly maxMs: number | null;
}

export interface StrategyOnePilotEconomicsDistribution {
  readonly retainedSamples: number;
  readonly p50Percent: number | null;
  readonly p95Percent: number | null;
  readonly p99Percent: number | null;
  readonly maxPercent: number | null;
}

export interface StrategyOnePilotEconomicsReport {
  readonly firstObservedAt: number | null;
  readonly lastObservedAt: number | null;
  readonly observedGenerations: number;
  readonly profitBands: {
    readonly discovered: number;
    readonly qualified: number;
    readonly liveEligible: number;
  };
  readonly decisions: {
    readonly execute: number;
    readonly review: number;
    readonly skip: number;
  };
  readonly dispatchReservedLiveEligibleGenerations: number;
  readonly insufficientLiquidityGenerations: number;
  readonly latestNetProfitPercent: number | null;
  readonly bestNetProfitPercent: number | null;
  readonly netProfitPercent: StrategyOnePilotEconomicsDistribution;
  readonly estimatedFeeImpactPercent: StrategyOnePilotEconomicsDistribution;
}

export interface StrategyOnePilotEquivalentRouteReport {
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: StrategyOnePilotExchange;
  readonly sellExchange: StrategyOnePilotExchange;
  readonly firstUniqueGenerationAt: number;
  readonly lastUniqueGenerationAt: number;
  readonly firstExecutionGradeGenerationAt: number | null;
  readonly lastExecutionGradeGenerationAt: number | null;
  readonly uniqueGenerations: number;
  readonly repeatedGenerationsIgnored: number;
  readonly executionGradeGenerations: number;
  readonly rejectedGenerations: number;
  readonly executionGradePercent: number;
  readonly maximumObservedBuyAgeMs: number;
  readonly maximumObservedSellAgeMs: number;
  readonly maximumObservedSkewMs: number;
  readonly executionGradeBuyAgeMs: StrategyOnePilotTimingDistribution;
  readonly executionGradeSellAgeMs: StrategyOnePilotTimingDistribution;
  readonly dispatchReserved: {
    readonly maximumBookAgeMs: 190;
    readonly firstGenerationAt: number | null;
    readonly lastGenerationAt: number | null;
    readonly generations: number;
    readonly rejectedExecutionGradeGenerations: number;
    readonly buyAgeMs: StrategyOnePilotTimingDistribution;
    readonly sellAgeMs: StrategyOnePilotTimingDistribution;
    readonly calibration: {
      readonly ready: boolean;
      readonly minimumGenerations: number;
      readonly minimumObservationSpanMs: number;
      readonly observationSpanMs: number;
      readonly blockers: readonly string[];
    };
  };
  readonly rejectionCounts: Readonly<Record<StrategyOnePilotFreshnessRejection, number>>;
  readonly economics: StrategyOnePilotEconomicsReport;
  readonly calibration: {
    readonly ready: boolean;
    readonly minimumExecutionGradeGenerations: number;
    readonly minimumObservationSpanMs: number;
    readonly executionGradeObservationSpanMs: number;
    readonly blockers: readonly string[];
  };
}

export interface StrategyOnePilotEquivalentPaperEvidenceReport {
  readonly schemaVersion: "112.0";
  readonly generatedAt: number;
  readonly running: boolean;
  readonly snapshotsObserved: number;
  readonly opportunitiesObserved: number;
  readonly routeBookObservationsObserved: number;
  readonly excludedVenueOpportunities: number;
  readonly eligibleVenueOpportunities: number;
  readonly invalidObservationsRejected: number;
  readonly observerFailures: number;
  readonly maximumBookAgeMs: 250;
  readonly maximumBookSkewMs: 250;
  readonly dispatchReservedMaximumBookAgeMs: 190;
  readonly minimumExecutionGradeGenerations: number;
  readonly minimumObservationSpanMs: number;
  readonly maximumSamplesPerDistribution: number;
  readonly routes: readonly StrategyOnePilotEquivalentRouteReport[];
  readonly persistence: ReturnType<JsonlSnapshotStore<PersistedSnapshot>["getDiagnostics"]>;
  readonly safety: {
    readonly exactPilotVenuesOnly: true;
    readonly unchangedBookGenerationsDoNotIncreaseEvidence: true;
    readonly staleOrIncoherentBooksAreNotExecutionGrade: true;
    readonly timingEvidenceIsIndependentFromOpportunityEconomics: true;
    readonly evidenceDoesNotAuthorizeLiveOrOrders: true;
  };
}

export interface StrategyOnePilotEquivalentPaperEvidenceConfig {
  readonly filePath?: string;
  readonly maximumRoutes?: number;
  readonly maximumGenerationKeysPerRoute?: number;
  readonly persistenceIntervalMs?: number;
  readonly maximumPersistedSnapshots?: number;
  readonly minimumExecutionGradeGenerations?: number;
  readonly minimumObservationSpanMs?: number;
  readonly maximumSamplesPerDistribution?: number;
}

interface MutableRoute {
  routeKey: string;
  market: string;
  buyExchange: StrategyOnePilotExchange;
  sellExchange: StrategyOnePilotExchange;
  firstUniqueGenerationAt: number;
  lastUniqueGenerationAt: number;
  firstExecutionGradeGenerationAt: number | null;
  lastExecutionGradeGenerationAt: number | null;
  uniqueGenerations: number;
  repeatedGenerationsIgnored: number;
  executionGradeGenerations: number;
  rejectedGenerations: number;
  maximumObservedBuyAgeMs: number;
  maximumObservedSellAgeMs: number;
  maximumObservedSkewMs: number;
  rejectionCounts: Record<StrategyOnePilotFreshnessRejection, number>;
  generationKeys: string[];
  executionGradeBuyAgesMs: number[];
  executionGradeSellAgesMs: number[];
  firstDispatchReservedGenerationAt: number | null;
  lastDispatchReservedGenerationAt: number | null;
  dispatchReservedGenerations: number;
  dispatchReservedRejectedGenerations: number;
  dispatchReservedBuyAgesMs: number[];
  dispatchReservedSellAgesMs: number[];
  firstEconomicsObservationAt: number | null;
  lastEconomicsObservationAt: number | null;
  economicsObservedGenerations: number;
  discoveredProfitGenerations: number;
  qualifiedProfitGenerations: number;
  liveEligibleProfitGenerations: number;
  executeDecisionGenerations: number;
  reviewDecisionGenerations: number;
  skipDecisionGenerations: number;
  dispatchReservedLiveEligibleGenerations: number;
  insufficientLiquidityGenerations: number;
  latestNetProfitPercent: number | null;
  bestNetProfitPercent: number | null;
  retainedNetProfitPercents: number[];
  retainedEstimatedFeeImpactPercents: number[];
}

type PersistedRoute = Omit<MutableRoute,
  "executionGradeBuyAgesMs" | "executionGradeSellAgesMs" |
  "firstDispatchReservedGenerationAt" | "lastDispatchReservedGenerationAt" |
  "dispatchReservedGenerations" | "dispatchReservedRejectedGenerations" |
  "dispatchReservedBuyAgesMs" | "dispatchReservedSellAgesMs" |
  "firstEconomicsObservationAt" | "lastEconomicsObservationAt" |
  "economicsObservedGenerations" | "discoveredProfitGenerations" |
  "qualifiedProfitGenerations" | "liveEligibleProfitGenerations" |
  "executeDecisionGenerations" | "reviewDecisionGenerations" |
  "skipDecisionGenerations" | "dispatchReservedLiveEligibleGenerations" |
  "insufficientLiquidityGenerations" | "latestNetProfitPercent" |
  "bestNetProfitPercent" | "retainedNetProfitPercents" |
  "retainedEstimatedFeeImpactPercents"> & {
  readonly executionGradeBuyAgesMs?: number[];
  readonly executionGradeSellAgesMs?: number[];
  readonly firstDispatchReservedGenerationAt?: number | null;
  readonly lastDispatchReservedGenerationAt?: number | null;
  readonly dispatchReservedGenerations?: number;
  readonly dispatchReservedRejectedGenerations?: number;
  readonly dispatchReservedBuyAgesMs?: number[];
  readonly dispatchReservedSellAgesMs?: number[];
  readonly firstEconomicsObservationAt?: number | null;
  readonly lastEconomicsObservationAt?: number | null;
  readonly economicsObservedGenerations?: number;
  readonly discoveredProfitGenerations?: number;
  readonly qualifiedProfitGenerations?: number;
  readonly liveEligibleProfitGenerations?: number;
  readonly executeDecisionGenerations?: number;
  readonly reviewDecisionGenerations?: number;
  readonly skipDecisionGenerations?: number;
  readonly dispatchReservedLiveEligibleGenerations?: number;
  readonly insufficientLiquidityGenerations?: number;
  readonly latestNetProfitPercent?: number | null;
  readonly bestNetProfitPercent?: number | null;
  readonly retainedNetProfitPercents?: number[];
  readonly retainedEstimatedFeeImpactPercents?: number[];
};

interface PersistedSnapshot {
  readonly schemaVersion: "112.0";
  readonly savedAt: number;
  readonly snapshotsObserved: number;
  readonly opportunitiesObserved: number;
  readonly routeBookObservationsObserved?: number;
  readonly excludedVenueOpportunities: number;
  readonly eligibleVenueOpportunities: number;
  readonly invalidObservationsRejected: number;
  readonly observerFailures: number;
  readonly routes: readonly PersistedRoute[];
}

const REJECTIONS: readonly StrategyOnePilotFreshnessRejection[] = [
  "NON_EXECUTE_DECISION",
  "FALLBACK_QUOTE",
  "NON_EXECUTABLE_QUOTE",
  "INVALID_QUOTE_TIMESTAMP",
  "BUY_BOOK_STALE",
  "SELL_BOOK_STALE",
  "BOOK_TIMESTAMP_SKEW",
];

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "live",
  "strategy-one-pilot-equivalent-paper.jsonl",
);

/**
 * V112 evidence owner for an exact registered Strategy #1 pilot lane.
 * It observes every accepted opportunity generation before qualification,
 * rejects stale/incoherent generations from the execution-grade cohort and
 * never counts an unchanged pair of book timestamps twice.
 */
export class StrategyOnePilotEquivalentPaperEvidenceService {
  private readonly routes = new Map<string, MutableRoute>();
  private readonly generationKeySets = new Map<string, Set<string>>();
  private readonly store: JsonlSnapshotStore<PersistedSnapshot>;
  private readonly maximumRoutes: number;
  private readonly maximumGenerationKeysPerRoute: number;
  private readonly persistenceIntervalMs: number;
  private readonly maximumPersistedSnapshots: number;
  private readonly minimumExecutionGradeGenerations: number;
  private readonly minimumObservationSpanMs: number;
  private readonly maximumSamplesPerDistribution: number;
  private snapshotsObserved = 0;
  private opportunitiesObserved = 0;
  private routeBookObservationsObserved = 0;
  private excludedVenueOpportunities = 0;
  private eligibleVenueOpportunities = 0;
  private invalidObservationsRejected = 0;
  private observerFailures = 0;
  private persistedSnapshots = 0;
  private running = false;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(configuration: StrategyOnePilotEquivalentPaperEvidenceConfig = {}) {
    this.maximumRoutes = configuration.maximumRoutes ?? 128;
    this.maximumGenerationKeysPerRoute = configuration.maximumGenerationKeysPerRoute ?? 4_096;
    this.persistenceIntervalMs = configuration.persistenceIntervalMs ?? 300_000;
    this.maximumPersistedSnapshots = configuration.maximumPersistedSnapshots ?? 2;
    this.minimumExecutionGradeGenerations = configuration.minimumExecutionGradeGenerations ?? 512;
    this.minimumObservationSpanMs = configuration.minimumObservationSpanMs ?? 60 * 60 * 1_000;
    this.maximumSamplesPerDistribution = configuration.maximumSamplesPerDistribution ?? 512;
    this.validateConfiguration();
    this.store = new JsonlSnapshotStore({
      filePath: configuration.filePath ?? DEFAULT_FILE,
      isPayload: isPersistedSnapshot,
    });
    const snapshots = this.store.readAll();
    this.persistedSnapshots = snapshots.length;
    const latest = snapshots.at(-1);
    if (latest) this.restore(latest);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.persistSafely(Date.now()), this.persistenceIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persistSafely(Date.now());
    this.running = false;
  }

  observeSnapshot(snapshot: OpportunitySnapshot, observedAt = Date.now()): void {
    if (!validTime(observedAt) || !validTime(snapshot.generatedAt) || observedAt < snapshot.generatedAt) {
      this.invalidObservationsRejected += 1;
      this.dirty = true;
      return;
    }
    this.snapshotsObserved += 1;
    this.opportunitiesObserved += snapshot.opportunities.length;
    const opportunityGenerationKeys = new Set<string>();
    for (const opportunity of snapshot.opportunities) {
      try {
        if (!isExactPilotRoute(opportunity)) {
          this.excludedVenueOpportunities += 1;
          continue;
        }
        this.eligibleVenueOpportunities += 1;
        opportunityGenerationKeys.add(pilotGenerationIdentity({
          market: opportunity.pair.market,
          buyExchange: opportunity.pair.buy.exchange,
          sellExchange: opportunity.pair.sell.exchange,
          buyTimestamp: opportunity.pair.buy.timestamp,
          sellTimestamp: opportunity.pair.sell.timestamp,
        }));
        this.observePilotOpportunity(opportunity, observedAt);
      } catch {
        this.invalidObservationsRejected += 1;
      }
    }
    for (const book of snapshot.pilotRouteBooks ?? []) {
      this.routeBookObservationsObserved += 1;
      try {
        const generationKey = pilotGenerationIdentity(book);
        if (opportunityGenerationKeys.has(generationKey)) continue;
        this.observePilotRouteBook(book, observedAt);
      } catch {
        this.invalidObservationsRejected += 1;
      }
    }
    this.dirty = true;
  }

  recordObserverFailure(): void {
    this.observerFailures += 1;
    this.dirty = true;
  }

  isRouteCalibrationReady(routeKeyValue: string, now = Date.now()): boolean {
    const routeKey = routeKeyValue.trim().toUpperCase();
    return this.getReport(now).routes.find((item) => item.routeKey.toUpperCase() === routeKey)?.calibration.ready ?? false;
  }

  getReport(now = Date.now()): StrategyOnePilotEquivalentPaperEvidenceReport {
    if (!validTime(now)) throw new Error("Strategy #1 pilot evidence report time is invalid.");
    const routes = [...this.routes.values()]
      .map((route) => this.routeReport(route))
      .sort((first, second) => second.lastUniqueGenerationAt - first.lastUniqueGenerationAt ||
        first.routeKey.localeCompare(second.routeKey));
    return deepFreeze({
      schemaVersion: "112.0" as const,
      generatedAt: now,
      running: this.running,
      snapshotsObserved: this.snapshotsObserved,
      opportunitiesObserved: this.opportunitiesObserved,
      routeBookObservationsObserved: this.routeBookObservationsObserved,
      excludedVenueOpportunities: this.excludedVenueOpportunities,
      eligibleVenueOpportunities: this.eligibleVenueOpportunities,
      invalidObservationsRejected: this.invalidObservationsRejected,
      observerFailures: this.observerFailures,
      maximumBookAgeMs: STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS,
      maximumBookSkewMs: STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS,
      dispatchReservedMaximumBookAgeMs:
        STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
      minimumExecutionGradeGenerations: this.minimumExecutionGradeGenerations,
      minimumObservationSpanMs: this.minimumObservationSpanMs,
      maximumSamplesPerDistribution: this.maximumSamplesPerDistribution,
      routes,
      persistence: this.store.getDiagnostics(),
      safety: {
        exactPilotVenuesOnly: true as const,
        unchangedBookGenerationsDoNotIncreaseEvidence: true as const,
        staleOrIncoherentBooksAreNotExecutionGrade: true as const,
        timingEvidenceIsIndependentFromOpportunityEconomics: true as const,
        evidenceDoesNotAuthorizeLiveOrOrders: true as const,
      },
    });
  }

  private observePilotOpportunity(opportunity: ArbitrageOpportunity, observedAt: number): string | null {
    const market = normalizeMarket(opportunity.pair.market);
    const buyExchange = normalizePilotExchange(opportunity.pair.buy.exchange);
    const sellExchange = normalizePilotExchange(opportunity.pair.sell.exchange);
    const dispatchFreshness = assessStrategyOnePilotDispatchReservedFreshness({
      buyExchange,
      sellExchange,
      buyTimestamp: opportunity.pair.buy.timestamp,
      sellTimestamp: opportunity.pair.sell.timestamp,
      quotesAreFresh: opportunity.quotesAreFresh,
      usedLastPriceFallback: opportunity.usedLastPriceFallback,
      now: observedAt,
    });
    const observed = this.observeRouteGeneration({
      market,
      buyExchange,
      sellExchange,
      buyTimestamp: opportunity.pair.buy.timestamp,
      sellTimestamp: opportunity.pair.sell.timestamp,
      rejections: classifyFreshness(opportunity, observedAt),
    }, observedAt, true, true);
    if (!observed) return null;
    this.observeEconomics(observed.route, opportunity, observedAt,
      dispatchFreshness.passed && opportunity.pair.buy.executable &&
      opportunity.pair.sell.executable && opportunity.enoughLiquidity);
    return observed.generationIdentity;
  }

  private observePilotRouteBook(
    book: StrategyOneTinyLiveBasketBookObservation,
    observedAt: number,
  ): void {
    if (!isStrategyOneTinyLiveBasketRoute(book)) {
      throw new Error("Strategy #1 pilot timing book is outside the dynamic USDT route pool.");
    }
    const market = normalizeMarket(book.market);
    const buyExchange = normalizePilotExchange(book.buyExchange);
    const sellExchange = normalizePilotExchange(book.sellExchange);
    const freshness = assessStrategyOnePilotFreshness({
      buyExchange,
      sellExchange,
      buyTimestamp: book.buyTimestamp,
      sellTimestamp: book.sellTimestamp,
      quotesAreFresh: true,
      usedLastPriceFallback: false,
      now: observedAt,
    });
    this.observeRouteGeneration({
      market,
      buyExchange,
      sellExchange,
      buyTimestamp: book.buyTimestamp,
      sellTimestamp: book.sellTimestamp,
      rejections: freshness.reasons,
    }, observedAt, true, false);
  }

  private observeRouteGeneration(
    input: {
      readonly market: string;
      readonly buyExchange: StrategyOnePilotExchange;
      readonly sellExchange: StrategyOnePilotExchange;
      readonly buyTimestamp: number;
      readonly sellTimestamp: number;
      readonly rejections: readonly StrategyOnePilotFreshnessRejection[];
    },
    observedAt: number,
    countRepeated: boolean,
    replaceAtCapacity: boolean,
  ): {readonly route: MutableRoute; readonly generationIdentity: string} | null {
    const routeKey = `${input.market}:${input.buyExchange}->${input.sellExchange}`;
    const generationKey = `${input.buyTimestamp}:${input.sellTimestamp}`;
    const generationIdentity = `${routeKey}:${generationKey}`;
    const route = this.ensureRoute(
      routeKey,
      input.market,
      input.buyExchange,
      input.sellExchange,
      observedAt,
      replaceAtCapacity,
    );
    if (!route) return null;
    const generationKeySet = this.generationKeySets.get(routeKey) as Set<string>;
    if (generationKeySet.has(generationKey)) {
      if (countRepeated) route.repeatedGenerationsIgnored += 1;
      return null;
    }
    generationKeySet.add(generationKey);
    route.generationKeys.push(generationKey);
    if (route.generationKeys.length > this.maximumGenerationKeysPerRoute) {
      const removed = route.generationKeys.splice(0, route.generationKeys.length - this.maximumGenerationKeysPerRoute);
      for (const key of removed) generationKeySet.delete(key);
    }
    route.uniqueGenerations += 1;
    route.lastUniqueGenerationAt = Math.max(route.lastUniqueGenerationAt, observedAt);

    const buyAgeMs = observedAt - input.buyTimestamp;
    const sellAgeMs = observedAt - input.sellTimestamp;
    const skewMs = Math.abs(input.buyTimestamp - input.sellTimestamp);
    if (Number.isFinite(buyAgeMs) && buyAgeMs >= 0) route.maximumObservedBuyAgeMs = Math.max(route.maximumObservedBuyAgeMs, buyAgeMs);
    if (Number.isFinite(sellAgeMs) && sellAgeMs >= 0) route.maximumObservedSellAgeMs = Math.max(route.maximumObservedSellAgeMs, sellAgeMs);
    if (Number.isFinite(skewMs)) route.maximumObservedSkewMs = Math.max(route.maximumObservedSkewMs, skewMs);

    if (input.rejections.length > 0) {
      route.rejectedGenerations += 1;
      for (const rejection of [...new Set(input.rejections)]) route.rejectionCounts[rejection] += 1;
      return {route, generationIdentity};
    }
    route.executionGradeGenerations += 1;
    retain(route.executionGradeBuyAgesMs, buyAgeMs, this.maximumSamplesPerDistribution);
    retain(route.executionGradeSellAgesMs, sellAgeMs, this.maximumSamplesPerDistribution);
    route.firstExecutionGradeGenerationAt ??= observedAt;
    route.lastExecutionGradeGenerationAt = Math.max(route.lastExecutionGradeGenerationAt ?? 0, observedAt);
    if (buyAgeMs <= STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS &&
      sellAgeMs <= STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS) {
      route.dispatchReservedGenerations += 1;
      route.firstDispatchReservedGenerationAt ??= observedAt;
      route.lastDispatchReservedGenerationAt = Math.max(route.lastDispatchReservedGenerationAt ?? 0, observedAt);
      retain(route.dispatchReservedBuyAgesMs, buyAgeMs, this.maximumSamplesPerDistribution);
      retain(route.dispatchReservedSellAgesMs, sellAgeMs, this.maximumSamplesPerDistribution);
    } else {
      route.dispatchReservedRejectedGenerations += 1;
    }
    return {route, generationIdentity};
  }

  private ensureRoute(routeKey: string, market: string, buyExchange: StrategyOnePilotExchange,
    sellExchange: StrategyOnePilotExchange, observedAt: number,
    replaceAtCapacity: boolean): MutableRoute | null {
    const existing = this.routes.get(routeKey);
    if (existing) return existing;
    if (this.routes.size >= this.maximumRoutes) {
      /*
       * A full dynamic route-book snapshot can contain hundreds of routes.
       * Replacing and sorting the bounded 128-route evidence cohort for every
       * unretained timing-only book caused continuous route churn, high GC and
       * event-loop tail latency. Keep the timing-only cohort stable once full;
       * a real accepted opportunity may still enter by replacing the least
       * progressed route. This preserves dynamic opportunity admission and
       * evidence safety while making book-only overflow an O(1) rejection.
       */
      if (!replaceAtCapacity) return null;

      const leastProgressed = this.findLeastProgressedRoute();
      if (leastProgressed) {
        this.routes.delete(leastProgressed.routeKey);
        this.generationKeySets.delete(leastProgressed.routeKey);
      }
    }
    const created: MutableRoute = {
      routeKey,
      market,
      buyExchange,
      sellExchange,
      firstUniqueGenerationAt: observedAt,
      lastUniqueGenerationAt: observedAt,
      firstExecutionGradeGenerationAt: null,
      lastExecutionGradeGenerationAt: null,
      uniqueGenerations: 0,
      repeatedGenerationsIgnored: 0,
      executionGradeGenerations: 0,
      rejectedGenerations: 0,
      maximumObservedBuyAgeMs: 0,
      maximumObservedSellAgeMs: 0,
      maximumObservedSkewMs: 0,
      rejectionCounts: createRejectionCounts(),
      generationKeys: [],
      executionGradeBuyAgesMs: [],
      executionGradeSellAgesMs: [],
      firstDispatchReservedGenerationAt: null,
      lastDispatchReservedGenerationAt: null,
      dispatchReservedGenerations: 0,
      dispatchReservedRejectedGenerations: 0,
      dispatchReservedBuyAgesMs: [],
      dispatchReservedSellAgesMs: [],
      firstEconomicsObservationAt: null,
      lastEconomicsObservationAt: null,
      economicsObservedGenerations: 0,
      discoveredProfitGenerations: 0,
      qualifiedProfitGenerations: 0,
      liveEligibleProfitGenerations: 0,
      executeDecisionGenerations: 0,
      reviewDecisionGenerations: 0,
      skipDecisionGenerations: 0,
      dispatchReservedLiveEligibleGenerations: 0,
      insufficientLiquidityGenerations: 0,
      latestNetProfitPercent: null,
      bestNetProfitPercent: null,
      retainedNetProfitPercents: [],
      retainedEstimatedFeeImpactPercents: [],
    };
    this.routes.set(routeKey, created);
    this.generationKeySets.set(routeKey, new Set());
    return created;
  }

  private findLeastProgressedRoute(): MutableRoute | null {
    let leastProgressed: MutableRoute | null = null;

    for (const route of this.routes.values()) {
      if (
        leastProgressed === null ||
        this.compareEvictionPriority(route, leastProgressed) < 0
      ) {
        leastProgressed = route;
      }
    }

    return leastProgressed;
  }

  private compareEvictionPriority(first: MutableRoute, second: MutableRoute): number {
    const dispatchProgress = Math.min(first.dispatchReservedGenerations,
      this.minimumExecutionGradeGenerations) - Math.min(second.dispatchReservedGenerations,
      this.minimumExecutionGradeGenerations);
    const executionGradeProgress = Math.min(first.executionGradeGenerations,
      this.minimumExecutionGradeGenerations) - Math.min(second.executionGradeGenerations,
      this.minimumExecutionGradeGenerations);
    return dispatchProgress || executionGradeProgress ||
      first.lastUniqueGenerationAt - second.lastUniqueGenerationAt;
  }

  private observeEconomics(
    route: MutableRoute,
    opportunity: ArbitrageOpportunity,
    observedAt: number,
    dispatchFresh: boolean,
  ): void {
    const netProfitPercent = opportunity.netProfitPercent;
    if (!Number.isFinite(netProfitPercent)) return;
    route.firstEconomicsObservationAt ??= observedAt;
    route.lastEconomicsObservationAt = Math.max(route.lastEconomicsObservationAt ?? 0, observedAt);
    route.economicsObservedGenerations += 1;
    route.latestNetProfitPercent = Number(netProfitPercent.toFixed(6));
    route.bestNetProfitPercent = route.bestNetProfitPercent === null
      ? route.latestNetProfitPercent
      : Math.max(route.bestNetProfitPercent, route.latestNetProfitPercent);
    retainFinite(route.retainedNetProfitPercents, netProfitPercent, this.maximumSamplesPerDistribution);
    const feeImpactPercent = opportunity.rawSpreadPercent - netProfitPercent;
    if (Number.isFinite(feeImpactPercent)) {
      retainFinite(route.retainedEstimatedFeeImpactPercents, feeImpactPercent,
        this.maximumSamplesPerDistribution);
    }

    if (netProfitPercent >= PROFIT_TIER_POLICY.liveMinimumNetProfitPercent) {
      route.liveEligibleProfitGenerations += 1;
      if (dispatchFresh && opportunity.decision === "EXECUTE") {
        route.dispatchReservedLiveEligibleGenerations += 1;
      }
    } else if (netProfitPercent >= PROFIT_TIER_POLICY.qualificationMinimumNetProfitPercent) {
      route.qualifiedProfitGenerations += 1;
    } else {
      route.discoveredProfitGenerations += 1;
    }

    if (opportunity.decision === "EXECUTE") route.executeDecisionGenerations += 1;
    else if (opportunity.decision === "REVIEW") route.reviewDecisionGenerations += 1;
    else route.skipDecisionGenerations += 1;
    if (!opportunity.enoughLiquidity) route.insufficientLiquidityGenerations += 1;
  }

  private routeReport(route: MutableRoute): StrategyOnePilotEquivalentRouteReport {
    const span = route.firstExecutionGradeGenerationAt !== null && route.lastExecutionGradeGenerationAt !== null
      ? route.lastExecutionGradeGenerationAt - route.firstExecutionGradeGenerationAt : 0;
    const buyAgeDistribution = summarize(route.executionGradeBuyAgesMs);
    const sellAgeDistribution = summarize(route.executionGradeSellAgesMs);
    const dispatchReservedSpan =
      route.firstDispatchReservedGenerationAt !== null &&
      route.lastDispatchReservedGenerationAt !== null
        ? route.lastDispatchReservedGenerationAt - route.firstDispatchReservedGenerationAt
        : 0;
    const dispatchReservedBuyAgeDistribution = summarize(route.dispatchReservedBuyAgesMs);
    const dispatchReservedSellAgeDistribution = summarize(route.dispatchReservedSellAgesMs);
    const netProfitDistribution = summarizeEconomics(route.retainedNetProfitPercents);
    const feeImpactDistribution = summarizeEconomics(route.retainedEstimatedFeeImpactPercents);
    const blockers: string[] = [];
    if (route.executionGradeGenerations < this.minimumExecutionGradeGenerations) blockers.push(
      `Need ${this.minimumExecutionGradeGenerations} unique execution-grade book generations; have ${route.executionGradeGenerations}.`,
    );
    if (span < this.minimumObservationSpanMs) blockers.push(
      `Execution-grade observation span must reach ${this.minimumObservationSpanMs} ms; have ${span} ms.`,
    );
    if (buyAgeDistribution.retainedSamples < this.minimumExecutionGradeGenerations ||
      sellAgeDistribution.retainedSamples < this.minimumExecutionGradeGenerations) blockers.push(
      `Need ${this.minimumExecutionGradeGenerations} retained execution-grade BUY/SELL age samples; have ${Math.min(
        buyAgeDistribution.retainedSamples, sellAgeDistribution.retainedSamples)}.`,
    );
    const dispatchReservedBlockers: string[] = [];
    if (route.dispatchReservedGenerations < this.minimumExecutionGradeGenerations) {
      dispatchReservedBlockers.push(
        `Need ${this.minimumExecutionGradeGenerations} unique dispatch-reserved book generations; have ${route.dispatchReservedGenerations}.`,
      );
    }
    if (dispatchReservedSpan < this.minimumObservationSpanMs) {
      dispatchReservedBlockers.push(
        `Dispatch-reserved observation span must reach ${this.minimumObservationSpanMs} ms; have ${dispatchReservedSpan} ms.`,
      );
    }
    if (
      dispatchReservedBuyAgeDistribution.retainedSamples < this.minimumExecutionGradeGenerations ||
      dispatchReservedSellAgeDistribution.retainedSamples < this.minimumExecutionGradeGenerations
    ) {
      dispatchReservedBlockers.push(
        `Need ${this.minimumExecutionGradeGenerations} retained dispatch-reserved BUY/SELL age samples; have ${Math.min(
          dispatchReservedBuyAgeDistribution.retainedSamples,
          dispatchReservedSellAgeDistribution.retainedSamples,
        )}.`,
      );
    }
    return deepFreeze({
      routeKey: route.routeKey,
      market: route.market,
      buyExchange: route.buyExchange,
      sellExchange: route.sellExchange,
      firstUniqueGenerationAt: route.firstUniqueGenerationAt,
      lastUniqueGenerationAt: route.lastUniqueGenerationAt,
      firstExecutionGradeGenerationAt: route.firstExecutionGradeGenerationAt,
      lastExecutionGradeGenerationAt: route.lastExecutionGradeGenerationAt,
      uniqueGenerations: route.uniqueGenerations,
      repeatedGenerationsIgnored: route.repeatedGenerationsIgnored,
      executionGradeGenerations: route.executionGradeGenerations,
      rejectedGenerations: route.rejectedGenerations,
      executionGradePercent: route.uniqueGenerations > 0
        ? Number(((route.executionGradeGenerations / route.uniqueGenerations) * 100).toFixed(4)) : 0,
      maximumObservedBuyAgeMs: route.maximumObservedBuyAgeMs,
      maximumObservedSellAgeMs: route.maximumObservedSellAgeMs,
      maximumObservedSkewMs: route.maximumObservedSkewMs,
      executionGradeBuyAgeMs: buyAgeDistribution,
      executionGradeSellAgeMs: sellAgeDistribution,
      dispatchReserved: {
        maximumBookAgeMs: STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
        firstGenerationAt: route.firstDispatchReservedGenerationAt,
        lastGenerationAt: route.lastDispatchReservedGenerationAt,
        generations: route.dispatchReservedGenerations,
        rejectedExecutionGradeGenerations: route.dispatchReservedRejectedGenerations,
        buyAgeMs: dispatchReservedBuyAgeDistribution,
        sellAgeMs: dispatchReservedSellAgeDistribution,
        calibration: {
          ready: dispatchReservedBlockers.length === 0,
          minimumGenerations: this.minimumExecutionGradeGenerations,
          minimumObservationSpanMs: this.minimumObservationSpanMs,
          observationSpanMs: dispatchReservedSpan,
          blockers: dispatchReservedBlockers,
        },
      },
      rejectionCounts: {...route.rejectionCounts},
      economics: {
        firstObservedAt: route.firstEconomicsObservationAt,
        lastObservedAt: route.lastEconomicsObservationAt,
        observedGenerations: route.economicsObservedGenerations,
        profitBands: {
          discovered: route.discoveredProfitGenerations,
          qualified: route.qualifiedProfitGenerations,
          liveEligible: route.liveEligibleProfitGenerations,
        },
        decisions: {
          execute: route.executeDecisionGenerations,
          review: route.reviewDecisionGenerations,
          skip: route.skipDecisionGenerations,
        },
        dispatchReservedLiveEligibleGenerations:
          route.dispatchReservedLiveEligibleGenerations,
        insufficientLiquidityGenerations: route.insufficientLiquidityGenerations,
        latestNetProfitPercent: route.latestNetProfitPercent,
        bestNetProfitPercent: route.bestNetProfitPercent,
        netProfitPercent: netProfitDistribution,
        estimatedFeeImpactPercent: feeImpactDistribution,
      },
      calibration: {
        ready: blockers.length === 0,
        minimumExecutionGradeGenerations: this.minimumExecutionGradeGenerations,
        minimumObservationSpanMs: this.minimumObservationSpanMs,
        executionGradeObservationSpanMs: span,
        blockers,
      },
    });
  }

  private persistSafely(now: number): void {
    if (!this.dirty) return;
    try {
      const snapshot = this.snapshot(now);
      if (this.persistedSnapshots >= this.maximumPersistedSnapshots) {
        this.store.replaceAll([snapshot]);
        this.persistedSnapshots = 1;
      } else {
        this.store.append(snapshot);
        this.persistedSnapshots += 1;
      }
      this.dirty = false;
    } catch {
      this.observerFailures += 1;
      this.dirty = true;
    }
  }

  private snapshot(now: number): PersistedSnapshot {
    return {
      schemaVersion: "112.0",
      savedAt: now,
      snapshotsObserved: this.snapshotsObserved,
      opportunitiesObserved: this.opportunitiesObserved,
      routeBookObservationsObserved: this.routeBookObservationsObserved,
      excludedVenueOpportunities: this.excludedVenueOpportunities,
      eligibleVenueOpportunities: this.eligibleVenueOpportunities,
      invalidObservationsRejected: this.invalidObservationsRejected,
      observerFailures: this.observerFailures,
      routes: [...this.routes.values()].map(clone),
    };
  }

  private restore(snapshot: PersistedSnapshot): void {
    this.snapshotsObserved = snapshot.snapshotsObserved;
    this.opportunitiesObserved = snapshot.opportunitiesObserved;
    this.routeBookObservationsObserved = snapshot.routeBookObservationsObserved ?? 0;
    this.excludedVenueOpportunities = snapshot.excludedVenueOpportunities;
    this.eligibleVenueOpportunities = snapshot.eligibleVenueOpportunities;
    this.invalidObservationsRejected = snapshot.invalidObservationsRejected;
    this.observerFailures = snapshot.observerFailures;
    for (const route of snapshot.routes.slice(-this.maximumRoutes)) {
      this.routes.set(route.routeKey, {
        ...clone(route),
        generationKeys: route.generationKeys.slice(-this.maximumGenerationKeysPerRoute),
        executionGradeBuyAgesMs: (route.executionGradeBuyAgesMs ?? []).slice(-this.maximumSamplesPerDistribution),
        executionGradeSellAgesMs: (route.executionGradeSellAgesMs ?? []).slice(-this.maximumSamplesPerDistribution),
        firstDispatchReservedGenerationAt: route.firstDispatchReservedGenerationAt ?? null,
        lastDispatchReservedGenerationAt: route.lastDispatchReservedGenerationAt ?? null,
        dispatchReservedGenerations: route.dispatchReservedGenerations ?? 0,
        dispatchReservedRejectedGenerations: route.dispatchReservedRejectedGenerations ?? 0,
        dispatchReservedBuyAgesMs: (route.dispatchReservedBuyAgesMs ?? []).slice(-this.maximumSamplesPerDistribution),
        dispatchReservedSellAgesMs: (route.dispatchReservedSellAgesMs ?? []).slice(-this.maximumSamplesPerDistribution),
        firstEconomicsObservationAt: route.firstEconomicsObservationAt ?? null,
        lastEconomicsObservationAt: route.lastEconomicsObservationAt ?? null,
        economicsObservedGenerations: route.economicsObservedGenerations ?? 0,
        discoveredProfitGenerations: route.discoveredProfitGenerations ?? 0,
        qualifiedProfitGenerations: route.qualifiedProfitGenerations ?? 0,
        liveEligibleProfitGenerations: route.liveEligibleProfitGenerations ?? 0,
        executeDecisionGenerations: route.executeDecisionGenerations ?? 0,
        reviewDecisionGenerations: route.reviewDecisionGenerations ?? 0,
        skipDecisionGenerations: route.skipDecisionGenerations ?? 0,
        dispatchReservedLiveEligibleGenerations:
          route.dispatchReservedLiveEligibleGenerations ?? 0,
        insufficientLiquidityGenerations: route.insufficientLiquidityGenerations ?? 0,
        latestNetProfitPercent: route.latestNetProfitPercent ?? null,
        bestNetProfitPercent: route.bestNetProfitPercent ?? null,
        retainedNetProfitPercents: (route.retainedNetProfitPercents ?? [])
          .slice(-this.maximumSamplesPerDistribution),
        retainedEstimatedFeeImpactPercents: (route.retainedEstimatedFeeImpactPercents ?? [])
          .slice(-this.maximumSamplesPerDistribution),
      });
      this.generationKeySets.set(route.routeKey,
        new Set(route.generationKeys.slice(-this.maximumGenerationKeysPerRoute)));
    }
  }

  private validateConfiguration(): void {
    const values = [this.maximumRoutes, this.maximumGenerationKeysPerRoute, this.persistenceIntervalMs,
      this.maximumPersistedSnapshots, this.minimumExecutionGradeGenerations, this.minimumObservationSpanMs];
    values.push(this.maximumSamplesPerDistribution);
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new Error("Strategy #1 pilot evidence configuration is invalid.");
    }
  }
}

export function isExactStrategyOnePilotRoute(input: {
  readonly market?: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}): boolean {
  const buy = input.buyExchange.trim().toLowerCase();
  const sell = input.sellExchange.trim().toLowerCase();
  const market = input.market?.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "") ?? "";
  return buy !== sell && (
    (buy === "binance" && sell === "bybit") ||
    (buy === "bybit" && sell === "binance") ||
    isStrategyOneTinyLiveBasketRoute({
      market,
      buyExchange: buy,
      sellExchange: sell,
    })
  );
}

export function assessStrategyOnePilotFreshness(input: {
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly buyTimestamp: number;
  readonly sellTimestamp: number;
  readonly quotesAreFresh: boolean;
  readonly usedLastPriceFallback: boolean;
  readonly now: number;
}): {readonly passed: boolean; readonly buyAgeMs: number; readonly sellAgeMs: number;
  readonly skewMs: number; readonly reasons: readonly StrategyOnePilotFreshnessRejection[]} {
  const buyAgeMs = input.now - input.buyTimestamp;
  const sellAgeMs = input.now - input.sellTimestamp;
  const skewMs = Math.abs(input.buyTimestamp - input.sellTimestamp);
  const reasons: StrategyOnePilotFreshnessRejection[] = [];
  if (input.usedLastPriceFallback || !input.quotesAreFresh) reasons.push("FALLBACK_QUOTE");
  if (!validTime(input.buyTimestamp) || !validTime(input.sellTimestamp) ||
    buyAgeMs < 0 || sellAgeMs < 0) reasons.push("INVALID_QUOTE_TIMESTAMP");
  if (buyAgeMs > STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS) reasons.push("BUY_BOOK_STALE");
  if (sellAgeMs > STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS) reasons.push("SELL_BOOK_STALE");
  if (skewMs > STRATEGY_ONE_PILOT_MAXIMUM_BOOK_SKEW_MS) reasons.push("BOOK_TIMESTAMP_SKEW");
  return deepFreeze({passed: reasons.length === 0, buyAgeMs, sellAgeMs, skewMs, reasons: [...new Set(reasons)]});
}

export function assessStrategyOnePilotDispatchReservedFreshness(input: {
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly buyTimestamp: number;
  readonly sellTimestamp: number;
  readonly quotesAreFresh: boolean;
  readonly usedLastPriceFallback: boolean;
  readonly now: number;
}): ReturnType<typeof assessStrategyOnePilotFreshness> {
  const absolute = assessStrategyOnePilotFreshness(input);
  const reasons = [...absolute.reasons];
  if (
    absolute.buyAgeMs > STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS
  ) reasons.push("BUY_BOOK_STALE");
  if (
    absolute.sellAgeMs > STRATEGY_ONE_PILOT_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS
  ) reasons.push("SELL_BOOK_STALE");
  return deepFreeze({
    ...absolute,
    passed: reasons.length === 0,
    reasons: [...new Set(reasons)],
  });
}

function classifyFreshness(opportunity: ArbitrageOpportunity, observedAt: number): StrategyOnePilotFreshnessRejection[] {
  const reasons: StrategyOnePilotFreshnessRejection[] = [];
  if (opportunity.decision !== "EXECUTE") reasons.push("NON_EXECUTE_DECISION");
  if (!opportunity.pair.buy.executable || !opportunity.pair.sell.executable) reasons.push("NON_EXECUTABLE_QUOTE");
  reasons.push(...assessStrategyOnePilotFreshness({
    buyExchange: opportunity.pair.buy.exchange,
    sellExchange: opportunity.pair.sell.exchange,
    buyTimestamp: opportunity.pair.buy.timestamp,
    sellTimestamp: opportunity.pair.sell.timestamp,
    quotesAreFresh: opportunity.quotesAreFresh,
    usedLastPriceFallback: opportunity.usedLastPriceFallback,
    now: observedAt,
  }).reasons);
  return [...new Set(reasons)];
}

function isExactPilotRoute(opportunity: ArbitrageOpportunity): boolean {
  return isExactStrategyOnePilotRoute({
    market: opportunity.pair.market,
    buyExchange: opportunity.pair.buy.exchange,
    sellExchange: opportunity.pair.sell.exchange,
  });
}

function normalizeMarket(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (!normalized || normalized.length > 40) throw new Error("Strategy #1 pilot market is invalid.");
  return normalized;
}

function normalizePilotExchange(value: string): StrategyOnePilotExchange {
  const normalized = value.trim().toLowerCase();
  if (normalized !== "binance" && normalized !== "bybit" && normalized !== "coindcx") throw new Error("Strategy #1 pilot venue is invalid.");
  return normalized;
}

function pilotGenerationIdentity(input: {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly buyTimestamp: number;
  readonly sellTimestamp: number;
}): string {
  return `${normalizeMarket(input.market)}:${normalizePilotExchange(input.buyExchange)}->${normalizePilotExchange(
    input.sellExchange,
  )}:${input.buyTimestamp}:${input.sellTimestamp}`;
}

function createRejectionCounts(): Record<StrategyOnePilotFreshnessRejection, number> {
  return Object.fromEntries(REJECTIONS.map((reason) => [reason, 0])) as Record<StrategyOnePilotFreshnessRejection, number>;
}

function isPersistedSnapshot(value: unknown): value is PersistedSnapshot {
  if (!isRecord(value) || value.schemaVersion !== "112.0" || !validTimeNumber(value.savedAt) || !Array.isArray(value.routes)) return false;
  const counters = [value.snapshotsObserved, value.opportunitiesObserved, value.excludedVenueOpportunities,
    value.eligibleVenueOpportunities, value.invalidObservationsRejected, value.observerFailures];
  return counters.every(nonNegativeInteger) && validOptionalCounter(value.routeBookObservationsObserved) &&
    value.routes.every(isPersistedRoute);
}

function isPersistedRoute(value: unknown): value is PersistedRoute {
  const rejectionCounts = isRecord(value) ? value.rejectionCounts : null;
  if (!isRecord(value) || typeof value.routeKey !== "string" || typeof value.market !== "string" ||
    !isPilotExchange(value.buyExchange) || !isPilotExchange(value.sellExchange) ||
    !validTimeNumber(value.firstUniqueGenerationAt) || !validTimeNumber(value.lastUniqueGenerationAt) ||
    !(value.firstExecutionGradeGenerationAt === null || validTimeNumber(value.firstExecutionGradeGenerationAt)) ||
    !(value.lastExecutionGradeGenerationAt === null || validTimeNumber(value.lastExecutionGradeGenerationAt)) ||
    !Array.isArray(value.generationKeys) || !value.generationKeys.every((key) => typeof key === "string") ||
    !isRecord(rejectionCounts) || !validOptionalSamples(value.executionGradeBuyAgesMs) ||
    !validOptionalSamples(value.executionGradeSellAgesMs) ||
    !validOptionalTime(value.firstDispatchReservedGenerationAt) ||
    !validOptionalTime(value.lastDispatchReservedGenerationAt) ||
    !validOptionalCounter(value.dispatchReservedGenerations) ||
    !validOptionalCounter(value.dispatchReservedRejectedGenerations) ||
    !validOptionalSamples(value.dispatchReservedBuyAgesMs) ||
    !validOptionalSamples(value.dispatchReservedSellAgesMs) ||
    !validOptionalTime(value.firstEconomicsObservationAt) ||
    !validOptionalTime(value.lastEconomicsObservationAt) ||
    !validOptionalNullableFinite(value.latestNetProfitPercent) ||
    !validOptionalNullableFinite(value.bestNetProfitPercent) ||
    !validOptionalFiniteSamples(value.retainedNetProfitPercents) ||
    !validOptionalFiniteSamples(value.retainedEstimatedFeeImpactPercents)) return false;
  const counters = [value.uniqueGenerations, value.repeatedGenerationsIgnored, value.executionGradeGenerations,
    value.rejectedGenerations, value.maximumObservedBuyAgeMs, value.maximumObservedSellAgeMs, value.maximumObservedSkewMs];
  const optionalCounters = [value.economicsObservedGenerations, value.discoveredProfitGenerations,
    value.qualifiedProfitGenerations, value.liveEligibleProfitGenerations,
    value.executeDecisionGenerations, value.reviewDecisionGenerations, value.skipDecisionGenerations,
    value.dispatchReservedLiveEligibleGenerations, value.insufficientLiquidityGenerations];
  return counters.every(nonNegativeFinite) && optionalCounters.every(validOptionalCounter) &&
    REJECTIONS.every((reason) => nonNegativeInteger(rejectionCounts[reason]));
}

function validOptionalSamples(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 10_000 && value.every(nonNegativeFinite));
}

function validOptionalFiniteSamples(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 10_000 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item)));
}

function validOptionalTime(value: unknown): boolean {
  return value === undefined || value === null || validTimeNumber(value);
}

function validOptionalCounter(value: unknown): boolean {
  return value === undefined || nonNegativeInteger(value);
}

function validOptionalNullableFinite(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

function isPilotExchange(value: unknown): value is StrategyOnePilotExchange {
  return value === "binance" || value === "bybit" || value === "coindcx";
}

function validTime(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function validTimeNumber(value: unknown): value is number { return typeof value === "number" && validTime(value); }
function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function retain(values: number[], value: number, capacity: number): void {
  if (!nonNegativeFinite(value)) throw new Error("Strategy #1 pilot timing sample is invalid.");
  values.push(Number(value.toFixed(3)));
  if (values.length > capacity) values.splice(0, values.length - capacity);
}
function retainFinite(values: number[], value: number, capacity: number): void {
  if (!Number.isFinite(value)) throw new Error("Strategy #1 pilot economics sample is invalid.");
  values.push(Number(value.toFixed(6)));
  if (values.length > capacity) values.splice(0, values.length - capacity);
}
function summarize(values: readonly number[]): StrategyOnePilotTimingDistribution {
  const sorted = [...values].sort((first, second) => first - second);
  return deepFreeze({retainedSamples: sorted.length, p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95), p99Ms: percentile(sorted, 0.99), maxMs: sorted.at(-1) ?? null});
}
function summarizeEconomics(values: readonly number[]): StrategyOnePilotEconomicsDistribution {
  const sorted = [...values].sort((first, second) => first - second);
  return deepFreeze({retainedSamples: sorted.length, p50Percent: percentile(sorted, 0.5),
    p95Percent: percentile(sorted, 0.95), p99Percent: percentile(sorted, 0.99),
    maxPercent: sorted.at(-1) ?? null});
}
function percentile(sorted: readonly number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.ceil(sorted.length * ratio) - 1] ?? null;
}
function clone<T>(value: T): T { return structuredClone(value); }
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const strategyOnePilotEquivalentPaperEvidenceService =
  new StrategyOnePilotEquivalentPaperEvidenceService();
