import {
  randomUUID,
} from "node:crypto";

import {
  coinSwitchCredentialsProvider,
  type CoinSwitchCredentials,
} from "../../../exchanges/coinswitch/api/CoinSwitchCredentialsProvider";

import {
  coinSwitchOrderApi,
  type CoinSwitchCreateOrderRequest,
  type CoinSwitchSpotOrder,
} from "../../../exchanges/coinswitch/api/CoinSwitchOrderApi";

import {
  getCoinSwitchMarketRuleEvidence,
  type CoinSwitchMarketRuleEvidence,
} from "../../../exchanges/coinswitch/CoinSwitchMarketRuleEvidence";

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

interface CoinSwitchOrderApiSource {
  createSpotOrder(
    request:
      CoinSwitchCreateOrderRequest,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchSpotOrder
  >;

  getSpotOrder(
    orderId: string,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchSpotOrder
  >;

  cancelSpotOrder(
    orderId: string,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchSpotOrder
  >;
}

interface CoinSwitchCredentialsSource {
  getCredentials():
    CoinSwitchCredentials;

  isConfigured():
    boolean;
}

interface CoinSwitchPollerSource {
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

interface CoinSwitchAuditSource {
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

interface CoinSwitchMetricsSource {
  record(
    result:
      LiveExecutionResult,
  ): void;
}

interface CoinSwitchVerificationSource {
  getReadiness(
    exchange: string,
    credentialsConfigured:
      boolean,
  ): LiveExecutionAdapterReadiness;
}

export interface CoinSwitchExecutionAdapterOptions {
  orderApi?:
    CoinSwitchOrderApiSource;
  credentialsSource?:
    CoinSwitchCredentialsSource;
  poller?:
    CoinSwitchPollerSource;
  audit?:
    CoinSwitchAuditSource;
  metrics?:
    CoinSwitchMetricsSource;
  verificationSource?:
    CoinSwitchVerificationSource;
  getMarketRules?:
    (
      market: string,
    ) =>
      CoinSwitchMarketRuleEvidence | null;
  createClientOrderId?:
    () => string;
  sleep?:
    (
      milliseconds: number,
    ) => Promise<void>;
  now?:
    () => number;
}

export class CoinSwitchExecutionAdapter
  implements LiveExecutionAdapter
{
  private static readonly CANCEL_CONFIRMATION_ATTEMPTS =
    20;

  private static readonly CANCEL_CONFIRMATION_INTERVAL_MS =
    250;

  readonly exchange =
    "coinswitch";

  getCapabilities():
    LiveExecutionAdapterCapabilities {
    return {
      products: ["SPOT"],
      supportsMarketOrders: false,
      supportsLimitOrders: true,
      supportsPostOnly: false,
      supportsOrderStatus: true,
      supportsCancellation: true,
      supportsAmendKeepPriority: false,
      supportsReduceOnly: false,
    };
  }

  private readonly orderApi:
    CoinSwitchOrderApiSource;
  private readonly credentialsSource:
    CoinSwitchCredentialsSource;
  private readonly poller:
    CoinSwitchPollerSource;
  private readonly audit:
    CoinSwitchAuditSource;
  private readonly metrics:
    CoinSwitchMetricsSource;
  private readonly verificationSource:
    CoinSwitchVerificationSource;
  private readonly getMarketRules:
    (
      market: string,
    ) =>
      CoinSwitchMarketRuleEvidence | null;
  private readonly createClientOrderId:
    () => string;
  private readonly sleep:
    (
      milliseconds: number,
    ) => Promise<void>;
  private readonly now:
    () => number;

  constructor(
    options:
      CoinSwitchExecutionAdapterOptions = {},
  ) {
    this.orderApi =
      options.orderApi ??
      coinSwitchOrderApi;
    this.credentialsSource =
      options.credentialsSource ??
      coinSwitchCredentialsProvider;
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
    this.getMarketRules =
      options.getMarketRules ??
      getCoinSwitchMarketRuleEvidence;
    this.createClientOrderId =
      options.createClientOrderId ??
      randomUUID;
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
      const rules =
        this.validateRequest(
          request,
        );
      const credentials =
        this.credentialsSource
          .getCredentials();
      const clientOrderId =
        request.clientOrderId ??
        this.createClientOrderId();
      const order =
        await this.orderApi
          .createSpotOrder(
            {
              venue:
                rules.venue,
              market:
                rules.market,
              side:
                request.side,
              price:
                request.price as number,
              quantity:
                request.quantity,
              clientOrderId,
            },
            credentials,
          );
      const initialResult =
        this.mapOrder(
          order,
          startedAt,
          clientOrderId,
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
          : "CoinSwitch live execution failed.";
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
          "Unable to create or monitor the CoinSwitch spot order.",
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
  ): Promise<
    LiveExecutionResult
  > {
    const startedAt =
      this.now();
    const order =
      await this.orderApi
        .getSpotOrder(
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
  ): Promise<
    LiveExecutionResult
  > {
    const startedAt =
      this.now();
    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );
    const credentials =
      this.credentialsSource
        .getCredentials();
    let order =
      await this.orderApi
        .cancelSpotOrder(
          normalizedOrderId,
          credentials,
        );
    let result =
      this.mapOrder(
        order,
        startedAt,
      );

    for (
      let attempt = 0;
      !this.isTerminalStatus(
        result.status,
      ) &&
      attempt <
        CoinSwitchExecutionAdapter
          .CANCEL_CONFIRMATION_ATTEMPTS;
      attempt +=
        1
    ) {
      await this.sleep(
        CoinSwitchExecutionAdapter
          .CANCEL_CONFIRMATION_INTERVAL_MS,
      );
      order =
        await this.orderApi
          .getSpotOrder(
            normalizedOrderId,
            credentials,
          );
      result =
        this.mapOrder(
          order,
          startedAt,
        );
    }

    if (
      !this.isTerminalStatus(
        result.status,
      )
    ) {
      throw new Error(
        "CoinSwitch cancellation remained unconfirmed after bounded status polling.",
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
  ):
    CoinSwitchMarketRuleEvidence {
    if (
      request.exchange
        .trim()
        .toLowerCase() !==
      this.exchange
    ) {
      throw new Error(
        `Invalid exchange for CoinSwitch adapter: ${request.exchange}`,
      );
    }

    if (
      request.side !==
        "buy" &&
      request.side !==
        "sell"
    ) {
      throw new Error(
        "CoinSwitch execution side must be buy or sell.",
      );
    }

    if (
      request.orderType !==
      "limit"
    ) {
      throw new Error(
        "CoinSwitch spot execution currently supports LIMIT orders only.",
      );
    }

    if (
      request.postOnly ===
      true
    ) {
      throw new Error(
        "CoinSwitch post-only execution is unsupported by the audited adapter contract.",
      );
    }

    if (
      request.timeInForce !==
      undefined
    ) {
      throw new Error(
        "CoinSwitch spot time-in-force is unsupported by the audited adapter contract.",
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
        "CoinSwitch limit price and quantity must be positive finite numbers.",
      );
    }

    const rules =
      this.getMarketRules(
        request.market,
      );

    if (!rules) {
      throw new Error(
        "Fresh CoinSwitch account market-rule evidence is required before order creation.",
      );
    }

    this.requireQuantized(
      request.price,
      rules.priceStep,
      "price",
    );
    this.requireQuantized(
      request.quantity,
      rules.quantityStep,
      "quantity",
    );

    const notional =
      request.price *
      request.quantity;

    if (
      notional <
        rules.minimumNotional ||
      notional >
        rules.maximumNotional
    ) {
      throw new Error(
        `CoinSwitch order notional ${notional} is outside the signed account range ${rules.minimumNotional}-${rules.maximumNotional}.`,
      );
    }

    if (
      request.clientOrderId !==
        undefined &&
      !this.isUuid(
        request.clientOrderId,
      )
    ) {
      throw new Error(
        "CoinSwitch client order ID must be a UUID.",
      );
    }

    this.validatePolling(
      request,
    );

    return rules;
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
        "CoinSwitch execution timeout must be positive.",
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
        "CoinSwitch polling interval must be positive.",
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
        "CoinSwitch polling interval cannot exceed timeout.",
      );
    }
  }

  private requireQuantized(
    value: number,
    step: number,
    label: string,
  ): void {
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
        `CoinSwitch ${label} is not aligned to signed step ${step}.`,
      );
    }
  }

  private mapOrder(
    order:
      CoinSwitchSpotOrder,
    startedAt: number,
    clientOrderIdOverride?:
      string,
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
        ? "CoinSwitch discarded the order before execution."
        : status ===
            "FAILED"
          ? `Unsupported CoinSwitch order status: ${order.status}`
          : null;

    return {
      success:
        status ===
          "FILLED" &&
        failureReason ===
          null,
      exchange:
        this.exchange,
      market:
        order.market,
      side:
        order.side,
      orderId:
        order.orderId,
      clientOrderId:
        order.clientOrderId ??
        clientOrderIdOverride ??
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
       * Spot order responses do not provide a per-order
       * fee field. Settlement must populate actual fee
       * evidence later rather than estimating it here.
       */
      feeAmount: 0,
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
      case "OPEN":
        return "OPEN";

      case "PARTIALLY_EXECUTED":
        return "PARTIALLY_FILLED";

      case "EXECUTED":
        return "FILLED";

      case "CANCELLED":
      case "EXPIRED":
        return "CANCELLED";

      case "DISCARDED":
        return "REJECTED";

      case "CANCELLATION_RAISED":
      case "EXPIRATION_RAISED":
        return "PENDING";

      default:
        return "FAILED";
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
      !orderId ||
      orderId.length >
        128
    ) {
      throw new Error(
        "CoinSwitch order ID is required and must not exceed 128 characters.",
      );
    }

    return orderId;
  }

  private isUuid(
    value: string,
  ): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.trim(),
    );
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

export const coinSwitchExecutionAdapter =
  new CoinSwitchExecutionAdapter();
