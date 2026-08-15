import type {
  ExecutionReconciliationRecord,
} from "../../execution/live/reconciliation/ExecutionReconciliationRecord";

import type {
  ExecutionRecoveryEvaluation,
} from "../../execution/live/recovery/ExecutionRecoveryRecord";

import type {
  ExecutionAuditRecord,
  ExecutionSettlementRecord,
} from "../../execution/live/settlement/ExecutionSettlementRecord";

import type {
  ExecutionResult,
} from "./ExecutionResult";

import type {
  PaperRecoveryActionResult,
} from "./PaperRecoveryAction";

export type PaperTwoLegExecutionLifecycleStatus =
  | "COMPLETED"
  | "RECOVERY_REQUIRED"
  | "FAILED";

export interface PaperTwoLegExecutionLifecycleResult {
  status: PaperTwoLegExecutionLifecycleStatus;

  sessionId: string;

  result: ExecutionResult;

  recovery: ExecutionRecoveryEvaluation;

  initialRecovery: ExecutionRecoveryEvaluation;

  recoveryAction: PaperRecoveryActionResult | null;

  reconciliation: {
    buy: ExecutionReconciliationRecord;
    sell: ExecutionReconciliationRecord;
  };

  settlement: ExecutionSettlementRecord;

  audit: ExecutionAuditRecord;

  capitalReservationFinalized: boolean;

  routeLockReleased: boolean;

  automaticRecoveryOrderSubmitted: false;

  automaticPaperRecoveryExecuted: boolean;

  liveOrderSubmissionAllowed: false;

  exchangeOrdersSubmitted: 0;

  reasons: string[];
}
