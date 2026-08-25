import assert from "node:assert/strict";

import type {DerivativeAccountEvidenceSnapshot} from "../../derivatives/models/DerivativeAccountEvidence";
import type {DerivativeFeeEvidenceSnapshot} from "../../derivatives/models/DerivativeFeeEvidence";
import {StatisticalPaperLifecycleObservabilityService} from "../services/StatisticalPaperLifecycleObservabilityService";
import {createStatisticalArbitrageConfiguration} from "../statistical-arbitrage/StatisticalArbitrageConfiguration";
import type {StatisticalArbitrageSnapshot} from "../statistical-arbitrage/StatisticalArbitrageEngine";
import type {
  StatisticalPairDiscoverySnapshot,
  StatisticalPairResearchCandidate,
} from "../statistical-arbitrage/StatisticalPairDiscoveryService";

const now = 1_800_000_000_000;
const configuration = createStatisticalArbitrageConfiguration({
  enabled: true,
  targetQuoteNotional: 100,
  pairs: [{exchange: "binance", leftMarket: "BTCUSDT", rightMarket: "ETHUSDT"}],
});

let promoted = false;
let derivativeReady = false;

function researchCandidate(): StatisticalPairResearchCandidate {
  return {
    pairId: "binance:BTCUSDT:ETHUSDT",
    exchange: "binance",
    leftMarket: "BTCUSDT",
    rightMarket: "ETHUSDT",
    state: promoted ? "PROMOTED" : "COLLECTING_HISTORY",
    rankScore: promoted ? 90 : 45,
    sampleCount: promoted ? 180 : 100,
    outOfSampleTrades: promoted ? 12 : 0,
    walkForwardPassed: promoted,
    regimeAdmitted: true,
    blockers: promoted ? [] : ["Historical samples 100/125."],
  } as unknown as StatisticalPairResearchCandidate;
}

function discovery(): StatisticalPairDiscoverySnapshot {
  const candidate = researchCandidate();
  const pair = {pairId: candidate.pairId, exchange: candidate.exchange,
    leftMarket: candidate.leftMarket, rightMarket: candidate.rightMarket};
  return {
    eligibleMarkets: 2,
    candidatePairs: 1,
    promotedPairs: promoted ? 1 : 0,
    collectingPairs: promoted ? 0 : 1,
    rejectedPairs: 0,
    selectedPairs: [pair],
    signalEligiblePairs: promoted ? [pair] : [],
    rankings: [candidate],
    requirements: {minimumSamplesForRequiredFolds: 125, minimumOutOfSampleTrades: 10},
  } as unknown as StatisticalPairDiscoverySnapshot;
}

function account(): DerivativeAccountEvidenceSnapshot {
  return {
    providers: [{exchange: "binance", configured: true, state: derivativeReady ? "READY" : "NO_DATA",
      lastSuccessAt: derivativeReady ? now : null, lastError: derivativeReady ? null : "signed read unavailable"}],
    evidence: derivativeReady ? [{exchange: "binance", authenticatedReadVerified: true,
      marginReadVerified: true, positionReadVerified: true, availableMargin: 1_000,
      availableMarginUnit: "USDT", positions: []}] : [],
  } as unknown as DerivativeAccountEvidenceSnapshot;
}

const fees = {evidence: [{exchange: "binance"}]} as unknown as DerivativeFeeEvidenceSnapshot;
const economics = {generatedAt: now, sourceSnapshotGeneratedAt: now - 10, evaluatedPairs: 1,
  qualifiedPairs: 0, blockedPairs: 1,
  assessments: [{pairId: "binance:BTCUSDT:ETHUSDT", exchange: "binance", status: "BLOCKED",
    blockers: ["ZSCORE_THRESHOLD_NOT_MET"], evidence: null}]} as unknown as StatisticalArbitrageSnapshot;

function main(): void {
  const service = new StatisticalPaperLifecycleObservabilityService({
    getConfiguration: () => configuration,
    getRuntime: () => ({running: true, currentSignalCount: 0, totalSignalsObserved: 0, lastSignalObservedAt: null}),
    getEconomics: () => economics,
    getDiscovery: () => discovery(),
    getAccountEvidence: () => account(),
    getFeeEvidence: () => fees,
    getSignals: () => [],
    getAdmissions: () => [],
    getIntake: () => [],
    getQueueRecords: () => [],
    getQueue: () => null,
    preview: () => { throw new Error("No plan should be previewed without an actual signal."); },
  });

  const researchBlocked = service.getReport(now);
  assert.equal(researchBlocked.version, "73.0");
  assert.equal(researchBlocked.state, "RESEARCH_BLOCKED");
  assert.equal(researchBlocked.research.closestCandidate?.sampleCount, 100);
  assert.deepEqual(researchBlocked.research.dominantBlockers,
    [{code: "Historical samples 100/125.", count: 1}]);

  promoted = true;
  const derivativeBlocked = service.getReport(now);
  assert.equal(derivativeBlocked.state, "DERIVATIVE_EVIDENCE_BLOCKED");
  assert.equal(derivativeBlocked.derivativeEvidence.conservativePairMarginTarget, 500);
  assert.equal(derivativeBlocked.derivativeEvidence.paperEvidenceReadyPairs, 0);

  derivativeReady = true;
  const waiting = service.getReport(now);
  assert.equal(waiting.state, "WAITING_FOR_ENTRY_DISLOCATION");
  assert.equal(waiting.derivativeEvidence.paperEvidenceReadyPairs, 1);
  assert.deepEqual(waiting.economics.dominantBlockers,
    [{code: "ZSCORE_THRESHOLD_NOT_MET", count: 1}]);
  assert.equal(waiting.safety.researchThresholdsMutated, false);
  assert.equal(waiting.safety.signalFabricationAllowed, false);
  assert.equal(waiting.safety.balanceOrMarginInferenceAllowed, false);
  assert.equal(waiting.safety.cointegrationVerified, false);
  assert.equal(waiting.safety.meanReversionGuaranteed, false);
  assert.equal(waiting.safety.liveExecutionAllowed, false);
  assert.equal(waiting.safety.orderSubmissionAllowed, false);

  console.log("STATISTICAL ARBITRAGE PAPER CLOSURE OBSERVABILITY TEST PASSED.");
  console.log("Research, current economics, derivative account/fee preflight and central lineage remained exact, staged and fail-closed without threshold, signal, balance, LIVE or order mutation.");
}

main();
