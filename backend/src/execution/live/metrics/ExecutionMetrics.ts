export interface ExchangeExecutionMetrics {
  exchange: string;

  totalExecutions: number;

  filledExecutions: number;

  cancelledExecutions: number;

  timedOutExecutions: number;

  rejectedExecutions: number;

  failedExecutions: number;

  partialFillExecutions: number;

  totalRequestedQuantity: number;

  totalFilledQuantity: number;

  totalExecutionTimeMs: number;

  averageExecutionTimeMs: number;

  fastestExecutionTimeMs: number | null;

  slowestExecutionTimeMs: number | null;

  fillRatePercent: number;

  cancellationRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;

  lastExecutionAt: number | null;
}

export interface ExecutionMetricsReport {
  timestamp: number;

  totalExecutions: number;

  exchanges:
    ExchangeExecutionMetrics[];
}