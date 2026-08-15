import {
  resolve,
} from "node:path";

import {
  JsonlRotatingWriter,
  readLatestValidJsonlAcrossArchives,
} from "../../core/persistence/JsonlArchiveStore";

import type {
  JsonlArchiveRestoreDiagnostics,
} from "../../core/persistence/JsonlArchiveStore";

import type {
  CapitalAwareQualificationEvidenceDiagnostics,
  CapitalAwareQualificationEvidenceRoute,
} from "../models/CapitalAwareQualificationEvidence";

import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  cloneStrategyAttribution,
  normalizeStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

const SCHEMA_VERSION =
  1;

const MAXIMUM_ROUTES =
  1_000;

const MAXIMUM_RETURNED_ROUTES =
  100;

const DEFAULT_RESTORE_CHUNK_SIZE_BYTES =
  64 * 1_024;

const DEFAULT_MAXIMUM_SNAPSHOT_BYTES =
  16 * 1_024 * 1_024;

const DEFAULT_ROTATION_FILE_BYTES =
  64 * 1_024 * 1_024;

const DEFAULT_ROTATION_RECORDS =
  10_000;

const DEFAULT_MAXIMUM_ARCHIVES =
  2;

const PRODUCTION_PERSISTENCE_INTERVAL_MS =
  5 * 60 * 1_000;

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "automation",
    "capital-aware-qualification-evidence.jsonl",
  );

interface PersistedCapitalAwareQualificationEvidence {
  schemaVersion: 1;

  persistedAt: number;

  startedAt: number;

  processedSnapshots: number;

  lastSnapshotGeneratedAt: number | null;

  routes: CapitalAwareQualificationEvidenceRoute[];
}

export interface CapitalAwareEvidencePersistenceOptions {
  restoreChunkSizeBytes?: number;

  maximumSnapshotBytes?: number;

  rotationEnabled?: boolean;

  rotationMaximumFileBytes?: number;

  rotationMaximumRecords?: number;

  maximumArchives?: number;

  protectExistingOversizedFile?: boolean;

  minimumPersistenceIntervalMs?: number;
}

export class CapitalAwareQualificationEvidenceService {
  private startedAt =
    Date.now();

  private processedSnapshots =
    0;

  private lastSnapshotGeneratedAt:
    number | null =
    null;

  private readonly routes =
    new Map<
      string,
      CapitalAwareQualificationEvidenceRoute
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

  private restoreDiagnostics:
    JsonlArchiveRestoreDiagnostics;

  private readonly writer:
    JsonlRotatingWriter<
      PersistedCapitalAwareQualificationEvidence
    >;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,

    options:
      CapitalAwareEvidencePersistenceOptions = {},
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
        "Capital-aware evidence minimum persistence interval must be a non-negative integer.",
      );
    }

    this.restoreDiagnostics = {
      activeFile:
        persistenceFilePath,

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

    this.restore();
  }

  capture(
    snapshotGeneratedAt:
      number,

    evaluatedQualifications?:
      readonly CandidateQualificationRecord[],
  ): void {
    if (
      this.lastSnapshotGeneratedAt ===
      snapshotGeneratedAt
    ) {
      return;
    }

    /*
     * Only ACTIVE candidates matter here.
     *
     * DISAPPEARED candidates intentionally do not
     * run capital-aware simulation, so recording
     * them would distort the evidence.
     */
    const activeQualifications =
      (
        evaluatedQualifications ??
        candidateQualificationService
          .getDiagnostics()
          .qualifications
      ).filter(
        (
          qualification,
        ) =>
          qualification
            .candidate
            .status ===
          "ACTIVE",
      );

    for (
      const qualification
      of activeQualifications
    ) {
      const liquidity =
        qualification
          .liquidityAssessment;

      const capitalAware =
        liquidity.capitalAware;

      const existing =
        this.routes.get(
          qualification.key,
        );

      const record =
        existing ??
        this.createRecord(
          qualification.key,
          qualification.market,
          qualification.buyExchange,
          qualification.sellExchange,
          snapshotGeneratedAt,
          qualification
            .candidate
            .strategyAttribution,
        );

      record.lastObservedAt =
        snapshotGeneratedAt;

      record.latestStrategyAttribution =
        cloneStrategyAttribution(
          qualification
            .candidate
            .strategyAttribution,
        );

      record.activeObservations +=
        1;

      if (
        liquidity.legacyPassed
      ) {
        record.legacyLiquidityPassObservations +=
          1;
      } else {
        record.legacyLiquidityFailObservations +=
          1;
      }

      if (
        capitalAware.attempted
      ) {
        record.capitalAwareAttemptObservations +=
          1;
      }

      if (
        capitalAware.simulationSuccess
      ) {
        record.capitalAwareSimulationSuccessObservations +=
          1;
      }

      if (
        capitalAware.passed
      ) {
        record.capitalAwarePassObservations +=
          1;
      } else if (
        capitalAware.attempted
      ) {
        record.capitalAwareFailObservations +=
          1;
      }

      if (
        liquidity.source ===
        "CAPITAL_AWARE_SIMULATION"
      ) {
        record.capitalAwareSourceObservations +=
          1;
      }

      if (
        qualification.qualified
      ) {
        record.qualifiedObservations +=
          1;
      }

      if (
        qualification.qualified &&
        liquidity.source ===
          "CAPITAL_AWARE_SIMULATION"
      ) {
        record.qualifiedViaCapitalAwareObservations +=
          1;
      }

      record.maximumLegacyLiquidityScore =
        Math.max(
          record.maximumLegacyLiquidityScore,

          liquidity
            .legacyLiquidityScore,
        );

      if (
        capitalAware.netProfitPercent !==
        null
      ) {
        record.bestCapitalAwareNetProfitPercent =
          record
            .bestCapitalAwareNetProfitPercent ===
          null
            ? capitalAware
                .netProfitPercent
            : Math.max(
                record
                  .bestCapitalAwareNetProfitPercent,

                capitalAware
                  .netProfitPercent,
              );
      }

      if (
        capitalAware.fillPercent !==
        null
      ) {
        record.maximumCapitalAwareFillPercent =
          record
            .maximumCapitalAwareFillPercent ===
          null
            ? capitalAware.fillPercent
            : Math.max(
                record
                  .maximumCapitalAwareFillPercent,

                capitalAware.fillPercent,
              );
      }

      if (
        capitalAware.executableCapital !==
        null
      ) {
        record.maximumCapitalAwareExecutableCapital =
          record
            .maximumCapitalAwareExecutableCapital ===
          null
            ? capitalAware
                .executableCapital
            : Math.max(
                record
                  .maximumCapitalAwareExecutableCapital,

                capitalAware
                  .executableCapital,
              );
      }

      if (
        capitalAware.totalSlippagePercent !==
        null
      ) {
        record.minimumCapitalAwareSlippagePercent =
          record
            .minimumCapitalAwareSlippagePercent ===
          null
            ? capitalAware
                .totalSlippagePercent
            : Math.min(
                record
                  .minimumCapitalAwareSlippagePercent,

                capitalAware
                  .totalSlippagePercent,
              );
      }

      if (
        capitalAware.confidenceScore !==
        null
      ) {
        record.maximumCapitalAwareConfidenceScore =
          record
            .maximumCapitalAwareConfidenceScore ===
          null
            ? capitalAware
                .confidenceScore
            : Math.max(
                record
                  .maximumCapitalAwareConfidenceScore,

                capitalAware
                  .confidenceScore,
              );
      }

      record.lastQualificationStatus =
        qualification.status;

      record.lastLiquiditySource =
        liquidity.source;

      record.lastLegacyLiquidityScore =
        liquidity
          .legacyLiquidityScore;

      record.lastLegacyPassed =
        liquidity.legacyPassed;

      record.lastCapitalAwareAttempted =
        capitalAware.attempted;

      record.lastCapitalAwarePassed =
        capitalAware.passed;

      record.lastCapitalAwareFullyExecutable =
        capitalAware
          .fullyExecutable;

      record.lastCapitalAwareFillPercent =
        capitalAware
          .fillPercent;

      record.lastCapitalAwareNetProfitPercent =
        capitalAware
          .netProfitPercent;

      record.lastCapitalAwareRecommendation =
        capitalAware
          .recommendation;

      record.lastCapitalAwareFailureReason =
        capitalAware
          .failureReason;

      record.lastQualified =
        qualification.qualified;

      this.routes.set(
        qualification.key,
        record,
      );
    }

    this.processedSnapshots +=
      1;

    this.lastSnapshotGeneratedAt =
      snapshotGeneratedAt;

    this.trim();

    this.persist();
  }

  getDiagnostics():
    CapitalAwareQualificationEvidenceDiagnostics {
    const qualification =
      candidateQualificationService
        .getDiagnostics();

    const records =
      Array.from(
        this.routes.values(),
      );

    const sorted =
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
                .qualifiedViaCapitalAwareObservations !==
              first
                .qualifiedViaCapitalAwareObservations
            ) {
              return (
                second
                  .qualifiedViaCapitalAwareObservations -
                first
                  .qualifiedViaCapitalAwareObservations
              );
            }

            if (
              second
                .capitalAwarePassObservations !==
              first
                .capitalAwarePassObservations
            ) {
              return (
                second
                  .capitalAwarePassObservations -
                first
                  .capitalAwarePassObservations
              );
            }

            return (
              second.lastObservedAt -
              first.lastObservedAt
            );
          },
        );

    const routesLegacyLiquidityPassed =
      records.filter(
        (
          record,
        ) =>
          record
            .legacyLiquidityPassObservations >
          0,
      ).length;

    const routesLegacyLiquidityFailed =
      records.filter(
        (
          record,
        ) =>
          record
            .legacyLiquidityFailObservations >
          0,
      ).length;

    const routesCapitalAwareAttempted =
      records.filter(
        (
          record,
        ) =>
          record
            .capitalAwareAttemptObservations >
          0,
      ).length;

    const routesCapitalAwarePassed =
      records.filter(
        (
          record,
        ) =>
          record
            .capitalAwarePassObservations >
          0,
      ).length;

    const routesQualified =
      records.filter(
        (
          record,
        ) =>
          record
            .qualifiedObservations >
          0,
      ).length;

    const routesQualifiedViaCapitalAware =
      records.filter(
        (
          record,
        ) =>
          record
            .qualifiedViaCapitalAwareObservations >
          0,
      ).length;

    const totalCapitalAwareAttempts =
      records.reduce(
        (
          sum,
          record,
        ) =>
          sum +
          record
            .capitalAwareAttemptObservations,

        0,
      );

    const totalCapitalAwarePasses =
      records.reduce(
        (
          sum,
          record,
        ) =>
          sum +
          record
            .capitalAwarePassObservations,

        0,
      );

    const totalQualifiedViaCapitalAwareObservations =
      records.reduce(
        (
          sum,
          record,
        ) =>
          sum +
          record
            .qualifiedViaCapitalAwareObservations,

        0,
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.4",

      build:
        "13",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      startedAt:
        this.startedAt,

      processedSnapshots:
        this.processedSnapshots,

      lastSnapshotGeneratedAt:
        this.lastSnapshotGeneratedAt,

      persistence: {
        enabled:
          true,

        format:
          "JSONL_SNAPSHOT",

        restoreStatus:
          this.restoreDiagnostics
            .restoreStatus,

        restoreReadStrategy:
          "REVERSE_BOUNDED_MULTI_ARCHIVE",

        filePath:
          this.persistenceFilePath,

        restored:
          this.restored,

        restoredAt:
          this.restoredAt,

        restoredRouteCount:
          this.restoredRouteCount,

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

      configuration: {
        minimumLiquidityScore:
          qualification
            .config
            .minimumLiquidityScore,

        capitalAwareLiquidityEnabled:
          qualification
            .config
            .capitalAwareLiquidityEnabled,

        capitalAwareLiquidityValidationCapital:
          qualification
            .config
            .capitalAwareLiquidityValidationCapital,

        capitalAwareLiquidityMinimumNetProfitPercent:
          qualification
            .config
            .capitalAwareLiquidityMinimumNetProfitPercent,

        capitalAwareLiquidityRequireExecuteRecommendation:
          qualification
            .config
            .capitalAwareLiquidityRequireExecuteRecommendation,
      },

      summary: {
        routesObserved:
          records.length,

        activeObservations:
          records.reduce(
            (
              sum,
              record,
            ) =>
              sum +
              record
                .activeObservations,

            0,
          ),

        routesLegacyLiquidityPassed,

        routesLegacyLiquidityFailed,

        routesCapitalAwareAttempted,

        routesCapitalAwarePassed,

        routesQualified,

        routesQualifiedViaCapitalAware,

        totalCapitalAwareAttempts,

        totalCapitalAwarePasses,

        totalQualifiedViaCapitalAwareObservations,
      },

      routes:
        sorted
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

      observations: [
        `${records.length} ACTIVE candidate route(s) have persistent capital-aware qualification evidence.`,

        `${routesCapitalAwareAttempted} route(s) have attempted exact ₹${qualification.config.capitalAwareLiquidityValidationCapital} liquidity simulation.`,

        `${routesCapitalAwarePassed} route(s) have passed capital-aware liquidity at least once.`,

        `${routesQualifiedViaCapitalAware} route(s) have reached full CandidateQualification QUALIFIED status using CAPITAL_AWARE_SIMULATION as the liquidity source.`,

        "Only ACTIVE candidates are recorded. DISAPPEARED candidates are intentionally excluded from capital-aware evidence capture.",

        "This service records qualification evidence only. It does not qualify candidates independently, enqueue them, dispatch shadow trades, arm PAPER, or enable LIVE execution.",
      ],
    };
  }

  private createRecord(
    key:
      string,

    market:
      string,

    buyExchange:
      string,

    sellExchange:
      string,

    observedAt:
      number,

    strategyAttribution:
      StrategyAttribution,
  ): CapitalAwareQualificationEvidenceRoute {
    return {
      latestStrategyAttribution:
        cloneStrategyAttribution(
          strategyAttribution,
        ),

      key,

      market,

      buyExchange,

      sellExchange,

      firstObservedAt:
        observedAt,

      lastObservedAt:
        observedAt,

      activeObservations:
        0,

      legacyLiquidityPassObservations:
        0,

      legacyLiquidityFailObservations:
        0,

      capitalAwareAttemptObservations:
        0,

      capitalAwareSimulationSuccessObservations:
        0,

      capitalAwarePassObservations:
        0,

      capitalAwareFailObservations:
        0,

      capitalAwareSourceObservations:
        0,

      qualifiedObservations:
        0,

      qualifiedViaCapitalAwareObservations:
        0,

      maximumLegacyLiquidityScore:
        0,

      bestCapitalAwareNetProfitPercent:
        null,

      maximumCapitalAwareFillPercent:
        null,

      maximumCapitalAwareExecutableCapital:
        null,

      minimumCapitalAwareSlippagePercent:
        null,

      maximumCapitalAwareConfidenceScore:
        null,

      lastQualificationStatus:
        "UNKNOWN",

      lastLiquiditySource:
        "NONE",

      lastLegacyLiquidityScore:
        0,

      lastLegacyPassed:
        false,

      lastCapitalAwareAttempted:
        false,

      lastCapitalAwarePassed:
        false,

      lastCapitalAwareFullyExecutable:
        false,

      lastCapitalAwareFillPercent:
        null,

      lastCapitalAwareNetProfitPercent:
        null,

      lastCapitalAwareRecommendation:
        null,

      lastCapitalAwareFailureReason:
        null,

      lastQualified:
        false,
    };
  }

  private trim():
    void {
    if (
      this.routes.size <=
      MAXIMUM_ROUTES
    ) {
      return;
    }

    const ordered =
      Array.from(
        this.routes.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            first.lastObservedAt -
            second.lastObservedAt,
        );

    while (
      this.routes.size >
        MAXIMUM_ROUTES &&
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

      this.routes.delete(
        oldest.key,
      );
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
      PersistedCapitalAwareQualificationEvidence = {
      schemaVersion:
        SCHEMA_VERSION,

      persistedAt,

      startedAt:
        this.startedAt,

      processedSnapshots:
        this.processedSnapshots,

      lastSnapshotGeneratedAt:
        this.lastSnapshotGeneratedAt,

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
          : "Capital-aware qualification evidence persistence failed.";

      console.error(
        "[CapitalAwareQualificationEvidence] Persistence failed:",
        this.lastError,
      );
    }
  }

  private restore():
    void {
    try {
      const restore =
        readLatestValidJsonlAcrossArchives(
          this.persistenceFilePath,
          (
            value,
          ): value is PersistedCapitalAwareQualificationEvidence =>
            this.isSnapshot(
              value,
            ),
          {
            chunkSizeBytes:
              this.restoreChunkSizeBytes,

            maximumLineBytes:
              this.maximumSnapshotBytes,
          },
        );

      this.restoreDiagnostics =
        restore;

      const restored =
        restore.value;

      if (
        !restored
      ) {
        this.lastError =
          restore.lastError;

        return;
      }

      this.startedAt =
        restored.startedAt;

      this.processedSnapshots =
        restored
          .processedSnapshots;

      this.lastSnapshotGeneratedAt =
        restored
          .lastSnapshotGeneratedAt;

      for (
        const record
        of restored.routes
      ) {
        const normalizedRecord:
          CapitalAwareQualificationEvidenceRoute = {
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

      this.restoredAt =
        Date.now();

      this.restoredRouteCount =
        this.routes.size;

      this.lastPersistedAt =
        restored.persistedAt;

      this.lastError =
        null;

      console.log(
        `[CapitalAwareQualificationEvidence] Restored ${this.restoredRouteCount} route(s).`,
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
            : "Capital-aware qualification evidence restore failed.",
      };

      this.lastError =
        error instanceof Error
          ? error.message
          : "Capital-aware qualification evidence restore failed.";

      console.error(
        "[CapitalAwareQualificationEvidence] Restore failed:",
        this.lastError,
      );
    }
  }

  private isSnapshot(
    value:
      unknown,
  ): value is PersistedCapitalAwareQualificationEvidence {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return false;
    }

    const candidate =
      value as Partial<PersistedCapitalAwareQualificationEvidence>;

    return (
      candidate.schemaVersion ===
        SCHEMA_VERSION &&
      typeof candidate.persistedAt ===
        "number" &&
      typeof candidate.startedAt ===
        "number" &&
      typeof candidate.processedSnapshots ===
        "number" &&
      (
        candidate.lastSnapshotGeneratedAt ===
          null ||
        typeof candidate.lastSnapshotGeneratedAt ===
          "number"
      ) &&
      Array.isArray(
        candidate.routes,
      )
    );
  }
}

export const capitalAwareQualificationEvidenceService =
  new CapitalAwareQualificationEvidenceService(
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
