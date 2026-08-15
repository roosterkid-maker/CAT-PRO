import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  orderLifecycleEvidenceService,
} from "../lifecycle/OrderLifecycleEvidenceService";

import type {
  DuplicateOrderEvidence,
} from "../lifecycle/OrderLifecycleEvidenceService";

import type {
  LiveExecutionResult,
  LiveExecutionStatus,
} from "../models/LiveExecutionResult";

import type {
  AuthoritativeOrderInspection,
  AuthoritativeRecoveryInspectionReport,
  RecoveryInspectionStatus,
} from "./AuthoritativeRecoveryInspection";

export class AuthoritativeRecoveryInspectionService {
  async inspect():
    Promise<
      AuthoritativeRecoveryInspectionReport
    > {
    const evidence =
      orderLifecycleEvidenceService
        .getDiagnostics();

    const persistedOrders =
      evidence
        .duplicateEvidence;

    const inspections:
      AuthoritativeOrderInspection[] =
      [];

    for (
      const order
      of persistedOrders
    ) {
      inspections.push(
        await this.inspectOrder(
          order,
        ),
      );
    }

    const confirmedTerminal =
      this.count(
        inspections,
        "CONFIRMED_TERMINAL",
      );

    const confirmedOpen =
      this.count(
        inspections,
        "CONFIRMED_OPEN",
      );

    const confirmedPartial =
      this.count(
        inspections,
        "CONFIRMED_PARTIAL",
      );

    const unavailable =
      this.count(
        inspections,
        "UNAVAILABLE",
      );

    const insufficientIdentifier =
      this.count(
        inspections,
        "INSUFFICIENT_IDENTIFIER",
      );

    const queryFailed =
      this.count(
        inspections,
        "QUERY_FAILED",
      );

    const blockers =
      this.buildBlockers(
        inspections,
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "5",

      inspectionOnly:
        true,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      automaticCancelAllowed:
        false,

      automaticResubmissionAllowed:
        false,

      automaticHedgeAllowed:
        false,

      automaticUnwindAllowed:
        false,

      recoveryGateAutomaticallyCleared:
        false,

      summary: {
        persistedRiskOrders:
          persistedOrders.length,

        inspectedOrders:
          inspections.length,

        confirmedTerminal,

        confirmedOpen,

        confirmedPartial,

        unavailable,

        insufficientIdentifier,

        queryFailed,
      },

      inspections,

      blockers,

      notes: [
        "Version 18 Build 5 performs authoritative exchange order-status inspection only.",

        "Exchange order status is queried only when a persisted exchangeOrderId exists.",

        "A clientOrderId alone is not guessed or converted into an exchangeOrderId.",

        "No exchange order is cancelled, resubmitted, hedged or unwound.",

        "Inspection results do not automatically clear the restart-recovery gate.",

        "LIVE trading and LIVE order submission remain disabled.",
      ],
    };
  }

  private async inspectOrder(
    order:
      DuplicateOrderEvidence,
  ):
    Promise<
      AuthoritativeOrderInspection
    > {
    const inspectedAt =
      Date.now();

    const adapterRegistered =
      liveExecutionService
        .hasAdapter(
          order.exchange,
        );

    const adapterConnected =
      adapterRegistered &&
      liveExecutionService
        .isExchangeConnected(
          order.exchange,
        );

    if (
      !order.exchangeOrderId
    ) {
      return this.result({
        inspectedAt,

        order,

        adapterRegistered,

        adapterConnected,

        inspectionStatus:
          "INSUFFICIENT_IDENTIFIER",

        failureReason:
          "Persisted lifecycle evidence does not contain an exchangeOrderId.",

        reasons: [
          "Authoritative adapter getOrderStatus requires an exchange order ID.",

          order.clientOrderId
            ? `Persisted clientOrderId exists (${order.clientOrderId}), but Build 5 will not guess exchange lookup semantics.`
            : "No persisted clientOrderId is available either.",
        ],
      });
    }

    if (
      !adapterRegistered
    ) {
      return this.result({
        inspectedAt,

        order,

        adapterRegistered:
          false,

        adapterConnected:
          false,

        inspectionStatus:
          "UNAVAILABLE",

        failureReason:
          `No LIVE execution adapter is registered for ${order.exchange}.`,

        reasons: [
          "Authoritative exchange status cannot be queried without a registered execution adapter.",
        ],
      });
    }

    if (
      !adapterConnected
    ) {
      return this.result({
        inspectedAt,

        order,

        adapterRegistered:
          true,

        adapterConnected:
          false,

        inspectionStatus:
          "UNAVAILABLE",

        failureReason:
          `LIVE execution availability is blocked for ${order.exchange}.`,

        reasons: [
          "Recovery inspection fails closed until authenticated API reachability is fresh and LIVE execution capability is explicitly enabled.",
        ],
      });
    }

    try {
      const adapter =
        liveExecutionService
          .getAdapter(
            order.exchange,
          );

      const remote =
        await adapter
          .getOrderStatus(
            order.exchangeOrderId,
            order.market,
          );

      return this.fromRemote(
        inspectedAt,
        order,
        remote,
      );
    } catch (
      error:
        unknown
    ) {
      const failureReason =
        error instanceof Error
          ? error.message
          : "Unknown authoritative exchange order-status query failure.";

      return this.result({
        inspectedAt,

        order,

        adapterRegistered:
          true,

        adapterConnected:
          true,

        inspectionStatus:
          "QUERY_FAILED",

        failureReason,

        reasons: [
          "Exchange status query failed.",

          "No recovery action was attempted.",
        ],
      });
    }
  }

  private fromRemote(
    inspectedAt:
      number,

    order:
      DuplicateOrderEvidence,

    remote:
      LiveExecutionResult,
  ):
    AuthoritativeOrderInspection {
    return {
      inspectedAt,

      lifecycleOrderId:
        order.orderId,

      sessionId:
        order.sessionId,

      leg:
        order.leg,

      exchange:
        order.exchange,

      market:
        order.market,

      persistedStatus:
        order.status,

      exchangeOrderId:
        order.exchangeOrderId,

      clientOrderId:
        order.clientOrderId,

      adapterRegistered:
        true,

      adapterConnected:
        true,

      inspectionStatus:
        this.classifyRemote(
          remote.status,
        ),

      authoritativeStatus:
        remote.status,

      authoritativeFilledQuantity:
        remote.filledQuantity,

      authoritativeRemainingQuantity:
        remote.remainingQuantity,

      authoritativeAverageFillPrice:
        remote.averageFillPrice,

      authoritativeFeeAmount:
        remote.feeAmount,

      authoritativeCancelled:
        remote.cancelled,

      authoritativeTimedOut:
        remote.timedOut,

      querySucceeded:
        true,

      failureReason:
        remote.failureReason,

      reasons: [
        `Authoritative exchange status is ${remote.status}.`,

        "No recovery mutation was performed.",
      ],
    };
  }

  private classifyRemote(
    status:
      LiveExecutionStatus,
  ):
    RecoveryInspectionStatus {
    if (
      status ===
      "PARTIALLY_FILLED"
    ) {
      return "CONFIRMED_PARTIAL";
    }

    if (
      status ===
        "PENDING" ||
      status ===
        "OPEN"
    ) {
      return "CONFIRMED_OPEN";
    }

    return "CONFIRMED_TERMINAL";
  }

  private result(
    input: {
      inspectedAt: number;

      order:
        DuplicateOrderEvidence;

      adapterRegistered:
        boolean;

      adapterConnected:
        boolean;

      inspectionStatus:
        RecoveryInspectionStatus;

      failureReason:
        string;

      reasons:
        string[];
    },
  ):
    AuthoritativeOrderInspection {
    return {
      inspectedAt:
        input.inspectedAt,

      lifecycleOrderId:
        input.order.orderId,

      sessionId:
        input.order.sessionId,

      leg:
        input.order.leg,

      exchange:
        input.order.exchange,

      market:
        input.order.market,

      persistedStatus:
        input.order.status,

      exchangeOrderId:
        input.order.exchangeOrderId,

      clientOrderId:
        input.order.clientOrderId,

      adapterRegistered:
        input.adapterRegistered,

      adapterConnected:
        input.adapterConnected,

      inspectionStatus:
        input.inspectionStatus,

      authoritativeStatus:
        null,

      authoritativeFilledQuantity:
        null,

      authoritativeRemainingQuantity:
        null,

      authoritativeAverageFillPrice:
        null,

      authoritativeFeeAmount:
        null,

      authoritativeCancelled:
        null,

      authoritativeTimedOut:
        null,

      querySucceeded:
        false,

      failureReason:
        input.failureReason,

      reasons:
        input.reasons,
    };
  }

  private count(
    inspections:
      readonly AuthoritativeOrderInspection[],

    status:
      RecoveryInspectionStatus,
  ): number {
    return inspections
      .filter(
        (
          inspection,
        ) =>
          inspection
            .inspectionStatus ===
          status,
      )
      .length;
  }

  private buildBlockers(
    inspections:
      readonly AuthoritativeOrderInspection[],
  ): string[] {
    const blockers:
      string[] = [];

    for (
      const inspection
      of inspections
    ) {
      switch (
        inspection
          .inspectionStatus
      ) {
        case "CONFIRMED_OPEN":
          blockers.push(
            `${inspection.exchange}:${inspection.market} ${inspection.leg} order ${inspection.exchangeOrderId ?? inspection.lifecycleOrderId} is still OPEN/PENDING on the exchange.`,
          );

          break;

        case "CONFIRMED_PARTIAL":
          blockers.push(
            `${inspection.exchange}:${inspection.market} ${inspection.leg} order ${inspection.exchangeOrderId ?? inspection.lifecycleOrderId} is PARTIALLY_FILLED and requires exposure reconciliation.`,
          );

          break;

        case "UNAVAILABLE":
        case "INSUFFICIENT_IDENTIFIER":
        case "QUERY_FAILED":
          blockers.push(
            `${inspection.exchange}:${inspection.market} ${inspection.leg} order cannot yet be authoritatively resolved: ${inspection.failureReason ?? inspection.inspectionStatus}.`,
          );

          break;

        case "CONFIRMED_TERMINAL":
          break;
      }
    }

    return [
      ...new Set(
        blockers,
      ),
    ];
  }
}

export const authoritativeRecoveryInspectionService =
  new AuthoritativeRecoveryInspectionService();
