import type {
  ExecutionMode,
  ExecutionStatus,
  OrderSide,
} from "./ExecutionPlan";

export type ExecutionLegStatus =
  | "PENDING"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "FAILED"
  | "CANCELLED";

export interface ExecutionLegResult {
  exchange: string;

  market: string;

  side: OrderSide;

  requestedQuantity: number;

  filledQuantity: number;

  requestedPrice: number;

  averageFillPrice: number;

  status: ExecutionLegStatus;

  orderId: string | null;

  error: string | null;

  startedAt: number;

  completedAt: number | null;
}

export interface ExecutionResult {
  planId: string;

  market: string;

  mode: ExecutionMode;

  status: ExecutionStatus;

  buy: ExecutionLegResult;

  sell: ExecutionLegResult;

  capitalUsed: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  netProfitPercent: number;

  startedAt: number;

  completedAt: number | null;

  successful: boolean;

  failureReason: string | null;
}