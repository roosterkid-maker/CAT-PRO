import assert from "node:assert/strict";
import {join} from "node:path";
import type {CentralPaperSimulationJournalRecord} from "../services/CentralPaperSimulationJournalService";
import {CentralPaperPositionLedgerService} from "../services/CentralPaperPositionLedgerService";

const now = 1_780_000_000_000;
function journal(status: "SIMULATED_ENTRY_COMPLETE" | "SIMULATED_CYCLE_COMPLETE", resultId: string): CentralPaperSimulationJournalRecord {
  return {version: "40.0", id: `journal:${resultId}`, resultId, planId: `plan:${resultId}`, queueRecordId: `queue:${resultId}`,
    leaseId: `lease:${resultId}`, strategyId: status === "SIMULATED_CYCLE_COMPLETE" ? "triangular-arbitrage" : "funding-rate-arbitrage",
    state: "READY_FOR_POSITION_ACCOUNTING", capturedAt: now, updatedAt: now,
    simulation: {generatedAt: now, recoveryRequired: false, status, pnlEvidenceStatus: status === "SIMULATED_CYCLE_COMPLETE" ? "AVAILABLE" : "NO_DATA",
      realizedPnlAsset: status === "SIMULATED_CYCLE_COMPLETE" ? "USDT" : null,
      realizedNetProfit: status === "SIMULATED_CYCLE_COMPLETE" ? 1 : null,
      cycleSettlement: status === "SIMULATED_CYCLE_COMPLETE" ? {id: `cycle-settlement:${resultId}`, asset: "USDT", initialQuantity: 100,
        finalQuantity: 101, realizedNetProfit: 1, legResultIds: ["leg-buy"], source: "SIMULATED_FULL_FILL_PRICE_AND_EXPLICIT_FEE_FLOW"} : null,
      legs: [{legId: "leg-buy", exchange: "binance", product: "PERPETUAL",
      market: "BTCUSDT", settlementAsset: "USDT", filledQuantity: 1, signedPositionDelta: 1, averageFillPrice: 100, referencePrice: 100, feeQuote: 0.1}]},
    sharedRecoveryIntentIds: [], terminalEvidenceId: null, realizedPnlBooked: false, accountMutationPerformed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false} as unknown as CentralPaperSimulationJournalRecord;
}

async function main(): Promise<void> {
  const file = join(process.cwd(), "central-paper-position-ledger.jsonl");
  const service = new CentralPaperPositionLedgerService(file, 10);
  const open = service.recordEntry(journal("SIMULATED_ENTRY_COMPLETE", "entry-1"), now + 1);
  assert.equal(open.state, "OPEN");
  assert.equal(open.positions[0]?.status, "OPEN");
  assert.equal(open.realizedPnlEvidenceStatus, "NO_DATA");
  assert.equal(open.realizedNetPnlQuote, null);
  const duplicate = service.recordEntry(journal("SIMULATED_ENTRY_COMPLETE", "entry-1"), now + 2);
  assert.equal(duplicate.id, open.id);

  const cycle = service.recordEntry(journal("SIMULATED_CYCLE_COMPLETE", "cycle-1"), now + 3);
  assert.equal(cycle.state, "CLOSED");
  assert.equal(cycle.realizedNetPnlQuote, 1);
  assert.equal(cycle.positions[0]?.realizedPnlQuote, null);

  const restored = new CentralPaperPositionLedgerService(file, 10);
  assert.equal(restored.getByResultId("entry-1")?.state, "OPEN");
  const diagnostics = restored.getDiagnostics(now + 4);
  assert.equal(diagnostics.openGroups, 1);
  assert.equal(diagnostics.cycleCapturedGroups, 0);
  assert.equal(diagnostics.closedGroups, 1);
  assert.equal(diagnostics.safety.closeEvidenceRequiredForPnl, true);
  assert.throws(() => service.recordEntry({...journal("SIMULATED_ENTRY_COMPLETE", "bad"), state: "PENDING_SHARED_RECOVERY"}, now + 5), /recovery-free/);

  console.log("CENTRAL PAPER POSITION LEDGER TEST PASSED.");
  console.log("Journaled recovery-free fills became durable open/cycle position evidence; no close evidence or realized P&L, account mutation, LIVE action or order was invented.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
