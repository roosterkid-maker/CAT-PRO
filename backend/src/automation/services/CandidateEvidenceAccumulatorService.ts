import {
  existsSync,
  statSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  JsonlRotatingWriter,
  readLatestValidJsonlAcrossArchives,
} from "../../core/persistence/JsonlArchiveStore";

import type {
  CandidateQualificationChecks,
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import type {
  CandidateEvidenceAccumulatorDiagnostics,
  CandidateEvidenceCheckCounts,
  CandidateEvidenceRouteRecord,
} from "../models/CandidateEvidenceAccumulator";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  cloneStrategyAttribution,
  normalizeStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

const MAXIMUM_ROUTE_HISTORY =
  1_000;

const MAXIMUM_RETURNED_ROUTES =
  100;

const MAXIMUM_NEAR_QUALIFIED =
  25;

const PERSISTENCE_SCHEMA_VERSION =
  1;

const DEFAULT_RESTORE_CHUNK_SIZE_BYTES =
  64 * 1_024;

const DEFAULT_MAXIMUM_SNAPSHOT_BYTES =
  16 * 1_024 * 1_024;

const DEFAULT_ROTATION_FILE_BYTES =
  64 * 1_024 * 1_024;

const DEFAULT_ROTATION_RECORDS =
  2_000;

const DEFAULT_MAXIMUM_ARCHIVES =
  2;

const PRODUCTION_PERSISTENCE_INTERVAL_MS =
  5 * 60 * 1_000;

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "automation",
    "candidate-evidence.jsonl",
  );

interface PersistedCandidateEvidenceSnapshot {
  schemaVersion: 1;

  persistedAt: number;

  startedAt: number;

  processedAuthoritativeSnapshots: number;

  lastProcessedSnapshotGeneratedAt:
    number | null;

  routes:
    CandidateEvidenceRouteRecord[];
}

export interface CandidateEvidencePersistenceOptions {
  restoreChunkSizeBytes?: number;

  maximumSnapshotBytes?: number;

  rotationEnabled?: boolean;

  rotationMaximumFileBytes?: number;

  rotationMaximumRecords?: number;

  maximumArchives?: number;

  protectExistingOversizedFile?: boolean;

  minimumPersistenceIntervalMs?: number;
}

export class CandidateEvidenceAccumulatorService {
  private startedAt =
    Date.now();

  private processedAuthoritativeSnapshots =
    0;

  private lastProcessedSnapshotGeneratedAt:
    number | null =
    null;

  private readonly routes =
    new Map<
      string,
      CandidateEvidenceRouteRecord
    >();

  private readonly persistenceFilePath:
    string;

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private restoredRouteCount =
    0;

  private persistenceWrites =
    0;

  private persistenceWriteFailures =
    0;

  private lastPersistedAt:
    number | null =
    null;

  private persistenceLastError:
    string | null =
    null;

  private restoreStatus:
    | "AVAILABLE"
    | "NO_DATA"
    | "FAILED" =
    "NO_DATA";

  private restoreFileSizeBytes =
    0;

  private restoreBytesRead =
    0;

  private restoreRecordsExamined =
    0;

  private restoreMalformedLinesIgnored =
    0;

  private restoreOversizedLinesIgnored =
    0;

  private restoreDurationMs =
    0;

  private readonly restoreChunkSizeBytes:
    number;

  private readonly maximumSnapshotBytes:
    number;

  private readonly minimumPersistenceIntervalMs:
    number;

  private lastPersistenceAttemptAt:
    number | null =
    null;

  private readonly writer:
    JsonlRotatingWriter<
      PersistedCandidateEvidenceSnapshot
    >;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,

    persistenceOptions:
      CandidateEvidencePersistenceOptions = {},
  ) {
    this.persistenceFilePath =
      persistenceFilePath;

    this.restoreChunkSizeBytes =
      persistenceOptions
        .restoreChunkSizeBytes ??
      DEFAULT_RESTORE_CHUNK_SIZE_BYTES;

    this.maximumSnapshotBytes =
      persistenceOptions
        .maximumSnapshotBytes ??
      DEFAULT_MAXIMUM_SNAPSHOT_BYTES;

    this.minimumPersistenceIntervalMs =
      persistenceOptions
        .minimumPersistenceIntervalMs ??
      0;

    if (
      !Number.isSafeInteger(
        this.minimumPersistenceIntervalMs,
      ) ||
      this.minimumPersistenceIntervalMs <
        0
    ) {
      throw new Error(
        "Candidate evidence minimum persistence interval must be a non-negative integer.",
      );
    }

    this.writer =
      new JsonlRotatingWriter(
        persistenceFilePath,
        {
          enabled:
            persistenceOptions.rotationEnabled ??
            true,

          maximumFileBytes:
            persistenceOptions
              .rotationMaximumFileBytes ??
            DEFAULT_ROTATION_FILE_BYTES,

          maximumRecords:
            persistenceOptions
              .rotationMaximumRecords ??
            DEFAULT_ROTATION_RECORDS,

          maximumArchives:
            persistenceOptions.maximumArchives ??
            DEFAULT_MAXIMUM_ARCHIVES,

          protectExistingOversizedFile:
            persistenceOptions
              .protectExistingOversizedFile ??
            true,
        },
      );

    /*
     * Build 8:
     *
     * Restore immediately when the singleton
     * service is constructed.
     *
     * No scheduler/API changes are required.
     */
    this.restore();
  }

  observeSnapshot(
    snapshotGeneratedAt:
      number,

    evaluatedQualifications?:
      readonly CandidateQualificationRecord[],
  ): void {
    if (
      this.lastProcessedSnapshotGeneratedAt ===
      snapshotGeneratedAt
    ) {
      return;
    }

    const qualifications =
      evaluatedQualifications ??
      opportunityMonitorService
        .getActiveCandidates()
        .map(
          (
            candidate,
          ) =>
            candidateQualificationService
              .evaluate(
                candidate,
                snapshotGeneratedAt,
              ),
        );

    for (
      const qualification
      of qualifications
    ) {
      const candidate =
        qualification.candidate;

      const existing =
        this.routes.get(
          candidate.key,
        );

      const record =
        existing ??
        this.createRecord(
          qualification,
          snapshotGeneratedAt,
        );

      record.lastObservedAt =
        snapshotGeneratedAt;

      record.latestStrategyAttribution =
        cloneStrategyAttribution(
          qualification
            .candidate
            .strategyAttribution,
        );

      record.elapsedObservedMs =
        Math.max(
          0,

          record.lastObservedAt -
            record.firstObservedAt,
        );

      record.activeSnapshotObservations +=
        1;

      record.qualificationEvaluations +=
        1;

      if (
        qualification.status ===
        "OBSERVING"
      ) {
        record.observingEvaluations +=
          1;
      } else if (
        qualification.status ===
        "QUALIFIED"
      ) {
        record.qualifiedEvaluations +=
          1;
      } else if (
        qualification.status ===
        "REJECTED"
      ) {
        record.rejectedEvaluations +=
          1;
      }

      record.maximumConsecutiveObservations =
        Math.max(
          record
            .maximumConsecutiveObservations,

          candidate
            .consecutiveObservations,
        );

      record.maximumLifetimeMs =
        Math.max(
          record.maximumLifetimeMs,

          candidate.lifetimeMs,

          Math.max(
            0,

            snapshotGeneratedAt -
              candidate.firstSeenAt,
          ),
        );

      record.maximumTotalObservations =
        Math.max(
          record
            .maximumTotalObservations,

          candidate
            .totalObservations,
        );

      record.maximumReappearances =
        Math.max(
          record
            .maximumReappearances,

          candidate.reappearances,
        );

      record.latestNetProfitPercent =
        candidate
          .latest
          .netProfitPercent;

      record.bestNetProfitPercent =
        Math.max(
          record
            .bestNetProfitPercent,

          candidate
            .best
            .netProfitPercent,
        );

      record.maximumLiquidityScore =
        Math.max(
          record
            .maximumLiquidityScore,

          candidate
            .latest
            .liquidityScore,
        );

      record.maximumFreshnessScore =
        Math.max(
          record
            .maximumFreshnessScore,

          candidate
            .latest
            .freshnessScore,
        );

      record.minimumProfitDrawdownPercent =
        Math.min(
          record
            .minimumProfitDrawdownPercent,

          qualification
            .profitDrawdownPercent,
        );

      record.bestQualificationScore =
        Math.max(
          record
            .bestQualificationScore,

          qualification.score,
        );

      const failedChecks:
        string[] =
        [];

      for (
        const [
          name,
          check,
        ]
        of Object.entries(
          qualification.checks,
        )
      ) {
        const key =
          name as keyof CandidateEvidenceCheckCounts;

        if (
          check.passed
        ) {
          record
            .checkPassCounts[
              key
            ] +=
            1;
        } else {
          record
            .checkFailureCounts[
              key
            ] +=
            1;

          failedChecks.push(
            name,
          );
        }
      }

      const persistencePass =
        qualification
          .checks
          .consecutiveObservations
          .passed &&
        qualification
          .checks
          .persistence
          .passed;

      const qualityPass =
        qualification
          .checks
          .netProfit
          .passed &&
        qualification
          .checks
          .liquidity
          .passed &&
        qualification
          .checks
          .freshness
          .passed &&
        qualification
          .checks
          .profitStability
          .passed;

      const allChecksPass =
        this.allChecksPass(
          qualification.checks,
        );

      if (
        persistencePass
      ) {
        record
          .persistencePassObservations +=
          1;
      }

      if (
        qualityPass
      ) {
        record
          .qualityPassObservations +=
          1;
      }

      if (
        allChecksPass
      ) {
        record
          .allChecksPassObservations +=
          1;
      }

      record.lastFailedChecks =
        failedChecks;

      record.lastReasons =
        structuredClone(
          qualification.reasons,
        );

      this.routes.set(
        candidate.key,
        record,
      );
    }

    this.processedAuthoritativeSnapshots +=
      1;

    this.lastProcessedSnapshotGeneratedAt =
      snapshotGeneratedAt;

    this.trimHistory();

    /*
     * Persist AFTER the complete authoritative
     * snapshot has been processed.
     */
    this.persist();
  }

  getDiagnostics():
    CandidateEvidenceAccumulatorDiagnostics {
    const now =
      Date.now();

    const qualification =
      candidateQualificationService
        .getDiagnostics();

    const config =
      qualification.config;

    const records =
      Array.from(
        this.routes.values(),
      );

    const failureDistribution =
      this.buildFailureDistribution(
        records,
      );

    const sortedRoutes =
      [
        ...records,
      ]
        .sort(
          (
            first,
            second,
          ) => {
            if (
              second
                .qualifiedEvaluations !==
              first
                .qualifiedEvaluations
            ) {
              return (
                second
                  .qualifiedEvaluations -
                first
                  .qualifiedEvaluations
              );
            }

            if (
              second
                .allChecksPassObservations !==
              first
                .allChecksPassObservations
            ) {
              return (
                second
                  .allChecksPassObservations -
                first
                  .allChecksPassObservations
              );
            }

            if (
              second
                .bestQualificationScore !==
              first
                .bestQualificationScore
            ) {
              return (
                second
                  .bestQualificationScore -
                first
                  .bestQualificationScore
              );
            }

            return (
              second
                .lastObservedAt -
              first
                .lastObservedAt
            );
          },
        );

    const nearQualified =
      [
        ...records,
      ]
        .filter(
          (
            record,
          ) =>
            record
              .qualifiedEvaluations ===
            0,
        )
        .sort(
          (
            first,
            second,
          ) => {
            const firstFailures =
              this.lastFailureCount(
                first,
              );

            const secondFailures =
              this.lastFailureCount(
                second,
              );

            if (
              firstFailures !==
              secondFailures
            ) {
              return (
                firstFailures -
                secondFailures
              );
            }

            if (
              second
                .bestQualificationScore !==
              first
                .bestQualificationScore
            ) {
              return (
                second
                  .bestQualificationScore -
                first
                  .bestQualificationScore
              );
            }

            return (
              second
                .bestNetProfitPercent -
              first
                .bestNetProfitPercent
            );
          },
        )
        .slice(
          0,
          MAXIMUM_NEAR_QUALIFIED,
        )
        .map(
          (
            record,
          ) =>
            structuredClone(
              record,
            ),
        );

    const observations:
      string[] = [
      `Evidence accumulator has processed ${this.processedAuthoritativeSnapshots} authoritative automation snapshot(s) since ${this.startedAt}.`,

      `${records.length} unique candidate route(s) are retained across process restarts.`,
    ];

    if (
      records.length >
        0 &&
      failureDistribution[0]
    ) {
      observations.push(
        `Most common accumulated failed check is ${failureDistribution[0].check}: ${failureDistribution[0].failedObservations} failed observation(s) across ${failureDistribution[0].routesAffected} route(s).`,
      );
    }

    if (
      this.restored
    ) {
      observations.push(
        `Persistent evidence was restored successfully: ${this.restoredRouteCount} route(s).`,
      );
    }

    observations.push(
      "Candidate evidence is persisted as append-only JSONL state snapshots and restored from the latest valid snapshot after restart.",

      "Persistence is diagnostic-only. It does not qualify, enqueue, shadow-dispatch, paper-trade, or LIVE-trade candidates.",

      "No qualification threshold or trading policy is modified.",
    );

    return {
      generatedAt:
        now,

      version:
        "17.4",

      build:
        "8",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      startedAt:
        this.startedAt,

      elapsedMs:
        Math.max(
          0,

          now -
            this.startedAt,
        ),

      processedAuthoritativeSnapshots:
        this
          .processedAuthoritativeSnapshots,

      lastProcessedSnapshotGeneratedAt:
        this
          .lastProcessedSnapshotGeneratedAt,

      persistence: {
        enabled:
          true,

        format:
          "JSONL_SNAPSHOT",

        restoreStatus:
          this.restoreStatus,

        restoreReadStrategy:
          "REVERSE_BOUNDED_TAIL",

        filePath:
          this.persistenceFilePath,

        restored:
          this.restored,

        restoredAt:
          this.restoredAt,

        restoredRouteCount:
          this.restoredRouteCount,

        restoreFileSizeBytes:
          this.restoreFileSizeBytes,

        restoreBytesRead:
          this.restoreBytesRead,

        restoreRecordsExamined:
          this.restoreRecordsExamined,

        restoreMalformedLinesIgnored:
          this
            .restoreMalformedLinesIgnored,

        restoreOversizedLinesIgnored:
          this
            .restoreOversizedLinesIgnored,

        restoreDurationMs:
          this.restoreDurationMs,

        restoreChunkSizeBytes:
          this.restoreChunkSizeBytes,

        maximumSnapshotBytes:
          this.maximumSnapshotBytes,

        writes:
          this.persistenceWrites,

        writeFailures:
          this.persistenceWriteFailures,

        lastPersistedAt:
          this.lastPersistedAt,

        lastError:
          this.persistenceLastError,
      },

      config:
        structuredClone(
          config,
        ),

      summary: {
        routesObserved:
          records.length,

        activeSnapshotObservations:
          records.reduce(
            (
              sum,
              record,
            ) =>
              sum +
              record
                .activeSnapshotObservations,

            0,
          ),

        routesReachedTwoConsecutiveObservations:
          records.filter(
            (
              record,
            ) =>
              record
                .maximumConsecutiveObservations >=
              2,
          ).length,

        routesReachedRequiredConsecutiveObservations:
          records.filter(
            (
              record,
            ) =>
              record
                .maximumConsecutiveObservations >=
              config
                .minimumConsecutiveObservations,
          ).length,

        routesReachedRequiredPersistence:
          records.filter(
            (
              record,
            ) =>
              record
                .maximumLifetimeMs >=
              config
                .minimumPersistenceMs,
          ).length,

        routesReachedRequiredNetProfit:
          records.filter(
            (
              record,
            ) =>
              record
                .checkPassCounts
                .netProfit >
              0,
          ).length,

        routesReachedRequiredLiquidity:
          records.filter(
            (
              record,
            ) =>
              record
                .checkPassCounts
                .liquidity >
              0,
          ).length,

        routesReachedRequiredFreshness:
          records.filter(
            (
              record,
            ) =>
              record
                .checkPassCounts
                .freshness >
              0,
          ).length,

        routesReachedProfitStability:
          records.filter(
            (
              record,
            ) =>
              record
                .checkPassCounts
                .profitStability >
              0,
          ).length,

        routesReachedAllQualityChecks:
          records.filter(
            (
              record,
            ) =>
              record
                .qualityPassObservations >
              0,
          ).length,

        routesReachedAllChecks:
          records.filter(
            (
              record,
            ) =>
              record
                .allChecksPassObservations >
              0,
          ).length,

        routesEverQualified:
          records.filter(
            (
              record,
            ) =>
              record
                .qualifiedEvaluations >
              0,
          ).length,
      },

      failureDistribution,

      nearQualified,

      routes:
        sortedRoutes
          .slice(
            0,
            MAXIMUM_RETURNED_ROUTES,
          )
          .map(
            (
              record,
            ) =>
              structuredClone(
                record,
              ),
          ),

      observations,
    };
  }

  private restore():
    void {
    const restoreStartedAt =
      process.hrtime.bigint();

    try {
      this.restoreFileSizeBytes =
        existsSync(
          this.persistenceFilePath,
        )
          ? statSync(
              this.persistenceFilePath,
            ).size
          : 0;

      const restore =
        readLatestValidJsonlAcrossArchives(
          this.persistenceFilePath,
          (
            value,
          ): value is PersistedCandidateEvidenceSnapshot =>
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

      this.restoreStatus =
        restore.restoreStatus;

      this.restoreBytesRead =
        restore.bytesRead;

      this.restoreRecordsExamined =
        restore.recordsExamined;

      this.restoreMalformedLinesIgnored =
        restore.malformedRecordsIgnored;

      this.restoreOversizedLinesIgnored =
        restore.oversizedRecordsIgnored;

      const restoredSnapshot =
        restore.value;

      if (
        !restoredSnapshot
      ) {
        this.persistenceLastError =
          restore.restoreStatus ===
            "FAILED"
            ? "Persistence file exists but contains no valid candidate-evidence snapshot."
            : null;

        return;
      }

      this.startedAt =
        restoredSnapshot.startedAt;

      this.processedAuthoritativeSnapshots =
        restoredSnapshot
          .processedAuthoritativeSnapshots;

      this.lastProcessedSnapshotGeneratedAt =
        restoredSnapshot
          .lastProcessedSnapshotGeneratedAt;

      for (
        const record
        of restoredSnapshot.routes
      ) {
        const normalizedRecord:
          CandidateEvidenceRouteRecord = {
          ...structuredClone(
            record,
          ),

          latestStrategyAttribution:
            normalizeStrategyAttribution(
              record
                .latestStrategyAttribution,
            ),
        };

        this.routes.set(
          record.key,
          normalizedRecord,
        );
      }

      this.restored =
        true;

      this.restoreStatus =
        "AVAILABLE";

      this.restoredAt =
        Date.now();

      this.restoredRouteCount =
        this.routes.size;

      this.lastPersistedAt =
        restoredSnapshot.persistedAt;

      this.persistenceLastError =
        null;

      console.log(
        `[CandidateEvidence] Restored ${this.restoredRouteCount} route(s) from persistent evidence.`,
      );
    } catch (
      error:
        unknown
    ) {
      this.restoreStatus =
        "FAILED";

      this.persistenceLastError =
        error instanceof Error
          ? error.message
          : "Candidate evidence restore failed.";

      console.error(
        "[CandidateEvidence] Persistent evidence restore failed:",
        this.persistenceLastError,
      );
    } finally {
      this.restoreDurationMs =
        Number(
          process.hrtime.bigint() -
            restoreStartedAt,
        ) /
        1_000_000;
    }
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
      PersistedCandidateEvidenceSnapshot = {
      schemaVersion:
        PERSISTENCE_SCHEMA_VERSION,

      persistedAt,

      startedAt:
        this.startedAt,

      processedAuthoritativeSnapshots:
        this
          .processedAuthoritativeSnapshots,

      lastProcessedSnapshotGeneratedAt:
        this
          .lastProcessedSnapshotGeneratedAt,

      routes:
        Array.from(
          this.routes.values(),
        )
          .map(
            (
              record,
            ) =>
              structuredClone(
                record,
              ),
          ),
    };

    try {
      this.writer.append(
        snapshot,
      );

      this.persistenceWrites +=
        1;

      this.lastPersistedAt =
        persistedAt;

      this.persistenceLastError =
        null;
    } catch (
      error:
        unknown
    ) {
      this.persistenceWriteFailures +=
        1;

      this.persistenceLastError =
        error instanceof Error
          ? error.message
          : "Candidate evidence persistence failed.";

      console.error(
        "[CandidateEvidence] Persistence write failed:",
        this.persistenceLastError,
      );
    }
  }

  private isPersistedSnapshot(
    value:
      unknown,
  ): value is PersistedCandidateEvidenceSnapshot {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return false;
    }

    const candidate =
      value as Partial<PersistedCandidateEvidenceSnapshot>;

    return (
      candidate.schemaVersion ===
        PERSISTENCE_SCHEMA_VERSION &&
      typeof candidate.persistedAt ===
        "number" &&
      typeof candidate.startedAt ===
        "number" &&
      typeof candidate
        .processedAuthoritativeSnapshots ===
        "number" &&
      (
        candidate
          .lastProcessedSnapshotGeneratedAt ===
          null ||
        typeof candidate
          .lastProcessedSnapshotGeneratedAt ===
          "number"
      ) &&
      Array.isArray(
        candidate.routes,
      ) &&
      candidate.routes.every(
        (
          record,
        ) =>
          this.isRouteRecord(
            record,
          ),
      )
    );
  }

  private isRouteRecord(
    value:
      unknown,
  ): value is CandidateEvidenceRouteRecord {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return false;
    }

    const record =
      value as Partial<CandidateEvidenceRouteRecord>;

    return (
      typeof record.key ===
        "string" &&
      typeof record.market ===
        "string" &&
      typeof record.buyExchange ===
        "string" &&
      typeof record.sellExchange ===
        "string" &&
      typeof record.firstObservedAt ===
        "number" &&
      typeof record.lastObservedAt ===
        "number" &&
      typeof record.activeSnapshotObservations ===
        "number" &&
      typeof record.qualificationEvaluations ===
        "number" &&
      typeof record.qualifiedEvaluations ===
        "number" &&
      typeof record.bestQualificationScore ===
        "number" &&
      this.isCheckCounts(
        record.checkPassCounts,
      ) &&
      this.isCheckCounts(
        record.checkFailureCounts,
      ) &&
      Array.isArray(
        record.lastFailedChecks,
      ) &&
      Array.isArray(
        record.lastReasons,
      )
    );
  }

  private isCheckCounts(
    value:
      unknown,
  ): value is CandidateEvidenceCheckCounts {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return false;
    }

    const counts =
      value as Partial<CandidateEvidenceCheckCounts>;

    return (
      typeof counts.active ===
        "number" &&
      typeof counts
        .consecutiveObservations ===
        "number" &&
      typeof counts.persistence ===
        "number" &&
      typeof counts.netProfit ===
        "number" &&
      typeof counts.liquidity ===
        "number" &&
      typeof counts.freshness ===
        "number" &&
      typeof counts.profitStability ===
        "number"
    );
  }

  private createRecord(
    qualification:
      ReturnType<
        typeof candidateQualificationService.evaluate
      >,

    observedAt:
      number,
  ): CandidateEvidenceRouteRecord {
    const candidate =
      qualification.candidate;

    return {
      latestStrategyAttribution:
        cloneStrategyAttribution(
          candidate
            .strategyAttribution,
        ),

      key:
        candidate.key,

      market:
        candidate.market,

      buyExchange:
        candidate.buyExchange,

      sellExchange:
        candidate.sellExchange,

      firstObservedAt:
        observedAt,

      lastObservedAt:
        observedAt,

      elapsedObservedMs:
        0,

      activeSnapshotObservations:
        0,

      qualificationEvaluations:
        0,

      observingEvaluations:
        0,

      qualifiedEvaluations:
        0,

      rejectedEvaluations:
        0,

      maximumConsecutiveObservations:
        0,

      maximumLifetimeMs:
        0,

      maximumTotalObservations:
        0,

      maximumReappearances:
        0,

      latestNetProfitPercent:
        candidate
          .latest
          .netProfitPercent,

      bestNetProfitPercent:
        candidate
          .best
          .netProfitPercent,

      maximumLiquidityScore:
        candidate
          .latest
          .liquidityScore,

      maximumFreshnessScore:
        candidate
          .latest
          .freshnessScore,

      minimumProfitDrawdownPercent:
        qualification
          .profitDrawdownPercent,

      bestQualificationScore:
        qualification.score,

      checkPassCounts:
        this.emptyCheckCounts(),

      checkFailureCounts:
        this.emptyCheckCounts(),

      persistencePassObservations:
        0,

      qualityPassObservations:
        0,

      allChecksPassObservations:
        0,

      lastFailedChecks:
        [],

      lastReasons:
        [],
    };
  }

  private buildFailureDistribution(
    records:
      CandidateEvidenceRouteRecord[],
  ):
    CandidateEvidenceAccumulatorDiagnostics[
      "failureDistribution"
    ] {
    const keys:
      Array<
        keyof CandidateEvidenceCheckCounts
      > = [
      "active",
      "consecutiveObservations",
      "persistence",
      "netProfit",
      "liquidity",
      "freshness",
      "profitStability",
    ];

    return keys
      .map(
        (
          check,
        ) => ({
          check,

          failedObservations:
            records.reduce(
              (
                sum,
                record,
              ) =>
                sum +
                record
                  .checkFailureCounts[
                    check
                  ],

              0,
            ),

          routesAffected:
            records.filter(
              (
                record,
              ) =>
                record
                  .checkFailureCounts[
                    check
                  ] >
                0,
            ).length,
        }),
      )
      .filter(
        (
          item,
        ) =>
          item
            .failedObservations >
          0,
      )
      .sort(
        (
          first,
          second,
        ) =>
          second
            .failedObservations -
          first
            .failedObservations,
      );
  }

  private allChecksPass(
    checks:
      CandidateQualificationChecks,
  ): boolean {
    return Object
      .values(
        checks,
      )
      .every(
        (
          check,
        ) =>
          check.passed,
      );
  }

  private emptyCheckCounts():
    CandidateEvidenceCheckCounts {
    return {
      active:
        0,

      consecutiveObservations:
        0,

      persistence:
        0,

      netProfit:
        0,

      liquidity:
        0,

      freshness:
        0,

      profitStability:
        0,
    };
  }

  private lastFailureCount(
    record:
      CandidateEvidenceRouteRecord,
  ): number {
    return record
      .lastFailedChecks
      .length;
  }

  private trimHistory():
    void {
    if (
      this.routes.size <=
      MAXIMUM_ROUTE_HISTORY
    ) {
      return;
    }

    const removable =
      Array.from(
        this.routes.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            first
              .lastObservedAt -
            second
              .lastObservedAt,
        );

    while (
      this.routes.size >
        MAXIMUM_ROUTE_HISTORY &&
      removable.length >
        0
    ) {
      const oldest =
        removable.shift();

      if (
        !oldest
      ) {
        break;
      }

      this.routes.delete(
        oldest.key,
      );
    }
  }
}

export const candidateEvidenceAccumulatorService =
  new CandidateEvidenceAccumulatorService(
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
