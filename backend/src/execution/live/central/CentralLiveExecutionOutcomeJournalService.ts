import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import type {CentralLiveLifecycleOutcome, CentralLiveLifecycleProgress} from "./CentralLiveLifecycleHandlerRegistry";
import type {CentralLiveQueueRecord} from "./CentralLiveExecutionQueueService";
import {hashCentralLivePlan} from "./CentralLiveExecutionAdmissionJournalService";

export interface CentralLiveDispatchJournalRecord {
  readonly version: "70.0";
  readonly id: string;
  readonly queueRecordId: string;
  readonly planId: string;
  readonly handlerId: string;
  readonly idempotencyKey: string;
  readonly state: "STARTED" | "TERMINAL";
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly progress: CentralLiveLifecycleProgress | null;
  readonly outcome: CentralLiveLifecycleOutcome | null;
}

interface Snapshot {readonly version: "70.0"; readonly savedAt: number; readonly records: readonly CentralLiveDispatchJournalRecord[];}
const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "central-outcome-journal.jsonl");

export class CentralLiveExecutionOutcomeJournalService {
  private readonly store: JsonlSnapshotStore<Snapshot>;
  private readonly records = new Map<string, CentralLiveDispatchJournalRecord>();

  constructor(private readonly filePath = DEFAULT_FILE, private readonly maximumRecords = 1_000) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) throw new Error("Central LIVE outcome journal capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath, isPayload: isSnapshot});
    const latest = this.store.readAll().at(-1);
    if (latest) for (const record of latest.records) this.records.set(record.id, freeze(clone(record)));
  }

  begin(queueRecord: CentralLiveQueueRecord, now = Date.now()): {created: boolean; record: CentralLiveDispatchJournalRecord} {
    if (!Number.isSafeInteger(now) || now <= 0 || queueRecord.updatedAt > now ||
      (queueRecord.state !== "LEASED" && queueRecord.state !== "DISPATCHING")) throw new Error("Central LIVE outcome journal requires a current leased or dispatching queue record.");
    const id = `central-live-dispatch:${queueRecord.id}`;
    const idempotencyKey = createHash("sha256").update(JSON.stringify({queueRecordId: queueRecord.id,
      planHash: hashCentralLivePlan(queueRecord.plan), admissionJournalId: queueRecord.admissionJournalId,
      actionAuthorityId: queueRecord.actionAuthorityId, handlerId: queueRecord.lifecycleHandlerId})).digest("hex");
    const existing = this.records.get(id);
    if (existing) {
      if (existing.idempotencyKey !== idempotencyKey || existing.handlerId !== queueRecord.lifecycleHandlerId || existing.planId !== queueRecord.plan.id) {
        throw new Error("Central LIVE dispatch journal lineage changed for an existing idempotency key.");
      }
      return {created: false, record: clone(existing)};
    }
    if (this.records.size >= this.maximumRecords) throw new Error("Central LIVE outcome journal capacity is exhausted.");
    const record = freeze({version: "70.0" as const, id, queueRecordId: queueRecord.id, planId: queueRecord.plan.id,
      handlerId: queueRecord.lifecycleHandlerId, idempotencyKey, state: "STARTED" as const, startedAt: now, updatedAt: now,
      progress: null, outcome: null});
    this.records.set(id, record);
    this.persist(now);
    return {created: true, record: clone(record)};
  }

  complete(dispatchId: string, outcome: CentralLiveLifecycleOutcome, now = Date.now()): CentralLiveDispatchJournalRecord {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central LIVE outcome completion timestamp must be positive.");
    const current = this.records.get(dispatchId.trim());
    if (!current || current.state !== "STARTED" || current.outcome !== null) throw new Error("Central LIVE outcome completion requires an exact pending dispatch journal.");
    if (outcome.planId !== current.planId || outcome.handlerId !== current.handlerId || outcome.completedAt > now || outcome.completedAt < current.startedAt ||
      outcome.terminalEvidenceIds.some((item) => !item.trim()) || outcome.recoveryIntentIds.some((item) => !item.trim())) {
      throw new Error("Central LIVE lifecycle outcome does not match pending dispatch lineage.");
    }
    if (outcome.state === "COMPLETED" && outcome.terminalEvidenceIds.length === 0) throw new Error("Completed central LIVE outcome requires terminal evidence.");
    if (outcome.state === "RECOVERY_REQUIRED" && outcome.recoveryIntentIds.length === 0) throw new Error("Recovery-required central LIVE outcome requires shared recovery intent evidence.");
    const terminal = freeze({...clone(current), state: "TERMINAL" as const, updatedAt: now, outcome: clone(outcome)});
    this.records.set(current.id, terminal);
    this.persist(now);
    return clone(terminal);
  }

  recordProgress(dispatchId: string, progress: CentralLiveLifecycleProgress, now = Date.now()): CentralLiveDispatchJournalRecord {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central LIVE progress timestamp must be positive.");
    const current = this.records.get(dispatchId.trim());
    if (!current || current.state !== "STARTED" || current.outcome !== null || progress.state !== "MONITORING" ||
      progress.planId !== current.planId || progress.handlerId !== current.handlerId || progress.observedAt > now ||
      progress.observedAt < current.startedAt || progress.evidenceIds.length === 0 || progress.evidenceIds.some((item) => !item.trim())) {
      throw new Error("Central LIVE lifecycle progress does not match pending dispatch lineage.");
    }
    if (current.progress?.orderSubmissionPerformed && !progress.orderSubmissionPerformed) {
      throw new Error("Central LIVE lifecycle progress cannot regress order-submission evidence.");
    }
    const updated = freeze({...clone(current), updatedAt: now, progress: clone(progress)});
    this.records.set(current.id, updated); this.persist(now); return clone(updated);
  }

  get(dispatchId: string): CentralLiveDispatchJournalRecord | null { const value = this.records.get(dispatchId.trim()); return value ? clone(value) : null; }
  getPending(): CentralLiveDispatchJournalRecord[] { return [...this.records.values()].filter((item) => item.state === "STARTED")
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id)).map(clone); }
  getDiagnostics(now = Date.now()) {
    const values = [...this.records.values()];
    return freeze({version: "70.0" as const, generatedAt: now, filePath: this.filePath, records: values.length,
      started: values.filter((item) => item.state === "STARTED").length, terminal: values.filter((item) => item.state === "TERMINAL").length,
      monitoring: values.filter((item) => item.state === "STARTED" && item.progress?.state === "MONITORING").length,
      orderSubmissionPerformed: values.some((item) => item.outcome?.orderSubmissionPerformed || item.progress?.orderSubmissionPerformed),
      persistence: this.store.getDiagnostics(),
      safety: {startedJournalBeforeHandlerRequired: true, stableIdempotencyKey: true, pendingDispatchesRequireResume: true, terminalEvidenceRequired: true}});
  }

  private persist(now: number): void { this.store.append({version: "70.0", savedAt: now, records: [...this.records.values()].map(clone)}); }
}

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Snapshot>;
  return item.version === "70.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.records) && item.records.every((record) => {
    if (typeof record !== "object" || record === null) return false;
    const candidate = record as Partial<CentralLiveDispatchJournalRecord>;
    return candidate.version === "70.0" && typeof candidate.id === "string" && typeof candidate.queueRecordId === "string" &&
      typeof candidate.planId === "string" && typeof candidate.handlerId === "string" && typeof candidate.idempotencyKey === "string" &&
      (candidate.state === "STARTED" || candidate.state === "TERMINAL") &&
      (candidate.progress === undefined || candidate.progress === null || typeof candidate.progress === "object") &&
      (candidate.outcome === null || typeof candidate.outcome === "object");
  });
}
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
