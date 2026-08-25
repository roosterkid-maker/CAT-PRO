import {createHash} from "node:crypto";
import {resolve} from "node:path";

import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import {
  strategyOneExecutionTimingEvidenceService,
  type StrategyOneExecutionTimingReport,
} from "./StrategyOneExecutionTimingEvidenceService";

import {
  isExactStrategyOnePilotRoute,
  STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS,
  strategyOnePilotEquivalentPaperEvidenceService,
  type StrategyOnePilotEquivalentPaperEvidenceReport,
} from "./StrategyOnePilotEquivalentPaperEvidenceService";
import {
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
  STRATEGY_ONE_TINY_LIVE_BASKET_POLICY,
  isStrategyOneTinyLiveDynamicRoute,
} from "./StrategyOneTinyLiveBasketPolicy";

export type StrategyOneTimingCalibrationScope =
  | "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT"
  | "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH"
  | "CONTINUOUS_TINY_LIVE";

export interface StrategyOneTimingCalibrationRecord {
  readonly schemaVersion: "110.0";
  readonly timingPolicyRevision?: string;
  readonly id: string;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly status: "PROPOSED" | "APPROVED" | "REVOKED";
  readonly scope: StrategyOneTimingCalibrationScope;
  readonly maximumBookAgeMs: number;
  readonly evidenceHash: string;
  readonly evidenceGeneratedAt: number;
  readonly publicSamples: number;
  readonly privateFillSamplesBuy: number;
  readonly privateFillSamplesSell: number;
  readonly proposedAt: number;
  readonly approvedAt: number | null;
  readonly expiresAt: number | null;
  readonly revokedAt: number | null;
  readonly requiredApprovalPhrase: string;
  readonly automaticActivationAllowed: false;
  readonly liveOrderSubmissionAuthorized: false;
}

/**
 * Ephemeral action-time timing qualification for the operator-approved dynamic
 * route pool. It is recomputed from exact-route evidence on every preview and
 * authorization; it is not a per-market operator approval and grants no order
 * authority by itself.
 */
export interface StrategyOneDynamicPoolTimingQualification {
  readonly schemaVersion: "189.0";
  readonly timingPolicyRevision: string;
  readonly id: string;
  readonly routePoolId: typeof STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly source: "DYNAMIC_POOL_EXACT_ROUTE_EVIDENCE";
  readonly scope: "DYNAMIC_POOL";
  readonly maximumBookAgeMs: number;
  readonly evidenceGeneratedAt: number;
  readonly perRouteOperatorApprovalRequired: false;
  readonly liveOrderSubmissionAuthorized: false;
}

export type StrategyOneExecutionTimingQualification =
  | StrategyOneTimingCalibrationRecord
  | StrategyOneDynamicPoolTimingQualification;

interface TimingEvidencePort {
  getReport(now?: number): StrategyOneExecutionTimingReport;
}

interface PilotEquivalentEvidencePort {
  getReport(now?: number): StrategyOnePilotEquivalentPaperEvidenceReport;
}

export interface StrategyOneTimingHeadroomReview {
  readonly schemaVersion: "115.0";
  readonly generatedAt: number;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly state: "READY" | "BLOCKED";
  readonly absoluteBookAgeCeilingMs: 250;
  readonly dispatchSafetyMarginMs: number;
  readonly requiredOperationalHeadroomMs: number;
  readonly timingBasis: "TINY_LIVE_TRIGGER_BOOK_AGE";
  readonly decisionToTinyLiveTriggerP99Ms: number | null;
  readonly downstreamPaperDecisionToExecutionStartP99Ms: number | null;
  readonly decisionToExecutionStartP99Ms: number | null;
  readonly dispatchBudgetMs: number | null;
  readonly maximumBookAgeMs: number | null;
  readonly executionGradeBuyAgeP99Ms: number | null;
  readonly executionGradeSellAgeP99Ms: number | null;
  readonly executionGradeWorstAgeP99Ms: number | null;
  readonly residualOperationalHeadroomMs: number | null;
  readonly blockers: readonly string[];
  readonly safety: {
    readonly reviewOnly: true;
    readonly thresholdRelaxationAllowed: false;
    readonly automaticProposalAllowed: false;
    readonly automaticApprovalAllowed: false;
    readonly liveOrderSubmissionAuthorized: false;
  };
}

const DEFAULT_FILE = resolve(
  process.cwd(),
  "logs",
  "live",
  "strategy-one-timing-calibrations.jsonl",
);

/*
 * Controlled pilot timing profile. These reserves are fixed in code and are
 * not operator-adjustable. They only divide the existing 250 ms absolute
 * quote-age budget; they do not change action-time freshness, timestamp skew,
 * economics, inventory, depth, last-look or order-policy gates.
 */
const BOOTSTRAP_DISPATCH_SAFETY_MARGIN_MS = 5;
const MINIMUM_CALIBRATED_BOOK_AGE_MS = 25;
const REQUIRED_OPERATIONAL_HEADROOM_MS = 5;
const CONTROLLED_PILOT_TIMING_POLICY_REVISION =
  "STRATEGY_ONE_TRIGGER_SYNC_5MS_V2";
const CONTROLLED_BATCH_ATTEMPTS = 2;
const CONTROLLED_BATCH_APPROVAL_DURATION_MS = 3 * 60 * 60 * 1_000;

/**
 * Versioned review owner for route TTL evidence. A proposal never activates
 * itself. Exact operator approval is time-bounded and still grants no order
 * authority.
 */
export class StrategyOneTimingCalibrationService {
  private readonly store:
    JsonlSnapshotStore<StrategyOneTimingCalibrationRecord>;
  private readonly latest =
    new Map<string, StrategyOneTimingCalibrationRecord>();

  constructor(
    private readonly evidence: TimingEvidencePort =
      strategyOneExecutionTimingEvidenceService,
    filePath = DEFAULT_FILE,
    private readonly maximumApprovalDurationMs = CONTROLLED_BATCH_APPROVAL_DURATION_MS,
    private readonly pilotEquivalentEvidence: PilotEquivalentEvidencePort =
      strategyOnePilotEquivalentPaperEvidenceService,
  ) {
    if (
      !Number.isSafeInteger(maximumApprovalDurationMs) ||
      maximumApprovalDurationMs <= 0 ||
      maximumApprovalDurationMs > 24 * 60 * 60 * 1_000
    ) {
      throw new Error("Strategy #1 timing approval duration is invalid.");
    }

    this.store = new JsonlSnapshotStore({
      filePath,
      isPayload: isRecord,
    });

    for (const record of this.store.readAll()) {
      this.latest.set(record.id, freeze(clone(record)));
    }
  }

  reviewHeadroom(
    input: {
      readonly market: string;
      readonly buyExchange: string;
      readonly sellExchange: string;
    },
    now = Date.now(),
  ): StrategyOneTimingHeadroomReview {
    validateTime(now);
    const market = normalizeMarket(input.market);
    const buyExchange = normalizeExchange(input.buyExchange);
    const sellExchange = normalizeExchange(input.sellExchange);
    const routeKey = `${market}:${buyExchange}->${sellExchange}`;
    const blockers: string[] = [];

    if (!isExactStrategyOnePilotRoute({market, buyExchange, sellExchange})) {
      blockers.push(
        "Timing headroom review is restricted to an explicitly audited Strategy #1 SPOT pilot lane.",
      );
    }

    const report = this.evidence.getReport(now);
    const pilotReport = this.pilotEquivalentEvidence.getReport(now);
    const route = report.routes.find((item) =>
      item.market === market &&
      item.buyExchange === buyExchange &&
      item.sellExchange === sellExchange);
    const pilotRoute = pilotReport.routes.find((item) =>
      item.market === market &&
      item.buyExchange === buyExchange &&
      item.sellExchange === sellExchange);

    if (!route) {
      blockers.push("Route-specific Strategy #1 public timing evidence is unavailable.");
    } else if (!route.calibration.publicTimingReady) {
      blockers.push(
        `Public timing evidence is not mature: ${route.calibration.blockers.join(" | ")}`,
      );
    }

    if (!pilotRoute) {
      blockers.push("Exact pilot-equivalent book-generation evidence is unavailable.");
    } else if (!pilotRoute.dispatchReserved.calibration.ready) {
      blockers.push(
        `Dispatch-reserved pilot freshness evidence is not mature: ${pilotRoute.dispatchReserved.calibration.blockers.join(" | ")}`,
      );
    }

    appendIntegrityBlockers(
      blockers,
      "Public timing",
      report.observerFailures,
      report.persistence,
    );
    appendIntegrityBlockers(
      blockers,
      "Pilot-equivalent freshness",
      pilotReport.observerFailures,
      pilotReport.persistence,
    );

    const decisionToTinyLiveTriggerP99 =
      route?.metrics.decisionToPipelineStartMs.p99Ms ?? null;
    const downstreamPaperDecisionToExecutionStartP99 =
      route?.metrics.decisionToExecutionStartMs.p99Ms ?? null;
    const pilotBuyP99 =
      pilotRoute?.dispatchReserved.buyAgeMs.p99Ms ?? null;
    const pilotSellP99 =
      pilotRoute?.dispatchReserved.sellAgeMs.p99Ms ?? null;

    if (
      decisionToTinyLiveTriggerP99 === null ||
      pilotBuyP99 === null ||
      pilotSellP99 === null
    ) {
      blockers.push("Execution-grade timing distributions are incomplete.");
    }

    /*
     * dispatchReserved BUY/SELL ages are captured at the exact PIPELINE_START
     * timestamp immediately before Tiny-LIVE observeSnapshot() is invoked.
     * Therefore they already contain snapshot-to-trigger latency. Adding the
     * later PAPER decision-to-execution duration here double-counted code time
     * that the Tiny-LIVE path does not wait for. Keep that downstream duration
     * as diagnostics only and reserve the fixed post-trigger safety margin.
     */
    const dispatchBudgetMs =
      decisionToTinyLiveTriggerP99 === null
        ? null
        : BOOTSTRAP_DISPATCH_SAFETY_MARGIN_MS;
    const maximumBookAgeMs =
      dispatchBudgetMs === null ||
      dispatchBudgetMs >= STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS
        ? null
        : Math.max(
            MINIMUM_CALIBRATED_BOOK_AGE_MS,
            STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS - dispatchBudgetMs,
          );
    const worstAgeP99Ms =
      pilotBuyP99 === null ||
      pilotSellP99 === null
        ? null
        : Math.max(
            pilotBuyP99,
            pilotSellP99,
          );
    const residualOperationalHeadroomMs =
      maximumBookAgeMs === null ||
      worstAgeP99Ms === null
        ? null
        : maximumBookAgeMs - worstAgeP99Ms;

    if (
      dispatchBudgetMs !== null &&
      dispatchBudgetMs >= STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS
    ) {
      blockers.push("Code-side dispatch timing leaves no safe pilot quote-age budget.");
    }

    if (
      residualOperationalHeadroomMs !== null &&
      residualOperationalHeadroomMs < REQUIRED_OPERATIONAL_HEADROOM_MS
    ) {
      blockers.push(
        `Execution-grade quote P99 leaves ${residualOperationalHeadroomMs} ms operational headroom; at least ${REQUIRED_OPERATIONAL_HEADROOM_MS} ms is required.`,
      );
    }

    return freeze({
      schemaVersion: "115.0" as const,
      generatedAt: now,
      routeKey,
      market,
      buyExchange,
      sellExchange,
      state: blockers.length === 0 ? "READY" as const : "BLOCKED" as const,
      absoluteBookAgeCeilingMs: STRATEGY_ONE_PILOT_MAXIMUM_BOOK_AGE_MS,
      dispatchSafetyMarginMs: BOOTSTRAP_DISPATCH_SAFETY_MARGIN_MS,
      requiredOperationalHeadroomMs: REQUIRED_OPERATIONAL_HEADROOM_MS,
      timingBasis: "TINY_LIVE_TRIGGER_BOOK_AGE" as const,
      decisionToTinyLiveTriggerP99Ms: decisionToTinyLiveTriggerP99,
      downstreamPaperDecisionToExecutionStartP99Ms:
        downstreamPaperDecisionToExecutionStartP99,
      decisionToExecutionStartP99Ms:
        downstreamPaperDecisionToExecutionStartP99,
      dispatchBudgetMs,
      maximumBookAgeMs,
      executionGradeBuyAgeP99Ms: pilotBuyP99,
      executionGradeSellAgeP99Ms: pilotSellP99,
      executionGradeWorstAgeP99Ms: worstAgeP99Ms,
      residualOperationalHeadroomMs,
      blockers: [...new Set(blockers)],
      safety: {
        reviewOnly: true as const,
        thresholdRelaxationAllowed: false as const,
        automaticProposalAllowed: false as const,
        automaticApprovalAllowed: false as const,
        liveOrderSubmissionAuthorized: false as const,
      },
    });
  }

  getDynamicPoolRouteQualification(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
    readonly now?: number;
  }): StrategyOneDynamicPoolTimingQualification | null {
    const now = input.now ?? Date.now();
    validateTime(now);
    const route = {
      market: normalizeMarket(input.market),
      buyExchange: normalizeExchange(input.buyExchange),
      sellExchange: normalizeExchange(input.sellExchange),
    };

    if (!isStrategyOneTinyLiveDynamicRoute(route)) {
      return null;
    }

    const headroom = this.reviewHeadroom(route, now);

    if (
      headroom.state !== "READY" ||
      headroom.maximumBookAgeMs === null
    ) {
      return null;
    }

    const id = `dynamic-timing-${hash({
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      routeKey: headroom.routeKey,
      timingPolicyRevision: CONTROLLED_PILOT_TIMING_POLICY_REVISION,
      maximumBookAgeMs: headroom.maximumBookAgeMs,
    }).slice(0, 32)}`;

    return freeze({
      schemaVersion: "189.0" as const,
      timingPolicyRevision: CONTROLLED_PILOT_TIMING_POLICY_REVISION,
      id,
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      routeKey: headroom.routeKey,
      ...route,
      source: "DYNAMIC_POOL_EXACT_ROUTE_EVIDENCE" as const,
      scope: "DYNAMIC_POOL" as const,
      maximumBookAgeMs: headroom.maximumBookAgeMs,
      evidenceGeneratedAt: headroom.generatedAt,
      perRouteOperatorApprovalRequired: false as const,
      liveOrderSubmissionAuthorized: false as const,
    });
  }

  propose(
    routeKeyValue: string,
    now = Date.now(),
    bootstrapAttempts: 1 | 2 = 1,
  ): StrategyOneTimingCalibrationRecord {
    validateTime(now);

    if (bootstrapAttempts !== 1 && bootstrapAttempts !== CONTROLLED_BATCH_ATTEMPTS) {
      throw new Error("Strategy #1 bootstrap timing proposal supports only one or two controlled attempts.");
    }
    const report = this.evidence.getReport(now);
    const routeKey = routeKeyValue.trim().toUpperCase();
    const route = report.routes.find((item) =>
      item.routeKey.toUpperCase() === routeKey);

    if (!route) {
      throw new Error("Strategy #1 timing route evidence is unavailable.");
    }

    if (!isExactStrategyOnePilotRoute(route)) {
      throw new Error(
        "Strategy #1 timing calibration is restricted to an explicitly audited SPOT pilot lane.",
      );
    }

    const pilotReport = this.pilotEquivalentEvidence.getReport(now);
    const pilotRoute = pilotReport.routes.find((item) =>
      item.routeKey.toUpperCase() === routeKey);

    if (!pilotRoute?.dispatchReserved.calibration.ready) {
      throw new Error(
        `Strategy #1 dispatch-reserved pilot freshness evidence is not proposal-ready: ${
          pilotRoute?.dispatchReserved.calibration.blockers.join(" | ") ?? "exact route has no unique eligible book generations"
        }`,
      );
    }

    if (
      pilotReport.observerFailures > 0 ||
      pilotReport.persistence.writeFailures > 0 ||
      pilotReport.persistence.malformedRecordsIgnored > 0 ||
      pilotReport.persistence.lastError !== null
    ) {
      throw new Error(
        "Strategy #1 pilot-equivalent evidence integrity is not clean enough for calibration review.",
      );
    }

    if (
      !route.calibration.publicTimingReady
    ) {
      throw new Error(
        `Strategy #1 public timing is not proposal-ready: ${route.calibration.blockers.join(" | ")}`,
      );
    }

    const persistence = report.persistence;

    if (
      report.observerFailures > 0 ||
      persistence.writeFailures > 0 ||
      persistence.malformedRecordsIgnored > 0 ||
      persistence.lastError !== null
    ) {
      throw new Error(
        "Strategy #1 timing evidence integrity is not clean enough for calibration review.",
      );
    }

    const buyVenue = report.venues.find((item) =>
      item.venue === route.buyExchange);
    const sellVenue = report.venues.find((item) =>
      item.venue === route.sellExchange);
    const scope: StrategyOneTimingCalibrationScope =
      route.calibration.privateFillTimingReady
        ? "CONTINUOUS_TINY_LIVE"
        : bootstrapAttempts === CONTROLLED_BATCH_ATTEMPTS
          ? "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH"
          : "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT";
    const timingHeadroom = this.reviewHeadroom({
      market: route.market,
      buyExchange: route.buyExchange,
      sellExchange: route.sellExchange,
    }, now);

    if (
      timingHeadroom.state !== "READY" ||
      timingHeadroom.maximumBookAgeMs === null
    ) {
      throw new Error(
        `Strategy #1 timing headroom review is blocked: ${timingHeadroom.blockers.join(" | ")}`,
      );
    }
    const maximumBookAgeMs = timingHeadroom.maximumBookAgeMs;
    const evidenceHash = hash({
      reportVersion: report.version,
      route,
      buyVenue,
      sellVenue,
      pilotRoute,
      timingHeadroom,
    });
    const id = `timing-${hash({
      routeKey: route.routeKey,
      evidenceHash,
      scope,
      timingPolicyRevision: CONTROLLED_PILOT_TIMING_POLICY_REVISION,
    }).slice(0, 32)}`;
    const existing = this.latest.get(id);

    if (existing) {
      return clone(existing);
    }

    const requiredApprovalPhrase = scope === "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH"
      ? `APPROVE ${id} ATTEMPTS2 HOURS3`
      : `APPROVE ${id}`;
    const record = freeze({
      schemaVersion: "110.0" as const,
      timingPolicyRevision: CONTROLLED_PILOT_TIMING_POLICY_REVISION,
      id,
      routeKey: route.routeKey,
      market: route.market,
      buyExchange: route.buyExchange,
      sellExchange: route.sellExchange,
      status: "PROPOSED" as const,
      scope,
      maximumBookAgeMs,
      evidenceHash,
      evidenceGeneratedAt: report.generatedAt,
      publicSamples: Math.min(
        route.metrics.buyQuoteAgeMs.sampleCount,
        route.metrics.sellQuoteAgeMs.sampleCount,
        route.metrics.decisionToPipelineStartMs.sampleCount,
      ),
      privateFillSamplesBuy: buyVenue?.privateFillEvents ?? 0,
      privateFillSamplesSell: sellVenue?.privateFillEvents ?? 0,
      proposedAt: now,
      approvedAt: null,
      expiresAt: null,
      revokedAt: null,
      requiredApprovalPhrase,
      automaticActivationAllowed: false as const,
      liveOrderSubmissionAuthorized: false as const,
    });

    this.persist(record);
    return clone(record);
  }

  approve(
    idValue: string,
    approvalPhraseValue: string,
    now = Date.now(),
  ): StrategyOneTimingCalibrationRecord {
    validateTime(now);
    const id = idValue.trim();
    const current = this.latest.get(id);

    if (!current || current.status !== "PROPOSED") {
      throw new Error("A current proposed timing calibration is required.");
    }

    if (
      current.timingPolicyRevision !==
      CONTROLLED_PILOT_TIMING_POLICY_REVISION
    ) {
      throw new Error(
        "The proposed timing calibration belongs to a superseded timing policy.",
      );
    }

    if (approvalPhraseValue.trim() !== current.requiredApprovalPhrase) {
      throw new Error("Exact Strategy #1 timing approval phrase is required.");
    }

    const approved = freeze({
      ...clone(current),
      status: "APPROVED" as const,
      approvedAt: now,
      expiresAt: now + Math.min(
        this.maximumApprovalDurationMs,
        current.scope === "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH"
          ? CONTROLLED_BATCH_APPROVAL_DURATION_MS
          : 60 * 60 * 1_000,
      ),
    });

    this.persist(approved);
    return clone(approved);
  }

  revoke(
    idValue: string,
    now = Date.now(),
  ): StrategyOneTimingCalibrationRecord {
    validateTime(now);
    const current = this.latest.get(idValue.trim());

    if (!current || current.status !== "APPROVED") {
      throw new Error("An approved timing calibration is required for revocation.");
    }

    const revoked = freeze({
      ...clone(current),
      status: "REVOKED" as const,
      revokedAt: now,
    });

    this.persist(revoked);
    return clone(revoked);
  }

  getApprovedRouteCalibration(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
    readonly now?: number;
  }): StrategyOneTimingCalibrationRecord | null {
    const now = input.now ?? Date.now();
    validateTime(now);
    const market = normalizeMarket(input.market);
    const buyExchange = normalizeExchange(input.buyExchange);
    const sellExchange = normalizeExchange(input.sellExchange);
    const approved = [...this.latest.values()]
      .filter((item) =>
        item.status === "APPROVED" &&
        item.timingPolicyRevision ===
          CONTROLLED_PILOT_TIMING_POLICY_REVISION &&
        item.expiresAt !== null &&
        item.expiresAt >= now &&
        item.market === market &&
        item.buyExchange === buyExchange &&
        item.sellExchange === sellExchange)
      .sort((first, second) =>
        (second.approvedAt ?? 0) - (first.approvedAt ?? 0))[0];

    return approved ? clone(approved) : null;
  }

  getCurrentApprovedCalibrations(
    now = Date.now(),
  ): readonly StrategyOneTimingCalibrationRecord[] {
    validateTime(now);

    return [...this.latest.values()]
      .filter((item) =>
        item.status === "APPROVED" &&
        item.timingPolicyRevision ===
          CONTROLLED_PILOT_TIMING_POLICY_REVISION &&
        item.expiresAt !== null &&
        item.expiresAt >= now)
      .sort((first, second) =>
        (second.approvedAt ?? 0) - (first.approvedAt ?? 0))
      .map(clone);
  }

  getDiagnostics(
    now = Date.now(),
  ) {
    validateTime(now);
    const records = [...this.latest.values()]
      .sort((first, second) => second.proposedAt - first.proposedAt)
      .map(clone);
    const controlledBatchHeadroom = this.reviewHeadroom({
      market: "COTIUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
    }, now);
    const pilotBasketHeadroom =
      STRATEGY_ONE_TINY_LIVE_BASKET_POLICY.routes.map((route) =>
        this.reviewHeadroom(route, now));

    return freeze({
      schemaVersion: "110.0" as const,
      generatedAt: now,
      records,
      controlledBatchHeadroom,
      pilotBasketHeadroom,
      summary: {
        proposed: records.filter((item) => item.status === "PROPOSED").length,
        approvedAndCurrent: records.filter((item) =>
          item.status === "APPROVED" &&
          item.timingPolicyRevision ===
            CONTROLLED_PILOT_TIMING_POLICY_REVISION &&
          item.expiresAt !== null &&
          item.expiresAt >= now).length,
        policyIncompatible: records.filter((item) =>
          item.timingPolicyRevision !==
            CONTROLLED_PILOT_TIMING_POLICY_REVISION).length,
        expired: records.filter((item) =>
          item.status === "APPROVED" &&
          item.expiresAt !== null &&
          item.expiresAt < now).length,
        revoked: records.filter((item) => item.status === "REVOKED").length,
      },
      persistence: this.store.getDiagnostics(),
      safety: {
        automaticActivationAllowed: false,
        timingPolicyRevision: CONTROLLED_PILOT_TIMING_POLICY_REVISION,
        exactApprovalPhraseRequired: true,
        dynamicPoolPerRouteApprovalRequired: false,
        maximumApprovalDurationMs: this.maximumApprovalDurationMs,
        bootstrapCalibrationLimitedToFirstAttempt: true,
        liveOrderSubmissionAuthorized: false,
      },
    });
  }

  private persist(record: StrategyOneTimingCalibrationRecord): void {
    this.store.append(record);
    this.latest.set(record.id, freeze(clone(record)));
  }
}

function appendIntegrityBlockers(
  blockers: string[],
  owner: string,
  observerFailures: number,
  persistence: {
    readonly writeFailures: number;
    readonly malformedRecordsIgnored: number;
    readonly lastError: string | null;
  },
): void {
  if (observerFailures > 0) {
    blockers.push(`${owner} observer has ${observerFailures} failure(s).`);
  }

  if (persistence.writeFailures > 0) {
    blockers.push(`${owner} persistence has ${persistence.writeFailures} write failure(s).`);
  }

  if (persistence.malformedRecordsIgnored > 0) {
    blockers.push(
      `${owner} persistence ignored ${persistence.malformedRecordsIgnored} malformed record(s).`,
    );
  }

  if (persistence.lastError !== null) {
    blockers.push(`${owner} persistence error: ${persistence.lastError}`);
  }
}

function isRecord(value: unknown): value is StrategyOneTimingCalibrationRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<StrategyOneTimingCalibrationRecord>;
  return item.schemaVersion === "110.0" &&
    typeof item.id === "string" &&
    typeof item.routeKey === "string" &&
    (item.status === "PROPOSED" ||
      item.status === "APPROVED" ||
      item.status === "REVOKED") &&
    (item.scope === "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT" ||
      item.scope === "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH" ||
      item.scope === "CONTINUOUS_TINY_LIVE") &&
    Number.isSafeInteger(item.maximumBookAgeMs) &&
    item.automaticActivationAllowed === false &&
    item.liveOrderSubmissionAuthorized === false;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Strategy #1 timing calibration timestamp is invalid.");
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    freeze(child);
  }

  return Object.freeze(value);
}

export const strategyOneTimingCalibrationService =
  new StrategyOneTimingCalibrationService();
