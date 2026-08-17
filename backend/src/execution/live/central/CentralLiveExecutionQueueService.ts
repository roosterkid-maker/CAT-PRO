import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import type {CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {CentralLiveAdmissionJournalRecord} from "./CentralLiveExecutionAdmissionJournalService";
import {hashCentralLivePlan} from "./CentralLiveExecutionAdmissionJournalService";

export type CentralLiveQueueState = "QUEUED" | "LEASED" | "DISPATCHING" | "COMPLETED" | "REJECTED" | "EXPIRED";

export interface CentralLiveQueueRecord {
  readonly version: "69.0";
  readonly id: string;
  readonly plan: CentralStrategyExecutionPlan;
  readonly admissionJournalId: string;
  readonly lifecycleHandlerId: string;
  readonly actionAuthorityId: string;
  readonly actionAuthorityExpiresAt: number;
  readonly approvedCapitalInr: number;
  readonly state: CentralLiveQueueState;
  readonly queuedAt: number;
  readonly updatedAt: number;
  readonly attempts: number;
  readonly leaseId: string | null;
  readonly leasedBy: string | null;
  readonly leaseExpiresAt: number | null;
  readonly terminalEvidenceId: string | null;
  readonly dispatchJournalId: string | null;
  readonly dispatchStartedAt: number | null;
  readonly executionStarted: boolean;
  readonly orderSubmissionPerformed: boolean;
}

interface Snapshot {readonly version: "69.0"; readonly savedAt: number; readonly records: readonly CentralLiveQueueRecord[];}
const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "central-execution-queue.jsonl");

export class CentralLiveExecutionQueueService {
  private readonly store: JsonlSnapshotStore<Snapshot>;
  private readonly records = new Map<string, CentralLiveQueueRecord>();
  private readonly recordIdByPlanId = new Map<string, string>();

  constructor(private readonly filePath = DEFAULT_FILE, private readonly maximumRecords = 1_000) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) throw new Error("Central LIVE queue capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath, isPayload: isSnapshot});
    const latest = this.store.readAll().at(-1);
    if (latest) for (const record of latest.records) this.set(normalizeRecord(record));
  }

  enqueue(plan: CentralStrategyExecutionPlan, journal: CentralLiveAdmissionJournalRecord, now = Date.now()) {
    this.validateTime(now);
    const admission = journal.admission;
    if (journal.state !== "ADMISSION_CAPTURED" || journal.planHash !== hashCentralLivePlan(plan) || admission.planId !== plan.id ||
      admission.strategyId !== plan.strategyId || admission.pattern !== plan.pattern || admission.state !== "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE" || !admission.handoffEligible) {
      throw new Error("Central LIVE queue requires an exact eligible journaled admission and plan hash.");
    }
    if (journal.capturedAt > now || plan.expiresAt < now || admission.actionAuthorityExpiresAt === null || admission.actionAuthorityExpiresAt < now ||
      admission.approvedCapitalInr === null || admission.lifecycleHandlerId === null || admission.actionAuthorityId === null) {
      throw new Error("Central LIVE queue admission is incomplete, expired, or future-dated.");
    }
    const existingId = this.recordIdByPlanId.get(plan.id);
    const existing = existingId ? this.records.get(existingId) : null;
    if (existing) return {queued: false, duplicate: true, record: clone(existing)};
    this.sweep(now, false);
    if (this.records.size >= this.maximumRecords) throw new Error("Central LIVE queue capacity is exhausted.");
    const record = freeze({
      version: "69.0" as const,
      id: `central-live-queue:${plan.id}`,
      plan: clone(plan),
      admissionJournalId: journal.id,
      lifecycleHandlerId: admission.lifecycleHandlerId,
      actionAuthorityId: admission.actionAuthorityId,
      actionAuthorityExpiresAt: admission.actionAuthorityExpiresAt,
      approvedCapitalInr: admission.approvedCapitalInr,
      state: "QUEUED" as const,
      queuedAt: now,
      updatedAt: now,
      attempts: 0,
      leaseId: null,
      leasedBy: null,
      leaseExpiresAt: null,
      terminalEvidenceId: null,
      dispatchJournalId: null,
      dispatchStartedAt: null,
      executionStarted: false as const,
      orderSubmissionPerformed: false as const,
    });
    this.set(record);
    this.persist(now);
    return {queued: true, duplicate: false, record: clone(record)};
  }

  leaseNext(workerId: string, now = Date.now(), ttlMs = 5_000): CentralLiveQueueRecord | null {
    this.validateTime(now);
    if (!workerId.trim()) throw new Error("Central LIVE queue worker ID is required.");
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 10_000) throw new Error("Central LIVE queue lease TTL must be 1000-10000 ms.");
    const changed = this.sweep(now, false);
    const next = [...this.records.values()].filter((item) => item.state === "QUEUED" && effectiveExpiry(item) >= now)
      .sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id))[0];
    if (!next) { if (changed > 0) this.persist(now); return null; }
    const leased = freeze({...clone(next), state: "LEASED" as const, updatedAt: now, attempts: next.attempts + 1,
      leaseId: randomUUID(), leasedBy: workerId.trim(), leaseExpiresAt: Math.min(now + ttlMs, effectiveExpiry(next))});
    this.set(leased);
    this.persist(now);
    return clone(leased);
  }

  acknowledge(recordId: string, leaseId: string, outcome: "COMPLETED" | "REJECTED", terminalEvidenceId: string, now = Date.now()): CentralLiveQueueRecord {
    this.validateTime(now);
    const current = this.records.get(recordId);
    if (!current || current.state !== "LEASED" || current.leaseId !== leaseId || current.leaseExpiresAt === null || current.leaseExpiresAt < now) {
      throw new Error("Central LIVE queue acknowledgement requires an active exact lease.");
    }
    if (!terminalEvidenceId.trim()) throw new Error("Central LIVE queue terminal journal evidence is required.");
    const terminal = freeze({...clone(current), state: outcome, updatedAt: now, leaseId: null, leasedBy: null,
      leaseExpiresAt: null, terminalEvidenceId: terminalEvidenceId.trim()});
    this.set(terminal);
    this.persist(now);
    return clone(terminal);
  }

  beginDispatch(recordId: string, leaseId: string, dispatchJournalId: string, now = Date.now(), dispatchStartedAt = now): CentralLiveQueueRecord {
    this.validateTime(now);
    const current = this.records.get(recordId);
    if (!current || current.state !== "LEASED" || current.leaseId !== leaseId || current.leaseExpiresAt === null ||
      !Number.isSafeInteger(dispatchStartedAt) || dispatchStartedAt < current.updatedAt || current.leaseExpiresAt < dispatchStartedAt || dispatchStartedAt > now) {
      throw new Error("Central LIVE dispatch requires an active exact queue lease.");
    }
    if (!dispatchJournalId.trim()) throw new Error("Central LIVE dispatch journal ID is required before handler handoff.");
    const dispatching = freeze({...clone(current), state: "DISPATCHING" as const, updatedAt: now,
      dispatchJournalId: dispatchJournalId.trim(), executionStarted: true,
      dispatchStartedAt,
      leaseId: null, leasedBy: null, leaseExpiresAt: null});
    this.set(dispatching);
    this.persist(now);
    return clone(dispatching);
  }

  acknowledgeDispatch(recordId: string, dispatchJournalId: string, outcome: "COMPLETED" | "REJECTED", terminalEvidenceId: string,
    orderSubmissionPerformed: boolean, now = Date.now()): CentralLiveQueueRecord {
    this.validateTime(now);
    const current = this.records.get(recordId);
    if (!current || current.state !== "DISPATCHING" || current.dispatchJournalId !== dispatchJournalId.trim()) {
      throw new Error("Central LIVE dispatch acknowledgement requires exact in-flight journal lineage.");
    }
    if (!terminalEvidenceId.trim()) throw new Error("Central LIVE terminal outcome journal ID is required.");
    const terminal = freeze({...clone(current), state: outcome, updatedAt: now, terminalEvidenceId: terminalEvidenceId.trim(),
      orderSubmissionPerformed});
    this.set(terminal);
    this.persist(now);
    return clone(terminal);
  }

  recordDispatchProgress(recordId: string, dispatchJournalId: string, orderSubmissionPerformed: boolean,
    now = Date.now()): CentralLiveQueueRecord {
    this.validateTime(now);
    const current = this.records.get(recordId);
    if (!current || current.state !== "DISPATCHING" || current.dispatchJournalId !== dispatchJournalId.trim()) {
      throw new Error("Central LIVE progress requires exact in-flight journal lineage.");
    }
    if (current.orderSubmissionPerformed && !orderSubmissionPerformed) {
      throw new Error("Central LIVE queue order-submission evidence cannot regress.");
    }
    const updated = freeze({...clone(current), updatedAt: now,
      orderSubmissionPerformed: current.orderSubmissionPerformed || orderSubmissionPerformed});
    this.set(updated); this.persist(now); return clone(updated);
  }

  getByPlanId(planId: string, now = Date.now()): CentralLiveQueueRecord | null {
    this.validateTime(now);
    const id = this.recordIdByPlanId.get(planId.trim());
    const record = id ? this.records.get(id) : null;
    return record ? clone(record) : null;
  }

  getById(recordId: string, now = Date.now()): CentralLiveQueueRecord | null {
    this.validateTime(now);
    const record = this.records.get(recordId.trim());
    return record ? clone(record) : null;
  }

  getDispatching(now = Date.now()): CentralLiveQueueRecord[] {
    this.validateTime(now);
    return [...this.records.values()].filter((item) => item.state === "DISPATCHING")
      .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id)).map(clone);
  }

  getDiagnostics(now = Date.now()) {
    this.validateTime(now);
    const values = [...this.records.values()];
    const count = (state: CentralLiveQueueState) => values.filter((item) => item.state === state).length;
    return freeze({version: "69.0" as const, generatedAt: now, filePath: this.filePath, records: values.length,
      states: {queued: count("QUEUED"), leased: count("LEASED"), dispatching: count("DISPATCHING"), completed: count("COMPLETED"), rejected: count("REJECTED"), expired: count("EXPIRED")},
      recent: values.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100).map(clone), persistence: this.store.getDiagnostics(),
      safety: {eligibleJournalRequired: true, exactPlanHashRequired: true, actionAuthorityExpiryBounded: true,
        inFlightDispatchNeverAutoExpires: true, restartSafe: true,
        executionStarted: values.some((item) => item.executionStarted),
        orderSubmissionPerformed: values.some((item) => item.orderSubmissionPerformed)}});
  }

  private sweep(now: number, persist: boolean): number {
    let changed = 0;
    for (const current of this.records.values()) {
      if (current.state === "LEASED" && current.leaseExpiresAt !== null && current.leaseExpiresAt < now && effectiveExpiry(current) >= now) {
        this.set(freeze({...clone(current), state: "QUEUED" as const, updatedAt: now, leaseId: null, leasedBy: null, leaseExpiresAt: null})); changed += 1;
      } else if ((current.state === "QUEUED" || current.state === "LEASED") && effectiveExpiry(current) < now) {
        this.set(freeze({...clone(current), state: "EXPIRED" as const, updatedAt: now, leaseId: null, leasedBy: null, leaseExpiresAt: null})); changed += 1;
      }
    }
    if (persist && changed > 0) this.persist(now);
    return changed;
  }

  private set(record: CentralLiveQueueRecord): void { this.records.set(record.id, record); this.recordIdByPlanId.set(record.plan.id, record.id); }
  private persist(now: number): void { this.store.append({version: "69.0", savedAt: now, records: [...this.records.values()].map(clone)}); }
  private validateTime(now: number): void { if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central LIVE queue timestamp must be positive."); }
}

function effectiveExpiry(record: CentralLiveQueueRecord): number { return Math.min(record.plan.expiresAt, record.actionAuthorityExpiresAt); }
function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Snapshot>;
  return item.version === "69.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.records) && item.records.every((record) => {
    if (typeof record !== "object" || record === null) return false;
    const candidate = record as Partial<CentralLiveQueueRecord>;
    return candidate.version === "69.0" && typeof candidate.id === "string" && typeof candidate.plan === "object" && candidate.plan !== null &&
      typeof candidate.admissionJournalId === "string" && typeof candidate.lifecycleHandlerId === "string" && typeof candidate.actionAuthorityId === "string" &&
      Number.isSafeInteger(candidate.actionAuthorityExpiresAt) && Number.isSafeInteger(candidate.attempts) &&
      typeof candidate.executionStarted === "boolean" && typeof candidate.orderSubmissionPerformed === "boolean" &&
      (candidate.dispatchJournalId === null || typeof candidate.dispatchJournalId === "string") &&
      (candidate.dispatchStartedAt === undefined || candidate.dispatchStartedAt === null || Number.isSafeInteger(candidate.dispatchStartedAt));
  });
}
function normalizeRecord(record: CentralLiveQueueRecord): CentralLiveQueueRecord {
  return freeze({...clone(record), dispatchStartedAt: record.dispatchStartedAt ??
    (record.state === "DISPATCHING" || record.executionStarted ? record.updatedAt : null)});
}
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
