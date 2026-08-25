import {
  resolve,
} from "node:path";

import type {
  OpportunitySnapshot,
} from "../services/OpportunityService";

import type {
  AuthenticatedPrivateFillTimingObservation,
} from "../../execution/live/fills/AuthenticatedPrivateFillEventOwner";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import type {
  StrategyOneOrderTimeSafetyReport,
} from "./StrategyOneOrderTimeSafetyService";

export type StrategyOnePaperTimingStage =
  | "PIPELINE_START"
  | "QUEUE_READY"
  | "EXECUTION_START"
  | "EXECUTION_COMPLETE";

export type StrategyOneTimingMetric =
  | "buyQuoteAgeMs"
  | "sellQuoteAgeMs"
  | "venueQuoteAgeMs"
  | "decisionToPipelineStartMs"
  | "decisionToQueueMs"
  | "decisionToExecutionStartMs"
  | "decisionToPaperCompletionMs"
  | "lastLookEvaluationMs"
  | "lastLookToBuyDispatchMs"
  | "lastLookToSellDispatchMs"
  | "adapterResultMs"
  | "privateOrderEventTransportMs"
  | "privateFillEventTransportMs";

export interface StrategyOneTimingDistribution {
  readonly sampleCount: number;
  readonly retainedSamples: number;
  readonly firstObservedAt: number | null;
  readonly lastObservedAt: number | null;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly maxMs: number | null;
}

export interface StrategyOneRouteTimingReport {
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly firstObservedAt: number;
  readonly lastObservedAt: number;
  readonly paperSnapshots: number;
  readonly liveLastLooks: number;
  readonly liveDispatches: number;
  readonly metrics: Readonly<Record<StrategyOneTimingMetric, StrategyOneTimingDistribution>>;
  readonly calibration: {
    readonly state:
      | "COLLECTING_PUBLIC_TIMING"
      | "PUBLIC_TIMING_REVIEW_REQUIRED"
      | "COLLECTING_PRIVATE_FILL_TIMING"
      | "CALIBRATION_REVIEW_REQUIRED";
    readonly publicTimingReady: boolean;
    readonly privateFillTimingReady: boolean;
    readonly advisoryMaximumBookAgeMs: number | null;
    readonly automaticallyApplied: false;
    readonly blockers: readonly string[];
  };
}

export interface StrategyOneVenueTimingReport {
  readonly venue: string;
  readonly firstObservedAt: number;
  readonly lastObservedAt: number;
  readonly quoteAgeSamples: number;
  readonly gatewayResults: number;
  readonly privateOrderEvents: number;
  readonly privateFillEvents: number;
  readonly metrics: Readonly<Record<StrategyOneTimingMetric, StrategyOneTimingDistribution>>;
}

export interface StrategyOneExecutionTimingReport {
  readonly version: "106.0";
  readonly generatedAt: number;
  readonly running: boolean;
  readonly routesRetained: number;
  readonly venuesRetained: number;
  readonly invalidSamplesRejected: number;
  readonly observerFailures: number;
  readonly maximumRoutes: number;
  readonly maximumSamplesPerMetric: number;
  readonly maximumOpportunitiesPerSnapshot: number;
  readonly minimumRouteSampleIntervalMs: number;
  readonly persistenceIntervalMs: number;
  readonly maximumPersistedSnapshots: number;
  readonly minimumPublicSamples: number;
  readonly minimumPrivateFillSamplesPerVenue: number;
  readonly minimumObservationSpanMs: number;
  readonly routes: readonly StrategyOneRouteTimingReport[];
  readonly venues: readonly StrategyOneVenueTimingReport[];
  readonly persistence: ReturnType<JsonlSnapshotStore<PersistedSnapshot>["getDiagnostics"]>;
  readonly safety: {
    readonly evidenceOnly: true;
    readonly noOrderSubmissionAuthority: true;
    readonly noAutomaticTtlActivation: true;
    readonly restBackfillExcludedFromTransportCalibration: true;
    readonly paperEvidenceCannotClaimLiveFillLatency: true;
  };
}

export interface StrategyOneTimingEvidenceConfiguration {
  readonly filePath?: string;
  readonly maximumRoutes?: number;
  readonly maximumSamplesPerMetric?: number;
  readonly maximumOpportunitiesPerSnapshot?: number;
  readonly persistenceIntervalMs?: number;
  readonly minimumRouteSampleIntervalMs?: number;
  readonly maximumPersistedSnapshots?: number;
  readonly minimumPublicSamples?: number;
  readonly minimumPrivateFillSamplesPerVenue?: number;
  readonly minimumObservationSpanMs?: number;
  readonly minimumAdvisoryBookAgeMs?: number;
  readonly maximumAdvisoryBookAgeMs?: number;
  readonly advisorySafetyMarginMs?: number;
}

interface MutableMetric {
  totalSamples: number;
  firstObservedAt: number | null;
  lastObservedAt: number | null;
  samples: number[];
}

interface MutableRoute {
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  firstObservedAt: number;
  lastObservedAt: number;
  paperSnapshots: number;
  liveLastLooks: number;
  liveDispatches: number;
  lastStageCapturedAt: Partial<Record<StrategyOnePaperTimingStage, number>>;
  metrics: Record<StrategyOneTimingMetric, MutableMetric>;
}

interface MutableVenue {
  venue: string;
  firstObservedAt: number;
  lastObservedAt: number;
  quoteAgeSamples: number;
  gatewayResults: number;
  privateOrderEvents: number;
  privateFillEvents: number;
  metrics: Record<StrategyOneTimingMetric, MutableMetric>;
}

interface PersistedRoute extends Omit<MutableRoute, "lastStageCapturedAt"> {}
interface PersistedVenue extends MutableVenue {}
interface PersistedSnapshot {
  readonly version: "106.0";
  readonly savedAt: number;
  readonly routes: readonly PersistedRoute[];
  readonly venues: readonly PersistedVenue[];
  readonly invalidSamplesRejected: number;
  readonly observerFailures: number;
}

export type StrategyOnePrivateEventTimingInput =
  AuthenticatedPrivateFillTimingObservation;

const METRICS: readonly StrategyOneTimingMetric[] = [
  "buyQuoteAgeMs",
  "sellQuoteAgeMs",
  "venueQuoteAgeMs",
  "decisionToPipelineStartMs",
  "decisionToQueueMs",
  "decisionToExecutionStartMs",
  "decisionToPaperCompletionMs",
  "lastLookEvaluationMs",
  "lastLookToBuyDispatchMs",
  "lastLookToSellDispatchMs",
  "adapterResultMs",
  "privateOrderEventTransportMs",
  "privateFillEventTransportMs",
];

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "live",
  "strategy-one-execution-timing.jsonl",
);

/**
 * Bounded V106 evidence owner. PAPER pipeline timing and authenticated private
 * event transport timing remain explicitly separate. It can suggest a quote
 * age for later review, but it cannot activate a TTL or submit an order.
 */
export class StrategyOneExecutionTimingEvidenceService {
  private readonly routes = new Map<string, MutableRoute>();
  private readonly venues = new Map<string, MutableVenue>();
  private readonly store: JsonlSnapshotStore<PersistedSnapshot>;
  private readonly maximumRoutes: number;
  private readonly maximumSamplesPerMetric: number;
  private readonly maximumOpportunitiesPerSnapshot: number;
  private readonly persistenceIntervalMs: number;
  private readonly minimumRouteSampleIntervalMs: number;
  private readonly maximumPersistedSnapshots: number;
  private readonly minimumPublicSamples: number;
  private readonly minimumPrivateFillSamplesPerVenue: number;
  private readonly minimumObservationSpanMs: number;
  private readonly minimumAdvisoryBookAgeMs: number;
  private readonly maximumAdvisoryBookAgeMs: number;
  private readonly advisorySafetyMarginMs: number;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private persistedSnapshots = 0;
  private dirty = false;
  private invalidSamplesRejected = 0;
  private observerFailures = 0;

  /*
   * Percentile reports are derived entirely from the mutable evidence above.
   * Building one sorts every retained metric for every route and venue.  A
   * Tiny-LIVE preview followed immediately by authorization therefore used to
   * rebuild the same immutable report twice even though the single-threaded
   * event loop cannot mutate evidence between those synchronous reads.
   *
   * Keep the frozen derived report until an evidence owner mutates state.
   * generatedAt and persistence diagnostics are overlaid on every read so
   * callers never receive stale action-time or durability metadata.
   */
  private cachedReport:
    StrategyOneExecutionTimingReport | null =
      null;

  constructor(configuration: StrategyOneTimingEvidenceConfiguration = {}) {
    this.maximumRoutes = configuration.maximumRoutes ?? 128;
    this.maximumSamplesPerMetric = configuration.maximumSamplesPerMetric ?? 512;
    this.maximumOpportunitiesPerSnapshot = configuration.maximumOpportunitiesPerSnapshot ?? 32;
    this.persistenceIntervalMs = configuration.persistenceIntervalMs ?? 300_000;
    this.minimumRouteSampleIntervalMs = configuration.minimumRouteSampleIntervalMs ?? 5_000;
    this.maximumPersistedSnapshots = configuration.maximumPersistedSnapshots ?? 2;
    this.minimumPublicSamples = configuration.minimumPublicSamples ?? 512;
    this.minimumPrivateFillSamplesPerVenue = configuration.minimumPrivateFillSamplesPerVenue ?? 30;
    this.minimumObservationSpanMs = configuration.minimumObservationSpanMs ?? 60 * 60 * 1_000;
    this.minimumAdvisoryBookAgeMs = configuration.minimumAdvisoryBookAgeMs ?? 25;
    this.maximumAdvisoryBookAgeMs = configuration.maximumAdvisoryBookAgeMs ?? 250;
    this.advisorySafetyMarginMs = configuration.advisorySafetyMarginMs ?? 10;
    this.validateConfiguration();
    this.store = new JsonlSnapshotStore({filePath: configuration.filePath ?? DEFAULT_FILE, isPayload: isPersistedSnapshot});
    const snapshots = this.store.readAll();
    this.persistedSnapshots = snapshots.length;
    const latest = snapshots.at(-1);
    if (latest) this.restore(latest);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.invalidateReportCache();
    this.timer = setInterval(() => this.persistSafely(Date.now()), this.persistenceIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persistSafely(Date.now());
    this.running = false;
    this.invalidateReportCache();
  }

  observePaperStage(snapshot: OpportunitySnapshot, stage: StrategyOnePaperTimingStage, observedAt = Date.now()): void {
    this.invalidateReportCache();

    if (!validTime(observedAt) || !validTime(snapshot.generatedAt) || observedAt < snapshot.generatedAt) {
      this.invalidSamplesRejected += 1;
      return;
    }

    const observedRouteKeys = new Set<string>();
    for (const book of this.selectPaperStageBooks(snapshot, stage)) {
      try {
        const routeKey = timingRouteKey(
          book.market,
          book.buyExchange,
          book.sellExchange,
        );
        observedRouteKeys.add(routeKey);
        if (!this.observePaperRouteStage({
          market: book.market,
          buyExchange: book.buyExchange,
          sellExchange: book.sellExchange,
          buyTimestamp: book.buyTimestamp,
          sellTimestamp: book.sellTimestamp,
        }, snapshot.generatedAt, stage, observedAt)) {
          this.invalidSamplesRejected += 1;
        }
      } catch {
        this.invalidSamplesRejected += 1;
      }
    }

    const opportunities = snapshot.opportunities
      .filter((item) => item.decision === "EXECUTE" && item.quotesAreFresh && !item.usedLastPriceFallback)
      .slice(0, this.maximumOpportunitiesPerSnapshot);
    for (const opportunity of opportunities) {
      try {
        const routeKey = timingRouteKey(
          opportunity.pair.market,
          opportunity.pair.buy.exchange,
          opportunity.pair.sell.exchange,
        );
        if (observedRouteKeys.has(routeKey)) {
          continue;
        }
        if (!this.observePaperRouteStage({
          market: opportunity.pair.market,
          buyExchange: opportunity.pair.buy.exchange,
          sellExchange: opportunity.pair.sell.exchange,
          buyTimestamp: opportunity.pair.buy.timestamp,
          sellTimestamp: opportunity.pair.sell.timestamp,
        }, snapshot.generatedAt, stage, observedAt)) {
          this.invalidSamplesRejected += 1;
        }
      } catch {
        this.invalidSamplesRejected += 1;
      }
    }
  }

  private selectPaperStageBooks(
    snapshot: OpportunitySnapshot,
    stage: StrategyOnePaperTimingStage,
  ): readonly NonNullable<OpportunitySnapshot["pilotRouteBooks"]>[number][] {
    const books = [...(snapshot.pilotRouteBooks ?? [])];

    if (stage !== "PIPELINE_START") {
      const pipelineStarted = books.filter((book) => {
        try {
          const route = this.routes.get(timingRouteKey(
            book.market,
            book.buyExchange,
            book.sellExchange,
          ));
          return (route?.lastStageCapturedAt.PIPELINE_START ?? 0) >= snapshot.generatedAt;
        } catch {
          return false;
        }
      });
      if (pipelineStarted.length > 0) {
        return pipelineStarted.slice(0, this.maximumOpportunitiesPerSnapshot);
      }
    }

    return books
      .map((book, index) => {
        try {
          const route = this.routes.get(timingRouteKey(
            book.market,
            book.buyExchange,
            book.sellExchange,
          ));
          if (!route) return {book, index, tier: 1, progress: 0, lastObservedAt: 0};
          const observationSpanMs = Math.max(0, route.lastObservedAt - route.firstObservedAt);
          const ready = route.paperSnapshots >= this.minimumPublicSamples &&
            observationSpanMs >= this.minimumObservationSpanMs;
          const progress = Math.min(route.paperSnapshots / this.minimumPublicSamples, 1) +
            Math.min(observationSpanMs / this.minimumObservationSpanMs, 1);
          return {book, index, tier: ready ? 0 : 2, progress, lastObservedAt: route.lastObservedAt};
        } catch {
          return {book, index, tier: -1, progress: 0, lastObservedAt: 0};
        }
      })
      .sort((first, second) =>
        second.tier - first.tier ||
        (first.tier === 2
          ? second.progress - first.progress
          : first.tier === 0
            ? first.lastObservedAt - second.lastObservedAt
            : first.index - second.index) ||
        first.index - second.index)
      .slice(0, this.maximumOpportunitiesPerSnapshot)
      .map(({book}) => book);
  }

  observeLastLook(report: StrategyOneOrderTimeSafetyReport, observedAt = Date.now()): void {
    this.invalidateReportCache();

    try {
      const values = [report.evaluationDurationMs, report.buyBookAgeMs, report.sellBookAgeMs]
        .filter((value): value is number => value !== null);
      if (!validTime(observedAt) || values.some((value) => !validDuration(value))) {
        this.invalidSamplesRejected += 1;
        return;
      }
      const route = this.ensureRouteIdentity(report.market, report.buyExchange, report.sellExchange, observedAt);
      route.liveLastLooks += 1;
      route.lastObservedAt = Math.max(route.lastObservedAt, observedAt);
      this.record(route.metrics.lastLookEvaluationMs, report.evaluationDurationMs, observedAt);
      if (report.buyBookAgeMs !== null) this.record(route.metrics.buyQuoteAgeMs, report.buyBookAgeMs, observedAt);
      if (report.sellBookAgeMs !== null) this.record(route.metrics.sellQuoteAgeMs, report.sellBookAgeMs, observedAt);
      this.dirty = true;
    } catch {
      this.invalidSamplesRejected += 1;
    }
  }

  observeLiveDispatch(input: {readonly lastLook: StrategyOneOrderTimeSafetyReport; readonly buyDispatchAt: number;
    readonly sellDispatchAt: number}): void {
    this.invalidateReportCache();

    try {
      const observedAt = Math.max(input.buyDispatchAt, input.sellDispatchAt);
      const buyDuration = input.buyDispatchAt - input.lastLook.evaluatedAt;
      const sellDuration = input.sellDispatchAt - input.lastLook.evaluatedAt;
      if (!validTime(observedAt) || !validDuration(buyDuration) || !validDuration(sellDuration)) {
        this.invalidSamplesRejected += 1;
        return;
      }
      const route = this.ensureRouteIdentity(input.lastLook.market, input.lastLook.buyExchange,
        input.lastLook.sellExchange, observedAt);
      route.liveDispatches += 1;
      route.lastObservedAt = Math.max(route.lastObservedAt, observedAt);
      this.record(route.metrics.lastLookToBuyDispatchMs, buyDuration, observedAt);
      this.record(route.metrics.lastLookToSellDispatchMs, sellDuration, observedAt);
      this.dirty = true;
    } catch {
      this.invalidSamplesRejected += 1;
    }
  }

  observeGatewayResult(input: {readonly venue: string; readonly market: string; readonly dispatchedAt: number;
    readonly resultAt: number}): void {
    this.invalidateReportCache();

    try {
      normalizeMarket(input.market);
      const duration = input.resultAt - input.dispatchedAt;
      if (!validTime(input.resultAt) || !validDuration(duration)) {
        this.invalidSamplesRejected += 1;
        return;
      }
      const venue = this.ensureVenue(input.venue, input.resultAt);
      venue.gatewayResults += 1;
      venue.lastObservedAt = Math.max(venue.lastObservedAt, input.resultAt);
      this.record(venue.metrics.adapterResultMs, duration, input.resultAt);
      this.dirty = true;
    } catch {
      this.invalidSamplesRejected += 1;
    }
  }

  observePrivateEvent(input: StrategyOnePrivateEventTimingInput): void {
    if (input.source === "REST_BACKFILL") return;
    this.invalidateReportCache();

    try {
      const orderTransport = input.receivedAt - input.event.sourceEventAt;
      const fillTransport = input.event.kind === "FILL" ? input.receivedAt - input.event.executedAt : null;
      if (!validTime(input.receivedAt) || !validDuration(orderTransport) ||
        (fillTransport !== null && !validDuration(fillTransport))) {
        this.invalidSamplesRejected += 1;
        return;
      }
      const venue = this.ensureVenue(input.binding.venue, input.receivedAt);
      venue.privateOrderEvents += 1;
      venue.lastObservedAt = Math.max(venue.lastObservedAt, input.receivedAt);
      this.record(venue.metrics.privateOrderEventTransportMs, orderTransport, input.receivedAt);
      if (input.event.kind === "FILL") {
        venue.privateFillEvents += 1;
        this.record(venue.metrics.privateFillEventTransportMs, fillTransport as number, input.receivedAt);
      }
      this.dirty = true;
    } catch {
      this.invalidSamplesRejected += 1;
    }
  }

  recordObserverFailure(): void {
    this.observerFailures += 1;
    this.dirty = true;
    this.invalidateReportCache();
  }

  getReport(now = Date.now()): StrategyOneExecutionTimingReport {
    if (this.cachedReport) {
      return freeze({
        ...this.cachedReport,
        generatedAt: now,
        running: this.running,
        persistence: this.store.getDiagnostics(),
      });
    }

    const venueReports = [...this.venues.values()].map((venue) => this.venueReport(venue));
    const venueByName = new Map(venueReports.map((venue) => [venue.venue, venue]));
    const routes = [...this.routes.values()].map((route) => this.routeReport(route, venueByName))
      .sort((first, second) => second.lastObservedAt - first.lastObservedAt || first.routeKey.localeCompare(second.routeKey));
    const report:
      StrategyOneExecutionTimingReport =
      freeze({version: "106.0", generatedAt: now, running: this.running, routesRetained: routes.length,
      venuesRetained: venueReports.length, invalidSamplesRejected: this.invalidSamplesRejected,
      observerFailures: this.observerFailures, maximumRoutes: this.maximumRoutes,
      maximumSamplesPerMetric: this.maximumSamplesPerMetric,
      maximumOpportunitiesPerSnapshot: this.maximumOpportunitiesPerSnapshot,
      minimumRouteSampleIntervalMs: this.minimumRouteSampleIntervalMs,
      persistenceIntervalMs: this.persistenceIntervalMs,
      maximumPersistedSnapshots: this.maximumPersistedSnapshots,
      minimumPublicSamples: this.minimumPublicSamples,
      minimumPrivateFillSamplesPerVenue: this.minimumPrivateFillSamplesPerVenue,
      minimumObservationSpanMs: this.minimumObservationSpanMs, routes,
      venues: venueReports.sort((first, second) => first.venue.localeCompare(second.venue)),
      persistence: this.store.getDiagnostics(), safety: {evidenceOnly: true,
        noOrderSubmissionAuthority: true, noAutomaticTtlActivation: true,
        restBackfillExcludedFromTransportCalibration: true, paperEvidenceCannotClaimLiveFillLatency: true}});

    this.cachedReport = report;
    return report;
  }

  private invalidateReportCache(): void {
    this.cachedReport = null;
  }

  private routeReport(route: MutableRoute, venues: ReadonlyMap<string, StrategyOneVenueTimingReport>): StrategyOneRouteTimingReport {
    const metrics = summarizeMetrics(route.metrics);
    const publicSpan = route.lastObservedAt - route.firstObservedAt;
    const publicTimingReady = route.paperSnapshots >= this.minimumPublicSamples && publicSpan >= this.minimumObservationSpanMs &&
      metrics.buyQuoteAgeMs.sampleCount >= this.minimumPublicSamples &&
      metrics.sellQuoteAgeMs.sampleCount >= this.minimumPublicSamples &&
      metrics.decisionToPipelineStartMs.sampleCount >= this.minimumPublicSamples;
    const buyVenue = venues.get(route.buyExchange); const sellVenue = venues.get(route.sellExchange);
    const privateFillTimingReady = [buyVenue, sellVenue].every((venue) => {
      const metric = venue?.metrics.privateFillEventTransportMs;
      return venue !== undefined && metric !== undefined &&
        venue.privateFillEvents >= this.minimumPrivateFillSamplesPerVenue &&
        metric.firstObservedAt !== null && metric.lastObservedAt !== null &&
        metric.lastObservedAt - metric.firstObservedAt >= this.minimumObservationSpanMs;
    });
    const blockers: string[] = [];
    if (!publicTimingReady) blockers.push(`Need ${this.minimumPublicSamples} route PAPER timing samples across ${this.minimumObservationSpanMs} ms.`);
    if (!buyVenue || buyVenue.privateFillEvents < this.minimumPrivateFillSamplesPerVenue) blockers.push(
      `${route.buyExchange} needs ${this.minimumPrivateFillSamplesPerVenue} authenticated WebSocket fill-timing samples.`);
    if (!sellVenue || sellVenue.privateFillEvents < this.minimumPrivateFillSamplesPerVenue) blockers.push(
      `${route.sellExchange} needs ${this.minimumPrivateFillSamplesPerVenue} authenticated WebSocket fill-timing samples.`);
    let advisoryMaximumBookAgeMs: number | null = null;
    if (publicTimingReady) {
      const required = Math.ceil(Math.max(metrics.buyQuoteAgeMs.p99Ms ?? Number.POSITIVE_INFINITY,
        metrics.sellQuoteAgeMs.p99Ms ?? Number.POSITIVE_INFINITY,
        (metrics.decisionToPipelineStartMs.p99Ms ?? Number.POSITIVE_INFINITY) + this.advisorySafetyMarginMs,
        this.minimumAdvisoryBookAgeMs));
      if (Number.isSafeInteger(required) && required <= this.maximumAdvisoryBookAgeMs) advisoryMaximumBookAgeMs = required;
      else blockers.push(`Observed P99 timing cannot fit the ${this.maximumAdvisoryBookAgeMs} ms advisory ceiling.`);
    }
    const state = !publicTimingReady ? "COLLECTING_PUBLIC_TIMING"
      : advisoryMaximumBookAgeMs === null ? "PUBLIC_TIMING_REVIEW_REQUIRED"
        : !privateFillTimingReady ? "COLLECTING_PRIVATE_FILL_TIMING" : "CALIBRATION_REVIEW_REQUIRED";
    return freeze({routeKey: route.routeKey, market: route.market, buyExchange: route.buyExchange,
      sellExchange: route.sellExchange, firstObservedAt: route.firstObservedAt, lastObservedAt: route.lastObservedAt,
      paperSnapshots: route.paperSnapshots, liveLastLooks: route.liveLastLooks, liveDispatches: route.liveDispatches,
      metrics, calibration: {state, publicTimingReady, privateFillTimingReady, advisoryMaximumBookAgeMs,
        automaticallyApplied: false, blockers: [...new Set(blockers)]}});
  }

  private venueReport(venue: MutableVenue): StrategyOneVenueTimingReport {
    return freeze({venue: venue.venue, firstObservedAt: venue.firstObservedAt, lastObservedAt: venue.lastObservedAt,
      quoteAgeSamples: venue.quoteAgeSamples, gatewayResults: venue.gatewayResults,
      privateOrderEvents: venue.privateOrderEvents, privateFillEvents: venue.privateFillEvents,
      metrics: summarizeMetrics(venue.metrics)});
  }

  private recordVenueQuoteAge(name: string, value: number, observedAt: number): void {
    const venue = this.ensureVenue(name, observedAt); venue.quoteAgeSamples += 1;
    this.record(venue.metrics.venueQuoteAgeMs, value, observedAt); venue.lastObservedAt = Math.max(venue.lastObservedAt, observedAt);
  }

  private observePaperRouteStage(
    input: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
      readonly buyTimestamp: number;
      readonly sellTimestamp: number;
    },
    generatedAt: number,
    stage: StrategyOnePaperTimingStage,
    observedAt: number,
  ): boolean {
    const stageDuration = observedAt - generatedAt;
    const buyQuoteAge = observedAt - input.buyTimestamp;
    const sellQuoteAge = observedAt - input.sellTimestamp;
    const values = stage === "PIPELINE_START"
      ? [stageDuration, buyQuoteAge, sellQuoteAge]
      : [stageDuration];
    if (values.some((value) => !validDuration(value))) return false;

    const route = this.ensureRouteIdentity(
      input.market,
      input.buyExchange,
      input.sellExchange,
      observedAt,
    );
    const lastCapturedAt = route.lastStageCapturedAt[stage];
    if (
      lastCapturedAt !== undefined &&
      observedAt - lastCapturedAt < this.minimumRouteSampleIntervalMs
    ) return true;

    route.lastStageCapturedAt[stage] = observedAt;
    route.lastObservedAt = Math.max(route.lastObservedAt, observedAt);
    if (stage === "PIPELINE_START") {
      route.paperSnapshots += 1;
      this.record(route.metrics.buyQuoteAgeMs, buyQuoteAge, observedAt);
      this.record(route.metrics.sellQuoteAgeMs, sellQuoteAge, observedAt);
      this.record(route.metrics.decisionToPipelineStartMs, stageDuration, observedAt);
      this.recordVenueQuoteAge(input.buyExchange, buyQuoteAge, observedAt);
      this.recordVenueQuoteAge(input.sellExchange, sellQuoteAge, observedAt);
    } else {
      const metric = stage === "QUEUE_READY" ? "decisionToQueueMs"
        : stage === "EXECUTION_START" ? "decisionToExecutionStartMs"
          : "decisionToPaperCompletionMs";
      this.record(route.metrics[metric], stageDuration, observedAt);
    }
    this.dirty = true;
    return true;
  }

  private ensureRouteIdentity(marketValue: string, buyValue: string, sellValue: string, observedAt: number): MutableRoute {
    const market = normalizeMarket(marketValue); const buyExchange = normalizeVenue(buyValue);
    const sellExchange = normalizeVenue(sellValue); const routeKey = `${market}:${buyExchange}->${sellExchange}`;
    const existing = this.routes.get(routeKey); if (existing) return existing;
    if (this.routes.size >= this.maximumRoutes) {
      const leastProgressed = [...this.routes.values()].sort((first, second) => {
        const sampleProgress = Math.min(first.paperSnapshots, this.minimumPublicSamples) -
          Math.min(second.paperSnapshots, this.minimumPublicSamples);
        return sampleProgress || first.lastObservedAt - second.lastObservedAt;
      })[0];
      if (leastProgressed) this.routes.delete(leastProgressed.routeKey);
    }
    const created: MutableRoute = {routeKey, market, buyExchange, sellExchange, firstObservedAt: observedAt,
      lastObservedAt: observedAt, paperSnapshots: 0, liveLastLooks: 0, liveDispatches: 0,
      lastStageCapturedAt: {}, metrics: createMetrics()};
    this.routes.set(routeKey, created); return created;
  }

  private ensureVenue(value: string, observedAt: number): MutableVenue {
    const name = normalizeVenue(value); const existing = this.venues.get(name); if (existing) return existing;
    const created: MutableVenue = {venue: name, firstObservedAt: observedAt, lastObservedAt: observedAt,
      quoteAgeSamples: 0, gatewayResults: 0, privateOrderEvents: 0, privateFillEvents: 0,
      metrics: createMetrics()};
    this.venues.set(name, created); return created;
  }

  private record(metric: MutableMetric, value: number, observedAt: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 86_400_000 || !validTime(observedAt)) throw new Error("Invalid timing sample.");
    metric.totalSamples += 1; metric.firstObservedAt = metric.firstObservedAt ?? observedAt;
    metric.lastObservedAt = Math.max(metric.lastObservedAt ?? 0, observedAt);
    metric.samples.push(Number(value.toFixed(3)));
    if (metric.samples.length > this.maximumSamplesPerMetric) metric.samples.splice(0,
      metric.samples.length - this.maximumSamplesPerMetric);
  }

  private persistIfDirty(now: number): void {
    if (!this.dirty) return;
    const snapshot = this.snapshot(now);
    if (this.persistedSnapshots >= this.maximumPersistedSnapshots) {
      this.store.replaceAll([snapshot]); this.persistedSnapshots = 1;
    } else {
      this.store.append(snapshot); this.persistedSnapshots += 1;
    }
    this.dirty = false;
  }

  private persistSafely(now: number): void {
    try {
      this.persistIfDirty(now);
    } catch {
      this.observerFailures += 1;
      this.dirty = true;
      this.invalidateReportCache();
    }
  }

  private snapshot(now: number): PersistedSnapshot {
    return {version: "106.0", savedAt: now,
      routes: [...this.routes.values()].map((route) => {
        return {routeKey: route.routeKey, market: route.market, buyExchange: route.buyExchange,
          sellExchange: route.sellExchange, firstObservedAt: route.firstObservedAt,
          lastObservedAt: route.lastObservedAt, paperSnapshots: route.paperSnapshots,
          liveLastLooks: route.liveLastLooks, liveDispatches: route.liveDispatches,
          metrics: clone(route.metrics)};
      }),
      venues: [...this.venues.values()].map(clone), invalidSamplesRejected: this.invalidSamplesRejected,
      observerFailures: this.observerFailures};
  }

  private restore(snapshot: PersistedSnapshot): void {
    for (const route of snapshot.routes.slice(-this.maximumRoutes)) {
      this.routes.set(route.routeKey, {...clone(route), lastStageCapturedAt: {}, metrics: restoreMetrics(route.metrics,
        this.maximumSamplesPerMetric)});
    }
    for (const venue of snapshot.venues) this.venues.set(venue.venue,
      {...clone(venue), metrics: restoreMetrics(venue.metrics, this.maximumSamplesPerMetric)});
    this.invalidSamplesRejected = snapshot.invalidSamplesRejected;
    this.observerFailures = snapshot.observerFailures;
  }

  private validateConfiguration(): void {
    const integers = [this.maximumRoutes, this.maximumSamplesPerMetric, this.maximumOpportunitiesPerSnapshot,
      this.persistenceIntervalMs, this.minimumRouteSampleIntervalMs, this.maximumPersistedSnapshots, this.minimumPublicSamples,
      this.minimumPrivateFillSamplesPerVenue, this.minimumObservationSpanMs, this.minimumAdvisoryBookAgeMs,
      this.maximumAdvisoryBookAgeMs, this.advisorySafetyMarginMs];
    if (integers.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      this.minimumAdvisoryBookAgeMs > this.maximumAdvisoryBookAgeMs) {
      throw new Error("Strategy #1 timing evidence configuration is invalid.");
    }
  }
}

function createMetric(): MutableMetric { return {totalSamples: 0, firstObservedAt: null, lastObservedAt: null, samples: []}; }
function createMetrics(): Record<StrategyOneTimingMetric, MutableMetric> {
  return Object.fromEntries(METRICS.map((metric) => [metric, createMetric()])) as Record<StrategyOneTimingMetric, MutableMetric>;
}
function restoreMetrics(value: Record<StrategyOneTimingMetric, MutableMetric>, capacity: number): Record<StrategyOneTimingMetric, MutableMetric> {
  const restored = createMetrics(); for (const name of METRICS) {
    const source = value[name]; if (!source) continue;
    restored[name] = {totalSamples: source.totalSamples, firstObservedAt: source.firstObservedAt,
      lastObservedAt: source.lastObservedAt, samples: source.samples.slice(-capacity)};
  } return restored;
}
function summarizeMetrics(value: Record<StrategyOneTimingMetric, MutableMetric>): Readonly<Record<StrategyOneTimingMetric, StrategyOneTimingDistribution>> {
  return freeze(Object.fromEntries(METRICS.map((name) => [name, summarize(value[name])])) as Record<StrategyOneTimingMetric, StrategyOneTimingDistribution>);
}
function summarize(metric: MutableMetric): StrategyOneTimingDistribution {
  const sorted = [...metric.samples].sort((first, second) => first - second);
  return freeze({sampleCount: metric.totalSamples, retainedSamples: sorted.length,
    firstObservedAt: metric.firstObservedAt, lastObservedAt: metric.lastObservedAt,
    p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? null});
}
function percentile(sorted: readonly number[], ratio: number): number | null {
  if (sorted.length === 0) return null; return sorted[Math.ceil(sorted.length * ratio) - 1] ?? null;
}
function normalizeMarket(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (!normalized || normalized.length > 40) throw new Error("Timing market identity is invalid."); return normalized;
}
function normalizeVenue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,30}$/u.test(normalized)) throw new Error("Timing venue identity is invalid."); return normalized;
}
function timingRouteKey(market: string, buyExchange: string, sellExchange: string): string {
  return `${normalizeMarket(market)}:${normalizeVenue(buyExchange)}->${normalizeVenue(sellExchange)}`;
}
function validTime(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function validDuration(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 86_400_000; }
function isPersistedSnapshot(value: unknown): value is PersistedSnapshot {
  if (typeof value !== "object" || value === null) return false; const item = value as Partial<PersistedSnapshot>;
  return item.version === "106.0" && validTime(item.savedAt ?? 0) && Array.isArray(item.routes) &&
    item.routes.every(isPersistedRoute) && Array.isArray(item.venues) && item.venues.every(isPersistedVenue) &&
    nonNegativeInteger(item.invalidSamplesRejected) && nonNegativeInteger(item.observerFailures);
}
function isPersistedRoute(value: unknown): value is PersistedRoute {
  if (!isRecord(value)) return false;
  return typeof value.routeKey === "string" && typeof value.market === "string" &&
    typeof value.buyExchange === "string" && typeof value.sellExchange === "string" &&
    validTimeNumber(value.firstObservedAt) && validTimeNumber(value.lastObservedAt) &&
    nonNegativeInteger(value.paperSnapshots) && nonNegativeInteger(value.liveLastLooks) &&
    nonNegativeInteger(value.liveDispatches) && isMetrics(value.metrics);
}
function isPersistedVenue(value: unknown): value is PersistedVenue {
  if (!isRecord(value)) return false;
  return typeof value.venue === "string" && validTimeNumber(value.firstObservedAt) &&
    validTimeNumber(value.lastObservedAt) && nonNegativeInteger(value.quoteAgeSamples) &&
    nonNegativeInteger(value.gatewayResults) && nonNegativeInteger(value.privateOrderEvents) &&
    nonNegativeInteger(value.privateFillEvents) && isMetrics(value.metrics);
}
function isMetrics(value: unknown): value is Record<StrategyOneTimingMetric, MutableMetric> {
  if (!isRecord(value)) return false;
  return METRICS.every((name) => {
    const metric = value[name]; if (!isRecord(metric) || !nonNegativeInteger(metric.totalSamples) ||
      !(metric.firstObservedAt === null || validTimeNumber(metric.firstObservedAt)) ||
      !(metric.lastObservedAt === null || validTimeNumber(metric.lastObservedAt)) ||
      !Array.isArray(metric.samples) || metric.samples.length > 10_000) return false;
    return metric.samples.every((sample) => typeof sample === "number" && validDuration(sample));
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validTimeNumber(value: unknown): value is number { return typeof value === "number" && validTime(value); }
function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value);
}

export const strategyOneExecutionTimingEvidenceService = new StrategyOneExecutionTimingEvidenceService();
