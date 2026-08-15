import assert from "node:assert/strict";
import {join} from "node:path";
import {CentralPaperExecutionQueueService} from "../services/CentralPaperExecutionQueueService";
import {CentralPaperSimulationJournalService} from "../services/CentralPaperSimulationJournalService";
import {CentralPaperPositionLedgerService} from "../services/CentralPaperPositionLedgerService";
import {CentralPaperExecutionWorkerService} from "../services/CentralPaperExecutionWorkerService";
import type {CentralPaperSimulationEvidenceProvider} from "../services/CentralPaperExecutionWorkerService";
import {CentralPaperSharedRecoveryBridgeService} from "../../recovery/adapters/CentralPaperSharedRecoveryBridgeService";
import {SharedRecoveryIntentService} from "../../recovery/services/SharedRecoveryIntentService";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperPlanAdmission} from "../services/CentralPaperPlanAdmissionService";

const now = 1_780_000_000_000;
function plan(id: string): CentralStrategyExecutionPlan {
  return {version: "35.0", id, strategyId: "funding-rate-arbitrage", signalId: `signal:${id}`, signalKind: "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY",
    routeFamily: "PERPETUAL_TWO_VENUE", pattern: "PARALLEL_TWO_LEG", executionOwner: "CENTRAL_SHARED_ORCHESTRATOR",
    settlementPolicy: {kind: "FUNDING_CAPTURE_THEN_EXIT", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", notBefore: now + 1_000,
      fundingTimestamps: [now + 900], requiresFundingEvidence: true, forcedTimeExitAllowed: false},
    compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED", generatedAt: now, expiresAt: now + 20_000,
    legs: [
      {id: `${id}:buy`, sequence: 1, exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", side: "BUY", orderType: "MARKET", quantity: 1, referencePrice: 100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: `${id}:sell`, sequence: 2, exchange: "bybit", product: "PERPETUAL", market: "BTCUSDT", side: "SELL", orderType: "MARKET", quantity: 1, referencePrice: 101, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    ], modeledNetValue: 1, modeledNetValueUnit: "QUOTE", executionReadinessBlockers: [], sourceExecutionAuthorized: false,
    capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false, automaticExecutionAllowed: false,
    paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false};
}
function admission(value: CentralStrategyExecutionPlan): CentralPaperPlanAdmission {
  return {version: "36.0", id: `admission:${value.id}`, generatedAt: now, planId: value.id, strategyId: value.strategyId,
    state: "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE", blockers: [], intrinsicPlanBlockers: [], gates: {runtimeEnabled: true, strategyAllowed: true,
      planCurrent: true, evidenceCurrent: true, accountReady: true, capitalApproved: true, riskApproved: true, everyLegReady: true,
      controlsReady: true, researchPromotionReady: true}, capitalReservationMutationPerformed: false, executionHandoffAllowed: false,
    approvedCapitalInr: 201, paperExecutionPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

async function main(): Promise<void> {
  const queue = new CentralPaperExecutionQueueService(join(process.cwd(), "worker-queue.jsonl"), 10);
  const journal = new CentralPaperSimulationJournalService(join(process.cwd(), "worker-journal.jsonl"), 10);
  const positions = new CentralPaperPositionLedgerService(join(process.cwd(), "worker-positions.jsonl"), 10);
  const shared = new SharedRecoveryIntentService({maximumIntentTtlMs: 60_000, maximumQuoteValue: 100_000, maximumIntents: 10});
  const recovery = new CentralPaperSharedRecoveryBridgeService(shared);
  const full = plan("plan-full");
  const partial = plan("plan-partial");
  queue.enqueue(full, admission(full), now);
  queue.enqueue(partial, admission(partial), now + 1);
  const provider: CentralPaperSimulationEvidenceProvider = {getEvidence: (record, observedAt) => ({planId: record.plan.id, queueRecordId: record.id,
    leaseId: record.leaseId!, generatedAt: observedAt, expiresAt: observedAt + 2_000, exchangeOrderEvidenceUsed: false,
    legs: record.plan.legs.map((item, index) => ({legId: item.id, settlementAsset: "USDT", feePercent: 0.1, feeEvidenceId: `fee:${item.id}`, feeEvidenceSource: "ACCOUNT_API",
      simulatedSlippagePercent: 0, fillRatio: record.plan.id === "plan-partial" && index === 1 ? 0 : 1,
      terminalStatus: record.plan.id === "plan-partial" && index === 1 ? "FAILED" : "FILLED", passiveFillEvidenceId: null}))})};
  const worker = new CentralPaperExecutionWorkerService({enabled: true, workerId: "test-worker", leaseTtlMs: 5_000}, provider,
    queue, undefined, journal, recovery, positions);
  const first = worker.runOnce(now + 2);
  assert.equal(first.state, "POSITION_ACCOUNTED");
  assert.equal(positions.getByResultId(first.simulationResultId!)?.state, "OPEN");
  const second = worker.runOnce(now + 3);
  assert.equal(second.state, "SHARED_RECOVERY_STAGED");
  assert.equal(shared.getReport(now + 4).summary.total, 1);
  const states = queue.getDiagnostics(now + 5).states;
  assert.equal(states.completed, 1);
  assert.equal(states.rejected, 1);
  assert.equal(worker.getDiagnostics(now + 5).safety.liveExecutionAllowed, false);

  const waitingQueue = new CentralPaperExecutionQueueService(join(process.cwd(), "worker-waiting-queue.jsonl"), 10);
  const waiting = plan("plan-waiting");
  waitingQueue.enqueue(waiting, admission(waiting), now);
  const unavailable: CentralPaperSimulationEvidenceProvider = {getEvidence: () => null};
  const waitingWorker = new CentralPaperExecutionWorkerService({enabled: true, workerId: "waiting-worker", leaseTtlMs: 5_000,
    evidenceRetryDelayMs: 500, maximumEvidenceAttempts: 2}, unavailable, waitingQueue);
  assert.equal(waitingWorker.runOnce(now + 1).state, "WAITING_FOR_EVIDENCE");
  assert.equal(waitingQueue.getDiagnostics(now + 2).states.queued, 1);
  assert.equal(waitingWorker.runOnce(now + 499).state, "NO_DATA");
  assert.equal(waitingWorker.runOnce(now + 501).state, "REJECTED_NO_EVIDENCE");
  assert.equal(waitingQueue.getDiagnostics(now + 502).states.rejected, 1);
  assert.equal(waitingWorker.getDiagnostics(now + 503).evidenceDeferred, 1);

  const disabled = new CentralPaperExecutionWorkerService({enabled: false}, provider, queue).runOnce(now + 6);
  assert.equal(disabled.state, "DISABLED");
  console.log("CENTRAL PAPER EXECUTION WORKER TEST PASSED.");
  console.log("One shared worker enforced queue, simulation, journal-first, position or shared-recovery, and terminal acknowledgement ordering with default-disable and no account P&L, LIVE or exchange order action.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
