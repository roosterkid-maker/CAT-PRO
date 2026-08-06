import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import {
  coinDCXOrderApi,
} from "../../../exchanges/coindcx/api/CoinDCXOrderApi";

import type {
  LiveExecutionAdapter,
} from "../contracts/LiveExecutionAdapter";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

export class CoinDCXExecutionAdapter
  implements LiveExecutionAdapter
{
  readonly exchange =
    "coindcx";

  async execute(
    request: LiveExecutionRequest,
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    const credentials =
      coinDCXCredentialsProvider.getCredentials();

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

    return this.mapOrder(
      createdOrder,
      startedAt,
      false,
      false,
      null,
    );
  }

  async getOrderStatus(
    orderId: string,
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    const credentials =
      coinDCXCredentialsProvider.getCredentials();

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
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    const credentials =
      coinDCXCredentialsProvider.getCredentials();

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

  isConnected(): boolean {
    return true;
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

    return {
      success:
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

      status:
        this.mapStatus(
          order.status,
        ),

      requestedQuantity:
        order.totalQuantity,

      filledQuantity:
        order.totalQuantity -
        order.remainingQuantity,

      remainingQuantity:
        order.remainingQuantity,

      requestedPrice:
        order.pricePerUnit,

      averageFillPrice:
        order.averagePrice,

      feeAmount:
        order.feeAmount,

      cancelled,

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
}

export const coinDCXExecutionAdapter =
  new CoinDCXExecutionAdapter();