import type {
  LiveExecutionResult,
} from "../../../execution/live/models/LiveExecutionResult";

import type {
  SharedRecoveryIntent,
} from "../../../recovery/models/SharedRecoveryIntent";

import type {
  StrategyOneOrderTimeSafetyReport,
} from "../StrategyOneOrderTimeSafetyService";

export type ArbitrageLiveExecutionStatus =
  | "BLOCKED"
  | "EXECUTING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "RECOVERY_REQUIRED"
  | "POSSIBLE_EXPOSURE"
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

  /** Stable journal-first identity for the paired LIVE attempt. */
  twoLegSessionId?:
    | string
    | null;

  matchedFilledQuantity: number;

  unmatchedBuyQuantity: number;

  unmatchedSellQuantity: number;

  startedAt: number;

  completedAt: number;

  executionTimeMs: number;

  /** Code-side invocation skew; it is not a claim about exchange arrival. */
  dispatchSkewMs?:
    | number
    | null;

  lastLook?:
    | StrategyOneOrderTimeSafetyReport
    | null;

  recoveryRequired: boolean;

  /** Unknown exchange outcome is never treated as zero fill or retried. */
  possibleExposure?: boolean;

  /** Immutable evidence only; never authorizes an automatic recovery order. */
  recoveryIntent?:
    | SharedRecoveryIntent
    | null;

  reasons: string[];
}
