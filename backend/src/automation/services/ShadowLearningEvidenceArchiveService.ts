import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlRotatingWriter,
  readBestValidJsonlAcrossArchives,
  readLatestValidJsonlAcrossArchives,
} from "../../core/persistence/JsonlArchiveStore";

import type {
  JsonlArchiveRestoreDiagnostics,
} from "../../core/persistence/JsonlArchiveStore";

import type {
  ExecutionCandidateQueueItem,
} from "../models/ExecutionCandidateQueue";

import type {
  ShadowDispatchRecord,
} from "../models/ShadowExecutionDispatcher";

import type {
  ShadowLearningEvidenceArchiveDiagnostics,
} from "../models/ShadowLearningEvidenceArchive";

import type {
  ShadowTradeOutcomeRecord,
} from "../models/ShadowTradeOutcome";

import {
  executionCandidateQueueService,
} from "./ExecutionCandidateQueueService";

import {
  shadowExecutionDispatcherService,
} from "./ShadowExecutionDispatcherService";

import {
  shadowTradeOutcomeTrackerService,
} from "./ShadowTradeOutcomeTrackerService";

import {
  normalizeStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

const SCHEMA_VERSION =
  1;

const MAXIMUM_QUEUE_HISTORY =
  1_000;

const MAXIMUM_DISPATCH_HISTORY =
  1_000;

const MAXIMUM_OUTCOME_HISTORY =
  1_000;

const DEFAULT_RESTORE_CHUNK_SIZE_BYTES =
  64 * 1_024;

const DEFAULT_MAXIMUM_SNAPSHOT_BYTES =
  128 * 1_024 * 1_024;

const DEFAULT_ROTATION_FILE_BYTES =
  128 * 1_024 * 1_024;

const DEFAULT_ROTATION_RECORDS =
  2_000;

const DEFAULT_MAXIMUM_ARCHIVES =
  2;

const PRODUCTION_PERSISTENCE_INTERVAL_MS =
  5 * 60 * 1_000;

const CHECKPOINT_ROTATION_FILE_BYTES =
  4 * 1_024 * 1_024;

const CHECKPOINT_ROTATION_RECORDS =
  20_000;

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "automation",
    "shadow-learning-evidence.jsonl",
  );

interface PersistedShadowLearningEvidence {
  schemaVersion: 1;

  persistedAt: number;

  startedAt: number;

  captureCount: number;

  lastCapturedAt: number | null;

  lastCapturedSnapshotGeneratedAt:
    number | null;

  queueItems:
    ExecutionCandidateQueueItem[];

  dispatchRecords:
    ShadowDispatchRecord[];

  outcomeRecords:
    ShadowTradeOutcomeRecord[];
}

interface ShadowLearningRestoreCheckpointV1 {
  schemaVersion: 1;

  writtenAt: number;

  sourcePersistedAt: number;

  sourceCaptureCount: number;

  sourceEvidenceCount: number;

  sourceFingerprint: string;
}

interface ShadowLearningRestoreCheckpointV2 {
  schemaVersion: 2;

  writtenAt: number;

  sourcePersistedAt: number;

  sourceCaptureCount: number;

  sourceEvidenceCount: number;

  sourceFingerprint: string;

  authoritativeSnapshot:
    PersistedShadowLearningEvidence;

  authoritativeFingerprint: string;
}

type ShadowLearningRestoreCheckpoint =
  | ShadowLearningRestoreCheckpointV1
  | ShadowLearningRestoreCheckpointV2;

export interface ShadowLearningEvidencePersistenceOptions {
  restoreChunkSizeBytes?: number;

  maximumSnapshotBytes?: number;

  checkpointFilePath?: string;

  rotationEnabled?: boolean;

  rotationMaximumFileBytes?: number;

  rotationMaximumRecords?: number;

  maximumArchives?: number;

  protectExistingOversizedFile?: boolean;

  minimumPersistenceIntervalMs?: number;
}

export class ShadowLearningEvidenceArchiveService {
  private startedAt =
    Date.now();

  private captureCount =
    0;

  private lastCapturedAt:
    number | null =
    null;

  private lastCapturedSnapshotGeneratedAt:
    number | null =
    null;

  private readonly queueItems =
    new Map<
      string,
      ExecutionCandidateQueueItem
    >();

  private readonly dispatchRecords =
    new Map<
      string,
      ShadowDispatchRecord
    >();

  private readonly outcomeRecords =
    new Map<
      string,
      ShadowTradeOutcomeRecord
    >();

  private readonly persistenceFilePath:
    string;

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private writes =
    0;

  private writeFailures =
    0;

  private lastPersistedAt:
    number | null =
    null;

  private lastError:
    string | null =
    null;

  private readonly restoreChunkSizeBytes:
    number;

  private readonly maximumSnapshotBytes:
    number;

  private readonly minimumPersistenceIntervalMs:
    number;

  private lastPersistenceAttemptAt:
    number | null =
    null;

  private readonly checkpointFilePath:
    string;

  private restoreMode:
    | "CHECKPOINT_BOUNDED"
    | "LEGACY_BASELINE_SCAN"
    | "NONE" =
    "NONE";

  private checkpointMatched =
    false;

  private restoreDiagnostics:
    JsonlArchiveRestoreDiagnostics;

  private readonly writer:
    JsonlRotatingWriter<
      PersistedShadowLearningEvidence
    >;

  private readonly checkpointWriter:
    JsonlRotatingWriter<
      ShadowLearningRestoreCheckpoint
    >;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,

    options:
      ShadowLearningEvidencePersistenceOptions = {},
  ) {
    this.persistenceFilePath =
      persistenceFilePath;

    this.restoreChunkSizeBytes =
      options.restoreChunkSizeBytes ??
      DEFAULT_RESTORE_CHUNK_SIZE_BYTES;

    this.maximumSnapshotBytes =
      options.maximumSnapshotBytes ??
      DEFAULT_MAXIMUM_SNAPSHOT_BYTES;

    this.minimumPersistenceIntervalMs =
      options.minimumPersistenceIntervalMs ??
      0;

    if (
      !Number.isSafeInteger(
        this.minimumPersistenceIntervalMs,
      ) ||
      this.minimumPersistenceIntervalMs <
        0
    ) {
      throw new Error(
        "Shadow-learning evidence minimum persistence interval must be a non-negative integer.",
      );
    }

    this.checkpointFilePath =
      options.checkpointFilePath ??
      `${persistenceFilePath}.checkpoint.jsonl`;

    this.restoreDiagnostics =
      this.emptyRestoreDiagnostics();

    this.writer =
      new JsonlRotatingWriter(
        persistenceFilePath,
        {
          enabled:
            options.rotationEnabled ??
            true,

          maximumFileBytes:
            options
              .rotationMaximumFileBytes ??
            DEFAULT_ROTATION_FILE_BYTES,

          maximumRecords:
            options
              .rotationMaximumRecords ??
            DEFAULT_ROTATION_RECORDS,

          maximumArchives:
            options.maximumArchives ??
            DEFAULT_MAXIMUM_ARCHIVES,

          protectExistingOversizedFile:
            options
              .protectExistingOversizedFile ??
            true,
        },
      );

    this.checkpointWriter =
      new JsonlRotatingWriter(
        this.checkpointFilePath,
        {
          enabled:
            true,

          maximumFileBytes:
            CHECKPOINT_ROTATION_FILE_BYTES,

          maximumRecords:
            CHECKPOINT_ROTATION_RECORDS,

          maximumArchives:
            options.maximumArchives ??
            DEFAULT_MAXIMUM_ARCHIVES,

          protectExistingOversizedFile:
            options
              .protectExistingOversizedFile ??
            true,
        },
      );

    this.restore();
  }

  /*
   * Called once per NEW authoritative
   * automation snapshot.
   *
   * IMPORTANT:
   *
   * This archives diagnostic evidence only.
   * It does NOT mutate operational queue,
   * dispatcher or outcome state.
   */
  capture(
    snapshotGeneratedAt:
      number,
  ): void {
    if (
      this.lastCapturedSnapshotGeneratedAt ===
      snapshotGeneratedAt
    ) {
      return;
    }

    executionCandidateQueueService
      .forEachArchiveItem(
        (
          item,
        ) => {
          this.queueItems.set(
            item.id,
            this.normalizeQueueItem(
              item,
            ),
          );
        },
      );

    shadowExecutionDispatcherService
      .forEachArchiveRecord(
        (
          record,
        ) => {
          this.dispatchRecords.set(
            record.id,
            this.normalizeDispatchRecord(
              record,
            ),
          );
        },
      );

    shadowTradeOutcomeTrackerService
      .forEachAnalyticsRecord(
        (
          record,
        ) => {
          this.outcomeRecords.set(
            record.id,
            this.normalizeOutcomeRecord(
              record,
            ),
          );
        },
      );

    this.captureCount +=
      1;

    this.lastCapturedAt =
      Date.now();

    this.lastCapturedSnapshotGeneratedAt =
      snapshotGeneratedAt;

    this.trimHistory();

    this.persist();
  }

  getQueueItems():
    ExecutionCandidateQueueItem[] {
    return this.sortedQueueItems()
      .map(
        (
          item,
        ) =>
          structuredClone(
            item,
          ),
      );
  }

  getDispatchRecords():
    ShadowDispatchRecord[] {
    return this.sortedDispatchRecords()
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getOutcomeRecords():
    ShadowTradeOutcomeRecord[] {
    return this.sortedOutcomeRecords()
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
    ShadowLearningEvidenceArchiveDiagnostics {
    const queueItems =
      this.getQueueItems();

    const dispatchRecords =
      this.getDispatchRecords();

    const outcomeRecords =
      this.getOutcomeRecords();

    return {
      generatedAt:
        Date.now(),

      version:
        "17.4",

      build:
        "9",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      operationalStateRestored:
        false,

      startedAt:
        this.startedAt,

      captureCount:
        this.captureCount,

      lastCapturedAt:
        this.lastCapturedAt,

      lastCapturedSnapshotGeneratedAt:
        this
          .lastCapturedSnapshotGeneratedAt,

      persistence: {
        enabled:
          true,

        format:
          "JSONL_SNAPSHOT",

        restoreStatus:
          this.restoreDiagnostics
            .restoreStatus,

        restoreMode:
          this.restoreMode,

        filePath:
          this.persistenceFilePath,

        checkpointFilePath:
          this.checkpointFilePath,

        checkpointMatched:
          this.checkpointMatched,

        restored:
          this.restored,

        restoredAt:
          this.restoredAt,

        archivesConsidered:
          this.restoreDiagnostics
            .archivesConsidered,

        archivesOpened:
          this.restoreDiagnostics
            .archivesOpened,

        restoreBytesRead:
          this.restoreDiagnostics
            .bytesRead,

        restoreRecordsExamined:
          this.restoreDiagnostics
            .recordsExamined,

        restoreMalformedRecordsIgnored:
          this.restoreDiagnostics
            .malformedRecordsIgnored,

        restoreOversizedRecordsIgnored:
          this.restoreDiagnostics
            .oversizedRecordsIgnored,

        restoreDurationMs:
          this.restoreDiagnostics
            .durationMs,

        selectedAuthoritativeSource:
          this.restoreDiagnostics
            .selectedAuthoritativeSource,

        rotation: {
          enabled:
            this.writer
              .getDiagnostics()
              .rotationEnabled,

          maximumFileBytes:
            this.writer
              .getDiagnostics()
              .maximumFileBytes,

          maximumRecords:
            this.writer
              .getDiagnostics()
              .maximumRecords,

          existingOversizedFileProtected:
            this.writer
              .getDiagnostics()
              .existingOversizedFileProtected,

          rotations:
            this.writer
              .getDiagnostics()
              .rotations,

          lastArchiveCreated:
            this.writer
              .getDiagnostics()
              .lastArchiveCreated,
        },

        writes:
          this.writes,

        writeFailures:
          this.writeFailures,

        lastPersistedAt:
          this.lastPersistedAt,

        lastError:
          this.lastError,
      },

      summary: {
        queueItemsArchived:
          queueItems.length,

        readyQueueItemsArchived:
          this.countQueueStatus(
            queueItems,
            "READY",
          ),

        consumedQueueItemsArchived:
          this.countQueueStatus(
            queueItems,
            "CONSUMED",
          ),

        removedQueueItemsArchived:
          this.countQueueStatus(
            queueItems,
            "REMOVED",
          ),

        cancelledQueueItemsArchived:
          this.countQueueStatus(
            queueItems,
            "CANCELLED",
          ),

        expiredQueueItemsArchived:
          this.countQueueStatus(
            queueItems,
            "EXPIRED",
          ),

        dispatchRecordsArchived:
          dispatchRecords.length,

        shadowDispatchedArchived:
          dispatchRecords.filter(
            (
              record,
            ) =>
              record.status ===
              "SHADOW_DISPATCHED",
          ).length,

        revalidationFailedArchived:
          dispatchRecords.filter(
            (
              record,
            ) =>
              record.status ===
              "REVALIDATION_FAILED",
          ).length,

        duplicateSuppressedArchived:
          dispatchRecords.filter(
            (
              record,
            ) =>
              record.status ===
              "DUPLICATE_SUPPRESSED",
          ).length,

        outcomeRecordsArchived:
          outcomeRecords.length,

        trackingOutcomesArchived:
          this.countOutcomeStatus(
            outcomeRecords,
            "TRACKING",
          ),

        successfulOutcomesArchived:
          this.countOutcomeStatus(
            outcomeRecords,
            "SUCCESS",
          ),

        failedOutcomesArchived:
          this.countOutcomeStatus(
            outcomeRecords,
            "FAILED",
          ),

        dataUnavailableOutcomesArchived:
          this.countOutcomeStatus(
            outcomeRecords,
            "DATA_UNAVAILABLE",
          ),
      },

      queueItems,

      dispatchRecords,

      outcomeRecords,

      observations: [
        `${queueItems.length} queue item(s), ${dispatchRecords.length} shadow-dispatch record(s), and ${outcomeRecords.length} shadow-outcome record(s) are archived.`,

        this.restored
          ? "Persistent shadow-learning evidence was restored from the latest valid JSONL snapshot."
          : "No previous shadow-learning evidence snapshot was restored.",

        "Operational queue state is intentionally NOT restored from this archive.",

        "Historical READY items are evidence only and cannot execute or dispatch after restart.",

        "Historical TRACKING outcomes are evidence only and are not automatically resumed by this archive.",

        "This service cannot submit PAPER or LIVE orders.",

        "LIVE execution remains disabled.",
      ],
    };
  }

  private persist():
    void {
    const persistedAt =
      Date.now();

    if (
      this.lastPersistenceAttemptAt !==
        null &&
      persistedAt -
        this.lastPersistenceAttemptAt <
        this.minimumPersistenceIntervalMs
    ) {
      return;
    }

    this.lastPersistenceAttemptAt =
      persistedAt;

    const snapshot:
      PersistedShadowLearningEvidence = {
      schemaVersion:
        SCHEMA_VERSION,

      persistedAt,

      startedAt:
        this.startedAt,

      captureCount:
        this.captureCount,

      lastCapturedAt:
        this.lastCapturedAt,

      lastCapturedSnapshotGeneratedAt:
        this
          .lastCapturedSnapshotGeneratedAt,

      queueItems:
        this.getQueueItems(),

      dispatchRecords:
        this.getDispatchRecords(),

      outcomeRecords:
        this.getOutcomeRecords(),
    };

    try {
      this.writer.append(
        snapshot,
      );

      this.checkpointWriter.append(
        this.createCheckpoint(
          snapshot,
        ),
      );

      this.writes +=
        1;

      this.lastPersistedAt =
        persistedAt;

      this.lastError =
        null;
    } catch (
      error:
        unknown
    ) {
      this.writeFailures +=
        1;

      this.lastError =
        error instanceof Error
          ? error.message
          : "Shadow-learning evidence persistence failed.";

      console.error(
        "[ShadowLearningEvidence] Persistence failed:",
        this.lastError,
      );
    }
  }

  private restore():
    void {
    try {
      const latestRestore =
        readLatestValidJsonlAcrossArchives(
          this.persistenceFilePath,
          (
            value,
          ): value is PersistedShadowLearningEvidence =>
            this.isPersistedSnapshot(
              value,
            ),
          {
            chunkSizeBytes:
              this.restoreChunkSizeBytes,

            maximumLineBytes:
              this.maximumSnapshotBytes,
          },
        );

      const latest =
        latestRestore.value ??
        null;

      this.restoreDiagnostics =
        latestRestore;

      if (
        !latest
      ) {
        this.lastError =
          latestRestore.lastError;

        return;
      }

      const checkpointRestore =
        readLatestValidJsonlAcrossArchives(
          this.checkpointFilePath,
          (
            value,
          ): value is ShadowLearningRestoreCheckpoint =>
            this.isCheckpoint(
              value,
            ),
          {
            chunkSizeBytes:
              this.restoreChunkSizeBytes,

            maximumLineBytes:
              this.maximumSnapshotBytes,
          },
        );

      const checkpoint =
        checkpointRestore.value;

      const highWaterCheckpointRestore =
        readBestValidJsonlAcrossArchives(
          this.checkpointFilePath,
          (
            value,
          ): value is ShadowLearningRestoreCheckpoint =>
            this.isCheckpoint(
              value,
            ),
          (
            candidate,
            selected,
          ) =>
            this.checkpointEvidenceCount(
              candidate,
            ) >
            this.checkpointEvidenceCount(
              selected,
            ),
          {
            chunkSizeBytes:
              this.restoreChunkSizeBytes,

            maximumLineBytes:
              this.maximumSnapshotBytes,

            noMatchStatus:
              "NO_DATA",
          },
        );

      const checkpointEvidenceHighWater =
        highWaterCheckpointRestore.value
          ? this.checkpointEvidenceCount(
              highWaterCheckpointRestore.value,
            )
          : 0;

      this.checkpointMatched =
        checkpoint !==
          null &&
        this.checkpointMatches(
          checkpoint,
          latest,
        );

      const authoritativeCheckpointMatched =
        this.checkpointMatched &&
        checkpoint
          ?.schemaVersion ===
        2 &&
        this.checkpointEvidenceCount(
          checkpoint,
        ) >=
          checkpointEvidenceHighWater;

      const latestEvidenceCount =
        this.snapshotEvidenceCount(
          latest,
        );

      /*
       * A matching legacy (schema-v1) checkpoint proves that the tail snapshot
       * was parsed, but it does not contain an authoritative baseline. It can
       * suppress the large evidence-file scan only when its source has reached
       * the checkpoint history's evidence high-water mark. This catches both
       * empty and partially regressed tails without penalizing healthy starts.
       * Schema-v2 checkpoints embed the merged baseline, but are trusted only
       * when they also cover that high-water mark.
       */
      const baselineScanSuppressed =
        authoritativeCheckpointMatched ||
        (
          this.checkpointMatched &&
          latestEvidenceCount >
            0 &&
          latestEvidenceCount >=
            checkpointEvidenceHighWater
        );

      /*
       * A healthy archive snapshot is cumulative.
       * Queue/dispatch/outcome maps do not shrink to
       * zero across capture cycles.
       *
       * If an older snapshot has a greater cumulative
       * count, a previous process likely failed restore
       * and subsequently appended a regressed snapshot.
       * Merge that baseline with the latest snapshot so
       * no historical or newer evidence is discarded.
       */
      const baselineRestore =
        baselineScanSuppressed
          ? null
          : readBestValidJsonlAcrossArchives(
              this.persistenceFilePath,
              (
                value,
              ): value is PersistedShadowLearningEvidence =>
                this.isPersistedSnapshot(
                  value,
                ),
              (
                candidate,
                selected,
              ) => {
                const candidateEvidenceCount =
                  this.snapshotEvidenceCount(
                    candidate,
                  );

                const selectedEvidenceCount =
                  this.snapshotEvidenceCount(
                    selected,
                  );

                if (
                  candidateEvidenceCount !==
                  selectedEvidenceCount
                ) {
                  return candidateEvidenceCount >
                    selectedEvidenceCount;
                }

                if (
                  candidate.captureCount !==
                  selected.captureCount
                ) {
                  return candidate.captureCount >
                    selected.captureCount;
                }

                return candidate.persistedAt >
                  selected.persistedAt;
              },
              {
                chunkSizeBytes:
                  this.restoreChunkSizeBytes,

                maximumLineBytes:
                  this.maximumSnapshotBytes,

                noMatchStatus:
                  "NO_DATA",
              },
            );

      const baseline =
        baselineRestore
          ?.value ??
        null;

      if (
        baselineRestore
          ?.restoreStatus ===
        "FAILED"
      ) {
        throw new Error(
          baselineRestore.lastError ??
            "Shadow legacy baseline verification failed.",
        );
      }

      this.restoreMode =
        baselineScanSuppressed
          ? "CHECKPOINT_BOUNDED"
          : "LEGACY_BASELINE_SCAN";

      if (
        baselineRestore
      ) {
        this.restoreDiagnostics =
          this.combineRestoreDiagnostics(
            latestRestore,
            baselineRestore,
          );
      }

      const restored =
        authoritativeCheckpointMatched &&
        checkpoint?.schemaVersion ===
          2
          ? structuredClone(
              checkpoint
                .authoritativeSnapshot,
            )
          : baseline
            ? this.mergePersistedSnapshots(
                baseline,
                latest,
              )
            : latest;

      this.startedAt =
        restored.startedAt;

      this.captureCount =
        restored.captureCount;

      this.lastCapturedAt =
        restored.lastCapturedAt;

      this.lastCapturedSnapshotGeneratedAt =
        restored
          .lastCapturedSnapshotGeneratedAt;

      for (
        const item
        of restored.queueItems
      ) {
        this.queueItems.set(
          item.id,
          this.normalizeQueueItem(
            item,
          ),
        );
      }

      for (
        const record
        of restored.dispatchRecords
      ) {
        this.dispatchRecords.set(
          record.id,
          this.normalizeDispatchRecord(
            record,
          ),
        );
      }

      for (
        const record
        of restored.outcomeRecords
      ) {
        this.outcomeRecords.set(
          record.id,
          this.normalizeOutcomeRecord(
            record,
          ),
        );
      }

      this.restored =
        true;

      this.restoredAt =
        Date.now();

      this.lastPersistedAt =
        restored.persistedAt;

      this.lastError =
        null;

      /*
       * V20.4
       *
       * A legacy archive without a checkpoint requires one
       * exact historical baseline scan. Persist the resulting
       * authoritative state in a separate sidecar so the next
       * restart is bounded even when the newest source snapshot
       * was produced by an older process with regressed state.
       *
       * The source evidence file is never rewritten. Failure to
       * seed this optimization leaves the exact restored state in
       * memory and safely falls back to another scan on restart.
       */
      if (
        !authoritativeCheckpointMatched
      ) {
        try {
          this.checkpointWriter
            .append(
              this.createBaselineCheckpoint(
                latest,
                restored,
              ),
            );
        } catch (
          error:
            unknown
        ) {
          console.error(
            "[ShadowLearningEvidence] Baseline checkpoint seed failed; the next restart will use the exact legacy scan again:",
            error instanceof Error
              ? error.message
              : "Unknown baseline checkpoint error.",
          );
        }
      }

      console.log(
        `[ShadowLearningEvidence] Restored ${this.queueItems.size} queue item(s), ${this.dispatchRecords.size} dispatch record(s), ${this.outcomeRecords.size} outcome record(s).`,
      );
    } catch (
      error:
        unknown
    ) {
      this.restoreDiagnostics = {
        ...this.restoreDiagnostics,

        restoreStatus:
          "FAILED",

        lastError:
          error instanceof Error
            ? error.message
            : "Shadow-learning evidence restore failed.",
      };

      this.lastError =
        error instanceof Error
          ? error.message
          : "Shadow-learning evidence restore failed.";

      console.error(
        "[ShadowLearningEvidence] Restore failed:",
        this.lastError,
      );
    }
  }

  private isPersistedSnapshot(
    value:
      unknown,
  ): value is PersistedShadowLearningEvidence {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return false;
    }

    const candidate =
      value as Partial<PersistedShadowLearningEvidence>;

    return (
      candidate.schemaVersion ===
        SCHEMA_VERSION &&
      typeof candidate.persistedAt ===
        "number" &&
      typeof candidate.startedAt ===
        "number" &&
      typeof candidate.captureCount ===
        "number" &&
      (
        candidate.lastCapturedAt ===
          null ||
        typeof candidate.lastCapturedAt ===
          "number"
      ) &&
      (
        candidate
          .lastCapturedSnapshotGeneratedAt ===
          null ||
        typeof candidate
          .lastCapturedSnapshotGeneratedAt ===
          "number"
      ) &&
      Array.isArray(
        candidate.queueItems,
      ) &&
      Array.isArray(
        candidate.dispatchRecords,
      ) &&
      Array.isArray(
        candidate.outcomeRecords,
      )
    );
  }

  private createCheckpoint(
    snapshot:
      PersistedShadowLearningEvidence,
  ): ShadowLearningRestoreCheckpoint {
    return {
      schemaVersion:
        1,

      writtenAt:
        Date.now(),

      sourcePersistedAt:
        snapshot.persistedAt,

      sourceCaptureCount:
        snapshot.captureCount,

      sourceEvidenceCount:
        this.snapshotEvidenceCount(
          snapshot,
        ),

      sourceFingerprint:
        this.snapshotFingerprint(
          snapshot,
        ),
    };
  }

  private createBaselineCheckpoint(
    sourceSnapshot:
      PersistedShadowLearningEvidence,

    authoritativeSnapshot:
      PersistedShadowLearningEvidence,
  ): ShadowLearningRestoreCheckpointV2 {
    return {
      schemaVersion:
        2,

      writtenAt:
        Date.now(),

      sourcePersistedAt:
        sourceSnapshot.persistedAt,

      sourceCaptureCount:
        sourceSnapshot.captureCount,

      sourceEvidenceCount:
        this.snapshotEvidenceCount(
          sourceSnapshot,
        ),

      sourceFingerprint:
        this.snapshotFingerprint(
          sourceSnapshot,
        ),

      authoritativeSnapshot:
        structuredClone(
          authoritativeSnapshot,
        ),

      authoritativeFingerprint:
        this.snapshotFingerprint(
          authoritativeSnapshot,
        ),
    };
  }

  private isCheckpoint(
    value:
      unknown,
  ): value is ShadowLearningRestoreCheckpoint {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return false;
    }

    const checkpoint =
      value as Partial<
        Omit<
          ShadowLearningRestoreCheckpointV2,
          "schemaVersion"
        >
      > & {
        schemaVersion?:
          number;
      };

    const commonFieldsValid =
      typeof checkpoint.writtenAt ===
        "number" &&
      typeof checkpoint.sourcePersistedAt ===
        "number" &&
      typeof checkpoint.sourceCaptureCount ===
        "number" &&
      typeof checkpoint.sourceEvidenceCount ===
        "number" &&
      typeof checkpoint.sourceFingerprint ===
        "string" &&
      checkpoint.sourceFingerprint.length ===
        64;

    if (
      !commonFieldsValid
    ) {
      return false;
    }

    if (
      checkpoint.schemaVersion ===
      1
    ) {
      return true;
    }

    if (
      checkpoint.schemaVersion !==
        2 ||
      !this.isPersistedSnapshot(
        checkpoint
          .authoritativeSnapshot,
      ) ||
      typeof checkpoint
        .authoritativeFingerprint !==
        "string" ||
      checkpoint
        .authoritativeFingerprint
        .length !==
        64
    ) {
      return false;
    }

    return (
      checkpoint
        .authoritativeFingerprint ===
      this.snapshotFingerprint(
        checkpoint
          .authoritativeSnapshot,
      )
    );
  }

  private checkpointMatches(
    checkpoint:
      ShadowLearningRestoreCheckpoint,
    snapshot:
      PersistedShadowLearningEvidence,
  ): boolean {
    return (
      checkpoint.sourcePersistedAt ===
        snapshot.persistedAt &&
      checkpoint.sourceCaptureCount ===
        snapshot.captureCount &&
      checkpoint.sourceEvidenceCount ===
        this.snapshotEvidenceCount(
          snapshot,
        ) &&
      checkpoint.sourceFingerprint ===
        this.snapshotFingerprint(
          snapshot,
        )
    );
  }

  private snapshotFingerprint(
    snapshot:
      PersistedShadowLearningEvidence,
  ): string {
    return createHash(
      "sha256",
    )
      .update(
        JSON.stringify(
          snapshot,
        ),
        "utf8",
      )
      .digest(
        "hex",
      );
  }

  /**
   * Internal zero-copy analytics traversal. Public diagnostics still return
   * defensive clones; aggregation code gets read-only-by-contract references
   * so large historical sample arrays are not copied on every PAPER gate.
   */
  forEachOutcomeRecordForAnalytics(
    visitor:
      (
        record:
          ShadowTradeOutcomeRecord,
      ) => void,
  ): void {
    for (
      const record
      of this.outcomeRecords.values()
    ) {
      visitor(
        record,
      );
    }
  }

  private emptyRestoreDiagnostics():
    JsonlArchiveRestoreDiagnostics {
    return {
      activeFile:
        this.persistenceFilePath,

      activeFileOpened:
        false,

      archivesConsidered:
        0,

      archivesOpened:
        0,

      bytesRead:
        0,

      recordsExamined:
        0,

      malformedRecordsIgnored:
        0,

      oversizedRecordsIgnored:
        0,

      durationMs:
        0,

      selectedAuthoritativeSource:
        null,

      restoreStatus:
        "NO_DATA",

      lastError:
        null,
    };
  }

  private combineRestoreDiagnostics(
    latest:
      JsonlArchiveRestoreDiagnostics,
    baseline:
      JsonlArchiveRestoreDiagnostics,
  ): JsonlArchiveRestoreDiagnostics {
    return {
      activeFile:
        latest.activeFile,

      activeFileOpened:
        latest.activeFileOpened ||
        baseline.activeFileOpened,

      archivesConsidered:
        Math.max(
          latest.archivesConsidered,
          baseline.archivesConsidered,
        ),

      archivesOpened:
        latest.archivesOpened +
        baseline.archivesOpened,

      bytesRead:
        latest.bytesRead +
        baseline.bytesRead,

      recordsExamined:
        latest.recordsExamined +
        baseline.recordsExamined,

      malformedRecordsIgnored:
        latest.malformedRecordsIgnored +
        baseline.malformedRecordsIgnored,

      oversizedRecordsIgnored:
        latest.oversizedRecordsIgnored +
        baseline.oversizedRecordsIgnored,

      durationMs:
        latest.durationMs +
        baseline.durationMs,

      selectedAuthoritativeSource:
        latest.selectedAuthoritativeSource,

      restoreStatus:
        latest.restoreStatus,

      lastError:
        latest.lastError,
    };
  }

  private snapshotEvidenceCount(
    snapshot:
      PersistedShadowLearningEvidence,
  ): number {
    return snapshot.queueItems.length +
      snapshot.dispatchRecords.length +
      snapshot.outcomeRecords.length;
  }

  private checkpointEvidenceCount(
    checkpoint:
      ShadowLearningRestoreCheckpoint,
  ): number {
    if (
      checkpoint.schemaVersion ===
      1
    ) {
      return checkpoint.sourceEvidenceCount;
    }

    return Math.max(
      checkpoint.sourceEvidenceCount,
      this.snapshotEvidenceCount(
        checkpoint.authoritativeSnapshot,
      ),
    );
  }

  private mergePersistedSnapshots(
    baseline:
      PersistedShadowLearningEvidence,
    latest:
      PersistedShadowLearningEvidence,
  ): PersistedShadowLearningEvidence {
    const queueItems =
      new Map<
        string,
        ExecutionCandidateQueueItem
      >();

    const dispatchRecords =
      new Map<
        string,
        ShadowDispatchRecord
      >();

    const outcomeRecords =
      new Map<
        string,
        ShadowTradeOutcomeRecord
      >();

    for (
      const snapshot
      of [
        baseline,
        latest,
      ]
    ) {
      for (
        const item
        of snapshot.queueItems
      ) {
        queueItems.set(
          item.id,
          structuredClone(
            item,
          ),
        );
      }

      for (
        const record
        of snapshot.dispatchRecords
      ) {
        dispatchRecords.set(
          record.id,
          structuredClone(
            record,
          ),
        );
      }

      for (
        const record
        of snapshot.outcomeRecords
      ) {
        outcomeRecords.set(
          record.id,
          structuredClone(
            record,
          ),
        );
      }
    }

    return {
      schemaVersion:
        SCHEMA_VERSION,
      persistedAt:
        Math.max(
          baseline.persistedAt,
          latest.persistedAt,
        ),
      startedAt:
        Math.min(
          baseline.startedAt,
          latest.startedAt,
        ),
      captureCount:
        Math.max(
          baseline.captureCount,
          latest.captureCount,
        ),
      lastCapturedAt:
        this.maximumNullable(
          baseline.lastCapturedAt,
          latest.lastCapturedAt,
        ),
      lastCapturedSnapshotGeneratedAt:
        this.maximumNullable(
          baseline.lastCapturedSnapshotGeneratedAt,
          latest.lastCapturedSnapshotGeneratedAt,
        ),
      queueItems: [
        ...queueItems.values(),
      ],
      dispatchRecords: [
        ...dispatchRecords.values(),
      ],
      outcomeRecords: [
        ...outcomeRecords.values(),
      ],
    };
  }

  private maximumNullable(
    first:
      number | null,
    second:
      number | null,
  ): number | null {
    if (
      first ===
      null
    ) {
      return second;
    }

    if (
      second ===
      null
    ) {
      return first;
    }

    return Math.max(
      first,
      second,
    );
  }

  private normalizeQueueItem(
    item: ExecutionCandidateQueueItem,
  ): ExecutionCandidateQueueItem {
    const normalized =
      structuredClone(
        item,
      );

    normalized.strategyAttribution =
      normalizeStrategyAttribution(
        item.strategyAttribution,
      );

    normalized
      .qualification
      .candidate
      .strategyAttribution =
        normalizeStrategyAttribution(
          item
            .qualification
            .candidate
            .strategyAttribution,
        );

    return normalized;
  }

  private normalizeDispatchRecord(
    record: ShadowDispatchRecord,
  ): ShadowDispatchRecord {
    const normalized =
      structuredClone(
        record,
      );

    normalized.strategyAttribution =
      normalizeStrategyAttribution(
        record.strategyAttribution,
      );

    normalized
      .qualification
      .candidate
      .strategyAttribution =
        normalizeStrategyAttribution(
          record
            .qualification
            .candidate
            .strategyAttribution,
        );

    normalized.queueItem =
      this.normalizeQueueItem(
        record.queueItem,
      );

    return normalized;
  }

  private normalizeOutcomeRecord(
    record: ShadowTradeOutcomeRecord,
  ): ShadowTradeOutcomeRecord {
    return {
      ...structuredClone(
        record,
      ),

      strategyAttribution:
        normalizeStrategyAttribution(
          record.strategyAttribution,
        ),
    };
  }

  private trimHistory():
    void {
    this.trimMap(
      this.queueItems,

      MAXIMUM_QUEUE_HISTORY,

      (
        item,
      ) =>
        item.updatedAt,
    );

    this.trimMap(
      this.dispatchRecords,

      MAXIMUM_DISPATCH_HISTORY,

      (
        record,
      ) =>
        record.dispatchedAt,
    );

    this.trimMap(
      this.outcomeRecords,

      MAXIMUM_OUTCOME_HISTORY,

      (
        record,
      ) =>
        record.completedAt ??
        record.dispatchedAt,
    );
  }

  private trimMap<T>(
    map:
      Map<
        string,
        T
      >,

    maximum:
      number,

    timestamp:
      (
        value:
          T,
      ) =>
        number,
  ): void {
    if (
      map.size <=
      maximum
    ) {
      return;
    }

    const ordered =
      Array.from(
        map.entries(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            timestamp(
              first[1],
            ) -
            timestamp(
              second[1],
            ),
        );

    while (
      map.size >
        maximum &&
      ordered.length >
        0
    ) {
      const oldest =
        ordered.shift();

      if (
        !oldest
      ) {
        break;
      }

      map.delete(
        oldest[0],
      );
    }
  }

  private sortedQueueItems():
    ExecutionCandidateQueueItem[] {
    return Array.from(
      this.queueItems.values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second.updatedAt -
          first.updatedAt,
      );
  }

  private sortedDispatchRecords():
    ShadowDispatchRecord[] {
    return Array.from(
      this.dispatchRecords.values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second.dispatchedAt -
          first.dispatchedAt,
      );
  }

  private sortedOutcomeRecords():
    ShadowTradeOutcomeRecord[] {
    return Array.from(
      this.outcomeRecords.values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second.dispatchedAt -
          first.dispatchedAt,
      );
  }

  private countQueueStatus(
    records:
      ExecutionCandidateQueueItem[],

    status:
      ExecutionCandidateQueueItem[
        "status"
      ],
  ): number {
    return records.filter(
      (
        record,
      ) =>
        record.status ===
        status,
    ).length;
  }

  private countOutcomeStatus(
    records:
      ShadowTradeOutcomeRecord[],

    status:
      ShadowTradeOutcomeRecord[
        "status"
      ],
  ): number {
    return records.filter(
      (
        record,
      ) =>
        record.status ===
        status,
    ).length;
  }
}

export const shadowLearningEvidenceArchiveService =
  new ShadowLearningEvidenceArchiveService(
    DEFAULT_PERSISTENCE_FILE,
    {
      maximumArchives:
        DEFAULT_MAXIMUM_ARCHIVES,

      protectExistingOversizedFile:
        false,

      minimumPersistenceIntervalMs:
        PRODUCTION_PERSISTENCE_INTERVAL_MS,
    },
  );
