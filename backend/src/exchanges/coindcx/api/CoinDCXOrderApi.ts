import {
  coinDCXHttpClient,
  type CoinDCXCredentials,
} from "./CoinDCXHttpClient";

import {
  coinDCXSigner,
} from "./CoinDCXSigner";

export type CoinDCXOrderSide =
  | "buy"
  | "sell";

export type CoinDCXOrderType =
  | "limit_order"
  | "market_order";

export type CoinDCXOrderStatus =
  | "init"
  | "open"
  | "partially_filled"
  | "filled"
  | "partially_cancelled"
  | "cancelled"
  | "rejected"
  | string;

export interface CreateCoinDCXOrderRequest {
  market: string;

  side: CoinDCXOrderSide;

  orderType: CoinDCXOrderType;

  totalQuantity: number;

  pricePerUnit?: number;

  clientOrderId?: string;
}

export interface CoinDCXOrder {
  id: string;

  clientOrderId: string | null;

  market: string;

  orderType:
    | CoinDCXOrderType
    | string;

  side: CoinDCXOrderSide;

  status: CoinDCXOrderStatus;

  totalQuantity: number;

  remainingQuantity: number;

  averagePrice: number;

  pricePerUnit: number;

  feePercent: number;

  feeAmount: number;

  createdAt: string | null;

  updatedAt: string | null;
}

interface CoinDCXOrderResponse {
  id?: unknown;

  client_order_id?: unknown;

  market?: unknown;

  order_type?: unknown;

  side?: unknown;

  status?: unknown;

  total_quantity?: unknown;

  remaining_quantity?: unknown;

  avg_price?: unknown;

  price_per_unit?: unknown;

  fee?: unknown;

  fee_amount?: unknown;

  created_at?: unknown;

  updated_at?: unknown;
}

interface CoinDCXOrderCollectionResponse {
  orders?: CoinDCXOrderResponse[];

  data?:
    | CoinDCXOrderResponse
    | CoinDCXOrderResponse[];

  message?: string;

  error?: string;

  status?: number | string;

  code?: number | string;
}

type CoinDCXSingleOrderApiResponse =
  | CoinDCXOrderResponse
  | CoinDCXOrderResponse[]
  | CoinDCXOrderCollectionResponse;

type CoinDCXMultipleOrderApiResponse =
  | CoinDCXOrderResponse[]
  | CoinDCXOrderCollectionResponse;

type CoinDCXCancelApiResponse =
  | CoinDCXOrderResponse
  | CoinDCXOrderResponse[]
  | CoinDCXOrderCollectionResponse
  | null
  | undefined
  | "";

export class CoinDCXOrderApi {
  async createOrder(
    request: CreateCoinDCXOrderRequest,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXOrder> {
    this.validateCreateRequest(
      request,
    );

    const normalizedMarket =
      request.market
        .trim()
        .toUpperCase();

    const body =
      coinDCXSigner.createTimestampBody({
        market:
          normalizedMarket,

        side:
          request.side,

        order_type:
          request.orderType,

        total_quantity:
          request.totalQuantity,

        ...(request.orderType ===
          "limit_order"
          ? {
              price_per_unit:
                request.pricePerUnit,
            }
          : {}),

        ...(request.clientOrderId
          ? {
              client_order_id:
                request.clientOrderId,
            }
          : {}),
      });

    const response =
      await coinDCXHttpClient.postPrivate<
        CoinDCXSingleOrderApiResponse
      >(
        "/exchange/v1/orders/create",
        body,
        credentials,
      );

    const rawOrder =
      this.extractSingleOrder(
        response,
      );

    if (!rawOrder) {
      throw new Error(
        `Invalid CoinDCX create-order response: ${this.safeStringify(
          response,
        )}`,
      );
    }

    return this.normalizeOrder(
      rawOrder,
    );
  }

  async getActiveOrders(
    market: string,
    credentials: CoinDCXCredentials,
    side?: CoinDCXOrderSide,
  ): Promise<CoinDCXOrder[]> {
    const normalizedMarket =
      market
        .trim()
        .toUpperCase();

    if (!normalizedMarket) {
      throw new Error(
        "CoinDCX market is required.",
      );
    }

    if (
      side !== undefined &&
      side !== "buy" &&
      side !== "sell"
    ) {
      throw new Error(
        "CoinDCX order side must be buy or sell.",
      );
    }

    const body =
      coinDCXSigner.createTimestampBody({
        market:
          normalizedMarket,

        ...(side
          ? {
              side,
            }
          : {}),
      });

    const response =
      await coinDCXHttpClient.postPrivate<
        CoinDCXMultipleOrderApiResponse
      >(
        "/exchange/v1/orders/active_orders",
        body,
        credentials,
      );

    const orders =
      this.extractOrders(
        response,
      );

    if (!orders) {
      throw new Error(
        `Invalid CoinDCX active-orders response: ${this.safeStringify(
          response,
        )}`,
      );
    }

    return orders.map(
      (order) =>
        this.normalizeOrder(
          order,
        ),
    );
  }
  async getOrderStatusByClientOrderId(
  clientOrderId: string,
  credentials: CoinDCXCredentials,
): Promise<CoinDCXOrder> {
  const normalizedClientOrderId =
    this.requireClientOrderId(
      clientOrderId,
    );

  const body =
    coinDCXSigner.createTimestampBody({
      client_order_id:
        normalizedClientOrderId,
    });

  const response =
    await coinDCXHttpClient.postPrivate<
      CoinDCXSingleOrderApiResponse
    >(
      "/exchange/v1/orders/status",
      body,
      credentials,
    );

  const rawOrder =
    this.extractSingleOrder(
      response,
    );

  if (!rawOrder) {
    throw new Error(
      `Invalid CoinDCX order-status response for client order ID ${normalizedClientOrderId}: ${this.safeStringify(
        response,
      )}`,
    );
  }

  return this.normalizeOrder(
    rawOrder,
  );
}

  async getOrderStatus(
    orderId: string,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXOrder> {
    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );

    const body =
      coinDCXSigner.createTimestampBody({
        id:
          normalizedOrderId,
      });

    const response =
      await coinDCXHttpClient.postPrivate<
        CoinDCXSingleOrderApiResponse
      >(
        "/exchange/v1/orders/status",
        body,
        credentials,
      );

    const rawOrder =
      this.extractSingleOrder(
        response,
      );

    if (!rawOrder) {
      throw new Error(
        `Invalid CoinDCX order-status response: ${this.safeStringify(
          response,
        )}`,
      );
    }

    return this.normalizeOrder(
      rawOrder,
    );
  }
   async cancelOrderByClientOrderId(
  clientOrderId: string,
  credentials: CoinDCXCredentials,
): Promise<CoinDCXOrder> {
  const normalizedClientOrderId =
    this.requireClientOrderId(
      clientOrderId,
    );

  const body =
    coinDCXSigner.createTimestampBody({
      client_order_id:
        normalizedClientOrderId,
    });

  await coinDCXHttpClient.postPrivate<
    CoinDCXCancelApiResponse
  >(
    "/exchange/v1/orders/cancel",
    body,
    credentials,
  );

  await this.sleep(
    500,
  );

  return this.getOrderStatusByClientOrderId(
    normalizedClientOrderId,
    credentials,
  );
}
  async cancelOrder(
    orderId: string,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXOrder> {
    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );

    const body =
      coinDCXSigner.createTimestampBody({
        id:
          normalizedOrderId,
      });

    const response =
      await coinDCXHttpClient.postPrivate<
        CoinDCXCancelApiResponse
      >(
        "/exchange/v1/orders/cancel",
        body,
        credentials,
      );

    /*
     * CoinDCX spot cancel endpoint may return an empty
     * response or a generic success object. Therefore,
     * fetch the authoritative order state after cancel.
     */
    const returnedOrder =
      this.extractSingleOrder(
        response,
      );

    if (returnedOrder) {
      return this.normalizeOrder(
        returnedOrder,
      );
    }

    await this.sleep(
      500,
    );

    return this.getOrderStatus(
      normalizedOrderId,
      credentials,
    );
  }

  private validateCreateRequest(
    request: CreateCoinDCXOrderRequest,
  ): void {
    if (
      typeof request.market !==
        "string" ||
      request.market
        .trim()
        .length === 0
    ) {
      throw new Error(
        "CoinDCX market is required.",
      );
    }

    if (
      request.side !== "buy" &&
      request.side !== "sell"
    ) {
      throw new Error(
        "CoinDCX order side must be buy or sell.",
      );
    }

    if (
      request.orderType !==
        "limit_order" &&
      request.orderType !==
        "market_order"
    ) {
      throw new Error(
        "CoinDCX order type is invalid.",
      );
    }

    if (
      !Number.isFinite(
        request.totalQuantity,
      ) ||
      request.totalQuantity <= 0
    ) {
      throw new Error(
        "CoinDCX order quantity must be positive.",
      );
    }

    if (
      request.orderType ===
        "limit_order"
    ) {
      if (
        request.pricePerUnit ===
          undefined ||
        !Number.isFinite(
          request.pricePerUnit,
        ) ||
        request.pricePerUnit <= 0
      ) {
        throw new Error(
          "A valid price is required for a limit order.",
        );
      }
    }

    if (
      request.clientOrderId !==
        undefined &&
      request.clientOrderId
        .trim()
        .length === 0
    ) {
      throw new Error(
        "Client order ID cannot be empty.",
      );
    }
  }

  private requireOrderId(
    orderId: string,
  ): string {
    const normalizedOrderId =
      orderId.trim();

    if (!normalizedOrderId) {
      throw new Error(
        "CoinDCX order ID is required.",
      );
    }

    return normalizedOrderId;
  }
  private requireClientOrderId(
  clientOrderId: string,
): string {
  const normalizedClientOrderId =
    clientOrderId.trim();

  if (!normalizedClientOrderId) {
    throw new Error(
      "CoinDCX client order ID is required.",
    );
  }

  return normalizedClientOrderId;
}

  private extractSingleOrder(
    response:
      CoinDCXSingleOrderApiResponse
      | CoinDCXCancelApiResponse,
  ): CoinDCXOrderResponse | null {
    if (
      response === null ||
      response === undefined ||
      response === ""
    ) {
      return null;
    }

    if (Array.isArray(response)) {
      return (
        response[0] ??
        null
      );
    }

    if (
      !this.isRecord(response)
    ) {
      return null;
    }

    const orders =
      response.orders;

    if (
      Array.isArray(orders)
    ) {
      return (
        orders[0] ??
        null
      );
    }

    const data =
      response.data;

    if (Array.isArray(data)) {
      return (
        data[0] ??
        null
      );
    }

    if (
      this.isRecord(data)
    ) {
      return data;
    }

    if (
      this.looksLikeOrder(
        response,
      )
    ) {
      return response;
    }

    return null;
  }

  private extractOrders(
    response:
      CoinDCXMultipleOrderApiResponse,
  ): CoinDCXOrderResponse[] | null {
    if (Array.isArray(response)) {
      return response;
    }

    if (
      !this.isRecord(response)
    ) {
      return null;
    }

    if (
      Array.isArray(
        response.orders,
      )
    ) {
      return response.orders;
    }

    if (
      Array.isArray(
        response.data,
      )
    ) {
      return response.data;
    }

    return null;
  }

   private looksLikeOrder(
  value: Record<string, unknown>,
): boolean {
  return (
    typeof value.id === "string" ||
    typeof value.market === "string" ||
    typeof value.order_type === "string"
  );
}

  private normalizeOrder(
    response:
      CoinDCXOrderResponse,
  ): CoinDCXOrder {
    const id =
      this.toOptionalString(
        response.id,
      );

    const market =
      this.toOptionalString(
        response.market,
      )
        ?.toUpperCase() ??
      null;

    const side =
      this.toOptionalString(
        response.side,
      )
        ?.toLowerCase() ??
      null;

    if (
      !id ||
      !market ||
      (
        side !== "buy" &&
        side !== "sell"
      )
    ) {
      throw new Error(
        `Invalid CoinDCX order response: ${this.safeStringify(
          response,
        )}`,
      );
    }

    return {
      id,

      clientOrderId:
        this.toOptionalString(
          response.client_order_id,
        ),

      market,

      orderType:
        this.toOptionalString(
          response.order_type,
        ) ??
        "unknown",

      side,

      status:
        this.toOptionalString(
          response.status,
        ) ??
        "unknown",

      totalQuantity:
        this.toFiniteNumber(
          response.total_quantity,
        ),

      remainingQuantity:
        this.toFiniteNumber(
          response.remaining_quantity,
        ),

      averagePrice:
        this.toFiniteNumber(
          response.avg_price,
        ),

      pricePerUnit:
        this.toFiniteNumber(
          response.price_per_unit,
        ),

      feePercent:
        this.toFiniteNumber(
          response.fee,
        ),

      feeAmount:
        this.toFiniteNumber(
          response.fee_amount,
        ),

      createdAt:
        this.toOptionalString(
          response.created_at,
        ),

      updatedAt:
        this.toOptionalString(
          response.updated_at,
        ),
    };
  }

  private toFiniteNumber(
    value: unknown,
  ): number {
    const numberValue =
      Number(value ?? 0);

    return Number.isFinite(
      numberValue,
    )
      ? numberValue
      : 0;
  }

  private toOptionalString(
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

  private sleep(
    milliseconds: number,
  ): Promise<void> {
    return new Promise(
      (resolve) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
}

export const coinDCXOrderApi =
  new CoinDCXOrderApi();