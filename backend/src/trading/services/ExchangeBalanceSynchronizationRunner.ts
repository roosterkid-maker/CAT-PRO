import {
  exchangeBalanceSynchronizationService,
  type ExchangeBalanceSynchronizationReport,
} from "../account/ExchangeBalanceSynchronizationService";

export interface ExchangeBalanceSynchronizationRunnerConfig {
  synchronizationIntervalMs: number;

  synchronizeImmediately: boolean;
}

export interface ExchangeBalanceSynchronizationRunnerStatus {
  running: boolean;

  synchronizationInProgress: boolean;

  synchronizationIntervalMs: number;

  lastStartedAt: number | null;

  lastCompletedAt: number | null;

  lastSuccessfulAt: number | null;

  lastFailedAt: number | null;

  lastReport:
    ExchangeBalanceSynchronizationReport | null;

  lastError: string | null;
}

const DEFAULT_CONFIG:
  ExchangeBalanceSynchronizationRunnerConfig = {
  synchronizationIntervalMs: 10_000,

  synchronizeImmediately: true,
};

export class ExchangeBalanceSynchronizationRunner {
  private readonly config:
    ExchangeBalanceSynchronizationRunnerConfig;

  private timer:
    NodeJS.Timeout | null = null;

  private running =
    false;

  private synchronizationInProgress =
    false;

  private lastStartedAt:
    number | null = null;

  private lastCompletedAt:
    number | null = null;

  private lastSuccessfulAt:
    number | null = null;

  private lastFailedAt:
    number | null = null;

  private lastReport:
    ExchangeBalanceSynchronizationReport | null =
    null;

  private lastError:
    string | null = null;

  constructor(
    config:
      Partial<ExchangeBalanceSynchronizationRunnerConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig(
      this.config,
    );
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running =
      true;

    console.log(
      `[ExchangeBalanceSynchronizationRunner] Started with interval ${this.config.synchronizationIntervalMs} ms.`,
    );

    if (
      this.config
        .synchronizeImmediately
    ) {
      void this.runSynchronization();
    }

    this.timer =
      setInterval(
        () => {
          void this.runSynchronization();
        },
        this.config
          .synchronizationIntervalMs,
      );

    this.timer.unref();
  }

  stop(): void {
    if (
      this.timer !==
      null
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }

    if (!this.running) {
      return;
    }

    this.running =
      false;

    console.log(
      "[ExchangeBalanceSynchronizationRunner] Stopped.",
    );
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus():
    ExchangeBalanceSynchronizationRunnerStatus {
    return {
      running:
        this.running,

      synchronizationInProgress:
        this.synchronizationInProgress,

      synchronizationIntervalMs:
        this.config
          .synchronizationIntervalMs,

      lastStartedAt:
        this.lastStartedAt,

      lastCompletedAt:
        this.lastCompletedAt,

      lastSuccessfulAt:
        this.lastSuccessfulAt,

      lastFailedAt:
        this.lastFailedAt,

      lastReport:
        this.lastReport
          ? structuredClone(
              this.lastReport,
            )
          : null,

      lastError:
        this.lastError,
    };
  }

  async synchronizeNow():
    Promise<ExchangeBalanceSynchronizationReport | null> {
    return this.runSynchronization();
  }

  private async runSynchronization():
    Promise<ExchangeBalanceSynchronizationReport | null> {
    if (!this.running) {
      return null;
    }

    if (
      this.synchronizationInProgress ||
      exchangeBalanceSynchronizationService
        .isSynchronizationInProgress()
    ) {
      console.warn(
        "[ExchangeBalanceSynchronizationRunner] Synchronization skipped because a previous cycle is still running.",
      );

      return null;
    }

    this.synchronizationInProgress =
      true;

    this.lastStartedAt =
      Date.now();

    try {
      const report =
        await exchangeBalanceSynchronizationService
          .synchronizeAll();

      this.lastReport =
        structuredClone(
          report,
        );

      this.lastCompletedAt =
        report.completedAt;

      const hasFailure =
        report.failedExchanges >
        0;

      if (hasFailure) {
        this.lastFailedAt =
          report.completedAt;

        this.lastError =
          this.buildFailureMessage(
            report,
          );

        console.error(
          "[ExchangeBalanceSynchronizationRunner] Synchronization completed with failures:",
          {
            successfulExchanges:
              report.successfulExchanges,

            failedExchanges:
              report.failedExchanges,

            skippedExchanges:
              report.skippedExchanges,

            totalSynchronizedBalances:
              report.totalSynchronizedBalances,

            error:
              this.lastError,
          },
        );
      } else {
        this.lastSuccessfulAt =
          report.completedAt;

        this.lastError =
          null;

        console.log(
          "[ExchangeBalanceSynchronizationRunner] Synchronization completed:",
          {
            successfulExchanges:
              report.successfulExchanges,

            skippedExchanges:
              report.skippedExchanges,

            totalSynchronizedBalances:
              report.totalSynchronizedBalances,

            durationMs:
              report.completedAt -
              report.startedAt,
          },
        );
      }

      return report;
    } catch (
      error: unknown
    ) {
      const failedAt =
        Date.now();

      this.lastCompletedAt =
        failedAt;

      this.lastFailedAt =
        failedAt;

      this.lastError =
        this.getErrorMessage(
          error,
        );

      console.error(
        "[ExchangeBalanceSynchronizationRunner] Synchronization cycle failed:",
        this.lastError,
      );

      return null;
    } finally {
      this.synchronizationInProgress =
        false;
    }
  }

  private buildFailureMessage(
    report:
      ExchangeBalanceSynchronizationReport,
  ): string {
    const failedReasons =
      report.results
        .filter(
          (result) =>
            result.status ===
            "FAILED",
        )
        .flatMap(
          (result) =>
            result.reasons.map(
              (reason) =>
                `${result.exchange}: ${reason}`,
            ),
        );

    if (
      failedReasons.length ===
      0
    ) {
      return (
        `${report.failedExchanges} exchange balance synchronization` +
        `${
          report.failedExchanges ===
          1
            ? ""
            : "s"
        } failed.`
      );
    }

    return failedReasons.join(
      " | ",
    );
  }

  private getErrorMessage(
    error: unknown,
  ): string {
    if (
      error instanceof Error &&
      error.message.trim()
    ) {
      return error.message;
    }

    return "Unknown exchange balance synchronization error.";
  }

  private validateConfig(
    config:
      ExchangeBalanceSynchronizationRunnerConfig,
  ): void {
    if (
      !Number.isSafeInteger(
        config.synchronizationIntervalMs,
      ) ||
      config.synchronizationIntervalMs <
        1_000
    ) {
      throw new Error(
        "Exchange balance synchronization interval must be an integer of at least 1000 ms.",
      );
    }

    if (
      typeof config.synchronizeImmediately !==
      "boolean"
    ) {
      throw new Error(
        "Exchange balance immediate synchronization configuration must be boolean.",
      );
    }
  }
}

export const exchangeBalanceSynchronizationRunner =
  new ExchangeBalanceSynchronizationRunner();