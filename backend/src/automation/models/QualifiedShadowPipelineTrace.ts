import type {
  ExecutionQueueItemStatus,
} from "./ExecutionCandidateQueue";

import type {
  ShadowDispatchStatus,
} from "./ShadowExecutionDispatcher";

import type {
  ShadowTradeOutcomeStatus,
} from "./ShadowTradeOutcome";

export type QualifiedShadowPipelineState =
  | "NO_QUALIFIED_EVIDENCE"
  | "QUALIFIED_NEVER_QUEUED"
  | "QUEUED_READY_NOT_DISPATCHED"
  | "QUEUE_TERMINAL_BEFORE_DISPATCH"
  | "QUEUE_CONSUMED_WITHOUT_DISPATCH"
  | "SHADOW_REVALIDATION_FAILED"
  | "SHADOW_DUPLICATE_SUPPRESSED"
  | "SHADOW_DISPATCHED_NOT_TRACKED"
  | "OUTCOME_TRACKING"
  | "OUTCOME_SUCCESS"
  | "OUTCOME_FAILED"
  | "OUTCOME_DATA_UNAVAILABLE";

export interface QualifiedShadowPipelineRouteTrace {
  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  state:
    QualifiedShadowPipelineState;

  bottleneck: string;

  evidence: {
    qualifiedEvaluations: number;

    allChecksPassObservations: number;

    qualityPassObservations: number;

    persistencePassObservations: number;

    bestQualificationScore: number;

    bestNetProfitPercent: number;

    maximumLiquidityScore: number;

    maximumFreshnessScore: number;

    maximumConsecutiveObservations: number;

    maximumLifetimeMs: number;

    maximumReappearances: number;

    lastObservedAt: number;
  };

  queue: {
    found: boolean;

    totalItems: number;

    currentRuntimeItems: number;

    archivedItems: number;

    latestItemId: string | null;

    latestStatus:
      ExecutionQueueItemStatus | null;

    latestPriorityScore: number | null;

    latestQualificationScore: number | null;

    latestNetProfitPercent: number | null;

    latestEnqueuedAt: number | null;

    latestUpdatedAt: number | null;

    latestExpiresAt: number | null;

    latestRenewals: number | null;

    latestReason: string | null;

    statusHistory:
      ExecutionQueueItemStatus[];
  };

  dispatch: {
    found: boolean;

    totalRecords: number;

    currentRuntimeRecords: number;

    archivedRecords: number;

    shadowDispatched: number;

    revalidationFailed: number;

    duplicateSuppressed: number;

    latestDispatchId: string | null;

    latestStatus:
      ShadowDispatchStatus | null;

    latestGeneration: string | null;

    latestDispatchedAt: number | null;

    latestReasons: string[];

    statusHistory:
      ShadowDispatchStatus[];
  };

  outcome: {
    found: boolean;

    totalRecords: number;

    currentRuntimeRecords: number;

    archivedRecords: number;

    latestOutcomeId: string | null;

    latestShadowDispatchId: string | null;

    latestStatus:
      ShadowTradeOutcomeStatus | null;

    latestDispatchedAt: number | null;

    latestCompletedAt: number | null;

    latestTotalSamples: number | null;

    latestFreshSamples: number | null;

    latestExecutableSamples: number | null;

    latestProfitableSamples: number | null;

    latestBestObservedNetProfit: number | null;

    latestAverageObservedNetProfit: number | null;

    latestFinalReason: string | null;

    statusHistory:
      ShadowTradeOutcomeStatus[];
  };
}

export interface QualifiedShadowPipelineTraceReport {
  generatedAt: number;

  version: "17.4";

  build: "10";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  paperExecutionAllowed: false;

  liveExecutionAllowed: false;

  restartSafeEvidence: true;

  operationalStateRestored: false;

  classification:
    QualifiedShadowPipelineState;

  primaryBottleneck: string;

  evidenceSources: {
    candidateEvidencePersistent: boolean;

    shadowArchivePersistent: boolean;

    shadowArchiveRestored: boolean;

    runtimeQueueItems: number;

    archivedQueueItems: number;

    mergedQueueItems: number;

    runtimeDispatchRecords: number;

    archivedDispatchRecords: number;

    mergedDispatchRecords: number;

    runtimeOutcomeRecords: number;

    archivedOutcomeRecords: number;

    mergedOutcomeRecords: number;
  };

  summary: {
    evidenceRoutesObserved: number;

    routesEverQualified: number;

    routesWithQueueHistory: number;

    routesWithShadowDispatchHistory: number;

    routesActuallyShadowDispatched: number;

    routesWithOutcomeHistory: number;

    routesWithSuccessfulShadowOutcome: number;

    routesWithFailedShadowOutcome: number;

    routesWithDataUnavailableOutcome: number;

    currentReadyQueueItems: number;

    totalQueueItemsCreated: number;

    totalShadowAttempts: number;

    totalShadowDispatched: number;

    totalShadowRevalidationFailed: number;

    totalShadowDuplicatesSuppressed: number;

    totalTrackedOutcomes: number;
  };

  traces:
    QualifiedShadowPipelineRouteTrace[];

  observations:
    string[];
}