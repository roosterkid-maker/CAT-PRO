import assert from "node:assert/strict";
import {join} from "node:path";
import {CentralPaperCapitalAllocationService, type CentralPaperCapitalAccountPort} from "../services/CentralPaperCapitalAllocationService";

const now = 1_780_900_000_000;

class Account implements CentralPaperCapitalAccountPort {
  available = 500;
  readonly applied = new Set<string>();
  reserveCapital(amount: number, transactionId: string): boolean {
    if (this.applied.has(transactionId)) return true;
    if (amount > this.available) return false;
    this.available -= amount; this.applied.add(transactionId); return true;
  }
  releaseCapital(amount: number, transactionId: string): void {
    if (this.applied.has(transactionId)) return;
    this.available += amount; this.applied.add(transactionId);
  }
  hasAppliedAccountingTransaction(transactionId: string): boolean { return this.applied.has(transactionId); }
}

function main(): void {
  const file = join(process.cwd(), `central-capital-${process.pid}.jsonl`);
  const account = new Account();
  const first = new CentralPaperCapitalAllocationService(account, file, 10);
  const active = first.allocate("plan-1", "triangular-arbitrage", 100, now);
  assert.equal(active.state, "ACTIVE");
  assert.equal(account.available, 400);
  assert.equal(first.allocate("plan-1", "triangular-arbitrage", 100, now + 1).id, active.id);
  assert.equal(account.available, 400);

  const restored = new CentralPaperCapitalAllocationService(account, file, 10);
  assert.equal(restored.getByPlanId("plan-1")?.state, "ACTIVE");
  assert.equal(account.available, 400);
  assert.equal(restored.releaseByPlanId("plan-1", "Position durably accounted.", now + 2)?.state, "RELEASED");
  assert.equal(account.available, 500);
  assert.equal(restored.releaseByPlanId("plan-1", "Duplicate release.", now + 3)?.state, "RELEASED");
  assert.equal(account.available, 500);

  const rejected = restored.allocate("plan-2", "funding-rate-arbitrage", 600, now + 4);
  assert.equal(rejected.state, "REJECTED");
  assert.equal(account.available, 500);
  assert.equal(restored.getDiagnostics(now + 5).safety.idempotentAccountTransactions, true);
  console.log("CENTRAL PAPER CAPITAL ALLOCATION TEST PASSED.");
  console.log("Journal-first plan allocations reserved and released shared PAPER capital idempotently across restart; rejected capacity created no hold and no LIVE/order action occurred.");
}

main();
