import {
  randomUUID,
} from "node:crypto";

import {
  getExchangeFees,
} from "../../arbitrage/config/fees";

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
  LiveExecutionResult,
  LiveExecutionStatus,
} from "../../execution/live/models/LiveExecutionResult";

import {
  executionReconciliationEngine,
} from "../../execution/live/reconciliation/ExecutionReconciliationEngine";

import {
  executionRecoveryEngine,
} from "../../execution/live/recovery/ExecutionRecoveryEngine";

import type {
  ExecutionRecoveryEvaluation,
} from "../../execution/live/recovery/ExecutionRecoveryRecord";

import type {
  ExecutionLegResult,
} from "../models/ExecutionResult";

import type {
  ExecutionPlan,
} from "../models/ExecutionPlan";

import type {
  PaperRecoveryActionResult,
} from "../models/PaperRecoveryAction";

import {
  defaultPaperExecutionConfig,
  paperOrderExecutor,
} from "./PaperOrderExecutor";

import type {
  PaperExecutionConfig,
} from "./PaperOrderExecutor";

/**
 * Executes one bounded synthetic PAPER counter-leg for an existing recovery
 * incident. It cannot reach a live adapter and it never reserves more capital.
 */
export class PaperRecoveryActionExecutorService {
  private readonly completedByIncident =
    new Map<
      string,
      PaperRecoveryActionResult
    >();

  execute(
    plan:
      ExecutionPlan,

    sessionId:
      string,

    recovery:
      ExecutionRecoveryEvaluation,

    config:
      PaperExecutionConfig =
      defaultPaperExecutionConfig,
  ): PaperRecoveryActionResult {
    const incident =
      recovery.incident;

    if (
      !recovery.requiresRecovery ||
      !incident
    ) {
      throw new Error(
        "PAPER recovery action requires an open recovery incident.",
      );
    }

    const cached =
      this.completedByIncident
        .get(
          incident.id,
        );

    if (
      cached
    ) {
      return structuredClone(
        cached,
      );
    }

    const actionId =
      randomUUID();

    const session =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    const direction =
      recovery.exposureDirection;

    if (
      !session ||
      !liveExecutionCoordinator
        .isPaperSession(
          sessionId,
        ) ||
      session.status !==
        "RUNNING" ||
      session.planId !==
        plan.id ||
      plan.mode !==
        "PAPER" ||
      incident.sessionId !==
        sessionId ||
      incident.status ===
        "RESOLVED" ||
      (
        direction !==
          "LONG" &&
        direction !==
          "SHORT"
      )
    ) {
      return this.blocked(
        actionId,
        sessionId,
        incident.id,
        recovery,
        plan,
        "PAPER recovery session or incident lineage is not active and exact.",
      );
    }

    if (
      recovery.strategy !==
        "EMERGENCY_EXIT" &&
      recovery.strategy !==
        "RETRY_COUNTER_LEG"
    ) {
      return this.blocked(
        actionId,
        sessionId,
        incident.id,
        recovery,
        plan,
        `Recovery strategy ${recovery.strategy} is not eligible for automatic PAPER action.`,
      );
    }

    const side =
      direction ===
        "LONG"
        ? "SELL"
        : "BUY";

    const emergencyExit =
      recovery.strategy ===
      "EMERGENCY_EXIT";

    const sourceLeg =
      direction ===
        "LONG"
        ? emergencyExit
          ? plan.buy
          : plan.sell
        : emergencyExit
          ? plan.sell
          : plan.buy;

    const quantity =
      recovery.exposedQuantity;

    const maximumQuantity =
      Math.min(
        sourceLeg.quantity,
        recovery.exposedQuantity,
      );

    const maximumQuoteValue =
      sourceLeg.quantity *
      sourceLeg.limitPrice *
      (
        1 +
        plan.maximumSlippagePercent /
          100
      );

    const referenceQuoteValue =
      quantity *
      sourceLeg.limitPrice;

    if (
      !Number.isFinite(
        quantity,
      ) ||
      quantity <=
        0 ||
      quantity >
        maximumQuantity +
          this.quantityTolerance(
            maximumQuantity,
          ) ||
      !Number.isFinite(
        config.simulatedSlippagePercent,
      ) ||
      config.simulatedSlippagePercent <
        0 ||
      config.simulatedSlippagePercent >
        plan.maximumSlippagePercent ||
      referenceQuoteValue >
        maximumQuoteValue +
          this.quantityTolerance(
            maximumQuoteValue,
          )
    ) {
      return this.blocked(
        actionId,
        sessionId,
        incident.id,
        recovery,
        plan,
        "PAPER recovery quantity, quote value, or slippage exceeded the original plan bounds.",
      );
    }

    const preparation =
      orderLifecycleManager
        .preparePaperRecovery({
          sessionId,
          recoveryIncidentId:
            incident.id,
          leg:
            side,
          exchange:
            sourceLeg.exchange,
          market:
            sourceLeg.market,
          quantity,
          limitPrice:
            sourceLeg.limitPrice,
        });

    if (
      !preparation.approved ||
      !preparation.order
    ) {
      return this.blocked(
        actionId,
        sessionId,
        incident.id,
        recovery,
        plan,
        preparation.reasons.join(
          " | ",
        ) ||
        "PAPER recovery lifecycle preparation failed.",
      );
    }

    const recoveryPlan:
      ExecutionPlan = {
      ...plan,
      buy:
        side ===
          "BUY"
          ? {
              ...plan.buy,
              exchange:
                sourceLeg.exchange,
              market:
                sourceLeg.market,
              quantity,
              limitPrice:
                sourceLeg.limitPrice,
            }
          : plan.buy,
      sell:
        side ===
          "SELL"
          ? {
              ...plan.sell,
              exchange:
                sourceLeg.exchange,
              market:
                sourceLeg.market,
              quantity,
              limitPrice:
                sourceLeg.limitPrice,
            }
          : plan.sell,
    };

    const execution =
      paperOrderExecutor
        .executeLeg(
          recoveryPlan,
          side,
          config,
        );

    const liveResult =
      this.toLifecycleResult(
        execution,
        preparation.order
          .clientOrderId,
      );

    fillEngine
      .ingestExecutionResult(
        preparation.order.id,
        liveResult,
      );

    const reconciliation =
      executionReconciliationEngine
        .reconcileSynthetic(
          preparation.order.id,
          liveResult,
        );

    const postRecovery =
      executionRecoveryEngine
        .evaluateSession(
          sessionId,
        );

    const resolvedIncident =
      executionRecoveryEngine
        .getIncident(
          incident.id,
        );

    const incidentResolved =
      resolvedIncident
        ?.status ===
      "RESOLVED";

    const executed =
      execution.status ===
        "FILLED" &&
      reconciliation.status ===
        "MATCHED" &&
      !postRecovery.requiresRecovery &&
      incidentResolved;

    const result:
      PaperRecoveryActionResult = {
      status:
        executed
          ? "EXECUTED"
          : "FAILED",
      actionId,
      sessionId,
      incidentId:
        incident.id,
      sourceStrategy:
        recovery.strategy,
      sourceExposureDirection:
        direction,
      sourceExposedQuantity:
        recovery.exposedQuantity,
      leg: {
        side,
        exchange:
          sourceLeg.exchange,
        market:
          sourceLeg.market,
        quantity,
        referencePrice:
          sourceLeg.limitPrice,
        maximumQuantity,
        maximumQuoteValue,
        simulatedQuoteValue:
          execution.filledQuantity >
            0
            ? execution.filledQuantity *
              execution.averageFillPrice
            : 0,
      },
      lifecycleOrderId:
        preparation.order.id,
      execution,
      reconciliation,
      postRecovery,
      incidentResolved,
      additionalCapitalReserved:
        false,
      liveOrderSubmissionAllowed:
        false,
      exchangeOrdersSubmitted:
        0,
      reasons: [
        executed
          ? "Bounded PAPER recovery fill restored quantity balance and resolved the incident."
          : "PAPER recovery fill did not restore a reconciled balanced state.",
        "Recovery quantity did not exceed the source incident or selected original route-leg quantity.",
        "No additional capital reservation or live adapter submission occurred.",
      ],
    };

    this.completedByIncident
      .set(
        incident.id,
        structuredClone(
          result,
        ),
      );

    return result;
  }

  private blocked(
    actionId:
      string,

    sessionId:
      string,

    incidentId:
      string,

    recovery:
      ExecutionRecoveryEvaluation,

    plan:
      ExecutionPlan,

    reason:
      string,
  ): PaperRecoveryActionResult {
    const direction =
      recovery.exposureDirection ===
        "SHORT"
        ? "SHORT"
        : "LONG";

    const side =
      direction ===
        "LONG"
        ? "SELL"
        : "BUY";

    const emergencyExit =
      recovery.strategy ===
      "EMERGENCY_EXIT";

    const leg =
      direction ===
        "LONG"
        ? emergencyExit
          ? plan.buy
          : plan.sell
        : emergencyExit
          ? plan.sell
          : plan.buy;

    return {
      status:
        "BLOCKED",
      actionId,
      sessionId,
      incidentId,
      sourceStrategy:
        recovery.strategy,
      sourceExposureDirection:
        direction,
      sourceExposedQuantity:
        recovery.exposedQuantity,
      leg: {
        side,
        exchange:
          leg.exchange,
        market:
          leg.market,
        quantity:
          recovery.exposedQuantity,
        referencePrice:
          leg.limitPrice,
        maximumQuantity:
          Math.min(
            leg.quantity,
            Math.max(
              0,
              recovery.exposedQuantity,
            ),
          ),
        maximumQuoteValue:
          leg.quantity *
          leg.limitPrice *
          (
            1 +
            plan.maximumSlippagePercent /
              100
          ),
        simulatedQuoteValue:
          null,
      },
      lifecycleOrderId:
        null,
      execution:
        null,
      reconciliation:
        null,
      postRecovery:
        null,
      incidentResolved:
        false,
      additionalCapitalReserved:
        false,
      liveOrderSubmissionAllowed:
        false,
      exchangeOrdersSubmitted:
        0,
      reasons: [
        reason,
        "No PAPER recovery fill or exchange order was created.",
      ],
    };
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
        `paper-recovery-${randomUUID()}`,
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
      feeAmount:
        leg.filledQuantity *
        leg.averageFillPrice *
        (
          feePercent /
          100
        ),
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
              "Synthetic bounded PAPER recovery leg completed.",
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

  private quantityTolerance(
    quantity:
      number,
  ): number {
    return Math.max(
      1e-12,
      Math.abs(
        quantity,
      ) *
        1e-9,
    );
  }
}

export const paperRecoveryActionExecutorService =
  new PaperRecoveryActionExecutorService();
