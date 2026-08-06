export type LiveOrderSide =
  | "buy"
  | "sell";

export type LiveOrderType =
  | "limit"
  | "market";

export interface LiveExecutionRequest {
  exchange: string;

  market: string;

  side: LiveOrderSide;

  orderType: LiveOrderType;

  quantity: number;

  price?: number;

  clientOrderId?: string;

  timeoutMs?: number;

  pollingIntervalMs?: number;

  cancelOnTimeout?: boolean;
}