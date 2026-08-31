import {
  BINANCE,
} from "../constants";

import type {
  BinanceCredentials,
} from "./BinanceCredentialsProvider";

import {
  binanceHttpClient,
} from "./BinanceHttpClient";

import type {
  BinanceRequestParameters,
} from "./BinanceSigner";

export type BinanceOrderSide =
  | "BUY"
  | "SELL";

export type BinanceOrderType =
  | "LIMIT"
  | "LIMIT_MAKER"
  | "MARKET";

export type BinanceTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK";

export type BinanceOrderStatus =
  | "NEW"
  | "PENDING_NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "PENDING_CANCEL"
  | "REJECTED"
  | "EXPIRED"
  | "EXPIRED_IN_MATCH"
  | string;

export interface CreateBinanceOrderRequest {
  symbol: string;

  side:
    BinanceOrderSide;

  type:
    BinanceOrderType;

  quantity: number;

  price?: number;

  timeInForce?:
    BinanceTimeInForce;

  clientOrderId?: string;
}

export interface BinanceOrder {
  symbol: string;

  orderId: string;

  clientOrderId:
    string | null;

  originalClientOrderId:
    string | null;

  side:
    BinanceOrderSide | string;

  type:
    BinanceOrderType | string;

  status:
    BinanceOrderStatus;

  timeInForce:
    string | null;

  originalQuantity:
    number;

  executedQuantity:
    number;

  remainingQuantity:
    number;

  price:
    number;

  stopPrice:
    number;

  cumulativeQuoteQuantity:
    number;

  transactionTime:
    number | null;

  updateTime:
    number | null;

  workingTime:
    number | null;

  isWorking:
    boolean | null;
}

interface BinanceOrderResponse {
  symbol?: unknown;

  orderId?: unknown;

  orderListId?: unknown;

  clientOrderId?: unknown;

  origClientOrderId?: unknown;

  transactTime?: unknown;

  updateTime?: unknown;

  workingTime?: unknown;

  price?: unknown;

  origQty?: unknown;

  executedQty?: unknown;

  cummulativeQuoteQty?: unknown;

  cumulativeQuoteQty?: unknown;

  status?: unknown;

  timeInForce?: unknown;

  type?: unknown;

  side?: unknown;

  stopPrice?: unknown;

  isWorking?: unknown;
}

export interface BinanceSignedOrderClient {
  synchronizeServerTime(): Promise<number>;
  postSigned<T>(path: string, parameters?: BinanceRequestParameters, credentials?: BinanceCredentials): Promise<T>;
  getSigned<T>(path: string, parameters?: BinanceRequestParameters, credentials?: BinanceCredentials): Promise<T>;
  deleteSigned<T>(path: string, parameters?: BinanceRequestParameters, credentials?: BinanceCredentials): Promise<T>;
}

export class BinanceOrderApi {
  constructor(
    private readonly client:
      BinanceSignedOrderClient =
      binanceHttpClient,
  ) {}

  async testOrder(
    request:
      CreateBinanceOrderRequest,
    credentials?:
      BinanceCredentials,
  ): Promise<void> {
    this.validateCreateRequest(
      request,
    );

    await this.client
      .synchronizeServerTime();

    await this.client.postSigned<
      Record<string, never>
    >(
      BINANCE.REST.ORDER_TEST,
      this.createOrderParameters(
        request,
      ),
      credentials,
    );
  }

  async createOrder(
    request:
      CreateBinanceOrderRequest,
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceOrder> {
    this.validateCreateRequest(
      request,
    );

    await this.client
      .synchronizeServerTime();

    const response =
      await this.client.postSigned<
        BinanceOrderResponse
      >(
        BINANCE.REST.ORDER,
        this.createOrderParameters(
          request,
        ),
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  async getOrderStatus(
    symbol: string,
    orderId: string,
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceOrder> {
    const normalizedSymbol =
      this.requireSymbol(
        symbol,
      );

    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );

    await this.client
      .synchronizeServerTime();

    const response =
      await this.client.getSigned<
        BinanceOrderResponse
      >(
        BINANCE.REST.ORDER,
        {
          symbol:
            normalizedSymbol,

          orderId:
            normalizedOrderId,
        },
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  async getOrderStatusByClientOrderId(
    symbol: string,
    clientOrderId: string,
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceOrder> {
    const normalizedSymbol =
      this.requireSymbol(
        symbol,
      );

    const normalizedClientOrderId =
      this.requireClientOrderId(
        clientOrderId,
      );

    await this.client
      .synchronizeServerTime();

    const response =
      await this.client.getSigned<
        BinanceOrderResponse
      >(
        BINANCE.REST.ORDER,
        {
          symbol:
            normalizedSymbol,

          origClientOrderId:
            normalizedClientOrderId,
        },
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  async cancelOrder(
    symbol: string,
    orderId: string,
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceOrder> {
    const normalizedSymbol =
      this.requireSymbol(
        symbol,
      );

    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );

    await this.client
      .synchronizeServerTime();

    const response =
      await this.client.deleteSigned<
        BinanceOrderResponse
      >(
        BINANCE.REST.ORDER,
        {
          symbol:
            normalizedSymbol,

          orderId:
            normalizedOrderId,
        },
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  async cancelOrderByClientOrderId(
    symbol: string,
    clientOrderId: string,
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceOrder> {
    const normalizedSymbol =
      this.requireSymbol(
        symbol,
      );

    const normalizedClientOrderId =
      this.requireClientOrderId(
        clientOrderId,
      );

    await this.client
      .synchronizeServerTime();

    const response =
      await this.client.deleteSigned<
        BinanceOrderResponse
      >(
        BINANCE.REST.ORDER,
        {
          symbol:
            normalizedSymbol,

          origClientOrderId:
            normalizedClientOrderId,
        },
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  async getOpenOrders(
    symbol: string,
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceOrder[]> {
    const normalizedSymbol =
      this.requireSymbol(
        symbol,
      );

    await this.client
      .synchronizeServerTime();

    const response =
      await this.client.getSigned<
        BinanceOrderResponse[]
      >(
        BINANCE.REST.OPEN_ORDERS,
        {
          symbol:
            normalizedSymbol,
        },
        credentials,
      );

    if (!Array.isArray(response)) {
      throw new Error(
        "Invalid Binance open-orders response.",
      );
    }

    return response.map(
      (order) =>
        this.normalizeOrder(
          order,
        ),
    );
  }

  private createOrderParameters(
    request:
      CreateBinanceOrderRequest,
  ): Record<
    string,
    string | number | boolean
  > {
    const symbol =
      this.requireSymbol(
        request.symbol,
      );

    const parameters: Record<
      string,
      string | number | boolean
    > = {
      symbol,

      side:
        request.side,

      type:
        request.type,

      quantity:
        formatOrderDecimal(
          request.quantity,
        ),

      newOrderRespType:
        "FULL",
    };

    if (
      request.type === "LIMIT" || request.type === "LIMIT_MAKER"
    ) {
      parameters.price =
        formatOrderDecimal(
          request.price as number,
        );
      if (request.type === "LIMIT") {
        parameters.timeInForce = request.timeInForce ?? "GTC";
      }
    }

    if (request.clientOrderId) {
      parameters.newClientOrderId =
        this.requireClientOrderId(
          request.clientOrderId,
        );
    }

    return parameters;
  }

  private validateCreateRequest(
    request:
      CreateBinanceOrderRequest,
  ): void {
    this.requireSymbol(
      request.symbol,
    );

    if (
      request.side !== "BUY" &&
      request.side !== "SELL"
    ) {
      throw new Error(
        "Binance order side must be BUY or SELL.",
      );
    }

    if (
      request.type !== "LIMIT" &&
      request.type !== "LIMIT_MAKER" &&
      request.type !== "MARKET"
    ) {
      throw new Error(
        "Binance order type must be LIMIT, LIMIT_MAKER or MARKET.",
      );
    }

    if (
      !Number.isFinite(
        request.quantity,
      ) ||
      request.quantity <= 0
    ) {
      throw new Error(
        "Binance order quantity must be a positive finite number.",
      );
    }

    if (
      (request.type === "LIMIT" || request.type === "LIMIT_MAKER") &&
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
        "A positive price is required for a Binance LIMIT or LIMIT_MAKER order.",
      );
    }

    if (
      request.timeInForce !==
        undefined &&
      request.type !==
        "LIMIT"
    ) {
      throw new Error(
        "timeInForce is only supported for LIMIT orders; LIMIT_MAKER is maker-only without timeInForce.",
      );
    }

    if (
      request.clientOrderId !==
        undefined
    ) {
      this.requireClientOrderId(
        request.clientOrderId,
      );
    }
  }

  private normalizeOrder(
    response:
      BinanceOrderResponse,
  ): BinanceOrder {
    if (!this.isRecord(response)) {
      throw new Error(
        "Invalid Binance order response.",
      );
    }

    const symbol =
      this.toOptionalString(
        response.symbol,
      )
        ?.toUpperCase() ??
      null;

    const orderId =
      this.toIdentifierString(
        response.orderId,
      );

    if (!symbol || !orderId) {
      throw new Error(
        `Invalid Binance order response: ${this.safeStringify(
          response,
        )}`,
      );
    }

    const originalQuantity =
      this.toNonNegativeNumber(
        response.origQty,
      );

    const executedQuantity =
      this.toNonNegativeNumber(
        response.executedQty,
      );

    return {
      symbol,

      orderId,

      clientOrderId:
        this.toOptionalString(
          response.clientOrderId,
        ),

      originalClientOrderId:
        this.toOptionalString(
          response.origClientOrderId,
        ),

      side:
        this.toOptionalString(
          response.side,
        ) ??
        "UNKNOWN",

      type:
        this.toOptionalString(
          response.type,
        ) ??
        "UNKNOWN",

      status:
        this.toOptionalString(
          response.status,
        ) ??
        "UNKNOWN",

      timeInForce:
        this.toOptionalString(
          response.timeInForce,
        ),

      originalQuantity,

      executedQuantity,

      remainingQuantity:
        Math.max(
          0,
          originalQuantity -
            executedQuantity,
        ),

      price:
        this.toNonNegativeNumber(
          response.price,
        ),

      stopPrice:
        this.toNonNegativeNumber(
          response.stopPrice,
        ),

      cumulativeQuoteQuantity:
        this.toNonNegativeNumber(
          response
            .cummulativeQuoteQty ??
          response
            .cumulativeQuoteQty,
        ),

      transactionTime:
        this.toOptionalTimestamp(
          response.transactTime,
        ),

      updateTime:
        this.toOptionalTimestamp(
          response.updateTime,
        ),

      workingTime:
        this.toOptionalTimestamp(
          response.workingTime,
        ),

      isWorking:
        typeof response.isWorking ===
          "boolean"
          ? response.isWorking
          : null,
    };
  }

  private requireSymbol(
    symbol: string,
  ): string {
    const normalized =
      symbol
        .trim()
        .toUpperCase();

    if (!normalized) {
      throw new Error(
        "Binance symbol is required.",
      );
    }

    return normalized;
  }

  private requireOrderId(
    orderId: string,
  ): string {
    const normalized =
      orderId.trim();

    if (
      !normalized ||
      !/^\d+$/.test(
        normalized,
      )
    ) {
      throw new Error(
        "Binance order ID must contain only digits.",
      );
    }

    return normalized;
  }

  private requireClientOrderId(
    clientOrderId: string,
  ): string {
    const normalized =
      clientOrderId.trim();

    if (!normalized) {
      throw new Error(
        "Binance client order ID is required.",
      );
    }

    if (
      normalized.length > 36
    ) {
      throw new Error(
        "Binance client order ID cannot exceed 36 characters.",
      );
    }

    return normalized;
  }

  private toIdentifierString(
    value: unknown,
  ): string | null {
    if (
      typeof value === "string"
    ) {
      const normalized =
        value.trim();

      return normalized
        ? normalized
        : null;
    }

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return String(value);
    }

    return null;
  }

  private toOptionalString(
    value: unknown,
  ): string | null {
    if (
      typeof value !==
      "string"
    ) {
      return null;
    }

    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
  }

  private toNonNegativeNumber(
    value: unknown,
  ): number {
    const numberValue =
      Number(
        value ??
        0,
      );

    if (
      !Number.isFinite(
        numberValue,
      ) ||
      numberValue < 0
    ) {
      return 0;
    }

    return numberValue;
  }

  private toOptionalTimestamp(
    value: unknown,
  ): number | null {
    const numberValue =
      Number(value);

    return (
      Number.isSafeInteger(
        numberValue,
      ) &&
      numberValue >= 0
    )
      ? numberValue
      : null;
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
      value !== null &&
      !Array.isArray(value)
    );
  }

  private safeStringify(
    value: unknown,
  ): string {
    try {
      return JSON.stringify(
        value,
      );
    } catch {
      return String(value);
    }
  }
}

function formatOrderDecimal(
  value: number,
): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      "Binance order decimal must be positive and finite.",
    );
  }

  return value
    .toFixed(12)
    .replace(/\.0+$/u, "")
    .replace(/(\.\d*?)0+$/u, "$1");
}

export const binanceOrderApi =
  new BinanceOrderApi();
