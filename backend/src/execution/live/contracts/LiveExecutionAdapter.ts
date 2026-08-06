import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

export interface LiveExecutionAdapter {
  readonly exchange: string;

  execute(
    request: LiveExecutionRequest,
  ): Promise<LiveExecutionResult>;

  getOrderStatus(
    orderId: string,
  ): Promise<LiveExecutionResult>;

  cancelOrder(
    orderId: string,
  ): Promise<LiveExecutionResult>;

  isConnected(): boolean;
}