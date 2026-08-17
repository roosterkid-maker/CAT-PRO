import assert from "node:assert/strict";
import {join} from "node:path";
import {CentralPaperPositionLedgerService} from "../services/CentralPaperPositionLedgerService";
import type {CentralPaperPositionCloseEvidence} from "../services/CentralPaperPositionLedgerService";
import type {CentralPaperSimulationJournalRecord} from "../services/CentralPaperSimulationJournalService";

const now = 1_780_000_000_000;
const journal = {version: "40.0", id: "journal-close", resultId: "result-close", planId: "plan-close", queueRecordId: "queue-close",
  leaseId: "lease-close", strategyId: "funding-rate-arbitrage", state: "READY_FOR_POSITION_ACCOUNTING", capturedAt: now, updatedAt: now,
  simulation: {generatedAt: now, recoveryRequired: false, status: "SIMULATED_ENTRY_COMPLETE", legs: [
    {legId: "long", exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", settlementAsset: "USDT", filledQuantity: 1, signedPositionDelta: 1,
      averageFillPrice: 100, referencePrice: 100, feeQuote: 0.1},
    {legId: "short", exchange: "bybit", product: "PERPETUAL", market: "BTCUSDT", settlementAsset: "USDT", filledQuantity: 1, signedPositionDelta: -1,
      averageFillPrice: 101, referencePrice: 101, feeQuote: 0.101},
  ]}, sharedRecoveryIntentIds: [], terminalEvidenceId: null, realizedPnlBooked: false, accountMutationPerformed: false,
  liveExecutionAllowed: false, orderSubmissionAllowed: false} as unknown as CentralPaperSimulationJournalRecord;

async function main(): Promise<void> {
  const file = join(process.cwd(), "central-paper-position-close.jsonl");
  const service = new CentralPaperPositionLedgerService(file, 10);
  const open = service.recordEntry(journal, now + 1);
  const evidence: CentralPaperPositionCloseEvidence = {id: "close-evidence-1", groupId: open.id, generatedAt: now + 2, expiresAt: now + 5_000,
    exchangeOrderEvidenceUsed: false, positions: open.positions.map((item) => ({positionId: item.id,
      closePrice: item.signedQuantity > 0 ? 103 : 99, closeFeePercent: 0.1, feeEvidenceId: `close-fee:${item.id}`,
      feeEvidenceSource: "ACCOUNT_API", fundingPaymentQuote: item.signedQuantity > 0 ? 0.2 : 0.3,
      fundingPaymentEvidenceId: `funding:${item.id}`, fullyFilled: true}))};
  const closed = service.close(open.id, evidence, now + 3);
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.realizedPnlEvidenceStatus, "AVAILABLE");
  assert.equal(closed.realizedPnlAsset, "USDT");
  assert.ok((closed.realizedNetPnlQuote ?? 0) > 0);
  assert.equal(closed.accountPnlMutationPerformed, false);
  assert.equal(closed.positions.every((item) => item.status === "CLOSED"), true);
  const duplicate = service.close(open.id, evidence, now + 4);
  assert.equal(duplicate.realizedNetPnlQuote, closed.realizedNetPnlQuote);
  assert.throws(() => service.close(open.id, {...evidence, id: "different"}, now + 4), /different close evidence/);

  const restored = new CentralPaperPositionLedgerService(file, 10);
  assert.equal(restored.getByResultId("result-close")?.state, "CLOSED");
  const diagnostics = restored.getDiagnostics(now + 5);
  assert.equal(diagnostics.closedGroups, 1);
  assert.equal(diagnostics.realizedPnlEvidenceStatus, "AVAILABLE");
  assert.equal(diagnostics.safety.accountPnlMutationPerformed, false);

  console.log("CENTRAL PAPER POSITION CLOSE TEST PASSED.");
  console.log("Exact every-position close, fee and funding evidence produced durable realized PAPER P&L while account booking remained separate and no LIVE or exchange order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
