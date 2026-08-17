import type {
  ExecutionResult,
} from "./ExecutionResult";

export type PaperExecutionJournalState =
  | "SETTLED_PENDING_ACCOUNTING"
  | "ACCOUNTED"
  | "FAILED_NOT_ACCOUNTED";

export interface PaperExecutionLineage {
  sessionId: string;

  settlementId: string;

  settlementStatus:
    | "SETTLED"
    | "BLOCKED"
    | "FAILED"
    | "READY";

  buyReconciliationId: string;

  sellReconciliationId: string;

  initialRecoveryIncidentId:
    string | null;

  initialRecoveryStrategy: string;

  initialExposureDirection: string;

  initialExposedQuantity: number;

  recoveryActionId:
    string | null;

  recoveryActionStatus:
    string | null;

  recoveryIncidentResolved: boolean;

  finalRecoveryRequired: boolean;

  automaticPaperRecoveryExecuted: boolean;

  liveOrderSubmissionAllowed: false;

  exchangeOrdersSubmitted: 0;
}

export interface PaperExecutionJournalRecord {
  schemaVersion: 1;

  capturedAt: number;

  planId: string;

  accountingTransactionId: string;

  state: PaperExecutionJournalState;

  result: ExecutionResult;

  lineage: PaperExecutionLineage;

  paperTradeId:
    string | null;

  inventoryCheckpointId:
    string | null;

  accountingAppliedAt:
    number | null;

  reasons: string[];
}

export interface PaperExecutionJournalDiagnostics {
  persistenceFilePath: string;

  restored: boolean;

  restoredAt: number | null;

  executions: number;

  pendingAccounting: number;

  accounted: number;

  failedNotAccounted: number;

  pendingPlanIds: string[];

  writes: number;

  writeFailures: number;

  malformedRecordsIgnored: number;

  lastError: string | null;

  liveOrderSubmissionAllowed: false;
}

export interface PaperVenueInventoryDelta {
  sourceLeg:
    | "BUY"
    | "SELL";

  exchange: string;

  market: string;

  quantityDelta: number;
}

export interface PaperVenueInventoryCheckpoint {
  schemaVersion: 1;

  checkpointId: string;

  planId: string;

  accountingTransactionId: string;

  capturedAt: number;

  deltas: PaperVenueInventoryDelta[];
}

export interface PaperVenueInventoryPosition {
  exchange: string;

  market: string;

  quantity: number;
}

export interface PaperVenueInventoryDiagnostics {
  persistenceFilePath: string;

  restored: boolean;

  restoredAt: number | null;

  checkpoints: number;

  positions: PaperVenueInventoryPosition[];

  writes: number;

  writeFailures: number;

  malformedRecordsIgnored: number;

  lastError: string | null;

  liveInventoryMutationAllowed: false;
}
