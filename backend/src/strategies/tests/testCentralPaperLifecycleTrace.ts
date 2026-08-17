import assert from "node:assert/strict";

import {
  CentralPaperLifecycleTraceService,
  type CentralPaperLifecycleTracePort,
} from "../services/CentralPaperLifecycleTraceService";

const now = 1_800_000_000_000;

const port: CentralPaperLifecycleTracePort = {
  getAdmissions: () => [{
    id: "admission-blocked", generatedAt: now - 300, strategyId: "cross-exchange-market-making",
    signalId: "signal-blocked", decision: "SHADOW_SIGNAL_ADMITTED",
    blockers: ["MAKER_FILL_EVIDENCE_REQUIRED", "HEDGE_BALANCE_EVIDENCE_REQUIRED"],
    plan: {id: "plan-blocked", strategyId: "cross-exchange-market-making"},
  }, {
    id: "admission-complete", generatedAt: now - 200, strategyId: "dynamic-market-making",
    signalId: "signal-complete", decision: "SHADOW_SIGNAL_ADMITTED",
    blockers: ["MAKER_FILL_EVIDENCE_REQUIRED", "CAPITAL_RESERVATION_REQUIRED"],
    plan: {id: "plan-complete", strategyId: "dynamic-market-making"},
  }, {
    id: "admission-waiting", generatedAt: now - 100, strategyId: "triangular-arbitrage",
    signalId: "signal-waiting", decision: "SHADOW_SIGNAL_ADMITTED",
    blockers: ["MAKER_FILL_EVIDENCE_REQUIRED"],
    plan: {id: "plan-waiting", strategyId: "triangular-arbitrage"},
  }],
  getIntake: () => [{
    id: "intake-blocked", generatedAt: now - 290, admissionRecordId: "admission-blocked",
    planId: "plan-blocked", strategyId: "cross-exchange-market-making", state: "BLOCKED",
    paperAdmissionId: null, queueRecordId: null,
    blockers: ["maker-leg:SPOT_EXCHANGE_BALANCE_INSUFFICIENT:USDT"],
  }, {
    id: "intake-complete", generatedAt: now - 190, admissionRecordId: "admission-complete",
    planId: "plan-complete", strategyId: "dynamic-market-making", state: "QUEUED",
    paperAdmissionId: "paper-admission-complete", queueRecordId: "queue-complete", blockers: [],
  }],
  getQueue: () => [{
    id: "queue-complete", plan: {id: "plan-complete", strategyId: "dynamic-market-making"},
    admissionId: "paper-admission-complete", state: "COMPLETED", queuedAt: now - 180,
    updatedAt: now - 170, attempts: 1, evidenceDeferrals: 0, lastEvidenceWaitReason: null,
    terminalEvidenceId: "terminal-complete",
  }],
  getJournal: () => [{
    id: "journal-complete", resultId: "result-complete", planId: "plan-complete",
    queueRecordId: "queue-complete", strategyId: "dynamic-market-making",
    state: "POSITION_ACCOUNTED", capturedAt: now - 160, updatedAt: now - 150,
    terminalEvidenceId: "terminal-complete",
  }],
  getPositions: () => [{
    id: "position-complete", resultId: "result-complete", planId: "plan-complete",
    strategyId: "dynamic-market-making", state: "CLOSED", openedAt: now - 140,
    updatedAt: now - 120, closedAt: now - 120, closeEvidenceId: "close-complete",
    realizedPnlEvidenceStatus: "AVAILABLE", realizedNetPnlQuote: 2.5,
  }],
  getAccounting: () => [{
    id: "accounting-complete", positionGroupId: "position-complete", resultId: "result-complete",
    state: "ACCOUNT_POSTED", capturedAt: now - 110, appliedAt: now - 100, netPnlInr: 207.5,
  }],
  getSoak: () => ({
    thresholds: {minimumClosedCycles: 20, minimumConsecutivePasses: 20},
    strategies: [{strategyId: "dynamic-market-making", state: "SOAK_ACCEPTED",
      closedCycles: 20, consecutivePasses: 20, blockers: []}],
  }),
};

function main(): void {
  const report = new CentralPaperLifecycleTraceService(port).getReport(now);
  assert.equal(report.version, "76.0");
  assert.equal(report.summary.plansObserved, 3);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.soakAccepted, 1);

  const blocked = report.recentTraces.find((item) => item.planId === "plan-blocked")!;
  assert.equal(blocked.state, "BLOCKED");
  assert.equal(blocked.currentStage, "INTAKE");
  assert.equal(blocked.stages[0]?.state, "PASSED");
  assert.equal(blocked.stages[1]?.state, "BLOCKED");
  assert.equal(blocked.stages[2]?.state, "NOT_REACHED");
  assert.match(blocked.nextTransition, /SPOT_EXCHANGE_BALANCE_INSUFFICIENT/);
  assert.ok(!blocked.blockers.includes("MAKER_FILL_EVIDENCE_REQUIRED"),
    "An admitted plan's deferred fill prerequisite must not mask its current intake blocker.");
  assert.deepEqual(blocked.planPrerequisites.find((item) => item.code === "MAKER_FILL_EVIDENCE_REQUIRED"), {
    code: "MAKER_FILL_EVIDENCE_REQUIRED", ownerStage: "JOURNAL", state: "DEFERRED", blocksCurrentStage: false,
  });
  assert.deepEqual(blocked.planPrerequisites.find((item) => item.code === "HEDGE_BALANCE_EVIDENCE_REQUIRED"), {
    code: "HEDGE_BALANCE_EVIDENCE_REQUIRED", ownerStage: "INTAKE", state: "DUE_AT_STAGE", blocksCurrentStage: true,
  });

  const complete = report.recentTraces.find((item) => item.planId === "plan-complete")!;
  assert.equal(complete.state, "SOAK_ACCEPTED");
  assert.equal(complete.passedStages, 7);
  assert.equal(complete.closedPnlInr, 207.5);
  assert.equal(complete.integrityBlockers.length, 0);
  assert.ok(complete.planPrerequisites.every((item) => item.state === "RESOLVED"));

  const waiting = report.recentTraces.find((item) => item.planId === "plan-waiting")!;
  assert.equal(waiting.state, "WAITING");
  assert.equal(waiting.currentStage, "INTAKE");
  assert.equal(waiting.stages[1]?.state, "WAITING");
  assert.equal(waiting.stages[2]?.state, "NOT_REACHED");
  assert.equal(waiting.planPrerequisites[0]?.state, "DEFERRED");

  const mismatchedPort: CentralPaperLifecycleTracePort = {
    ...port,
    getAdmissions: () => port.getAdmissions(now).slice(0, 1),
    getIntake: () => [{...port.getIntake(now)[0]!, admissionRecordId: "wrong-admission"}],
    getQueue: () => [], getJournal: () => [], getPositions: () => [], getAccounting: () => [],
  };
  const mismatch = new CentralPaperLifecycleTraceService(mismatchedPort).getReport(now);
  assert.equal(mismatch.summary.lineageIntegrityFailures, 1);
  assert.deepEqual(mismatch.recentTraces[0]?.integrityBlockers,
    ["INTAKE_ADMISSION_LINEAGE_MISMATCH"]);
  assert.equal(mismatch.safety.executionTriggered, false);
  assert.equal(mismatch.safety.accountMutationPerformed, false);
  assert.equal(mismatch.safety.liveExecutionAllowed, false);
  assert.equal(mismatch.safety.orderSubmissionAllowed, false);

  console.log("Central PAPER exact lifecycle trace tests passed.");
}

main();
