import assert from "node:assert/strict";
import {join} from "node:path";
import type {CentralPaperQueueRecord} from "../services/CentralPaperExecutionQueueService";
import type {CentralMultiLegPaperSimulationResult} from "../services/CentralMultiLegPaperSimulator";
import {CentralPaperSimulationJournalService} from "../services/CentralPaperSimulationJournalService";

const now = 1_780_000_000_000;
const queue = {id: "queue-journal", leaseId: "lease-journal", plan: {id: "plan-journal"}} as CentralPaperQueueRecord;
function result(recoveryRequired: boolean, id: string): CentralMultiLegPaperSimulationResult {
  return {version: "38.0", id, planId: "plan-journal", strategyId: "funding-rate-arbitrage", queueRecordId: "queue-journal", leaseId: "lease-journal",
    generatedAt: now, recoveryRequired, status: recoveryRequired ? "RECOVERY_REQUIRED" : "SIMULATED_ENTRY_COMPLETE",
    settlementPolicy: {kind: "FUNDING_CAPTURE_THEN_EXIT", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
      notBefore: now + 60_000, fundingTimestamps: [now + 1_000, now + 2_000], requiresFundingEvidence: true,
      forcedTimeExitAllowed: false},
    pnlEvidenceStatus: "NO_DATA", realizedPnlAsset: null, realizedNetProfit: null, cycleSettlement: null,
    legs: [{legId: "leg-1", sequence: 1, exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", side: "BUY",
      settlementAsset: "USDT", status: recoveryRequired ? "PARTIALLY_FILLED" : "FILLED", requestedQuantity: 1,
      filledQuantity: recoveryRequired ? 0.5 : 1, referencePrice: 100, averageFillPrice: 100,
      filledNotional: recoveryRequired ? 50 : 100, feePercent: 0.1, feeQuote: recoveryRequired ? 0.05 : 0.1,
      feeEvidenceId: "fee", feeEvidenceSource: "STATIC_CONFIG", signedPositionDelta: recoveryRequired ? 0.5 : 1,
      simulated: true, exchangeOrderId: null}],
    totalFilledNotional: recoveryRequired ? 50 : 100, totalFeeQuote: recoveryRequired ? 0.05 : 0.1,
    economicExposure: [{product: "PERPETUAL", market: "BTCUSDT", signedQuantity: recoveryRequired ? 0.5 : 1}],
    reasons: recoveryRequired ? ["PARTIAL_FILL"] : [], paperOnly: true, accountMutationPerformed: false,
    capitalMutationPerformed: false, liveAdapterReachable: false, exchangeOrderSubmitted: false};
}

async function main(): Promise<void> {
  const file = join(process.cwd(), "central-paper-simulation-journal.jsonl");
  const service = new CentralPaperSimulationJournalService(file, 10);
  const ready = service.capture(queue, result(false, "result-ready"), now + 1);
  assert.equal(ready.state, "READY_FOR_POSITION_ACCOUNTING");
  const duplicate = service.capture(queue, result(false, "result-ready"), now + 2);
  assert.equal(duplicate.id, ready.id);
  const accounted = service.markPositionAccounted("result-ready", "position-ledger-1", now + 3);
  assert.equal(accounted.state, "POSITION_ACCOUNTED");
  assert.equal(accounted.realizedPnlBooked, false);

  const recovery = service.capture(queue, result(true, "result-recovery"), now + 4);
  assert.equal(recovery.state, "PENDING_SHARED_RECOVERY");
  const staged = service.recordRecovery("result-recovery", ["recovery-intent-1"], 0, now + 5);
  assert.equal(staged.state, "SHARED_RECOVERY_STAGED");

  const restored = new CentralPaperSimulationJournalService(file, 10);
  assert.equal(restored.get("result-ready")?.state, "POSITION_ACCOUNTED");
  assert.equal(restored.get("result-recovery")?.sharedRecoveryIntentIds[0], "recovery-intent-1");
  assert.equal(restored.getDiagnostics(now + 6).safety.restartSafe, true);
  assert.throws(() => service.capture({...queue, leaseId: "wrong"}, result(false, "mismatch"), now + 1), /exact queue/);

  console.log("CENTRAL PAPER SIMULATION JOURNAL TEST PASSED.");
  console.log("Simulation evidence was durably captured before terminal acknowledgement, idempotently restored and bound to recovery/accounting lineage without booking P&L, mutating accounts, reaching LIVE or submitting orders.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
