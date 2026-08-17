import {
  liveExecutionSessionEvidenceService,
} from "../coordinator/LiveExecutionSessionEvidenceService";

import {
  executionMetricsService,
} from "./ExecutionMetricsService";

import {
  executionMetricsSnapshotService,
} from "./ExecutionMetricsSnapshotService";

import {
  livePerformanceEvidencePersistenceService,
} from "./LivePerformanceEvidencePersistenceService";

const SNAPSHOT_INTERVAL_MS =
  5_000;

export class ExecutionMetricsSnapshotScheduler {
  private timer:
    NodeJS.Timeout | null =
    null;

  start():
    void {
    if (
      this.timer
    ) {
      return;
    }

    this.capture();

    this.timer =
      setInterval(
        () => {
          this.capture();
        },

        SNAPSHOT_INTERVAL_MS,
      );

    this.timer.unref();
  }

  stop():
    void {
    if (
      !this.timer
    ) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;
  }

  private capture():
    void {
    const report =
      executionMetricsService
        .getReport();

    executionMetricsSnapshotService
      .record(
        report,
      );

    /*
     * Version 17.6 / V18
     *
     * Existing restart-safe performance evidence.
     */
    livePerformanceEvidencePersistenceService
      .capture();

    /*
     * VERSION 18 BUILD 2
     *
     * Historical LIVE session evidence.
     *
     * This does NOT restore coordinator state
     * and does NOT submit orders.
     */
    liveExecutionSessionEvidenceService
      .capture();
  }
}

export const executionMetricsSnapshotScheduler =
  new ExecutionMetricsSnapshotScheduler();