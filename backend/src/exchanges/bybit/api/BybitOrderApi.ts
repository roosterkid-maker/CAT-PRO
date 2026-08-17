import {
  bybitPrivateHttpClient,
  type BybitSignedPostBody,
} from "./BybitPrivateHttpClient";

import type {
  BybitCredentials,
} from "./BybitCredentialsProvider";

export interface BybitCreateSpotOrderRequest {
  symbol: string;
  side:
    | "Buy"
    | "Sell";
  orderType:
    | "Limit"
    | "Market";
  quantity: number;
  price?: number;
  postOnly?: boolean;
  timeInForce?:
    | "GTC"
    | "IOC"
    | "FOK";
  clientOrderId?: string;
}

export interface BybitOrderAcknowledgement {
  orderId: string;
  clientOrderId: string | null;
}

export interface BybitSpotOrder {
  orderId: string;
  clientOrderId: string | null;
  symbol: string;
  side:
    | "Buy"
    | "Sell";
  orderType:
    | "Limit"
    | "Market";
  status: string;
  quantity: number;
  price: number;
  filledQuantity: number;
  remainingQuantity: number;
  cumulativeQuoteQuantity: number;
  averageFillPrice: number;
  feeAmount: number;
  rejectReason: string | null;
}

interface BybitOrderListResult {
  list?: unknown;
}

export interface BybitSignedOrderClient {
  getSigned<T>(
    path: string,
    parameters?:
      Record<
        string,
        string
      >,
    credentials?:
      BybitCredentials,
  ): Promise<T>;

  postSigned<T>(
    path: string,
    body:
      BybitSignedPostBody,
    credentials?:
      BybitCredentials,
  ): Promise<T>;
}

export class BybitOrderApi {
  constructor(
    private readonly client:
      BybitSignedOrderClient =
      bybitPrivateHttpClient,
  ) {}

  async createSpotOrder(
    request:
      BybitCreateSpotOrderRequest,
    credentials?:
      BybitCredentials,
  ): Promise<
    BybitOrderAcknowledgement
  > {
    const symbol =
      this.requireSymbol(
        request.symbol,
      );

    this.validateSide(
      request.side,
    );

    this.validateOrderType(
      request.orderType,
    );

    const quantity =
      this.formatPositiveNumber(
        request.quantity,
        "quantity",
      );

    if (
      request.orderType ===
        "Limit" &&
      request.price ===
        undefined
    ) {
      throw new Error(
        "Bybit limit order price is required.",
      );
    }

    if (request.postOnly === true && request.orderType !== "Limit") {
      throw new Error("Bybit post-only requires a Limit order.");
    }

    const clientOrderId =
      request.clientOrderId ===
      undefined
        ? undefined
        : this.requireClientOrderId(
            request.clientOrderId,
          );

    const body:
      BybitSignedPostBody = {
      category:
        "spot",
      symbol,
      side:
        request.side,
      orderType:
        request.orderType,
      qty:
        quantity,
      isLeverage: 0,
      orderFilter:
        "Order",
      ...(request.orderType ===
      "Market"
        ? {
            /*
             * Bybit spot market BUY defaults to quote value.
             * CAT PRO quantity is always base-asset quantity,
             * so the unit must be explicit on both sides.
             */
            marketUnit:
              "baseCoin",
            timeInForce:
              "IOC",
          }
        : {
            price:
              this.formatPositiveNumber(
                request.price as number,
                "price",
              ),
            timeInForce:
              request.postOnly === true
                ? "PostOnly"
                : request.timeInForce ??
                  "GTC",
          }),
      ...(clientOrderId
        ? {
            orderLinkId:
              clientOrderId,
          }
        : {}),
    };

    const result =
      await this.client
        .postSigned<
          Record<
            string,
            unknown
          >
        >(
          "/v5/order/create",
          body,
          credentials,
        );

    return this.normalizeAcknowledgement(
      result,
      "create",
    );
  }

  async getSpotOrder(
    symbol: string,
    orderId: string,
    credentials?:
      BybitCredentials,
  ): Promise<BybitSpotOrder> {
    const normalizedSymbol =
      this.requireSymbol(
        symbol,
      );
    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );
    const parameters = {
      category:
        "spot",
      symbol:
        normalizedSymbol,
      orderId:
        normalizedOrderId,
      openOnly:
        "0",
      limit:
        "1",
    };
    const realtime =
      await this.client
        .getSigned<
          BybitOrderListResult
        >(
          "/v5/order/realtime",
          parameters,
          credentials,
        );
    const realtimeOrder =
      this.findOrder(
        realtime,
        normalizedOrderId,
      );

    if (realtimeOrder) {
      return this.normalizeOrder(
        realtimeOrder,
      );
    }

    /*
     * Bybit documents that recent closed orders can
     * disappear from realtime after a service restart.
     * Query history before declaring order state missing.
     */
    const history =
      await this.client
        .getSigned<
          BybitOrderListResult
        >(
          "/v5/order/history",
          {
            category:
              "spot",
            symbol:
              normalizedSymbol,
            orderId:
              normalizedOrderId,
            limit:
              "1",
          },
          credentials,
        );
    const historicalOrder =
      this.findOrder(
        history,
        normalizedOrderId,
      );

    if (!historicalOrder) {
      throw new Error(
        `Bybit order ${normalizedOrderId} was not found in realtime or history evidence.`,
      );
    }

    return this.normalizeOrder(
      historicalOrder,
    );
  }

  async cancelSpotOrder(
    symbol: string,
    orderId: string,
    credentials?:
      BybitCredentials,
  ): Promise<
    BybitOrderAcknowledgement
  > {
    const result =
      await this.client
        .postSigned<
          Record<
            string,
            unknown
          >
        >(
          "/v5/order/cancel",
          {
            category:
              "spot",
            symbol:
              this.requireSymbol(
                symbol,
              ),
            orderId:
              this.requireOrderId(
                orderId,
              ),
            orderFilter:
              "Order",
          },
          credentials,
        );

    return this.normalizeAcknowledgement(
      result,
      "cancel",
    );
  }

  private findOrder(
    result:
      BybitOrderListResult,
    orderId: string,
  ): Record<
    string,
    unknown
  > | null {
    if (
      !Array.isArray(
        result.list,
      )
    ) {
      throw new Error(
        "Invalid Bybit order response list.",
      );
    }

    const value =
      result.list.find(
        (candidate) =>
          this.isRecord(
            candidate,
          ) &&
          candidate.orderId ===
            orderId,
      );

    return this.isRecord(
      value,
    )
      ? value
      : null;
  }

  private normalizeAcknowledgement(
    result:
      Record<
        string,
        unknown
      >,
    operation:
      "create" | "cancel",
  ):
    BybitOrderAcknowledgement {
    const orderId =
      this.stringValue(
        result.orderId,
      );

    if (!orderId) {
      throw new Error(
        `Bybit ${operation} acknowledgement is missing orderId.`,
      );
    }

    const clientOrderId =
      this.stringValue(
        result.orderLinkId,
      );

    return {
      orderId,
      clientOrderId:
        clientOrderId ||
        null,
    };
  }

  private normalizeOrder(
    record:
      Record<
        string,
        unknown
      >,
  ): BybitSpotOrder {
    const orderId =
      this.requireOrderId(
        this.stringValue(
          record.orderId,
        ),
      );
    const symbol =
      this.requireSymbol(
        this.stringValue(
          record.symbol,
        ),
      );
    const side =
      this.stringValue(
        record.side,
      );
    const orderType =
      this.stringValue(
        record.orderType,
      );
    const status =
      this.stringValue(
        record.orderStatus,
      );

    this.validateSide(
      side,
    );

    this.validateOrderType(
      orderType,
    );

    if (!status) {
      throw new Error(
        "Bybit order status is missing.",
      );
    }

    const quantity =
      this.nonNegativeNumber(
        record.qty,
        "qty",
      );
    const filledQuantity =
      this.nonNegativeNumber(
        record.cumExecQty,
        "cumExecQty",
        true,
      );
    const reportedRemaining =
      this.optionalNonNegativeNumber(
        record.leavesQty,
        "leavesQty",
      );

    if (
      quantity <=
        0 ||
      filledQuantity >
        quantity
    ) {
      throw new Error(
        "Invalid Bybit order quantity evidence.",
      );
    }

    return {
      orderId,
      clientOrderId:
        this.stringValue(
          record.orderLinkId,
        ) ||
        null,
      symbol,
      side,
      orderType,
      status,
      quantity,
      price:
        this.nonNegativeNumber(
          record.price,
          "price",
          true,
        ),
      filledQuantity,
      remainingQuantity:
        reportedRemaining ??
        Math.max(
          0,
          quantity -
            filledQuantity,
        ),
      cumulativeQuoteQuantity:
        this.nonNegativeNumber(
          record.cumExecValue,
          "cumExecValue",
          true,
        ),
      averageFillPrice:
        this.nonNegativeNumber(
          record.avgPrice,
          "avgPrice",
          true,
        ),
      feeAmount:
        this.nonNegativeNumber(
          record.cumExecFee,
          "cumExecFee",
          true,
        ),
      rejectReason:
        this.normalizeRejectReason(
          record.rejectReason,
        ),
    };
  }

  private requireSymbol(
    value: string,
  ): string {
    const symbol =
      value
        .trim()
        .toUpperCase();

    if (
      !/^[A-Z0-9]{4,30}$/u.test(
        symbol,
      )
    ) {
      throw new Error(
        "Bybit spot symbol must contain 4-30 uppercase letters or digits.",
      );
    }

    return symbol;
  }

  private requireOrderId(
    value: string,
  ): string {
    const orderId =
      value.trim();

    if (
      !orderId ||
      orderId.length >
        64
    ) {
      throw new Error(
        "Bybit orderId is required and must not exceed 64 characters.",
      );
    }

    return orderId;
  }

  private requireClientOrderId(
    value: string,
  ): string {
    const clientOrderId =
      value.trim();

    if (
      !/^[A-Za-z0-9_-]{1,36}$/u.test(
        clientOrderId,
      )
    ) {
      throw new Error(
        "Bybit client order ID must be 1-36 letters, digits, dashes, or underscores.",
      );
    }

    return clientOrderId;
  }

  private validateSide(
    value: string,
  ): asserts value is
    | "Buy"
    | "Sell" {
    if (
      value !==
        "Buy" &&
      value !==
        "Sell"
    ) {
      throw new Error(
        "Bybit spot order side must be Buy or Sell.",
      );
    }
  }

  private validateOrderType(
    value: string,
  ): asserts value is
    | "Limit"
    | "Market" {
    if (
      value !==
        "Limit" &&
      value !==
        "Market"
    ) {
      throw new Error(
        "Bybit spot order type must be Limit or Market.",
      );
    }
  }

  private formatPositiveNumber(
    value: number,
    field: string,
  ): string {
    if (
      !Number.isFinite(
        value,
      ) ||
      value <=
        0
    ) {
      throw new Error(
        `Bybit ${field} must be a positive finite number.`,
      );
    }

    const rendered =
      String(
        value,
      );

    if (
      !/[eE]/u.test(
        rendered,
      )
    ) {
      return rendered;
    }

    return value
      .toFixed(
        20,
      )
      .replace(
        /0+$/u,
        "",
      )
      .replace(
        /\.$/u,
        "",
      );
  }

  private optionalNonNegativeNumber(
    value: unknown,
    field: string,
  ): number | null {
    if (
      value ===
        undefined ||
      value ===
        null ||
      value ===
        ""
    ) {
      return null;
    }

    return this.nonNegativeNumber(
      value,
      field,
    );
  }

  private nonNegativeNumber(
    value: unknown,
    field: string,
    emptyIsZero =
      false,
  ): number {
    if (
      emptyIsZero &&
      (
        value ===
          undefined ||
        value ===
          null ||
        value ===
          ""
      )
    ) {
      return 0;
    }

    const number =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        number,
      ) ||
      number <
        0
    ) {
      throw new Error(
        `Invalid Bybit ${field}.`,
      );
    }

    return number;
  }

  private normalizeRejectReason(
    value: unknown,
  ): string | null {
    const reason =
      this.stringValue(
        value,
      );

    return !reason ||
      reason ===
        "EC_NoError"
      ? null
      : reason;
  }

  private stringValue(
    value: unknown,
  ): string {
    return typeof value ===
      "string"
      ? value.trim()
      : "";
  }

  private isRecord(
    value: unknown,
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }
}

export const bybitOrderApi =
  new BybitOrderApi();
