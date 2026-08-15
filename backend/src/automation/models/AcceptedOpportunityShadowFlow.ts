import type {
  CandidateQualificationChecks,
} from "./CandidateQualification";

export type AcceptedOpportunityShadowFlowStatus =
  | "NOT_MONITORED"
  | "OBSERVING"
  | "QUALIFICATION_REJECTED"
  | "QUALIFIED_NOT_QUEUED"
  | "QUEUED_READY"
  | "QUEUE_TERMINAL"
  | "SHADOW_REVALIDATION_FAILED"
  | "SHADOW_DUPLICATE_SUPPRESSED"
  | "SHADOW_DISPATCHED"
  | "OUTCOME_TRACKING"
  | "OUTCOME_SUCCESS"
  | "OUTCOME_FAILED"
  | "OUTCOME_DATA_UNAVAILABLE";

export interface AcceptedOpportunityShadowFlowTrace {
  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  currentAccepted: boolean;

  currentOpportunityId: string | null;

  currentNetProfitPercent: number | null;

  currentLiquidityScore: number | null;

  currentFreshnessScore: number | null;

  flowStatus:
    AcceptedOpportunityShadowFlowStatus;

  bottleneck: string;

  monitor: {
    found: boolean;

    status: string | null;

    firstSeenAt: number | null;

    lastSeenAt: number | null;

    lifetimeMs: number | null;

    totalObservations: number | null;

    consecutiveObservations: number | null;

    reappearances: number | null;

    latestOpportunityId: string | null;

    latestNetProfitPercent: number | null;

    bestNetProfitPercent: number | null;
  };

  qualification: {
    found: boolean;

    status: string | null;

    qualified: boolean;

    score: number | null;

    profitDrawdownPercent: number | null;

    checks:
      CandidateQualificationChecks | null;

    failedChecks: string[];

    reasons: string[];
  };

  queue: {
    found: boolean;

    id: string | null;

    status: string | null;

    priorityScore: number | null;

    enqueuedAt: number | null;

    expiresAt: number | null;

    renewals: number | null;

    reason: string | null;
  };

  shadowDispatch: {
    found: boolean;

    id: string | null;

    status: string | null;

    candidateGeneration: string | null;

    dispatchedAt: number | null;

    reasons: string[];
  };

  outcome: {
    found: boolean;

    status: string | null;

    totalSamples: number | null;

    freshSamples: number | null;

    executableSamples: number | null;

    profitableSamples: number | null;

    averageObservedNetProfit: number | null;

    finalReason: string | null;
  };
}

export interface AcceptedOpportunityShadowFlowReport {
  generatedAt: number;

  version: "17.4";

  build: "3";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  summary: {
    currentAcceptedOpportunities: number;

    monitoredCandidates: number;

    activeMonitoredCandidates: number;

    qualifiedCandidates: number;

    readyQueueItems: number;

    shadowDispatches: number;

    trackedOutcomes: number;

    schedulerRunning: boolean;

    schedulerCyclesWithOpportunity: number;

    schedulerCyclesWithoutOpportunity: number;
  };

  qualificationConfig: {
    minimumConsecutiveObservations: number;

    minimumPersistenceMs: number;

    minimumNetProfitPercent: number;

    minimumLiquidityScore: number;

    minimumFreshnessScore: number;

    maximumProfitDrawdownPercent: number;
  };

  primaryBottleneck: string;

  traces:
    AcceptedOpportunityShadowFlowTrace[];

  observations: string[];
}