import type {
  LiveExecutionResult,
} from "../../../execution/live/models/LiveExecutionResult";

export type ArbitrageLiveExecutionStatus =
  | "BLOCKED"
  | "EXECUTING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "RECOVERY_REQUIRED"
  | "FAILED";

export interface ArbitrageLiveExecutionResult {
  success: boolean;

  status:
    ArbitrageLiveExecutionStatus;

  opportunityId: string;

  market: string;

  requestedQuantity: number;

  buyExchange: string;

  sellExchange: string;

  buyResult:
    | LiveExecutionResult
    | null;

  sellResult:
    | LiveExecutionResult
    | null;

  matchedFilledQuantity: number;

  unmatchedBuyQuantity: number;

  unmatchedSellQuantity: number;

  startedAt: number;

  completedAt: number;

  executionTimeMs: number;

  recoveryRequired: boolean;

  reasons: string[];
}