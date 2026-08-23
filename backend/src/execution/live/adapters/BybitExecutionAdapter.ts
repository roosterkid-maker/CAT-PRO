import {
  bybitCredentialsProvider,
  type BybitCredentials,
} from "../../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  bybitOrderApi,
  type BybitCreateSpotOrderRequest,
  type BybitOrderAcknowledgement,
  type BybitSpotOrder,
} from "../../../exchanges/bybit/api/BybitOrderApi";

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

interface BybitOrderApiSource {
  createSpotOrder(
    request:
      BybitCreateSpotOrderRequest,
    credentials?:
      BybitCredentials,
  ): Promise<
    BybitOrderAcknowledgement
  >;

  getSpotOrder(
    symbol: string,
    orderId: string,
    credentials?:
      BybitCredentials,
  ): Promise<BybitSpotOrder>;

  cancelSpotOrder(
    symbol: string,
    orderId: string,
    credentials?:
      BybitCredentials,
  ): Promise<
    BybitOrderAcknowledgement
  >;
}

interface BybitCredentialsSource {
  getCredentials():
    BybitCredentials;

  isConfigured():
    boolean;
}

interface BybitPollerSource {
  waitForFinalState(
    adapter:
      LiveExecutionAdapter,
    initialResult:
      LiveExecutionResult,
    options: {
      timeoutMs: number;
      pollingIntervalMs: number;
      cancelOnTimeout: boolean;
    },
  ): Promise<
    LiveExecutionResult
  >;
}

interface BybitAuditSource {
  executionStarted(
    request:
      LiveExecutionRequest,
  ): Promise<void>;

  orderCreated(
    request:
      LiveExecutionRequest,
    result:
      LiveExecutionResult,
  ): Promise<void>;

  executionFailed(
    request:
      LiveExecutionRequest,
    message: string,
    result:
      LiveExecutionResult,
  ): Promise<void>;
}

interface BybitMetricsSource {
  record(
    result:
      LiveExecutionResult,
  ): void;
}

interface BybitVerificationSource {
  getReadiness(
    exchange: string,
    credentialsConfigured:
      boolean,
  ): LiveExecutionAdapterReadiness;
}

export interface BybitExecutionAdapterOptions {
  orderApi?:
    BybitOrderApiSource;
  credentialsSource?:
    BybitCredentialsSource;
  poller?:
    BybitPollerSource;
  audit?:
    BybitAuditSource;
  metrics?:
    BybitMetricsSource;
  verificationSource?:
    BybitVerificationSource;
  now?:
    () => number;
}

export class BybitExecutionAdapter
  implements LiveExecutionAdapter
{
  readonly exchange =
    "bybit";

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

  private readonly orderApi:
    BybitOrderApiSource;
  private readonly credentialsSource:
    BybitCredentialsSource;
  private readonly poller:
    BybitPollerSource;
  private readonly audit:
    BybitAuditSource;
  private readonly metrics:
    BybitMetricsSource;
  private readonly verificationSource:
    BybitVerificationSource;
  private readonly now:
    () => number;

  constructor(
    options:
      BybitExecutionAdapterOptions = {},
  ) {
    this.orderApi =
      options.orderApi ??
      bybitOrderApi;
    this.credentialsSource =
      options.credentialsSource ??
      bybitCredentialsProvider;
    this.poller =
      options.poller ??
      orderPoller;
    this.audit =
      options.audit ??
      executionAuditLogger;
    this.metrics =
      options.metrics ??
      executionMetricsService;
    this.verificationSource =
      options.verificationSource ??
      executionAdapterVerificationService;
    this.now =
      options.now ??
      (() =>
        Date.now());
  }

  async execute(
    request:
      LiveExecutionRequest,
  ): Promise<
    LiveExecutionResult
  > {
    const startedAt =
      this.now();

    await this.safeAudit(
      () =>
        this.audit
          .executionStarted(
            request,
          ),
    );

    try {
      this.validateRequest(
        request,
      );

      const credentials =
        this.credentialsSource
          .getCredentials();
      const acknowledgement =
        await this.orderApi
          .createSpotOrder(
            {
              symbol:
                this.requireMarket(
                  request.market,
                ),
              side:
                request.side ===
                  "buy"
                  ? "Buy"
                  : "Sell",
              orderType:
                request.orderType ===
                  "limit"
                  ? "Limit"
                  : "Market",
              quantity:
                request.quantity,
              ...(request.postOnly ===
              true
                ? {
                    postOnly:
                      true,
                  }
                : {}),
              ...(request.timeInForce !==
                undefined
                ? {
                    timeInForce:
                      request.timeInForce,
                  }
                : {}),
              ...(request.price !==
              undefined
                ? {
                    price:
                      request.price,
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
        this.mapAcknowledgement(
          request,
          acknowledgement,
          startedAt,
        );

      await this.safeAudit(
        () =>
          this.audit
            .orderCreated(
              request,
              initialResult,
            ),
      );

      const finalResult =
        await this.poller
          .waitForFinalState(
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

      this.metrics.record(
        finalResult,
      );

      return finalResult;
    } catch (
      error: unknown
    ) {
      const completedAt =
        this.now();
      const failureReason =
        error instanceof Error
          ? error.message
          : "Bybit live execution failed.";
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
          "Unable to create or monitor the Bybit spot order.",
        ],
      };

      await this.safeAudit(
        () =>
          this.audit
            .executionFailed(
              request,
              failureReason,
              failedResult,
            ),
      );

      this.metrics.record(
        failedResult,
      );

      return failedResult;
    }
  }

  async getOrderStatus(
    orderId: string,
    market?: string,
  ): Promise<
    LiveExecutionResult
  > {
    const startedAt =
      this.now();
    const order =
      await this.orderApi
        .getSpotOrder(
          this.requireMarket(
            market,
          ),
          this.requireOrderId(
            orderId,
          ),
          this.credentialsSource
            .getCredentials(),
        );

    return this.mapOrder(
      order,
      startedAt,
    );
  }

  async cancelOrder(
    orderId: string,
    market?: string,
  ): Promise<
    LiveExecutionResult
  > {
    const startedAt =
      this.now();
    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );
    const normalizedMarket =
      this.requireMarket(
        market,
      );
    const credentials =
      this.credentialsSource
        .getCredentials();
    const acknowledgement =
      await this.orderApi
        .cancelSpotOrder(
          normalizedMarket,
          normalizedOrderId,
          credentials,
        );

    if (
      acknowledgement.orderId !==
      normalizedOrderId
    ) {
      throw new Error(
        "Bybit cancellation acknowledgement orderId does not match the requested order.",
      );
    }

    const order =
      await this.orderApi
        .getSpotOrder(
          normalizedMarket,
          normalizedOrderId,
          credentials,
        );
    const result =
      this.mapOrder(
        order,
        startedAt,
      );

    if (
      result.status !==
        "CANCELLED" &&
      result.status !==
        "FILLED" &&
      result.status !==
        "REJECTED"
    ) {
      throw new Error(
        "Bybit cancellation acknowledgement was not confirmed by final order-state evidence.",
      );
    }

    return result;
  }

  getReadiness():
    LiveExecutionAdapterReadiness {
    return this.verificationSource
      .getReadiness(
        this.exchange,
        this.credentialsSource
          .isConfigured(),
      );
  }

  private validateRequest(
    request:
      LiveExecutionRequest,
  ): void {
    if (request.product !== undefined && request.product !== "SPOT") {
      throw new Error("Bybit spot adapter cannot execute a PERPETUAL request.");
    }
    if (request.reduceOnly !== undefined || request.positionMode !== undefined || request.positionSide !== undefined) {
      throw new Error("Bybit spot execution cannot carry derivative position semantics.");
    }
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
        `Invalid exchange for Bybit adapter: ${request.exchange}`,
      );
    }

    if (
      request.side !==
        "buy" &&
      request.side !==
        "sell"
    ) {
      throw new Error(
        "Bybit execution side must be buy or sell.",
      );
    }

    if (
      request.orderType !==
        "limit" &&
      request.orderType !==
        "market"
    ) {
      throw new Error(
        "Bybit execution order type must be limit or market.",
      );
    }

    if (
      request.postOnly ===
        true &&
      request.orderType !==
        "limit"
    ) {
      throw new Error(
        "Bybit post-only execution requires a limit order.",
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
        "Bybit time-in-force is supported only for non-post-only limit orders.",
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
        "Bybit time-in-force must be GTC, IOC, or FOK.",
      );
    }

    if (
      !Number.isFinite(
        request.quantity,
      ) ||
      request.quantity <=
        0
    ) {
      throw new Error(
        "Bybit execution quantity must be positive.",
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
        request.price <=
          0
      )
    ) {
      throw new Error(
        "A positive price is required for a Bybit limit order.",
      );
    }

    if (
      request.clientOrderId !==
        undefined &&
      !/^[A-Za-z0-9_-]{1,36}$/u.test(
        request.clientOrderId,
      )
    ) {
      throw new Error(
        "Bybit client order ID must be 1-36 letters, digits, dashes, or underscores.",
      );
    }

    this.validatePolling(
      request,
    );
  }

  private validatePolling(
    request:
      LiveExecutionRequest,
  ): void {
    if (
      request.timeoutMs !==
        undefined &&
      (
        !Number.isFinite(
          request.timeoutMs,
        ) ||
        request.timeoutMs <=
          0
      )
    ) {
      throw new Error(
        "Bybit execution timeout must be positive.",
      );
    }

    if (
      request.pollingIntervalMs !==
        undefined &&
      (
        !Number.isFinite(
          request.pollingIntervalMs,
        ) ||
        request.pollingIntervalMs <=
          0
      )
    ) {
      throw new Error(
        "Bybit polling interval must be positive.",
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
        "Bybit polling interval cannot exceed timeout.",
      );
    }
  }

  private mapAcknowledgement(
    request:
      LiveExecutionRequest,
    acknowledgement:
      BybitOrderAcknowledgement,
    startedAt: number,
  ): LiveExecutionResult {
    const completedAt =
      this.now();

    return {
      success: false,
      exchange:
        this.exchange,
      market:
        this.requireMarket(
          request.market,
        ),
      side:
        request.side,
      orderId:
        acknowledgement.orderId,
      clientOrderId:
        acknowledgement.clientOrderId,
      status:
        "PENDING",
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
      failureReason: null,
      reasons: [
        "Bybit create acknowledgement accepted; final status requires signed order-state evidence.",
      ],
    };
  }

  private mapOrder(
    order:
      BybitSpotOrder,
    startedAt: number,
  ): LiveExecutionResult {
    const completedAt =
      this.now();
    const status =
      this.mapStatus(
        order.status,
      );
    const failureReason =
      status ===
        "REJECTED"
        ? order.rejectReason ??
          "Bybit rejected the order."
        : status ===
            "FAILED"
          ? `Unsupported Bybit order status: ${order.status}`
          : null;
    const averageFillPrice =
      order.averageFillPrice >
        0
        ? order.averageFillPrice
        : order.filledQuantity >
              0 &&
            order.cumulativeQuoteQuantity >
              0
          ? order.cumulativeQuoteQuantity /
            order.filledQuantity
          : 0;

    return {
      success:
        status ===
          "FILLED" &&
        failureReason ===
          null,
      exchange:
        this.exchange,
      market:
        order.symbol,
      side:
        order.side ===
          "Sell"
          ? "sell"
          : "buy",
      orderId:
        order.orderId,
      clientOrderId:
        order.clientOrderId,
      status,
      requestedQuantity:
        order.quantity,
      filledQuantity:
        order.filledQuantity,
      remainingQuantity:
        order.remainingQuantity,
      requestedPrice:
        order.price >
          0
          ? order.price
          : null,
      averageFillPrice,
      feeAmount:
        order.feeAmount,
      cancelled:
        status ===
        "CANCELLED",
      timedOut: false,
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

  private mapStatus(
    status: string,
  ):
    LiveExecutionResult["status"] {
    switch (
      status
        .trim()
        .toUpperCase()
    ) {
      case "CREATED":
      case "UNTRIGGERED":
      case "TRIGGERED":
        return "PENDING";

      case "NEW":
        return "OPEN";

      case "PARTIALLYFILLED":
        return "PARTIALLY_FILLED";

      case "FILLED":
        return "FILLED";

      case "PARTIALLYFILLEDCANCELED":
      case "CANCELLED":
      case "CANCELED":
      case "DEACTIVATED":
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
        .toUpperCase() ??
      "";

    if (
      !/^[A-Z0-9]{4,30}$/u.test(
        normalizedMarket,
      )
    ) {
      throw new Error(
        "Bybit spot market is required and must contain 4-30 letters or digits.",
      );
    }

    return normalizedMarket;
  }

  private requireOrderId(
    orderId: string,
  ): string {
    const normalizedOrderId =
      orderId.trim();

    if (
      !normalizedOrderId ||
      normalizedOrderId.length >
        64
    ) {
      throw new Error(
        "Bybit order ID is required and must not exceed 64 characters.",
      );
    }

    return normalizedOrderId;
  }

  private async safeAudit(
    action:
      () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (
      error: unknown
    ) {
      console.error(
        "[ExecutionAuditLogger]",
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }
}

export const bybitExecutionAdapter =
  new BybitExecutionAdapter();
