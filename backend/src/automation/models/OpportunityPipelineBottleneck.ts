export type OpportunityPipelineBottleneckStatus =
  | "NO_MARKET_DATA"
  | "NO_EXECUTABLE_MARKET_DATA"
  | "NO_PAIRABLE_MARKETS"
  | "ENGINE_REJECTING"
  | "NO_ACCEPTED_OPPORTUNITIES"
  | "NO_PERSISTENT_CANDIDATES"
  | "QUALIFICATION_BLOCKED"
  | "QUEUE_EMPTY"
  | "SHADOW_NOT_DISPATCHING"
  | "SHADOW_LEARNING"
  | "FLOWING";

export interface OpportunityPipelineStageDiagnostic {
  key: string;

  healthy: boolean;

  count: number;

  message: string;
}

export interface OpportunityPipelineBottleneckReport {
  generatedAt: number;

  version: "17.3";

  build: "1";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  status: OpportunityPipelineBottleneckStatus;

  primaryBottleneck: string;

  primaryBottleneckPercent: number | null;

  summary: {
    cachedQuotes: number;

    executableQuotes: number;

    sharedMarkets: number;

    pairableMarkets: number;

    directionalPairs: number;

    evaluatedPairs: number;

    acceptedOpportunities: number;

    activeCandidates: number;

    qualifiedCandidates: number;

    readyQueueItems: number;

    shadowDispatches: number;

    completedShadowOutcomes: number;
  };

  stages: OpportunityPipelineStageDiagnostic[];

  engine: {
    rejectionSampleSize: number;

    primaryRejectionStage: string | null;

    primaryRejectionPercent: number | null;

    rejectionStages: Array<{
      stage: string;

      count: number;

      percent: number;
    }>;

    rejectionCodes: Array<{
      code: string;

      count: number;

      percent: number;
    }>;

    closestToExecution: unknown[];
  };

  qualification: {
    observing: number;

    qualified: number;

    rejected: number;

    expired: number;

    failedChecks: Array<{
      check: string;

      count: number;
    }>;
  };

  shadow: {
    totalDispatched: number;

    revalidationFailed: number;

    duplicatesSuppressed: number;

    trackedDispatches: number;

    tracking: number;

    success: number;

    failed: number;

    dataUnavailable: number;

    completed: number;

    readinessLevel: string;

    readinessScore: number;
  };

  observations: string[];
}