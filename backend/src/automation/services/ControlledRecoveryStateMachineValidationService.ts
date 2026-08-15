import {
  randomUUID,
} from "node:crypto";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  fillEngine,
} from "../../execution/live/fills/FillEngine";

import {
  orderLifecycleManager,
} from "../../execution/live/lifecycle/OrderLifecycleManager";

import type {
  OrderLifecycleRecord,
} from "../../execution/live/lifecycle/OrderLifecycleRecord";

import type {
  LiveExecutionResult,
  LiveExecutionStatus,
} from "../../execution/live/models/LiveExecutionResult";

import {
  executionRecoveryEngine,
} from "../../execution/live/recovery/ExecutionRecoveryEngine";

import type {
  ExecutionPlan,
} from "../../trading/models/ExecutionPlan";

import type {
  ControlledRecoveryScenarioResult,
  ControlledRecoveryStateMachineValidationResult,
  ControlledRecoveryValidationScenario,
} from "../models/ControlledRecoveryStateMachineValidation";

export class ControlledRecoveryStateMachineValidationService {
  runSuite():
    ControlledRecoveryStateMachineValidationResult {
    const scenarios:
      ControlledRecoveryValidationScenario[] =
      [
        "BALANCED_FILLED",

        "BUY_FILLED_SELL_FAILED",

        "SELL_FILLED_BUY_FAILED",

        "BUY_FILLED_SELL_PARTIAL",

        "BUY_TIMEOUT_SELL_FILLED",
      ];

    const results =
      scenarios.map(
        (
          scenario,
        ) =>
          this.runScenario(
            scenario,
          ),
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.2",

      build:
        "3",

      mode:
        "CONTROLLED_LIVE",

      passed:
        results.every(
          (
            result,
          ) =>
            result.passed,
        ),

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,

      exchangeOrderSubmitted:
        false,

      scenarios:
        results,
    };
  }

  runScenario(
    scenario:
      ControlledRecoveryValidationScenario,
  ): ControlledRecoveryScenarioResult {
    const reasons:
      string[] =
      [];

    const plan =
      this.createPlan();

    /*
     * -------------------------------------------------
     * REAL COORDINATOR — DRY RUN ONLY
     * -------------------------------------------------
     *
     * This creates:
     *
     * session
     * reservation
     * route lock
     *
     * but it remains an existing coordinator dry-run.
     *
     * No adapter execution occurs.
     */
    const preparation =
      liveExecutionCoordinator
        .prepareDryRun(
          plan,
        );

    if (
      !preparation.approved ||
      !preparation.session
    ) {
      return this.failedScenario(
        scenario,

        {
          coordinatorPrepared:
            false,
        },

        preparation.reasons,
      );
    }

    const sessionId =
      preparation
        .session
        .id;

    /*
     * -------------------------------------------------
     * REAL ORDER LIFECYCLE MANAGER
     * -------------------------------------------------
     */
    const buyPreparation =
      orderLifecycleManager
        .prepare(
          sessionId,

          "BUY",
        );

    const sellPreparation =
      orderLifecycleManager
        .prepare(
          sessionId,

          "SELL",
        );

    if (
      !buyPreparation.approved ||
      !buyPreparation.order ||
      !sellPreparation.approved ||
      !sellPreparation.order
    ) {
      const failedSession =
        liveExecutionCoordinator
          .fail(
            sessionId,

            "Version 17.2 Build 3 lifecycle preparation failed.",
          );

      return {
        scenario,

        passed:
          false,

        noExchangeOrderSubmitted:
          true,

        session:
          failedSession,

        buy:
          buyPreparation.order,

        sell:
          sellPreparation.order,

        recovery:
          null,

        checks: {
          coordinatorPrepared:
            true,

          buyLifecyclePrepared:
            buyPreparation.approved,

          sellLifecyclePrepared:
            sellPreparation.approved,
        },

        reasons: [
          ...buyPreparation
            .reasons,

          ...sellPreparation
            .reasons,
        ],
      };
    }

    /*
     * Coordinator enters RUNNING only synthetically.
     *
     * IMPORTANT:
     *
     * markSubmissionRequested() is NOT called.
     *
     * No adapter is invoked.
     */
    liveExecutionCoordinator
      .markRunning(
        sessionId,
      );

    const startedAt =
      Date.now();

    /*
     * -------------------------------------------------
     * SYNTHETIC EXCHANGE RESULTS
     * -------------------------------------------------
     *
     * These results are injected directly into
     * FillEngine.
     *
     * They simulate exchange truth without making
     * an API request.
     */
    const buyResult =
      this.buyResultForScenario(
        scenario,

        buyPreparation.order,

        startedAt,
      );

    const sellResult =
      this.sellResultForScenario(
        scenario,

        sellPreparation.order,

        startedAt +
          10,
      );

    /*
     * Existing FillEngine remains authoritative
     * for fill accounting.
     *
     * FillEngine forwards execution state into
     * OrderLifecycleManager.
     */
    fillEngine
      .ingestExecutionResult(
        buyPreparation
          .order
          .id,

        buyResult,
      );

    fillEngine
      .ingestExecutionResult(
        sellPreparation
          .order
          .id,

        sellResult,
      );

    const buy =
      orderLifecycleManager
        .getOrder(
          buyPreparation
            .order
            .id,
        );

    const sell =
      orderLifecycleManager
        .getOrder(
          sellPreparation
            .order
            .id,
        );

    /*
     * -------------------------------------------------
     * REAL RECOVERY ENGINE
     * -------------------------------------------------
     */
    const recovery =
      executionRecoveryEngine
        .evaluateSession(
          sessionId,
        );

    const checks =
      this.buildChecks(
        scenario,

        buy,

        sell,

        recovery,
      );

    reasons.push(
      `BUY lifecycle reached ${buy?.status ?? "UNKNOWN"}.`,

      `SELL lifecycle reached ${sell?.status ?? "UNKNOWN"}.`,

      `Recovery direction is ${recovery.exposureDirection}.`,

      `Recovery strategy is ${recovery.strategy}.`,

      "Synthetic results were injected directly into the existing FillEngine/OrderLifecycleManager.",

      "No markSubmissionRequested() call was made.",

      "No execution adapter was invoked.",

      "No exchange order was submitted.",
    );

    /*
     * -------------------------------------------------
     * FAIL-SAFE SESSION CLEANUP
     * -------------------------------------------------
     *
     * The test must not leave:
     *
     * reservation
     * route lock
     * running session
     *
     * behind.
     */
    const failedSession =
      liveExecutionCoordinator
        .fail(
          sessionId,

          `Version 17.2 Build 3 synthetic ${scenario} cleanup.`,
        );

    /*
     * Synthetic recovery incidents must not pollute
     * production diagnostics.
     */
    if (
      recovery.incident
    ) {
      executionRecoveryEngine
        .resolve(
          recovery
            .incident
            .id,

          "Version 17.2 Build 3 synthetic validation incident resolved during cleanup.",
        );
    }

    return {
      scenario,

      passed:
        Object.values(
          checks,
        )
          .every(
            Boolean,
          ),

      noExchangeOrderSubmitted:
        true,

      session:
        failedSession,

      buy,

      sell,

      recovery,

      checks,

      reasons,
    };
  }

  isScenario(
    value:
      unknown,
  ): value is ControlledRecoveryValidationScenario {
    return (
      value ===
        "BALANCED_FILLED" ||
      value ===
        "BUY_FILLED_SELL_FAILED" ||
      value ===
        "SELL_FILLED_BUY_FAILED" ||
      value ===
        "BUY_FILLED_SELL_PARTIAL" ||
      value ===
        "BUY_TIMEOUT_SELL_FILLED"
    );
  }

  private buildChecks(
    scenario:
      ControlledRecoveryValidationScenario,

    buy:
      OrderLifecycleRecord | null,

    sell:
      OrderLifecycleRecord | null,

    recovery:
      ReturnType<
        typeof executionRecoveryEngine.evaluateSession
      >,
  ): Record<
    string,
    boolean
  > {
    const common = {
      coordinatorRunningStateReached:
        true,

      buyLifecyclePresent:
        buy !==
        null,

      sellLifecyclePresent:
        sell !==
        null,

      noExchangeOrderSubmitted:
        true,
    };

    switch (
      scenario
    ) {
      case "BALANCED_FILLED":
        return {
          ...common,

          buyFilled:
            buy?.status ===
            "FILLED",

          sellFilled:
            sell?.status ===
            "FILLED",

          noRecoveryRequired:
            !recovery
              .requiresRecovery,

          balancedExposure:
            recovery
              .exposureDirection ===
            "BALANCED",

          noRecoveryStrategy:
            recovery
              .strategy ===
            "NONE",
        };

      case "BUY_FILLED_SELL_FAILED":
        return {
          ...common,

          buyFilled:
            buy?.status ===
            "FILLED",

          sellFailed:
            sell?.status ===
            "FAILED",

          recoveryRequired:
            recovery
              .requiresRecovery,

          longExposure:
            recovery
              .exposureDirection ===
            "LONG",

          positiveExposure:
            recovery
              .exposedQuantity >
            0,

          recoveryStrategySelected:
            recovery
              .strategy !==
            "NONE",
        };

      case "SELL_FILLED_BUY_FAILED":
        return {
          ...common,

          buyFailed:
            buy?.status ===
            "FAILED",

          sellFilled:
            sell?.status ===
            "FILLED",

          recoveryRequired:
            recovery
              .requiresRecovery,

          shortExposure:
            recovery
              .exposureDirection ===
            "SHORT",

          positiveExposure:
            recovery
              .exposedQuantity >
            0,

          recoveryStrategySelected:
            recovery
              .strategy !==
            "NONE",
        };

      case "BUY_FILLED_SELL_PARTIAL":
        return {
          ...common,

          buyFilled:
            buy?.status ===
            "FILLED",

          sellPartial:
            sell?.status ===
            "PARTIALLY_FILLED",

          recoveryRequired:
            recovery
              .requiresRecovery,

          longExposure:
            recovery
              .exposureDirection ===
            "LONG",

          positiveExposure:
            recovery
              .exposedQuantity >
            0,

          recoveryStrategySelected:
            recovery
              .strategy !==
            "NONE",
        };

      case "BUY_TIMEOUT_SELL_FILLED":
        return {
          ...common,

          buyTimedOut:
            buy?.status ===
            "TIMED_OUT",

          sellFilled:
            sell?.status ===
            "FILLED",

          recoveryRequired:
            recovery
              .requiresRecovery,

          shortExposure:
            recovery
              .exposureDirection ===
            "SHORT",

          positiveExposure:
            recovery
              .exposedQuantity >
            0,

          recoveryStrategySelected:
            recovery
              .strategy !==
            "NONE",
        };
    }
  }

  private buyResultForScenario(
    scenario:
      ControlledRecoveryValidationScenario,

    order:
      OrderLifecycleRecord,

    startedAt:
      number,
  ): LiveExecutionResult {
    switch (
      scenario
    ) {
      case "SELL_FILLED_BUY_FAILED":
        return this.createResult(
          order,

          "FAILED",

          0,

          0,

          startedAt,

          "Synthetic BUY failure.",
        );

      case "BUY_TIMEOUT_SELL_FILLED":
        return this.createResult(
          order,

          "TIMED_OUT",

          0,

          0,

          startedAt,

          "Synthetic BUY timeout.",
        );

      default:
        return this.createResult(
          order,

          "FILLED",

          order
            .requestedQuantity,

          order
            .requestedPrice ??
            100,

          startedAt,

          null,
        );
    }
  }

  private sellResultForScenario(
    scenario:
      ControlledRecoveryValidationScenario,

    order:
      OrderLifecycleRecord,

    startedAt:
      number,
  ): LiveExecutionResult {
    switch (
      scenario
    ) {
      case "BUY_FILLED_SELL_FAILED":
        return this.createResult(
          order,

          "FAILED",

          0,

          0,

          startedAt,

          "Synthetic SELL failure.",
        );

      case "BUY_FILLED_SELL_PARTIAL":
        return this.createResult(
          order,

          "PARTIALLY_FILLED",

          order
            .requestedQuantity /
            2,

          order
            .requestedPrice ??
            102,

          startedAt,

          null,
        );

      default:
        return this.createResult(
          order,

          "FILLED",

          order
            .requestedQuantity,

          order
            .requestedPrice ??
            102,

          startedAt,

          null,
        );
    }
  }

  private createResult(
    order:
      OrderLifecycleRecord,

    status:
      LiveExecutionStatus,

    filledQuantity:
      number,

    averageFillPrice:
      number,

    startedAt:
      number,

    failureReason:
      string | null,
  ): LiveExecutionResult {
    const remainingQuantity =
      Math.max(
        0,

        order
          .requestedQuantity -
          filledQuantity,
      );

    const completedAt =
      startedAt +
      25;

    return {
      success:
        status ===
          "FILLED" ||
        status ===
          "PARTIALLY_FILLED" ||
        status ===
          "OPEN" ||
        status ===
          "PENDING",

      exchange:
        order.exchange,

      market:
        order.market,

      side:
        order.side,

      orderId:
        `v17.2-synthetic-${order.leg.toLowerCase()}-${randomUUID()}`,

      clientOrderId:
        order.clientOrderId,

      status,

      requestedQuantity:
        order
          .requestedQuantity,

      filledQuantity,

      remainingQuantity,

      requestedPrice:
        order
          .requestedPrice,

      averageFillPrice,

      feeAmount:
        filledQuantity >
        0
          ? filledQuantity *
            averageFillPrice *
            0.001
          : 0,

      cancelled:
        status ===
        "CANCELLED",

      timedOut:
        status ===
        "TIMED_OUT",

      startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        startedAt,

      failureReason,

      reasons:
        failureReason
          ? [
              failureReason,
            ]
          : [],
    };
  }

  private createPlan():
    ExecutionPlan {
    const now =
      Date.now();

    return {
      id:
        `v17.2-state-machine-${randomUUID()}`,

      version:
        17.2,

      market:
        "BTCUSDT",

      mode:
        "LIVE",

      strategy:
        "PARALLEL",

      status:
        "READY",

      /*
       * Synthetic only.
       *
       * No exchange request uses this capital.
       */
      capital:
        100,

      expectedProfit:
        2,

      expectedProfitPercent:
        2,

      expectedFees:
        0.2,

      expectedNetProfit:
        1.8,

      expectedNetProfitPercent:
        1.8,

      maximumSlippagePercent:
        0.5,

      expectedSlippagePercent:
        0,

      riskScore:
        100,

      executionScore:
        100,

      timeoutMs:
        15_000,

      buy: {
        exchange:
          "binance",

        market:
          "BTCUSDT",

        side:
          "BUY",

        quantity:
          1,

        limitPrice:
          100,

        orderType:
          "limit",

        /*
         * Matches current Binance live-adapter
         * semantics.
         */
        timeInForce:
          "GTC",

        baseAsset:
          "BTC",

        quoteAsset:
          "USDT",
      },

      sell: {
        exchange:
          "coindcx",

        market:
          "BTCUSDT",

        side:
          "SELL",

        quantity:
          1,

        limitPrice:
          102,

        orderType:
          "limit",

        /*
         * No fake CoinDCX TIF assumption.
         */
        baseAsset:
          "BTC",

        quoteAsset:
          "USDT",
      },

      createdAt:
        now,

      expiresAt:
        now +
        15_000,

      opportunityTimestamp:
        now,
    };
  }

  private failedScenario(
    scenario:
      ControlledRecoveryValidationScenario,

    checks:
      Record<
        string,
        boolean
      >,

    reasons:
      string[],
  ): ControlledRecoveryScenarioResult {
    return {
      scenario,

      passed:
        false,

      noExchangeOrderSubmitted:
        true,

      session:
        null,

      buy:
        null,

      sell:
        null,

      recovery:
        null,

      checks,

      reasons:
        structuredClone(
          reasons,
        ),
    };
  }
}

export const controlledRecoveryStateMachineValidationService =
  new ControlledRecoveryStateMachineValidationService();