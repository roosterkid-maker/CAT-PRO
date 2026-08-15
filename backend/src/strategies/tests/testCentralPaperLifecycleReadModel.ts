import assert from "node:assert/strict";

import {
  CentralPaperLifecycleReadModelService,
  type CentralPaperLifecyclePort,
} from "../services/CentralPaperLifecycleReadModelService";

const now = 1_780_200_000_000;

function port(enabled: boolean): CentralPaperLifecyclePort {
  return {
    getOperatorConfiguration: () => ({
      centralPaper: {
        enabled,
        confirmationPresent: enabled,
        allowedStrategies: enabled ? ["funding-rate-arbitrage"] : [],
      },
      blockers: [],
    }),
    getAdmission: () => ({running: true, records: 9, canonicalPlansCompiled: 8}),
    getIntake: () => ({running: true, records: 7, states: {blocked: 2, queued: 3, duplicate: 1, failed: 0}}),
    getQueue: () => ({records: 5, states: {queued: 1, leased: 0, completed: 3, rejected: 1, expired: 0}}),
    getWorker: () => ({enabled, serviceRunning: enabled, running: false, runs: 4, completed: 3, recoveryStaged: 0, failed: 0}),
    getJournal: () => ({records: 3, states: {readyForPositionAccounting: 0, pendingSharedRecovery: 0, sharedRecoveryStaged: 0, recoveryStagingFailed: 0, recoveryCompleted: 1, positionAccounted: 3}}),
    getPositions: () => ({groups: 3, openGroups: 1, cycleCapturedGroups: 0, closedGroups: 2, realizedPnlEvidenceStatus: "AVAILABLE", realizedNetPnlQuote: 4}),
    getPositionLifecycle: () => ({enabled, serviceRunning: enabled, running: false, scans: 3, closed: 2, accounted: 2, reconciled: 1, blocked: 0}),
    getCapital: () => ({records: 3, activeAmountInr: 100, states: {pendingReserve: 0, active: 1, pendingRelease: 0, released: 2, rejected: 0}}),
    getRecovery: () => ({enabled, serviceRunning: enabled, running: false, scans: 2, completed: 1, accounted: 1, blocked: 0}),
    getAccounting: () => ({records: 2, pending: 0, posted: 2, totalPostedPnlInr: 340}),
    getDerivativeAccount: () => ({providers: [
      {exchange: "binance", state: "READY", configured: true, lastError: null},
      {exchange: "bybit", state: "READY", configured: true, lastError: null},
    ]}),
    getDerivativeFees: () => ({configuredExchanges: 2, missingExchanges: []}),
    getDerivativeFunding: () => ({summary: {evidence: 12, exactExchangeMarkPrices: 6, boundedMarkPriceProxies: 6, readyProviders: 2},
      providers: [{exchange: "binance", state: "READY", lastError: null}, {exchange: "bybit", state: "READY", lastError: null}]}),
  };
}

function main(): void {
  const disabled = new CentralPaperLifecycleReadModelService(port(false)).getSnapshot(now);
  assert.equal(disabled.state, "DISABLED");
  assert.ok(disabled.blockers.includes("CENTRAL_PAPER_OPERATOR_OPT_IN_NOT_PRESENT"));
  assert.equal(disabled.safety.liveExecutionAllowed, false);

  const active = new CentralPaperLifecycleReadModelService(port(true)).getSnapshot(now);
  assert.equal(active.state, "ACTIVE");
  assert.equal(active.pipeline.queue.queued, 1);
  assert.equal(active.pipeline.positions.realizedNetPnlQuote, 4);
  assert.equal(active.derivativeEvidence.authenticatedProvidersReady, 2);
  assert.equal(active.derivativeEvidence.settledFundingEvidence, 12);
  assert.equal(active.pipeline.positionLifecycle.reconciled, 1);
  assert.equal(active.pipeline.capital.activeAmountInr, 100);
  assert.equal(active.pipeline.recovery.completed, 1);
  assert.deepEqual(active.blockers, []);

  const incompletePort = port(true);
  incompletePort.getDerivativeAccount = () => ({providers: [
    {exchange: "binance", state: "READY", configured: true, lastError: null},
    {exchange: "bybit", state: "NO_DATA", configured: false, lastError: "credentials missing"},
  ]});
  incompletePort.getDerivativeFees = () => ({configuredExchanges: 0, missingExchanges: ["binance", "bybit"]});
  const blocked = new CentralPaperLifecycleReadModelService(incompletePort).getSnapshot(now);
  assert.equal(blocked.state, "BLOCKED");
  assert.ok(blocked.blockers.includes("AUTHENTICATED_DERIVATIVE_ACCOUNT_EVIDENCE_INCOMPLETE"));
  assert.ok(blocked.blockers.includes("EXPLICIT_DERIVATIVE_FEE_EVIDENCE_INCOMPLETE"));
  assert.equal(blocked.safety.orderSubmissionAllowed, false);

  console.log("CENTRAL PAPER LIFECYCLE READ MODEL TEST PASSED.");
  console.log("Admission, intake, queue, worker, journal, positions, reconciliation, accounting and derivative funding evidence were consolidated without granting PAPER opt-in or any LIVE/order authority.");
}

main();
