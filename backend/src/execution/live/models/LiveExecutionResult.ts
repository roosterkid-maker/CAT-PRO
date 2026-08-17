export type LiveExecutionStatus =
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "TIMED_OUT"
  | "FAILED";

export interface LiveExecutionResult {
  success: boolean;

  exchange: string;

  product?: "SPOT" | "PERPETUAL";

  reduceOnly?: boolean;

  positionMode?: "ONE_WAY" | "HEDGE";

  positionSide?: "LONG" | "SHORT";

  market: string;

  side:
    | "buy"
    | "sell";

  orderId: string | null;

  clientOrderId: string | null;

  status: LiveExecutionStatus;

  requestedQuantity: number;

  filledQuantity: number;

  remainingQuantity: number;

  requestedPrice: number | null;

  averageFillPrice: number;

  feeAmount: number;

  cancelled: boolean;

  timedOut: boolean;

  startedAt: number;

  completedAt: number;

  executionTimeMs: number;

  failureReason: string | null;

  reasons: string[];
}
