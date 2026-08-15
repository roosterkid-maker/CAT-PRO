import type {
  ExchangeClockSafetyReport,
} from "./ExchangeClockSafety";

import {
  exchangeClockSafetyService,
} from "./ExchangeClockSafetyService";

export interface ExchangeClockSynchronizationSource {
  synchronizeAllSupported():
    Promise<ExchangeClockSafetyReport>;
}

export interface ExchangeClockSynchronizationRunnerConfig {
  refreshIntervalMs: number;

  maximumEvidenceAgeMs: number;

  synchronizeImmediately: boolean;
}

export interface ExchangeClockSynchronizationRunnerStatus {
  version: "95.0";

  running: boolean;

  synchronizationInProgress: boolean;

  refreshIntervalMs: number;

  maximumEvidenceAgeMs: number;

  refreshMarginMs: number;

  attempts: number;

  skippedOverlaps: number;

  lastStartedAt:
    number | null;

  lastCompletedAt:
    number | null;

  lastSuccessfulAt:
    number | null;

  lastFailedAt:
    number | null;

  lastAllServerClocksHealthy:
    boolean | null;

  lastError:
    string | null;
}

const DEFAULT_CONFIG:
  ExchangeClockSynchronizationRunnerConfig = {
  /*
   * Refresh well before the existing 60-second
   * signed-request evidence expiry. This keeps
   * scheduling jitter and slow balance reads away
   * from the safety boundary without widening it.
   */
  refreshIntervalMs:
    20_000,

  maximumEvidenceAgeMs:
    60_000,

  synchronizeImmediately:
    true,
};

export class ExchangeClockSynchronizationRunner {
  private readonly source:
    ExchangeClockSynchronizationSource;

  private readonly config:
    ExchangeClockSynchronizationRunnerConfig;

  private timer:
    NodeJS.Timeout | null =
    null;

  private running =
    false;

  private synchronizationInProgress =
    false;

  private attempts =
    0;

  private skippedOverlaps =
    0;

  private lastStartedAt:
    number | null =
    null;

  private lastCompletedAt:
    number | null =
    null;

  private lastSuccessfulAt:
    number | null =
    null;

  private lastFailedAt:
    number | null =
    null;

  private lastAllServerClocksHealthy:
    boolean | null =
    null;

  private lastError:
    string | null =
    null;

  constructor(
    source:
      ExchangeClockSynchronizationSource =
      exchangeClockSafetyService,

    config:
      Partial<ExchangeClockSynchronizationRunnerConfig> = {},
  ) {
    this.source =
      source;

    this.config = {
      ...DEFAULT_CONFIG,

      ...config,
    };

    this.validateConfig(
      this.config,
    );
  }

  async start():
    Promise<
      ExchangeClockSafetyReport |
      null
    > {
    if (
      this.running
    ) {
      return null;
    }

    this.running =
      true;

    const initialReport =
      this.config
        .synchronizeImmediately
        ? await this.synchronizeNow()
        : null;

    /*
     * stop() may be called while the initial
     * authoritative reads are still pending.
     * Never recreate the timer after shutdown.
     */
    if (
      !this.running
    ) {
      return initialReport;
    }

    this.timer =
      setInterval(
        () => {
          void this.synchronizeNow();
        },

        this.config
          .refreshIntervalMs,
      );

    this.timer.unref();

    return initialReport;
  }

  stop(): void {
    if (
      this.timer
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }

    this.running =
      false;
  }

  async synchronizeNow():
    Promise<
      ExchangeClockSafetyReport |
      null
    > {
    if (
      this.synchronizationInProgress
    ) {
      this.skippedOverlaps +=
        1;

      return null;
    }

    this.synchronizationInProgress =
      true;

    this.attempts +=
      1;

    this.lastStartedAt =
      Date.now();

    try {
      const report =
        await this.source
          .synchronizeAllSupported();

      const completedAt =
        Date.now();

      this.lastCompletedAt =
        completedAt;

      this.lastAllServerClocksHealthy =
        report
          .allServerSynchronizedClocksHealthy;

      if (
        report
          .allServerSynchronizedClocksHealthy
      ) {
        this.lastSuccessfulAt =
          completedAt;

        this.lastError =
          null;
      } else {
        this.lastFailedAt =
          completedAt;

        this.lastError =
          report.blockers.join(
            " | ",
          ) ||
          "One or more server clocks remain unsafe.";
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

      this.lastAllServerClocksHealthy =
        false;

      this.lastError =
        error instanceof Error &&
        error.message.trim()
          ? error.message
          : "Authoritative exchange clock synchronization failed.";

      return null;
    } finally {
      this.synchronizationInProgress =
        false;
    }
  }

  getStatus():
    ExchangeClockSynchronizationRunnerStatus {
    return {
      version:
        "95.0",

      running:
        this.running,

      synchronizationInProgress:
        this.synchronizationInProgress,

      refreshIntervalMs:
        this.config
          .refreshIntervalMs,

      maximumEvidenceAgeMs:
        this.config
          .maximumEvidenceAgeMs,

      refreshMarginMs:
        this.config
          .maximumEvidenceAgeMs -
        this.config
          .refreshIntervalMs,

      attempts:
        this.attempts,

      skippedOverlaps:
        this.skippedOverlaps,

      lastStartedAt:
        this.lastStartedAt,

      lastCompletedAt:
        this.lastCompletedAt,

      lastSuccessfulAt:
        this.lastSuccessfulAt,

      lastFailedAt:
        this.lastFailedAt,

      lastAllServerClocksHealthy:
        this.lastAllServerClocksHealthy,

      lastError:
        this.lastError,
    };
  }

  private validateConfig(
    config:
      ExchangeClockSynchronizationRunnerConfig,
  ): void {
    if (
      !Number.isSafeInteger(
        config.refreshIntervalMs,
      ) ||
      config.refreshIntervalMs <
        1_000
    ) {
      throw new Error(
        "Clock refresh interval must be an integer of at least 1000 ms.",
      );
    }

    if (
      !Number.isSafeInteger(
        config.maximumEvidenceAgeMs,
      ) ||
      config.maximumEvidenceAgeMs <
        2_000
    ) {
      throw new Error(
        "Maximum clock evidence age must be an integer of at least 2000 ms.",
      );
    }

    if (
      config.refreshIntervalMs *
        2 >
      config.maximumEvidenceAgeMs
    ) {
      throw new Error(
        "Clock refresh interval must leave at least one full refresh interval before evidence expiry.",
      );
    }
  }
}

export const exchangeClockSynchronizationRunner =
  new ExchangeClockSynchronizationRunner();
