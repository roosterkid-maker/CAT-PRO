import type {
  ExchangeMarketCapability,
} from "../../capabilities/models/ExchangeCapability";

import {
  exchangeCapabilityService,
} from "../../capabilities/services/ExchangeCapabilityService";

import {
  UNOCOIN,
} from "../../../exchanges/unocoin/constants";

import {
  canonicalizeUnoCoinMarket,
  normalizeUnoCoinMarket,
} from "../../../exchanges/unocoin/normalize";

import {
  unoCoinCredentialsProvider,
  type UnoCoinCredentialSource,
} from "../../../exchanges/unocoin/api/UnoCoinCredentialsProvider";

import {
  unoCoinOrderApi,
  type UnoCoinCreateLimitOrderRequest,
  type UnoCoinCreatedOrder,
  type UnoCoinSpotOrder,
} from "../../../exchanges/unocoin/api/UnoCoinOrderApi";

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

interface UnoCoinOrderApiSource {
  createLimitOrder(
    request:
      UnoCoinCreateLimitOrderRequest,
    credentials:
      ReturnType<
        UnoCoinCredentialSource["getCredentials"]
      >,
  ): Promise<
    UnoCoinCreatedOrder
  >;

  getSpotOrder(
    orderId: string,
    market: string,
    credentials:
      ReturnType<
        UnoCoinCredentialSource["getCredentials"]
      >,
  ): Promise<
    UnoCoinSpotOrder
  >;

  requestCancel(
    orderId: string,
    credentials:
      ReturnType<
        UnoCoinCredentialSource["getCredentials"]
      >,
  ): Promise<void>;
}

interface UnoCoinPollerSource {
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

interface UnoCoinAuditSource {
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

interface UnoCoinMetricsSource {
  record(
    result:
      LiveExecutionResult,
  ): void;
}

interface UnoCoinVerificationSource {
  getReadiness(
    exchange: string,
    credentialsConfigured:
      boolean,
  ): LiveExecutionAdapterReadiness;
}

export interface UnoCoinExecutionAdapterOptions {
  orderApi?:
    UnoCoinOrderApiSource;

  credentialsSource?:
    UnoCoinCredentialSource;

  poller?:
    UnoCoinPollerSource;

  audit?:
    UnoCoinAuditSource;

  metrics?:
    UnoCoinMetricsSource;

  verificationSource?:
    UnoCoinVerificationSource;

  getMarketCapability?:
    (
      market: string,
    ) => Promise<
      ExchangeMarketCapability | null
    >;

  sleep?:
    (
      milliseconds: number,
    ) => Promise<void>;

  now?:
    () => number;
}

/**
 * UnoCoin ordinary spot LIMIT order lifecycle foundation.
 *
 * The adapter deliberately omits market, post-only, advanced, and synthetic
 * client-ID behavior. Every write is preceded by fresh official capability
 * evidence, and accepted cancellation is polled to an exchange-confirmed
 * terminal state.
 */
export class UnoCoinExecutionAdapter
  implements LiveExecutionAdapter
{
  private static readonly CAPABILITY_MAXIMUM_AGE_MS =
    5 *
    60 *
    1_000;

  private static readonly CANCEL_CONFIRMATION_ATTEMPTS =
    20;

  private static readonly CANCEL_CONFIRMATION_INTERVAL_MS =
    250;

  readonly exchange =
    "unocoin";

  private readonly orderApi:
    UnoCoinOrderApiSource;

  private readonly credentialsSource:
    UnoCoinCredentialSource;

  private readonly poller:
    UnoCoinPollerSource;

  private readonly audit:
    UnoCoinAuditSource;

  private readonly metrics:
    UnoCoinMetricsSource;

  private readonly verificationSource:
    UnoCoinVerificationSource;

  private readonly getMarketCapability:
    (
      market: string,
    ) => Promise<
      ExchangeMarketCapability | null
    >;

  private readonly sleep:
    (
      milliseconds: number,
    ) => Promise<void>;

  private readonly now:
    () => number;

  constructor(
    options:
      UnoCoinExecutionAdapterOptions = {},
  ) {
    this.orderApi =
      options.orderApi ??
      unoCoinOrderApi;
    this.credentialsSource =
      options.credentialsSource ??
      unoCoinCredentialsProvider;
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
    this.getMarketCapability =
      options.getMarketCapability ??
      (
        (market) =>
          exchangeCapabilityService
            .getCapability({
              exchange:
                this.exchange,
              market,
              product:
                "spot",
              maximumAgeMs:
                UnoCoinExecutionAdapter
                  .CAPABILITY_MAXIMUM_AGE_MS,
            })
      );
    this.sleep =
      options.sleep ??
      (
        (milliseconds) =>
          new Promise(
            (resolve) => {
              setTimeout(
                resolve,
                milliseconds,
              );
            },
          )
      );
    this.now =
      options.now ??
      Date.now;
  }

  getCapabilities():
    LiveExecutionAdapterCapabilities {
    return {
      products: [
        "SPOT",
      ],
      supportsMarketOrders:
        false,
      supportsLimitOrders:
        true,
      supportsPostOnly:
        false,
      supportsOrderStatus:
        true,
      supportsCancellation:
        true,
      supportsAmendKeepPriority:
        false,
      supportsReduceOnly:
        false,
    };
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
      const capability =
        await this.validateRequest(
          request,
        );
      const created =
        await this.orderApi
          .createLimitOrder(
            {
              market:
                capability.market,
              side:
                request.side,
              price:
                request.price as number,
              quantity:
                request.quantity,
            },
            this.credentialsSource
              .getCredentials(),
          );
      const initialResult =
        this.mapCreatedOrder(
          created,
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
      error:
        unknown
    ) {
      const completedAt =
        this.now();
      const failureReason =
        error instanceof Error
          ? error.message
          : "UnoCoin live execution failed.";
      const failedResult:
        LiveExecutionResult = {
        success:
          false,
        exchange:
          this.exchange,
        product:
          "SPOT",
        market:
          normalizeUnoCoinMarket(
            request.market,
          ),
        side:
          request.side,
        orderId:
          null,
        clientOrderId:
          null,
        status:
          "FAILED",
        requestedQuantity:
          request.quantity,
        filledQuantity:
          0,
        remainingQuantity:
          request.quantity,
        requestedPrice:
          request.price ??
          null,
        averageFillPrice:
          0,
        feeAmount:
          0,
        cancelled:
          false,
        timedOut:
          false,
        startedAt,
        completedAt,
        executionTimeMs:
          completedAt -
          startedAt,
        failureReason,
        reasons: [
          "Unable to create or monitor the UnoCoin spot order.",
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
    product?:
      "SPOT" |
      "PERPETUAL",
  ): Promise<
    LiveExecutionResult
  > {
    this.requireSpotProduct(
      product,
    );
    const startedAt =
      this.now();
    const order =
      await this.orderApi
        .getSpotOrder(
          this.requireOrderId(
            orderId,
          ),
          this.requireMarket(
            market,
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
    product?:
      "SPOT" |
      "PERPETUAL",
  ): Promise<
    LiveExecutionResult
  > {
    this.requireSpotProduct(
      product,
    );
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

    await this.orderApi
      .requestCancel(
        normalizedOrderId,
        credentials,
      );

    let latest:
      LiveExecutionResult | null =
      null;

    for (
      let attempt = 0;
      attempt <
        UnoCoinExecutionAdapter
          .CANCEL_CONFIRMATION_ATTEMPTS;
      attempt +=
        1
    ) {
      await this.sleep(
        UnoCoinExecutionAdapter
          .CANCEL_CONFIRMATION_INTERVAL_MS,
      );
      const order =
        await this.orderApi
          .getSpotOrder(
            normalizedOrderId,
            normalizedMarket,
            credentials,
          );
      latest =
        this.mapOrder(
          order,
          startedAt,
        );

      if (
        this.isTerminalStatus(
          latest.status,
        )
      ) {
        return latest;
      }
    }

    throw new Error(
      latest
        ? `UnoCoin cancellation remained unconfirmed at status ${latest.status}.`
        : "UnoCoin cancellation produced no status evidence.",
    );
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

  private async validateRequest(
    request:
      LiveExecutionRequest,
  ): Promise<
    ExchangeMarketCapability
  > {
    if (
      request.exchange
        .trim()
        .toLowerCase() !==
      this.exchange
    ) {
      throw new Error(
        `Invalid exchange for UnoCoin adapter: ${request.exchange}`,
      );
    }

    this.requireSpotProduct(
      request.product,
    );

    if (
      request.orderType !==
      "limit"
    ) {
      throw new Error(
        "UnoCoin execution foundation supports ordinary LIMIT orders only.",
      );
    }

    if (
      request.postOnly ===
      true
    ) {
      throw new Error(
        "UnoCoin post-only execution is not documented by the audited contract.",
      );
    }

    if (
      request.timeInForce !==
      undefined
    ) {
      throw new Error(
        "UnoCoin time-in-force is not documented by the audited adapter contract.",
      );
    }

    if (
      request.clientOrderId !==
      undefined
    ) {
      throw new Error(
        "UnoCoin does not document a client order ID field; synthetic idempotency IDs are prohibited.",
      );
    }

    if (
      request.reduceOnly !==
        undefined ||
      request.positionMode !==
        undefined ||
      request.positionSide !==
        undefined
    ) {
      throw new Error(
        "UnoCoin spot orders cannot include derivative position fields.",
      );
    }

    if (
      !Number.isFinite(
        request.quantity,
      ) ||
      request.quantity <=
        0 ||
      request.price ===
        undefined ||
      !Number.isFinite(
        request.price,
      ) ||
      request.price <=
        0
    ) {
      throw new Error(
        "UnoCoin limit price and quantity must be positive finite numbers.",
      );
    }

    this.validatePolling(
      request,
    );

    const market =
      this.requireMarket(
        request.market,
      );
    const capability =
      await this.getMarketCapability(
        market,
      );

    if (!capability) {
      throw new Error(
        "Fresh official UnoCoin market-rule evidence is required before order creation.",
      );
    }

    this.validateCapability(
      capability,
      market,
      request.price,
      request.quantity,
    );

    return capability;
  }

  private validateCapability(
    capability:
      ExchangeMarketCapability,
    market: string,
    price: number,
    quantity: number,
  ): void {
    if (
      capability.exchange !==
        this.exchange ||
      capability.product !==
        "spot" ||
      canonicalizeUnoCoinMarket(
        capability.market,
      ) !==
        canonicalizeUnoCoinMarket(
          market,
        ) ||
      !capability.tradingEnabled ||
      capability.maintenanceMode ||
      !capability.order
        .supportedOrderTypes
        .includes(
          "limit",
        ) ||
      !capability.order
        .supportsOrderCancellation ||
      !capability.order
        .supportsOrderStatusPolling
    ) {
      throw new Error(
        "UnoCoin capability does not permit the audited LIMIT lifecycle.",
      );
    }

    const pricePrecision =
      capability.price
        .pricePrecision;
    const quantityPrecision =
      capability.quantity
        .quantityPrecision;
    const minimumNotional =
      capability.notional
        .minimumNotional;
    const maximumNotional =
      capability.notional
        .maximumNotional;

    if (
      pricePrecision ===
        null ||
      quantityPrecision ===
        null ||
      pricePrecision <
        0 ||
      quantityPrecision <
        0 ||
      pricePrecision >
        UNOCOIN.EXCHANGE_DECIMAL_PRECISION ||
      quantityPrecision >
        UNOCOIN.EXCHANGE_DECIMAL_PRECISION ||
      minimumNotional ===
        null ||
      maximumNotional ===
        null ||
      minimumNotional <=
        0 ||
      maximumNotional <
        minimumNotional
    ) {
      throw new Error(
        "UnoCoin capability lacks bounded precision and notional evidence.",
      );
    }

    this.requirePrecision(
      price,
      pricePrecision,
      "price",
    );
    this.requirePrecision(
      quantity,
      quantityPrecision,
      "quantity",
    );

    if (
      capability.price
        .priceStep !==
        null
    ) {
      this.requireQuantized(
        price,
        capability.price
          .priceStep,
        "price",
      );
    }

    if (
      capability.quantity
        .quantityStep !==
        null
    ) {
      this.requireQuantized(
        quantity,
        capability.quantity
          .quantityStep,
        "quantity",
      );
    }

    const minimumQuantity =
      capability.quantity
        .minimumQuantity;

    if (
      minimumQuantity ===
        null ||
      minimumQuantity <=
        0 ||
      quantity <
        minimumQuantity
    ) {
      throw new Error(
        "UnoCoin quantity is below the published minimum-volume evidence.",
      );
    }

    const notional =
      price *
      quantity;

    if (
      notional <
        minimumNotional ||
      notional >
        maximumNotional
    ) {
      throw new Error(
        `UnoCoin order notional ${notional} is outside the published range ${minimumNotional}-${maximumNotional}.`,
      );
    }

    const minimumPrice =
      capability.price
        .minimumPrice;
    const maximumPrice =
      capability.price
        .maximumPrice;

    if (
      (
        minimumPrice !==
          null &&
        price <
          minimumPrice
      ) ||
      (
        maximumPrice !==
          null &&
        price >
          maximumPrice
      )
    ) {
      throw new Error(
        "UnoCoin price is outside the published market bounds.",
      );
    }
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
        "UnoCoin execution timeout must be positive.",
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
        "UnoCoin polling interval must be positive.",
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
        "UnoCoin polling interval cannot exceed timeout.",
      );
    }
  }

  private requirePrecision(
    value: number,
    precision: number,
    label: string,
  ): void {
    const scale =
      10 **
      precision;
    const scaled =
      value *
      scale;
    const tolerance =
      Math.max(
        1,
        Math.abs(
          scaled,
        ),
      ) *
      Number.EPSILON *
      8;

    if (
      Math.abs(
        scaled -
          Math.round(
            scaled,
          ),
      ) >
      tolerance
    ) {
      throw new Error(
        `UnoCoin ${label} exceeds the published ${precision}-decimal precision ceiling.`,
      );
    }
  }

  private requireQuantized(
    value: number,
    step: number,
    label: string,
  ): void {
    if (
      !Number.isFinite(
        step,
      ) ||
      step <=
        0
    ) {
      throw new Error(
        `UnoCoin ${label} step evidence is invalid.`,
      );
    }

    const units =
      value /
      step;
    const tolerance =
      Math.max(
        1,
        Math.abs(
          units,
        ),
      ) *
      Number.EPSILON *
      8;

    if (
      Math.abs(
        units -
          Math.round(
            units,
          ),
      ) >
      tolerance
    ) {
      throw new Error(
        `UnoCoin ${label} is not aligned to published step ${step}.`,
      );
    }
  }

  private mapCreatedOrder(
    order:
      UnoCoinCreatedOrder,
    startedAt: number,
  ): LiveExecutionResult {
    const completedAt =
      this.now();

    return {
      success:
        false,
      exchange:
        this.exchange,
      product:
        "SPOT",
      market:
        order.market,
      side:
        order.side,
      orderId:
        order.orderId,
      clientOrderId:
        null,
      status:
        "PENDING",
      requestedQuantity:
        order.quantity,
      filledQuantity:
        0,
      remainingQuantity:
        order.quantity,
      requestedPrice:
        order.price,
      averageFillPrice:
        0,
      feeAmount:
        0,
      cancelled:
        false,
      timedOut:
        false,
      startedAt,
      completedAt,
      executionTimeMs:
        completedAt -
        startedAt,
      failureReason:
        null,
      reasons: [],
    };
  }

  private mapOrder(
    order:
      UnoCoinSpotOrder,
    startedAt: number,
  ): LiveExecutionResult {
    const completedAt =
      this.now();
    const status =
      this.mapStatus(
        order.status,
      );

    return {
      success:
        status ===
        "FILLED",
      exchange:
        this.exchange,
      product:
        "SPOT",
      market:
        order.market,
      side:
        order.side,
      orderId:
        order.orderId,
      clientOrderId:
        null,
      status,
      requestedQuantity:
        order.originalQuantity,
      filledQuantity:
        order.executedQuantity,
      remainingQuantity:
        order.remainingQuantity,
      requestedPrice:
        order.price,
      averageFillPrice:
        order.averagePrice,
      /*
       * The order-history contract has no authoritative aggregate fee field.
       * Settlement must attach actual fee evidence; this adapter never
       * estimates an exchange fee during order-state mapping.
       */
      feeAmount:
        0,
      cancelled:
        status ===
        "CANCELLED",
      timedOut:
        false,
      startedAt,
      completedAt,
      executionTimeMs:
        completedAt -
        startedAt,
      failureReason:
        null,
      reasons: [],
    };
  }

  private mapStatus(
    status: number,
  ):
    LiveExecutionResult["status"] {
    switch (status) {
      case 1:
      case 6:
        return "FILLED";

      case 2:
      case 5:
        return "CANCELLED";

      case 3:
        return "PARTIALLY_FILLED";

      case 0:
        return "OPEN";

      case -3:
      case -2:
      case -1:
      case 4:
      case 7:
        return "PENDING";

      default:
        throw new Error(
          `UnoCoin returned an undocumented order status: ${status}.`,
        );
    }
  }

  private isTerminalStatus(
    status:
      LiveExecutionResult["status"],
  ): boolean {
    return (
      status ===
        "FILLED" ||
      status ===
        "CANCELLED" ||
      status ===
        "REJECTED" ||
      status ===
        "FAILED"
    );
  }

  private requireOrderId(
    value: string,
  ): string {
    const orderId =
      value.trim();

    if (
      !/^[1-9][0-9]{0,18}$/u.test(
        orderId,
      )
    ) {
      throw new Error(
        "UnoCoin order ID must be a positive integer.",
      );
    }

    return orderId;
  }

  private requireMarket(
    value?: string,
  ): string {
    const market =
      normalizeUnoCoinMarket(
        value ??
          "",
      );

    if (!market) {
      throw new Error(
        "UnoCoin order status and cancellation require the exact market.",
      );
    }

    return market;
  }

  private requireSpotProduct(
    product?:
      "SPOT" |
      "PERPETUAL",
  ): void {
    if (
      product !==
        undefined &&
      product !==
        "SPOT"
    ) {
      throw new Error(
        "UnoCoin execution adapter supports SPOT orders only.",
      );
    }
  }

  private async safeAudit(
    action:
      () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (
      error:
        unknown
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

export const unoCoinExecutionAdapter =
  new UnoCoinExecutionAdapter();
