import assert from "node:assert/strict";

import {
  buildEightStrategyPaperAcceptanceFlow,
  buildEightStrategyPaperConvergence,
  type EightStrategyConvergenceStrategyEvidence,
} from "../services/EightStrategyPaperReadinessService";

type TestAction = EightStrategyConvergenceStrategyEvidence["nextActions"][number];

const waitSignal: TestAction = {code: "WAIT_FOR_QUALIFIED_SIGNAL", detail: "Wait for current market evidence.",
  owner: "MARKET_EVIDENCE", automaticallyPerformed: false};
const collectCycles: TestAction = {code: "COLLECT_REAL_CLOSED_PAPER_CYCLES", detail: "Collect 20 closed cycles.",
  owner: "SOAK_EVIDENCE", automaticallyPerformed: false};
const buildStreak: TestAction = {code: "BUILD_CONSECUTIVE_PAPER_PASS_STREAK", detail: "Build 20 passes.",
  owner: "SOAK_EVIDENCE", automaticallyPerformed: false};
const derivativeRead: TestAction = {code: "RESTORE_AUTHENTICATED_DERIVATIVE_READS",
  detail: "Restore authenticated derivative account evidence.", owner: "EXCHANGE_CREDENTIALS", automaticallyPerformed: false};

function strategy(
  strategyNumber: number,
  nextActions: readonly TestAction[],
  input: {currentSignals?: number; queueRecords?: number; closedCycles?: number; accepted?: boolean} = {},
): EightStrategyConvergenceStrategyEvidence {
  return {
    strategyId: `strategy-${strategyNumber}`,
    strategyNumber,
    displayName: `Strategy ${strategyNumber}`,
    operationalState: input.accepted ? "SOAK_ACCEPTED" : nextActions[0]?.owner === "EXCHANGE_CREDENTIALS" ? "BLOCKED" : "READY_FOR_SIGNAL",
    controller: {running: true},
    signalEvidence: {current: input.currentSignals ?? 0},
    stages: {operator: {state: strategyNumber === 1 ? "NOT_APPLICABLE" : "PASSED"}},
    lineage: {queueRecords: input.queueRecords ?? 0},
    soak: {state: input.accepted ? "SOAK_ACCEPTED" : (input.closedCycles ?? 0) > 0 ? "SOAK_IN_PROGRESS" : "NO_DATA",
      closedCycles: input.closedCycles ?? 0},
    nextActions,
  };
}

function main(): void {
  const balance: TestAction = {code: "RESTORE_REQUIRED_EXCHANGE_BALANCE_EVIDENCE",
    detail: "Restore Bybit BTC balance evidence.", owner: "EXCHANGE_CREDENTIALS", automaticallyPerformed: false};
  const risk: TestAction = {code: "WAIT_FOR_DAILY_RISK_BUDGET", detail: "Wait for explicit risk budget.",
    owner: "OPERATOR", automaticallyPerformed: false};
  const strategies = [
    strategy(1, [waitSignal, buildStreak], {closedCycles: 5}),
    strategy(2, [balance, risk, collectCycles, buildStreak], {currentSignals: 1, queueRecords: 1}),
    strategy(3, [waitSignal, collectCycles, buildStreak]),
    strategy(4, [derivativeRead, collectCycles, buildStreak]),
    strategy(5, [derivativeRead, collectCycles, buildStreak]),
    strategy(6, [derivativeRead, collectCycles, buildStreak]),
    strategy(7, [waitSignal, collectCycles, buildStreak]),
    strategy(8, [derivativeRead, collectCycles, buildStreak]),
  ];

  const convergence = buildEightStrategyPaperConvergence(strategies);
  assert.equal(convergence.firstActionableCode, "RESTORE_AUTHENTICATED_DERIVATIVE_READS");
  assert.ok(convergence.rawActions > convergence.uniqueWorkstreams);
  assert.equal(convergence.uniqueWorkstreams, 6);
  assert.equal(convergence.duplicatedActionsCollapsed, convergence.rawActions - 6);
  const derivative = convergence.workstreams.find((item) => item.code === "RESTORE_AUTHENTICATED_DERIVATIVE_READS")!;
  assert.equal(derivative.rank, 1);
  assert.equal(derivative.priority, "P1");
  assert.equal(derivative.phase, "EVIDENCE_PREREQUISITE");
  assert.equal(derivative.affectedCount, 4);
  assert.equal(derivative.readyNowStrategies, 4);
  assert.deepEqual(derivative.affectedStrategies.map((item) => item.strategyNumber), [4, 5, 6, 8]);
  const soak = convergence.workstreams.find((item) => item.code === "COLLECT_REAL_CLOSED_PAPER_CYCLES")!;
  assert.equal(soak.priority, "P3");
  assert.equal(soak.affectedCount, 7);
  assert.equal(soak.readyNowStrategies, 0);
  assert.equal(soak.deferredStrategies, 7);
  assert.equal(new Set(convergence.workstreams.map((item) => `${item.code}:${item.owner}`)).size, 6);

  const acceptance = buildEightStrategyPaperAcceptanceFlow(strategies);
  assert.equal(acceptance.completedStages, 2);
  assert.equal(acceptance.currentStage, "SIGNAL_QUALIFICATION");
  assert.deepEqual(acceptance.stages.map((item) => [item.id, item.passed, item.total, item.state]), [
    ["CONTROLLERS", 8, 8, "PASSED"],
    ["PAPER_CONTROL", 7, 7, "PASSED"],
    ["SIGNAL_QUALIFICATION", 1, 8, "IN_PROGRESS"],
    ["PAPER_LIFECYCLE", 2, 8, "IN_PROGRESS"],
    ["SOAK_ACCEPTANCE", 0, 8, "WAITING"],
  ]);

  console.log("EIGHT-STRATEGY BLOCKER CONVERGENCE TEST PASSED.");
  console.log("Repeated per-strategy actions collapsed into prioritized owner workstreams while dependencies, market waits, real PAPER lineage and soak remained distinct and advisory-only.");
}

main();
