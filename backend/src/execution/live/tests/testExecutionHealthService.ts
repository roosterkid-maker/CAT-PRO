import "dotenv/config";

import {
  ExecutionHealthService,
  executionHealthService,
} from "../health/ExecutionHealthService";

import {
  ExecutionMetricsService,
  executionMetricsService,
} from "../metrics/ExecutionMetricsService";

import type {
  LiveExecutionExchangeStatus,
} from "../LiveExecutionService";

import {
  executionAdapterVerificationService,
} from "../verification/ExecutionAdapterVerificationService";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

function createResult(
  overrides:
    Partial<LiveExecutionResult> = {},
): LiveExecutionResult {
  const now =
    Date.now();

  return {
    success:
      true,

    exchange:
      "coindcx",

    market:
      "DOGEINR",

    side:
      "buy",

    orderId:
      `synthetic-${now}`,

    clientOrderId:
      null,

    status:
      "FILLED",

    requestedQuantity:
      10,

    filledQuantity:
      10,

    remainingQuantity:
      0,

    requestedPrice:
      7,

    averageFillPrice:
      7,

    feeAmount:
      0,

    cancelled:
      false,

    timedOut:
      false,

    startedAt:
      now - 500,

    completedAt:
      now,

    executionTimeMs:
      500,

    failureReason:
      null,

    reasons: [],

    ...overrides,
  };
}

function printReport(
  title: string,
): void {
  const report =
    executionHealthService.getReport();

  console.log(
    `\n${title}`,
  );

  console.table([
    {
      OverallStatus:
        report.status,

      TotalExecutions:
        report.totalExecutions,

      Healthy:
        report.healthyExchanges,

      Degraded:
        report.degradedExchanges,

      Unhealthy:
        report.unhealthyExchanges,
    },
  ]);

  console.table(
    report.exchanges.map(
      (exchange) => ({
        Exchange:
          exchange.exchange,

        Registered:
          exchange.adapterRegistered,

        Configured:
          exchange
            .credentialsConfigured,

        AuthVerified:
          exchange
            .authenticationVerified,

        ApiReachable:
          exchange
            .exchangeApiReachable,

        VerificationFresh:
          exchange
            .readOnlyVerificationFresh,

        LiveExecutionEnabled:
          exchange
            .liveExecutionEnabled,

        StrictConnected:
          exchange.adapterConnected,

        Evidence:
          exchange
            .executionEvidenceAvailable,

        Status:
          exchange.status,

        Executions:
          exchange.totalExecutions,

        FillRate:
          exchange.fillRatePercent,

        TimeoutRate:
          exchange.timeoutRatePercent,

        FailureRate:
          exchange.failureRatePercent,

        AverageMs:
          exchange.averageExecutionTimeMs,
      }),
    ),
  );

  for (
    const reason
    of report.reasons
  ) {
    console.log(
      `- ${reason}`,
    );
  }
}

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function main(): Promise<void> {
  console.log(
    "\n====================================",
  );

  console.log(
    "EXECUTION HEALTH SERVICE TEST",
  );

  console.log(
    "====================================",
  );

  const isolatedMetrics =
    new ExecutionMetricsService();

  for (
    const exchange
    of [
      "coinswitch",
      "unocoin",
      "zebpay",
    ]
  ) {
    for (
      let index = 0;
      index < 5;
      index += 1
    ) {
      isolatedMetrics.record(
        createResult({
          success:
            false,
          exchange,
          orderId:
            null,
          status:
            "FAILED",
          filledQuantity:
            0,
          remainingQuantity:
            10,
          averageFillPrice:
            0,
          failureReason:
            "Synthetic non-core failure.",
        }),
      );
    }
  }

  const isolatedHealth =
    new ExecutionHealthService({
      getMetricsReport:
        () =>
          isolatedMetrics
            .getReport(),
      getMonitoredExchanges:
        () => [
          "binance",
          "bybit",
          "coindcx",
          "coinswitch",
          "unocoin",
          "zebpay",
        ],
      getMonitoredExchangeStatus:
        (exchange) =>
          missingCredentialStatus(
            exchange,
          ),
    });

  const isolatedReport =
    isolatedHealth.getReport();

  assertCondition(
    isolatedReport.coreStatus ===
      "NO_DATA" &&
      isolatedReport.status ===
        "NO_DATA",
    "Missing credentials must not rewrite absent execution evidence as failed execution health.",
  );

  assertCondition(
    isolatedReport.coreExchanges.length ===
      3 &&
      isolatedReport.coreExchanges.every(
        (exchange) =>
          exchange.status ===
            "NO_DATA" &&
          !exchange.submissionReady,
      ),
    "All three core venues must remain submission-blocked without credentials while reporting NO_DATA execution evidence.",
  );

  assertCondition(
    isolatedReport.nonCoreExchanges.length ===
      3 &&
      isolatedReport.nonCoreExchanges.every(
        (exchange) =>
          exchange.status ===
            "UNHEALTHY",
      ),
    "CoinSwitch, UnoCoin and ZebPay failures must remain visible without changing core execution health.",
  );

  executionMetricsService.reset();

  executionAdapterVerificationService
    .reset();

  const initialReport =
    executionHealthService.getReport();

  printReport(
    "SCENARIO 1 — NO EXECUTION DATA",
  );

  assertCondition(
    initialReport.totalExecutions ===
      0,
    "Initial report should contain zero executions.",
  );

  assertCondition(
    initialReport.exchanges.some(
      (exchange) =>
        exchange.exchange ===
        "coindcx",
    ),
    "CoinDCX must be present in the health report.",
  );

  assertCondition(
    initialReport.exchanges.some(
      (exchange) =>
        exchange.exchange ===
        "binance",
    ),
    "Binance must be present in the health report.",
  );

  const initialBybit =
    initialReport.exchanges.find(
      (exchange) =>
        exchange.exchange ===
        "bybit",
    );

  assertCondition(
    initialBybit !==
      undefined &&
      initialBybit.adapterRegistered &&
      !initialBybit.liveExecutionEnabled &&
      !initialBybit.adapterConnected &&
      initialBybit.status ===
        "NO_DATA",
    "Bybit V22.20 adapter must be registered while LIVE execution and strict connectivity remain disabled.",
  );

  /*
   * Scenario 2:
   * Five successful CoinDCX executions.
   */
  for (
    let index = 0;
    index < 5;
    index += 1
  ) {
    const executionTimeMs =
      400 +
      index * 20;

    const completedAt =
      Date.now();

    executionMetricsService.record(
      createResult({
        exchange:
          "coindcx",

        orderId:
          `coindcx-filled-${index}`,

        executionTimeMs,

        startedAt:
          completedAt -
          executionTimeMs,

        completedAt,
      }),
    );
  }

  const healthyReport =
    executionHealthService.getReport();

  printReport(
    "SCENARIO 2 — SUCCESSFUL METRICS, CONNECTIVITY UNVERIFIED",
  );

  const healthyCoinDCX =
    healthyReport.exchanges.find(
      (exchange) =>
        exchange.exchange ===
        "coindcx",
    );

  assertCondition(
    healthyCoinDCX !==
      undefined,
    "CoinDCX health result was not found.",
  );

  assertCondition(
    healthyCoinDCX.status ===
      "DEGRADED",
    "CoinDCX must remain DEGRADED until authenticated connectivity is verified.",
  );

  assertCondition(
    healthyCoinDCX.fillRatePercent ===
      100,
    "CoinDCX fill rate should be 100%.",
  );

  /*
   * Scenario 3:
   * Binance gets five failures.
   */
  for (
    let index = 0;
    index < 5;
    index += 1
  ) {
    executionMetricsService.record(
      createResult({
        success:
          false,

        exchange:
          "binance",

        market:
          "XRPUSDT",

        orderId:
          null,

        clientOrderId:
          `binance-failed-${index}`,

        status:
          "FAILED",

        filledQuantity:
          0,

        remainingQuantity:
          10,

        averageFillPrice:
          0,

        executionTimeMs:
          250,

        failureReason:
          "Synthetic execution failure.",

        reasons: [
          "Synthetic failure for health classification.",
        ],
      }),
    );
  }

  const unhealthyReport =
    executionHealthService.getReport();

  printReport(
    "SCENARIO 3 — UNHEALTHY BINANCE",
  );

  const unhealthyBinance =
    unhealthyReport.exchanges.find(
      (exchange) =>
        exchange.exchange ===
        "binance",
    );

  assertCondition(
    unhealthyBinance !==
      undefined,
    "Binance health result was not found.",
  );

  assertCondition(
    unhealthyBinance.status ===
      "UNHEALTHY",
    "Binance should be UNHEALTHY after repeated failures.",
  );

  assertCondition(
    unhealthyBinance.failureRatePercent ===
      100,
    "Binance failure rate should be 100%.",
  );

  assertCondition(
    unhealthyReport.status ===
      "UNHEALTHY",
    "Overall health should be UNHEALTHY.",
  );

  /*
   * Scenario 4:
   * Reset and create moderate timeout rate.
   */
  executionMetricsService.reset();

  for (
    let index = 0;
    index < 4;
    index += 1
  ) {
    executionMetricsService.record(
      createResult({
        exchange:
          "coindcx",

        orderId:
          `coindcx-success-${index}`,
      }),
    );
  }

  executionMetricsService.record(
    createResult({
      success:
        false,

      exchange:
        "coindcx",

      orderId:
        "coindcx-timeout",

      status:
        "CANCELLED",

      filledQuantity:
        0,

      remainingQuantity:
        10,

      averageFillPrice:
        0,

      cancelled:
        true,

      timedOut:
        true,

      failureReason:
        "Synthetic timeout.",

      reasons: [
        "Synthetic timeout for health classification.",
      ],
    }),
  );

  const degradedReport =
    executionHealthService.getReport();

  printReport(
    "SCENARIO 4 — DEGRADED COINDCX",
  );

  const degradedCoinDCX =
    degradedReport.exchanges.find(
      (exchange) =>
        exchange.exchange ===
        "coindcx",
    );

  assertCondition(
    degradedCoinDCX !==
      undefined,
    "CoinDCX degraded health result was not found.",
  );

  assertCondition(
    degradedCoinDCX.status ===
      "DEGRADED",
    "CoinDCX should be DEGRADED with a 20% timeout rate.",
  );

  assertCondition(
    degradedCoinDCX.timeoutRatePercent ===
      20,
    "CoinDCX timeout rate should be 20%.",
  );

  console.log(
    "\nEXECUTION HEALTH SERVICE TEST PASSED.",
  );

  console.log(
    "No live order was placed.",
  );
}

function missingCredentialStatus(
  exchange: string,
): LiveExecutionExchangeStatus {
  const normalized =
    exchange
      .trim()
      .toLowerCase();

  return {
    exchange:
      normalized,
    adapterRegistered:
      normalized !== "zebpay",
    capabilities:
      null,
    credentialsConfigured:
      false,
    authenticationVerified:
      false,
    exchangeApiReachable:
      false,
    verificationState:
      "NOT_CONFIGURED",
    readOnlyVerificationFresh:
      false,
    lastVerifiedAt:
      null,
    lastVerificationAttemptAt:
      null,
    verificationExpiresAt:
      null,
    verificationMethod:
      null,
    lastVerificationError:
      null,
    liveExecutionEnabled:
      false,
    adapterConnected:
      false,
  };
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Execution Health Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);
