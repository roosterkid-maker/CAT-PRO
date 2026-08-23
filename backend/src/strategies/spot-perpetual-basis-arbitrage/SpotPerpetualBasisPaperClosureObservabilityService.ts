import type {
  DerivativeAccountEvidenceSnapshot,
} from "../../derivatives/models/DerivativeAccountEvidence";

import type {
  DerivativeFeeEvidenceSnapshot,
} from "../../derivatives/models/DerivativeFeeEvidence";

import type {
  SpotPerpetualBasisConfiguration,
} from "./SpotPerpetualBasisConfiguration";

import type {
  SpotPerpetualBasisAssessment,
  SpotPerpetualBasisEconomicsSnapshot,
} from "./SpotPerpetualBasisEconomicsEngine";

import {
  summarizeDerivativePaperVenues,
} from "../services/DerivativePaperEvidenceSummary";
import {derivativeVenueCapabilityRegistry} from "../../derivatives/services/DerivativeVenueCapabilityRegistry";

interface BasisRuntimeEvidence {
  readonly running: boolean;
  readonly totalSignalsObserved: number;
  readonly currentSignalCount: number;
  readonly lastSignalObservedAt: number | null;
}

interface BasisAdmissionEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly decision: string;
  readonly plan: {readonly id: string} | null;
}

interface BasisIntakeEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly planId: string | null;
  readonly state: string;
  readonly blockers: readonly string[];
}

interface BasisQueueEvidence {
  readonly updatedAt: number;
  readonly state: string;
  readonly plan: {readonly strategyId: string};
}

export interface SpotPerpetualBasisPaperClosurePort {
  getConfiguration(): SpotPerpetualBasisConfiguration;
  getRuntime(now: number): BasisRuntimeEvidence;
  getEconomics(): SpotPerpetualBasisEconomicsSnapshot | null;
  getAccountEvidence(now: number): DerivativeAccountEvidenceSnapshot;
  getFeeEvidence(now: number): DerivativeFeeEvidenceSnapshot;
  getAdmissions(now: number): readonly BasisAdmissionEvidence[];
  getIntake(now: number): readonly BasisIntakeEvidence[];
  getQueue(now: number): readonly BasisQueueEvidence[];
}

export type SpotPerpetualBasisPaperClosureState =
  | "NO_DATA"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_QUALIFIED_EDGE"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export class SpotPerpetualBasisPaperClosureObservabilityService {
  constructor(
    private readonly port: SpotPerpetualBasisPaperClosurePort,
    private readonly recentEvidenceWindowMs = 60_000,
  ) {
    if (!Number.isSafeInteger(recentEvidenceWindowMs) || recentEvidenceWindowMs <= 0) {
      throw new Error("Spot-perpetual PAPER closure recent evidence window must be a positive integer.");
    }
  }

  getReport(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Spot-perpetual PAPER closure timestamp must be positive.");
    }

    const configuration = this.port.getConfiguration();
    const runtime = this.port.getRuntime(now);
    const economics = this.port.getEconomics();
    const account = this.port.getAccountEvidence(now);
    const fees = this.port.getFeeEvidence(now);
    const assessments = economics?.assessments ?? [];
    const economicallyEvaluable = assessments.filter((item) => item.economics !== null);
    const best = maximum(economicallyEvaluable, (item) => item.economics!.expectedNetPercent);
    const providers = summarizeDerivativePaperVenues({
      exchanges: configuration.perpetualExchanges,
      targetQuoteAmount: configuration.targetQuoteCapital,
      account,
      fees,
    });

    const admissions = this.port.getAdmissions(now)
      .filter((item) => item.strategyId === configuration.strategyId);
    const intake = this.port.getIntake(now)
      .filter((item) => item.strategyId === configuration.strategyId);
    const queue = this.port.getQueue(now)
      .filter((item) => item.plan.strategyId === configuration.strategyId);
    const planAdmissions = admissions.filter((item) => item.plan !== null);
    const planIntake = intake.filter((item) => item.planId !== null);
    const latestAdmission = newest(planAdmissions);
    const latestIntake = newest(planIntake);
    const latestAdmissionCurrent = isCurrent(
      latestAdmission?.generatedAt,
      now,
      this.recentEvidenceWindowMs,
    );
    const latestIntakeCurrent = isCurrent(
      latestIntake?.generatedAt,
      now,
      this.recentEvidenceWindowMs,
    );
    const activeQueue = queue.filter((item) => item.state === "QUEUED" || item.state === "LEASED").length;
    const completedQueue = queue.filter((item) => item.state === "COMPLETED").length;
    const paperEvidenceReady = providers.filter((item) => item.paperEvidenceReady).length;
    const topology = derivativeVenueCapabilityRegistry.getSnapshot(now);

    const state: SpotPerpetualBasisPaperClosureState = !runtime.running || !economics
      ? "NO_DATA"
      : activeQueue > 0 || (latestIntakeCurrent && latestIntake?.state === "QUEUED")
        ? "PAPER_QUEUED"
        : latestIntakeCurrent && (latestIntake?.state === "BLOCKED" || latestIntake?.state === "FAILED")
          ? "PAPER_BLOCKED"
          : runtime.currentSignalCount > 0 && latestAdmissionCurrent &&
              latestAdmission?.decision === "SHADOW_SIGNAL_ADMITTED"
            ? "SIGNAL_ADMITTED"
            : runtime.currentSignalCount > 0
              ? "SIGNAL_AVAILABLE"
              : paperEvidenceReady === 0
                ? "DERIVATIVE_EVIDENCE_BLOCKED"
                : "WAITING_FOR_QUALIFIED_EDGE";

    return freeze({
      version: "176.0" as const,
      generatedAt: now,
      strategyId: configuration.strategyId,
      mode: "SPOT_PERPETUAL_BASIS_PAPER_CLOSURE_OBSERVABILITY" as const,
      state,
      message: message(state, best?.economics?.expectedNetPercent ?? null,
        configuration.minimumExpectedNetPercent, providers),
      controller: {
        running: runtime.running,
        currentSignals: runtime.currentSignalCount,
        totalSignalsObserved: runtime.totalSignalsObserved,
        lastSignalObservedAt: runtime.lastSignalObservedAt,
      },
      economics: {
        sourceSnapshotGeneratedAt: economics?.sourceSnapshotGeneratedAt ?? null,
        evaluatedRoutes: economics?.evaluatedRoutes ?? 0,
        economicallyEvaluableRoutes: economicallyEvaluable.length,
        grossPositiveRoutes: economicallyEvaluable.filter((item) => item.economics!.grossBasisPercent > 0).length,
        netPositiveRoutes: economicallyEvaluable.filter((item) => item.economics!.expectedNetPercent > 0).length,
        qualifiedRoutes: economics?.qualifiedRoutes ?? 0,
        minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
        closeAtOrBelowAbsoluteBasisPercent: configuration.closeAtOrBelowAbsoluteBasisPercent,
        nextOpeningDelayMs: configuration.nextOpeningDelayMs,
        perpetualLeverage: configuration.perpetualLeverage,
        bestRoute: best ? routeSummary(best) : null,
        dominantBlockers: countBlockers(assessments).slice(0, 8),
      },
      derivativeEvidence: {
        targetQuoteCapital: configuration.targetQuoteCapital,
        configuredVenues: providers.length,
        authenticatedReadReadyVenues: providers.filter((item) => item.authenticatedReadReady).length,
        targetMarginCoveredVenues: providers.filter((item) => item.targetMarginCovered).length,
        feeConfiguredVenues: providers.filter((item) => item.feeConfigured).length,
        paperEvidenceReadyVenues: paperEvidenceReady,
        venues: providers,
      },
      topology: topology.summary,
      lineage: {
        admissionsObserved: admissions.length,
        plansAdmitted: planAdmissions.filter((item) => item.decision === "SHADOW_SIGNAL_ADMITTED").length,
        latestPlanAdmissionDecision: latestAdmission?.decision ?? null,
        intakeObserved: intake.length,
        latestPlanIntakeState: latestIntake?.state ?? null,
        latestPlanIntakeBlockers: [...(latestIntake?.blockers ?? [])],
        activeQueue,
        completedQueue,
      },
      safety: {
        readOnlyAggregation: true,
        authenticatedReadsOnly: true,
        balanceOrMarginInferenceAllowed: false,
        feesAndRulesRemainRequired: true,
        profitabilityThresholdMutated: false,
        signalFabricationAllowed: false,
        paperExecutionTriggeredByRead: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }
}

function routeSummary(assessment: SpotPerpetualBasisAssessment) {
  const economics = assessment.economics!;
  return {
    routeId: assessment.id,
    spotExchange: assessment.spotExchange,
    perpetualExchange: assessment.perpetualExchange,
    market: assessment.market,
    status: assessment.status,
    blockers: [...assessment.blockers],
    ...economics,
  };
}

function message(
  state: SpotPerpetualBasisPaperClosureState,
  bestNetPercent: number | null,
  threshold: number,
  providers: readonly {readonly exchange: string; readonly paperEvidenceReady: boolean}[],
): string {
  if (state === "NO_DATA") return "Strategy #4 controller or economics evidence is unavailable; readiness is not inferred.";
  if (state === "DERIVATIVE_EVIDENCE_BLOCKED") {
    const blocked = providers.filter((item) => !item.paperEvidenceReady).map((item) => item.exchange).join(", ");
    return `Authenticated derivative read, position, fee and target-margin evidence is incomplete for: ${blocked}.`;
  }
  if (state === "WAITING_FOR_QUALIFIED_EDGE") {
    return bestNetPercent === null
      ? "Routes are being evaluated, but no route currently has complete basis economics."
      : `Derivative evidence is ready on at least one venue; best expected net ${formatPercent(bestNetPercent)} is below required ${formatPercent(threshold)}.`;
  }
  if (state === "SIGNAL_AVAILABLE") return "A current cost-aware spot-perpetual signal is available for central admission.";
  if (state === "SIGNAL_ADMITTED") return "A current Strategy #4 signal has plan-bearing central admission evidence.";
  if (state === "PAPER_BLOCKED") return "A Strategy #4 plan reached central PAPER intake and remains fail-closed on current runtime evidence.";
  return "A Strategy #4 plan is present in the durable central PAPER queue.";
}

function countBlockers(assessments: readonly SpotPerpetualBasisAssessment[]) {
  const counts = new Map<string, number>();
  for (const assessment of assessments) {
    for (const blocker of assessment.blockers) {
      counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({code, count}))
    .sort((first, second) => second.count - first.count || first.code.localeCompare(second.code));
}

function maximum<T>(values: readonly T[], score: (value: T) => number): T | null {
  let selected: T | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const current = score(value);
    if (Number.isFinite(current) && current > selectedScore) {
      selected = value;
      selectedScore = current;
    }
  }
  return selected;
}

function newest<T extends {readonly generatedAt: number}>(values: readonly T[]): T | null {
  return [...values].sort((first, second) => second.generatedAt - first.generatedAt)[0] ?? null;
}

function isCurrent(timestamp: number | undefined, now: number, maximumAgeMs: number): boolean {
  return timestamp !== undefined && timestamp <= now && now - timestamp <= maximumAgeMs;
}

function formatPercent(value: number): string {
  return `${value.toFixed(4)}%`;
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}
