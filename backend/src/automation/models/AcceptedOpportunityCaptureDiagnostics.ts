export type AcceptedOpportunityCaptureClassification =
  | "INSUFFICIENT_HISTORY"
  | "NO_ACCEPTED_SNAPSHOTS"
  | "CAPTURE_HEALTHY"
  | "SHORT_VISIBILITY_WINDOW"
  | "SCHEDULER_CAPTURE_GAP"
  | "MIXED_CAPTURE_GAP";

export interface AcceptedOpportunityCaptureTrace {
  snapshotGeneratedAt: number;

  nextSnapshotGeneratedAt: number | null;

  visibilityWindowMs: number | null;

  opportunityKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  netProfitPercent: number;

  monitorProcessedSnapshot: boolean;

  monitorCapturedRoute: boolean;

  monitorCandidateExists: boolean;

  monitorFirstSeenAt: number | null;

  monitorLastSeenAt: number | null;

  captureLatencyMs: number | null;

  schedulerIntervalMs: number;

  visibilityShorterThanSchedulerInterval:
    boolean | null;

  result:
    | "CAPTURED"
    | "MISSED_SHORT_WINDOW"
    | "MISSED_DESPITE_SCHEDULER_WINDOW";
}

export interface AcceptedOpportunityCaptureDiagnosticsReport {
  generatedAt: number;

  version: "17.4";

  build: "4";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  classification:
    AcceptedOpportunityCaptureClassification;

  configuration: {
    opportunityScanIntervalMs: number;

    opportunityEventDriven: boolean;

    opportunityMinimumEventScanIntervalMs: number;

    automationSchedulerIntervalMs: number;

    schedulerMaximumSnapshotAgeMs: number;
  };

  summary: {
    recordedEngineSnapshots: number;

    engineSnapshotsWithAcceptedOpportunity: number;

    acceptedOpportunityObservations: number;

    uniqueAcceptedRoutes: number;

    acceptedSnapshotsProcessedByMonitor: number;

    acceptedSnapshotsMissedByMonitor: number;

    capturedOpportunityObservations: number;

    missedOpportunityObservations: number;

    missedShortVisibilityObservations: number;

    missedDespiteSchedulerWindowObservations: number;

    monitorProcessedSnapshots: number;
  };

  traces:
    AcceptedOpportunityCaptureTrace[];

  observations:
    string[];
}
