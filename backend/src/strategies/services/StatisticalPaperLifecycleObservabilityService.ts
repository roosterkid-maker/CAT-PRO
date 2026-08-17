import type {DerivativeAccountEvidenceSnapshot} from "../../derivatives/models/DerivativeAccountEvidence";
import type {DerivativeFeeEvidenceSnapshot} from "../../derivatives/models/DerivativeFeeEvidence";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {StatisticalArbitrageStrategySignal} from "../models/StrategySignal";
import type {StatisticalArbitrageConfiguration} from "../statistical-arbitrage/StatisticalArbitrageConfiguration";
import type {
  StatisticalArbitrageAssessment,
  StatisticalArbitrageSnapshot,
} from "../statistical-arbitrage/StatisticalArbitrageEngine";
import type {
  StatisticalPairDiscoverySnapshot,
  StatisticalPairResearchCandidate,
} from "../statistical-arbitrage/StatisticalPairDiscoveryService";
import type {CentralPaperIntakeRecord} from "./CentralPaperIntakeService";
import type {CentralPaperPlanAdmission} from "./CentralPaperPlanAdmissionService";
import type {CentralPaperRuntimeEvidenceReport} from "./CentralPaperRuntimeEvidenceCollector";
import type {CentralPaperQueueRecord} from "./CentralPaperExecutionQueueService";
import type {CentralStrategyAdmissionRecord} from "./CentralStrategyExecutionAdmissionService";
import {
  summarizeDerivativePaperVenues,
  type DerivativePaperVenueEvidenceSummary,
} from "./DerivativePaperEvidenceSummary";

export type StatisticalPaperLifecycleState =
  | "RESEARCH_BLOCKED"
  | "AWAITING_ENTRY_SIGNAL"
  | "AWAITING_CENTRAL_ADMISSION"
  | "CENTRAL_ADMISSION_BLOCKED"
  | "PLAN_COMPILATION_BLOCKED"
  | "PAPER_ADMISSION_BLOCKED"
  | "PAPER_ADMISSION_ELIGIBLE"
  | "INTAKE_BLOCKED"
  | "QUEUED"
  | "DUPLICATE";

export interface StatisticalPaperLifecyclePort {
  getConfiguration(): StatisticalArbitrageConfiguration;
  getRuntime(now: number): {
    readonly running: boolean;
    readonly currentSignalCount: number;
    readonly totalSignalsObserved: number;
    readonly lastSignalObservedAt: number | null;
  };
  getEconomics(): StatisticalArbitrageSnapshot | null;
  getDiscovery(): StatisticalPairDiscoverySnapshot | null;
  getAccountEvidence(now: number): DerivativeAccountEvidenceSnapshot;
  getFeeEvidence(now: number): DerivativeFeeEvidenceSnapshot;
  getSignals(now: number): readonly StatisticalArbitrageStrategySignal[];
  getAdmissions(now: number): readonly CentralStrategyAdmissionRecord[];
  getIntake(now: number): readonly CentralPaperIntakeRecord[];
  getQueueRecords(now: number): readonly CentralPaperQueueRecord[];
  getQueue(planId: string, now: number): CentralPaperQueueRecord | null;
  preview(plan: CentralStrategyExecutionPlan, now: number): {
    readonly runtime: CentralPaperRuntimeEvidenceReport;
    readonly admission: CentralPaperPlanAdmission;
  };
}

export type StatisticalPaperClosureState =
  | "NO_DATA"
  | "RESEARCH_BLOCKED"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_ENTRY_DISLOCATION"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export interface StatisticalPaperLifecycleLane {
  readonly pairId: string;
  readonly exchange: string;
  readonly leftMarket: string;
  readonly rightMarket: string;
  readonly state: StatisticalPaperLifecycleState;
  readonly research: {
    readonly state: StatisticalPairResearchCandidate["state"];
    readonly rankScore: number;
    readonly sampleCount: number;
    readonly walkForwardPassed: boolean;
    readonly regimeAdmitted: boolean;
  };
  readonly lineage: {
    readonly signalId: string | null;
    readonly centralAdmissionId: string | null;
    readonly planId: string | null;
    readonly paperAdmissionId: string | null;
    readonly intakeId: string | null;
    readonly queueRecordId: string | null;
  };
  readonly plan: {
    readonly pattern: CentralStrategyExecutionPlan["pattern"];
    readonly legs: number;
    readonly expiresAt: number;
    readonly current: boolean;
  } | null;
  readonly dryRun: {
    readonly evaluated: boolean;
    readonly state: "NOT_APPLICABLE" | "BLOCKED" | "ELIGIBLE";
    readonly requestedCapitalInr: number | null;
    readonly gates: CentralPaperPlanAdmission["gates"] | null;
    readonly legs: readonly {
      readonly legId: string;
      readonly ready: boolean;
      readonly balanceVerified: boolean;
      readonly paperAdapterSupported: boolean;
      readonly marketRulesVerified: boolean;
      readonly feeEvidenceFresh: boolean;
      readonly quoteFresh: boolean;
    }[];
    readonly blockers: readonly string[];
  };
  readonly actualIntakeState: CentralPaperIntakeRecord["state"] | "NOT_OBSERVED";
  readonly queueState: CentralPaperQueueRecord["state"] | "NOT_QUEUED";
  readonly blockers: readonly string[];
}

export interface StatisticalPaperLifecycleReport {
  readonly version: "73.0";
  readonly generatedAt: number;
  readonly strategyId: "statistical-arbitrage";
  readonly mode: "STATISTICAL_ARBITRAGE_PAPER_CLOSURE_OBSERVABILITY";
  readonly state: StatisticalPaperClosureState;
  readonly message: string;
  readonly evidenceStatus: "AVAILABLE" | "NO_DATA";
  readonly controller: {
    readonly running: boolean;
    readonly currentSignals: number;
    readonly totalSignalsObserved: number;
    readonly lastSignalObservedAt: number | null;
  };
  readonly research: {
    readonly eligibleMarkets: number;
    readonly candidatePairs: number;
    readonly selectedPairs: number;
    readonly promotedPairs: number;
    readonly collectingPairs: number;
    readonly rejectedPairs: number;
    readonly signalEligiblePairs: number;
    readonly minimumSamplesForRequiredFolds: number | null;
    readonly minimumOutOfSampleTrades: number | null;
    readonly closestCandidate: {
      readonly pairId: string;
      readonly state: StatisticalPairResearchCandidate["state"];
      readonly sampleCount: number;
      readonly outOfSampleTrades: number;
      readonly rankScore: number;
      readonly blockers: readonly string[];
    } | null;
    readonly dominantBlockers: readonly {readonly code: string; readonly count: number}[];
  };
  readonly economics: {
    readonly sourceSnapshotGeneratedAt: number | null;
    readonly evaluatedPairs: number;
    readonly qualifiedPairs: number;
    readonly blockedPairs: number;
    readonly bestQualifiedPair: {
      readonly pairId: string;
      readonly exchange: string;
      readonly direction: string;
      readonly zScore: number;
      readonly entryZScoreThreshold: number;
      readonly modeledNetQuote: number;
      readonly modeledNetPercent: number;
    } | null;
    readonly dominantBlockers: readonly {readonly code: string; readonly count: number}[];
  };
  readonly derivativeEvidence: {
    readonly targetQuoteNotionalPerLeg: number;
    readonly conservativePairMarginTarget: number;
    readonly configuredVenues: number;
    readonly authenticatedReadReadyVenues: number;
    readonly targetMarginCoveredVenues: number;
    readonly feeConfiguredVenues: number;
    readonly paperEvidenceReadyVenues: number;
    readonly paperEvidenceReadyPairs: number;
    readonly venues: readonly DerivativePaperVenueEvidenceSummary[];
  };
  readonly lineage: {
    readonly admissionsObserved: number;
    readonly plansAdmitted: number;
    readonly latestPlanAdmissionDecision: string | null;
    readonly intakeObserved: number;
    readonly latestPlanIntakeState: string | null;
    readonly latestPlanIntakeBlockers: readonly string[];
    readonly activeQueue: number;
    readonly completedQueue: number;
  };
  readonly summary: {
    readonly selectedPairs: number;
    readonly researchPromoted: number;
    readonly currentSignals: number;
    readonly plansCompiled: number;
    readonly dryRunsEvaluated: number;
    readonly paperEligible: number;
    readonly paperBlocked: number;
    readonly queued: number;
  };
  readonly lanes: readonly StatisticalPaperLifecycleLane[];
  readonly safety: {
    readonly readOnlyObservability: true;
    readonly actualSignalsOnly: true;
    readonly syntheticSignalsAllowed: false;
    readonly previewQueueMutationPerformed: false;
    readonly capitalReservationMutationPerformed: false;
    readonly paperExecutionPerformed: false;
    readonly researchThresholdsMutated: false;
    readonly signalFabricationAllowed: false;
    readonly balanceOrMarginInferenceAllowed: false;
    readonly cointegrationVerified: false;
    readonly meanReversionGuaranteed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export class StatisticalPaperLifecycleObservabilityService {
  constructor(private readonly port: StatisticalPaperLifecyclePort) {}

  getReport(now = Date.now()): StatisticalPaperLifecycleReport {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Statistical PAPER observability requires a positive timestamp.");
    const configuration = this.port.getConfiguration();
    const runtime = this.port.getRuntime(now);
    const economics = this.port.getEconomics();
    const discovery = this.port.getDiscovery();
    const admissions = this.port.getAdmissions(now);
    const intake = this.port.getIntake(now);
    const queueRecords = this.port.getQueueRecords(now).filter((item) => item.plan.strategyId === configuration.strategyId);
    const conservativePairMarginTarget = configuration.targetQuoteNotional * (1 + configuration.maximumHedgeBeta);
    const exchanges = unique((discovery?.selectedPairs ?? configuration.pairs).map((pair) => pair.exchange));
    const venues = summarizeDerivativePaperVenues({
      exchanges,
      targetQuoteAmount: conservativePairMarginTarget,
      account: this.port.getAccountEvidence(now),
      fees: this.port.getFeeEvidence(now),
    });
    const context = this.buildClosureContext(configuration, runtime, economics, discovery, admissions, intake,
      queueRecords, venues, conservativePairMarginTarget, now);
    if (!discovery) return this.report([], context, now);
    const signals = this.port.getSignals(now);
    const rankings = new Map(discovery.rankings.map((candidate) => [candidate.pairId, candidate]));
    const lanes = discovery.selectedPairs.map((pair) => {
      const candidate = rankings.get(pair.pairId);
      if (!candidate) throw new Error(`Selected statistical pair ${pair.pairId} has no ranking evidence.`);
      const signal = signals.find((item) => economicKey(item.evidence.exchange, item.evidence.leftMarket, item.evidence.rightMarket) ===
        economicKey(pair.exchange, pair.leftMarket, pair.rightMarket)) ?? null;
      const centralAdmission = signal ? admissions.find((item) => item.signalId === signal.id) ?? null : null;
      const plan = centralAdmission?.plan ?? null;
      const intakeRecord = centralAdmission ? intake.find((item) => item.admissionRecordId === centralAdmission.id) ?? null : null;
      const queueRecord = plan ? this.port.getQueue(plan.id, now) : null;
      return this.buildLane(candidate, signal, centralAdmission, plan, intakeRecord, queueRecord, now);
    });
    return this.report(lanes, context, now);
  }

  private buildLane(
    candidate: StatisticalPairResearchCandidate,
    signal: StatisticalArbitrageStrategySignal | null,
    centralAdmission: CentralStrategyAdmissionRecord | null,
    plan: CentralStrategyExecutionPlan | null,
    intake: CentralPaperIntakeRecord | null,
    queue: CentralPaperQueueRecord | null,
    now: number,
  ): StatisticalPaperLifecycleLane {
    const blockers: string[] = [];
    if (candidate.state !== "PROMOTED") blockers.push(...candidate.blockers.map((item) => `RESEARCH:${item}`));
    if (!signal) blockers.push("SIGNAL:CURRENT_ENTRY_SIGNAL_NOT_AVAILABLE");
    if (signal && !centralAdmission) blockers.push("ADMISSION:NOT_OBSERVED");
    if (centralAdmission && centralAdmission.decision !== "SHADOW_SIGNAL_ADMITTED") {
      blockers.push(`ADMISSION:${centralAdmission.decision}`, ...centralAdmission.blockers.map((item) => `ADMISSION:${item}`));
    }
    if (centralAdmission && !plan) blockers.push("PLAN:NOT_COMPILED");

    let runtime: CentralPaperRuntimeEvidenceReport | null = null;
    let paperAdmission: CentralPaperPlanAdmission | null = null;
    if (plan && centralAdmission?.decision === "SHADOW_SIGNAL_ADMITTED" && plan.generatedAt <= now && plan.expiresAt >= now) {
      try {
        const preview = this.port.preview(plan, now);
        runtime = preview.runtime;
        paperAdmission = preview.admission;
        blockers.push(...runtime.blockers.map((item) => `RUNTIME:${item}`));
        blockers.push(...paperAdmission.blockers.map((item) => `PAPER:${item}`));
      } catch (error: unknown) {
        blockers.push(`DRY_RUN:${error instanceof Error ? error.message : "EVIDENCE_READ_FAILED"}`);
      }
    } else if (plan) {
      blockers.push(plan.generatedAt > now ? "PLAN:GENERATED_IN_FUTURE" : "PLAN:EXPIRED");
    }
    if (intake && (intake.state === "BLOCKED" || intake.state === "FAILED")) {
      blockers.push(...intake.blockers.map((item) => `INTAKE:${item}`));
    }

    const state = lifecycleState(candidate, signal, centralAdmission, plan, paperAdmission, intake, queue);
    const legs = runtime?.evidence.legs.map((leg) => ({...leg,
      ready: leg.balanceVerified && leg.paperAdapterSupported && leg.marketRulesVerified && leg.feeEvidenceFresh && leg.quoteFresh})) ?? [];
    return freeze({pairId: candidate.pairId, exchange: candidate.exchange, leftMarket: candidate.leftMarket,
      rightMarket: candidate.rightMarket, state,
      research: {state: candidate.state, rankScore: candidate.rankScore, sampleCount: candidate.sampleCount,
        walkForwardPassed: candidate.walkForwardPassed, regimeAdmitted: candidate.regimeAdmitted},
      lineage: {signalId: signal?.id ?? null, centralAdmissionId: centralAdmission?.id ?? null,
        planId: plan?.id ?? null, paperAdmissionId: paperAdmission?.id ?? centralAdmission?.paperAdmission?.id ?? null,
        intakeId: intake?.id ?? null, queueRecordId: queue?.id ?? intake?.queueRecordId ?? null},
      plan: plan ? {pattern: plan.pattern, legs: plan.legs.length, expiresAt: plan.expiresAt,
        current: plan.generatedAt <= now && plan.expiresAt >= now} : null,
      dryRun: {evaluated: paperAdmission !== null, state: paperAdmission === null ? "NOT_APPLICABLE" :
        paperAdmission.state === "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE" ? "ELIGIBLE" : "BLOCKED",
        requestedCapitalInr: runtime?.requestedCapital ?? null, gates: paperAdmission?.gates ?? null, legs,
        blockers: unique([...(runtime?.blockers ?? []), ...(paperAdmission?.blockers ?? [])])},
      actualIntakeState: intake?.state ?? "NOT_OBSERVED", queueState: queue?.state ?? "NOT_QUEUED",
      blockers: unique(blockers)});
  }

  private buildClosureContext(
    configuration: StatisticalArbitrageConfiguration,
    runtime: ReturnType<StatisticalPaperLifecyclePort["getRuntime"]>,
    economics: StatisticalArbitrageSnapshot | null,
    discovery: StatisticalPairDiscoverySnapshot | null,
    admissions: readonly CentralStrategyAdmissionRecord[],
    intake: readonly CentralPaperIntakeRecord[],
    queue: readonly CentralPaperQueueRecord[],
    venues: readonly DerivativePaperVenueEvidenceSummary[],
    conservativePairMarginTarget: number,
    now: number,
  ) {
    const strategyAdmissions = admissions.filter((item) => item.strategyId === configuration.strategyId);
    const strategyIntake = intake.filter((item) => item.strategyId === configuration.strategyId);
    const latestAdmission = newest(strategyAdmissions.filter((item) => item.plan !== null));
    const latestIntake = newest(strategyIntake.filter((item) => item.planId !== null));
    const activeQueue = queue.filter((item) => item.state === "QUEUED" || item.state === "LEASED").length;
    const completedQueue = queue.filter((item) => item.state === "COMPLETED").length;
    const providerByExchange = new Map(venues.map((item) => [item.exchange, item]));
    const paperEvidenceReadyPairs = (discovery?.selectedPairs ?? []).filter((pair) =>
      providerByExchange.get(pair.exchange)?.paperEvidenceReady === true).length;
    const bestQualified = maximum(economics?.assessments.filter((item) => item.evidence !== null) ?? [],
      (item) => item.evidence!.modeledNetPercent);
    const closestCandidate = maximum(discovery?.rankings ?? [], (item) => item.rankScore);
    const currentWindowMs = Math.max(configuration.signalTtlMs * 12, 60_000);
    const latestAdmissionCurrent = isCurrent(latestAdmission?.generatedAt, now, currentWindowMs);
    const latestIntakeCurrent = isCurrent(latestIntake?.generatedAt, now, currentWindowMs);
    const state: StatisticalPaperClosureState = !runtime.running || !discovery || !economics
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
              : discovery.promotedPairs === 0
                ? "RESEARCH_BLOCKED"
                : paperEvidenceReadyPairs === 0
                  ? "DERIVATIVE_EVIDENCE_BLOCKED"
                  : "WAITING_FOR_ENTRY_DISLOCATION";
    return freeze({
      state,
      message: closureMessage(state, closestCandidate, venues),
      controller: {running: runtime.running, currentSignals: runtime.currentSignalCount,
        totalSignalsObserved: runtime.totalSignalsObserved, lastSignalObservedAt: runtime.lastSignalObservedAt},
      research: {eligibleMarkets: discovery?.eligibleMarkets ?? 0, candidatePairs: discovery?.candidatePairs ?? 0,
        selectedPairs: discovery?.selectedPairs.length ?? 0, promotedPairs: discovery?.promotedPairs ?? 0,
        collectingPairs: discovery?.collectingPairs ?? 0, rejectedPairs: discovery?.rejectedPairs ?? 0,
        signalEligiblePairs: discovery?.signalEligiblePairs.length ?? 0,
        minimumSamplesForRequiredFolds: discovery?.requirements.minimumSamplesForRequiredFolds ?? null,
        minimumOutOfSampleTrades: discovery?.requirements.minimumOutOfSampleTrades ?? null,
        closestCandidate: closestCandidate ? {pairId: closestCandidate.pairId, state: closestCandidate.state,
          sampleCount: closestCandidate.sampleCount, outOfSampleTrades: closestCandidate.outOfSampleTrades,
          rankScore: closestCandidate.rankScore, blockers: [...closestCandidate.blockers]} : null,
        dominantBlockers: countStringBlockers(discovery?.rankings.flatMap((item) => item.blockers) ?? []).slice(0, 8)},
      economics: {sourceSnapshotGeneratedAt: economics?.sourceSnapshotGeneratedAt ?? null,
        evaluatedPairs: economics?.evaluatedPairs ?? 0, qualifiedPairs: economics?.qualifiedPairs ?? 0,
        blockedPairs: economics?.blockedPairs ?? 0,
        bestQualifiedPair: bestQualified?.evidence ? qualifiedPairSummary(bestQualified) : null,
        dominantBlockers: countStringBlockers(economics?.assessments.flatMap((item) => item.blockers) ?? []).slice(0, 8)},
      derivativeEvidence: {targetQuoteNotionalPerLeg: configuration.targetQuoteNotional,
        conservativePairMarginTarget, configuredVenues: venues.length,
        authenticatedReadReadyVenues: venues.filter((item) => item.authenticatedReadReady).length,
        targetMarginCoveredVenues: venues.filter((item) => item.targetMarginCovered).length,
        feeConfiguredVenues: venues.filter((item) => item.feeConfigured).length,
        paperEvidenceReadyVenues: venues.filter((item) => item.paperEvidenceReady).length,
        paperEvidenceReadyPairs, venues},
      lineage: {admissionsObserved: strategyAdmissions.length,
        plansAdmitted: strategyAdmissions.filter((item) => item.decision === "SHADOW_SIGNAL_ADMITTED" && item.plan !== null).length,
        latestPlanAdmissionDecision: latestAdmission?.decision ?? null, intakeObserved: strategyIntake.length,
        latestPlanIntakeState: latestIntake?.state ?? null,
        latestPlanIntakeBlockers: [...(latestIntake?.blockers ?? [])], activeQueue, completedQueue},
    });
  }

  private report(
    lanes: readonly StatisticalPaperLifecycleLane[],
    context: ReturnType<StatisticalPaperLifecycleObservabilityService["buildClosureContext"]>,
    now: number,
  ): StatisticalPaperLifecycleReport {
    const previewed = lanes.filter((lane) => lane.dryRun.evaluated);
    return freeze({version: "73.0", generatedAt: now, strategyId: "statistical-arbitrage",
      mode: "STATISTICAL_ARBITRAGE_PAPER_CLOSURE_OBSERVABILITY", state: context.state, message: context.message,
      evidenceStatus: lanes.length > 0 ? "AVAILABLE" : "NO_DATA", controller: context.controller,
      research: context.research, economics: context.economics, derivativeEvidence: context.derivativeEvidence,
      lineage: context.lineage,
      summary: {selectedPairs: lanes.length,
        researchPromoted: lanes.filter((lane) => lane.research.state === "PROMOTED").length,
        currentSignals: lanes.filter((lane) => lane.lineage.signalId !== null).length,
        plansCompiled: lanes.filter((lane) => lane.lineage.planId !== null).length,
        dryRunsEvaluated: previewed.length,
        paperEligible: previewed.filter((lane) => lane.dryRun.state === "ELIGIBLE").length,
        paperBlocked: lanes.filter((lane) => lane.state === "RESEARCH_BLOCKED" || lane.state === "PAPER_ADMISSION_BLOCKED" ||
          lane.state === "CENTRAL_ADMISSION_BLOCKED" || lane.state === "PLAN_COMPILATION_BLOCKED" || lane.state === "INTAKE_BLOCKED").length,
        queued: lanes.filter((lane) => lane.state === "QUEUED" || lane.state === "DUPLICATE").length},
      lanes, safety: {readOnlyObservability: true, actualSignalsOnly: true, syntheticSignalsAllowed: false,
        previewQueueMutationPerformed: false, capitalReservationMutationPerformed: false, paperExecutionPerformed: false,
        researchThresholdsMutated: false, signalFabricationAllowed: false, balanceOrMarginInferenceAllowed: false,
        cointegrationVerified: false, meanReversionGuaranteed: false,
        liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }
}

function qualifiedPairSummary(assessment: StatisticalArbitrageAssessment) {
  const evidence = assessment.evidence!;
  return {pairId: assessment.pairId, exchange: assessment.exchange, direction: evidence.direction,
    zScore: evidence.zScore, entryZScoreThreshold: evidence.entryZScoreThreshold,
    modeledNetQuote: evidence.modeledNetQuote, modeledNetPercent: evidence.modeledNetPercent};
}

function closureMessage(
  state: StatisticalPaperClosureState,
  closest: StatisticalPairResearchCandidate | null,
  venues: readonly DerivativePaperVenueEvidenceSummary[],
): string {
  if (state === "NO_DATA") return "Strategy #8 controller, discovery or current economics evidence is unavailable; readiness is not inferred.";
  if (state === "RESEARCH_BLOCKED") {
    if (!closest) return "No bounded statistical research candidate is available for promotion.";
    return `${closest.pairId} is the highest-ranked current candidate; ${closest.blockers[0] ?? "confirmed promotion is still required"}`;
  }
  if (state === "DERIVATIVE_EVIDENCE_BLOCKED") {
    const blocked = venues.filter((item) => !item.paperEvidenceReady).map((item) => item.exchange).join(", ");
    return `Authenticated positions, explicit fees and conservative pair margin are incomplete: ${blocked || "NO_DATA"}.`;
  }
  if (state === "WAITING_FOR_ENTRY_DISLOCATION") return "Research promotion and derivative preflight are ready; no current cost-positive z-score entry has qualified.";
  if (state === "SIGNAL_AVAILABLE") return "A current promoted, depth-aware and cost-positive Strategy #8 signal is available for central admission.";
  if (state === "SIGNAL_ADMITTED") return "A current Strategy #8 signal has plan-bearing central admission evidence.";
  if (state === "PAPER_BLOCKED") return "A Strategy #8 plan reached central PAPER intake and remains fail-closed on current runtime evidence.";
  return "A Strategy #8 plan has actual central PAPER queue evidence.";
}

function countStringBlockers(values: readonly string[]): {code: string; count: number}[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({code, count}))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function maximum<T>(values: readonly T[], score: (value: T) => number): T | null {
  return values.reduce<T | null>((best, value) => best === null || score(value) > score(best) ? value : best, null);
}

function newest<T extends {readonly generatedAt: number}>(values: readonly T[]): T | null {
  return maximum(values, (value) => value.generatedAt);
}

function isCurrent(timestamp: number | null | undefined, now: number, windowMs: number): boolean {
  return timestamp !== null && timestamp !== undefined && timestamp <= now && now - timestamp <= windowMs;
}

function lifecycleState(
  candidate: StatisticalPairResearchCandidate,
  signal: StatisticalArbitrageStrategySignal | null,
  admission: CentralStrategyAdmissionRecord | null,
  plan: CentralStrategyExecutionPlan | null,
  preview: CentralPaperPlanAdmission | null,
  intake: CentralPaperIntakeRecord | null,
  queue: CentralPaperQueueRecord | null,
): StatisticalPaperLifecycleState {
  if (candidate.state !== "PROMOTED") return "RESEARCH_BLOCKED";
  if (!signal) return "AWAITING_ENTRY_SIGNAL";
  if (!admission) return "AWAITING_CENTRAL_ADMISSION";
  if (admission.decision !== "SHADOW_SIGNAL_ADMITTED") return "CENTRAL_ADMISSION_BLOCKED";
  if (!plan) return "PLAN_COMPILATION_BLOCKED";
  if (queue) return queue.state === "QUEUED" || queue.state === "LEASED" || queue.state === "COMPLETED" ? "QUEUED" : "INTAKE_BLOCKED";
  if (intake?.state === "DUPLICATE") return "DUPLICATE";
  if (intake?.state === "BLOCKED" || intake?.state === "FAILED") return "INTAKE_BLOCKED";
  if (!preview || preview.state === "BLOCKED") return "PAPER_ADMISSION_BLOCKED";
  return "PAPER_ADMISSION_ELIGIBLE";
}

function economicKey(exchange: string, leftMarket: string, rightMarket: string): string {
  return `${exchange.toLowerCase()}:${[leftMarket, rightMarket].sort().join(":")}`;
}
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
