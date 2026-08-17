import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import {tradingAccountService} from "../../trading/account/TradingAccountService";

export type CentralPaperCapitalAllocationState = "PENDING_RESERVE" | "ACTIVE" | "PENDING_RELEASE" | "RELEASED" | "REJECTED";

export interface CentralPaperCapitalAllocation {
  readonly version: "61.0";
  readonly id: string;
  readonly planId: string;
  readonly strategyId: string;
  readonly amountInr: number;
  readonly state: CentralPaperCapitalAllocationState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly releasedAt: number | null;
  readonly reserveTransactionId: string;
  readonly releaseTransactionId: string;
  readonly terminalReason: string | null;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface CentralPaperCapitalAccountPort {
  reserveCapital(amount: number, transactionId: string): boolean;
  releaseCapital(amount: number, transactionId: string): void;
  hasAppliedAccountingTransaction(transactionId: string): boolean;
}

interface Snapshot {readonly version: "61.0"; readonly savedAt: number; readonly allocations: readonly CentralPaperCapitalAllocation[];}
const DEFAULT_FILE = resolve(process.cwd(), "logs", "paper", "central-capital-allocations.jsonl");

export class CentralPaperCapitalAllocationService {
  private readonly store: JsonlSnapshotStore<Snapshot>;
  private readonly allocations = new Map<string, CentralPaperCapitalAllocation>();
  private readonly idByPlanId = new Map<string, string>();
  private restoredAt: number | null = null;

  constructor(private readonly account: CentralPaperCapitalAccountPort = tradingAccountService,
    persistenceFilePath = DEFAULT_FILE, private readonly maximumAllocations = 2_000) {
    if (!Number.isSafeInteger(maximumAllocations) || maximumAllocations < 1) throw new Error("Central PAPER capital allocation capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath: persistenceFilePath, isPayload: isSnapshot});
    this.restore();
  }

  allocate(planId: string, strategyId: string, amountInr: number, now = Date.now()): CentralPaperCapitalAllocation {
    validateTime(now); const plan = planId.trim(); const strategy = strategyId.trim();
    if (!plan || !strategy || !Number.isFinite(amountInr) || amountInr <= 0) throw new Error("Central PAPER capital allocation requires plan, strategy and positive INR amount.");
    const existing = this.getByPlanId(plan);
    if (existing) {
      if (existing.strategyId !== strategy || Math.abs(existing.amountInr - amountInr) > 1e-8) throw new Error("Central PAPER capital allocation plan collision.");
      return this.reconcile(existing, now);
    }
    if (this.allocations.size >= this.maximumAllocations) throw new Error("Central PAPER capital allocation capacity is exhausted.");
    const id = `central-paper-capital:${plan}`;
    const pending = freeze({version: "61.0" as const, id, planId: plan, strategyId: strategy, amountInr,
      state: "PENDING_RESERVE" as const, createdAt: now, updatedAt: now, releasedAt: null,
      reserveTransactionId: `${id}:reserve`, releaseTransactionId: `${id}:release`, terminalReason: null,
      liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.set(pending); this.persist(now);
    return this.reconcile(pending, now);
  }

  releaseByPlanId(planId: string, reason: string, now = Date.now()): CentralPaperCapitalAllocation | null {
    validateTime(now); const current = this.getByPlanId(planId);
    if (!current) return null;
    if (current.state === "RELEASED" || current.state === "REJECTED") return current;
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error("Central PAPER capital release reason is required.");
    const active = this.reconcile(current, now);
    if (active.state !== "ACTIVE" && active.state !== "PENDING_RELEASE") return active;
    const pending = active.state === "PENDING_RELEASE" ? active : freeze({...clone(active), state: "PENDING_RELEASE" as const,
      updatedAt: now, terminalReason: normalizedReason});
    if (active.state !== "PENDING_RELEASE") { this.set(pending); this.persist(now); }
    this.account.releaseCapital(pending.amountInr, pending.releaseTransactionId);
    const released = freeze({...clone(pending), state: "RELEASED" as const, updatedAt: now, releasedAt: now,
      terminalReason: pending.terminalReason ?? normalizedReason});
    this.set(released); this.persist(now); return clone(released);
  }

  getByPlanId(planId: string): CentralPaperCapitalAllocation | null {
    const id = this.idByPlanId.get(planId.trim()); const value = id ? this.allocations.get(id) : null; return value ? clone(value) : null;
  }
  getActive(): readonly CentralPaperCapitalAllocation[] { return [...this.allocations.values()].filter((item) => item.state === "ACTIVE" || item.state === "PENDING_RELEASE")
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(clone); }

  getDiagnostics(now = Date.now()) {
    validateTime(now); const values = [...this.allocations.values()]; const count = (state: CentralPaperCapitalAllocationState) => values.filter((item) => item.state === state).length;
    return freeze({version: "61.0" as const, generatedAt: now, restoredAt: this.restoredAt, records: values.length,
      states: {pendingReserve: count("PENDING_RESERVE"), active: count("ACTIVE"), pendingRelease: count("PENDING_RELEASE"), released: count("RELEASED"), rejected: count("REJECTED")},
      activeAmountInr: normalize(values.filter((item) => item.state === "ACTIVE" || item.state === "PENDING_RELEASE").reduce((sum, item) => sum + item.amountInr, 0)),
      recent: values.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, 100).map(clone), persistence: this.store.getDiagnostics(),
      safety: {journalBeforeAccountMutation: true, idempotentAccountTransactions: true, exactPlanOwnership: true,
        restartReconciliation: true, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  clear(): void {
    this.store.clear();
    this.allocations.clear();
    this.idByPlanId.clear();
    this.restoredAt = null;
  }

  private reconcile(source: CentralPaperCapitalAllocation, now: number): CentralPaperCapitalAllocation {
    if (source.state === "PENDING_RESERVE") {
      const approved = this.account.reserveCapital(source.amountInr, source.reserveTransactionId);
      const updated = freeze({...clone(source), state: approved ? "ACTIVE" as const : "REJECTED" as const,
        updatedAt: now, terminalReason: approved ? null : "Shared PAPER account rejected the durable capital allocation."});
      this.set(updated); this.persist(now); return clone(updated);
    }
    if (source.state === "PENDING_RELEASE") {
      this.account.releaseCapital(source.amountInr, source.releaseTransactionId);
      const updated = freeze({...clone(source), state: "RELEASED" as const, updatedAt: now, releasedAt: now});
      this.set(updated); this.persist(now); return clone(updated);
    }
    return clone(source);
  }

  private restore(): void {
    const latest = this.store.readAll().at(-1);
    if (latest) for (const item of latest.allocations) this.set(freeze(clone(item)));
    this.restoredAt = Date.now();
    for (const item of [...this.allocations.values()]) if (item.state === "PENDING_RESERVE" || item.state === "PENDING_RELEASE") this.reconcile(item, this.restoredAt);
  }
  private set(item: CentralPaperCapitalAllocation): void { this.allocations.set(item.id, item); this.idByPlanId.set(item.planId, item.id); }
  private persist(now: number): void { this.store.append({version: "61.0", savedAt: now, allocations: [...this.allocations.values()].map(clone)}); }
}

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false; const item = value as Partial<Snapshot>;
  return item.version === "61.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.allocations) && item.allocations.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false; const candidate = entry as Partial<CentralPaperCapitalAllocation>;
    return candidate.version === "61.0" && typeof candidate.id === "string" && typeof candidate.planId === "string" &&
      typeof candidate.strategyId === "string" && Number.isFinite(candidate.amountInr) && (candidate.amountInr ?? 0) > 0 &&
      candidate.liveExecutionAllowed === false && candidate.orderSubmissionAllowed === false;
  });
}
function validateTime(now: number): void { if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central PAPER capital allocation timestamp must be positive."); }
function normalize(value: number): number { return Number(value.toFixed(8)); }
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperCapitalAllocationService = new CentralPaperCapitalAllocationService();
