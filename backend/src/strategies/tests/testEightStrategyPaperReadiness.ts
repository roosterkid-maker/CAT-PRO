import assert from "node:assert/strict";

import {
  EightStrategyPaperReadinessService,
  type EightStrategyPaperReadinessPort,
} from "../services/EightStrategyPaperReadinessService";

const now = 1_800_000_000_000;
const ids = [
  "cross-exchange-arbitrage",
  "cross-exchange-market-making",
  "triangular-arbitrage",
  "spot-perpetual-basis-arbitrage",
  "funding-rate-arbitrage",
  "perpetual-perpetual-arbitrage",
  "dynamic-market-making",
  "statistical-arbitrage",
] as const;

const centralIds = ids.slice(1);

const port: EightStrategyPaperReadinessPort = {
  getStrategies: () => ids.map((strategyId, index) => ({
    strategyId, strategyNumber: index + 1, displayName: `Strategy ${index + 1}`,
    running: strategyId !== "perpetual-perpetual-arbitrage",
    currentSignals: strategyId === "cross-exchange-market-making" ? 1 : 0,
    totalSignalsObserved: strategyId === "cross-exchange-market-making" ? 4 : 0,
    lastSignalObservedAt: strategyId === "cross-exchange-market-making" ? now - 100 : null,
    lastError: null, signalBlockers: strategyId === "statistical-arbitrage"
      ? ["PROMOTION_CONFIRMATION_PENDING_1_OF_3"] : ["NO_CURRENT_QUALIFIED_SIGNAL"],
  })),
  getCentralPaper: () => ({
    state: "BLOCKED",
    operator: {centralPaperEnabled: true, confirmationPresent: true, allowedStrategies: [...centralIds]},
    pipeline: {
      admission: {running: true, observed: 1, plansCompiled: 1},
      intake: {running: true, observed: 1, blocked: 0, queued: 1, duplicate: 0, failed: 0},
      queue: {records: 1, queued: 1, leased: 0, completed: 0, rejected: 0, expired: 0},
      worker: {enabled: true, serviceRunning: true, running: true},
      journal: {records: 0, recoveryStagingFailed: 0},
      positions: {groups: 0, openGroups: 0, closedGroups: 0},
      accounting: {records: 0, pending: 0, posted: 0},
      capital: {pendingReserve: 0, pendingRelease: 0, active: 0},
      recovery: {enabled: true, serviceRunning: true, running: true},
    },
    blockers: ["AUTHENTICATED_DERIVATIVE_ACCOUNT_EVIDENCE_INCOMPLETE"],
  }),
  getCentralSoak: () => ({thresholds: {minimumClosedCycles: 20, minimumConsecutivePasses: 20},
    strategies: centralIds.map((strategyId) => ({strategyId,
      state: strategyId === "dynamic-market-making" ? "SOAK_ACCEPTED" as const : "NO_DATA" as const,
      closedCycles: strategyId === "dynamic-market-making" ? 20 : 0,
      consecutivePasses: strategyId === "dynamic-market-making" ? 20 : 0,
      rejectedCycles: 0, recoveryStagingFailures: 0,
      realizedPnlEvidenceStatus: strategyId === "dynamic-market-making" ? "AVAILABLE" as const : "NO_DATA" as const,
      realizedNetPnlInr: strategyId === "dynamic-market-making" ? 100 : null,
      blockers: strategyId === "dynamic-market-making" ? [] : ["CLOSED_PAPER_CYCLES_0_OF_20"],
    }))}),
  getStrategyOne: () => ({totalAttempts: 20, passed: 20, consecutivePasses: 20,
    minimumConsecutivePasses: 20, readyForPaperSoakReview: true, blockers: [],
    persistence: {writeFailures: 0, lastError: null}}),
  getAdmissions: () => [{generatedAt: now - 100, strategyId: "cross-exchange-market-making",
    decision: "SHADOW_SIGNAL_ADMITTED", blockers: [], plan: {id: "plan-xemm"}},
  {generatedAt: now - 80, strategyId: "triangular-arbitrage",
    decision: "ECONOMIC_OWNERSHIP_CONFLICT_REJECTED", blockers: ["ECONOMIC_ROUTE_ALREADY_OWNED"], plan: null}],
  getIntake: () => [{generatedAt: now - 50, strategyId: "cross-exchange-market-making",
    planId: "plan-xemm", state: "QUEUED", blockers: []},
  {generatedAt: now - 40, strategyId: "triangular-arbitrage",
    planId: null, state: "BLOCKED", blockers: ["ECONOMIC_ROUTE_ALREADY_OWNED"]}],
  getQueue: () => [{strategyId: "cross-exchange-market-making", state: "QUEUED", updatedAt: now - 25}],
};

function main(): void {
  const service = new EightStrategyPaperReadinessService(port, {recentEvidenceWindowMs: 1_000});
  const report = service.getReport(now);
  assert.equal(report.version, "79.0");
  assert.equal(report.summary.targetStrategies, 8);
  assert.equal(report.summary.registered, 8);
  assert.equal(report.summary.running, 7);
  assert.equal(report.summary.operationallyUnblocked, 7);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.paperActive, 1);
  assert.equal(report.summary.soakAccepted, 2);
  assert.ok(report.convergence.rawActions > report.convergence.uniqueWorkstreams);
  assert.ok(report.convergence.duplicatedActionsCollapsed > 0);
  assert.equal(report.convergence.workstreams[0]?.code, "RESTORE_STRATEGY_CONTROLLER");
  assert.equal(report.convergence.workstreams[0]?.priority, "P0");
  assert.equal(report.convergence.workstreams[0]?.readyNowStrategies, 1);
  const derivativeWorkstream = report.convergence.workstreams.find((item) =>
    item.code === "RESTORE_AUTHENTICATED_DERIVATIVE_READS");
  assert.equal(derivativeWorkstream, undefined,
    "A generic provider warning must remain deferred until a qualified plan identifies exact venue requirements.");
  assert.equal(new Set(report.convergence.workstreams.map((item) => `${item.code}:${item.owner}`)).size,
    report.convergence.uniqueWorkstreams);
  assert.equal(report.acceptanceFlow.stages[0]?.id, "CONTROLLERS");
  assert.equal(report.acceptanceFlow.stages[0]?.state, "IN_PROGRESS");
  assert.equal(report.acceptanceFlow.stages[1]?.state, "PASSED");
  assert.equal(report.acceptanceFlow.stages.at(-1)?.id, "SOAK_ACCEPTANCE");

  const strategyOne = report.strategies.find((item) => item.strategyId === "cross-exchange-arbitrage")!;
  assert.equal(strategyOne.paperPath, "EXISTING_STRATEGY_ONE");
  assert.equal(strategyOne.operationalState, "SOAK_ACCEPTED");
  assert.equal(strategyOne.stages.operator.state, "NOT_APPLICABLE");

  const marketMaking = report.strategies.find((item) => item.strategyId === "cross-exchange-market-making")!;
  assert.equal(marketMaking.operationalState, "PAPER_ACTIVE");
  assert.equal(marketMaking.stages.admission.state, "PASSED");
  assert.equal(marketMaking.stages.runtimeEvidence.state, "PASSED");
  assert.equal(marketMaking.lineage.activeQueue, 1);
  assert.ok(!marketMaking.runtimeBlockers.includes("AUTHENTICATED_DERIVATIVE_ACCOUNT_EVIDENCE_INCOMPLETE"),
    "Derivative-only account evidence must not block a spot-only strategy.");

  const triangular = report.strategies.find((item) => item.strategyId === "triangular-arbitrage")!;
  assert.equal(triangular.operationalState, "READY_FOR_SIGNAL");
  assert.equal(triangular.nextActions[0]?.code, "WAIT_FOR_QUALIFIED_SIGNAL");
  assert.equal(triangular.stages.admission.state, "WAITING");
  assert.equal(triangular.stages.runtimeEvidence.state, "PASSED");
  assert.equal(triangular.runtimeBlockers.length, 0,
    "Safe economic-ownership deduplication must not be reported as an operational failure.");

  const basis = report.strategies.find((item) => item.strategyId === "spot-perpetual-basis-arbitrage")!;
  assert.equal(basis.operationalState, "READY_FOR_SIGNAL");
  assert.ok(!basis.runtimeBlockers.includes("AUTHENTICATED_DERIVATIVE_ACCOUNT_EVIDENCE_INCOMPLETE"));
  assert.ok(basis.deferredPrerequisites.includes("AUTHENTICATED_DERIVATIVE_ACCOUNT_EVIDENCE_INCOMPLETE"));
  assert.equal(basis.nextActions[0]?.owner, "MARKET_EVIDENCE");
  assert.equal(report.remediation.correctedCodeDefects.length, 3);
  assert.equal(report.remediation.deferredDerivativePrerequisites.length, 4);
  assert.equal(report.remediation.dailyRiskBudget.resolutionClass, "PAPER_EVIDENCE_WAIT");

  const stopped = report.strategies.find((item) => item.strategyId === "perpetual-perpetual-arbitrage")!;
  assert.ok(stopped.runtimeBlockers.includes("STRATEGY_CONTROLLER_NOT_RUNNING"));
  assert.equal(stopped.operationalState, "BLOCKED");

  const dynamic = report.strategies.find((item) => item.strategyId === "dynamic-market-making")!;
  assert.equal(dynamic.operationalState, "SOAK_ACCEPTED");
  assert.equal(dynamic.nextActions[0]?.code, "MAINTAIN_ACCEPTED_PAPER_SOAK");

  const maskedBlockerPort: EightStrategyPaperReadinessPort = {
    ...port,
    getQueue: () => [],
    getIntake: () => [{
      generatedAt: now - 100,
      strategyId: "cross-exchange-market-making",
      planId: "plan-xemm-blocked",
      state: "BLOCKED",
      blockers: [
        "maker-leg:SPOT_EXCHANGE_BALANCE_UNVERIFIED",
        "RISK:Daily trade limit of 50 has been reached.",
      ],
    }, {
      generatedAt: now - 25,
      strategyId: "cross-exchange-market-making",
      planId: null,
      state: "BLOCKED",
      blockers: ["ECONOMIC_ROUTE_ALREADY_OWNED"],
    }],
  };
  const maskedBlockerReport = new EightStrategyPaperReadinessService(maskedBlockerPort,
    {recentEvidenceWindowMs: 1_000}).getReport(now);
  const blockedMarketMaking = maskedBlockerReport.strategies.find((item) =>
    item.strategyId === "cross-exchange-market-making")!;
  assert.equal(blockedMarketMaking.operationalState, "BLOCKED");
  assert.equal(blockedMarketMaking.stages.admission.state, "PASSED");
  assert.equal(blockedMarketMaking.stages.runtimeEvidence.state, "BLOCKED");
  assert.ok(blockedMarketMaking.runtimeBlockers.includes(
    "INTAKE:maker-leg:SPOT_EXCHANGE_BALANCE_UNVERIFIED"));
  assert.ok(blockedMarketMaking.runtimeBlockers.includes(
    "INTAKE:RISK:Daily trade limit of 50 has been reached."));
  assert.equal(blockedMarketMaking.nextActions[0]?.owner, "EXCHANGE_CREDENTIALS");
  assert.ok(blockedMarketMaking.nextActions.some((item) =>
    item.code === "WAIT_FOR_DAILY_RISK_BUDGET" && item.owner === "OPERATOR"));

  assert.equal(report.safety.readOnlyAggregation, true);
  assert.equal(report.safety.blockersNeverAutoClosed, true);
  assert.equal(report.safety.duplicatedActionsCollapsedOnly, true);
  assert.equal(report.safety.workstreamsAdvisoryOnly, true);
  assert.equal(report.safety.priorityNeverGrantsExecution, true);
  assert.equal(report.safety.operatorConfigurationMutated, false);
  assert.equal(report.safety.paperExecutionTriggered, false);
  assert.equal(report.safety.liveExecutionAllowed, false);
  assert.equal(report.safety.orderSubmissionAllowed, false);
  assert.equal(report.safety.orderSubmissionPerformed, false);

  console.log("EIGHT-STRATEGY PAPER READINESS TEST PASSED.");
  console.log("Existing Strategy #1 and the central #2-#8 path were unified without treating derivative-only blockers as global or triggering PAPER/LIVE/order action.");
}

main();
