import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";
import type {CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {CentralLiveExecutionAdmission} from "./CentralLiveExecutionAdmissionService";

export interface CentralLiveAdmissionJournalRecord {
  readonly version: "69.0";
  readonly id: string;
  readonly capturedAt: number;
  readonly admission: CentralLiveExecutionAdmission;
  readonly planHash: string;
  readonly state: "ADMISSION_CAPTURED";
  readonly executionStarted: false;
  readonly orderSubmissionPerformed: false;
}

interface Snapshot {
  readonly version: "69.0";
  readonly savedAt: number;
  readonly records: readonly CentralLiveAdmissionJournalRecord[];
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "central-admission-journal.jsonl");

export class CentralLiveExecutionAdmissionJournalService {
  private readonly store: JsonlSnapshotStore<Snapshot>;
  private readonly records = new Map<string, CentralLiveAdmissionJournalRecord>();

  constructor(private readonly filePath = DEFAULT_FILE, private readonly maximumRecords = 1_000) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) throw new Error("Central LIVE admission journal capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath, isPayload: isSnapshot});
    const latest = this.store.readAll().at(-1);
    if (latest) for (const item of latest.records) this.records.set(item.id, freeze(clone(item)));
  }

  capture(plan: CentralStrategyExecutionPlan, admission: CentralLiveExecutionAdmission, now = Date.now()): CentralLiveAdmissionJournalRecord {
    if (!Number.isSafeInteger(now) || now <= 0 || admission.generatedAt > now) throw new Error("Central LIVE admission journal timestamp is invalid.");
    if (admission.planId !== plan.id || admission.strategyId !== plan.strategyId || admission.pattern !== plan.pattern) {
      throw new Error("Central LIVE admission journal requires exact plan lineage.");
    }
    const id = `central-live-admission-journal:${admission.id}`;
    const existing = this.records.get(id);
    if (existing) return clone(existing);
    if (this.records.size >= this.maximumRecords) throw new Error("Central LIVE admission journal capacity is exhausted.");
    const record = freeze({
      version: "69.0" as const,
      id,
      capturedAt: now,
      admission: clone(admission),
      planHash: hashPlan(plan),
      state: "ADMISSION_CAPTURED" as const,
      executionStarted: false as const,
      orderSubmissionPerformed: false as const,
    });
    this.records.set(id, record);
    this.persist(now);
    return clone(record);
  }

  get(id: string): CentralLiveAdmissionJournalRecord | null {
    const value = this.records.get(id.trim());
    return value ? clone(value) : null;
  }

  getDiagnostics(now = Date.now()) {
    return freeze({version: "69.0" as const, generatedAt: now, filePath: this.filePath, records: this.records.size,
      eligible: [...this.records.values()].filter((item) => item.admission.handoffEligible).length,
      blocked: [...this.records.values()].filter((item) => !item.admission.handoffEligible).length,
      recent: [...this.records.values()].sort((a, b) => b.capturedAt - a.capturedAt).slice(0, 100).map(clone),
      persistence: this.store.getDiagnostics(),
      safety: {journalBeforeQueueRequired: true, exactPlanHashRequired: true, executionStarted: false, orderSubmissionPerformed: false}});
  }

  private persist(now: number): void {
    this.store.append({version: "69.0", savedAt: now, records: [...this.records.values()].map(clone)});
  }
}

export function hashCentralLivePlan(plan: CentralStrategyExecutionPlan): string { return hashPlan(plan); }

function hashPlan(plan: CentralStrategyExecutionPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Snapshot>;
  return item.version === "69.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.records) && item.records.every((record) =>
    typeof record === "object" && record !== null && (record as Partial<CentralLiveAdmissionJournalRecord>).version === "69.0" &&
    typeof (record as Partial<CentralLiveAdmissionJournalRecord>).id === "string" &&
    (record as Partial<CentralLiveAdmissionJournalRecord>).state === "ADMISSION_CAPTURED" &&
    (record as Partial<CentralLiveAdmissionJournalRecord>).executionStarted === false &&
    (record as Partial<CentralLiveAdmissionJournalRecord>).orderSubmissionPerformed === false);
}

function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
