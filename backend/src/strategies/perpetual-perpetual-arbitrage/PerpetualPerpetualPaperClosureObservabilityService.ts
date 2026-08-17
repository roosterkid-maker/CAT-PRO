import type {
  DerivativeAccountEvidenceSnapshot,
} from "../../derivatives/models/DerivativeAccountEvidence";

import type {
  DerivativeFeeEvidenceSnapshot,
} from "../../derivatives/models/DerivativeFeeEvidence";

import {
  summarizeDerivativePaperVenues,
} from "../services/DerivativePaperEvidenceSummary";

import type {
  PerpetualPerpetualArbitrageConfiguration,
} from "./PerpetualPerpetualArbitrageConfiguration";

import type {
  PerpetualPerpetualArbitrageAssessment,
  PerpetualPerpetualArbitrageEconomicsSnapshot,
} from "./PerpetualPerpetualArbitrageEconomicsEngine";

interface PerpetualRuntimeEvidence {
  readonly running: boolean;
  readonly totalSignalsObserved: number;
  readonly currentSignalCount: number;
  readonly lastSignalObservedAt: number | null;
}

interface PerpetualAdmissionEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly decision: string;
  readonly plan: {readonly id: string} | null;
}

interface PerpetualIntakeEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly planId: string | null;
  readonly state: string;
  readonly blockers: readonly string[];
}

interface PerpetualQueueEvidence {
  readonly updatedAt: number;
  readonly state: string;
  readonly plan: {readonly strategyId: string};
}

export interface PerpetualPerpetualPaperClosurePort {
  getConfiguration(): PerpetualPerpetualArbitrageConfiguration;
  getRuntime(now: number): PerpetualRuntimeEvidence;
  getEconomics(): PerpetualPerpetualArbitrageEconomicsSnapshot | null;
  getAccountEvidence(now: number): DerivativeAccountEvidenceSnapshot;
  getFeeEvidence(now: number): DerivativeFeeEvidenceSnapshot;
  getAdmissions(now: number): readonly PerpetualAdmissionEvidence[];
  getIntake(now: number): readonly PerpetualIntakeEvidence[];
  getQueue(now: number): readonly PerpetualQueueEvidence[];
}

export type PerpetualPerpetualPaperClosureState =
  | "NO_DATA"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_DISLOCATION"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export class PerpetualPerpetualPaperClosureObservabilityService {
  constructor(
    private readonly port: PerpetualPerpetualPaperClosurePort,
    private readonly recentEvidenceWindowMs = 60_000,
  ) {
    if (!Number.isSafeInteger(recentEvidenceWindowMs) || recentEvidenceWindowMs <= 0) {
      throw new Error("Perpetual-perpetual PAPER closure recent evidence window must be a positive integer.");
    }
  }

  getReport(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Perpetual-perpetual PAPER closure timestamp must be positive.");
    }

    const configuration = this.port.getConfiguration();
    const runtime = this.port.getRuntime(now);
    const economics = this.port.getEconomics();
    const account = this.port.getAccountEvidence(now);
    const fees = this.port.getFeeEvidence(now);
    const assessments = economics?.assessments ?? [];
    const dislocationEvaluable = assessments.filter((item) =>
      item.dislocation !== null && Number.isFinite(item.dislocation.grossTopDislocationPercent));
    const economicallyEvaluable = assessments.filter((item) => item.economics !== null);
    const bestGross = maximum(dislocationEvaluable, (item) =>
      item.dislocation!.grossTopDislocationPercent);
    const bestNet = maximum(economicallyEvaluable, (item) => item.economics!.expectedNetPercent);
    const providers = summarizeDerivativePaperVenues({
      exchanges: configuration.exchanges,
      targetQuoteAmount: configuration.targetQuoteNotional,
      account,
      fees,
    });
    const providerByExchange = new Map(providers.map((item) => [item.exchange, item]));
    const paperEvidenceReadyRoutes = assessments.filter((item) =>
      providerByExchange.get(item.firstExchange)?.paperEvidenceReady === true &&
      providerByExchange.get(item.secondExchange)?.paperEvidenceReady === true,
    ).length;

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

    const state: PerpetualPerpetualPaperClosureState = !runtime.running || !economics
      ? "NO_DATA"
      : activeQueue > 0 || (latestIntakeCurrent && latestIntake?.state === "QUEUED")
        ? "PAPER_QUEUED"
        : latestIntakeCurrent && (latestIntake?.state === "BLOCKED" || latestIntake?.state === "FAILED")
          ? "PAPER_BLOCKED"
          : paperEvidenceReadyRoutes === 0
            ? "DERIVATIVE_EVIDENCE_BLOCKED"
            : runtime.currentSignalCount > 0 && latestAdmissionCurrent &&
                latestAdmission?.decision === "SHADOW_SIGNAL_ADMITTED"
              ? "SIGNAL_ADMITTED"
              : runtime.currentSignalCount > 0
                ? "SIGNAL_AVAILABLE"
                : "WAITING_FOR_DISLOCATION";

    return freeze({
      version: "71.0" as const,
      generatedAt: now,
      strategyId: configuration.strategyId,
      mode: "PERPETUAL_PERPETUAL_PAPER_CLOSURE_OBSERVABILITY" as const,
      state,
      message: message(state, bestGross, bestNet, providers),
      controller: {
        running: runtime.running,
        currentSignals: runtime.currentSignalCount,
        totalSignalsObserved: runtime.totalSignalsObserved,
        lastSignalObservedAt: runtime.lastSignalObservedAt,
      },
      economics: {
        sourceSnapshotGeneratedAt: economics?.sourceSnapshotGeneratedAt ?? null,
        evaluatedRoutes: economics?.evaluatedRoutes ?? 0,
        dislocationEvaluableRoutes: dislocationEvaluable.length,
        grossQualifiedRoutes: dislocationEvaluable.filter((item) =>
          item.dislocation!.grossTopDislocationPercent >= configuration.minimumGrossDislocationPercent).length,
        economicallyEvaluableRoutes: economicallyEvaluable.length,
        netPositiveRoutes: economicallyEvaluable.filter((item) => item.economics!.expectedNetPercent > 0).length,
        qualifiedRoutes: economics?.qualifiedRoutes ?? 0,
        minimumGrossDislocationPercent: configuration.minimumGrossDislocationPercent,
        minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
        adverseFundingPeriodsReserved: configuration.adverseFundingPeriodsReserved,
        bestGrossRoute: bestGross ? routeSummary(bestGross) : null,
        bestNetRoute: bestNet ? routeSummary(bestNet) : null,
        dominantBlockers: countBlockers(assessments).slice(0, 8),
      },
      derivativeEvidence: {
        targetQuoteNotional: configuration.targetQuoteNotional,
        configuredVenues: providers.length,
        authenticatedReadReadyVenues: providers.filter((item) => item.authenticatedReadReady).length,
        targetMarginCoveredVenues: providers.filter((item) => item.targetMarginCovered).length,
        feeConfiguredVenues: providers.filter((item) => item.feeConfigured).length,
        paperEvidenceReadyVenues: providers.filter((item) => item.paperEvidenceReady).length,
        paperEvidenceReadyRoutes,
        venues: providers,
      },
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
        sameContractTwoVenueOnly: true,
        matchedLongShortOnly: true,
        convergenceNotGuaranteed: true,
        roundTripFeesReserved: true,
        adverseFundingReserved: true,
        authenticatedReadsOnly: true,
        balanceOrMarginInferenceAllowed: false,
        profitabilityThresholdMutated: false,
        signalFabricationAllowed: false,
        paperExecutionTriggeredByRead: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }
}

function routeSummary(assessment: PerpetualPerpetualArbitrageAssessment) {
  return {
    routeId: assessment.id,
    market: assessment.market,
    firstExchange: assessment.firstExchange,
    secondExchange: assessment.secondExchange,
    status: assessment.status,
    blockers: [...assessment.blockers],
    dislocation: assessment.dislocation ? {...assessment.dislocation} : null,
    economics: assessment.economics ? {...assessment.economics} : null,
  };
}

function message(
  state: PerpetualPerpetualPaperClosureState,
  bestGross: PerpetualPerpetualArbitrageAssessment | null,
  bestNet: PerpetualPerpetualArbitrageAssessment | null,
  providers: readonly {readonly exchange: string; readonly paperEvidenceReady: boolean}[],
): string {
  if (state === "NO_DATA") return "Strategy #6 controller or economics evidence is unavailable; readiness is not inferred.";
  if (state === "DERIVATIVE_EVIDENCE_BLOCKED") {
    const blocked = providers.filter((item) => !item.paperEvidenceReady).map((item) => item.exchange).join(", ");
    return `A two-perpetual PAPER route requires authenticated positions, fees and target margin on both venues; incomplete: ${blocked}.`;
  }
  if (state === "WAITING_FOR_DISLOCATION") {
    const gross = bestGross?.dislocation?.grossTopDislocationPercent;
    const net = bestNet?.economics?.expectedNetPercent;
    return gross === undefined
      ? "No current same-contract two-venue perpetual dislocation is available."
      : `Best gross dislocation ${formatPercent(gross)}; best expected net ${net === undefined ? "NO_DATA" : formatPercent(net)} remains unqualified.`;
  }
  if (state === "SIGNAL_AVAILABLE") return "A current cost-aware perpetual-perpetual signal is available for central admission.";
  if (state === "SIGNAL_ADMITTED") return "A current Strategy #6 signal has plan-bearing central admission evidence.";
  if (state === "PAPER_BLOCKED") return "A Strategy #6 plan reached central PAPER intake and remains fail-closed on current runtime evidence.";
  return "A Strategy #6 plan is present in the durable central PAPER queue.";
}

function countBlockers(assessments: readonly PerpetualPerpetualArbitrageAssessment[]) {
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
