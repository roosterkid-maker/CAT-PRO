import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import type {CentralMultiLegPaperSimulationResult} from "./CentralMultiLegPaperSimulator";
import type {CentralPaperQueueRecord} from "./CentralPaperExecutionQueueService";

export type CentralPaperSimulationJournalState =
  | "READY_FOR_POSITION_ACCOUNTING"
  | "PENDING_SHARED_RECOVERY"
  | "SHARED_RECOVERY_STAGED"
  | "RECOVERY_STAGING_FAILED"
  | "RECOVERY_COMPLETED"
  | "POSITION_ACCOUNTED";

export interface CentralPaperSimulationJournalRecord {
  readonly version: "40.0";
  readonly id: string;
  readonly resultId: string;
  readonly planId: string;
  readonly queueRecordId: string;
  readonly leaseId: string;
  readonly strategyId: CentralMultiLegPaperSimulationResult["strategyId"];
  readonly state: CentralPaperSimulationJournalState;
  readonly capturedAt: number;
  readonly updatedAt: number;
  readonly simulation: CentralMultiLegPaperSimulationResult;
  readonly sharedRecoveryIntentIds: readonly string[];
  readonly terminalEvidenceId: string | null;
  readonly realizedPnlBooked: false;
  readonly accountMutationPerformed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

interface PersistedJournalSnapshot {
  readonly version: "40.0";
  readonly savedAt: number;
  readonly records: readonly CentralPaperSimulationJournalRecord[];
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "paper", "central-simulation-journal.jsonl");

export class CentralPaperSimulationJournalService {
  private readonly store: JsonlSnapshotStore<PersistedJournalSnapshot>;
  private readonly records = new Map<string, CentralPaperSimulationJournalRecord>();
  private restoredAt: number | null = null;

  constructor(private readonly persistenceFilePath = DEFAULT_FILE, private readonly maximumRecords = 2_000) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) throw new Error("Central PAPER simulation journal capacity must be positive.");
    this.store = new JsonlSnapshotStore({filePath: persistenceFilePath, isPayload: isSnapshot});
    this.restore();
  }

  capture(queueRecord: CentralPaperQueueRecord, simulation: CentralMultiLegPaperSimulationResult, now = Date.now()): CentralPaperSimulationJournalRecord {
    this.validateTime(now);
    if (queueRecord.plan.id !== simulation.planId || queueRecord.id !== simulation.queueRecordId || queueRecord.leaseId !== simulation.leaseId || simulation.generatedAt > now) {
      throw new Error("Central PAPER journal capture requires exact queue, plan, lease and timestamp lineage.");
    }
    const existing = this.records.get(simulation.id);
    if (existing) {
      if (JSON.stringify(existing.simulation) !== JSON.stringify(simulation)) throw new Error("Central PAPER result ID collision contains different simulation evidence.");
      return clone(existing);
    }
    if (this.records.size >= this.maximumRecords) throw new Error("Central PAPER simulation journal capacity is exhausted.");
    const record = freeze({version: "40.0" as const, id: `central-paper-journal:${simulation.id}`, resultId: simulation.id,
      planId: simulation.planId, queueRecordId: simulation.queueRecordId, leaseId: simulation.leaseId, strategyId: simulation.strategyId,
      state: simulation.recoveryRequired ? "PENDING_SHARED_RECOVERY" as const : "READY_FOR_POSITION_ACCOUNTING" as const,
      capturedAt: now, updatedAt: now, simulation: clone(simulation), sharedRecoveryIntentIds: [] as readonly string[], terminalEvidenceId: null,
      realizedPnlBooked: false as const, accountMutationPerformed: false as const, liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.records.set(simulation.id, record);
    this.persist(now);
    return clone(record);
  }

  recordRecovery(resultId: string, intentIds: readonly string[], rejected: number, now = Date.now()): CentralPaperSimulationJournalRecord {
    this.validateTime(now);
    const current = this.require(resultId);
    if (current.state !== "PENDING_SHARED_RECOVERY") throw new Error("Only a pending recovery journal record can accept recovery staging evidence.");
    const normalizedIds = Array.from(new Set(intentIds.map((item) => item.trim()).filter(Boolean))).sort();
    const success = normalizedIds.length > 0 && rejected === 0;
    const updated = freeze({...clone(current), state: success ? "SHARED_RECOVERY_STAGED" as const : "RECOVERY_STAGING_FAILED" as const,
      updatedAt: now, sharedRecoveryIntentIds: normalizedIds});
    this.records.set(resultId, updated);
    this.persist(now);
    return clone(updated);
  }

  markPositionAccounted(resultId: string, terminalEvidenceId: string, now = Date.now()): CentralPaperSimulationJournalRecord {
    this.validateTime(now);
    const current = this.require(resultId);
    if (current.state !== "READY_FOR_POSITION_ACCOUNTING") throw new Error("Only recovery-free simulation evidence can enter position accounting.");
    if (!terminalEvidenceId.trim()) throw new Error("Central PAPER position accounting evidence ID is required.");
    const updated = freeze({...clone(current), state: "POSITION_ACCOUNTED" as const, updatedAt: now, terminalEvidenceId: terminalEvidenceId.trim()});
    this.records.set(resultId, updated);
    this.persist(now);
    return clone(updated);
  }

  markRecoveryCompleted(resultId: string, terminalEvidenceId: string, now = Date.now()): CentralPaperSimulationJournalRecord {
    this.validateTime(now);
    const current = this.require(resultId);
    if (current.state === "RECOVERY_COMPLETED") {
      if (current.terminalEvidenceId !== terminalEvidenceId.trim()) throw new Error("Completed recovery journal cannot accept different terminal evidence.");
      return clone(current);
    }
    if (current.state !== "SHARED_RECOVERY_STAGED") throw new Error("Only staged shared recovery can be completed.");
    if (!terminalEvidenceId.trim()) throw new Error("Central PAPER recovery completion evidence ID is required.");
    const updated = freeze({...clone(current), state: "RECOVERY_COMPLETED" as const, updatedAt: now, terminalEvidenceId: terminalEvidenceId.trim()});
    this.records.set(resultId, updated); this.persist(now); return clone(updated);
  }

  get(resultId: string): CentralPaperSimulationJournalRecord | null {
    const value = this.records.get(resultId);
    return value ? clone(value) : null;
  }

  getRecoveryRecords(): readonly CentralPaperSimulationJournalRecord[] {
    return [...this.records.values()].filter((item) => item.state === "SHARED_RECOVERY_STAGED")
      .sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id)).map(clone);
  }

  getDiagnostics(now = Date.now()) {
    this.validateTime(now);
    const values = [...this.records.values()];
    const count = (state: CentralPaperSimulationJournalState) => values.filter((item) => item.state === state).length;
    return freeze({version: "40.0" as const, generatedAt: now, restoredAt: this.restoredAt, persistenceFilePath: this.persistenceFilePath,
      records: values.length, states: {readyForPositionAccounting: count("READY_FOR_POSITION_ACCOUNTING"), pendingSharedRecovery: count("PENDING_SHARED_RECOVERY"),
        sharedRecoveryStaged: count("SHARED_RECOVERY_STAGED"), recoveryStagingFailed: count("RECOVERY_STAGING_FAILED"),
        recoveryCompleted: count("RECOVERY_COMPLETED"), positionAccounted: count("POSITION_ACCOUNTED")},
      recent: values.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, 100).map(clone), persistence: this.store.getDiagnostics(),
      safety: {journalBeforeQueueAcknowledgement: true, exactLineage: true, idempotentCapture: true, restartSafe: true,
        realizedPnlBooked: false, accountMutationPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private require(resultId: string): CentralPaperSimulationJournalRecord {
    const value = this.records.get(resultId);
    if (!value) throw new Error(`Central PAPER simulation journal record not found: ${resultId}`);
    return value;
  }

  clear(): void {
    this.store.clear();
    this.records.clear();
    this.restoredAt = null;
  }

  private restore(): void {
    const latest = this.store.readAll().at(-1);
    if (latest) for (const record of latest.records) this.records.set(record.resultId, freeze(clone(record)));
    this.restoredAt = Date.now();
  }

  private persist(now: number): void {
    this.store.append({version: "40.0", savedAt: now, records: [...this.records.values()].map(clone)});
  }

  private validateTime(now: number): void { if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Central PAPER simulation journal timestamp must be positive."); }
}

function isSnapshot(value: unknown): value is PersistedJournalSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<PersistedJournalSnapshot>;
  return item.version === "40.0" && Number.isSafeInteger(item.savedAt) && Array.isArray(item.records) && item.records.every((record) => {
    if (typeof record !== "object" || record === null) return false;
    const candidate = record as Partial<CentralPaperSimulationJournalRecord>;
    if (candidate.version !== "40.0" || typeof candidate.resultId !== "string" || typeof candidate.simulation !== "object" || candidate.simulation === null) return false;
    const simulation = candidate.simulation;
    return typeof simulation.settlementPolicy === "object" && simulation.settlementPolicy !== null &&
      (simulation.realizedPnlAsset === null || typeof simulation.realizedPnlAsset === "string") &&
      Array.isArray(simulation.legs) && simulation.legs.every((leg) => typeof leg === "object" && leg !== null && typeof leg.settlementAsset === "string");
  });
}

function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperSimulationJournalService = new CentralPaperSimulationJournalService();
