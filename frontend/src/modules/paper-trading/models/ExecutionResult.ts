export type ExecutionLegSide =
  | "BUY"
  | "SELL";

export type ExecutionLegStatus =
  | "PENDING"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "FAILED"
  | "CANCELLED";

export type ExecutionResultStatus =
  | "COMPLETED"
  | "FAILED"
  | "PARTIALLY_COMPLETED";

export type TradingExecutionMode =
  | "PAPER"
  | "TESTNET"
  | "LIVE";

export interface ExecutionLegResult {
  exchange: string;

  market: string;

  side: ExecutionLegSide;

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

  mode: TradingExecutionMode;

  status: ExecutionResultStatus;

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