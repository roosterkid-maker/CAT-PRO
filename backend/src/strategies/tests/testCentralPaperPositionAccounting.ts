import assert from "node:assert/strict";
import {join} from "node:path";
import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {CentralPaperPositionGroup} from "../services/CentralPaperPositionLedgerService";
import {CentralPaperPositionAccountingService} from "../services/CentralPaperPositionAccountingService";
import type {CentralPaperAccountPort} from "../services/CentralPaperPositionAccountingService";
import type {CentralPaperAssetConversionEvidence} from "../services/CentralPaperCapitalValuationService";

const now = 1_780_000_000_000;
class Account implements CentralPaperAccountPort {
  private account: TradingAccount = {id: "test", name: "test", mode: "PAPER", enabled: true, emergencyStop: false,
    limits: {maximumCapitalPerTrade: 1_000, maximumDailyLoss: 100, maximumOpenTrades: 5, maximumDailyTrades: 50},
    initialCapital: 1_000, currentCapital: 1_000, availableCapital: 1_000, todayProfit: 0, todayLoss: 0, openTrades: 0, tradesToday: 0};
  private active: string | null = null;
  readonly applied = new Set<string>();
  throwAfterApply = false;
  getAccount(): TradingAccount { return structuredClone(this.account); }
  runWithAccountingTransaction<T>(id: string, operation: () => T): T { this.active = id; try { return operation(); } finally { this.active = null; } }
  hasAppliedAccountingTransaction(id: string): boolean { return this.applied.has(id); }
  recordProfit(profit: number): void { if (!this.active || this.applied.has(this.active)) return; this.account.currentCapital += profit; this.account.availableCapital += profit;
    this.applied.add(this.active); if (this.throwAfterApply) throw new Error("simulated crash after account ledger commit"); }
}
function group(id: string, pnl: number): CentralPaperPositionGroup {
  return {id, resultId: `result:${id}`, state: "CLOSED", realizedPnlEvidenceStatus: "AVAILABLE", realizedNetPnlQuote: pnl,
    realizedPnlAsset: "USDT", closeEvidenceId: `close:${id}`, closedAt: now, accountPnlMutationPerformed: false} as CentralPaperPositionGroup;
}
function conversion(id: string, pnl: number): CentralPaperAssetConversionEvidence {
  return {id: `conversion:${id}`, sourceAsset: "USDT", targetAsset: "INR", sourceQuantity: Math.abs(pnl),
    targetQuantity: Math.abs(pnl) * 85, path: [], generatedAt: now, expiresAt: now + 10_000,
    valuationOnly: true, orderSubmissionAllowed: false};
}

async function main(): Promise<void> {
  const file = join(process.cwd(), "central-paper-position-accounting.jsonl");
  const account = new Account();
  const service = new CentralPaperPositionAccountingService(file, account);
  const posted = service.book(group("group-1", 5), conversion("group-1", 5), now + 1);
  assert.equal(posted.state, "ACCOUNT_POSTED");
  assert.equal(posted.netPnlInr, 425);
  assert.equal(account.getAccount().currentCapital, 1_425);
  service.book(group("group-1", 5), conversion("group-1", 5), now + 2);
  assert.equal(account.getAccount().currentCapital, 1_425);

  const crashFile = join(process.cwd(), "central-paper-position-accounting-crash.jsonl");
  const crashAccount = new Account();
  crashAccount.throwAfterApply = true;
  const crashing = new CentralPaperPositionAccountingService(crashFile, crashAccount);
  assert.throws(() => crashing.book(group("group-crash", 7), conversion("group-crash", 7), now + 3), /simulated crash/);
  assert.equal(crashAccount.getAccount().currentCapital, 1_595);
  crashAccount.throwAfterApply = false;
  const replay = new CentralPaperPositionAccountingService(crashFile, crashAccount);
  const report = replay.replayPending((id) => id === "group-crash" ? group("group-crash", 7) : null,
    () => conversion("group-crash", 7), now + 4);
  assert.equal(report.completed, 1);
  assert.equal(crashAccount.getAccount().currentCapital, 1_595);
  assert.equal(replay.get("group-crash")?.state, "ACCOUNT_POSTED");
  assert.equal(replay.getDiagnostics(now + 5).safety.duplicatePnlProtection, true);

  console.log("CENTRAL PAPER POSITION ACCOUNTING TEST PASSED.");
  console.log("Closed-position P&L used journal-first deterministic account transactions, survived a post-commit crash and replayed without duplicate P&L; no LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
