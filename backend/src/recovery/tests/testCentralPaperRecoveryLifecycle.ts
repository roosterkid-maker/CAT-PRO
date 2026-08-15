import assert from "node:assert/strict";
import {CentralPaperRecoveryLifecycleService, type CentralPaperRecoveryLifecyclePort, type CentralPaperRecoveryMarketSource} from "../services/CentralPaperRecoveryLifecycleService";
import type {CentralPaperSimulationJournalRecord} from "../../strategies/services/CentralPaperSimulationJournalService";
import type {CentralPaperRecoverySettlementEvidence, CentralPaperPositionGroup} from "../../strategies/services/CentralPaperPositionLedgerService";

const now = 1_781_000_000_000;
const journal = {version: "40.0", id: "journal:recovery", resultId: "result:recovery", planId: "plan:recovery",
  queueRecordId: "queue:recovery", leaseId: "lease:recovery", strategyId: "cross-exchange-market-making",
  state: "SHARED_RECOVERY_STAGED", capturedAt: now, updatedAt: now, sharedRecoveryIntentIds: ["intent:1"], terminalEvidenceId: null,
  simulation: {id: "result:recovery", generatedAt: now, recoveryRequired: true,
    settlementPolicy: {kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresPassiveFillEvidence: true},
    legs: [{legId: "maker", exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", settlementAsset: "USDT",
      filledQuantity: 1, filledNotional: 100, averageFillPrice: 100, referencePrice: 100, feeQuote: 0.1, signedPositionDelta: 1}],
    economicExposure: [{product: "SPOT", market: "BTCUSDT", signedQuantity: 1}]},
  realizedPnlBooked: false, accountMutationPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false} as unknown as CentralPaperSimulationJournalRecord;

function main(): void {
  let settlement: CentralPaperRecoverySettlementEvidence | null = null; let marked = 0; let booked = 0; let released = 0;
  const port: CentralPaperRecoveryLifecyclePort = {
    getPending: () => [journal],
    recordSettlement: (_journal, evidence) => { settlement = evidence; return {id: "group:recovery", planId: journal.planId,
      resultId: journal.resultId, state: "CLOSED", realizedPnlAsset: evidence.settlementAsset,
      realizedNetPnlQuote: evidence.realizedNetPnlQuote} as CentralPaperPositionGroup; },
    markCompleted: () => { marked += 1; },
    convert: (asset, quantity, context, observedAt) => ({id: `conversion:${context}`, sourceAsset: asset, targetAsset: "INR",
      sourceQuantity: quantity, targetQuantity: quantity * 85, path: [], generatedAt: observedAt, expiresAt: observedAt + 1_000,
      valuationOnly: true, orderSubmissionAllowed: false}),
    book: () => { booked += 1; }, releaseCapital: () => { released += 1; },
  };
  const source: CentralPaperRecoveryMarketSource = {inspect: (_exchange, _product, _market, side, observedAt) => ({
    levels: [{price: side === "SELL" ? 99 : 101, quantity: 2}], sourceTimestamp: observedAt, feePercent: 0.1, feeEvidenceId: "fee:recovery"})};
  const service = new CentralPaperRecoveryLifecycleService({enabled: true, pollIntervalMs: 1_000, maximumRecoveryAgeMs: 30_000}, port, source);
  const result = service.runOnce(now + 100);
  assert.equal(result.state, "COMPLETED"); assert.equal(result.completed, 1); assert.equal(result.accounted, 1);
  assert.equal(marked, 1); assert.equal(booked, 1); assert.equal(released, 1); assert.ok(settlement);
  const captured = settlement as CentralPaperRecoverySettlementEvidence | null;
  if (!captured) throw new Error("Expected captured recovery settlement evidence.");
  assert.equal(captured.realizedNetPnlQuote, -1.199); assert.equal(captured.exchangeOrderEvidenceUsed, false);

  const blocked = new CentralPaperRecoveryLifecycleService({enabled: true, pollIntervalMs: 1_000}, port,
    {inspect: () => null}).runOnce(now + 200);
  assert.equal(blocked.state, "PARTIAL"); assert.equal(blocked.blocked, 1);
  assert.equal(service.getDiagnostics(now + 300).safety.liveExecutionAllowed, false);
  console.log("CENTRAL PAPER RECOVERY LIFECYCLE TEST PASSED.");
  console.log("Staged residual PAPER exposure used fresh full depth and explicit fees, settled durably, posted once and released capital without reaching LIVE or submitting an exchange order.");
}

main();
