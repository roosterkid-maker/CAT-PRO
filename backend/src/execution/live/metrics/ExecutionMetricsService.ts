import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

import type {
  ExchangeExecutionMetrics,
  ExecutionMetricsReport,
} from "./ExecutionMetrics";

interface MutableExchangeMetrics {
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

  fastestExecutionTimeMs:
    | number
    | null;

  slowestExecutionTimeMs:
    | number
    | null;

  lastExecutionAt:
    | number
    | null;
}

export class ExecutionMetricsService {
  private readonly metricsByExchange =
    new Map<
      string,
      MutableExchangeMetrics
    >();

  record(
    result: LiveExecutionResult,
  ): void {
    const exchange =
      this.normalizeExchange(
        result.exchange,
      );

    const metrics =
      this.getOrCreateMetrics(
        exchange,
      );

    metrics.totalExecutions += 1;

    metrics.totalRequestedQuantity +=
      this.toNonNegativeNumber(
        result.requestedQuantity,
      );

    metrics.totalFilledQuantity +=
      this.toNonNegativeNumber(
        result.filledQuantity,
      );

    const executionTimeMs =
      this.toNonNegativeNumber(
        result.executionTimeMs,
      );

    metrics.totalExecutionTimeMs +=
      executionTimeMs;

    metrics.fastestExecutionTimeMs =
      metrics.fastestExecutionTimeMs ===
      null
        ? executionTimeMs
        : Math.min(
            metrics.fastestExecutionTimeMs,
            executionTimeMs,
          );

    metrics.slowestExecutionTimeMs =
      metrics.slowestExecutionTimeMs ===
      null
        ? executionTimeMs
        : Math.max(
            metrics.slowestExecutionTimeMs,
            executionTimeMs,
          );

    metrics.lastExecutionAt =
      Number.isFinite(
        result.completedAt,
      )
        ? result.completedAt
        : Date.now();

    switch (result.status) {
      case "FILLED":
        metrics.filledExecutions += 1;
        break;

      case "CANCELLED":
        metrics.cancelledExecutions += 1;
        break;

      case "TIMED_OUT":
        metrics.timedOutExecutions += 1;
        break;

      case "REJECTED":
        metrics.rejectedExecutions += 1;
        break;

      case "PARTIALLY_FILLED":
        metrics.partialFillExecutions += 1;
        break;

      case "FAILED":
        metrics.failedExecutions += 1;
        break;

      default:
        break;
    }

    /*
     * Timed-out orders can eventually return CANCELLED.
     * Track timeout independently from terminal status.
     */
    if (
      result.timedOut &&
      result.status !==
        "TIMED_OUT"
    ) {
      metrics.timedOutExecutions += 1;
    }

    if (
      result.filledQuantity > 0 &&
      result.remainingQuantity > 0 &&
      result.status !==
        "PARTIALLY_FILLED"
    ) {
      metrics.partialFillExecutions += 1;
    }
  }

  getReport():
  ExecutionMetricsReport {
    const exchanges =
      [...this.metricsByExchange.values()]
        .map((metrics) =>
          this.toReadonlyMetrics(
            metrics,
          ),
        )
        .sort(
          (first, second) =>
            first.exchange.localeCompare(
              second.exchange,
            ),
        );

    return {
      timestamp:
        Date.now(),

      totalExecutions:
        exchanges.reduce(
          (
            total,
            exchange,
          ) =>
            total +
            exchange.totalExecutions,
          0,
        ),

      exchanges,
    };
  }

  getExchangeMetrics(
    exchange: string,
  ): ExchangeExecutionMetrics | null {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    const metrics =
      this.metricsByExchange.get(
        normalizedExchange,
      );

    return metrics
      ? this.toReadonlyMetrics(
          metrics,
        )
      : null;
  }

  reset(): void {
    this.metricsByExchange.clear();
  }

  private getOrCreateMetrics(
    exchange: string,
  ): MutableExchangeMetrics {
    const existing =
      this.metricsByExchange.get(
        exchange,
      );

    if (existing) {
      return existing;
    }

    const created:
      MutableExchangeMetrics = {
      exchange,

      totalExecutions: 0,

      filledExecutions: 0,

      cancelledExecutions: 0,

      timedOutExecutions: 0,

      rejectedExecutions: 0,

      failedExecutions: 0,

      partialFillExecutions: 0,

      totalRequestedQuantity: 0,

      totalFilledQuantity: 0,

      totalExecutionTimeMs: 0,

      fastestExecutionTimeMs:
        null,

      slowestExecutionTimeMs:
        null,

      lastExecutionAt:
        null,
    };

    this.metricsByExchange.set(
      exchange,
      created,
    );

    return created;
  }

  private toReadonlyMetrics(
    metrics:
      MutableExchangeMetrics,
  ): ExchangeExecutionMetrics {
    const totalExecutions =
      metrics.totalExecutions;

    return {
      exchange:
        metrics.exchange,

      totalExecutions,

      filledExecutions:
        metrics.filledExecutions,

      cancelledExecutions:
        metrics.cancelledExecutions,

      timedOutExecutions:
        metrics.timedOutExecutions,

      rejectedExecutions:
        metrics.rejectedExecutions,

      failedExecutions:
        metrics.failedExecutions,

      partialFillExecutions:
        metrics.partialFillExecutions,

      totalRequestedQuantity:
        metrics.totalRequestedQuantity,

      totalFilledQuantity:
        metrics.totalFilledQuantity,

      totalExecutionTimeMs:
        metrics.totalExecutionTimeMs,

      averageExecutionTimeMs:
        totalExecutions > 0
          ? metrics.totalExecutionTimeMs /
            totalExecutions
          : 0,

      fastestExecutionTimeMs:
        metrics.fastestExecutionTimeMs,

      slowestExecutionTimeMs:
        metrics.slowestExecutionTimeMs,

      fillRatePercent:
        this.calculatePercent(
          metrics.filledExecutions,
          totalExecutions,
        ),

      cancellationRatePercent:
        this.calculatePercent(
          metrics.cancelledExecutions,
          totalExecutions,
        ),

      timeoutRatePercent:
        this.calculatePercent(
          metrics.timedOutExecutions,
          totalExecutions,
        ),

      failureRatePercent:
        this.calculatePercent(
          metrics.failedExecutions +
            metrics.rejectedExecutions,
          totalExecutions,
        ),

      lastExecutionAt:
        metrics.lastExecutionAt,
    };
  }

  private calculatePercent(
    value: number,
    total: number,
  ): number {
    if (total <= 0) {
      return 0;
    }

    return Number(
      (
        value /
        total *
        100
      ).toFixed(4),
    );
  }

  private normalizeExchange(
    exchange: string,
  ): string {
    const normalized =
      exchange
        .trim()
        .toLowerCase();

    if (!normalized) {
      throw new Error(
        "Execution metrics exchange is required.",
      );
    }

    return normalized;
  }

  private toNonNegativeNumber(
    value: number,
  ): number {
    return (
      Number.isFinite(value) &&
      value >= 0
    )
      ? value
      : 0;
  }
}

export const executionMetricsService =
  new ExecutionMetricsService();