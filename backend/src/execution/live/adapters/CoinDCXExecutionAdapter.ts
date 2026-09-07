import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import {
  coinDCXOrderApi,
} from "../../../exchanges/coindcx/api/CoinDCXOrderApi";

import {
  executionAuditLogger,
} from "../audit/ExecutionAuditLogger";

import {
  exchangeCapabilityService,
} from "../../capabilities/services/ExchangeCapabilityService";

import {
  exchangeOrderValidator,
} from "../../capabilities/validation/ExchangeOrderValidator";

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

      this.validateAgainstExchangeCapability(
        request,
      );

      if (
        request.postOnly ===
        true
      ) {
        throw new Error(
          "CoinDCX post-only execution is unsupported by the audited adapter contract.",
        );
      }

      if (
        request.timeInForce !==
          undefined &&
        request.timeInForce !==
          "GTC"
      ) {
        throw new Error(
          "CoinDCX SPOT supports only the audited GTC time-in-force mapping.",
        );
      }

      if (
        request.timeInForce ===
          "GTC" &&
        (
          request.orderType !==
            "limit" ||
          !request.clientOrderId
            ?.trim() ||
          !Number.isFinite(
            request.price,
          ) ||
          (
            request.price ??
            0
          ) <=
            0 ||
          request.cancelOnTimeout !==
            true ||
          !Number.isSafeInteger(
            request.timeoutMs,
          ) ||
          (
            request.timeoutMs ??
            0
          ) <=
            0 ||
          (
            request.timeoutMs ??
            0
          ) >
            10_000 ||
          !Number.isSafeInteger(
            request.pollingIntervalMs,
          ) ||
          (
            request.pollingIntervalMs ??
            0
          ) <=
            0 ||
          (
            request.pollingIntervalMs ??
            0
          ) >
            1_000
        )
      ) {
        throw new Error(
          "CoinDCX audited GTC execution requires a priced limit order, durable client ID, explicit bounded timeout (<=10000 ms), <=1000 ms polling and cancel-on-timeout.",
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
      /*
       * The create-order call can throw after CoinDCX already accepted the
       * order (a timeout or dropped connection on the response side).
       * Reconcile by client order ID before declaring the leg dead -
       * reporting FAILED for an order that is actually live risks a caller
       * retrying and placing a duplicate order for real notional.
       */
      if (
        request.clientOrderId
          ?.trim()
      ) {
        try {
          const credentials =
            coinDCXCredentialsProvider
              .getCredentials();

          const reconciledOrder =
            await coinDCXOrderApi.getOrderStatusByClientOrderId(
              request.clientOrderId.trim(),
              credentials,
            );

          const reconciledInitialResult =
            this.mapOrder(
              reconciledOrder,
              startedAt,
              false,
              null,
            );

          void this.safeAudit(() =>
            executionAuditLogger.orderCreated(
              request,
              reconciledInitialResult,
            ),
          );

          // The reconciled order may not be terminal yet (still open) -
          // route it through the same poller the normal success path uses
          // rather than returning a non-final result.
          const reconciledFinalResult =
            await orderPoller.waitForFinalState(
              this,
              reconciledInitialResult,
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
            reconciledFinalResult,
          );

          return reconciledFinalResult;
        } catch {
          // No order exists under this client order ID either - the
          // original creation genuinely failed. Fall through below.
        }
      }

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

    await coinDCXOrderApi.cancelOrder(
      orderId,
      credentials,
    );

    /*
     * Do not trust the cancel endpoint's own response as final: a fill can
     * race the cancel request. Re-fetch the authoritative order state and
     * require it to actually be terminal before reporting a cancellation.
     */
    const order =
      await coinDCXOrderApi.getOrderStatus(
        orderId,
        credentials,
      );

    const result =
      this.mapOrder(
        order,
        startedAt,
        false,
        null,
      );

    if (
      result.status !== "CANCELLED" &&
      result.status !== "FILLED" &&
      result.status !== "REJECTED"
    ) {
      throw new Error(
        "CoinDCX cancellation was not confirmed by final order-state evidence.",
      );
    }

    return result;
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

  /*
   * General request-shape validation every sibling adapter performs
   * unconditionally. This previously lived only inside the GTC-specific
   * branch below, so a request with timeInForce left undefined skipped it
   * entirely - quantity/price/side/exchange flowed straight to the
   * exchange API unchecked.
   */
  private validateRequest(
    request: LiveExecutionRequest,
  ): void {
    if (
      request.exchange
        .trim()
        .toLowerCase() !==
      this.exchange
    ) {
      throw new Error(
        `Invalid exchange for CoinDCX adapter: ${request.exchange}`,
      );
    }

    if (
      request.side !== "buy" &&
      request.side !== "sell"
    ) {
      throw new Error(
        "CoinDCX execution side must be buy or sell.",
      );
    }

    if (
      request.orderType !== "limit" &&
      request.orderType !== "market"
    ) {
      throw new Error(
        "CoinDCX execution order type must be limit or market.",
      );
    }

    if (
      !Number.isFinite(
        request.quantity,
      ) ||
      request.quantity <= 0
    ) {
      throw new Error(
        "CoinDCX execution quantity must be a positive finite number.",
      );
    }

    if (
      request.orderType === "limit" &&
      (
        !Number.isFinite(
          request.price,
        ) ||
        (
          request.price ??
          0
        ) <= 0
      )
    ) {
      throw new Error(
        "CoinDCX limit execution requires a positive finite price.",
      );
    }
  }

  /*
   * The general checks above only confirm quantity/price are positive
   * finite numbers. They never checked the order is actually aligned to
   * CoinDCX's real published tick/lot size or within notional bounds -
   * unlike CoinSwitch/UnoCoin, which validate against a market-rules cache
   * before submission. A capability provider already exists for every
   * exchange in exchangeCapabilityService; this wires it in rather than
   * leaving CoinDCX to rely entirely on the exchange's own rejection.
   *
   * Deliberately a CACHED-ONLY, synchronous read (matching CoinSwitch's own
   * getMarketRules pattern) rather than an inline network fetch: this must
   * stay safe to call from every order dispatch, including deterministic
   * tests and network-isolated environments, with no new I/O added to the
   * hot path. Nothing currently populates this cache for CoinDCX - a
   * background synchronizeExchange()/getCapability() call from anywhere
   * activates this validation with no further adapter changes.
   */
  private validateAgainstExchangeCapability(
    request: LiveExecutionRequest,
  ): void {
    const capability =
      exchangeCapabilityService.getCachedCapability(
        this.exchange,
        request.market,
        "spot",
      );

    if (!capability) {
      return;
    }

    const result =
      exchangeOrderValidator.validate(
        {
          exchange:
            this.exchange,

          market:
            request.market,

          product:
            "spot",

          side:
            request.side,

          orderType:
            request.orderType,

          timeInForce:
            request.timeInForce,

          quantity:
            request.quantity,

          price:
            request.price,

          capability,
        },
      );

    if (!result.valid) {
      throw new Error(
        `CoinDCX order rejected by exchange-rule validation: ${result.reasons.join("; ")}`,
      );
    }
  }

  private mapOrder(
    order: Awaited<
      ReturnType<
        typeof coinDCXOrderApi.getOrderStatus
      >
    >,
    startedAt: number,
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

      /*
       * Derived purely from the freshly-fetched order status, never from
       * caller intent - a cancel request that raced a fill must report the
       * order's real terminal state, not the fact that cancellation was
       * merely attempted.
       */
      cancelled:
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
