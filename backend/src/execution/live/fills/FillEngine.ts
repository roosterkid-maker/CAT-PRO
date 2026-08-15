import {
  randomUUID,
} from "node:crypto";

import {
  orderLifecycleManager,
} from "../lifecycle/OrderLifecycleManager";

import type {
  OrderLifecycleRecord,
} from "../lifecycle/OrderLifecycleRecord";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

import type {
  FillEngineDiagnostics,
  FillQualityPreview,
  FillQualityPreviewRequest,
  FillSlice,
  OrderFillSummary,
} from "./FillRecord";

interface MutableFillState {
  summary:
    OrderFillSummary;

  lastFingerprint:
    string;
}

export class FillEngine {
  private readonly states =
    new Map<
      string,
      MutableFillState
    >();

  /*
   * Ingest one cumulative exchange execution
   * result.
   *
   * Exchange adapters currently report:
   *
   * filledQuantity
   * averageFillPrice
   * feeAmount
   *
   * cumulatively.
   *
   * Fill Engine converts those cumulative
   * snapshots into incremental fill slices.
   */
  ingestExecutionResult(
    orderLifecycleId:
      string,

    result:
      LiveExecutionResult,
  ): OrderFillSummary {
    const order =
      orderLifecycleManager
        .getOrder(
          orderLifecycleId,
        );

    if (!order) {
      throw new Error(
        "Order lifecycle record not found.",
      );
    }

    this.validateIdentity(
      order,
      result,
    );

    const fingerprint =
      this.createFingerprint(
        result,
      );

    const existing =
      this.states.get(
        orderLifecycleId,
      );

    /*
     * Idempotency protection.
     *
     * Pollers/adapters may publish the exact
     * same cumulative state multiple times.
     */
    if (
      existing
        ?.lastFingerprint ===
      fingerprint
    ) {
      return structuredClone(
        existing.summary,
      );
    }

    const previousFilled =
      existing
        ?.summary
        .filledQuantity ??
      0;

    const previousAveragePrice =
      existing
        ?.summary
        .averageFillPrice ??
      0;

    const previousFee =
      existing
        ?.summary
        .feeAmount ??
      0;

    this.validateCumulativeProgress(
      order,
      result,
      previousFilled,
      previousFee,
    );

    const fills =
      existing
        ? structuredClone(
            existing
              .summary
              .fills,
          )
        : [];

    const deltaQuantity =
      this.roundQuantity(
        result.filledQuantity -
        previousFilled,
      );

    /*
     * New fill happened.
     *
     * Because the exchange gives us cumulative
     * average price, incremental price can be
     * mathematically reconstructed:
     *
     * new cumulative notional
     * -
     * previous cumulative notional
     * --------------------------------
     * new incremental quantity
     */
    if (
      deltaQuantity >
      0
    ) {
      const currentNotional =
        result.averageFillPrice *
        result.filledQuantity;

      const previousNotional =
        previousAveragePrice *
        previousFilled;

      const deltaNotional =
        Math.max(
          0,
          currentNotional -
            previousNotional,
        );

      const derivedFillPrice =
        deltaNotional /
        deltaQuantity;

      const deltaFee =
        Math.max(
          0,
          result.feeAmount -
            previousFee,
        );

      const fill:
        FillSlice = {
        id:
          randomUUID(),

        sequence:
          fills.length +
          1,

        orderLifecycleId,

        exchangeOrderId:
          result.orderId,

        quantity:
          deltaQuantity,

        price:
          this.round(
            derivedFillPrice,
            12,
          ),

        notional:
          this.round(
            deltaNotional,
            12,
          ),

        feeAmount:
          this.round(
            deltaFee,
            12,
          ),

        cumulativeQuantity:
          result.filledQuantity,

        cumulativeAveragePrice:
          result.averageFillPrice,

        cumulativeFeeAmount:
          result.feeAmount,

        observedAt:
          Date.now(),
      };

      fills.push(
        fill,
      );
    }

    /*
     * Lifecycle remains the authoritative
     * order-state machine.
     *
     * Fill Engine owns fill accounting,
     * not order status.
     */
    const lifecycle =
      orderLifecycleManager
        .applyExecutionResult(
          orderLifecycleId,
          result,
        );

    const summary =
      this.buildSummary(
        lifecycle,
        result,
        fills,
      );

    this.states.set(
      orderLifecycleId,
      {
        summary,

        lastFingerprint:
          fingerprint,
      },
    );

    return structuredClone(
      summary,
    );
  }

  getSummary(
    orderLifecycleId:
      string,
  ): OrderFillSummary | null {
    const state =
      this.states.get(
        orderLifecycleId,
      );

    return state
      ? structuredClone(
          state.summary,
        )
      : null;
  }

  getDiagnostics():
    FillEngineDiagnostics {
    const orders =
      Array.from(
        this.states.values(),
      )
        .map(
          (
            state,
          ) =>
            structuredClone(
              state.summary,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.updatedAt -
            first.updatedAt,
        );

    const totalFillEvents =
      orders.reduce(
        (
          total,
          order,
        ) =>
          total +
          order.fills.length,
        0,
      );

    const totalFilledQuantity =
      orders.reduce(
        (
          total,
          order,
        ) =>
          total +
          order.filledQuantity,
        0,
      );

    const totalFees =
      orders.reduce(
        (
          total,
          order,
        ) =>
          total +
          order.feeAmount,
        0,
      );

    return {
      generatedAt:
        Date.now(),

      trackedOrders:
        orders.length,

      totalFillEvents,

      fullyFilledOrders:
        orders.filter(
          (
            order,
          ) =>
            order.complete,
        ).length,

      partiallyFilledOrders:
        orders.filter(
          (
            order,
          ) =>
            order.filledQuantity >
              0 &&
            !order.complete,
        ).length,

      totalFilledQuantity:
        this.round(
          totalFilledQuantity,
          12,
        ),

      totalFees:
        this.round(
          totalFees,
          12,
        ),

      averageFillPercent:
        orders.length >
        0
          ? this.round(
              orders.reduce(
                (
                  total,
                  order,
                ) =>
                  total +
                  order
                    .fillPercent,
                0,
              ) /
                orders.length,

              4,
            )
          : 0,

      averageQualityScore:
        orders.length >
        0
          ? this.round(
              orders.reduce(
                (
                  total,
                  order,
                ) =>
                  total +
                  order
                    .qualityScore,
                0,
              ) /
                orders.length,

              2,
            )
          : 0,

      orders,
    };
  }

  /*
   * Safe non-mutating calculation endpoint.
   *
   * Useful for verifying fill quality maths
   * before actual live submission is enabled.
   */
  preview(
    request:
      FillQualityPreviewRequest,
  ): FillQualityPreview {
    this.validatePreview(
      request,
    );

    const fillPercent =
      Math.min(
        100,

        Math.max(
          0,

          (
            request.filledQuantity /
            request.requestedQuantity
          ) *
            100,
        ),
      );

    const remainingQuantity =
      Math.max(
        0,

        request.requestedQuantity -
          request.filledQuantity,
      );

    const slippage =
      this.calculateSlippage(
        request.side,
        request.requestedPrice,
        request.averageFillPrice,
        request.filledQuantity,
      );

    const adverseSlippage =
      slippage ===
      null
        ? null
        : Math.max(
            0,
            slippage,
          );

    return {
      fillPercent:
        this.round(
          fillPercent,
          4,
        ),

      remainingQuantity:
        this.roundQuantity(
          remainingQuantity,
        ),

      grossNotional:
        this.round(
          request.averageFillPrice *
            request.filledQuantity,

          12,
        ),

      feeAmount:
        request.feeAmount,

      slippagePercent:
        slippage ===
        null
          ? null
          : this.round(
              slippage,
              6,
            ),

      adverseSlippagePercent:
        adverseSlippage ===
        null
          ? null
          : this.round(
              adverseSlippage,
              6,
            ),

      qualityScore:
        this.calculateQuality(
          fillPercent,
          adverseSlippage,
          request.executionTimeMs,
        ),
    };
  }

  private buildSummary(
    order:
      OrderLifecycleRecord,

    result:
      LiveExecutionResult,

    fills:
      FillSlice[],
  ): OrderFillSummary {
    const fillPercent =
      order.requestedQuantity >
      0
        ? Math.min(
            100,

            Math.max(
              0,

              (
                result.filledQuantity /
                order.requestedQuantity
              ) *
                100,
            ),
          )
        : 0;

    const slippage =
      this.calculateSlippage(
        order.side,
        order.requestedPrice,
        result.averageFillPrice,
        result.filledQuantity,
      );

    const adverseSlippage =
      slippage ===
      null
        ? null
        : Math.max(
            0,
            slippage,
          );

    return {
      orderLifecycleId:
        order.id,

      sessionId:
        order.sessionId,

      leg:
        order.leg,

      exchange:
        order.exchange,

      market:
        order.market,

      side:
        order.side,

      requestedQuantity:
        order.requestedQuantity,

      filledQuantity:
        result.filledQuantity,

      remainingQuantity:
        result.remainingQuantity,

      fillPercent:
        this.round(
          fillPercent,
          4,
        ),

      requestedPrice:
        order.requestedPrice,

      averageFillPrice:
        result.averageFillPrice,

      grossNotional:
        this.round(
          result.averageFillPrice *
            result.filledQuantity,

          12,
        ),

      feeAmount:
        result.feeAmount,

      slippagePercent:
        slippage ===
        null
          ? null
          : this.round(
              slippage,
              6,
            ),

      adverseSlippagePercent:
        adverseSlippage ===
        null
          ? null
          : this.round(
              adverseSlippage,
              6,
            ),

      executionTimeMs:
        result.executionTimeMs,

      qualityScore:
        this.calculateQuality(
          fillPercent,
          adverseSlippage,
          result.executionTimeMs,
        ),

      complete:
        result.status ===
          "FILLED" &&
        result.remainingQuantity <=
          this.quantityTolerance(
            order.requestedQuantity,
          ),

      lastStatus:
        result.status,

      updatedAt:
        Date.now(),

      fills,
    };
  }

  /*
   * BUY:
   *
   * Higher actual price = adverse.
   *
   * SELL:
   *
   * Lower actual price = adverse.
   *
   * Therefore positive slippage always means
   * execution moved against us.
   */
  private calculateSlippage(
    side:
      "buy" |
      "sell",

    requestedPrice:
      number |
      null,

    averageFillPrice:
      number,

    filledQuantity:
      number,
  ): number | null {
    if (
      requestedPrice ===
        null ||
      requestedPrice <=
        0 ||
      filledQuantity <=
        0 ||
      averageFillPrice <=
        0
    ) {
      return null;
    }

    if (
      side ===
      "buy"
    ) {
      return (
        (
          averageFillPrice -
          requestedPrice
        ) /
        requestedPrice
      ) *
      100;
    }

    return (
      (
        requestedPrice -
        averageFillPrice
      ) /
      requestedPrice
    ) *
    100;
  }

  /*
   * Version 14.2 execution-quality score.
   *
   * Fill completion carries the largest
   * weight.
   *
   * Adverse slippage and excessive latency
   * reduce quality further.
   */
  private calculateQuality(
    fillPercent:
      number,

    adverseSlippagePercent:
      number |
      null,

    executionTimeMs:
      number,
  ): number {
    let score =
      100;

    const unfilledPercent =
      Math.max(
        0,

        100 -
        fillPercent,
      );

    score -=
      unfilledPercent *
      0.6;

    if (
      adverseSlippagePercent !==
      null
    ) {
      score -=
        Math.min(
          30,

          adverseSlippagePercent *
          10,
        );
    }

    if (
      executionTimeMs >
      1_000
    ) {
      score -=
        Math.min(
          10,

          (
            executionTimeMs -
            1_000
          ) /
            500,
        );
    }

    return this.round(
      Math.max(
        0,

        Math.min(
          100,
          score,
        ),
      ),

      2,
    );
  }

  private validateIdentity(
    order:
      OrderLifecycleRecord,

    result:
      LiveExecutionResult,
  ): void {
    if (
      result.exchange
        .trim()
        .toLowerCase() !==
      order.exchange
    ) {
      throw new Error(
        "Fill result exchange does not match lifecycle order.",
      );
    }

    if (
      result.market
        .trim()
        .toUpperCase() !==
      order.market
    ) {
      throw new Error(
        "Fill result market does not match lifecycle order.",
      );
    }

    if (
      result.side !==
      order.side
    ) {
      throw new Error(
        "Fill result side does not match lifecycle order.",
      );
    }

    const tolerance =
      this.quantityTolerance(
        order.requestedQuantity,
      );

    if (
      Math.abs(
        result.requestedQuantity -
        order.requestedQuantity,
      ) >
      tolerance
    ) {
      throw new Error(
        "Fill result requested quantity does not match lifecycle order.",
      );
    }
  }

  private validateCumulativeProgress(
    order:
      OrderLifecycleRecord,

    result:
      LiveExecutionResult,

    previousFilled:
      number,

    previousFee:
      number,
  ): void {
    const tolerance =
      this.quantityTolerance(
        order.requestedQuantity,
      );

    if (
      !Number.isFinite(
        result.filledQuantity,
      ) ||
      result.filledQuantity <
        0
    ) {
      throw new Error(
        "Filled quantity must be a non-negative finite number.",
      );
    }

    if (
      result.filledQuantity +
        tolerance <
      previousFilled
    ) {
      throw new Error(
        "Cumulative filled quantity cannot decrease.",
      );
    }

    if (
      result.filledQuantity -
        order.requestedQuantity >
      tolerance
    ) {
      throw new Error(
        "Cumulative filled quantity exceeds requested quantity.",
      );
    }

    if (
      result.filledQuantity >
        0 &&
      (
        !Number.isFinite(
          result.averageFillPrice,
        ) ||
        result.averageFillPrice <=
          0
      )
    ) {
      throw new Error(
        "Average fill price must be positive when filled quantity is greater than zero.",
      );
    }

    if (
      !Number.isFinite(
        result.feeAmount,
      ) ||
      result.feeAmount <
        0
    ) {
      throw new Error(
        "Fee amount must be a non-negative finite number.",
      );
    }

    if (
      result.feeAmount +
        1e-12 <
      previousFee
    ) {
      throw new Error(
        "Cumulative fee amount cannot decrease.",
      );
    }
  }

  private validatePreview(
    request:
      FillQualityPreviewRequest,
  ): void {
    if (
      request.side !==
        "buy" &&
      request.side !==
        "sell"
    ) {
      throw new Error(
        "side must be buy or sell.",
      );
    }

    if (
      !Number.isFinite(
        request.requestedQuantity,
      ) ||
      request.requestedQuantity <=
        0
    ) {
      throw new Error(
        "requestedQuantity must be positive.",
      );
    }

    if (
      !Number.isFinite(
        request.filledQuantity,
      ) ||
      request.filledQuantity <
        0 ||
      request.filledQuantity >
        request.requestedQuantity
    ) {
      throw new Error(
        "filledQuantity must be between zero and requestedQuantity.",
      );
    }

    if (
      request.filledQuantity >
        0 &&
      (
        !Number.isFinite(
          request.averageFillPrice,
        ) ||
        request.averageFillPrice <=
          0
      )
    ) {
      throw new Error(
        "averageFillPrice must be positive when filledQuantity is greater than zero.",
      );
    }

    if (
      request.requestedPrice !==
        null &&
      (
        !Number.isFinite(
          request.requestedPrice,
        ) ||
        request.requestedPrice <=
          0
      )
    ) {
      throw new Error(
        "requestedPrice must be positive or null.",
      );
    }

    if (
      !Number.isFinite(
        request.feeAmount,
      ) ||
      request.feeAmount <
        0
    ) {
      throw new Error(
        "feeAmount must be non-negative.",
      );
    }

    if (
      !Number.isFinite(
        request.executionTimeMs,
      ) ||
      request.executionTimeMs <
        0
    ) {
      throw new Error(
        "executionTimeMs must be non-negative.",
      );
    }
  }

  private createFingerprint(
    result:
      LiveExecutionResult,
  ): string {
    return [
      result.status,
      result.orderId ??
        "",
      result.filledQuantity,
      result.remainingQuantity,
      result.averageFillPrice,
      result.feeAmount,
      result.completedAt,
    ].join(
      "|",
    );
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

  private roundQuantity(
    value:
      number,
  ): number {
    if (
      Math.abs(
        value,
      ) <
      1e-12
    ) {
      return 0;
    }

    return this.round(
      value,
      12,
    );
  }

  private round(
    value:
      number,

    decimalPlaces =
      2,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      decimalPlaces;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }
}

export const fillEngine =
  new FillEngine();