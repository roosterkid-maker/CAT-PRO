import {
  opportunityService,
  type OpportunityPipelineDiagnostics,
} from "./OpportunityService";

import {
  marketCache,
  type MarketCacheExecutableUpdate,
} from "../../services/cache.service";

export interface OpportunityDiagnosticsRunnerConfig {
  intervalMs: number;

  runImmediately: boolean;

  eventDriven: boolean;

  minimumEventScanIntervalMs: number;
}

export interface OpportunityDiagnosticsRunnerStatus {
  running: boolean;

  evaluationInProgress: boolean;

  intervalMs: number;

  eventDriven: boolean;

  minimumEventScanIntervalMs: number;

  executableUpdatesReceived: number;

  eventTriggeredEvaluations: number;

  coalescedExecutableUpdates: number;

  singleVenueUpdatesSuppressed: number;

  lastTrigger:
    | "STARTUP"
    | "TIMER"
    | "MARKET_DATA"
    | "MANUAL"
    | null;

  lastExecutableUpdateAt:
    number | null;

  lastExecutableUpdateToScanStartMs:
    number | null;

  lastEventBatchFirstUpdateToScanStartMs:
    number | null;

  lastStartedAt:
    number | null;

  lastCompletedAt:
    number | null;

  lastSuccessfulAt:
    number | null;

  lastFailedAt:
    number | null;

  lastOpportunityCount:
    number | null;

  lastDiagnostics:
    OpportunityPipelineDiagnostics | null;

  latency: {
    eventLatestUpdateToDecisionMs:
      OpportunityLatencyDistribution;

    eventLatestUpdateToScanStartMs:
      OpportunityLatencyDistribution;

    eventBatchFirstUpdateToScanStartMs:
      OpportunityLatencyDistribution;

    endToEndEvaluationMs:
      OpportunityLatencyDistribution;
  };

  lastError:
    string | null;
}

export interface OpportunityLatencyDistribution {
  sampleCount: number;

  p50Ms:
    number | null;

  p95Ms:
    number | null;

  p99Ms:
    number | null;

  maxMs:
    number | null;
}

const DEFAULT_CONFIG:
  OpportunityDiagnosticsRunnerConfig = {
  intervalMs:
    5_000,

  runImmediately:
    true,

  eventDriven:
    true,

  minimumEventScanIntervalMs:
    10,
};

type OpportunityEvaluationTrigger =
  | "STARTUP"
  | "TIMER"
  | "MARKET_DATA"
  | "MANUAL";

export class OpportunityDiagnosticsRunner {
  private static readonly LATENCY_SAMPLE_CAPACITY =
    512;

  private readonly config:
    OpportunityDiagnosticsRunnerConfig;

  private timer:
    NodeJS.Timeout | null =
    null;

  private eventTimer:
    NodeJS.Timeout | null =
    null;

  private eventTimerDueAt:
    number | null =
    null;

  private eventMicrotaskPending =
    false;

  private unsubscribeFromExecutableUpdates:
    (() => void) | null =
    null;

  private running =
    false;

  private evaluationInProgress =
    false;

  private pendingEventEvaluation =
    false;

  private executableUpdatesReceived =
    0;

  private eventTriggeredEvaluations =
    0;

  private coalescedExecutableUpdates =
    0;

  private singleVenueUpdatesSuppressed =
    0;

  private lastTrigger:
    OpportunityEvaluationTrigger | null =
    null;

  private lastExecutableUpdateAt:
    number | null =
    null;

  private lastExecutableUpdateToScanStartMs:
    number | null =
    null;

  private pendingEventFirstReceivedAt:
    number | null =
    null;

  private lastEventBatchFirstUpdateToScanStartMs:
    number | null =
    null;

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

  private lastOpportunityCount:
    number | null =
    null;

  private lastError:
    string | null =
    null;

  private readonly eventLatestUpdateLatencySamples:
    number[] =
    [];

  private readonly eventLatestUpdateToDecisionLatencySamples:
    number[] =
    [];

  private readonly eventBatchFirstUpdateLatencySamples:
    number[] =
    [];

  private readonly evaluationDurationSamples:
    number[] =
    [];

  constructor(
    config:
      Partial<OpportunityDiagnosticsRunnerConfig> = {},
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
      `[OpportunityDiagnosticsRunner] Started with ${this.config.intervalMs} ms safety interval and ${this.config.minimumEventScanIntervalMs} ms minimum event scan interval.`,
    );

    if (
      this.config
        .eventDriven
    ) {
      this.unsubscribeFromExecutableUpdates =
        marketCache
          .subscribeToExecutableUpdates(
            (update) => {
              this.handleExecutableUpdate(
                update,
              );
            },
          );
    }

    if (
      this.config
        .runImmediately
    ) {
      void this.runEvaluation(
        "STARTUP",
      );
    }

    this.timer =
      setInterval(
        () => {
          void this.runEvaluation(
            "TIMER",
          );
        },
        this.config.intervalMs,
      );

    this.timer.unref();
  }

  stop(): void {
    if (
      this.eventTimer !==
      null
    ) {
      clearTimeout(
        this.eventTimer,
      );

      this.eventTimer =
        null;

      this.eventTimerDueAt =
        null;
    }

    this.eventMicrotaskPending =
      false;

    this.unsubscribeFromExecutableUpdates?.();

    this.unsubscribeFromExecutableUpdates =
      null;

    this.pendingEventEvaluation =
      false;

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
      "[OpportunityDiagnosticsRunner] Stopped.",
    );
  }

  isRunning():
    boolean {
    return this.running;
  }

  getStatus():
    OpportunityDiagnosticsRunnerStatus {
    return {
      running:
        this.running,

      evaluationInProgress:
        this.evaluationInProgress,

      intervalMs:
        this.config
          .intervalMs,

      eventDriven:
        this.config
          .eventDriven,

      minimumEventScanIntervalMs:
        this.config
          .minimumEventScanIntervalMs,

      executableUpdatesReceived:
        this.executableUpdatesReceived,

      eventTriggeredEvaluations:
        this.eventTriggeredEvaluations,

      coalescedExecutableUpdates:
        this.coalescedExecutableUpdates,

      singleVenueUpdatesSuppressed:
        this.singleVenueUpdatesSuppressed,

      lastTrigger:
        this.lastTrigger,

      lastExecutableUpdateAt:
        this.lastExecutableUpdateAt,

      lastExecutableUpdateToScanStartMs:
        this.lastExecutableUpdateToScanStartMs,

      lastEventBatchFirstUpdateToScanStartMs:
        this.lastEventBatchFirstUpdateToScanStartMs,

      lastStartedAt:
        this.lastStartedAt,

      lastCompletedAt:
        this.lastCompletedAt,

      lastSuccessfulAt:
        this.lastSuccessfulAt,

      lastFailedAt:
        this.lastFailedAt,

      lastOpportunityCount:
        this.lastOpportunityCount,

      lastDiagnostics:
        opportunityService
          .getLastDiagnostics(),

      latency: {
        eventLatestUpdateToDecisionMs:
          this.summarizeLatency(
            this.eventLatestUpdateToDecisionLatencySamples,
          ),

        eventLatestUpdateToScanStartMs:
          this.summarizeLatency(
            this.eventLatestUpdateLatencySamples,
          ),

        eventBatchFirstUpdateToScanStartMs:
          this.summarizeLatency(
            this.eventBatchFirstUpdateLatencySamples,
          ),

        endToEndEvaluationMs:
          this.summarizeLatency(
            this.evaluationDurationSamples,
          ),
      },

      lastError:
        this.lastError,
    };
  }

  runNow():
    Promise<void> {
    return this.runEvaluation(
      "MANUAL",
    );
  }

  private handleExecutableUpdate(
    update:
      MarketCacheExecutableUpdate,
  ):
    void {
    if (
      !this.running
    ) {
      return;
    }

    this.executableUpdatesReceived +=
      1;

    if (
      !shouldScheduleOpportunityEvaluation(
        update,
        marketCache
          .getExecutableExchangeCountForMarket(
            update.market,
          ),
      )
    ) {
      this.singleVenueUpdatesSuppressed +=
        1;

      return;
    }

    const receivedAt =
      Date.now();

    this.lastExecutableUpdateAt =
      receivedAt;

    this.pendingEventFirstReceivedAt ??=
      receivedAt;

    if (
      this.evaluationInProgress
    ) {
      this.pendingEventEvaluation =
        true;

      this.coalescedExecutableUpdates +=
        1;

      return;
    }

    if (
      this.eventMicrotaskPending
    ) {
      this.coalescedExecutableUpdates +=
        1;

      return;
    }

    if (
      this.eventTimer !==
      null
    ) {
      if (
        this.eventTimerDueAt !==
          null &&
        receivedAt >=
          this.eventTimerDueAt
      ) {
        clearTimeout(
          this.eventTimer,
        );

        this.eventTimer =
          null;

        this.eventTimerDueAt =
          null;

        this.scheduleEventEvaluation();

        return;
      }

      this.coalescedExecutableUpdates +=
        1;

      return;
    }

    this.scheduleEventEvaluation();
  }

  private scheduleEventEvaluation():
    void {
    if (
      !this.running ||
      this.eventTimer !==
        null ||
      this.eventMicrotaskPending
    ) {
      return;
    }

    const now =
      Date.now();

    const earliestNextStartAt =
      this.lastStartedAt ===
        null
        ? now
        : this.lastStartedAt +
          this.config
            .minimumEventScanIntervalMs;

    const delayMs =
      Math.max(
        0,
        earliestNextStartAt -
          now,
      );

    if (
      delayMs ===
      0
    ) {
      this.eventMicrotaskPending =
        true;

      queueMicrotask(
        () => {
          this.eventMicrotaskPending =
            false;

          if (
            this.running
          ) {
            void this.runEvaluation(
              "MARKET_DATA",
            );
          }
        },
      );

      return;
    }

    this.eventTimerDueAt =
      now +
      delayMs;

    this.eventTimer =
      setTimeout(
        () => {
          this.eventTimer =
            null;

          this.eventTimerDueAt =
            null;

          void this.runEvaluation(
            "MARKET_DATA",
          );
        },
        delayMs,
      );

    this.eventTimer.unref();
  }

  private async runEvaluation(
    trigger:
      OpportunityEvaluationTrigger,
  ):
    Promise<void> {
    if (!this.running) {
      return;
    }

    if (
      this.evaluationInProgress
    ) {
      if (
        trigger ===
        "MARKET_DATA"
      ) {
        this.pendingEventEvaluation =
          true;
      }

      return;
    }

    this.evaluationInProgress =
      true;

    const startedAt =
      Date.now();

    const eventLatestUpdateAt =
      trigger ===
        "MARKET_DATA"
        ? this.lastExecutableUpdateAt
        : null;

    this.lastStartedAt =
      startedAt;

    this.lastTrigger =
      trigger;

    if (
      trigger ===
      "MARKET_DATA"
    ) {
      this.eventTriggeredEvaluations +=
        1;

      this.lastExecutableUpdateToScanStartMs =
        this.lastExecutableUpdateAt ===
          null
          ? null
          : Math.max(
              0,
              startedAt -
                this.lastExecutableUpdateAt,
            );

      this.lastEventBatchFirstUpdateToScanStartMs =
        this.pendingEventFirstReceivedAt ===
          null
          ? null
          : Math.max(
              0,
              startedAt -
              this.pendingEventFirstReceivedAt,
            );

      if (
        this.lastExecutableUpdateToScanStartMs !==
        null
      ) {
        this.recordLatencySample(
          this.eventLatestUpdateLatencySamples,
          this.lastExecutableUpdateToScanStartMs,
        );
      }

      if (
        this.lastEventBatchFirstUpdateToScanStartMs !==
        null
      ) {
        this.recordLatencySample(
          this.eventBatchFirstUpdateLatencySamples,
          this.lastEventBatchFirstUpdateToScanStartMs,
        );
      }

      this.pendingEventFirstReceivedAt =
        null;
    }

    try {
      const evaluationStartedAt =
        performance.now();

      const opportunityCount =
        opportunityService
          .refreshOpportunities();

      this.recordLatencySample(
        this.evaluationDurationSamples,
        performance.now() -
          evaluationStartedAt,
      );

      if (
        eventLatestUpdateAt !==
        null
      ) {
        this.recordLatencySample(
          this.eventLatestUpdateToDecisionLatencySamples,
          Math.max(
            0,
            Date.now() -
              eventLatestUpdateAt,
          ),
        );
      }

      const completedAt =
        Date.now();

      this.lastCompletedAt =
        completedAt;

      this.lastSuccessfulAt =
        completedAt;

      this.lastOpportunityCount =
        opportunityCount;

      this.lastError =
        null;
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
        "[OpportunityDiagnosticsRunner] Evaluation failed:",
        this.lastError,
      );
    } finally {
      this.evaluationInProgress =
        false;

      if (
        this.pendingEventEvaluation
      ) {
        this.pendingEventEvaluation =
          false;

        this.scheduleEventEvaluation();
      }
    }
  }

  private validateConfig(
    config:
      OpportunityDiagnosticsRunnerConfig,
  ): void {
    if (
      !Number.isSafeInteger(
        config.intervalMs,
      ) ||
      config.intervalMs <
        1_000
    ) {
      throw new Error(
        "Opportunity diagnostics interval must be an integer of at least 1000 ms.",
      );
    }

    if (
      typeof config.runImmediately !==
      "boolean"
    ) {
      throw new Error(
        "Opportunity diagnostics runImmediately configuration must be boolean.",
      );
    }

    if (
      typeof config.eventDriven !==
      "boolean"
    ) {
      throw new Error(
        "Opportunity diagnostics eventDriven configuration must be boolean.",
      );
    }

    if (
      !Number.isSafeInteger(
        config.minimumEventScanIntervalMs,
      ) ||
      config.minimumEventScanIntervalMs <
        10
    ) {
      throw new Error(
        "Opportunity diagnostics minimum event scan interval must be an integer of at least 10 ms.",
      );
    }
  }

  private recordLatencySample(
    samples:
      number[],

    value:
      number,
  ): void {
    if (
      !Number.isFinite(
        value,
      ) ||
      value <
        0
    ) {
      return;
    }

    samples.push(
      Number(
        value.toFixed(
          3,
        ),
      ),
    );

    const overflow =
      samples.length -
      OpportunityDiagnosticsRunner
        .LATENCY_SAMPLE_CAPACITY;

    if (
      overflow >
      0
    ) {
      samples.splice(
        0,
        overflow,
      );
    }
  }

  private summarizeLatency(
    samples:
      readonly number[],
  ): OpportunityLatencyDistribution {
    if (
      samples.length ===
      0
    ) {
      return {
        sampleCount:
          0,

        p50Ms:
          null,

        p95Ms:
          null,

        p99Ms:
          null,

        maxMs:
          null,
      };
    }

    const ordered =
      [...samples]
        .sort(
          (
            first,
            second,
          ) =>
            first -
            second,
        );

    return {
      sampleCount:
        ordered.length,

      p50Ms:
        this.percentile(
          ordered,
          0.5,
        ),

      p95Ms:
        this.percentile(
          ordered,
          0.95,
        ),

      p99Ms:
        this.percentile(
          ordered,
          0.99,
        ),

      maxMs:
        ordered[
          ordered.length -
            1
        ] ??
        null,
    };
  }

  private percentile(
    orderedSamples:
      readonly number[],

    quantile:
      number,
  ): number | null {
    if (
      orderedSamples.length ===
      0
    ) {
      return null;
    }

    const index =
      Math.min(
        orderedSamples.length -
          1,
        Math.max(
          0,
          Math.ceil(
            quantile *
              orderedSamples.length,
          ) -
            1,
        ),
      );

    return orderedSamples[
      index
    ] ??
    null;
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

    return "Unknown opportunity diagnostics evaluation error.";
  }
}

/**
 * V115 scanner admission rule. Destructive cache mutations must always wake
 * the scanner so an existing opportunity is removed. An UPSERT only needs a
 * scan once the authoritative cache contains at least two distinct venues for
 * that market; the second venue's own UPSERT is therefore never suppressed.
 */
export function shouldScheduleOpportunityEvaluation(
  update:
    MarketCacheExecutableUpdate,
  executableExchangeCount:
    number,
): boolean {
  if (
    update.kind !==
      "UPSERT"
  ) {
    return true;
  }

  return (
    Number.isSafeInteger(
      executableExchangeCount,
    ) &&
    executableExchangeCount >=
      2
  );
}

export const opportunityDiagnosticsRunner =
  new OpportunityDiagnosticsRunner({
    /*
     * Strategy #1 is a short-lived cross-venue signal. Keep its production
     * observation cadence explicit and bounded without weakening freshness,
     * persistence, liquidity, fee, or profitability qualification gates.
     */
    intervalMs:
      resolveStrategyOneScanIntervalMs(
        process.env
          .CAT_PRO_STRATEGY_ONE_SCAN_INTERVAL_MS,
      ),

    minimumEventScanIntervalMs:
      resolveStrategyOneMinimumEventScanIntervalMs(
        process.env
          .CAT_PRO_STRATEGY_ONE_MIN_EVENT_SCAN_INTERVAL_MS,
      ),
  });

function resolveStrategyOneScanIntervalMs(
  rawValue:
    string | undefined,
): number {
  const parsed =
    rawValue ===
      undefined
      ? Number.NaN
      : Number(
          rawValue,
        );

  if (
    !Number.isSafeInteger(
      parsed,
    )
  ) {
    return DEFAULT_CONFIG
      .intervalMs;
  }

  return Math.min(
    DEFAULT_CONFIG
      .intervalMs,
    Math.max(
      1_000,
      parsed,
    ),
  );
}

function resolveStrategyOneMinimumEventScanIntervalMs(
  rawValue:
    string | undefined,
): number {
  const parsed =
    rawValue ===
      undefined
      ? Number.NaN
      : Number(
          rawValue,
        );

  if (
    !Number.isSafeInteger(
      parsed,
    )
  ) {
    return DEFAULT_CONFIG
      .minimumEventScanIntervalMs;
  }

  return Math.min(
    1_000,
    Math.max(
      10,
      parsed,
    ),
  );
}
