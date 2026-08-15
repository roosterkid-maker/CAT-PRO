import type {
  ExecutionReconciliationRecord,
} from "../../execution/live/reconciliation/ExecutionReconciliationRecord";

import type {
  ExecutionRecoveryEvaluation,
  ExecutionRecoveryStrategy,
} from "../../execution/live/recovery/ExecutionRecoveryRecord";

import type {
  ExecutionLegResult,
} from "./ExecutionResult";

export type PaperRecoveryActionStatus =
  | "EXECUTED"
  | "BLOCKED"
  | "FAILED";

export interface PaperRecoveryActionResult {
  status: PaperRecoveryActionStatus;

  actionId: string;

  sessionId: string;

  incidentId: string;

  sourceStrategy: ExecutionRecoveryStrategy;

  sourceExposureDirection:
    | "LONG"
    | "SHORT";

  sourceExposedQuantity: number;

  leg: {
    side:
      | "BUY"
      | "SELL";

    exchange: string;

    market: string;

    quantity: number;

    referencePrice: number;

    maximumQuantity: number;

    maximumQuoteValue: number;

    simulatedQuoteValue: number | null;
  };

  lifecycleOrderId: string | null;

  execution: ExecutionLegResult | null;

  reconciliation: ExecutionReconciliationRecord | null;

  postRecovery: ExecutionRecoveryEvaluation | null;

  incidentResolved: boolean;

  additionalCapitalReserved: false;

  liveOrderSubmissionAllowed: false;

  exchangeOrdersSubmitted: 0;

  reasons: string[];
}
