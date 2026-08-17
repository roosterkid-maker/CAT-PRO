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

export interface LivePerformanceEvidencePersistenceDiagnostics {
  persistenceFilePath: string;

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

  sessionEvidence:
    ReturnType<
      typeof liveExecutionSessionEvidenceService.getDiagnostics
    >;
}

export class LivePerformanceEvidencePersistenceService {
  private readonly store:
    JsonlSnapshotStore<
      PersistedLivePerformanceEvidence
    >;

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

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,
  ) {
    this.store =
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

    const settlements =
      executionSettlementService
        .getDiagnostics()
        .settlements;

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

    const payload:
      PersistedLivePerformanceEvidence = {
      schemaVersion:
        1,

      persistedAt:
        now,

      metrics:
        structuredClone(
          metrics,
        ),

      metricSnapshot:
        metricSnapshot
          ? structuredClone(
              metricSnapshot,
            )
          : null,

      settlements:
        settlements.map(
          (
            settlement,
          ) =>
            structuredClone(
              settlement,
            ),
        ),
    };

    try {
      this.store.append(
        payload,
      );

      this.lastPersistedAt =
        now;

      this.lastFingerprint =
        fingerprint;

      this.absorb(
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
      this.store
        .getDiagnostics();

    return {
      persistenceFilePath:
        foundation.filePath,

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
    const records =
      this.store
        .readAll();

    if (
      records.length ===
      0
    ) {
      return;
    }

    for (
      const record
      of records
    ) {
      this.absorb(
        record,
      );
    }

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

    for (
      const settlement
      of record.settlements
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