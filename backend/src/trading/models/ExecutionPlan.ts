export type OrderSide =
  | "BUY"
  | "SELL";

export type ExecutionMode =
  | "PAPER"
  | "TESTNET"
  | "LIVE";

export type ExecutionStrategy =
  | "PARALLEL"
  | "BUY_FIRST"
  | "SELL_FIRST";

export type ExecutionStatus =
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ExecutionLeg {
  exchange: string;

  market: string;

  side: OrderSide;

  quantity: number;

  limitPrice: number;
}

export interface ExecutionPlan {
  id: string;

  market: string;

  mode: ExecutionMode;

  strategy: ExecutionStrategy;

  status: ExecutionStatus;

  capital: number;

  expectedProfit: number;

  expectedProfitPercent: number;

  maximumSlippagePercent: number;

  timeoutMs: number;

  buy: ExecutionLeg;

  sell: ExecutionLeg;

  createdAt: number;
}