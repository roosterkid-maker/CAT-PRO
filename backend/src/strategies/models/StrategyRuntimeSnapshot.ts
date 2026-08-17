import type {
  StrategyEvidenceStatus,
  StrategyLegacyAttribution,
} from "./StrategyEvidenceStatus";

import type {
  StrategyId,
  StrategyMetadata,
} from "./StrategyMetadata";

export interface StrategyRuntimeSnapshot {
  readonly strategyId:
    StrategyId;

  readonly generatedAt:
    number;

  readonly running:
    boolean;

  readonly startCount:
    number;

  readonly stopCount:
    number;

  readonly lastStartedAt:
    number | null;

  readonly lastStoppedAt:
    number | null;

  readonly processedSnapshots:
    number;

  readonly duplicateSnapshotsIgnored:
    number;

  readonly totalSignalsObserved:
    number;

  readonly currentSignalCount:
    number;

  readonly lastSnapshotGeneratedAt:
    number | null;

  readonly lastSnapshotReceivedAt:
    number | null;

  readonly lastSnapshotOpportunityCount:
    number | null;

  readonly lastSignalObservedAt:
    number | null;

  readonly lastError:
    string | null;

  readonly evidence: {
    readonly snapshot:
      StrategyEvidenceStatus;

    readonly signals:
      StrategyEvidenceStatus;

    readonly performance:
      StrategyEvidenceStatus;
  };

  readonly legacyHistoryAttribution:
    StrategyLegacyAttribution;

  readonly safety: {
    readonly readOnly:
      true;

    readonly signalExecutionAllowed:
      false;

    readonly intentExecutionAllowed:
      false;

    readonly automaticExecutionAllowed:
      false;
  };
}

export interface RegisteredStrategySnapshot {
  readonly metadata:
    StrategyMetadata;

  readonly runtime:
    StrategyRuntimeSnapshot;
}

export interface StrategyRegistrySnapshot {
  readonly generatedAt:
    number;

  readonly strategyCount:
    number;

  readonly strategies:
    readonly RegisteredStrategySnapshot[];
}
