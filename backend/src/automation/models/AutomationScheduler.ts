export type AutomationMode =
  | "SHADOW";

export type AutomationCycleStatus =
  | "NO_SNAPSHOT"
  | "SNAPSHOT_STALE"
  | "NO_OPPORTUNITY"
  | "OPPORTUNITY_OBSERVED";

export interface AutomationObservedOpportunity {
  id: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  netProfit: number;

  netProfitPercent: number;

  liquidityScore: number;

  freshnessScore: number;

  timestamp: number;
}

export interface AutomationCycleResult {
  cycleId: number;

  startedAt: number;

  completedAt: number;

  durationMs: number;

  status: AutomationCycleStatus;

  opportunitySnapshotGeneratedAt:
    number | null;

  opportunitySnapshotAgeMs:
    number | null;

  opportunityCount: number;

  selectedOpportunity:
    AutomationObservedOpportunity | null;

  reasons: string[];
}

export interface AutomationLatencyDistribution {
  sampleCount: number;

  p50Ms: number | null;

  p95Ms: number | null;

  p99Ms: number | null;

  maxMs: number | null;
}

export interface AutomationSchedulerDiagnostics {
  generatedAt: number;

  running: boolean;

  mode: AutomationMode;

  cycleInProgress: boolean;

  snapshotSubscriptionActive:
    boolean;

  pendingSnapshotEvents:
    number;

  maximumPendingSnapshotEvents:
    number;

  intervalMs: number;

  maximumSnapshotAgeMs: number;

  paperExecutionAllowed: false;

  liveExecutionAllowed: false;

  totalCycles: number;

  completedCycles: number;

  skippedOverlappingCycles: number;

  snapshotEventsReceived:
    number;

  eventTriggeredCycles:
    number;

  droppedSnapshotEvents:
    number;

  droppedEmptySnapshotEvents:
    number;

  droppedCandidateSnapshotEvents:
    number;

  coalescedEmptySnapshotEvents:
    number;

  coalescedCandidateSnapshotEvents:
    number;

  pendingSnapshotHighWaterMark:
    number;

  cyclesWithOpportunity: number;

  cyclesWithoutOpportunity: number;

  staleSnapshotCycles: number;

  missingSnapshotCycles: number;

  lastStartedAt:
    number | null;

  lastCompletedAt:
    number | null;

  lastSuccessfulAt:
    number | null;

  lastFailedAt:
    number | null;

  lastError:
    string | null;

  lastCycle:
    AutomationCycleResult | null;

  lastPipelineStageDurationsMs:
    Readonly<Record<string, number>>;

  latency: {
    snapshotToPipelineStartMs:
      AutomationLatencyDistribution;

    decisionToQueueMs:
      AutomationLatencyDistribution;

    candidateDecisionToExecutionStartMs:
      AutomationLatencyDistribution;

    decisionToExecutionCompleteMs:
      AutomationLatencyDistribution;
  };
}
