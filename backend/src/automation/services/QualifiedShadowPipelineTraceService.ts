import type {
  CandidateEvidenceRouteRecord,
} from "../models/CandidateEvidenceAccumulator";

import type {
  ExecutionCandidateQueueItem,
} from "../models/ExecutionCandidateQueue";

import type {
  QualifiedShadowPipelineRouteTrace,
  QualifiedShadowPipelineState,
  QualifiedShadowPipelineTraceReport,
} from "../models/QualifiedShadowPipelineTrace";

import type {
  ShadowDispatchRecord,
} from "../models/ShadowExecutionDispatcher";

import type {
  ShadowTradeOutcomeRecord,
} from "../models/ShadowTradeOutcome";

import {
  candidateEvidenceAccumulatorService,
} from "./CandidateEvidenceAccumulatorService";

import {
  executionCandidateQueueService,
} from "./ExecutionCandidateQueueService";

import {
  shadowExecutionDispatcherService,
} from "./ShadowExecutionDispatcherService";

import {
  shadowLearningEvidenceArchiveService,
} from "./ShadowLearningEvidenceArchiveService";

import {
  shadowTradeOutcomeTrackerService,
} from "./ShadowTradeOutcomeTrackerService";

export class QualifiedShadowPipelineTraceService {
  getReport():
    QualifiedShadowPipelineTraceReport {
    const evidence =
      candidateEvidenceAccumulatorService
        .getDiagnostics();

    const runtimeQueue =
      executionCandidateQueueService
        .getDiagnostics();

    const runtimeDispatcher =
      shadowExecutionDispatcherService
        .getDiagnostics();

    const runtimeOutcomes =
      shadowTradeOutcomeTrackerService
        .getDiagnostics();

    const archive =
      shadowLearningEvidenceArchiveService
        .getDiagnostics();

    /*
     * VERSION 17.4 BUILD 10
     *
     * Merge persistent historical evidence with
     * current runtime evidence.
     *
     * Current runtime wins when the same record ID
     * appears in both sources.
     *
     * IMPORTANT:
     *
     * This is diagnostic merging ONLY.
     * Nothing is restored into operational services.
     */
    const mergedQueueItems =
      this.mergeById(
        archive.queueItems,
        runtimeQueue.items,
      );

    const mergedDispatchRecords =
      this.mergeById(
        archive.dispatchRecords,
        runtimeDispatcher.records,
      );

    const mergedOutcomeRecords =
      this.mergeById(
        archive.outcomeRecords,
        runtimeOutcomes.records,
      );

    const qualifiedEvidence =
      evidence.routes
        .filter(
          (
            route,
          ) =>
            route.qualifiedEvaluations >
              0 ||
            route.allChecksPassObservations >
              0,
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.lastObservedAt -
            first.lastObservedAt,
        );

    const traces =
      qualifiedEvidence.map(
        (
          route,
        ) =>
          this.buildTrace(
            route,

            runtimeQueue.items,
            archive.queueItems,
            mergedQueueItems,

            runtimeDispatcher.records,
            archive.dispatchRecords,
            mergedDispatchRecords,

            runtimeOutcomes.records,
            archive.outcomeRecords,
            mergedOutcomeRecords,
          ),
      );

    const routesWithQueueHistory =
      traces.filter(
        (
          trace,
        ) =>
          trace.queue.found,
      ).length;

    const routesWithShadowDispatchHistory =
      traces.filter(
        (
          trace,
        ) =>
          trace.dispatch.found,
      ).length;

    const routesActuallyShadowDispatched =
      traces.filter(
        (
          trace,
        ) =>
          trace.dispatch.shadowDispatched >
          0,
      ).length;

    const routesWithOutcomeHistory =
      traces.filter(
        (
          trace,
        ) =>
          trace.outcome.found,
      ).length;

    const routesWithSuccessfulShadowOutcome =
      traces.filter(
        (
          trace,
        ) =>
          trace.outcome.statusHistory
            .includes(
              "SUCCESS",
            ),
      ).length;

    const routesWithFailedShadowOutcome =
      traces.filter(
        (
          trace,
        ) =>
          trace.outcome.statusHistory
            .includes(
              "FAILED",
            ),
      ).length;

    const routesWithDataUnavailableOutcome =
      traces.filter(
        (
          trace,
        ) =>
          trace.outcome.statusHistory
            .includes(
              "DATA_UNAVAILABLE",
            ),
      ).length;

    const classification =
      this.resolveOverallState(
        traces,
      );

    const primaryBottleneck =
      this.resolvePrimaryBottleneck(
        classification,
        traces,
      );

    const observations:
      string[] = [
      `Persistent candidate evidence contains ${qualifiedEvidence.length} route(s) that have genuinely reached qualification/all-checks-pass evidence.`,

      `${routesWithQueueHistory}/${qualifiedEvidence.length} qualified route(s) have queue history across runtime + persistent archive.`,

      `${routesActuallyShadowDispatched}/${qualifiedEvidence.length} qualified route(s) have at least one SHADOW_DISPATCHED record.`,

      `${routesWithOutcomeHistory}/${qualifiedEvidence.length} qualified route(s) have shadow-outcome evidence.`,

      `Primary restart-safe pipeline state: ${classification}.`,

      archive.persistence.restored
        ? "Shadow-learning archive was restored successfully and is included in this report."
        : "No previous shadow-learning archive state was restored for this process.",

      "Runtime records override archived records with the same ID so newer lifecycle state is reported.",

      "Persistent READY queue items are historical evidence only. They are NOT restored into ExecutionCandidateQueueService.",

      "Persistent TRACKING outcomes are historical evidence only. They are NOT automatically resumed by this tracer.",

      "This endpoint cannot enqueue, dispatch, paper-trade, or submit exchange orders.",

      "LIVE execution remains disabled.",
    ];

    return {
      generatedAt:
        Date.now(),

      version:
        "17.4",

      build:
        "10",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      restartSafeEvidence:
        true,

      operationalStateRestored:
        false,

      classification,

      primaryBottleneck,

      evidenceSources: {
        candidateEvidencePersistent:
          evidence
            .persistence
            .enabled,

        shadowArchivePersistent:
          archive
            .persistence
            .enabled,

        shadowArchiveRestored:
          archive
            .persistence
            .restored,

        runtimeQueueItems:
          runtimeQueue
            .items
            .length,

        archivedQueueItems:
          archive
            .queueItems
            .length,

        mergedQueueItems:
          mergedQueueItems.length,

        runtimeDispatchRecords:
          runtimeDispatcher
            .records
            .length,

        archivedDispatchRecords:
          archive
            .dispatchRecords
            .length,

        mergedDispatchRecords:
          mergedDispatchRecords.length,

        runtimeOutcomeRecords:
          runtimeOutcomes
            .records
            .length,

        archivedOutcomeRecords:
          archive
            .outcomeRecords
            .length,

        mergedOutcomeRecords:
          mergedOutcomeRecords.length,
      },

      summary: {
        evidenceRoutesObserved:
          evidence
            .summary
            .routesObserved,

        routesEverQualified:
          qualifiedEvidence.length,

        routesWithQueueHistory,

        routesWithShadowDispatchHistory,

        routesActuallyShadowDispatched,

        routesWithOutcomeHistory,

        routesWithSuccessfulShadowOutcome,

        routesWithFailedShadowOutcome,

        routesWithDataUnavailableOutcome,

        currentReadyQueueItems:
          runtimeQueue.ready,

        /*
         * These counters represent CURRENT process
         * operational service counters.
         *
         * Historical record counts are separately
         * exposed under evidenceSources.
         */
        totalQueueItemsCreated:
          runtimeQueue
            .totalItemsCreated,

        totalShadowAttempts:
          runtimeDispatcher
            .totalAttempts,

        totalShadowDispatched:
          runtimeDispatcher
            .totalDispatched,

        totalShadowRevalidationFailed:
          runtimeDispatcher
            .totalRevalidationFailed,

        totalShadowDuplicatesSuppressed:
          runtimeDispatcher
            .totalDuplicatesSuppressed,

        totalTrackedOutcomes:
          runtimeOutcomes
            .trackedDispatches,
      },

      traces,

      observations,
    };
  }

  private buildTrace(
    evidence:
      CandidateEvidenceRouteRecord,

    runtimeQueue:
      ExecutionCandidateQueueItem[],

    archivedQueue:
      ExecutionCandidateQueueItem[],

    mergedQueue:
      ExecutionCandidateQueueItem[],

    runtimeDispatches:
      ShadowDispatchRecord[],

    archivedDispatches:
      ShadowDispatchRecord[],

    mergedDispatches:
      ShadowDispatchRecord[],

    runtimeOutcomes:
      ShadowTradeOutcomeRecord[],

    archivedOutcomes:
      ShadowTradeOutcomeRecord[],

    mergedOutcomes:
      ShadowTradeOutcomeRecord[],
  ): QualifiedShadowPipelineRouteTrace {
    const queueItems =
      mergedQueue
        .filter(
          (
            item,
          ) =>
            item.candidateKey ===
            evidence.key,
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.updatedAt -
            first.updatedAt,
        );

    const dispatches =
      mergedDispatches
        .filter(
          (
            record,
          ) =>
            record.candidateKey ===
            evidence.key,
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.dispatchedAt -
            first.dispatchedAt,
        );

    const outcomes =
      mergedOutcomes
        .filter(
          (
            record,
          ) =>
            record.candidateKey ===
            evidence.key,
        )
        .sort(
          (
            first,
            second,
          ) =>
            (
              second.completedAt ??
              second.dispatchedAt
            ) -
            (
              first.completedAt ??
              first.dispatchedAt
            ),
        );

    const runtimeQueueForRoute =
      runtimeQueue.filter(
        (
          item,
        ) =>
          item.candidateKey ===
          evidence.key,
      );

    const archivedQueueForRoute =
      archivedQueue.filter(
        (
          item,
        ) =>
          item.candidateKey ===
          evidence.key,
      );

    const runtimeDispatchForRoute =
      runtimeDispatches.filter(
        (
          record,
        ) =>
          record.candidateKey ===
          evidence.key,
      );

    const archivedDispatchForRoute =
      archivedDispatches.filter(
        (
          record,
        ) =>
          record.candidateKey ===
          evidence.key,
      );

    const runtimeOutcomesForRoute =
      runtimeOutcomes.filter(
        (
          record,
        ) =>
          record.candidateKey ===
          evidence.key,
      );

    const archivedOutcomesForRoute =
      archivedOutcomes.filter(
        (
          record,
        ) =>
          record.candidateKey ===
          evidence.key,
      );

    const latestQueue =
      queueItems[0] ??
      null;

    const latestDispatch =
      dispatches[0] ??
      null;

    const latestOutcome =
      outcomes[0] ??
      null;

    const shadowDispatched =
      dispatches.filter(
        (
          record,
        ) =>
          record.status ===
          "SHADOW_DISPATCHED",
      ).length;

    const revalidationFailed =
      dispatches.filter(
        (
          record,
        ) =>
          record.status ===
          "REVALIDATION_FAILED",
      ).length;

    const duplicateSuppressed =
      dispatches.filter(
        (
          record,
        ) =>
          record.status ===
          "DUPLICATE_SUPPRESSED",
      ).length;

    const state =
      this.resolveRouteState(
        queueItems,
        dispatches,
        outcomes,
      );

    return {
      candidateKey:
        evidence.key,

      market:
        evidence.market,

      buyExchange:
        evidence.buyExchange,

      sellExchange:
        evidence.sellExchange,

      state,

      bottleneck:
        this.bottleneckForState(
          state,
        ),

      evidence: {
        qualifiedEvaluations:
          evidence
            .qualifiedEvaluations,

        allChecksPassObservations:
          evidence
            .allChecksPassObservations,

        qualityPassObservations:
          evidence
            .qualityPassObservations,

        persistencePassObservations:
          evidence
            .persistencePassObservations,

        bestQualificationScore:
          evidence
            .bestQualificationScore,

        bestNetProfitPercent:
          evidence
            .bestNetProfitPercent,

        maximumLiquidityScore:
          evidence
            .maximumLiquidityScore,

        maximumFreshnessScore:
          evidence
            .maximumFreshnessScore,

        maximumConsecutiveObservations:
          evidence
            .maximumConsecutiveObservations,

        maximumLifetimeMs:
          evidence
            .maximumLifetimeMs,

        maximumReappearances:
          evidence
            .maximumReappearances,

        lastObservedAt:
          evidence
            .lastObservedAt,
      },

      queue: {
        found:
          latestQueue !==
          null,

        totalItems:
          queueItems.length,

        currentRuntimeItems:
          runtimeQueueForRoute.length,

        archivedItems:
          archivedQueueForRoute.length,

        latestItemId:
          latestQueue
            ?.id ??
          null,

        latestStatus:
          latestQueue
            ?.status ??
          null,

        latestPriorityScore:
          latestQueue
            ?.priorityScore ??
          null,

        latestQualificationScore:
          latestQueue
            ?.qualificationScore ??
          null,

        latestNetProfitPercent:
          latestQueue
            ?.netProfitPercent ??
          null,

        latestEnqueuedAt:
          latestQueue
            ?.enqueuedAt ??
          null,

        latestUpdatedAt:
          latestQueue
            ?.updatedAt ??
          null,

        latestExpiresAt:
          latestQueue
            ?.expiresAt ??
          null,

        latestRenewals:
          latestQueue
            ?.renewals ??
          null,

        latestReason:
          latestQueue
            ?.reason ??
          null,

        statusHistory:
          queueItems.map(
            (
              item,
            ) =>
              item.status,
          ),
      },

      dispatch: {
        found:
          latestDispatch !==
          null,

        totalRecords:
          dispatches.length,

        currentRuntimeRecords:
          runtimeDispatchForRoute.length,

        archivedRecords:
          archivedDispatchForRoute.length,

        shadowDispatched,

        revalidationFailed,

        duplicateSuppressed,

        latestDispatchId:
          latestDispatch
            ?.id ??
          null,

        latestStatus:
          latestDispatch
            ?.status ??
          null,

        latestGeneration:
          latestDispatch
            ?.candidateGeneration ??
          null,

        latestDispatchedAt:
          latestDispatch
            ?.dispatchedAt ??
          null,

        latestReasons:
          latestDispatch
            ? structuredClone(
                latestDispatch
                  .reasons,
              )
            : [],

        statusHistory:
          dispatches.map(
            (
              record,
            ) =>
              record.status,
          ),
      },

      outcome: {
        found:
          latestOutcome !==
          null,

        totalRecords:
          outcomes.length,

        currentRuntimeRecords:
          runtimeOutcomesForRoute.length,

        archivedRecords:
          archivedOutcomesForRoute.length,

        latestOutcomeId:
          latestOutcome
            ?.id ??
          null,

        latestShadowDispatchId:
          latestOutcome
            ?.shadowDispatchId ??
          null,

        latestStatus:
          latestOutcome
            ?.status ??
          null,

        latestDispatchedAt:
          latestOutcome
            ?.dispatchedAt ??
          null,

        latestCompletedAt:
          latestOutcome
            ?.completedAt ??
          null,

        latestTotalSamples:
          latestOutcome
            ?.totalSamples ??
          null,

        latestFreshSamples:
          latestOutcome
            ?.freshSamples ??
          null,

        latestExecutableSamples:
          latestOutcome
            ?.executableSamples ??
          null,

        latestProfitableSamples:
          latestOutcome
            ?.profitableSamples ??
          null,

        latestBestObservedNetProfit:
          latestOutcome
            ?.bestObservedNetProfit ??
          null,

        latestAverageObservedNetProfit:
          latestOutcome
            ?.averageObservedNetProfit ??
          null,

        latestFinalReason:
          latestOutcome
            ?.finalReason ??
          null,

        statusHistory:
          outcomes.map(
            (
              record,
            ) =>
              record.status,
          ),
      },
    };
  }

  private mergeById<
    T extends {
      id: string;
    },
  >(
    archived:
      T[],

    runtime:
      T[],
  ): T[] {
    const merged =
      new Map<
        string,
        T
      >();

    /*
     * Historical first.
     */
    for (
      const record
      of archived
    ) {
      merged.set(
        record.id,

        structuredClone(
          record,
        ),
      );
    }

    /*
     * Current runtime replaces archive entry
     * with the same ID.
     */
    for (
      const record
      of runtime
    ) {
      merged.set(
        record.id,

        structuredClone(
          record,
        ),
      );
    }

    return Array.from(
      merged.values(),
    );
  }

  private resolveRouteState(
    queueItems:
      ExecutionCandidateQueueItem[],

    dispatches:
      ShadowDispatchRecord[],

    outcomes:
      ShadowTradeOutcomeRecord[],
  ): QualifiedShadowPipelineState {
    const latestOutcome =
      outcomes[0];

    if (
      latestOutcome
    ) {
      switch (
        latestOutcome.status
      ) {
        case "TRACKING":
          return "OUTCOME_TRACKING";

        case "SUCCESS":
          return "OUTCOME_SUCCESS";

        case "FAILED":
          return "OUTCOME_FAILED";

        case "DATA_UNAVAILABLE":
          return "OUTCOME_DATA_UNAVAILABLE";
      }
    }

    const latestDispatch =
      dispatches[0];

    if (
      latestDispatch
    ) {
      switch (
        latestDispatch.status
      ) {
        case "SHADOW_DISPATCHED":
          return "SHADOW_DISPATCHED_NOT_TRACKED";

        case "REVALIDATION_FAILED":
          return "SHADOW_REVALIDATION_FAILED";

        case "DUPLICATE_SUPPRESSED":
          return "SHADOW_DUPLICATE_SUPPRESSED";
      }
    }

    const latestQueue =
      queueItems[0];

    if (
      !latestQueue
    ) {
      return "QUALIFIED_NEVER_QUEUED";
    }

    if (
      latestQueue.status ===
      "READY"
    ) {
      return "QUEUED_READY_NOT_DISPATCHED";
    }

    if (
      latestQueue.status ===
      "CONSUMED"
    ) {
      return "QUEUE_CONSUMED_WITHOUT_DISPATCH";
    }

    return "QUEUE_TERMINAL_BEFORE_DISPATCH";
  }

  private resolveOverallState(
    traces:
      QualifiedShadowPipelineRouteTrace[],
  ): QualifiedShadowPipelineState {
    if (
      traces.length ===
      0
    ) {
      return "NO_QUALIFIED_EVIDENCE";
    }

    const priority:
      QualifiedShadowPipelineState[] = [
      "OUTCOME_SUCCESS",
      "OUTCOME_TRACKING",
      "OUTCOME_FAILED",
      "OUTCOME_DATA_UNAVAILABLE",
      "SHADOW_DISPATCHED_NOT_TRACKED",
      "SHADOW_DUPLICATE_SUPPRESSED",
      "SHADOW_REVALIDATION_FAILED",
      "QUEUE_CONSUMED_WITHOUT_DISPATCH",
      "QUEUED_READY_NOT_DISPATCHED",
      "QUEUE_TERMINAL_BEFORE_DISPATCH",
      "QUALIFIED_NEVER_QUEUED",
    ];

    for (
      const state
      of priority
    ) {
      if (
        traces.some(
          (
            trace,
          ) =>
            trace.state ===
            state,
        )
      ) {
        return state;
      }
    }

    return "QUALIFIED_NEVER_QUEUED";
  }

  private resolvePrimaryBottleneck(
    classification:
      QualifiedShadowPipelineState,

    traces:
      QualifiedShadowPipelineRouteTrace[],
  ): string {
    if (
      classification ===
      "NO_QUALIFIED_EVIDENCE"
    ) {
      return "QUALIFICATION_EVIDENCE";
    }

    const problematicPriority:
      QualifiedShadowPipelineState[] = [
      "QUALIFIED_NEVER_QUEUED",
      "QUEUED_READY_NOT_DISPATCHED",
      "QUEUE_CONSUMED_WITHOUT_DISPATCH",
      "SHADOW_DISPATCHED_NOT_TRACKED",
      "SHADOW_REVALIDATION_FAILED",
      "QUEUE_TERMINAL_BEFORE_DISPATCH",
    ];

    for (
      const state
      of problematicPriority
    ) {
      const trace =
        traces.find(
          (
            item,
          ) =>
            item.state ===
            state,
        );

      if (
        trace
      ) {
        return trace.bottleneck;
      }
    }

    return this.bottleneckForState(
      classification,
    );
  }

  private bottleneckForState(
    state:
      QualifiedShadowPipelineState,
  ): string {
    switch (
      state
    ) {
      case "NO_QUALIFIED_EVIDENCE":
        return "QUALIFICATION_EVIDENCE";

      case "QUALIFIED_NEVER_QUEUED":
        return "QUALIFICATION_TO_QUEUE";

      case "QUEUED_READY_NOT_DISPATCHED":
        return "QUEUE_TO_SHADOW_DISPATCHER";

      case "QUEUE_TERMINAL_BEFORE_DISPATCH":
        return "QUEUE_TERMINATED_BEFORE_DISPATCH";

      case "QUEUE_CONSUMED_WITHOUT_DISPATCH":
        return "QUEUE_CONSUMED_WITHOUT_DISPATCH_RECORD";

      case "SHADOW_REVALIDATION_FAILED":
        return "SHADOW_REVALIDATION";

      case "SHADOW_DUPLICATE_SUPPRESSED":
        return "NONE_DUPLICATE_PROTECTION_WORKING";

      case "SHADOW_DISPATCHED_NOT_TRACKED":
        return "SHADOW_DISPATCH_TO_OUTCOME_TRACKER";

      case "OUTCOME_TRACKING":
        return "NONE_OUTCOME_TRACKING";

      case "OUTCOME_SUCCESS":
        return "NONE_SHADOW_SUCCESS";

      case "OUTCOME_FAILED":
        return "SHADOW_MARKET_OUTCOME_FAILED";

      case "OUTCOME_DATA_UNAVAILABLE":
        return "SHADOW_OUTCOME_DATA_AVAILABILITY";
    }
  }
}

export const qualifiedShadowPipelineTraceService =
  new QualifiedShadowPipelineTraceService();