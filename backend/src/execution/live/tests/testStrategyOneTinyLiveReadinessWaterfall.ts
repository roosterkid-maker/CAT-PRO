import assert from "node:assert/strict";

import {
  StrategyOneTinyLiveReadinessWaterfallService,
} from "../tiny-live/StrategyOneTinyLiveReadinessWaterfallService";

const NOW = 1_787_664_000_000;

function main(): void {
  verifyPaperRuntimeReportsEveryProcessBlocker();
  verifyStagedAuthorityIsReportedWithoutGrantingIt();

  console.log(
    "V198 Tiny-LIVE readiness waterfall passed: all process confirmations, PAPER pause, dynamic arm, account lease, exact-route preflight, one-time authority and final last-look remain separately visible and read-only.",
  );
}

function verifyPaperRuntimeReportsEveryProcessBlocker(): void {
  const report = new StrategyOneTinyLiveReadinessWaterfallService({
    getRuntimeConfiguration: () => ({
      tradingModeLive: false,
      tradingExecutionModeLive: false,
      liveTradingEnabled: false,
      arbitrageConfirmationPresent: false,
      strategyOneRuntimeConfirmationPresent: false,
      liveExecutionConfirmationPresent: false,
      liveOrderSubmissionConfirmationPresent: false,
    }),
    isPaperAutomationPaused: () => false,
    getPreArmDiagnostics: () => ({activeArm: null} as never),
    getAccountLeaseDiagnostics: () => ({
      accountMode: "PAPER",
      activeLease: null,
      lastReconciliationError: null,
    } as never),
    getPilotPreview: () => ({
      state: "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY",
      selected: null,
      blockers: ["No current exact route is ready."],
    } as never),
    getActionDiagnostics: () => ({
      blockingAuthorityPresent: false,
      records: [],
    } as never),
  }).getReport(NOW);

  assert.equal(report.operationalState, "BLOCKED_RUNTIME_CONFIGURATION");
  assert.equal(report.firstIncompleteStage, "RUNTIME_PROCESS_CONFIGURATION");
  assert.equal(report.stages[0]?.reasons.length, 7);
  assert.equal(report.stages[1]?.state, "BLOCKED");
  assert.equal(report.safety.orderSubmissionAuthorized, false);
  assert.equal(report.safety.orderSubmissionPerformed, false);
}

function verifyStagedAuthorityIsReportedWithoutGrantingIt(): void {
  const runtime = {
    tradingModeLive: true,
    tradingExecutionModeLive: true,
    liveTradingEnabled: true,
    arbitrageConfirmationPresent: true,
    strategyOneRuntimeConfirmationPresent: true,
    liveExecutionConfirmationPresent: true,
    liveOrderSubmissionConfirmationPresent: true,
  };
  const candidate = {
    opportunityId: "opportunity-ready",
    market: "SANDUSDT",
    buyExchange: "bybit",
    sellExchange: "coindcx",
    checks: [
      {key: "CURRENT_LIVE_PROFIT_THRESHOLD", state: "PASS", message: "pass", reasons: []},
      {key: "CURRENT_DISPATCH_RESERVED_FRESHNESS", state: "PASS", message: "pass", reasons: []},
    ],
  };
  const baseDependencies = {
    getRuntimeConfiguration: () => runtime,
    isPaperAutomationPaused: () => true,
    getPreArmDiagnostics: () => ({activeArm: {state: "ARMED"}} as never),
    getAccountLeaseDiagnostics: () => ({
      accountMode: "LIVE",
      activeLease: {state: "ACTIVE"},
      lastReconciliationError: null,
    } as never),
    getPilotPreview: () => ({
      state: "READY_FOR_OPERATOR_PREFLIGHT",
      selected: candidate,
      blockers: [],
    } as never),
  };
  const waiting = new StrategyOneTinyLiveReadinessWaterfallService({
    ...baseDependencies,
    getActionDiagnostics: () => ({
      blockingAuthorityPresent: false,
      records: [],
    } as never),
  }).getReport(NOW);

  assert.equal(waiting.operationalState, "READY_FOR_ONE_TIME_AUTHORITY");
  assert.equal(waiting.stages[4]?.state, "PASS");
  assert.equal(waiting.stages[5]?.state, "WAITING");
  assert.equal(waiting.stages[6]?.state, "WAITING");
  assert.equal(waiting.authorityModel.dynamicPoolRequiresPerCoinApproval, false);

  const authorized = new StrategyOneTinyLiveReadinessWaterfallService({
    ...baseDependencies,
    getActionDiagnostics: () => ({
      blockingAuthorityPresent: true,
      records: [{
        state: "AUTHORIZED",
        authorityExpiresAt: NOW + 3_000,
      }],
    } as never),
  }).getReport(NOW);

  assert.equal(authorized.operationalState, "AWAITING_FINAL_LAST_LOOK");
  assert.equal(authorized.stages[5]?.state, "PASS");
  assert.equal(authorized.stages[6]?.state, "WAITING");
  assert.equal(authorized.safety.authorityCreated, false);
}

main();
