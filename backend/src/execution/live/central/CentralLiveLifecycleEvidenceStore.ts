import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../../core/persistence/JsonlSnapshotStore";

export type CentralLiveEvidenceKind =
  | "ENTRY_ADMISSION"
  | "SEQUENTIAL_SIZING"
  | "MAKER_REPLACEMENT"
  | "TWO_SIDED_QUOTE"
  | "OPEN_POSITION"
  | "EXIT_EVALUATION"
  | "ORDER_EXECUTION"
  | "SETTLEMENT"
  | "RECOVERY_INTENT";

export interface CentralLiveLifecycleEvidenceRecord<TPayload = unknown> {
  readonly version: "77.0";
  readonly id: string;
  readonly kind: CentralLiveEvidenceKind;
  readonly planId: string;
  readonly dispatchId: string | null;
  readonly evidenceKey: string;
  readonly payloadHash: string;
  readonly capturedAt: number;
  readonly expiresAt: number | null;
  readonly payload: TPayload;
}

interface Snapshot {readonly version: "77.0"; readonly savedAt: number;
  readonly records: readonly CentralLiveLifecycleEvidenceRecord[];}
const DEFAULT_FILE = resolve(process.cwd(), "logs", "live", "central-lifecycle-evidence.jsonl");

export class CentralLiveLifecycleEvidenceStore {
  private readonly store: JsonlSnapshotStore<Snapshot>;
  private readonly records = new Map<string, CentralLiveLifecycleEvidenceRecord>();
  constructor(private readonly filePath = DEFAULT_FILE, private readonly maximumRecords = 5_000) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) throw new Error("Central LIVE evidence capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath, isPayload: isSnapshot});
    const latest = this.store.readAll().at(-1);
    if (latest) for (const record of latest.records) this.records.set(composite(record.kind, record.planId, record.dispatchId,
      record.evidenceKey), freeze(clone(record)));
  }

  seal<TPayload>(input: {readonly kind: CentralLiveEvidenceKind; readonly planId: string; readonly dispatchId?: string | null;
    readonly evidenceKey: string; readonly payload: TPayload; readonly capturedAt?: number; readonly expiresAt?: number | null;
  }): CentralLiveLifecycleEvidenceRecord<TPayload> {
    const capturedAt = input.capturedAt ?? Date.now(); validateTime(capturedAt);
    const planId = requireId(input.planId, "plan"); const dispatchId = input.dispatchId ? requireId(input.dispatchId, "dispatch") : null;
    const evidenceKey = requireKey(input.evidenceKey); const expiresAt = input.expiresAt ?? null;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < capturedAt)) throw new Error("Central LIVE evidence expiry is invalid.");
    const payload = serializableClone(input.payload); const payloadHash = hash(payload);
    const key = composite(input.kind, planId, dispatchId, evidenceKey); const existing = this.records.get(key);
    if (existing) {
      if (existing.payloadHash !== payloadHash || existing.expiresAt !== expiresAt) {
        throw new Error("Central LIVE evidence key is immutable and cannot be rebound to changed payload.");
      }
      return clone(existing) as CentralLiveLifecycleEvidenceRecord<TPayload>;
    }
    if (this.records.size >= this.maximumRecords) throw new Error("Central LIVE evidence capacity is exhausted.");
    const identity = JSON.stringify({kind: input.kind, planId, dispatchId, evidenceKey, payloadHash, capturedAt, expiresAt});
    const record = freeze({version: "77.0" as const, id: `central-live-evidence:${createHash("sha256").update(identity).digest("hex")}`,
      kind: input.kind, planId, dispatchId, evidenceKey, payloadHash, capturedAt, expiresAt, payload});
    this.records.set(key, record); this.persist(capturedAt); return clone(record);
  }

  get<TPayload>(kind: CentralLiveEvidenceKind, planId: string, dispatchId: string | null,
    evidenceKey: string): CentralLiveLifecycleEvidenceRecord<TPayload> | null {
    const record = this.records.get(composite(kind, requireId(planId, "plan"), dispatchId ? requireId(dispatchId, "dispatch") : null,
      requireKey(evidenceKey)));
    return record ? clone(record) as CentralLiveLifecycleEvidenceRecord<TPayload> : null;
  }

  getCurrent<TPayload>(kind: CentralLiveEvidenceKind, planId: string, dispatchId: string | null,
    evidenceKey: string, now = Date.now()): CentralLiveLifecycleEvidenceRecord<TPayload> | null {
    validateTime(now); const record = this.get<TPayload>(kind, planId, dispatchId, evidenceKey);
    return record && record.capturedAt <= now && (record.expiresAt === null || record.expiresAt >= now) ? record : null;
  }

  listPlan(planId: string): CentralLiveLifecycleEvidenceRecord[] {
    const id = requireId(planId, "plan"); return [...this.records.values()].filter((item) => item.planId === id)
      .sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id)).map(clone);
  }

  getDiagnostics(now = Date.now()) {
    validateTime(now); const values = [...this.records.values()];
    return freeze({version: "77.0" as const, generatedAt: now, filePath: this.filePath, records: values.length,
      current: values.filter((item) => item.capturedAt <= now && (item.expiresAt === null || item.expiresAt >= now)).length,
      expired: values.filter((item) => item.expiresAt !== null && item.expiresAt < now).length,
      kinds: Object.fromEntries([...new Set(values.map((item) => item.kind))].sort()
        .map((kind) => [kind, values.filter((item) => item.kind === kind).length])), persistence: this.store.getDiagnostics(),
      safety: {immutableKeyBinding: true, payloadHashBound: true, exactPlanAndDispatchLineage: true,
        currentEvidenceReadDoesNotMutate: true, evidenceDoesNotGrantOrderAuthority: true}});
  }

  private persist(now: number): void { this.store.append({version: "77.0", savedAt: now,
    records: [...this.records.values()].map(clone)}); }
}

function composite(kind: CentralLiveEvidenceKind, planId: string, dispatchId: string | null, key: string): string {
  return `${kind}|${planId}|${dispatchId ?? "NO_DISPATCH"}|${key}`;
}
function requireId(value: string, label: string): string { const id = value.trim(); if (!/^[A-Za-z0-9_.:/-]{3,240}$/u.test(id)) throw new Error(`Central LIVE ${label} ID is invalid.`); return id; }
function requireKey(value: string): string { const key = value.trim(); if (!/^[A-Za-z0-9_.:/-]{1,240}$/u.test(key)) throw new Error("Central LIVE evidence key is invalid."); return key; }
function validateTime(value: number): void { if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Central LIVE evidence timestamp must be positive."); }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function serializableClone<T>(value: T): T { const text = JSON.stringify(value); if (text === undefined) throw new Error("Central LIVE evidence payload must be JSON serializable.");
  const parsed = JSON.parse(text) as T; if (JSON.stringify(parsed) !== text) throw new Error("Central LIVE evidence payload is not deterministic JSON."); return parsed; }
function isSnapshot(value: unknown): value is Snapshot { if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Snapshot>; return item.version === "77.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.records) &&
    item.records.every((record) => typeof record === "object" && record !== null && (record as Partial<CentralLiveLifecycleEvidenceRecord>).version === "77.0" &&
      typeof (record as Partial<CentralLiveLifecycleEvidenceRecord>).payloadHash === "string"); }
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralLiveLifecycleEvidenceStore = new CentralLiveLifecycleEvidenceStore();
