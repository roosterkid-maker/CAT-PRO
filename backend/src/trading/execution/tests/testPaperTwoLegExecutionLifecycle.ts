import assert
  from "node:assert/strict";

import {
  liveExecutionCoordinator,
} from "../../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  liveExecutionSessionEvidenceService,
} from "../../../execution/live/coordinator/LiveExecutionSessionEvidenceService";

import {
  orderLifecycleEvidenceService,
} from "../../../execution/live/lifecycle/OrderLifecycleEvidenceService";

import {
  orderLifecycleManager,
} from "../../../execution/live/lifecycle/OrderLifecycleManager";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../../../strategies/models/StrategyMetadata";

import {
  tradingAccountService,
} from "../../account/TradingAccountService";

import {
  capitalReservationService,
} from "../../capital/CapitalReservationService";

import type {
  ExecutionPlan,
} from "../../models/ExecutionPlan";

import {
  paperOrderExecutor,
} from "../PaperOrderExecutor";

import {
  paperTwoLegExecutionLifecycleService,
} from "../PaperTwoLegExecutionLifecycleService";

function createPlan(
  suffix:
    string,
): ExecutionPlan {
  const now =
    Date.now();

  return {
    id:
      `paper-two-leg-${suffix}-${now}`,
    version:
      1,
    market:
      `${suffix.toUpperCase()}/USDT`,
    mode:
      "PAPER",
    strategy:
      "PARALLEL",
    status:
      "READY",
    capital:
      100,
    expectedProfit:
      2,
    expectedProfitPercent:
      2,
    expectedFees:
      0.202,
    expectedNetProfit:
      1.798,
    expectedNetProfitPercent:
      1.798,
    maximumSlippagePercent:
      0.1,
    expectedSlippagePercent:
      0.02,
    timeoutMs:
      5_000,
    buy: {
      exchange:
        "binance",
      market:
        `${suffix.toUpperCase()}/USDT`,
      side:
        "BUY",
      quantity:
        1,
      limitPrice:
        100,
      orderType:
        "limit",
      timeInForce:
        "IOC",
      baseAsset:
        suffix.toUpperCase(),
      quoteAsset:
        "USDT",
    },
    sell: {
      exchange:
        "bybit",
      market:
        `${suffix.toUpperCase()}/USDT`,
      side:
        "SELL",
      quantity:
        1,
      limitPrice:
        102,
      orderType:
        "limit",
      timeInForce:
        "IOC",
      baseAsset:
        suffix.toUpperCase(),
      quoteAsset:
        "USDT",
    },
    createdAt:
      now,
    expiresAt:
      now +
      5_000,
    opportunityTimestamp:
      now,
  };
}

function closeEnough(
  actual:
    number,

  expected:
    number,
): boolean {
  return Math.abs(
    actual -
      expected,
  ) <=
    1e-9;
}

function createIndianInrPlan():
  ExecutionPlan {
  const plan =
    createPlan(
      "tds-inr",
    );

  return {
    ...plan,
    market:
      "BTC/INR",
    buy: {
      ...plan.buy,
      market:
        "BTC/INR",
      baseAsset:
        "BTC",
      quoteAsset:
        "INR",
    },
    sell: {
      ...plan.sell,
      exchange:
        "coindcx",
      market:
        "BTC/INR",
      baseAsset:
        "BTC",
      quoteAsset:
        "INR",
    },
  };
}

function createIndianC2cPlan():
  ExecutionPlan {
  const plan =
    createPlan(
      "tds-c2c",
    );

  return {
    ...plan,
    market:
      "BTC/USDT",
    buy: {
      ...plan.buy,
      exchange:
        "coindcx",
      market:
        "BTC/USDT",
      baseAsset:
        "BTC",
      quoteAsset:
        "USDT",
    },
    sell: {
      ...plan.sell,
      market:
        "BTC/USDT",
      baseAsset:
        "BTC",
      quoteAsset:
        "USDT",
    },
  };
}

function main(): void {
  const evidenceWritesBefore =
    liveExecutionSessionEvidenceService
      .getDiagnostics()
      .writes;

  const accountBefore =
    tradingAccountService
      .getAccount();

  const reservationsBefore =
    capitalReservationService
      .getDiagnostics()
      .activeReservations;

  const possibleRealOrdersBefore =
    orderLifecycleEvidenceService
      .getDiagnostics()
      .possibleSubmittedRealOrders;

  const attribution = {
    attributionStatus:
      "ATTRIBUTED",
    strategyId:
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
    signalId:
      "paper-two-leg-lifecycle-test-signal",
    intentId:
      null,
  } as const;

  const balanced =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "balanced",
        ),
        attribution,
      );

  assert.equal(
    balanced.status,
    "COMPLETED",
  );
  assert.equal(
    balanced.result.status,
    "COMPLETED",
  );
  assert.equal(
    balanced.result.successful,
    true,
  );
  assert.equal(
    balanced.result.strategyAttribution
      .strategyId,
    CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
  );
  assert.equal(
    balanced.recovery
      .requiresRecovery,
    false,
  );
  assert.equal(
    balanced.reconciliation
      .buy.status,
    "MATCHED",
  );
  assert.equal(
    balanced.reconciliation
      .sell.status,
    "MATCHED",
  );
  assert.equal(
    balanced.settlement.status,
    "SETTLED",
  );
  assert.equal(
    balanced.audit
      .finalSessionStatus,
    "COMPLETED",
  );
  assert.equal(
    balanced.capitalReservationFinalized,
    true,
  );
  assert.equal(
    balanced.routeLockReleased,
    true,
  );
  assert.equal(
    balanced.automaticRecoveryOrderSubmitted,
    false,
  );
  assert.equal(
    balanced.liveOrderSubmissionAllowed,
    false,
  );
  assert.equal(
    balanced.exchangeOrdersSubmitted,
    0,
  );

  const depthBoundFill =
    paperOrderExecutor.execute(
      createPlan(
        "depth-bound-fill",
      ),
      {
        simulatedSlippagePercent:
          0,
        buy: {
          averageFillPrice:
            99.9,
        },
        sell: {
          averageFillPrice:
            102.1,
        },
      },
      attribution,
    );

  assert.equal(
    depthBoundFill.buy
      .averageFillPrice,
    99.9,
  );
  assert.equal(
    depthBoundFill.sell
      .averageFillPrice,
    102.1,
  );
  assert.equal(
    depthBoundFill.successful,
    true,
  );

  const indianInrFill =
    paperOrderExecutor.execute(
      createIndianInrPlan(),
      {
        simulatedSlippagePercent:
          0,
      },
      attribution,
    );

  assert.equal(
    indianInrFill
      .paperVdaTaxWithholding
      ?.policy,
    "MODELED_SECTION_194S_V1",
  );
  assert.equal(
    closeEnough(
      indianInrFill
        .tdsWithheld ??
        -1,
      1.02,
    ),
    true,
    "An Indian INR Spot sell must model 1% TDS on gross sell consideration.",
  );
  assert.equal(
    closeEnough(
      indianInrFill
        .netProfit,
      1.2982,
    ),
    true,
    "CoinDCX Regular-1 INR fees must include the published 0.50% fee plus 18% GST.",
  );
  assert.equal(
    closeEnough(
      indianInrFill
        .deployableCashProfit ??
        Number.NaN,
      indianInrFill.netProfit -
        1.02,
    ),
    true,
    "TDS must reduce deployable cash without being misclassified as an economic trading fee.",
  );

  const indianC2cFill =
    paperOrderExecutor.execute(
      createIndianC2cPlan(),
      {
        simulatedSlippagePercent:
          0,
      },
      attribution,
    );

  assert.equal(
    closeEnough(
      indianC2cFill
        .tdsWithheld ??
        -1,
      0.997994,
    ),
    true,
    "An Indian C2C buy must model TDS on net VDA consideration.",
  );
  assert.equal(
    closeEnough(
      indianC2cFill.totalFees,
      0.3026,
    ),
    true,
    "CoinDCX Regular-1 C2C fees must include the published 0.17% fee plus 18% GST.",
  );

  assert.throws(
    () =>
      paperOrderExecutor.execute(
        createPlan(
          "invalid-depth-bound-fill",
        ),
        {
          simulatedSlippagePercent:
            0,
          buy: {
            averageFillPrice:
              100.01,
          },
        },
        attribution,
      ),
    /violates the executable limit price/i,
  );

  const sellFailure =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "sell-failed",
        ),
        attribution,
        {
          simulatedSlippagePercent:
            0.02,
          sell: {
            fillRatio:
              0,
            terminalStatus:
              "FAILED",
            failureReason:
              "Injected deterministic SELL-leg failure.",
          },
        },
      );

  assert.equal(
    sellFailure.status,
    "COMPLETED",
  );
  assert.equal(
    sellFailure.result.status,
    "COMPLETED",
  );
  assert.equal(
    sellFailure.result.successful,
    true,
  );
  assert.equal(
    sellFailure.result.buy.status,
    "FILLED",
  );
  assert.equal(
    sellFailure.result.sell.status,
    "FILLED",
  );
  assert.equal(
    sellFailure.initialRecovery
      .requiresRecovery,
    true,
  );
  assert.equal(
    sellFailure.initialRecovery
      .exposureDirection,
    "LONG",
  );
  assert.equal(
    sellFailure.initialRecovery
      .strategy,
    "EMERGENCY_EXIT",
  );
  assert.equal(
    sellFailure.initialRecovery
      .severity,
    "CRITICAL",
  );
  assert.equal(
    sellFailure.recovery
      .requiresRecovery,
    false,
  );
  assert.equal(
    sellFailure.recovery
      .exposureDirection,
    "BALANCED",
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.status,
    "EXECUTED",
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.leg.side,
    "SELL",
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.leg.exchange,
    "binance",
    "LONG emergency exit must sell on the original filled BUY venue.",
  );
  assert.equal(
    sellFailure.result.sell.exchange,
    "binance",
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.leg.quantity,
    sellFailure.initialRecovery
      .exposedQuantity,
  );
  assert.equal(
    (
      sellFailure.recoveryAction
        ?.leg.simulatedQuoteValue ??
      Number.POSITIVE_INFINITY
    ) <=
      (
        sellFailure.recoveryAction
          ?.leg.maximumQuoteValue ??
        0
      ),
    true,
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.reconciliation
      ?.status,
    "MATCHED",
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.incidentResolved,
    true,
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.additionalCapitalReserved,
    false,
  );
  assert.equal(
    sellFailure.recoveryAction
      ?.exchangeOrdersSubmitted,
    0,
  );
  assert.equal(
    sellFailure.reconciliation
      .buy.status,
    "MATCHED",
  );
  assert.equal(
    sellFailure.reconciliation
      .sell.status,
    "MATCHED",
  );
  assert.equal(
    sellFailure.settlement.status,
    "SETTLED",
  );
  assert.equal(
    sellFailure.settlement
      .sellExchange,
    "binance",
  );
  assert.equal(
    sellFailure.audit
      .finalSessionStatus,
    "COMPLETED",
  );
  assert.equal(
    sellFailure.capitalReservationFinalized,
    true,
  );
  assert.equal(
    sellFailure.routeLockReleased,
    true,
  );
  assert.equal(
    sellFailure.automaticRecoveryOrderSubmitted,
    false,
  );
  assert.equal(
    sellFailure.automaticPaperRecoveryExecuted,
    true,
  );
  assert.equal(
    sellFailure.exchangeOrdersSubmitted,
    0,
  );

  const buyFailure =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "buy-failed",
        ),
        attribution,
        {
          simulatedSlippagePercent:
            0.02,
          buy: {
            fillRatio:
              0,
            terminalStatus:
              "FAILED",
            failureReason:
              "Injected deterministic BUY-leg failure.",
          },
        },
      );

  assert.equal(
    buyFailure.status,
    "COMPLETED",
  );
  assert.equal(
    buyFailure.initialRecovery
      .exposureDirection,
    "SHORT",
  );
  assert.equal(
    buyFailure.initialRecovery
      .strategy,
    "EMERGENCY_EXIT",
  );
  assert.equal(
    buyFailure.recoveryAction
      ?.status,
    "EXECUTED",
  );
  assert.equal(
    buyFailure.recoveryAction
      ?.leg.side,
    "BUY",
  );
  assert.equal(
    buyFailure.recoveryAction
      ?.leg.exchange,
    "bybit",
    "SHORT emergency exit must buy on the original filled SELL venue.",
  );
  assert.equal(
    buyFailure.result.buy.exchange,
    "bybit",
  );
  assert.equal(
    buyFailure.recovery
      .exposureDirection,
    "BALANCED",
  );
  assert.equal(
    buyFailure.settlement.status,
    "SETTLED",
  );
  assert.equal(
    buyFailure.settlement
      .buyExchange,
    "bybit",
  );
  assert.equal(
    buyFailure.result.successful,
    true,
  );
  assert.equal(
    buyFailure.automaticPaperRecoveryExecuted,
    true,
  );
  assert.equal(
    buyFailure.exchangeOrdersSubmitted,
    0,
  );

  const partial =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "partial",
        ),
        attribution,
        {
          simulatedSlippagePercent:
            0.02,
          buy: {
            fillRatio:
              0.6,
            terminalStatus:
              "PARTIALLY_FILLED",
          },
          sell: {
            fillRatio:
              0.2,
            terminalStatus:
              "PARTIALLY_FILLED",
          },
        },
      );

  assert.equal(
    partial.status,
    "RECOVERY_REQUIRED",
  );
  assert.equal(
    partial.result.status,
    "PARTIALLY_COMPLETED",
  );
  assert.equal(
    partial.recovery
      .exposureDirection,
    "LONG",
  );
  assert.equal(
    closeEnough(
      partial.recovery
        .exposedQuantity,
      0.4,
    ),
    true,
  );
  assert.equal(
    partial.recovery
      .strategy,
    "WAIT_FOR_COUNTER_LEG",
  );
  assert.equal(
    partial.recoveryAction
      ?.status,
    "BLOCKED",
  );
  assert.equal(
    partial.reconciliation
      .buy.status,
    "MATCHED",
  );
  assert.equal(
    partial.reconciliation
      .sell.status,
    "MATCHED",
  );
  assert.equal(
    partial.settlement.status,
    "BLOCKED",
  );
  assert.equal(
    partial.audit
      .finalSessionStatus,
    "FAILED",
  );
  assert.equal(
    partial.capitalReservationFinalized,
    true,
  );
  assert.equal(
    partial.routeLockReleased,
    true,
  );
  assert.equal(
    partial.automaticRecoveryOrderSubmitted,
    false,
  );
  assert.equal(
    partial.automaticPaperRecoveryExecuted,
    false,
  );
  assert.equal(
    partial.liveOrderSubmissionAllowed,
    false,
  );
  assert.equal(
    partial.exchangeOrdersSubmitted,
    0,
  );

  const recoveryFailure =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "recovery-failed",
        ),
        attribution,
        {
          simulatedSlippagePercent:
            0.02,
          sell: {
            fillRatio:
              0,
            terminalStatus:
              "FAILED",
            failureReason:
              "Injected initial SELL-leg failure.",
          },
        },
        {
          simulatedSlippagePercent:
            0.02,
          sell: {
            fillRatio:
              0,
            terminalStatus:
              "FAILED",
            failureReason:
              "Injected bounded PAPER recovery failure.",
          },
        },
      );

  assert.equal(
    recoveryFailure.status,
    "RECOVERY_REQUIRED",
  );
  assert.equal(
    recoveryFailure.initialRecovery
      .strategy,
    "EMERGENCY_EXIT",
  );
  assert.equal(
    recoveryFailure.recoveryAction
      ?.status,
    "FAILED",
  );
  assert.equal(
    recoveryFailure.recovery
      .requiresRecovery,
    true,
  );
  assert.equal(
    recoveryFailure.settlement.status,
    "BLOCKED",
  );
  assert.equal(
    recoveryFailure.audit
      .finalSessionStatus,
    "FAILED",
  );
  assert.equal(
    recoveryFailure.capitalReservationFinalized,
    true,
  );
  assert.equal(
    recoveryFailure.routeLockReleased,
    true,
  );
  assert.equal(
    recoveryFailure.automaticPaperRecoveryExecuted,
    false,
  );
  assert.equal(
    recoveryFailure.automaticRecoveryOrderSubmitted,
    false,
  );
  assert.equal(
    recoveryFailure.exchangeOrdersSubmitted,
    0,
  );

  const recoveryOrders =
    orderLifecycleManager
      .getBySession(
        sellFailure.sessionId,
      )
      .filter(
        (
          order,
        ) =>
          order.purpose ===
          "RECOVERY",
      );

  assert.equal(
    recoveryOrders.length,
    1,
  );
  assert.equal(
    recoveryOrders[0]
      ?.recoveryIncidentId,
    sellFailure.initialRecovery
      .incident
      ?.id,
  );

  const accountAfter =
    tradingAccountService
      .getAccount();

  assert.equal(
    accountAfter.currentCapital,
    accountBefore.currentCapital,
    "Lifecycle-only PAPER execution must not book current-capital P&L.",
  );
  assert.equal(
    accountAfter.availableCapital,
    accountBefore.availableCapital,
    "All PAPER capital holds must be returned after terminal lifecycle states.",
  );
  assert.equal(
    accountAfter.todayProfit,
    accountBefore.todayProfit,
    "Lifecycle-only PAPER execution must not book profit.",
  );
  assert.equal(
    accountAfter.todayLoss,
    accountBefore.todayLoss,
    "Lifecycle-only PAPER execution must not book loss.",
  );
  assert.equal(
    accountAfter.openTrades,
    accountBefore.openTrades,
    "Terminal PAPER lifecycle states must not leave open capital holds.",
  );
  assert.equal(
    accountAfter.tradesToday,
    accountBefore.tradesToday +
      5,
    "The account must retain an attempt count for each capital-reserved PAPER session.",
  );

  assert.equal(
    capitalReservationService
      .getDiagnostics()
      .activeReservations,
    reservationsBefore,
    "Every successful, failed, or partial PAPER session must finalize its capital reservation.",
  );

  assert.equal(
    liveExecutionCoordinator
      .getDiagnostics()
      .activeSessions,
    0,
    "Every tested PAPER session must release its route lock and leave no active coordinator session.",
  );

  const sessionEvidence =
    liveExecutionSessionEvidenceService
      .getDiagnostics();

  assert.ok(
    sessionEvidence.writes >=
      evidenceWritesBefore +
        5,
    "Every terminal PAPER lifecycle must persist its session evidence immediately.",
  );
  assert.equal(
    sessionEvidence.interruptedRealSessions,
    0,
    "PAPER evidence must never be classified as interrupted REAL execution.",
  );

  assert.equal(
    orderLifecycleEvidenceService
      .getDiagnostics()
      .possibleSubmittedRealOrders,
    possibleRealOrdersBefore,
    "PAPER primary and recovery lifecycles must not be classified as possible real exchange orders.",
  );

  console.log(
    "PAPER TWO-LEG EXECUTION LIFECYCLE TEST PASSED.",
  );
  console.log(
    "Balanced settlement, bounded PAPER recovery closure, wait-policy blocking, recovery failure handling, reservation cleanup, attribution, and LIVE isolation verified.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
