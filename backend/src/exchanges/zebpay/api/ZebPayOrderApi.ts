import {ZEBPAY} from "../constants";
import type {ZebPayCredentials} from "./ZebPayCredentialsProvider";
import {zebPayPrivateHttpClient} from "./ZebPayPrivateHttpClient";

export interface ZebPayLimitOrderRequest {
  market: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
}

export interface ZebPaySpotOrder {
  id: string;
  market: string;
  side: "buy" | "sell";
  status: string;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price: number;
  averagePrice: number;
  feeAmount: number;
}

interface ZebPaySignedMutationClient {
  getSigned<T>(path: string, query: ReadonlyArray<readonly [string, string | number | boolean]>, credentials: ZebPayCredentials): Promise<{data: T}>;
  postSigned<T>(path: string, body: Readonly<Record<string, string | number | boolean>>, credentials: ZebPayCredentials): Promise<{data: T}>;
  deleteSigned<T>(path: string, query: ReadonlyArray<readonly [string, string | number | boolean]>, credentials: ZebPayCredentials): Promise<{data: T}>;
}

/** V164 order lifecycle mapping. No withdrawal or transfer endpoint exists here. */
export class ZebPayOrderApi {
  constructor(
    private readonly client:
      ZebPaySignedMutationClient =
      zebPayPrivateHttpClient,
  ) {}

  async createLimitOrder(request: ZebPayLimitOrderRequest, credentials: ZebPayCredentials): Promise<ZebPaySpotOrder> {
    validateRequest(request);
    const market = normalizeMarket(request.market);
    const response = await this.client.postSigned<unknown>(
      ZEBPAY.REST.ORDERS_PATH,
      {
        trade_pair: market,
        side: request.side === "buy" ? "bid" : "ask",
        size: request.quantity,
        price: request.price,
        tradeType: 1,
        platform: "API_Trading",
      },
      credentials,
    );
    return normalizeOrder(response.data, {market, side: request.side, quantity: request.quantity, price: request.price});
  }

  async getOrder(orderId: string, market: string, credentials: ZebPayCredentials): Promise<ZebPaySpotOrder> {
    const id = normalizeOrderId(orderId);
    const normalizedMarket = normalizeMarket(market);
    const response = await this.client.getSigned<unknown>(
      ZEBPAY.REST.ORDERS_PATH,
      [["orderId", id], ["trade_pair", normalizedMarket]],
      credentials,
    );
    return normalizeOrder(selectOrder(response.data, id), {market: normalizedMarket});
  }

  async cancelOrder(orderId: string, market: string, credentials: ZebPayCredentials): Promise<ZebPaySpotOrder> {
    const id = normalizeOrderId(orderId);
    const normalizedMarket = normalizeMarket(market);
    const response = await this.client.deleteSigned<unknown>(
      `${ZEBPAY.REST.ORDERS_PATH}/${encodeURIComponent(id)}`,
      [["trade_pair", normalizedMarket]],
      credentials,
    );
    return normalizeOrder(response.data, {id, market: normalizedMarket, status: "cancelled"});
  }
}

function normalizeOrder(
  value: unknown,
  fallback: Partial<ZebPaySpotOrder>,
): ZebPaySpotOrder {
  const row = selectObject(value);
  const id = stringValue(row.orderId ?? row.order_id ?? row.id) || fallback.id || "";
  if (!id) throw new Error("Invalid ZebPay order response: order id is missing.");
  const rawSide = stringValue(row.side).toLowerCase();
  const side = rawSide === "ask" || rawSide === "sell" ? "sell" : rawSide === "bid" || rawSide === "buy" ? "buy" : fallback.side;
  if (!side) throw new Error("Invalid ZebPay order response: side is missing.");
  const quantity = finiteNonNegative(row.size ?? row.quantity ?? row.originalQuantity, fallback.quantity ?? 0);
  const filledQuantity = finiteNonNegative(row.filledSize ?? row.filled_quantity ?? row.executedQuantity, 0);
  return {
    id,
    market: normalizeMarket(stringValue(row.trade_pair ?? row.tradePair ?? row.market) || fallback.market || ""),
    side,
    status: stringValue(row.status) || fallback.status || "pending",
    quantity,
    filledQuantity,
    remainingQuantity: finiteNonNegative(row.remainingSize ?? row.remaining_quantity, Math.max(0, quantity - filledQuantity)),
    price: finiteNonNegative(row.price, fallback.price ?? 0),
    averagePrice: finiteNonNegative(row.averagePrice ?? row.avg_price ?? row.executedPrice, 0),
    feeAmount: finiteNonNegative(row.fee ?? row.feeAmount, 0),
  };
}

function selectOrder(value: unknown, id: string): unknown {
  if (!Array.isArray(value)) return value;
  return value.find((row) => isRecord(row) && stringValue(row.orderId ?? row.order_id ?? row.id) === id) ?? value[0];
}

function selectObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return selectObject(value[0]);
  if (isRecord(value) && isRecord(value.order)) return value.order;
  if (!isRecord(value)) throw new Error("Invalid ZebPay order response.");
  return value;
}

function validateRequest(request: ZebPayLimitOrderRequest): void {
  normalizeMarket(request.market);
  if (!Number.isFinite(request.quantity) || request.quantity <= 0 || !Number.isFinite(request.price) || request.price <= 0) {
    throw new Error("ZebPay limit order requires positive finite quantity and price.");
  }
}

function normalizeMarket(value: string): string {
  const market = value.trim().toUpperCase().replace(/[_/\s]+/gu, "-");
  if (!/^[A-Z0-9]+-[A-Z0-9]+$/u.test(market)) throw new Error("ZebPay order market must be a base-quote pair.");
  return market;
}

function normalizeOrderId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("Invalid ZebPay order id.");
  return id;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function stringValue(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export const zebPayOrderApi = new ZebPayOrderApi();
