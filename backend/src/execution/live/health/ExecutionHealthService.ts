import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  executionMetricsService,
} from "../metrics/ExecutionMetricsService";

import type {
  ExchangeExecutionMetrics,
} from "../metrics/ExecutionMetrics";

import type {
  LiveExecutionAdapterVerificationMethod,
  LiveExecutionAdapterVerificationState,
} from "../contracts/LiveExecutionAdapter";

export type ExecutionHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "NO_DATA";

export interface ExchangeExecutionHealth {
  exchange: string;

  adapterRegistered: boolean;

  credentialsConfigured: boolean;

  authenticationVerified: boolean;

  exchangeApiReachable: boolean;

  verificationState:
    LiveExecutionAdapterVerificationState;

  readOnlyVerificationFresh:
    boolean;

  lastVerifiedAt:
    | number
    | null;

  lastVerificationAttemptAt:
    | number
    | null;

  verificationExpiresAt:
    | number
    | null;

  verificationMethod:
    | LiveExecutionAdapterVerificationMethod
    | null;

  lastVerificationError:
    | string
    | null;

  liveExecutionEnabled:
    boolean;

  adapterConnected: boolean;

  executionEvidenceAvailable:
    boolean;

  status: ExecutionHealthStatus;

  totalExecutions: number;

  fillRatePercent: number;

  cancellationRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;

  averageExecutionTimeMs: number;

  lastExecutionAt: number | null;

  reasons: string[];
}

export interface ExecutionHealthReport {
  timestamp: number;

  status: ExecutionHealthStatus;

  totalExecutions: number;

  healthyExchanges: number;

  degradedExchanges: number;

  unhealthyExchanges: number;

  exchanges:
    ExchangeExecutionHealth[];

  reasons: string[];
}

export interface ExecutionHealthThresholds {
  maximumFailureRatePercent: number;

  maximumTimeoutRatePercent: number;

  maximumAverageExecutionTimeMs: number;

  minimumFillRatePercent: number;

  minimumExecutionsForRateChecks: number;
}

const DEFAULT_THRESHOLDS:
  ExecutionHealthThresholds = {
  maximumFailureRatePercent:
    10,

  maximumTimeoutRatePercent:
    10,

  maximumAverageExecutionTimeMs:
    15_000,

  minimumFillRatePercent:
    50,

  minimumExecutionsForRateChecks:
    5,
};

export class ExecutionHealthService {
  getReport(
    thresholds:
      Partial<ExecutionHealthThresholds> = {},
  ): ExecutionHealthReport {
    const resolvedThresholds:
      ExecutionHealthThresholds = {
      ...DEFAULT_THRESHOLDS,
      ...thresholds,
    };

    this.validateThresholds(
      resolvedThresholds,
    );

    const metricsReport =
      executionMetricsService.getReport();

    const exchangeNames =
      this.collectExchangeNames(
        metricsReport.exchanges,
      );

    const exchanges =
      exchangeNames.map(
        (exchange) =>
          this.evaluateExchange(
            exchange,

            metricsReport.exchanges.find(
              (metrics) =>
                metrics.exchange
                  .trim()
                  .toLowerCase() ===
                exchange,
            ) ?? null,

            resolvedThresholds,
          ),
      );

    const healthyExchanges =
      exchanges.filter(
        (exchange) =>
          exchange.status ===
          "HEALTHY",
      ).length;

    const degradedExchanges =
      exchanges.filter(
        (exchange) =>
          exchange.status ===
          "DEGRADED",
      ).length;

    const unhealthyExchanges =
      exchanges.filter(
        (exchange) =>
          exchange.status ===
          "UNHEALTHY",
      ).length;

    const status =
      this.calculateOverallStatus(
        exchanges,
      );

    const reasons =
      exchanges.flatMap(
        (exchange) =>
          exchange.reasons.map(
            (reason) =>
              `${exchange.exchange}: ${reason}`,
          ),
      );

    return {
      timestamp:
        Date.now(),

      status,

      totalExecutions:
        metricsReport.totalExecutions,

      healthyExchanges,

      degradedExchanges,

      unhealthyExchanges,

      exchanges,

      reasons,
    };
  }

  private evaluateExchange(
    exchange: string,

    metrics:
      ExchangeExecutionMetrics | null,

    thresholds:
      ExecutionHealthThresholds,
  ): ExchangeExecutionHealth {
    const adapterStatus =
      liveExecutionService.getMonitoredExchangeStatus(
        exchange,
      );

    const {
      adapterRegistered,
      credentialsConfigured,
      authenticationVerified,
      exchangeApiReachable,
      verificationState,
      readOnlyVerificationFresh,
      lastVerifiedAt,
      lastVerificationAttemptAt,
      verificationExpiresAt,
      verificationMethod,
      lastVerificationError,
      liveExecutionEnabled,
      adapterConnected,
    } = adapterStatus;

    const reasons: string[] = [];

    if (!adapterRegistered) {
      reasons.push(
        "Live execution adapter is not registered.",
      );
    }

    if (
      !credentialsConfigured
    ) {
      reasons.push(
        "Authenticated read-only credentials are not configured.",
      );
    }

    if (
      credentialsConfigured &&
      verificationState ===
        "VERIFICATION_STALE"
    ) {
      reasons.push(
        "Authenticated read-only verification evidence is stale.",
      );
    } else if (
      credentialsConfigured &&
      lastVerificationError !==
        null
    ) {
      reasons.push(
        `Authenticated read-only verification failed: ${lastVerificationError}`,
      );
    } else if (
      credentialsConfigured &&
      !authenticationVerified
    ) {
      reasons.push(
        "Authenticated read-only exchange access has not been verified.",
      );
    }

    if (
      credentialsConfigured &&
      authenticationVerified &&
      !exchangeApiReachable
    ) {
      reasons.push(
        "Authenticated read succeeded, but exchange API reachability is not verified.",
      );
    }

    if (
      authenticationVerified &&
      exchangeApiReachable &&
      !liveExecutionEnabled
    ) {
      reasons.push(
        "Authenticated read-only exchange access is verified; LIVE execution capability remains disabled.",
      );
    }

    if (!metrics) {
      return {
        exchange,

        adapterRegistered,

        credentialsConfigured,

        authenticationVerified,

        exchangeApiReachable,

        verificationState,

        readOnlyVerificationFresh,

        lastVerifiedAt,

        lastVerificationAttemptAt,

        verificationExpiresAt,

        verificationMethod,

        lastVerificationError,

        liveExecutionEnabled,

        adapterConnected,

        executionEvidenceAvailable:
          false,

        status:
          !adapterRegistered ||
          credentialsConfigured
            ? "NO_DATA"
            : "UNHEALTHY",

        totalExecutions:
          0,

        fillRatePercent:
          0,

        cancellationRatePercent:
          0,

        timeoutRatePercent:
          0,

        failureRatePercent:
          0,

        averageExecutionTimeMs:
          0,

        lastExecutionAt:
          null,

        reasons: [
          ...reasons,

          ...(credentialsConfigured
            ? [
                "No execution metrics are available yet.",
              ]
            : []),
        ],
      };
    }

    const enoughExecutions =
      metrics.totalExecutions >=
      thresholds
        .minimumExecutionsForRateChecks;

    if (
      metrics.averageExecutionTimeMs >
      thresholds
        .maximumAverageExecutionTimeMs
    ) {
      reasons.push(
        `Average execution time ${metrics.averageExecutionTimeMs.toFixed(
          2,
        )} ms exceeds limit ${thresholds.maximumAverageExecutionTimeMs} ms.`,
      );
    }

    if (enoughExecutions) {
      if (
        metrics.failureRatePercent >
        thresholds
          .maximumFailureRatePercent
      ) {
        reasons.push(
          `Failure rate ${metrics.failureRatePercent.toFixed(
            2,
          )}% exceeds limit ${thresholds.maximumFailureRatePercent}%.`,
        );
      }

      if (
        metrics.timeoutRatePercent >
        thresholds
          .maximumTimeoutRatePercent
      ) {
        reasons.push(
          `Timeout rate ${metrics.timeoutRatePercent.toFixed(
            2,
          )}% exceeds limit ${thresholds.maximumTimeoutRatePercent}%.`,
        );
      }

      if (
        metrics.fillRatePercent <
        thresholds
          .minimumFillRatePercent
      ) {
        reasons.push(
          `Fill rate ${metrics.fillRatePercent.toFixed(
            2,
          )}% is below minimum ${thresholds.minimumFillRatePercent}%.`,
        );
      }
    }

    const status =
      this.calculateExchangeStatus(
        adapterRegistered,
        credentialsConfigured,
        adapterConnected,
        metrics,
        reasons,
        thresholds,
      );

    return {
      exchange,

      adapterRegistered,

      credentialsConfigured,

      authenticationVerified,

      exchangeApiReachable,

      verificationState,

      readOnlyVerificationFresh,

      lastVerifiedAt,

      lastVerificationAttemptAt,

      verificationExpiresAt,

      verificationMethod,

      lastVerificationError,

      liveExecutionEnabled,

      adapterConnected,

      executionEvidenceAvailable:
        metrics.totalExecutions >
        0,

      status,

      totalExecutions:
        metrics.totalExecutions,

      fillRatePercent:
        metrics.fillRatePercent,

      cancellationRatePercent:
        metrics
          .cancellationRatePercent,

      timeoutRatePercent:
        metrics.timeoutRatePercent,

      failureRatePercent:
        metrics.failureRatePercent,

      averageExecutionTimeMs:
        metrics.averageExecutionTimeMs,

      lastExecutionAt:
        metrics.lastExecutionAt,

      reasons:
        reasons.length > 0
          ? reasons
          : [
              "Execution adapter and metrics are within configured thresholds.",
            ],
    };
  }

  private calculateExchangeStatus(
    adapterRegistered: boolean,

    credentialsConfigured: boolean,

    adapterConnected: boolean,

    metrics:
      ExchangeExecutionMetrics,

    reasons: string[],

    thresholds:
      ExecutionHealthThresholds,
  ): ExecutionHealthStatus {
    if (
      !adapterRegistered ||
      !credentialsConfigured
    ) {
      return "UNHEALTHY";
    }

    if (
      metrics.totalExecutions ===
      0
    ) {
      return "NO_DATA";
    }

    const severeFailure =
      metrics.failureRatePercent >
      thresholds
        .maximumFailureRatePercent *
        2;

    const severeTimeout =
      metrics.timeoutRatePercent >
      thresholds
        .maximumTimeoutRatePercent *
        2;

    if (
      severeFailure ||
      severeTimeout
    ) {
      return "UNHEALTHY";
    }

    if (!adapterConnected) {
      return "DEGRADED";
    }

    if (
      reasons.length >
      0
    ) {
      return "DEGRADED";
    }

    return "HEALTHY";
  }

  private calculateOverallStatus(
    exchanges:
      ExchangeExecutionHealth[],
  ): ExecutionHealthStatus {
    if (
      exchanges.length ===
      0
    ) {
      return "NO_DATA";
    }

    if (
      exchanges.some(
        (exchange) =>
          exchange.status ===
          "UNHEALTHY",
      )
    ) {
      return "UNHEALTHY";
    }

    if (
      exchanges.some(
        (exchange) =>
          exchange.status ===
          "DEGRADED",
      )
    ) {
      return "DEGRADED";
    }

    if (
      exchanges.every(
        (exchange) =>
          exchange.status ===
          "NO_DATA",
      )
    ) {
      return "NO_DATA";
    }

    return "HEALTHY";
  }

  private collectExchangeNames(
    metrics:
      ExchangeExecutionMetrics[],
  ): string[] {
    const exchangeNames =
      new Set<string>(
        liveExecutionService
          .getMonitoredExchanges(),
      );

    for (
      const metric
      of metrics
    ) {
      const exchange =
        metric.exchange
          .trim()
          .toLowerCase();

      if (exchange) {
        exchangeNames.add(
          exchange,
        );
      }
    }

    return [
      ...exchangeNames,
    ].sort((first, second) =>
      first.localeCompare(
        second,
      ),
    );
  }

  private validateThresholds(
    thresholds:
      ExecutionHealthThresholds,
  ): void {
    const percentageThresholds = [
      thresholds
        .maximumFailureRatePercent,

      thresholds
        .maximumTimeoutRatePercent,

      thresholds
        .minimumFillRatePercent,
    ];

    if (
      percentageThresholds.some(
        (value) =>
          !Number.isFinite(
            value,
          ) ||
          value < 0 ||
          value > 100,
      )
    ) {
      throw new Error(
        "Execution health percentage thresholds must be between 0 and 100.",
      );
    }

    if (
      !Number.isFinite(
        thresholds
          .maximumAverageExecutionTimeMs,
      ) ||
      thresholds
        .maximumAverageExecutionTimeMs <=
        0
    ) {
      throw new Error(
        "Maximum average execution time must be positive.",
      );
    }

    if (
      !Number.isSafeInteger(
        thresholds
          .minimumExecutionsForRateChecks,
      ) ||
      thresholds
        .minimumExecutionsForRateChecks <
        1
    ) {
      throw new Error(
        "Minimum executions for rate checks must be a positive integer.",
      );
    }
  }
}

export const executionHealthService =
  new ExecutionHealthService();
