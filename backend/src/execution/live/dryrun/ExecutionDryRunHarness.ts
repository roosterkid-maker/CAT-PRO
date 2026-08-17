import {
  randomUUID,
} from "node:crypto";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import type {
  ExecutionPlan,
} from "../../../trading/models/ExecutionPlan";

import {
  liveExecutionCoordinator,
} from "../coordinator/LiveExecutionCoordinator";

import {
  fillEngine,
} from "../fills/FillEngine";

import {
  orderLifecycleManager,
} from "../lifecycle/OrderLifecycleManager";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

import {
  executionReconciliationEngine,
} from "../reconciliation/ExecutionReconciliationEngine";

import {
  executionRecoveryEngine,
} from "../recovery/ExecutionRecoveryEngine";

import {
  executionSettlementService,
} from "../settlement/ExecutionSettlementService";

export type ExecutionDryRunScenario =
  | "BALANCED_SUCCESS"
  | "SELL_FAILED";

export interface ExecutionDryRunResult {
  scenario:
    ExecutionDryRunScenario;

  passed:
    boolean;

  generatedAt:
    number;

  noExchangeOrderSubmitted:
    true;

  sessionId:
    string | null;

  accountCapitalBefore:
    number;

  accountCapitalAfter:
    number;

  accountCapitalUnchanged:
    boolean;

  checks:
    Record<
      string,
      boolean
    >;

  data:
    Record<
      string,
      unknown
    >;
}

export class ExecutionDryRunHarness {
  run(
    scenario:
      ExecutionDryRunScenario,
  ): ExecutionDryRunResult {
    const accountBefore =
      tradingAccountService
        .getAccount();

    const plan =
      this.createPlan();

    const preparation =
      liveExecutionCoordinator
        .prepareDryRun(
          plan,
        );

    if (
      !preparation.approved ||
      !preparation.session
    ) {
      return {
        scenario,

        passed:
          false,

        generatedAt:
          Date.now(),

        noExchangeOrderSubmitted:
          true,

        sessionId:
          null,

        accountCapitalBefore:
          accountBefore
            .currentCapital,

        accountCapitalAfter:
          tradingAccountService
            .getAccount()
            .currentCapital,

        accountCapitalUnchanged:
          true,

        checks: {
          coordinatorPrepared:
            false,
        },

        data: {
          preparation,
        },
      };
    }

    const sessionId =
      preparation
        .session
        .id;

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
      liveExecutionCoordinator
        .fail(
          sessionId,
          "Dry-run lifecycle preparation failed.",
        );

      return this.failureResult(
        scenario,
        sessionId,
        accountBefore.currentCapital,
        {
          preparation,
          buyPreparation,
          sellPreparation,
        },
      );
    }

    liveExecutionCoordinator
      .markRunning(
        sessionId,
      );

    const startedAt =
      Date.now();

    const buyResult =
      this.createFilledResult({
        exchange:
          buyPreparation
            .order
            .exchange,

        market:
          buyPreparation
            .order
            .market,

        side:
          "buy",

        quantity:
          buyPreparation
            .order
            .requestedQuantity,

        requestedPrice:
          buyPreparation
            .order
            .requestedPrice ??
          100,

        averageFillPrice:
          100,

        feeAmount:
          1,

        clientOrderId:
          buyPreparation
            .order
            .clientOrderId,

        orderId:
          `dry-buy-${randomUUID()}`,

        startedAt,
      });

    const buyFill =
      fillEngine
        .ingestExecutionResult(
          buyPreparation
            .order
            .id,

          buyResult,
        );

    const buyReconciliation =
      executionReconciliationEngine
        .reconcileSynthetic(
          buyPreparation
            .order
            .id,

          buyResult,
        );

    if (
      scenario ===
      "BALANCED_SUCCESS"
    ) {
      const sellResult =
        this.createFilledResult({
          exchange:
            sellPreparation
              .order
              .exchange,

          market:
            sellPreparation
              .order
              .market,

          side:
            "sell",

          quantity:
            sellPreparation
              .order
              .requestedQuantity,

          requestedPrice:
            sellPreparation
              .order
              .requestedPrice ??
            102,

          averageFillPrice:
            102,

          feeAmount:
            1.02,

          clientOrderId:
            sellPreparation
              .order
              .clientOrderId,

          orderId:
            `dry-sell-${randomUUID()}`,

          startedAt:
            startedAt +
            20,
        });

      const sellFill =
        fillEngine
          .ingestExecutionResult(
            sellPreparation
              .order
              .id,

            sellResult,
          );

      const sellReconciliation =
        executionReconciliationEngine
          .reconcileSynthetic(
            sellPreparation
              .order
              .id,

            sellResult,
          );

      const recovery =
        executionRecoveryEngine
          .evaluateSession(
            sessionId,
          );

      const settlement =
        executionSettlementService
          .settle(
            sessionId,
          );

      const audit =
        executionSettlementService
          .getAudit(
            sessionId,
          );

      const finalSession =
        liveExecutionCoordinator
          .getSession(
            sessionId,
          );

      const accountAfter =
        tradingAccountService
          .getAccount();

      const checks = {
        coordinatorPrepared:
          preparation.approved,

        buyLifecyclePrepared:
          buyPreparation.approved,

        sellLifecyclePrepared:
          sellPreparation.approved,

        buyFilled:
          buyFill.complete,

        sellFilled:
          sellFill.complete,

        buyReconciliationMatched:
          buyReconciliation
            .status ===
          "MATCHED",

        sellReconciliationMatched:
          sellReconciliation
            .status ===
          "MATCHED",

        exposureBalanced:
          !recovery
            .requiresRecovery,

        settlementCompleted:
          settlement.status ===
          "SETTLED",

        expectedGrossProfit:
          this.closeEnough(
            settlement.grossProfit,
            20,
          ),

        expectedFees:
          this.closeEnough(
            settlement.totalFees,
            2.02,
          ),

        expectedNetProfit:
          this.closeEnough(
            settlement.netProfit,
            17.98,
          ),

        coordinatorCompleted:
          finalSession
            ?.status ===
          "COMPLETED",

        auditCreated:
          audit.events.length >
          0,

        accountCapitalUnchanged:
          this.closeEnough(
            accountBefore
              .currentCapital,

            accountAfter
              .currentCapital,
          ),
      };

      return {
        scenario,

        passed:
          Object.values(
            checks,
          )
            .every(
              Boolean,
            ),

        generatedAt:
          Date.now(),

        noExchangeOrderSubmitted:
          true,

        sessionId,

        accountCapitalBefore:
          accountBefore
            .currentCapital,

        accountCapitalAfter:
          accountAfter
            .currentCapital,

        accountCapitalUnchanged:
          checks
            .accountCapitalUnchanged,

        checks,

        data: {
          preparation,

          buyFill,

          sellFill,

          buyReconciliation,

          sellReconciliation,

          recovery,

          settlement,

          finalSession,

          audit,
        },
      };
    }

    /*
     * SELL_FAILED scenario.
     */
    const sellResult =
      this.createFailedResult({
        exchange:
          sellPreparation
            .order
            .exchange,

        market:
          sellPreparation
            .order
            .market,

        side:
          "sell",

        quantity:
          sellPreparation
            .order
            .requestedQuantity,

        requestedPrice:
          sellPreparation
            .order
            .requestedPrice ??
          102,

        clientOrderId:
          sellPreparation
            .order
            .clientOrderId,

        orderId:
          `dry-sell-failed-${randomUUID()}`,

        startedAt:
          startedAt +
          20,
      });

    const sellFill =
      fillEngine
        .ingestExecutionResult(
          sellPreparation
            .order
            .id,

          sellResult,
        );

    const sellReconciliation =
      executionReconciliationEngine
        .reconcileSynthetic(
          sellPreparation
            .order
            .id,

          sellResult,
        );

    const recovery =
      executionRecoveryEngine
        .evaluateSession(
          sessionId,
        );

    const settlement =
      executionSettlementService
        .settle(
          sessionId,
        );

    /*
     * Test has now proven the blocked state.
     *
     * Clean up reserved capital and route lock
     * after evidence is captured.
     */
    const failedSession =
      liveExecutionCoordinator
        .fail(
          sessionId,
          "Version 14.6 SELL_FAILED dry-run cleanup.",
        );

    const audit =
      executionSettlementService
        .getAudit(
          sessionId,
        );

    const accountAfter =
      tradingAccountService
        .getAccount();

    const checks = {
      coordinatorPrepared:
        preparation.approved,

      buyFilled:
        buyFill.complete,

      sellFailed:
        sellFill.lastStatus ===
        "FAILED",

      buyReconciliationMatched:
        buyReconciliation
          .status ===
        "MATCHED",

      sellReconciliationMatched:
        sellReconciliation
          .status ===
        "MATCHED",

      recoveryDetected:
        recovery
          .requiresRecovery,

      longExposureDetected:
        recovery
          .exposureDirection ===
        "LONG",

      recoveryCritical:
        recovery
          .severity ===
        "CRITICAL",

      emergencyExitRecommended:
        recovery
          .strategy ===
        "EMERGENCY_EXIT",

      settlementBlocked:
        settlement.status ===
        "BLOCKED",

      coordinatorFailed:
        failedSession.status ===
        "FAILED",

      auditCreated:
        audit.events.length >
        0,

      accountCapitalUnchanged:
        this.closeEnough(
          accountBefore
            .currentCapital,

          accountAfter
            .currentCapital,
        ),
    };

    return {
      scenario,

      passed:
        Object.values(
          checks,
        )
          .every(
            Boolean,
          ),

      generatedAt:
        Date.now(),

      noExchangeOrderSubmitted:
        true,

      sessionId,

      accountCapitalBefore:
        accountBefore
          .currentCapital,

      accountCapitalAfter:
        accountAfter
          .currentCapital,

      accountCapitalUnchanged:
        checks
          .accountCapitalUnchanged,

      checks,

      data: {
        preparation,

        buyFill,

        sellFill,

        buyReconciliation,

        sellReconciliation,

        recovery,

        settlement,

        failedSession,

        audit,
      },
    };
  }

  runSuite() {
    const balanced =
      this.run(
        "BALANCED_SUCCESS",
      );

    const sellFailed =
      this.run(
        "SELL_FAILED",
      );

    return {
      generatedAt:
        Date.now(),

      passed:
        balanced.passed &&
        sellFailed.passed,

      scenarios: [
        balanced,
        sellFailed,
      ],
    };
  }

  isScenario(
    value:
      unknown,
  ): value is ExecutionDryRunScenario {
    return (
      value ===
        "BALANCED_SUCCESS" ||
      value ===
        "SELL_FAILED"
    );
  }

  private createPlan():
    ExecutionPlan {
    const now =
      Date.now();

    return {
      id:
        `dryrun-${randomUUID()}`,

      version:
        1,

      market:
        "BTCUSDT",

      mode:
        "LIVE",

      strategy:
        "PARALLEL",

      status:
        "READY",

      capital:
        1_000,

      expectedProfit:
        20,

      expectedProfitPercent:
        2,

      expectedFees:
        2.02,

      expectedNetProfit:
        17.98,

      expectedNetProfitPercent:
        1.798,

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
          10,

        limitPrice:
          100,

        orderType:
          "limit",

        timeInForce:
          "IOC",

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
          10,

        limitPrice:
          102,

        orderType:
          "limit",

        timeInForce:
          "IOC",

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

  private createFilledResult(
    input: {
      exchange:
        string;

      market:
        string;

      side:
        "buy" |
        "sell";

      quantity:
        number;

      requestedPrice:
        number;

      averageFillPrice:
        number;

      feeAmount:
        number;

      clientOrderId:
        string |
        null;

      orderId:
        string;

      startedAt:
        number;
    },
  ): LiveExecutionResult {
    const completedAt =
      input.startedAt +
      100;

    return {
      success:
        true,

      exchange:
        input.exchange,

      market:
        input.market,

      side:
        input.side,

      orderId:
        input.orderId,

      clientOrderId:
        input.clientOrderId,

      status:
        "FILLED",

      requestedQuantity:
        input.quantity,

      filledQuantity:
        input.quantity,

      remainingQuantity:
        0,

      requestedPrice:
        input.requestedPrice,

      averageFillPrice:
        input.averageFillPrice,

      feeAmount:
        input.feeAmount,

      cancelled:
        false,

      timedOut:
        false,

      startedAt:
        input.startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        input.startedAt,

      failureReason:
        null,

      reasons: [
        "Version 14.6 synthetic filled result.",
      ],
    };
  }

  private createFailedResult(
    input: {
      exchange:
        string;

      market:
        string;

      side:
        "buy" |
        "sell";

      quantity:
        number;

      requestedPrice:
        number;

      clientOrderId:
        string |
        null;

      orderId:
        string;

      startedAt:
        number;
    },
  ): LiveExecutionResult {
    const completedAt =
      input.startedAt +
      100;

    return {
      success:
        false,

      exchange:
        input.exchange,

      market:
        input.market,

      side:
        input.side,

      orderId:
        input.orderId,

      clientOrderId:
        input.clientOrderId,

      status:
        "FAILED",

      requestedQuantity:
        input.quantity,

      filledQuantity:
        0,

      remainingQuantity:
        input.quantity,

      requestedPrice:
        input.requestedPrice,

      averageFillPrice:
        0,

      feeAmount:
        0,

      cancelled:
        false,

      timedOut:
        false,

      startedAt:
        input.startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        input.startedAt,

      failureReason:
        "Synthetic SELL leg failure.",

      reasons: [
        "Version 14.6 deliberately injected SELL failure.",
      ],
    };
  }

  private failureResult(
    scenario:
      ExecutionDryRunScenario,

    sessionId:
      string,

    capitalBefore:
      number,

    data:
      Record<
        string,
        unknown
      >,
  ): ExecutionDryRunResult {
    const capitalAfter =
      tradingAccountService
        .getAccount()
        .currentCapital;

    return {
      scenario,

      passed:
        false,

      generatedAt:
        Date.now(),

      noExchangeOrderSubmitted:
        true,

      sessionId,

      accountCapitalBefore:
        capitalBefore,

      accountCapitalAfter:
        capitalAfter,

      accountCapitalUnchanged:
        this.closeEnough(
          capitalBefore,
          capitalAfter,
        ),

      checks: {
        dryRunCompleted:
          false,
      },

      data,
    };
  }

  private closeEnough(
    first:
      number,

    second:
      number,
  ): boolean {
    return (
      Math.abs(
        first -
        second,
      ) <=
      1e-8
    );
  }
}

export const executionDryRunHarness =
  new ExecutionDryRunHarness();