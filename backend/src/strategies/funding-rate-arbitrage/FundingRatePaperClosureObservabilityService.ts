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
  FundingRateArbitrageConfiguration,
} from "./FundingRateArbitrageConfiguration";

import type {
  FundingRateArbitrageAssessment,
  FundingRateArbitrageEconomicsSnapshot,
} from "./FundingRateArbitrageEconomicsEngine";

interface FundingRuntimeEvidence {
  readonly running: boolean;
  readonly totalSignalsObserved: number;
  readonly currentSignalCount: number;
  readonly lastSignalObservedAt: number | null;
}

interface FundingAdmissionEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly decision: string;
  readonly plan: {readonly id: string} | null;
}

interface FundingIntakeEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly planId: string | null;
  readonly state: string;
  readonly blockers: readonly string[];
}

interface FundingQueueEvidence {
  readonly updatedAt: number;
  readonly state: string;
  readonly plan: {readonly strategyId: string};
}

export interface FundingRatePaperClosurePort {
  getConfiguration(): FundingRateArbitrageConfiguration;
  getRuntime(now: number): FundingRuntimeEvidence;
  getEconomics(): FundingRateArbitrageEconomicsSnapshot | null;
  getAccountEvidence(now: number): DerivativeAccountEvidenceSnapshot;
  getFeeEvidence(now: number): DerivativeFeeEvidenceSnapshot;
  getAdmissions(now: number): readonly FundingAdmissionEvidence[];
  getIntake(now: number): readonly FundingIntakeEvidence[];
  getQueue(now: number): readonly FundingQueueEvidence[];
}

export type FundingRatePaperClosureState =
  | "NO_DATA"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_FUNDING_EDGE"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export class FundingRatePaperClosureObservabilityService {
  constructor(
    private readonly port: FundingRatePaperClosurePort,
    private readonly recentEvidenceWindowMs = 60_000,
  ) {
    if (!Number.isSafeInteger(recentEvidenceWindowMs) || recentEvidenceWindowMs <= 0) {
      throw new Error("Funding-rate PAPER closure recent evidence window must be a positive integer.");
    }
  }

  getReport(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Funding-rate PAPER closure timestamp must be positive.");
    }

    const configuration = this.port.getConfiguration();
    const runtime = this.port.getRuntime(now);
    const economics = this.port.getEconomics();
    const account = this.port.getAccountEvidence(now);
    const fees = this.port.getFeeEvidence(now);
    const assessments = economics?.assessments ?? [];
    const economicallyEvaluable = assessments.filter((item) => item.economics !== null);
    const bestDifferential = maximum(assessments, (item) => item.differential.fundingDifferentialPercent);
    const bestNet = maximum(economicallyEvaluable, (item) => item.economics!.expectedNetPercent);
    const providers = summarizeDerivativePaperVenues({
      exchanges: configuration.exchanges,
      targetQuoteAmount: configuration.targetQuoteNotional,
      account,
      fees,
    });
    const providerByExchange = new Map(providers.map((item) => [item.exchange, item]));
    const paperEvidenceReadyRoutes = assessments.filter((item) =>
      providerByExchange.get(item.differential.longExchange)?.paperEvidenceReady === true &&
      providerByExchange.get(item.differential.shortExchange)?.paperEvidenceReady === true,
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

    const state: FundingRatePaperClosureState = !runtime.running || !economics
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
                : "WAITING_FOR_FUNDING_EDGE";

    return freeze({
      version: "88.0" as const,
      generatedAt: now,
      strategyId: configuration.strategyId,
      mode: "FUNDING_RATE_PAPER_CLOSURE_OBSERVABILITY" as const,
      state,
      message: message(state, bestDifferential, bestNet, providers),
      controller: {
        running: runtime.running,
        currentSignals: runtime.currentSignalCount,
        totalSignalsObserved: runtime.totalSignalsObserved,
        lastSignalObservedAt: runtime.lastSignalObservedAt,
      },
      economics: {
        sourceSnapshotGeneratedAt: economics?.sourceSnapshotGeneratedAt ?? null,
        evaluatedRoutes: economics?.evaluatedRoutes ?? 0,
        differentialEvaluableRoutes: assessments.filter((item) =>
          Number.isFinite(item.differential.fundingDifferentialPercent)).length,
        differentialQualifiedRoutes: assessments.filter((item) =>
          item.differential.fundingDifferentialPercent >= configuration.minimumFundingDifferentialPercent).length,
        economicallyEvaluableRoutes: economicallyEvaluable.length,
        netPositiveRoutes: economicallyEvaluable.filter((item) => item.economics!.expectedNetPercent > 0).length,
        qualifiedRoutes: economics?.qualifiedRoutes ?? 0,
        minimumFundingDifferentialPercent: configuration.minimumFundingDifferentialPercent,
        minimumExpectedNetPercent: configuration.minimumExpectedNetPercent,
        maximumFundingPeriodsToCapture: configuration.maximumFundingPeriodsToCapture,
        bestDifferentialRoute: bestDifferential ? routeSummary(bestDifferential) : null,
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
        sameMarketTwoVenueOnly: true,
        matchedLongShortOnly: true,
        expectedFundingNotGuaranteed: true,
        projectedFundingRatePersistenceRequired: true,
        favorableEntryBasisExcluded: true,
        roundTripFeesReserved: true,
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

function routeSummary(assessment: FundingRateArbitrageAssessment) {
  return {
    routeId: assessment.id,
    market: assessment.market,
    status: assessment.status,
    blockers: [...assessment.blockers],
    differential: {...assessment.differential},
    economics: assessment.economics ? {...assessment.economics} : null,
  };
}

function message(
  state: FundingRatePaperClosureState,
  bestDifferential: FundingRateArbitrageAssessment | null,
  bestNet: FundingRateArbitrageAssessment | null,
  providers: readonly {readonly exchange: string; readonly paperEvidenceReady: boolean}[],
): string {
  if (state === "NO_DATA") return "Strategy #5 controller or economics evidence is unavailable; readiness is not inferred.";
  if (state === "DERIVATIVE_EVIDENCE_BLOCKED") {
    const blocked = providers.filter((item) => !item.paperEvidenceReady).map((item) => item.exchange).join(", ");
    return `A two-venue PAPER route requires authenticated positions, fees and target margin on both venues; incomplete: ${blocked}.`;
  }
  if (state === "WAITING_FOR_FUNDING_EDGE") {
    const differential = bestDifferential?.differential.fundingDifferentialPercent;
    const net = bestNet?.economics?.expectedNetPercent;
    return differential === undefined
      ? "No current same-market two-venue funding differential is available."
      : `Best funding differential ${formatPercent(differential)}; bounded carry expected net ${net === undefined ? "NO_DATA" : formatPercent(net)} remains unqualified.`;
  }
  if (state === "SIGNAL_AVAILABLE") return "A current cost-aware funding-rate signal is available for central admission.";
  if (state === "SIGNAL_ADMITTED") return "A current Strategy #5 signal has plan-bearing central admission evidence.";
  if (state === "PAPER_BLOCKED") return "A Strategy #5 plan reached central PAPER intake and remains fail-closed on current runtime evidence.";
  return "A Strategy #5 plan is present in the durable central PAPER queue.";
}

function countBlockers(assessments: readonly FundingRateArbitrageAssessment[]) {
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
