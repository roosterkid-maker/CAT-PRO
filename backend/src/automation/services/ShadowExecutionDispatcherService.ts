import {
  randomUUID,
} from "node:crypto";

import type {
  ShadowDispatchBatchResult,
  ShadowDispatchRecord,
  ShadowExecutionDispatcherDiagnostics,
} from "../models/ShadowExecutionDispatcher";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  cloneStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import {
  executionCandidateQueueService,
} from "./ExecutionCandidateQueueService";

export interface ShadowExecutionDispatcherConfig {
  maximumBatchSize: number;

  maximumHistory: number;
}

const DEFAULT_CONFIG:
  ShadowExecutionDispatcherConfig = {
  maximumBatchSize:
    10,

  maximumHistory:
    500,
};

export class ShadowExecutionDispatcherService {
  private readonly config:
    ShadowExecutionDispatcherConfig;

  /*
   * Stable candidate generation:
   *
   * candidateKey
   * +
   * firstSeenAt
   * +
   * reappearances
   *
   * This prevents one continuously-active
   * opportunity from being shadow-dispatched
   * repeatedly every scheduler snapshot.
   *
   * If it disappears and later reappears,
   * reappearances increments and a new
   * generation becomes eligible.
   */
  private readonly dispatchedGenerations =
    new Set<string>();

  private readonly records:
    ShadowDispatchRecord[] =
    [];

  private runInProgress =
    false;

  private totalRuns =
    0;

  private totalAttempts =
    0;

  private totalDispatched =
    0;

  private totalRevalidationFailed =
    0;

  private totalDuplicatesSuppressed =
    0;

  private noReadyItemRuns =
    0;

  private lastRunAt:
    number | null =
    null;

  private lastDispatchAt:
    number | null =
    null;

  private lastRecord:
    ShadowDispatchRecord | null =
    null;

  constructor(
    config:
      Partial<ShadowExecutionDispatcherConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  dispatchAvailable(
    allowedCandidateKeys?:
      ReadonlySet<string>,
  ):
    ShadowDispatchBatchResult {
    if (
      this.runInProgress
    ) {
      return {
        generatedAt:
          Date.now(),

        attempted:
          0,

        dispatched:
          0,

        revalidationFailed:
          0,

        duplicatesSuppressed:
          0,

        records: [],
      };
    }

    this.runInProgress =
      true;

    this.totalRuns +=
      1;

    this.lastRunAt =
      Date.now();

    const resultRecords:
      ShadowDispatchRecord[] =
      [];

    let attempted =
      0;

    let dispatched =
      0;

    let revalidationFailed =
      0;

    let duplicatesSuppressed =
      0;

    try {
      while (
        attempted <
        this.config.maximumBatchSize
      ) {
        const queueItem =
          allowedCandidateKeys
            ? executionCandidateQueueService
                .getReadyItems()
                .find(
                  (
                    item,
                  ) =>
                    allowedCandidateKeys
                      .has(
                        item.candidateKey,
                      ),
                ) ??
              null
            : executionCandidateQueueService
                .getNextReady();

        if (
          !queueItem
        ) {
          if (
            attempted ===
            0
          ) {
            this.noReadyItemRuns +=
              1;
          }

          break;
        }

        attempted +=
          1;

        this.totalAttempts +=
          1;

        const qualification =
          candidateQualificationService
            .getQualification(
              queueItem.candidateKey,
            );

        if (
          !qualification ||
          !qualification.qualified
        ) {
          const cancelled =
            executionCandidateQueueService
              .cancel(
                queueItem.id,

                "Version 15.4 shadow dispatch cancelled because candidate failed qualification revalidation.",
              );

          const record:
            ShadowDispatchRecord = {
            strategyAttribution:
              cloneStrategyAttribution(
                (
                  qualification ??
                  queueItem.qualification
                )
                  .candidate
                  .strategyAttribution,
              ),

            id:
              randomUUID(),

            queueItemId:
              queueItem.id,

            candidateKey:
              queueItem.candidateKey,

            candidateGeneration:
              this.createFallbackGeneration(
                queueItem.candidateKey,
              ),

            market:
              queueItem.market,

            buyExchange:
              queueItem.buyExchange,

            sellExchange:
              queueItem.sellExchange,

            status:
              "REVALIDATION_FAILED",

            priorityScore:
              queueItem.priorityScore,

            qualificationScore:
              queueItem.qualificationScore,

            netProfitPercent:
              queueItem.netProfitPercent,

            liquidityScore:
              queueItem.liquidityScore,

            freshnessScore:
              queueItem.freshnessScore,

            consecutiveObservations:
              queueItem
                .consecutiveObservations,

            persistenceMs:
              queueItem.persistenceMs,

            dispatchedAt:
              Date.now(),

            reasons: [
              "Queue item was READY but candidate no longer passes Version 15.2 qualification.",
              "Queue item was cancelled.",
              "No paper or live execution occurred.",
            ],

            qualification:
              qualification ??
              queueItem.qualification,

            queueItem:
              cancelled,
          };

          this.storeRecord(
            record,
          );

          resultRecords.push(
            structuredClone(
              record,
            ),
          );

          revalidationFailed +=
            1;

          this.totalRevalidationFailed +=
            1;

          continue;
        }

        const generation =
          this.createCandidateGeneration(
            qualification,
          );

        if (
          this.dispatchedGenerations
            .has(
              generation,
            )
        ) {
          const consumed =
            executionCandidateQueueService
              .consume(
                queueItem.id,

                "Duplicate shadow dispatch suppressed for the same continuous candidate generation.",
              );

          const record:
            ShadowDispatchRecord = {
            strategyAttribution:
              cloneStrategyAttribution(
                qualification
                  .candidate
                  .strategyAttribution,
              ),

            id:
              randomUUID(),

            queueItemId:
              queueItem.id,

            candidateKey:
              queueItem.candidateKey,

            candidateGeneration:
              generation,

            market:
              queueItem.market,

            buyExchange:
              queueItem.buyExchange,

            sellExchange:
              queueItem.sellExchange,

            status:
              "DUPLICATE_SUPPRESSED",

            priorityScore:
              queueItem.priorityScore,

            qualificationScore:
              qualification.score,

            netProfitPercent:
              qualification
                .candidate
                .latest
                .netProfitPercent,

            liquidityScore:
              qualification
                .candidate
                .latest
                .liquidityScore,

            freshnessScore:
              qualification
                .candidate
                .latest
                .freshnessScore,

            consecutiveObservations:
              qualification
                .candidate
                .consecutiveObservations,

            persistenceMs:
              this.resolvePersistence(
                qualification,
              ),

            dispatchedAt:
              Date.now(),

            reasons: [
              "This continuous candidate generation was already shadow-dispatched.",
              "Duplicate execution intent was suppressed.",
              "Queue item was consumed without creating an execution.",
              "No paper or live order was submitted.",
            ],

            qualification:
              structuredClone(
                qualification,
              ),

            queueItem:
              consumed,
          };

          this.storeRecord(
            record,
          );

          resultRecords.push(
            structuredClone(
              record,
            ),
          );

          duplicatesSuppressed +=
            1;

          this.totalDuplicatesSuppressed +=
            1;

          continue;
        }

        /*
         * This is the ONLY Version 15.4
         * "dispatch" action.
         *
         * Queue state moves READY → CONSUMED.
         *
         * Nothing below calls:
         *
         * - LiveExecutionCoordinator
         * - PaperTradingService
         * - LiveExecutionService
         * - exchange adapters
         * - capital reservation
         */
        const consumed =
          executionCandidateQueueService
            .consume(
              queueItem.id,

              "Candidate consumed by Version 15.4 SHADOW dispatcher. No real execution occurred.",
            );

        this.dispatchedGenerations
          .add(
            generation,
          );

        const now =
          Date.now();

        const record:
          ShadowDispatchRecord = {
          strategyAttribution:
            cloneStrategyAttribution(
              qualification
                .candidate
                .strategyAttribution,
            ),

          id:
            randomUUID(),

          queueItemId:
            queueItem.id,

          candidateKey:
            queueItem.candidateKey,

          candidateGeneration:
            generation,

          market:
            queueItem.market,

          buyExchange:
            queueItem.buyExchange,

          sellExchange:
            queueItem.sellExchange,

          status:
            "SHADOW_DISPATCHED",

          priorityScore:
            queueItem.priorityScore,

          qualificationScore:
            qualification.score,

          netProfitPercent:
            qualification
              .candidate
              .latest
              .netProfitPercent,

          liquidityScore:
            qualification
              .candidate
              .latest
              .liquidityScore,

          freshnessScore:
            qualification
              .candidate
              .latest
              .freshnessScore,

          consecutiveObservations:
            qualification
              .candidate
              .consecutiveObservations,

          persistenceMs:
            this.resolvePersistence(
              qualification,
            ),

          dispatchedAt:
            now,

          reasons: [
            "READY queue candidate passed final qualification revalidation.",
            "Stable candidate generation passed duplicate-dispatch protection.",
            "Candidate was consumed in SHADOW mode.",
            "No capital was reserved.",
            "No paper trade was created.",
            "No exchange API was called.",
            "No live order was submitted.",
          ],

          qualification:
            structuredClone(
              qualification,
            ),

          queueItem:
            consumed,
        };

        this.storeRecord(
          record,
        );

        resultRecords.push(
          structuredClone(
            record,
          ),
        );

        dispatched +=
          1;

        this.totalDispatched +=
          1;

        this.lastDispatchAt =
          now;
      }

      return {
        generatedAt:
          Date.now(),

        attempted,

        dispatched,

        revalidationFailed,

        duplicatesSuppressed,

        records:
          resultRecords,
      };
    } finally {
      this.runInProgress =
        false;
    }
  }

  getDiagnostics():
    ShadowExecutionDispatcherDiagnostics {
    return {
      generatedAt:
        Date.now(),

      mode:
        "SHADOW",

      executionAllowed:
        false,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      automaticDispatchEnabled:
        true,

      maximumBatchSize:
        this.config.maximumBatchSize,

      totalRuns:
        this.totalRuns,

      totalAttempts:
        this.totalAttempts,

      totalDispatched:
        this.totalDispatched,

      totalRevalidationFailed:
        this.totalRevalidationFailed,

      totalDuplicatesSuppressed:
        this.totalDuplicatesSuppressed,

      noReadyItemRuns:
        this.noReadyItemRuns,

      dispatchedCandidateGenerations:
        this.dispatchedGenerations
          .size,

      lastRunAt:
        this.lastRunAt,

      lastDispatchAt:
        this.lastDispatchAt,

      lastRecord:
        this.lastRecord
          ? structuredClone(
              this.lastRecord,
            )
          : null,

      records:
        this.records
          .map(
            (
              record,
            ) =>
              structuredClone(
                record,
              ),
          ),
    };
  }

  /** Internal immutable-by-contract traversal for the evidence archive. */
  forEachArchiveRecord(
    visitor:
      (
        record:
          ShadowDispatchRecord,
      ) => void,
  ): void {
    for (
      const record
      of this.records
    ) {
      visitor(
        record,
      );
    }
  }

  private createCandidateGeneration(
    qualification:
      ReturnType<
        typeof candidateQualificationService.getQualifiedCandidates
      >[number],
  ): string {
    const candidate =
      qualification.candidate;

    return [
      candidate.key,
      candidate.firstSeenAt,
      candidate.reappearances,
    ].join(
      "|",
    );
  }

  private createFallbackGeneration(
    candidateKey:
      string,
  ): string {
    return [
      candidateKey,
      "qualification-missing",
    ].join(
      "|",
    );
  }

  private resolvePersistence(
    qualification:
      ReturnType<
        typeof candidateQualificationService.getQualifiedCandidates
      >[number],
  ): number {
    const candidate =
      qualification.candidate;

    if (
      candidate.status !==
      "ACTIVE"
    ) {
      return candidate.lifetimeMs;
    }

    return Math.max(
      candidate.lifetimeMs,

      Date.now() -
        candidate.firstSeenAt,
    );
  }

  private storeRecord(
    record:
      ShadowDispatchRecord,
  ): void {
    this.records.unshift(
      structuredClone(
        record,
      ),
    );

    this.lastRecord =
      structuredClone(
        record,
      );

    if (
      this.records.length >
      this.config.maximumHistory
    ) {
      this.records.length =
        this.config.maximumHistory;
    }
  }

  private validateConfig():
    void {
    if (
      !Number.isInteger(
        this.config.maximumBatchSize,
      ) ||
      this.config.maximumBatchSize <
        1 ||
      this.config.maximumBatchSize >
        100
    ) {
      throw new Error(
        "Shadow dispatcher maximumBatchSize must be an integer between 1 and 100.",
      );
    }

    if (
      !Number.isInteger(
        this.config.maximumHistory,
      ) ||
      this.config.maximumHistory <
        1
    ) {
      throw new Error(
        "Shadow dispatcher maximumHistory must be a positive integer.",
      );
    }
  }
}

export const shadowExecutionDispatcherService =
  new ShadowExecutionDispatcherService();
