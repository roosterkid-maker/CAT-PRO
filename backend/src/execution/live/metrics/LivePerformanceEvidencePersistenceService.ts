import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  liveExecutionSessionEvidenceService,
} from "../coordinator/LiveExecutionSessionEvidenceService";

import {
  executionSettlementService,
} from "../settlement/ExecutionSettlementService";

import type {
  ExecutionSettlementRecord,
} from "../settlement/ExecutionSettlementRecord";

import type {
  ExecutionMetricsReport,
} from "./ExecutionMetrics";

import {
  executionMetricsService,
} from "./ExecutionMetricsService";

import type {
  ExecutionMetricsSnapshot,
} from "./ExecutionMetricsSnapshotService";

import {
  executionMetricsSnapshotService,
} from "./ExecutionMetricsSnapshotService";

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),

    "logs",

    "execution",

    "live-performance-evidence.jsonl",
  );

const DEFAULT_CHECKPOINT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "execution",
    "live-performance-checkpoint.jsonl",
  );

const MAXIMUM_RESTORED_SNAPSHOTS =
  720;

const PERIODIC_PERSIST_INTERVAL_MS =
  60_000;

interface PersistedLivePerformanceEvidence {
  schemaVersion: 1;

  persistedAt: number;

  metrics:
    ExecutionMetricsReport;

  metricSnapshot:
    ExecutionMetricsSnapshot |
    null;

  settlements:
    ExecutionSettlementRecord[];
}

interface PersistedLivePerformanceCheckpoint {
  schemaVersion: 2;

  persistedAt: number;

  metrics:
    ExecutionMetricsReport;

  metricSnapshots:
    ExecutionMetricsSnapshot[];

  settlements:
    ExecutionSettlementRecord[];
}

export interface LivePerformanceEvidencePersistenceDiagnostics {
  persistenceFilePath: string;

  legacyPersistenceFilePath: string;

  restoreSource:
    "NONE" |
    "CHECKPOINT" |
    "CHECKPOINT_PREVIOUS" |
    "LEGACY_BOUNDED_TAIL";

  boundedCheckpoint: true;

  legacyAppendDisabled: true;

  liveOnlySettlementCheckpoint: true;

  observedSettlements: number;

  verifiedLiveSettlements: number;

  excludedNonLiveOrUnverifiedSettlements: number;

  restored: boolean;

  restoredAt: number | null;

  restoredMetricsExecutions: number;

  restoredMetricSnapshots: number;

  restoredSettlements: number;

  writes: number;

  writeFailures: number;

  skippedWrites: number;

  lastPersistedAt: number | null;

  lastError: string | null;

  foundation: {
    linesRead: number;

    validRecordsRead: number;

    legacyRecordsRead: number;

    malformedRecordsIgnored: number;

    lastSequence: number;
  };

  legacyFoundation: {
    exists: boolean;

    linesRead: number;

    validRecordsRead: number;

    malformedRecordsIgnored: number;

    lastSequence: number;
  };

  sessionEvidence:
    ReturnType<
      typeof liveExecutionSessionEvidenceService.getDiagnostics
    >;
}

export class LivePerformanceEvidencePersistenceService {
  private readonly legacyStore:
    JsonlSnapshotStore<
      PersistedLivePerformanceEvidence
    >;

  private readonly checkpointStore:
    JsonlSnapshotStore<
      PersistedLivePerformanceCheckpoint
    >;

  private readonly previousCheckpointStore:
    JsonlSnapshotStore<
      PersistedLivePerformanceCheckpoint
    >;

  private restoreSource:
    LivePerformanceEvidencePersistenceDiagnostics["restoreSource"] =
    "NONE";

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private restoredMetrics:
    ExecutionMetricsReport |
    null =
    null;

  private readonly restoredSnapshots:
    ExecutionMetricsSnapshot[] =
    [];

  private readonly restoredSettlements =
    new Map<
      string,
      ExecutionSettlementRecord
    >();

  private skippedWrites =
    0;

  private lastPersistedAt:
    number | null =
    null;

  private lastFingerprint:
    string | null =
    null;

  private observedSettlements =
    0;

  private verifiedLiveSettlements =
    0;

  private excludedNonLiveOrUnverifiedSettlements =
    0;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,
    checkpointFilePath =
      DEFAULT_CHECKPOINT_FILE,
    private readonly getVerifiedLiveSessionIds:
      () => ReadonlySet<string> =
      () =>
        liveExecutionSessionEvidenceService
          .getVerifiedLiveSessionIds(),
  ) {
    this.legacyStore =
      new JsonlSnapshotStore<
        PersistedLivePerformanceEvidence
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            PersistedLivePerformanceEvidence =>
            this.isValidPayload(
              value,
            ),

        decodeLegacy:
          (
            value,
          ) =>
            this.isValidPayload(
              value,
            )
              ? value
              : null,
      });

    const checkpointOptions = {
      isPayload:
        (
          value:
            unknown,
        ): value is PersistedLivePerformanceCheckpoint =>
          this.isValidCheckpoint(
            value,
          ),
    };

    this.checkpointStore =
      new JsonlSnapshotStore<
        PersistedLivePerformanceCheckpoint
      >({
        filePath:
          checkpointFilePath,
        ...checkpointOptions,
      });

    this.previousCheckpointStore =
      new JsonlSnapshotStore<
        PersistedLivePerformanceCheckpoint
      >({
        filePath:
          `${checkpointFilePath}.previous`,
        ...checkpointOptions,
      });

    this.restore();
  }

  capture():
    void {
    const metrics =
      executionMetricsService
        .getReport();

    const metricSnapshot =
      executionMetricsSnapshotService
        .getRecent(
          1,
        )[0] ??
      null;

    const observedSettlements =
      executionSettlementService
        .getDiagnostics()
        .settlements;

    const settlements =
      this.selectVerifiedLiveSettlements(
        observedSettlements,
      );

    const fingerprint =
      this.fingerprint(
        metrics,
        settlements,
      );

    const now =
      Date.now();

    const changed =
      fingerprint !==
      this.lastFingerprint;

    const periodicDue =
      this.lastPersistedAt ===
        null ||
      now -
        this.lastPersistedAt >=
        PERIODIC_PERSIST_INTERVAL_MS;

    if (
      !changed &&
      !periodicDue
    ) {
      this.skippedWrites +=
        1;

      return;
    }

    const snapshots =
      this.mergeSnapshots(
        metricSnapshot,
      );
    const mergedSettlements =
      this.mergeSettlements(
        settlements,
      );
    const payload:
      PersistedLivePerformanceCheckpoint = {
      schemaVersion:
        2,

      persistedAt:
        now,

      metrics:
        structuredClone(
          metrics,
        ),

      metricSnapshots:
        snapshots,

      settlements:
        mergedSettlements,
    };

    try {
      this.checkpointStore
        .replaceAllAtomically([
          payload,
        ]);

      this.lastPersistedAt =
        now;

      this.lastFingerprint =
        fingerprint;

      this.absorbCheckpoint(
        payload,
      );
    } catch {
      /*
       * Persistence must never crash the
       * execution metrics scheduler.
       */
    }
  }

  getRestoredMetricsReport():
    ExecutionMetricsReport |
    null {
    return this.restoredMetrics
      ? structuredClone(
          this.restoredMetrics,
        )
      : null;
  }

  getRestoredMetricSnapshots(
    limit =
      60,
  ):
    ExecutionMetricsSnapshot[] {
    const normalizedLimit =
      Math.max(
        1,

        Math.min(
          Math.floor(
            limit,
          ),

          MAXIMUM_RESTORED_SNAPSHOTS,
        ),
      );

    return this.restoredSnapshots
      .slice(
        -normalizedLimit,
      )
      .map(
        (
          snapshot,
        ) =>
          structuredClone(
            snapshot,
          ),
      );
  }

  getRestoredSettlements():
    ExecutionSettlementRecord[] {
    return Array.from(
      this.restoredSettlements
        .values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second.createdAt -
          first.createdAt,
      )
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getDiagnostics():
    LivePerformanceEvidencePersistenceDiagnostics {
    const foundation =
      this.checkpointStore
        .getDiagnostics();
    const legacyFoundation =
      this.legacyStore
        .getDiagnostics();

    return {
      persistenceFilePath:
        foundation.filePath,

      legacyPersistenceFilePath:
        legacyFoundation.filePath,

      restoreSource:
        this.restoreSource,

      boundedCheckpoint:
        true,

      legacyAppendDisabled:
        true,

      liveOnlySettlementCheckpoint:
        true,

      observedSettlements:
        this.observedSettlements,

      verifiedLiveSettlements:
        this.verifiedLiveSettlements,

      excludedNonLiveOrUnverifiedSettlements:
        this.excludedNonLiveOrUnverifiedSettlements,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      restoredMetricsExecutions:
        this.restoredMetrics
          ?.totalExecutions ??
        0,

      restoredMetricSnapshots:
        this.restoredSnapshots
          .length,

      restoredSettlements:
        this.restoredSettlements
          .size,

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      skippedWrites:
        this.skippedWrites,

      lastPersistedAt:
        this.lastPersistedAt,

      lastError:
        foundation.lastError,

      foundation: {
        linesRead:
          foundation.linesRead,

        validRecordsRead:
          foundation.validRecordsRead,

        legacyRecordsRead:
          foundation.legacyRecordsRead,

        malformedRecordsIgnored:
          foundation
            .malformedRecordsIgnored,

        lastSequence:
          foundation.lastSequence,
      },

      legacyFoundation: {
        exists:
          legacyFoundation.exists,

        linesRead:
          legacyFoundation.linesRead,

        validRecordsRead:
          legacyFoundation.validRecordsRead,

        malformedRecordsIgnored:
          legacyFoundation
            .malformedRecordsIgnored,

        lastSequence:
          legacyFoundation.lastSequence,
      },

      /*
       * VERSION 18 BUILD 2
       *
       * Exposed inside the already-existing
       * persistence diagnostics endpoint.
       */
      sessionEvidence:
        liveExecutionSessionEvidenceService
          .getDiagnostics(),
    };
  }

  private restore():
    void {
    const checkpoint =
      this.checkpointStore
        .readLatest();

    if (checkpoint) {
      this.absorbCheckpoint(
        checkpoint,
      );

      this.restoreSource =
        "CHECKPOINT";

      this.finishRestore();
      return;
    }

    const previousCheckpoint =
      this.previousCheckpointStore
        .readLatest();

    if (previousCheckpoint) {
      this.absorbCheckpoint(
        previousCheckpoint,
      );

      this.restoreSource =
        "CHECKPOINT_PREVIOUS";

      this.finishRestore();
      return;
    }

    const record =
      this.legacyStore
        .readLatest();

    if (
      !record
    ) {
      return;
    }

    this.absorb(
      record,
    );

    this.restoreSource =
      "LEGACY_BOUNDED_TAIL";

    this.finishRestore();
  }

  private finishRestore():
    void {

    this.restored =
      true;

    this.restoredAt =
      Date.now();

    if (
      this.restoredMetrics
    ) {
      this.lastFingerprint =
        this.fingerprint(
          this.restoredMetrics,

          this.getRestoredSettlements(),
        );
    }
  }

  private absorb(
    record:
      PersistedLivePerformanceEvidence,
  ):
    void {
    this.restoredMetrics =
      structuredClone(
        record.metrics,
      );

    this.lastPersistedAt =
      Math.max(
        this.lastPersistedAt ??
          0,

        record.persistedAt,
      );

    if (
      record.metricSnapshot &&
      !this.restoredSnapshots
        .some(
          (
            snapshot,
          ) =>
            snapshot.timestamp ===
            record
              .metricSnapshot
              ?.timestamp,
        )
    ) {
      this.restoredSnapshots.push(
        structuredClone(
          record.metricSnapshot,
        ),
      );

      this.restoredSnapshots.sort(
        (
          first,
          second,
        ) =>
          first.timestamp -
          second.timestamp,
      );

      if (
        this.restoredSnapshots
          .length >
        MAXIMUM_RESTORED_SNAPSHOTS
      ) {
        this.restoredSnapshots.splice(
          0,

          this.restoredSnapshots
            .length -
            MAXIMUM_RESTORED_SNAPSHOTS,
        );
      }
    }

    this.addSettlements(
      this.selectVerifiedLiveSettlements(
        record.settlements,
      ),
    );
  }

  private absorbCheckpoint(
    checkpoint:
      PersistedLivePerformanceCheckpoint,
  ):
    void {
    this.restoredMetrics =
      structuredClone(
        checkpoint.metrics,
      );

    this.lastPersistedAt =
      Math.max(
        this.lastPersistedAt ??
          0,
        checkpoint.persistedAt,
      );

    for (
      const snapshot
      of checkpoint.metricSnapshots
    ) {
      this.addSnapshot(
        snapshot,
      );
    }

    this.addSettlements(
      this.selectVerifiedLiveSettlements(
        checkpoint.settlements,
      ),
    );
  }

  private selectVerifiedLiveSettlements(
    settlements:
      readonly ExecutionSettlementRecord[],
  ):
    ExecutionSettlementRecord[] {
    const verifiedLiveSessionIds =
      this.getVerifiedLiveSessionIds();
    const selected =
      settlements
        .filter(
          (
            settlement,
          ) =>
            verifiedLiveSessionIds.has(
              settlement.sessionId,
            ),
        );

    this.observedSettlements =
      settlements.length;
    this.verifiedLiveSettlements =
      selected.length;
    this.excludedNonLiveOrUnverifiedSettlements =
      settlements.length -
      selected.length;

    return selected;
  }

  private mergeSnapshots(
    metricSnapshot:
      ExecutionMetricsSnapshot | null,
  ):
    ExecutionMetricsSnapshot[] {
    const snapshots =
      this.restoredSnapshots
        .map(
          (
            snapshot,
          ) =>
            structuredClone(
              snapshot,
            ),
        );

    if (
      metricSnapshot &&
      !snapshots.some(
        (
          snapshot,
        ) =>
          snapshot.timestamp ===
          metricSnapshot.timestamp,
      )
    ) {
      snapshots.push(
        structuredClone(
          metricSnapshot,
        ),
      );
    }

    return snapshots
      .sort(
        (
          first,
          second,
        ) =>
          first.timestamp -
          second.timestamp,
      )
      .slice(
        -MAXIMUM_RESTORED_SNAPSHOTS,
      );
  }

  private mergeSettlements(
    settlements:
      readonly ExecutionSettlementRecord[],
  ):
    ExecutionSettlementRecord[] {
    const merged =
      new Map(
        this.restoredSettlements,
      );

    for (
      const settlement
      of settlements
    ) {
      const existing =
        merged.get(
          settlement.sessionId,
        );
      const timestamp =
        settlement.settledAt ??
        settlement.createdAt;
      const existingTimestamp =
        existing
          ? (
              existing.settledAt ??
              existing.createdAt
            )
          : -1;

      if (
        !existing ||
        timestamp >=
          existingTimestamp
      ) {
        merged.set(
          settlement.sessionId,
          structuredClone(
            settlement,
          ),
        );
      }
    }

    return [...merged.values()]
      .sort(
        (
          first,
          second,
        ) =>
          second.createdAt -
          first.createdAt,
      );
  }

  private addSnapshot(
    snapshot:
      ExecutionMetricsSnapshot,
  ):
    void {
    if (
      this.restoredSnapshots.some(
        (
          current,
        ) =>
          current.timestamp ===
          snapshot.timestamp,
      )
    ) {
      return;
    }

    this.restoredSnapshots.push(
      structuredClone(
        snapshot,
      ),
    );
    this.restoredSnapshots.sort(
      (
        first,
        second,
      ) =>
        first.timestamp -
        second.timestamp,
    );

    if (
      this.restoredSnapshots.length >
      MAXIMUM_RESTORED_SNAPSHOTS
    ) {
      this.restoredSnapshots.splice(
        0,
        this.restoredSnapshots.length -
          MAXIMUM_RESTORED_SNAPSHOTS,
      );
    }
  }

  private addSettlements(
    settlements:
      readonly ExecutionSettlementRecord[],
  ):
    void {
    for (
      const settlement
      of settlements
    ) {
      const existing =
        this.restoredSettlements
          .get(
            settlement.sessionId,
          );
      const settlementTimestamp =
        settlement.settledAt ??
        settlement.createdAt;
      const existingTimestamp =
        existing
          ? (
              existing.settledAt ??
              existing.createdAt
            )
          : -1;

      if (
        !existing ||
        settlementTimestamp >=
          existingTimestamp
      ) {
        this.restoredSettlements.set(
          settlement.sessionId,
          structuredClone(
            settlement,
          ),
        );
      }
    }
  }

  private isValidPayload(
    value:
      unknown,
  ): value is
    PersistedLivePerformanceEvidence {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      typeof value.persistedAt !==
        "number" ||
      !Number.isFinite(
        value.persistedAt,
      ) ||
      !this.isRecord(
        value.metrics,
      ) ||
      typeof value.metrics
        .totalExecutions !==
        "number" ||
      !Array.isArray(
        value.metrics
          .exchanges,
      ) ||
      !Array.isArray(
        value.settlements,
      )
    ) {
      return false;
    }

    return true;
  }

  private isValidCheckpoint(
    value:
      unknown,
  ): value is
    PersistedLivePerformanceCheckpoint {
    return this.isRecord(
      value,
    ) &&
      value.schemaVersion ===
        2 &&
      typeof value.persistedAt ===
        "number" &&
      Number.isFinite(
        value.persistedAt,
      ) &&
      this.isRecord(
        value.metrics,
      ) &&
      typeof value.metrics
        .totalExecutions ===
        "number" &&
      Array.isArray(
        value.metrics
          .exchanges,
      ) &&
      Array.isArray(
        value.metricSnapshots,
      ) &&
      value.metricSnapshots.length <=
        MAXIMUM_RESTORED_SNAPSHOTS &&
      Array.isArray(
        value.settlements,
      );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<
      string,
      unknown
    > {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }

  private fingerprint(
    metrics:
      ExecutionMetricsReport,

    settlements:
      readonly ExecutionSettlementRecord[],
  ):
    string {
    return JSON.stringify({
      totalExecutions:
        metrics.totalExecutions,

      exchanges:
        metrics.exchanges.map(
          (
            exchange,
          ) => [
            exchange.exchange,

            exchange.totalExecutions,

            exchange.filledExecutions,

            exchange.failedExecutions,

            exchange.rejectedExecutions,

            exchange.timedOutExecutions,

            exchange.partialFillExecutions,

            exchange.lastExecutionAt,
          ],
        ),

      settlements:
        settlements.map(
          (
            settlement,
          ) => [
            settlement.sessionId,

            settlement.status,

            settlement.settledAt,

            settlement.netProfit,

            settlement.totalFees,
          ],
        ),
    });
  }
}

export const livePerformanceEvidencePersistenceService =
  new LivePerformanceEvidencePersistenceService();
