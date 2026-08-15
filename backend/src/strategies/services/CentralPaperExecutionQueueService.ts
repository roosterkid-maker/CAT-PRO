import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {CentralPaperPlanAdmission} from "./CentralPaperPlanAdmissionService";

export type CentralPaperQueueState = "QUEUED" | "LEASED" | "COMPLETED" | "REJECTED" | "EXPIRED";

export interface CentralPaperQueueRecord {
  readonly version: "37.0";
  readonly id: string;
  readonly plan: CentralStrategyExecutionPlan;
  readonly admissionId: string;
  readonly approvedCapitalInr: number;
  readonly state: CentralPaperQueueState;
  readonly queuedAt: number;
  readonly updatedAt: number;
  readonly attempts: number;
  readonly evidenceDeferrals: number;
  readonly nextLeaseEligibleAt: number;
  readonly lastEvidenceWaitReason: string | null;
  readonly leaseId: string | null;
  readonly leasedBy: string | null;
  readonly leaseExpiresAt: number | null;
  readonly terminalEvidenceId: string | null;
  readonly executionAuthorized: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

interface PersistedCentralPaperQueueSnapshot {
  readonly version: "37.0";
  readonly savedAt: number;
  readonly records: readonly CentralPaperQueueRecord[];
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "paper", "central-execution-queue.jsonl");

export class CentralPaperExecutionQueueService {
  private readonly store: JsonlSnapshotStore<PersistedCentralPaperQueueSnapshot>;
  private readonly records = new Map<string, CentralPaperQueueRecord>();
  private readonly recordIdByPlanId = new Map<string, string>();
  private restored = false;
  private restoredAt: number | null = null;

  constructor(private readonly persistenceFilePath = DEFAULT_FILE, private readonly maximumRecords = 1_000) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) throw new Error("Central PAPER queue maximumRecords must be positive.");
    this.store = new JsonlSnapshotStore({filePath: persistenceFilePath, isPayload: isPersistedSnapshot});
    this.restore();
  }

  enqueue(plan: CentralStrategyExecutionPlan, admission: CentralPaperPlanAdmission, now = Date.now()): {queued: boolean; duplicate: boolean; record: CentralPaperQueueRecord} {
    this.validateTime(now);
    if (admission.state !== "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE" || admission.planId !== plan.id || admission.strategyId !== plan.strategyId || admission.generatedAt > now) {
      throw new Error("Only an exact eligible central PAPER admission can be queued.");
    }
    if (plan.expiresAt < now) throw new Error("Expired central PAPER plan cannot be queued.");
    if (admission.approvedCapitalInr === null || !Number.isFinite(admission.approvedCapitalInr) || admission.approvedCapitalInr <= 0) {
      throw new Error("Central PAPER queue requires exact approved INR capital evidence.");
    }
    const existingId = this.recordIdByPlanId.get(plan.id);
    const existing = existingId ? this.records.get(existingId) : null;
    if (existing) return {queued: false, duplicate: true, record: clone(existing)};
    this.sweep(now, false);
    if (this.records.size >= this.maximumRecords) this.pruneTerminal();
    if (this.records.size >= this.maximumRecords) throw new Error("Central PAPER queue capacity is exhausted by non-terminal records.");
    const record = freeze({
      version: "37.0" as const,
      id: `central-paper-queue:${plan.id}`,
      plan: clone(plan),
      admissionId: admission.id,
      approvedCapitalInr: admission.approvedCapitalInr,
      state: "QUEUED" as const,
      queuedAt: now,
      updatedAt: now,
      attempts: 0,
      evidenceDeferrals: 0,
      nextLeaseEligibleAt: now,
      lastEvidenceWaitReason: null,
      leaseId: null,
      leasedBy: null,
      leaseExpiresAt: null,
      terminalEvidenceId: null,
      executionAuthorized: false as const,
      liveExecutionAllowed: false as const,
      orderSubmissionAllowed: false as const,
    });
    this.set(record);
    this.persist(now);
    return {queued: true, duplicate: false, record: clone(record)};
  }

  leaseNext(workerId: string, now = Date.now(), ttlMs = 5_000): CentralPaperQueueRecord | null {
    this.validateTime(now);
    const normalizedWorkerId = workerId.trim();
    if (!normalizedWorkerId) throw new Error("Central PAPER queue worker ID is required.");
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 30_000) throw new Error("Central PAPER queue lease TTL must be 1000-30000 ms.");
    const swept = this.sweep(now, false);
    const next = [...this.records.values()].filter((item) => item.state === "QUEUED" && item.plan.expiresAt >= now && item.nextLeaseEligibleAt <= now)
      .sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id))[0];
    if (!next) {
      if (swept) this.persist(now);
      return null;
    }
    const leased = freeze({...clone(next), state: "LEASED" as const, updatedAt: now, attempts: next.attempts + 1,
      leaseId: randomUUID(), leasedBy: normalizedWorkerId, leaseExpiresAt: Math.min(now + ttlMs, next.plan.expiresAt)});
    this.set(leased);
    this.persist(now);
    return clone(leased);
  }

  acknowledge(recordId: string, leaseId: string, outcome: "COMPLETED" | "REJECTED", terminalEvidenceId: string, now = Date.now()): CentralPaperQueueRecord {
    this.validateTime(now);
    const current = this.records.get(recordId);
    if (!current || current.state !== "LEASED" || current.leaseId !== leaseId || current.leaseExpiresAt === null || current.leaseExpiresAt < now) {
      throw new Error("Central PAPER queue acknowledgement requires an active exact lease.");
    }
    if (!terminalEvidenceId.trim()) throw new Error("Central PAPER queue terminal evidence ID is required.");
    const terminal = freeze({...clone(current), state: outcome, updatedAt: now, leaseId: null, leasedBy: null,
      leaseExpiresAt: null, terminalEvidenceId: terminalEvidenceId.trim()});
    this.set(terminal);
    this.persist(now);
    return clone(terminal);
  }

  deferForEvidence(recordId: string, leaseId: string, reason: string, now = Date.now(), retryDelayMs = 1_000): CentralPaperQueueRecord {
    this.validateTime(now);
    if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 250 || retryDelayMs > 60_000) {
      throw new Error("Central PAPER evidence retry delay must be 250-60000 ms.");
    }
    const current = this.records.get(recordId);
    if (!current || current.state !== "LEASED" || current.leaseId !== leaseId || current.leaseExpiresAt === null || current.leaseExpiresAt < now) {
      throw new Error("Central PAPER evidence deferral requires an active exact lease.");
    }
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error("Central PAPER evidence deferral reason is required.");
    const deferred = freeze({...clone(current), state: "QUEUED" as const, updatedAt: now,
      evidenceDeferrals: current.evidenceDeferrals + 1,
      nextLeaseEligibleAt: Math.min(now + retryDelayMs, current.plan.expiresAt),
      lastEvidenceWaitReason: normalizedReason,
      leaseId: null, leasedBy: null, leaseExpiresAt: null});
    this.set(deferred);
    this.persist(now);
    return clone(deferred);
  }

  sweepExpired(now = Date.now()): number {
    this.validateTime(now);
    const changed = this.sweep(now, true);
    return changed;
  }

  getByPlanId(planId: string, now = Date.now()): CentralPaperQueueRecord | null {
    this.validateTime(now);
    const id = this.recordIdByPlanId.get(planId.trim());
    const value = id ? this.records.get(id) : null;
    return value ? clone(value) : null;
  }

  getDiagnostics(now = Date.now()) {
    this.validateTime(now);
    const values = [...this.records.values()];
    const count = (state: CentralPaperQueueState) => values.filter((item) => item.state === state).length;
    return freeze({version: "37.0" as const, generatedAt: now, restored: this.restored, restoredAt: this.restoredAt,
      persistenceFilePath: this.persistenceFilePath, records: values.length,
      states: {queued: count("QUEUED"), leased: count("LEASED"), completed: count("COMPLETED"), rejected: count("REJECTED"), expired: count("EXPIRED")},
      recent: values.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, 100).map(clone),
      persistence: this.store.getDiagnostics(),
      safety: {eligibleAdmissionRequired: true, exactPlanLineageRequired: true, duplicatePlansRejected: true,
        boundedLeases: true, evidenceRetryBackoffRequired: true, restartSafe: true, executionAuthorized: false,
        liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  clear(): void {
    this.store.clear();
    this.records.clear();
    this.recordIdByPlanId.clear();
    this.restored = false;
    this.restoredAt = null;
  }

  private restore(): void {
    const snapshots = this.store.readAll();
    const latest = snapshots.at(-1);
    if (latest) for (const record of latest.records) this.set(freeze(normalizeRestoredRecord(record)));
    this.restored = true;
    this.restoredAt = Date.now();
  }

  private sweep(now: number, persist: boolean): number {
    let changed = 0;
    for (const current of this.records.values()) {
      if (current.state === "LEASED" && current.leaseExpiresAt !== null && current.leaseExpiresAt < now && current.plan.expiresAt >= now) {
        this.set(freeze({...clone(current), state: "QUEUED" as const, updatedAt: now, leaseId: null, leasedBy: null, leaseExpiresAt: null}));
        changed += 1;
      } else if ((current.state === "QUEUED" || current.state === "LEASED") && current.plan.expiresAt < now) {
        this.set(freeze({...clone(current), state: "EXPIRED" as const, updatedAt: now, leaseId: null, leasedBy: null, leaseExpiresAt: null}));
        changed += 1;
      }
    }
    if (persist && changed > 0) this.persist(now);
    return changed;
  }

  private pruneTerminal(): void {
    const removable = [...this.records.values()].filter((item) => item.state === "COMPLETED" || item.state === "REJECTED" || item.state === "EXPIRED")
      .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
    for (const item of removable) {
      if (this.records.size < this.maximumRecords) break;
      this.records.delete(item.id);
      this.recordIdByPlanId.delete(item.plan.id);
    }
  }

  private set(record: CentralPaperQueueRecord): void {
    this.records.set(record.id, record);
    this.recordIdByPlanId.set(record.plan.id, record.id);
  }

  private persist(now: number): void {
    this.store.append({version: "37.0", savedAt: now, records: [...this.records.values()].map(clone)});
  }

  private validateTime(now: number): void {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central PAPER queue timestamp must be positive.");
  }
}

function isPersistedSnapshot(value: unknown): value is PersistedCentralPaperQueueSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<PersistedCentralPaperQueueSnapshot>;
  return item.version === "37.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.records) && item.records.every((record) => {
    if (typeof record !== "object" || record === null) return false;
    const candidate = record as Partial<CentralPaperQueueRecord>;
    if (candidate.version !== "37.0" || typeof candidate.id !== "string" || typeof candidate.plan !== "object" ||
        candidate.plan === null || typeof candidate.admissionId !== "string" || typeof candidate.state !== "string") return false;
    const plan = candidate.plan as Partial<CentralStrategyExecutionPlan>;
    return typeof plan.settlementPolicy === "object" && plan.settlementPolicy !== null && typeof plan.settlementPolicy.kind === "string" &&
      Number.isSafeInteger(candidate.attempts) && typeof candidate.executionAuthorized === "boolean" && candidate.executionAuthorized === false &&
      Number.isFinite(candidate.approvedCapitalInr) && (candidate.approvedCapitalInr ?? 0) > 0 &&
      candidate.liveExecutionAllowed === false && candidate.orderSubmissionAllowed === false;
  });
}

function normalizeRestoredRecord(record: CentralPaperQueueRecord): CentralPaperQueueRecord {
  const legacy = record as CentralPaperQueueRecord & {evidenceDeferrals?: number; nextLeaseEligibleAt?: number; lastEvidenceWaitReason?: string | null};
  return clone({...legacy,
    evidenceDeferrals: Number.isSafeInteger(legacy.evidenceDeferrals) && (legacy.evidenceDeferrals ?? -1) >= 0 ? legacy.evidenceDeferrals! : 0,
    nextLeaseEligibleAt: Number.isSafeInteger(legacy.nextLeaseEligibleAt) && (legacy.nextLeaseEligibleAt ?? 0) > 0 ? legacy.nextLeaseEligibleAt! : legacy.updatedAt,
    lastEvidenceWaitReason: typeof legacy.lastEvidenceWaitReason === "string" && legacy.lastEvidenceWaitReason.trim()
      ? legacy.lastEvidenceWaitReason.trim() : null});
}

function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperExecutionQueueService = new CentralPaperExecutionQueueService();
