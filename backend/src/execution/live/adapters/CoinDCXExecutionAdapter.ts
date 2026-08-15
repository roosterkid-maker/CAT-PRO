import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import {
  coinDCXOrderApi,
} from "../../../exchanges/coindcx/api/CoinDCXOrderApi";

import {
  executionAuditLogger,
} from "../audit/ExecutionAuditLogger";

import type {
  LiveExecutionAdapter,
  LiveExecutionAdapterCapabilities,
  LiveExecutionAdapterReadiness,
} from "../contracts/LiveExecutionAdapter";

import {
  executionMetricsService,
} from "../metrics/ExecutionMetricsService";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

import {
  orderPoller,
} from "../polling/OrderPoller";

import {
  executionAdapterVerificationService,
} from "../verification/ExecutionAdapterVerificationService";

export class CoinDCXExecutionAdapter
  implements LiveExecutionAdapter
{
  readonly exchange =
    "coindcx";

  getCapabilities():
    LiveExecutionAdapterCapabilities {
    return {
      products: ["SPOT"],
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsPostOnly: false,
      supportsOrderStatus: true,
      supportsCancellation: true,
      supportsAmendKeepPriority: false,
      supportsReduceOnly: false,
    };
  }

  async execute(
    request: LiveExecutionRequest,
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    await this.safeAudit(() =>
      executionAuditLogger.executionStarted(
        request,
      ),
    );

    try {
      if (
        request.postOnly ===
        true
      ) {
        throw new Error(
          "CoinDCX post-only execution is unsupported by the audited adapter contract.",
        );
      }

      const credentials =
        coinDCXCredentialsProvider
          .getCredentials();

      const createdOrder =
        await coinDCXOrderApi.createOrder(
          {
            market:
              request.market,

            side:
              request.side,

            orderType:
              request.orderType ===
              "market"
                ? "market_order"
                : "limit_order",

            totalQuantity:
              request.quantity,

            pricePerUnit:
              request.price,

            clientOrderId:
              request.clientOrderId,
          },
          credentials,
        );

      const initialResult =
        this.mapOrder(
          createdOrder,
          startedAt,
          false,
          false,
          null,
        );

      await this.safeAudit(() =>
        executionAuditLogger.orderCreated(
          request,
          initialResult,
        ),
      );

      const finalResult =
        await orderPoller.waitForFinalState(
          this,
          initialResult,
          {
            timeoutMs:
              request.timeoutMs ??
              15_000,

            pollingIntervalMs:
              request.pollingIntervalMs ??
              1_000,

            cancelOnTimeout:
              request.cancelOnTimeout ??
              true,
          },
        );

      executionMetricsService.record(
        finalResult,
      );

      return finalResult;
    } catch (error: unknown) {
      const completedAt =
        Date.now();

      const failureReason =
        error instanceof Error
          ? error.message
          : "CoinDCX live execution failed.";

      const failedResult:
        LiveExecutionResult = {
        success: false,

        exchange:
          this.exchange,

        market:
          request.market
            .trim()
            .toUpperCase(),

        side:
          request.side,

        orderId: null,

        clientOrderId:
          request.clientOrderId ??
          null,

        status:
          "FAILED",

        requestedQuantity:
          request.quantity,

        filledQuantity: 0,

        remainingQuantity:
          request.quantity,

        requestedPrice:
          request.price ??
          null,

        averageFillPrice: 0,

        feeAmount: 0,

        cancelled: false,

        timedOut: false,

        startedAt,

        completedAt,

        executionTimeMs:
          completedAt -
          startedAt,

        failureReason,

        reasons: [
          "Unable to create or monitor the CoinDCX order.",
        ],
      };

      await this.safeAudit(() =>
        executionAuditLogger.executionFailed(
          request,
          failureReason,
          failedResult,
        ),
      );

      executionMetricsService.record(
        failedResult,
      );

      return failedResult;
    }
  }

  async getOrderStatus(
    orderId: string,
    _market?: string,
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    const credentials =
      coinDCXCredentialsProvider
        .getCredentials();

    const order =
      await coinDCXOrderApi.getOrderStatus(
        orderId,
        credentials,
      );

    return this.mapOrder(
      order,
      startedAt,
      false,
      false,
      null,
    );
  }

  async cancelOrder(
    orderId: string,
    _market?: string,
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    const credentials =
      coinDCXCredentialsProvider
        .getCredentials();

    const order =
      await coinDCXOrderApi.cancelOrder(
        orderId,
        credentials,
      );

    return this.mapOrder(
      order,
      startedAt,
      true,
      false,
      null,
    );
  }

  getReadiness():
    LiveExecutionAdapterReadiness {
    const credentialsConfigured =
      coinDCXCredentialsProvider
        .isConfigured();

    return executionAdapterVerificationService
      .getReadiness(
        this.exchange,
        credentialsConfigured,
      );
  }

  private mapOrder(
    order: Awaited<
      ReturnType<
        typeof coinDCXOrderApi.getOrderStatus
      >
    >,
    startedAt: number,
    cancelled: boolean,
    timedOut: boolean,
    failureReason: string | null,
  ): LiveExecutionResult {
    const completedAt =
      Date.now();

    const status =
      this.mapStatus(
        order.status,
      );

    const filledQuantity =
      Math.max(
        0,
        order.totalQuantity -
          order.remainingQuantity,
      );

    return {
      success:
        status === "FILLED" &&
        failureReason === null,

      exchange:
        this.exchange,

      market:
        order.market,

      side:
        order.side,

      orderId:
        order.id,

      clientOrderId:
        order.clientOrderId,

      status,

      requestedQuantity:
        order.totalQuantity,

      filledQuantity,

      remainingQuantity:
        order.remainingQuantity,

      requestedPrice:
        order.pricePerUnit,

      averageFillPrice:
        order.averagePrice,

      feeAmount:
        order.feeAmount,

      cancelled:
        cancelled ||
        status === "CANCELLED",

      timedOut,

      startedAt,

      completedAt,

      executionTimeMs:
        completedAt -
        startedAt,

      failureReason,

      reasons: [],
    };
  }

  private mapStatus(
    status: string,
  ): LiveExecutionResult["status"] {
    switch (
      status
        .trim()
        .toLowerCase()
    ) {
      case "init":
        return "PENDING";

      case "open":
        return "OPEN";

      case "partially_filled":
        return "PARTIALLY_FILLED";

      case "filled":
        return "FILLED";

      case "cancelled":
      case "partially_cancelled":
        return "CANCELLED";

      case "rejected":
        return "REJECTED";

      default:
        return "FAILED";
    }
  }

  private async safeAudit(
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error: unknown) {
      console.error(
        "[ExecutionAuditLogger]",
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }
}

export const coinDCXExecutionAdapter =
  new CoinDCXExecutionAdapter();
