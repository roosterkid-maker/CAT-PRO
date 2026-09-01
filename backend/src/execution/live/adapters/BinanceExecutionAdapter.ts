import {
  binanceCredentialsProvider,
} from "../../../exchanges/binance/api/BinanceCredentialsProvider";

import {
  binanceOrderApi,
  type BinanceOrder,
} from "../../../exchanges/binance/api/BinanceOrderApi";

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

export class BinanceExecutionAdapter
  implements LiveExecutionAdapter
{
  readonly exchange =
    "binance";

  getCapabilities():
    LiveExecutionAdapterCapabilities {
    return {
      products: ["SPOT"],
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsPostOnly: true,
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

    // Fire-and-forget: safeAudit already swallows and logs its own
    // errors (never rejects), so there's nothing an await here protects
    // against - it was only adding a disk write's latency directly in
    // front of order submission, on the one path where every millisecond
    // is budgeted. The order itself carries its own audit trail via
    // orderCreated below; this is best-effort observability, not it.
    void this.safeAudit(() =>
      executionAuditLogger.executionStarted(
        request,
      ),
    );

    try {
      this.validateRequest(
        request,
      );

      const credentials =
        binanceCredentialsProvider
          .getCredentials();

      const createdOrder =
        await binanceOrderApi.createOrder(
          {
            symbol:
              request.market
                .trim()
                .toUpperCase(),

            side:
              request.side ===
              "buy"
                ? "BUY"
                : "SELL",

            type:
              request.postOnly ===
              true
                ? "LIMIT_MAKER"
                : request.orderType ===
                    "market"
                  ? "MARKET"
                  : "LIMIT",

            quantity:
              request.quantity,

            ...(request.orderType ===
              "limit"
              ? {
                  price:
                    request.price,
                  ...(request.postOnly ===
                  true
                    ? {}
                    : {
                        timeInForce:
                          request.timeInForce ??
                          "GTC",
                      }),
                }
              : {}),

            ...(request.clientOrderId
              ? {
                  clientOrderId:
                    request.clientOrderId,
                }
              : {}),
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

      // Same reasoning as executionStarted above: don't let a disk write
      // delay when fill-status polling starts. Lower stakes than the
      // pre-submission one (polling already runs on a ~1s cadence), but
      // free to remove for the same reason.
      void this.safeAudit(() =>
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
          : "Binance live execution failed.";

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
          "Unable to create or monitor the Binance order.",
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
    market?: string,
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    const normalizedMarket =
      this.requireMarket(
        market,
      );

    const credentials =
      binanceCredentialsProvider
        .getCredentials();

    const order =
      await binanceOrderApi.getOrderStatus(
        normalizedMarket,
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
    market?: string,
  ): Promise<LiveExecutionResult> {
    const startedAt =
      Date.now();

    const normalizedMarket =
      this.requireMarket(
        market,
      );

    const credentials =
      binanceCredentialsProvider
        .getCredentials();

    const order =
      await binanceOrderApi.cancelOrder(
        normalizedMarket,
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
      binanceCredentialsProvider
        .isConfigured();

    return executionAdapterVerificationService
      .getReadiness(
        this.exchange,
        credentialsConfigured,
      );
  }

  private validateRequest(
    request: LiveExecutionRequest,
  ): void {
    if (request.product !== undefined && request.product !== "SPOT") {
      throw new Error("Binance spot adapter cannot execute a PERPETUAL request.");
    }
    if (request.reduceOnly !== undefined || request.positionMode !== undefined || request.positionSide !== undefined) {
      throw new Error("Binance spot execution cannot carry derivative position semantics.");
    }
    const normalizedMarket =
      this.requireMarket(
        request.market,
      );

    if (
      request.exchange
        .trim()
        .toLowerCase() !==
      this.exchange
    ) {
      throw new Error(
        `Invalid exchange for Binance adapter: ${request.exchange}`,
      );
    }

    if (
      request.side !== "buy" &&
      request.side !== "sell"
    ) {
      throw new Error(
        "Binance execution side must be buy or sell.",
      );
    }

    if (
      request.orderType !==
        "limit" &&
      request.orderType !==
        "market"
    ) {
      throw new Error(
        "Binance execution order type must be limit or market.",
      );
    }

    if (
      request.postOnly ===
        true &&
      request.orderType !==
        "limit"
    ) {
      throw new Error(
        "Binance post-only execution requires a limit order.",
      );
    }

    if (
      request.timeInForce !==
        undefined &&
      (
        request.orderType !==
          "limit" ||
        request.postOnly ===
          true
      )
    ) {
      throw new Error(
        "Binance time-in-force is supported only for non-post-only limit orders.",
      );
    }

    if (
      request.timeInForce !==
        undefined &&
      request.timeInForce !==
        "GTC" &&
      request.timeInForce !==
        "IOC" &&
      request.timeInForce !==
        "FOK"
    ) {
      throw new Error(
        "Binance time-in-force must be GTC, IOC, or FOK.",
      );
    }

    if (
      !Number.isFinite(
        request.quantity,
      ) ||
      request.quantity <= 0
    ) {
      throw new Error(
        "Binance execution quantity must be positive.",
      );
    }

    if (
      request.orderType ===
        "limit" &&
      (
        request.price ===
          undefined ||
        !Number.isFinite(
          request.price,
        ) ||
        request.price <= 0
      )
    ) {
      throw new Error(
        "A positive price is required for a Binance limit order.",
      );
    }

    if (
      request.timeoutMs !==
        undefined &&
      (
        !Number.isFinite(
          request.timeoutMs,
        ) ||
        request.timeoutMs <= 0
      )
    ) {
      throw new Error(
        "Binance execution timeout must be positive.",
      );
    }

    if (
      request.pollingIntervalMs !==
        undefined &&
      (
        !Number.isFinite(
          request.pollingIntervalMs,
        ) ||
        request.pollingIntervalMs <= 0
      )
    ) {
      throw new Error(
        "Binance polling interval must be positive.",
      );
    }

    if (
      request.timeoutMs !==
        undefined &&
      request.pollingIntervalMs !==
        undefined &&
      request.pollingIntervalMs >
        request.timeoutMs
    ) {
      throw new Error(
        "Binance polling interval cannot exceed timeout.",
      );
    }

    if (
      normalizedMarket.length >
      30
    ) {
      throw new Error(
        "Binance market symbol is unexpectedly long.",
      );
    }
  }

  private mapOrder(
    order: BinanceOrder,
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
        order.executedQuantity,
      );

    const remainingQuantity =
      Math.max(
        0,
        order.originalQuantity -
          filledQuantity,
      );

    const averageFillPrice =
      filledQuantity > 0 &&
      order.cumulativeQuoteQuantity >
        0
        ? order.cumulativeQuoteQuantity /
          filledQuantity
        : 0;

    return {
      success:
        status === "FILLED" &&
        failureReason === null,

      exchange:
        this.exchange,

      market:
        order.symbol,

      side:
        order.side
          .trim()
          .toUpperCase() ===
        "SELL"
          ? "sell"
          : "buy",

      orderId:
        order.orderId,

      clientOrderId:
        order.clientOrderId,

      status,

      requestedQuantity:
        order.originalQuantity,

      filledQuantity,

      remainingQuantity,

      requestedPrice:
        order.price > 0
          ? order.price
          : null,

      averageFillPrice,

      /*
       * Binance order response normally does not include
       * aggregate trade commission. Trade-history support
       * can populate this field later.
       */
      feeAmount: 0,

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
        .toUpperCase()
    ) {
      case "NEW":
      case "PENDING_NEW":
      case "PENDING_CANCEL":
        return "OPEN";

      case "PARTIALLY_FILLED":
        return "PARTIALLY_FILLED";

      case "FILLED":
        return "FILLED";

      case "CANCELED":
      case "EXPIRED":
      case "EXPIRED_IN_MATCH":
        return "CANCELLED";

      case "REJECTED":
        return "REJECTED";

      default:
        return "FAILED";
    }
  }

  private requireMarket(
    market:
      | string
      | undefined,
  ): string {
    const normalizedMarket =
      market
        ?.trim()
        .toUpperCase();

    if (!normalizedMarket) {
      throw new Error(
        "Binance market is required for order execution, status, and cancellation.",
      );
    }

    return normalizedMarket;
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

export const binanceExecutionAdapter =
  new BinanceExecutionAdapter();
