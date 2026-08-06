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

  orderType: CoinDCXOrderType | string;

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
  id?: string;

  client_order_id?: string;

  market?: string;

  order_type?: string;

  side?: string;

  status?: string;

  total_quantity?: number | string;

  remaining_quantity?: number | string;

  avg_price?: number | string;

  price_per_unit?: number | string;

  fee?: number | string;

  fee_amount?: number | string;

  created_at?: string;

  updated_at?: string;
}

export class CoinDCXOrderApi {
  async createOrder(
    request: CreateCoinDCXOrderRequest,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXOrder> {
    this.validateCreateRequest(
      request,
    );

    const body =
      coinDCXSigner.createTimestampBody({
        market:
          request.market
            .trim()
            .toUpperCase(),

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
        CoinDCXOrderResponse
      >(
        "/exchange/v1/orders/create",
        body,
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  async getOrderStatus(
    orderId: string,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXOrder> {
    const normalizedOrderId =
      orderId.trim();

    if (!normalizedOrderId) {
      throw new Error(
        "CoinDCX order ID is required.",
      );
    }

    const body =
      coinDCXSigner.createTimestampBody({
        id: normalizedOrderId,
      });

    const response =
      await coinDCXHttpClient.postPrivate<
        CoinDCXOrderResponse
      >(
        "/exchange/v1/orders/status",
        body,
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  async cancelOrder(
    orderId: string,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXOrder> {
    const normalizedOrderId =
      orderId.trim();

    if (!normalizedOrderId) {
      throw new Error(
        "CoinDCX order ID is required.",
      );
    }

    const body =
      coinDCXSigner.createTimestampBody({
        id: normalizedOrderId,
      });

    const response =
      await coinDCXHttpClient.postPrivate<
        CoinDCXOrderResponse
      >(
        "/exchange/v1/orders/cancel",
        body,
        credentials,
      );

    return this.normalizeOrder(
      response,
    );
  }

  private validateCreateRequest(
    request: CreateCoinDCXOrderRequest,
  ): void {
    if (
      typeof request.market !== "string" ||
      request.market.trim().length === 0
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
        "limit_order" &&
      (
        request.pricePerUnit ===
          undefined ||
        !Number.isFinite(
          request.pricePerUnit,
        ) ||
        request.pricePerUnit <= 0
      )
    ) {
      throw new Error(
        "A valid price is required for a limit order.",
      );
    }
  }

  private normalizeOrder(
    response: CoinDCXOrderResponse,
  ): CoinDCXOrder {
    const id =
      response.id?.trim();

    const market =
      response.market
        ?.trim()
        .toUpperCase();

    const side =
      response.side
        ?.trim()
        .toLowerCase();

    if (
      !id ||
      !market ||
      (
        side !== "buy" &&
        side !== "sell"
      )
    ) {
      throw new Error(
        "Invalid CoinDCX order response.",
      );
    }

    return {
      id,

      clientOrderId:
        response.client_order_id ??
        null,

      market,

      orderType:
        response.order_type ??
        "unknown",

      side,

      status:
        response.status ??
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
        response.created_at ??
        null,

      updatedAt:
        response.updated_at ??
        null,
    };
  }

  private toFiniteNumber(
    value:
      | number
      | string
      | undefined,
  ): number {
    const numberValue =
      Number(value ?? 0);

    return Number.isFinite(
      numberValue,
    )
      ? numberValue
      : 0;
  }
}

export const coinDCXOrderApi =
  new CoinDCXOrderApi();