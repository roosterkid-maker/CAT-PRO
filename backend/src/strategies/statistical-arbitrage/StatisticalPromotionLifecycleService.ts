import {
  resolve,
} from "node:path";

import {
  JsonlRotatingWriter,
  readLatestValidJsonlAcrossArchives,
  type JsonlArchiveRestoreStatus,
} from "../../core/persistence/JsonlArchiveStore";

import type {
  StatisticalArbitragePair,
} from "./StatisticalArbitrageConfiguration";

export type StatisticalRawQualificationState =
  | "PROMOTED"
  | "COLLECTING_HISTORY"
  | "REJECTED";

export type StatisticalPromotionLifecycleState =
  | "COLLECTING_HISTORY"
  | "PROMOTION_PENDING"
  | "PROMOTED"
  | "DEMOTION_PENDING"
  | "REJECTED";

export interface StatisticalPromotionLifecycleInput
extends StatisticalArbitragePair {
  readonly qualificationState: StatisticalRawQualificationState;
  readonly blockers: readonly string[];
}

export interface StatisticalPromotionLifecycleEvidence {
  readonly state: StatisticalPromotionLifecycleState;
  readonly qualificationState: StatisticalRawQualificationState;
  readonly publishedState: StatisticalRawQualificationState;
  readonly consecutivePromotionPasses: number;
  readonly consecutiveDemotionFailures: number;
  readonly promotionConfirmationsRequired: number;
  readonly demotionConfirmationsRequired: number;
  readonly firstObservedAt: number;
  readonly stateChangedAt: number;
  readonly lastEvaluatedAt: number;
  readonly lastTransitionReason: string;
  readonly signalEligible: boolean;
  readonly blockers: readonly string[];
}

export interface StatisticalPromotionTransition {
  readonly id: string;
  readonly pairId: string;
  readonly exchange: string;
  readonly previousState: StatisticalPromotionLifecycleState | null;
  readonly nextState: StatisticalPromotionLifecycleState;
  readonly qualificationState: StatisticalRawQualificationState;
  readonly occurredAt: number;
  readonly reason: string;
}

export interface StatisticalPromotionLifecycleConfiguration {
  readonly promotionConfirmationsRequired: number;
  readonly demotionConfirmationsRequired: number;
  readonly maximumTrackedPairs: number;
  readonly maximumTransitions: number;
  readonly rotationMaximumFileBytes: number;
  readonly rotationMaximumRecords: number;
  readonly maximumArchives: number;
}

interface StatisticalPromotionLifecycleRecord
extends StatisticalArbitragePair {
  readonly state: StatisticalPromotionLifecycleState;
  readonly qualificationState: StatisticalRawQualificationState;
  readonly consecutivePromotionPasses: number;
  readonly consecutiveDemotionFailures: number;
  readonly firstObservedAt: number;
  readonly stateChangedAt: number;
  readonly lastEvaluatedAt: number;
  readonly lastTransitionReason: string;
}

interface PersistedStatisticalPromotionLifecycleSnapshot {
  readonly schemaVersion: 1;
  readonly persistedAt: number;
  readonly records: readonly StatisticalPromotionLifecycleRecord[];
  readonly transitions: readonly StatisticalPromotionTransition[];
}

export interface StatisticalPromotionLifecycleDiagnostics {
  readonly generatedAt: number;
  readonly version: "35.0";
  readonly configuration: Pick<StatisticalPromotionLifecycleConfiguration,
    "promotionConfirmationsRequired" | "demotionConfirmationsRequired" |
    "maximumTrackedPairs" | "maximumTransitions">;
  readonly summary: {
    readonly trackedPairs: number;
    readonly promotionPending: number;
    readonly promoted: number;
    readonly demotionPending: number;
    readonly rejected: number;
    readonly signalEligible: number;
    readonly transitionsRetained: number;
  };
  readonly records: readonly (StatisticalPromotionLifecycleRecord & {
    readonly publishedState: StatisticalRawQualificationState;
    readonly signalEligible: boolean;
  })[];
  readonly transitions: readonly StatisticalPromotionTransition[];
  readonly persistence: {
    readonly restoreStatus: JsonlArchiveRestoreStatus;
    readonly restoredAt: number | null;
    readonly writes: number;
    readonly writeFailures: number;
    readonly lastPersistedAt: number | null;
    readonly lastError: string | null;
    readonly activeFile: string;
    readonly rotations: number;
    readonly archivesPruned: number;
  };
  readonly safety: {
    readonly consecutivePromotionRequired: true;
    readonly demotionBlocksSignalsImmediately: true;
    readonly transitionsPersistent: true;
    readonly thresholdsRelaxed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const DEFAULT_CONFIGURATION: StatisticalPromotionLifecycleConfiguration = {
  promotionConfirmationsRequired: 3,
  demotionConfirmationsRequired: 3,
  maximumTrackedPairs: 40,
  maximumTransitions: 100,
  rotationMaximumFileBytes: 8 * 1_024 * 1_024,
  rotationMaximumRecords: 1_000,
  maximumArchives: 2,
};

const DEFAULT_PERSISTENCE_FILE = resolve(
  process.cwd(),
  "logs",
  "strategies",
  "statistical-promotion-lifecycle.jsonl",
);

export class StatisticalPromotionLifecycleService {
  private readonly configuration: StatisticalPromotionLifecycleConfiguration;
  private readonly records = new Map<string, StatisticalPromotionLifecycleRecord>();
  private readonly transitions: StatisticalPromotionTransition[] = [];
  private readonly writer: JsonlRotatingWriter<PersistedStatisticalPromotionLifecycleSnapshot>;
  private restoreStatus: JsonlArchiveRestoreStatus = "NO_DATA";
  private restoredAt: number | null = null;
  private persistenceWrites = 0;
  private persistenceWriteFailures = 0;
  private lastPersistedAt: number | null = null;
  private persistenceLastError: string | null = null;

  constructor(
    persistenceFilePath = DEFAULT_PERSISTENCE_FILE,
    configuration: Partial<StatisticalPromotionLifecycleConfiguration> = {},
  ) {
    this.configuration = {...DEFAULT_CONFIGURATION, ...configuration};
    for (const value of Object.values(this.configuration)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error("Statistical promotion lifecycle limits must be positive integers.");
      }
    }
    this.writer = new JsonlRotatingWriter(persistenceFilePath, {
      enabled: true,
      maximumFileBytes: this.configuration.rotationMaximumFileBytes,
      maximumRecords: this.configuration.rotationMaximumRecords,
      maximumArchives: this.configuration.maximumArchives,
    });
    this.restore(persistenceFilePath);
  }

  reconcile(
    inputs: readonly StatisticalPromotionLifecycleInput[],
    now = Date.now(),
  ): ReadonlyMap<string, StatisticalPromotionLifecycleEvidence> {
    positiveTimestamp(now);
    let changed = false;
    const activeIds = new Set(inputs.map((input) => input.pairId));

    for (const input of inputs) {
      const existing = this.records.get(input.pairId);
      if (existing && now <= existing.lastEvaluatedAt) continue;
      const next = this.transition(input, existing ?? null, now);
      this.records.set(input.pairId, next.record);
      changed = changed || !existing || meaningfulRecordChanged(existing, next.record);
      if (next.transition) {
        this.transitions.unshift(next.transition);
        this.transitions.splice(this.configuration.maximumTransitions);
      }
    }

    if (this.records.size > this.configuration.maximumTrackedPairs) {
      const removable = [...this.records.values()]
        .filter((record) => !activeIds.has(record.pairId))
        .sort((first, second) => first.lastEvaluatedAt - second.lastEvaluatedAt || first.pairId.localeCompare(second.pairId));
      while (this.records.size > this.configuration.maximumTrackedPairs && removable.length > 0) {
        this.records.delete(removable.shift()!.pairId);
        changed = true;
      }
    }

    if (changed) this.persist(now);
    return new Map(inputs.flatMap((input) => {
      const record = this.records.get(input.pairId);
      return record ? [[input.pairId, this.toEvidence(record, input.blockers)] as const] : [];
    }));
  }

  getDiagnostics(now = Date.now()): StatisticalPromotionLifecycleDiagnostics {
    positiveTimestamp(now);
    const records = [...this.records.values()]
      .sort((first, second) => stateRank(first.state) - stateRank(second.state) ||
        second.lastEvaluatedAt - first.lastEvaluatedAt || first.pairId.localeCompare(second.pairId))
      .map((record) => ({...structuredClone(record), publishedState: publishedState(record.state),
        signalEligible: record.state === "PROMOTED"}));
    const writer = this.writer.getDiagnostics();
    return immutable({generatedAt: now, version: "35.0", configuration: {
      promotionConfirmationsRequired: this.configuration.promotionConfirmationsRequired,
      demotionConfirmationsRequired: this.configuration.demotionConfirmationsRequired,
      maximumTrackedPairs: this.configuration.maximumTrackedPairs,
      maximumTransitions: this.configuration.maximumTransitions,
    }, summary: {trackedPairs: records.length,
      promotionPending: records.filter((record) => record.state === "PROMOTION_PENDING").length,
      promoted: records.filter((record) => record.state === "PROMOTED").length,
      demotionPending: records.filter((record) => record.state === "DEMOTION_PENDING").length,
      rejected: records.filter((record) => record.state === "REJECTED").length,
      signalEligible: records.filter((record) => record.signalEligible).length,
      transitionsRetained: this.transitions.length}, records,
    transitions: structuredClone(this.transitions), persistence: {restoreStatus: this.restoreStatus,
      restoredAt: this.restoredAt, writes: this.persistenceWrites,
      writeFailures: this.persistenceWriteFailures, lastPersistedAt: this.lastPersistedAt,
      lastError: this.persistenceLastError, activeFile: writer.activeFile,
      rotations: writer.rotations, archivesPruned: writer.archivesPruned},
    safety: {consecutivePromotionRequired: true, demotionBlocksSignalsImmediately: true,
      transitionsPersistent: true, thresholdsRelaxed: false, paperExecutionAllowed: false,
      liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private transition(
    input: StatisticalPromotionLifecycleInput,
    existing: StatisticalPromotionLifecycleRecord | null,
    now: number,
  ): {record: StatisticalPromotionLifecycleRecord; transition: StatisticalPromotionTransition | null} {
    let state: StatisticalPromotionLifecycleState;
    let promotionPasses = existing?.consecutivePromotionPasses ?? 0;
    let demotionFailures = existing?.consecutiveDemotionFailures ?? 0;
    let reason: string;

    if (input.qualificationState === "PROMOTED") {
      demotionFailures = 0;
      if (existing?.state === "PROMOTED" || existing?.state === "DEMOTION_PENDING") {
        state = "PROMOTED";
        promotionPasses = this.configuration.promotionConfirmationsRequired;
        reason = existing.state === "DEMOTION_PENDING" ? "PROMOTED_EVIDENCE_RECOVERED" : "PROMOTED_EVIDENCE_MAINTAINED";
      } else {
        promotionPasses = Math.min(this.configuration.promotionConfirmationsRequired, promotionPasses + 1);
        state = promotionPasses >= this.configuration.promotionConfirmationsRequired ? "PROMOTED" : "PROMOTION_PENDING";
        reason = state === "PROMOTED" ? "PROMOTION_CONFIRMED" :
          `PROMOTION_CONFIRMATION_${promotionPasses}_OF_${this.configuration.promotionConfirmationsRequired}`;
      }
    } else if (existing?.state === "PROMOTED" || existing?.state === "DEMOTION_PENDING") {
      promotionPasses = 0;
      demotionFailures = Math.min(this.configuration.demotionConfirmationsRequired, demotionFailures + 1);
      state = demotionFailures >= this.configuration.demotionConfirmationsRequired ? "REJECTED" : "DEMOTION_PENDING";
      reason = state === "REJECTED" ? "DEMOTION_CONFIRMED" :
        `DEMOTION_CONFIRMATION_${demotionFailures}_OF_${this.configuration.demotionConfirmationsRequired}`;
    } else if (input.qualificationState === "REJECTED") {
      state = "REJECTED";
      promotionPasses = 0;
      demotionFailures = 0;
      reason = "QUALIFICATION_REJECTED";
    } else {
      state = "COLLECTING_HISTORY";
      promotionPasses = 0;
      demotionFailures = 0;
      reason = "HISTORY_COLLECTION_REQUIRED";
    }

    const stateChangedAt = existing?.state === state ? existing.stateChangedAt : now;
    const record: StatisticalPromotionLifecycleRecord = {...copyPair(input), state,
      qualificationState: input.qualificationState, consecutivePromotionPasses: promotionPasses,
      consecutiveDemotionFailures: demotionFailures, firstObservedAt: existing?.firstObservedAt ?? now,
      stateChangedAt, lastEvaluatedAt: now, lastTransitionReason: reason};
    const transition = existing?.state === state ? null : immutable({
      id: `${input.pairId}:${now}:${state}`, pairId: input.pairId, exchange: input.exchange,
      previousState: existing?.state ?? null, nextState: state,
      qualificationState: input.qualificationState, occurredAt: now, reason,
    });
    return {record: immutable(record), transition};
  }

  private toEvidence(
    record: StatisticalPromotionLifecycleRecord,
    qualificationBlockers: readonly string[],
  ): StatisticalPromotionLifecycleEvidence {
    const lifecycleBlockers = record.state === "PROMOTION_PENDING"
      ? [`PROMOTION_CONFIRMATION_PENDING_${record.consecutivePromotionPasses}_OF_${this.configuration.promotionConfirmationsRequired}`]
      : record.state === "DEMOTION_PENDING"
        ? [`DEMOTION_CONFIRMATION_PENDING_${record.consecutiveDemotionFailures}_OF_${this.configuration.demotionConfirmationsRequired}`]
        : [];
    return immutable({state: record.state, qualificationState: record.qualificationState,
      publishedState: publishedState(record.state), consecutivePromotionPasses: record.consecutivePromotionPasses,
      consecutiveDemotionFailures: record.consecutiveDemotionFailures,
      promotionConfirmationsRequired: this.configuration.promotionConfirmationsRequired,
      demotionConfirmationsRequired: this.configuration.demotionConfirmationsRequired,
      firstObservedAt: record.firstObservedAt, stateChangedAt: record.stateChangedAt,
      lastEvaluatedAt: record.lastEvaluatedAt, lastTransitionReason: record.lastTransitionReason,
      signalEligible: record.state === "PROMOTED",
      blockers: [...new Set([...qualificationBlockers, ...lifecycleBlockers])]});
  }

  private restore(persistenceFilePath: string): void {
    const restored = readLatestValidJsonlAcrossArchives(persistenceFilePath, isPersistedSnapshot);
    this.restoreStatus = restored.restoreStatus;
    this.persistenceLastError = restored.lastError;
    if (!restored.value) return;
    for (const record of restored.value.records.slice(0, this.configuration.maximumTrackedPairs)) {
      this.records.set(record.pairId, immutable(structuredClone(record)));
    }
    this.transitions.push(...restored.value.transitions.slice(0, this.configuration.maximumTransitions)
      .map((transition) => immutable(structuredClone(transition))));
    this.restoredAt = Date.now();
  }

  private persist(now: number): void {
    try {
      this.writer.append({schemaVersion: 1, persistedAt: now,
        records: [...this.records.values()].map((record) => structuredClone(record)),
        transitions: this.transitions.map((transition) => structuredClone(transition))});
      this.persistenceWrites += 1;
      this.lastPersistedAt = now;
      this.persistenceLastError = null;
    } catch (error: unknown) {
      this.persistenceWriteFailures += 1;
      this.persistenceLastError = error instanceof Error ? error.message : "Statistical promotion lifecycle persistence failed.";
    }
  }
}

function publishedState(state: StatisticalPromotionLifecycleState): StatisticalRawQualificationState {
  return state === "PROMOTED" ? "PROMOTED" : state === "REJECTED" ? "REJECTED" : "COLLECTING_HISTORY";
}

function meaningfulRecordChanged(
  previous: StatisticalPromotionLifecycleRecord,
  next: StatisticalPromotionLifecycleRecord,
): boolean {
  return previous.state !== next.state || previous.qualificationState !== next.qualificationState ||
    previous.consecutivePromotionPasses !== next.consecutivePromotionPasses ||
    previous.consecutiveDemotionFailures !== next.consecutiveDemotionFailures ||
    previous.lastTransitionReason !== next.lastTransitionReason;
}

function copyPair(pair: StatisticalArbitragePair): StatisticalArbitragePair {
  return {pairId: pair.pairId, exchange: pair.exchange, leftMarket: pair.leftMarket, rightMarket: pair.rightMarket};
}

function isPersistedSnapshot(value: unknown): value is PersistedStatisticalPromotionLifecycleSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PersistedStatisticalPromotionLifecycleSnapshot>;
  return snapshot.schemaVersion === 1 && Number.isSafeInteger(snapshot.persistedAt) &&
    Array.isArray(snapshot.records) && snapshot.records.every(isRecord) &&
    Array.isArray(snapshot.transitions) && snapshot.transitions.every(isTransition);
}

function isRecord(value: unknown): value is StatisticalPromotionLifecycleRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StatisticalPromotionLifecycleRecord>;
  return typeof record.pairId === "string" && typeof record.exchange === "string" &&
    typeof record.leftMarket === "string" && typeof record.rightMarket === "string" &&
    lifecycleState(record.state) && rawState(record.qualificationState) &&
    Number.isSafeInteger(record.consecutivePromotionPasses) && Number.isSafeInteger(record.consecutiveDemotionFailures) &&
    positive(record.firstObservedAt) && positive(record.stateChangedAt) && positive(record.lastEvaluatedAt) &&
    typeof record.lastTransitionReason === "string";
}

function isTransition(value: unknown): value is StatisticalPromotionTransition {
  if (!value || typeof value !== "object") return false;
  const transition = value as Partial<StatisticalPromotionTransition>;
  return typeof transition.id === "string" && typeof transition.pairId === "string" &&
    typeof transition.exchange === "string" &&
    (transition.previousState === null || lifecycleState(transition.previousState)) &&
    lifecycleState(transition.nextState) && rawState(transition.qualificationState) &&
    positive(transition.occurredAt) && typeof transition.reason === "string";
}

function lifecycleState(value: unknown): value is StatisticalPromotionLifecycleState {
  return value === "COLLECTING_HISTORY" || value === "PROMOTION_PENDING" || value === "PROMOTED" ||
    value === "DEMOTION_PENDING" || value === "REJECTED";
}

function rawState(value: unknown): value is StatisticalRawQualificationState {
  return value === "PROMOTED" || value === "COLLECTING_HISTORY" || value === "REJECTED";
}

function stateRank(state: StatisticalPromotionLifecycleState): number {
  return state === "PROMOTED" ? 0 : state === "PROMOTION_PENDING" ? 1 :
    state === "DEMOTION_PENDING" ? 2 : state === "COLLECTING_HISTORY" ? 3 : 4;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function positiveTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Statistical promotion lifecycle requires a positive observation time.");
}

function immutable<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) immutable(nested);
  return Object.freeze(value);
}

export const statisticalPromotionLifecycleService = new StatisticalPromotionLifecycleService();
