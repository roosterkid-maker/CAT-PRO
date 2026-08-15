import type {
  LiveExecutionStatus,
} from "../models/LiveExecutionResult";

export interface FillSlice {
  id: string;

  sequence: number;

  orderLifecycleId: string;

  exchangeOrderId:
    | string
    | null;

  quantity: number;

  price: number;

  notional: number;

  feeAmount: number;

  cumulativeQuantity: number;

  cumulativeAveragePrice: number;

  cumulativeFeeAmount: number;

  observedAt: number;
}

export interface OrderFillSummary {
  orderLifecycleId: string;

  sessionId: string;

  leg:
    | "BUY"
    | "SELL";

  exchange: string;

  market: string;

  side:
    | "buy"
    | "sell";

  requestedQuantity: number;

  filledQuantity: number;

  remainingQuantity: number;

  fillPercent: number;

  requestedPrice:
    | number
    | null;

  averageFillPrice: number;

  grossNotional: number;

  feeAmount: number;

  slippagePercent:
    | number
    | null;

  /*
   * Positive number means execution moved
   * against us.
   *
   * Negative/favourable slippage becomes zero
   * in this field.
   */
  adverseSlippagePercent:
    | number
    | null;

  executionTimeMs: number;

  qualityScore: number;

  complete: boolean;

  lastStatus:
    LiveExecutionStatus;

  updatedAt: number;

  fills: FillSlice[];
}

export interface FillEngineDiagnostics {
  generatedAt: number;

  trackedOrders: number;

  totalFillEvents: number;

  fullyFilledOrders: number;

  partiallyFilledOrders: number;

  totalFilledQuantity: number;

  totalFees: number;

  averageFillPercent: number;

  averageQualityScore: number;

  orders: OrderFillSummary[];
}

export interface FillQualityPreviewRequest {
  side:
    | "buy"
    | "sell";

  requestedQuantity: number;

  filledQuantity: number;

  requestedPrice:
    | number
    | null;

  averageFillPrice: number;

  feeAmount: number;

  executionTimeMs: number;
}

export interface FillQualityPreview {
  fillPercent: number;

  remainingQuantity: number;

  grossNotional: number;

  feeAmount: number;

  slippagePercent:
    | number
    | null;

  adverseSlippagePercent:
    | number
    | null;

  qualityScore: number;
}