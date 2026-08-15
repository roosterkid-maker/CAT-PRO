import assert from "node:assert/strict";

import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {StatisticalArbitrageStrategySignal} from "../models/StrategySignal";
import type {StatisticalPairDiscoverySnapshot, StatisticalPairResearchCandidate} from "../statistical-arbitrage/StatisticalPairDiscoveryService";
import type {CentralPaperIntakeRecord} from "../services/CentralPaperIntakeService";
import type {CentralPaperPlanAdmission} from "../services/CentralPaperPlanAdmissionService";
import type {CentralPaperRuntimeEvidenceReport} from "../services/CentralPaperRuntimeEvidenceCollector";
import type {CentralPaperQueueRecord} from "../services/CentralPaperExecutionQueueService";
import type {CentralStrategyAdmissionRecord} from "../services/CentralStrategyExecutionAdmissionService";
import {StatisticalPaperLifecycleObservabilityService} from "../services/StatisticalPaperLifecycleObservabilityService";
import {createStatisticalArbitrageConfiguration} from "../statistical-arbitrage/StatisticalArbitrageConfiguration";
import type {StatisticalArbitrageSnapshot} from "../statistical-arbitrage/StatisticalArbitrageEngine";
import type {DerivativeAccountEvidenceSnapshot} from "../../derivatives/models/DerivativeAccountEvidence";
import type {DerivativeFeeEvidenceSnapshot} from "../../derivatives/models/DerivativeFeeEvidence";

const now = 1_800_000_000_000;

function candidate(pairId: string, leftMarket: string, rightMarket: string,
  state: StatisticalPairResearchCandidate["state"]): StatisticalPairResearchCandidate {
  return {pairId, exchange: "binance", leftMarket, rightMarket, state, qualificationState: state,
    lifecycle: {state, qualificationState: state, publishedState: state,
      consecutivePromotionPasses: state === "PROMOTED" ? 3 : 0, consecutiveDemotionFailures: 0,
      promotionConfirmationsRequired: 3, demotionConfirmationsRequired: 3,
      firstObservedAt: now - 1_000, stateChangedAt: now - 1_000, lastEvaluatedAt: now,
      lastTransitionReason: state === "PROMOTED" ? "PROMOTION_CONFIRMED" : "HISTORY_COLLECTION_REQUIRED",
      signalEligible: state === "PROMOTED", blockers: state === "PROMOTED" ? [] : ["Historical samples 50/125."]},
    seeded: false,
    liquidityFloorQuote: 1_000, sampleCount: state === "PROMOTED" ? 200 : 50,
    returnCorrelation: state === "PROMOTED" ? 0.8 : 0.2, walkForwardPassed: state === "PROMOTED",
    regimeAdmitted: state === "PROMOTED", outOfSampleTrades: state === "PROMOTED" ? 12 : 0,
    outOfSampleNetPercent: state === "PROMOTED" ? 0.5 : null, maximumDrawdownPercent: 0.2,
    rankScore: state === "PROMOTED" ? 90 : 10,
    blockers: state === "PROMOTED" ? [] : ["Historical samples 50/125."],
    walkForward: {evidenceStatus: state === "PROMOTED" ? "AVAILABLE" : "INSUFFICIENT_DATA",
      validationPassed: state === "PROMOTED", sampleCount: state === "PROMOTED" ? 200 : 50,
      folds: [], summary: {completedFolds: state === "PROMOTED" ? 3 : 0,
        totalTrades: state === "PROMOTED" ? 12 : 0, wins: 8, winRatePercent: 66,
        grossReturnPercent: 1, netReturnPercent: 0.5, maximumDrawdownPercent: 0.2}, blockers: [],
      generatedAt: now, version: "33.0", featureVersion: "STAT_PAIR_LOG_PRICE_V1",
      pairId, safety: {expandingWindow: true, outOfSampleOnly: true, costsApplied: true,
        safetyBufferApplied: true, cointegrationVerified: false, livePromotionAuthorized: false,
        paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}},
    regime: {generatedAt: now, version: "33.0", featureVersion: "STAT_PAIR_LOG_PRICE_V1", pairId,
      regime: state === "PROMOTED" ? "STABLE_CORRELATED" : "INSUFFICIENT_DATA",
      sampleCount: state === "PROMOTED" ? 60 : 50, returnCorrelation: state === "PROMOTED" ? 0.8 : 0.2,
      averageLegVolatilityPercent: 0.2, livePromotionAuthorized: false}};
}

function signal(id: string, pair: StatisticalPairResearchCandidate): StatisticalArbitrageStrategySignal {
  return {id, strategyId: "statistical-arbitrage", kind: "STATISTICAL_ARBITRAGE_SHADOW_PAIR",
    evidence: {exchange: pair.exchange, leftMarket: pair.leftMarket, rightMarket: pair.rightMarket}} as unknown as StatisticalArbitrageStrategySignal;
}

function plan(id: string, signalId: string): CentralStrategyExecutionPlan {
  return {id, strategyId: "statistical-arbitrage", signalId, generatedAt: now - 100,
    expiresAt: now + 10_000, pattern: "PARALLEL_STATISTICAL_PAIR",
    legs: [{id: `${id}:leg:1`}, {id: `${id}:leg:2`}]} as unknown as CentralStrategyExecutionPlan;
}

function admission(id: string, source: StatisticalArbitrageStrategySignal, compiled: CentralStrategyExecutionPlan): CentralStrategyAdmissionRecord {
  return {id, generatedAt: now, strategyId: "statistical-arbitrage", signalId: source.id,
    decision: "SHADOW_SIGNAL_ADMITTED", plan: compiled, blockers: []} as unknown as CentralStrategyAdmissionRecord;
}

function paperAdmission(planId: string, eligible: boolean): CentralPaperPlanAdmission {
  const passed = eligible;
  return {id: `paper:${planId}`, planId, strategyId: "statistical-arbitrage",
    state: eligible ? "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE" : "BLOCKED",
    blockers: eligible ? [] : ["STATISTICAL_RESEARCH_PROMOTION_NOT_READY"],
    gates: {runtimeEnabled: passed, strategyAllowed: passed, planCurrent: true, evidenceCurrent: true,
      accountReady: passed, capitalApproved: passed, riskApproved: passed, everyLegReady: passed,
      controlsReady: true, researchPromotionReady: passed}} as unknown as CentralPaperPlanAdmission;
}

function runtime(compiled: CentralStrategyExecutionPlan, eligible: boolean): CentralPaperRuntimeEvidenceReport {
  const value = {planId: compiled.id, requestedCapital: eligible ? 100 : null,
    blockers: eligible ? [] : ["STATISTICAL:Completed folds 2/3."],
    evidence: {legs: compiled.legs.map((leg) => ({legId: leg.id, balanceVerified: eligible,
      paperAdapterSupported: true, marketRulesVerified: true, feeEvidenceFresh: true, quoteFresh: true}))}};
  return value as unknown as CentralPaperRuntimeEvidenceReport;
}

function main(): void {
  const collecting = candidate("binance:AAAUSDT:BBBUSDT", "AAAUSDT", "BBBUSDT", "COLLECTING_HISTORY");
  const blockedPair = candidate("binance:CCCUSDT:DDDUSDT", "CCCUSDT", "DDDUSDT", "PROMOTED");
  const queuedPair = candidate("binance:EEEUSDT:FFFUSDT", "EEEUSDT", "FFFUSDT", "PROMOTED");
  const blockedSignal = signal("signal-blocked", blockedPair); const queuedSignal = signal("signal-queued", queuedPair);
  const blockedPlan = plan("plan-blocked", blockedSignal.id); const queuedPlan = plan("plan-queued", queuedSignal.id);
  const blockedAdmission = admission("admission-blocked", blockedSignal, blockedPlan);
  const queuedAdmission = admission("admission-queued", queuedSignal, queuedPlan);
  let previewCalls = 0;
  const discovery = {eligibleMarkets: 6, candidatePairs: 3, promotedPairs: 2, collectingPairs: 1,
    rejectedPairs: 0, signalEligiblePairs: [blockedPair, queuedPair],
    requirements: {minimumSamplesForRequiredFolds: 125, minimumOutOfSampleTrades: 10},
    rankings: [collecting, blockedPair, queuedPair],
    selectedPairs: [collecting, blockedPair, queuedPair].map(({pairId, exchange, leftMarket, rightMarket}) =>
      ({pairId, exchange, leftMarket, rightMarket}))} as unknown as StatisticalPairDiscoverySnapshot;
  const intake = {id: "intake-queued", admissionRecordId: queuedAdmission.id, state: "QUEUED",
    queueRecordId: "queue-queued", blockers: []} as unknown as CentralPaperIntakeRecord;
  const queue = {id: "queue-queued", state: "QUEUED", updatedAt: now,
    plan: queuedPlan} as unknown as CentralPaperQueueRecord;
  const configuration = createStatisticalArbitrageConfiguration({enabled: true, targetQuoteNotional: 100});
  const economics = {generatedAt: now, sourceSnapshotGeneratedAt: now - 10,
    evaluatedPairs: 3, qualifiedPairs: 2, blockedPairs: 1,
    assessments: [{pairId: blockedPair.pairId, exchange: "binance", status: "QUALIFIED", blockers: [],
      evidence: {direction: "LONG_LEFT_SHORT_RIGHT", zScore: -2.5, entryZScoreThreshold: 2,
        modeledNetQuote: 1.5, modeledNetPercent: 0.3}}]} as unknown as StatisticalArbitrageSnapshot;
  const account = {providers: [{exchange: "binance", state: "READY", configured: true, lastSuccessAt: now}],
    evidence: [{exchange: "binance", availableMargin: 1_000, availableMarginUnit: "USDT",
      authenticatedReadVerified: true, positionReadVerified: true, positions: []}]} as unknown as DerivativeAccountEvidenceSnapshot;
  const fees = {evidence: [{exchange: "binance"}]} as unknown as DerivativeFeeEvidenceSnapshot;
  const service = new StatisticalPaperLifecycleObservabilityService({
    getConfiguration: () => configuration,
    getRuntime: () => ({running: true, currentSignalCount: 2, totalSignalsObserved: 2, lastSignalObservedAt: now}),
    getEconomics: () => economics,
    getDiscovery: () => discovery,
    getAccountEvidence: () => account,
    getFeeEvidence: () => fees,
    getSignals: () => [blockedSignal, queuedSignal],
    getAdmissions: () => [blockedAdmission, queuedAdmission],
    getIntake: () => [intake],
    getQueueRecords: () => [queue],
    getQueue: (planId) => planId === queuedPlan.id ? queue : null,
    preview: (compiled) => { previewCalls += 1; const eligible = compiled.id === queuedPlan.id;
      return {runtime: runtime(compiled, eligible), admission: paperAdmission(compiled.id, eligible)}; },
  });

  const report = service.getReport(now);
  assert.equal(report.version, "73.0");
  assert.equal(report.state, "PAPER_QUEUED");
  assert.equal(report.research.promotedPairs, 2);
  assert.equal(report.research.signalEligiblePairs, 2);
  assert.equal(report.economics.qualifiedPairs, 2);
  assert.equal(report.economics.bestQualifiedPair?.modeledNetPercent, 0.3);
  assert.equal(report.derivativeEvidence.paperEvidenceReadyVenues, 1);
  assert.equal(report.derivativeEvidence.paperEvidenceReadyPairs, 3);
  assert.equal(report.lineage.activeQueue, 1);
  assert.equal(report.evidenceStatus, "AVAILABLE");
  assert.equal(report.lanes[0]?.state, "RESEARCH_BLOCKED");
  assert.equal(report.lanes[0]?.lineage.signalId, null);
  assert.equal(report.lanes[0]?.dryRun.evaluated, false);
  assert.equal(report.lanes[1]?.state, "PAPER_ADMISSION_BLOCKED");
  assert.equal(report.lanes[1]?.dryRun.gates?.researchPromotionReady, false);
  assert.ok(report.lanes[1]?.blockers.includes("PAPER:STATISTICAL_RESEARCH_PROMOTION_NOT_READY"));
  assert.equal(report.lanes[2]?.state, "QUEUED");
  assert.equal(report.lanes[2]?.queueState, "QUEUED");
  assert.equal(report.summary.researchPromoted, 2);
  assert.equal(report.summary.currentSignals, 2);
  assert.equal(report.summary.plansCompiled, 2);
  assert.equal(report.summary.dryRunsEvaluated, 2);
  assert.equal(report.summary.paperEligible, 1);
  assert.equal(report.summary.paperBlocked, 2);
  assert.equal(report.summary.queued, 1);
  assert.equal(previewCalls, 2);
  assert.equal(report.safety.actualSignalsOnly, true);
  assert.equal(report.safety.syntheticSignalsAllowed, false);
  assert.equal(report.safety.previewQueueMutationPerformed, false);
  assert.equal(report.safety.capitalReservationMutationPerformed, false);
  assert.equal(report.safety.paperExecutionPerformed, false);
  assert.equal(report.safety.researchThresholdsMutated, false);
  assert.equal(report.safety.signalFabricationAllowed, false);
  assert.equal(report.safety.balanceOrMarginInferenceAllowed, false);
  assert.equal(report.safety.cointegrationVerified, false);
  assert.equal(report.safety.meanReversionGuaranteed, false);
  assert.equal(report.safety.liveExecutionAllowed, false);
  assert.equal(report.safety.orderSubmissionAllowed, false);

  console.log("STATISTICAL PAPER LIFECYCLE OBSERVABILITY TEST PASSED.");
  console.log("Actual-signal lineage and read-only PAPER previews remained fail-closed without queue, capital, execution, LIVE or order mutation.");
}

main();
