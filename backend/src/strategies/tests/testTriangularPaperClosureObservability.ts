import assert from "node:assert/strict";

import {
  createTriangularArbitrageConfiguration,
} from "../triangular-arbitrage/TriangularArbitrageConfiguration";

import type {
  TriangularArbitragePathSimulation,
  TriangularArbitrageSimulationSnapshot,
} from "../triangular-arbitrage/TriangularArbitrageSimulationEngine";

import {
  TriangularPaperClosureObservabilityService,
  type TriangularPaperClosureObservabilityPort,
} from "../triangular-arbitrage/TriangularPaperClosureObservabilityService";

const now = 1_800_000_000_000;

function path(input: {
  id: string;
  grossPercent: number;
  netPercent: number | null;
  blockers: TriangularArbitragePathSimulation["blockers"];
}): TriangularArbitragePathSimulation {
  const initial = 1_000;
  return {
    pathId: input.id,
    exchange: "binance",
    startAsset: "USDT",
    assets: ["USDT", "BTC", "ETH", "USDT"],
    status: input.blockers.length === 0 ? "QUALIFIED" : "BLOCKED",
    blockers: input.blockers,
    initialSizingLimitQuantity: initial,
    initialInputQuantity: initial,
    retainedStartQuantity: 0,
    capitalUtilizationPercent: 100,
    finalOutputQuantity: input.netPercent === null ? null : initial * (1 + input.netPercent / 100),
    netProfitQuantity: input.netPercent === null ? null : initial * input.netPercent / 100,
    netProfitPercent: input.netPercent,
    referenceGrossMultiplier: 1 + input.grossPercent / 100,
    referenceGrossProfitPercent: input.grossPercent,
    referenceFeeAdjustedProfitPercent: input.netPercent,
    feeDragPercent: input.netPercent === null ? null : input.grossPercent - input.netPercent,
    quantizationDragPercent: 0,
    computedNetMultiplier: input.netPercent === null ? null : 1 + input.netPercent / 100,
    legs: [],
    executionAuthorized: false,
    automaticExecutionAllowed: false,
  };
}

const simulation: TriangularArbitrageSimulationSnapshot = {
  generatedAt: now - 10,
  sourceSnapshotGeneratedAt: now - 20,
  evaluatedPaths: 2,
  qualifiedPaths: 0,
  blockedPaths: 2,
  simulations: [
    path({id: "best-evaluable", grossPercent: 0.04, netPercent: -0.26,
      blockers: ["MINIMUM_NET_PROFIT_NOT_MET"]}),
    path({id: "stale", grossPercent: -0.1, netPercent: null,
      blockers: ["STALE_LEG_EVIDENCE"]}),
  ],
  safety: {
    shadowOnly: true,
    paperExecutionAllowed: false,
    liveExecutionAllowed: false,
    orderSubmissionAllowed: false,
  },
};

function main(): void {
  let currentSignals = 0;
  let admissions: ReturnType<TriangularPaperClosureObservabilityPort["getAdmissions"]> = [];
  let intake: ReturnType<TriangularPaperClosureObservabilityPort["getIntake"]> = [];
  const configuration = createTriangularArbitrageConfiguration({
    enabled: true,
    minimumNetProfitPercent: 0.2,
  });
  const port: TriangularPaperClosureObservabilityPort = {
    getConfiguration: () => configuration,
    getRuntime: () => ({running: true, currentSignalCount: currentSignals,
      totalSignalsObserved: currentSignals, lastSignalObservedAt: currentSignals > 0 ? now - 100 : null}),
    getSimulation: () => structuredClone(simulation),
    getLastEconomicallyEvaluableSimulation: () => structuredClone(simulation),
    getAdmissions: () => admissions,
    getIntake: () => intake,
    getQueue: () => [],
  };

  const service = new TriangularPaperClosureObservabilityService(port, 1_000);
  const waiting = service.getReport(now);
  assert.equal(waiting.version, "87.0");
  assert.equal(waiting.state, "WAITING_FOR_QUALIFIED_EDGE");
  assert.equal(waiting.economics.evaluatedPaths, 2);
  assert.equal(waiting.economics.evidenceState, "CURRENT");
  assert.equal(waiting.economics.currentEvaluatedPaths, 2);
  assert.equal(waiting.economics.economicallyEvaluablePaths, 1);
  assert.equal(waiting.economics.grossPositivePaths, 1);
  assert.equal(waiting.economics.netPositivePaths, 0);
  assert.equal(waiting.economics.bestGrossPath?.pathId, "best-evaluable");
  assert.equal(waiting.economics.bestNetPath?.netProfitPercent, -0.26);
  assert.equal(waiting.economics.nearestPaths.length, 1);
  assert.equal(waiting.economics.exchanges[0]?.exchange, "binance");
  assert.equal(waiting.economics.exchanges[0]?.economicallyEvaluablePaths, 1);
  assert.ok(Math.abs((waiting.economics.thresholdShortfallPercent ?? 0) - 0.46) < 1e-9);
  assert.equal(waiting.economics.dominantBlockers[0]?.code, "MINIMUM_NET_PROFIT_NOT_MET");
  assert.equal(waiting.safety.profitabilityThresholdMutated, false);
  assert.equal(waiting.safety.signalFabricationAllowed, false);
  assert.equal(waiting.safety.paperExecutionTriggeredByRead, false);
  assert.equal(waiting.safety.liveExecutionAllowed, false);
  assert.equal(waiting.safety.orderSubmissionAllowed, false);
  assert.deepEqual(waiting.fundingPolicy.upfrontWalletBalanceLegs, [1]);
  assert.deepEqual(waiting.fundingPolicy.previousLegProceedsFundedLegs, [2, 3]);
  assert.equal(waiting.fundingPolicy.startAsset, "USDT");
  assert.equal(waiting.fundingPolicy.intermediateWalletBalanceRequired, false);

  const currentEmptyPort: TriangularPaperClosureObservabilityPort = {
    ...port,
    getSimulation: () => ({
      ...structuredClone(simulation),
      sourceSnapshotGeneratedAt: now - 5,
      evaluatedPaths: 0,
      qualifiedPaths: 0,
      blockedPaths: 0,
      simulations: [],
    }),
  };
  const retained = new TriangularPaperClosureObservabilityService(currentEmptyPort, 1_000).getReport(now);
  assert.equal(retained.economics.evidenceState, "RECENT_LAST_ECONOMIC");
  assert.equal(retained.economics.currentEvaluatedPaths, 0);
  assert.equal(retained.economics.evaluatedPaths, 2);
  assert.match(retained.message, /current scan has no complete route economics/i);

  currentSignals = 1;
  admissions = [{generatedAt: now - 100, strategyId: "triangular-arbitrage",
    decision: "SHADOW_SIGNAL_ADMITTED", plan: {id: "triangle-plan"}, blockers: []}];
  intake = [{generatedAt: now - 50, strategyId: "triangular-arbitrage", planId: "triangle-plan",
    state: "BLOCKED", blockers: ["leg-1:SPOT_EXCHANGE_BALANCE_UNVERIFIED"]}];
  const blocked = service.getReport(now);
  assert.equal(blocked.state, "PAPER_BLOCKED");
  assert.equal(blocked.lineage.plansAdmitted, 1);
  assert.equal(blocked.lineage.latestPlanIntakeState, "BLOCKED");
  assert.deepEqual(blocked.lineage.latestPlanIntakeBlockers,
    ["leg-1:SPOT_EXCHANGE_BALANCE_UNVERIFIED"]);

  console.log("TRIANGULAR PAPER CLOSURE OBSERVABILITY TEST PASSED.");
  console.log("Real edge economics and exact central lineage remained read-only; no threshold, signal, PAPER, LIVE or order action was manufactured.");
}

main();
