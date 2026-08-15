import {
  randomUUID,
} from "node:crypto";

import {
  getExchangeFees,
} from "../../arbitrage/config/fees";

import {
  paperVdaTaxWithholdingService,
} from "../services/PaperVdaTaxWithholdingService";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  liveExecutionSessionEvidenceService,
} from "../../execution/live/coordinator/LiveExecutionSessionEvidenceService";

import {
  fillEngine,
} from "../../execution/live/fills/FillEngine";

import {
  orderLifecycleManager,
} from "../../execution/live/lifecycle/OrderLifecycleManager";

import type {
  LiveExecutionResult,
  LiveExecutionStatus,
} from "../../execution/live/models/LiveExecutionResult";

import {
  executionReconciliationEngine,
} from "../../execution/live/reconciliation/ExecutionReconciliationEngine";

import {
  executionRecoveryEngine,
} from "../../execution/live/recovery/ExecutionRecoveryEngine";

import {
  executionSettlementService,
} from "../../execution/live/settlement/ExecutionSettlementService";

import {
  cloneStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import {
  capitalReservationService,
} from "../capital/CapitalReservationService";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import type {
  ExecutionLegResult,
  ExecutionResult,
} from "../models/ExecutionResult";

import type {
  ExecutionPlan,
} from "../models/ExecutionPlan";

import type {
  PaperTwoLegExecutionLifecycleResult,
} from "../models/PaperTwoLegExecutionLifecycle";

import {
  defaultPaperExecutionConfig,
  paperOrderExecutor,
} from "./PaperOrderExecutor";

import {
  paperRecoveryActionExecutorService,
} from "./PaperRecoveryActionExecutorService";

import type {
  PaperExecutionConfig,
} from "./PaperOrderExecutor";

/**
 * Runs PAPER legs through CAT PRO's existing coordinator, lifecycle, fill,
 * recovery, reconciliation, and settlement state machines. The only leg
 * execution is deterministic PAPER simulation; no live adapter is reachable.
 */
export class PaperTwoLegExecutionLifecycleService {
  execute(
    plan:
      ExecutionPlan,

    strategyAttribution:
      StrategyAttribution,

    config:
      PaperExecutionConfig =
      defaultPaperExecutionConfig,

    recoveryConfig:
      PaperExecutionConfig =
      defaultPaperExecutionConfig,
  ): PaperTwoLegExecutionLifecycleResult {
    if (
      plan.mode !==
      "PAPER"
    ) {
      throw new Error(
        "PAPER two-leg lifecycle requires a PAPER execution plan.",
      );
    }

    const preparation =
      liveExecutionCoordinator
        .preparePaper(
          plan,
        );

    if (
      !preparation.approved ||
      !preparation.session
    ) {
      throw new Error(
        preparation.reasons.join(
          " | ",
        ) ||
        "PAPER two-leg lifecycle preparation failed.",
      );
    }

    const sessionId =
      preparation.session.id;

    try {
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
        throw new Error(
          [
            ...buyPreparation.reasons,
            ...sellPreparation.reasons,
          ].join(
            " | ",
          ) ||
          "PAPER order lifecycle preparation failed.",
        );
      }

      liveExecutionCoordinator
        .markRunning(
          sessionId,
        );

      const buyLeg =
        paperOrderExecutor
          .executeLeg(
            plan,
            "BUY",
            config,
          );

      const sellLeg =
        paperOrderExecutor
          .executeLeg(
            plan,
            "SELL",
            config,
          );

      const buyResult =
        this.toLifecycleResult(
          buyLeg,
          buyPreparation
            .order
            .clientOrderId,
        );

      const sellResult =
        this.toLifecycleResult(
          sellLeg,
          sellPreparation
            .order
            .clientOrderId,
        );

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

      const buyReconciliation =
        executionReconciliationEngine
          .reconcileSynthetic(
            buyPreparation
              .order
              .id,
            buyResult,
          );

      const sellReconciliation =
        executionReconciliationEngine
          .reconcileSynthetic(
            sellPreparation
              .order
              .id,
            sellResult,
          );

      const initialRecovery =
        executionRecoveryEngine
          .evaluateSession(
            sessionId,
          );

      const recoveryAction =
        initialRecovery
          .requiresRecovery
          ? paperRecoveryActionExecutorService
              .execute(
                plan,
                sessionId,
                initialRecovery,
                recoveryConfig,
              )
          : null;

      const recovery =
        recoveryAction
          ?.postRecovery ??
        initialRecovery;

      const settlement =
        executionSettlementService
          .settle(
            sessionId,
          );

      const effectiveBuyLeg =
        this.aggregateLegResult(
          sessionId,
          "BUY",
          plan,
          buyLeg,
        );

      const effectiveSellLeg =
        this.aggregateLegResult(
          sessionId,
          "SELL",
          plan,
          sellLeg,
        );

      const result =
        this.createExecutionResult(
          plan,
          strategyAttribution,
          effectiveBuyLeg,
          effectiveSellLeg,
          settlement.status ===
            "SETTLED"
            ? settlement.netProfit
            : null,
          settlement.status ===
            "SETTLED"
            ? settlement.totalFees
            : null,
        );

      if (
        settlement.status !==
        "SETTLED"
      ) {
        liveExecutionCoordinator
          .fail(
            sessionId,
            recovery.requiresRecovery
              ? `PAPER execution requires bounded recovery: ${recovery.reason}`
              : "PAPER execution could not settle because one or more legs were incomplete.",
          );
      }

      const finalSession =
        liveExecutionCoordinator
          .getSession(
            sessionId,
          );

      if (
        !finalSession
      ) {
        throw new Error(
          "PAPER execution session disappeared before final evidence capture.",
        );
      }

      liveExecutionSessionEvidenceService
        .captureSession(
          sessionId,
        );

      const audit =
        executionSettlementService
          .getAudit(
            sessionId,
          );

      const reservation =
        finalSession.reservationId
          ? capitalReservationService
              .getById(
                finalSession.reservationId,
              )
          : null;

      const status:
        PaperTwoLegExecutionLifecycleResult["status"] =
        settlement.status ===
          "SETTLED"
          ? "COMPLETED"
          : recovery.requiresRecovery
            ? "RECOVERY_REQUIRED"
            : "FAILED";

      return {
        status,
        sessionId,
        result,
        recovery,
        initialRecovery,
        recoveryAction,
        reconciliation: {
          buy:
            buyReconciliation,
          sell:
            sellReconciliation,
        },
        settlement,
        audit,
        capitalReservationFinalized:
          finalSession.reservationId ===
            null ||
          (
            reservation !==
              null &&
            reservation.status !==
              "ACTIVE"
          ),
        routeLockReleased:
          finalSession.status ===
            "COMPLETED" ||
          finalSession.status ===
            "FAILED",
        automaticRecoveryOrderSubmitted:
          false,
        automaticPaperRecoveryExecuted:
          recoveryAction
            ?.status ===
          "EXECUTED",
        liveOrderSubmissionAllowed:
          false,
        exchangeOrdersSubmitted:
          0,
        reasons: [
          status ===
            "COMPLETED"
            ? recoveryAction
                ?.status ===
                "EXECUTED"
              ? "Bounded PAPER recovery restored balance before reconciliation and settlement."
              : "Both PAPER legs filled, reconciled, and settled with balanced quantity."
            : recovery.reason,
          ...(
            recoveryAction
              ?.reasons ??
            []
          ),
          ...settlement.reasons,
          "No live adapter execute method was invoked.",
          "Automatic recovery order submission remains disabled.",
        ],
      };
    } catch (
      error:
        unknown
    ) {
      const session =
        liveExecutionCoordinator
          .getSession(
            sessionId,
          );

      if (
        session &&
        [
          "VALIDATING",
          "RESERVED",
          "READY_FOR_SUBMISSION",
          "RUNNING",
        ].includes(
          session.status,
        )
      ) {
        liveExecutionCoordinator
          .fail(
            sessionId,
            error instanceof Error
              ? error.message
              : "Unknown PAPER two-leg lifecycle failure.",
          );
      }

      liveExecutionSessionEvidenceService
        .captureSession(
          sessionId,
        );

      throw error;
    }
  }

  private toLifecycleResult(
    leg:
      ExecutionLegResult,

    clientOrderId:
      string | null,
  ): LiveExecutionResult {
    const status =
      this.toLiveStatus(
        leg.status,
      );

    const feePercent =
      getExchangeFees(
        leg.exchange,
        leg.market,
      ).takerPercent;

    const feeAmount =
      leg.filledQuantity *
      leg.averageFillPrice *
      (
        feePercent /
        100
      );

    const completedAt =
      leg.completedAt ??
      Date.now();

    return {
      success:
        status ===
        "FILLED",
      exchange:
        leg.exchange,
      market:
        leg.market,
      side:
        leg.side ===
          "BUY"
          ? "buy"
          : "sell",
      orderId:
        leg.orderId ??
        `paper-${randomUUID()}`,
      clientOrderId,
      status,
      requestedQuantity:
        leg.requestedQuantity,
      filledQuantity:
        leg.filledQuantity,
      remainingQuantity:
        Math.max(
          0,
          leg.requestedQuantity -
            leg.filledQuantity,
        ),
      requestedPrice:
        leg.requestedPrice,
      averageFillPrice:
        leg.averageFillPrice,
      feeAmount,
      cancelled:
        status ===
        "CANCELLED",
      timedOut:
        false,
      startedAt:
        leg.startedAt,
      completedAt,
      executionTimeMs:
        Math.max(
          0,
          completedAt -
            leg.startedAt,
        ),
      failureReason:
        leg.error,
      reasons:
        leg.error
          ? [
              leg.error,
            ]
          : [
              "Synthetic PAPER leg completed.",
            ],
    };
  }

  private toLiveStatus(
    status:
      ExecutionLegResult["status"],
  ): LiveExecutionStatus {
    switch (
      status
    ) {
      case "FILLED":
        return "FILLED";
      case "PARTIALLY_FILLED":
        return "PARTIALLY_FILLED";
      case "CANCELLED":
        return "CANCELLED";
      case "FAILED":
        return "FAILED";
      case "PENDING":
      default:
        return "PENDING";
    }
  }

  private aggregateLegResult(
    sessionId:
      string,

    side:
      "BUY" |
      "SELL",

    plan:
      ExecutionPlan,

    fallback:
      ExecutionLegResult,
  ): ExecutionLegResult {
    const planLeg =
      side ===
        "BUY"
        ? plan.buy
        : plan.sell;

    const orders =
      orderLifecycleManager
        .getBySession(
          sessionId,
        )
        .filter(
          (
            order,
          ) =>
            order.leg ===
            side,
        );

    const summaries =
      orders
        .map(
          (
            order,
          ) =>
            fillEngine
              .getSummary(
                order.id,
              ),
        )
        .filter(
          (
            summary,
          ): summary is NonNullable<typeof summary> =>
            summary !==
            null,
        );

    const filledQuantity =
      summaries.reduce(
        (
          total,
          summary,
        ) =>
          total +
          summary.filledQuantity,
        0,
      );

    const notional =
      summaries.reduce(
        (
          total,
          summary,
        ) =>
          total +
          summary.grossNotional,
        0,
      );

    const tolerance =
      Math.max(
        1e-12,
        planLeg.quantity *
          1e-9,
      );

    const complete =
      filledQuantity >=
      planLeg.quantity -
        tolerance;

    const latestOrder =
      orders[
        orders.length -
          1
      ];

    const latestFilledOrder =
      [
        ...orders,
      ]
        .reverse()
        .find(
          (
            order,
          ) =>
            (
              fillEngine
                .getSummary(
                  order.id,
                )
                ?.filledQuantity ??
              0
            ) >
            0,
        );

    const terminalFailure =
      latestOrder
        ?.status ===
          "FAILED" ||
      latestOrder
        ?.status ===
          "REJECTED" ||
      latestOrder
        ?.status ===
          "CANCELLED" ||
      latestOrder
        ?.status ===
          "TIMED_OUT" ||
      latestOrder
        ?.status ===
          "ABORTED";

    return {
      exchange:
        latestFilledOrder
          ?.exchange ??
        planLeg.exchange,
      market:
        plan.market,
      side,
      requestedQuantity:
        planLeg.quantity,
      filledQuantity,
      requestedPrice:
        latestFilledOrder
          ?.requestedPrice ??
        planLeg.limitPrice,
      averageFillPrice:
        filledQuantity >
          0
          ? notional /
            filledQuantity
          : 0,
      status:
        complete
          ? "FILLED"
          : filledQuantity >
              0
            ? "PARTIALLY_FILLED"
            : terminalFailure
              ? "FAILED"
              : fallback.status,
      orderId:
        latestFilledOrder
          ?.exchangeOrderId ??
        latestOrder
          ?.exchangeOrderId ??
        fallback.orderId,
      error:
        complete
          ? null
          : latestOrder
              ?.failureReason ??
            fallback.error,
      startedAt:
        orders.length >
          0
          ? Math.min(
              ...orders.map(
                (
                  order,
                ) =>
                  order.submittedAt ??
                  order.createdAt,
              ),
            )
          : fallback.startedAt,
      completedAt:
        orders.length >
          0
          ? Math.max(
              ...orders.map(
                (
                  order,
                ) =>
                  order.completedAt ??
                  order.updatedAt,
              ),
            )
          : fallback.completedAt,
    };
  }

  private createExecutionResult(
    plan:
      ExecutionPlan,

    strategyAttribution:
      StrategyAttribution,

    buy:
      ExecutionLegResult,

    sell:
      ExecutionLegResult,

    settledNetProfit:
      number | null,

    settledFees:
      number | null,
  ): ExecutionResult {
    const matchedQuantity =
      Math.min(
        buy.filledQuantity,
        sell.filledQuantity,
      );

    const buyNotional =
      matchedQuantity *
      buy.averageFillPrice;

    const sellNotional =
      matchedQuantity *
      sell.averageFillPrice;

    const grossProfit =
      sellNotional -
      buyNotional;

    const fallbackFees =
      this.calculateFee(
        buy,
      ) +
      this.calculateFee(
        sell,
      );

    const totalFees =
      settledFees ??
      fallbackFees;

    const netProfit =
      settledNetProfit ??
      grossProfit -
        totalFees;

    const buyFee =
      this.calculateFee(
        buy,
      );

    const sellFee =
      this.calculateFee(
        sell,
      );

    const paperVdaTaxWithholding =
      paperVdaTaxWithholdingService
        .calculate({
          market:
            plan.market,
          quoteAsset:
            plan.buy.quoteAsset ??
            plan.sell.quoteAsset,
          buyExchange:
            buy.exchange,
          sellExchange:
            sell.exchange,
          buyNotional,
          sellNotional,
          buyTradingFee:
            buyFee,
          sellTradingFee:
            sellFee,
        });

    const tdsWithheld =
      paperVdaTaxWithholding
        .totalWithheld;

    const deployableCashProfit =
      netProfit -
      tdsWithheld;

    const balanced =
      Math.abs(
        buy.filledQuantity -
          sell.filledQuantity,
      ) <=
      Math.max(
        1e-12,
        Math.max(
          buy.requestedQuantity,
          sell.requestedQuantity,
        ) *
          1e-9,
      );

    const completed =
      buy.status ===
        "FILLED" &&
      sell.status ===
        "FILLED" &&
      balanced &&
      settledNetProfit !==
        null;

    const anyFill =
      buy.filledQuantity >
        0 ||
      sell.filledQuantity >
        0;

    return {
      strategyAttribution:
        cloneStrategyAttribution(
          strategyAttribution,
        ),
      planId:
        plan.id,
      market:
        plan.market,
      mode:
        "PAPER",
      paperVdaTaxWithholding,
      quoteTdsWithheld:
        tdsWithheld,
      quoteDeployableCashProfit:
        deployableCashProfit,
      tdsWithheld,
      deployableCashProfit,
      status:
        completed
          ? "COMPLETED"
          : anyFill
            ? "PARTIALLY_COMPLETED"
            : "FAILED",
      buy:
        structuredClone(
          buy,
        ),
      sell:
        structuredClone(
          sell,
        ),
      capitalUsed:
        buy.filledQuantity *
        buy.averageFillPrice,
      grossProfit,
      totalFees,
      netProfit,
      netProfitPercent:
        buyNotional >
        0
          ? (
              netProfit /
              buyNotional
            ) *
            100
          : 0,
      startedAt:
        Math.min(
          buy.startedAt,
          sell.startedAt,
        ),
      completedAt:
        Math.max(
          buy.completedAt ??
            buy.startedAt,
          sell.completedAt ??
            sell.startedAt,
        ),
      successful:
        completed,
      failureReason:
        completed
          ? null
          : "PAPER two-leg lifecycle did not reach balanced settlement.",
    };
  }

  private calculateFee(
    leg:
      ExecutionLegResult,
  ): number {
    return (
      leg.filledQuantity *
      leg.averageFillPrice *
      (
        getExchangeFees(
          leg.exchange,
          leg.market,
        ).takerPercent /
        100
      )
    );
  }
}

export const paperTwoLegExecutionLifecycleService =
  new PaperTwoLegExecutionLifecycleService();
