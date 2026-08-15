import type {
  ExecutionMetricsReport,
} from "./ExecutionMetrics";

export interface ExecutionMetricsSnapshot {
  timestamp: number;

  totalExecutions: number;

  averageExecutionTimeMs: number;

  fillRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;
}

const MAXIMUM_SNAPSHOTS =
  720;

export class ExecutionMetricsSnapshotService {
  private readonly snapshots:
    ExecutionMetricsSnapshot[] = [];

  record(
    report:
      ExecutionMetricsReport,
  ): ExecutionMetricsSnapshot {
    const totalExecutions =
      report.totalExecutions;

    const totalExecutionTimeMs =
      report.exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.totalExecutionTimeMs,
        0,
      );

    const filledExecutions =
      report.exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.filledExecutions,
        0,
      );

    const timedOutExecutions =
      report.exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.timedOutExecutions,
        0,
      );

    const failedExecutions =
      report.exchanges.reduce(
        (
          total,
          exchange,
        ) =>
          total +
          exchange.failedExecutions +
          exchange.rejectedExecutions,
        0,
      );

    const snapshot:
      ExecutionMetricsSnapshot = {
      timestamp:
        Date.now(),

      totalExecutions,

      averageExecutionTimeMs:
        totalExecutions > 0
          ? totalExecutionTimeMs /
            totalExecutions
          : 0,

      fillRatePercent:
        this.calculatePercent(
          filledExecutions,
          totalExecutions,
        ),

      timeoutRatePercent:
        this.calculatePercent(
          timedOutExecutions,
          totalExecutions,
        ),

      failureRatePercent:
        this.calculatePercent(
          failedExecutions,
          totalExecutions,
        ),
    };

    this.snapshots.push(
      snapshot,
    );

    if (
      this.snapshots.length >
      MAXIMUM_SNAPSHOTS
    ) {
      this.snapshots.splice(
        0,
        this.snapshots.length -
          MAXIMUM_SNAPSHOTS,
      );
    }

    return snapshot;
  }

  getRecent(
    limit = 60,
  ): ExecutionMetricsSnapshot[] {
    const normalizedLimit =
      Math.max(
        1,
        Math.min(
          Math.floor(limit),
          MAXIMUM_SNAPSHOTS,
        ),
      );

    return this.snapshots.slice(
      -normalizedLimit,
    );
  }

  reset(): void {
    this.snapshots.length =
      0;
  }

  private calculatePercent(
    value: number,
    total: number,
  ): number {
    if (
      total <= 0
    ) {
      return 0;
    }

    return Number(
      (
        value /
        total *
        100
      ).toFixed(
        4,
      ),
    );
  }
}

export const executionMetricsSnapshotService =
  new ExecutionMetricsSnapshotService();