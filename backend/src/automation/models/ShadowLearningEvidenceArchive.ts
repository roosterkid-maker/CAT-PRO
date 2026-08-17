import type {
  ExecutionCandidateQueueItem,
} from "./ExecutionCandidateQueue";

import type {
  ShadowDispatchRecord,
} from "./ShadowExecutionDispatcher";

import type {
  ShadowTradeOutcomeRecord,
} from "./ShadowTradeOutcome";

export interface ShadowLearningEvidenceArchivePersistence {
  enabled: true;

  format: "JSONL_SNAPSHOT";

  restoreStatus:
    | "AVAILABLE"
    | "NO_DATA"
    | "FAILED";

  restoreMode:
    | "CHECKPOINT_BOUNDED"
    | "LEGACY_BASELINE_SCAN"
    | "NONE";

  filePath: string;

  checkpointFilePath: string;

  checkpointMatched: boolean;

  restored: boolean;

  restoredAt: number | null;

  archivesConsidered: number;

  archivesOpened: number;

  restoreBytesRead: number;

  restoreRecordsExamined: number;

  restoreMalformedRecordsIgnored: number;

  restoreOversizedRecordsIgnored: number;

  restoreDurationMs: number;

  selectedAuthoritativeSource: string | null;

  rotation: {
    enabled: boolean;

    maximumFileBytes: number;

    maximumRecords: number;

    existingOversizedFileProtected: boolean;

    rotations: number;

    lastArchiveCreated: string | null;
  };

  writes: number;

  writeFailures: number;

  lastPersistedAt: number | null;

  lastError: string | null;
}

export interface ShadowLearningEvidenceArchiveDiagnostics {
  generatedAt: number;

  version: "17.4";

  build: "9";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  paperExecutionAllowed: false;

  liveExecutionAllowed: false;

  operationalStateRestored: false;

  startedAt: number;

  captureCount: number;

  lastCapturedAt: number | null;

  lastCapturedSnapshotGeneratedAt: number | null;

  persistence:
    ShadowLearningEvidenceArchivePersistence;

  summary: {
    queueItemsArchived: number;

    readyQueueItemsArchived: number;

    consumedQueueItemsArchived: number;

    removedQueueItemsArchived: number;

    cancelledQueueItemsArchived: number;

    expiredQueueItemsArchived: number;

    dispatchRecordsArchived: number;

    shadowDispatchedArchived: number;

    revalidationFailedArchived: number;

    duplicateSuppressedArchived: number;

    outcomeRecordsArchived: number;

    trackingOutcomesArchived: number;

    successfulOutcomesArchived: number;

    failedOutcomesArchived: number;

    dataUnavailableOutcomesArchived: number;
  };

  queueItems:
    ExecutionCandidateQueueItem[];

  dispatchRecords:
    ShadowDispatchRecord[];

  outcomeRecords:
    ShadowTradeOutcomeRecord[];

  observations:
    string[];
}
