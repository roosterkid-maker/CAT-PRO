import {bybitCredentialsProvider, type BybitCredentials} from "../../../exchanges/bybit/api/BybitCredentialsProvider";
import {bybitPrivateHttpClient, type BybitSignedPostBody} from "../../../exchanges/bybit/api/BybitPrivateHttpClient";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {DerivativeOrderApi, DerivativeVenueOrder} from "./DerivativeOrderContract";
import {validateDerivativeRequest} from "./DerivativeOrderContract";

interface BybitOrderResult {list?: unknown; orderId?: unknown; orderLinkId?: unknown;}
interface BybitOrderRecord {
  orderId?: unknown; orderLinkId?: unknown; symbol?: unknown; side?: unknown; orderType?: unknown; orderStatus?: unknown;
  qty?: unknown; price?: unknown; cumExecQty?: unknown; leavesQty?: unknown; cumExecValue?: unknown; avgPrice?: unknown;
  cumExecFee?: unknown; reduceOnly?: unknown; positionIdx?: unknown; rejectReason?: unknown;
}
export interface BybitLinearOrderPort {
  getSigned<T>(path: string, parameters: Record<string, string>, credentials?: BybitCredentials): Promise<T>;
  postSigned<T>(path: string, body: BybitSignedPostBody, credentials?: BybitCredentials): Promise<T>;
}
interface BybitCredentialsSource {getCredentials(): BybitCredentials;}

export class BybitLinearOrderApi implements DerivativeOrderApi {
  readonly exchange = "bybit";
  constructor(private readonly port: BybitLinearOrderPort = bybitPrivateHttpClient,
    private readonly credentialsSource: BybitCredentialsSource = bybitCredentialsProvider) {}
  async create(request: LiveExecutionRequest): Promise<DerivativeVenueOrder> {
    validateDerivativeRequest(request, this.exchange);
    const result = await this.port.postSigned<BybitOrderResult>("/v5/order/create", bybitParameters(request),
      this.credentialsSource.getCredentials());
    const orderId = requireOrderId(result.orderId);
    return Object.freeze({exchange: this.exchange, market: normalizeMarket(request.market), side: request.side, orderId,
      clientOrderId: nullableString(result.orderLinkId ?? request.clientOrderId), status: "PENDING",
      requestedQuantity: request.quantity, filledQuantity: 0, remainingQuantity: request.quantity,
      requestedPrice: request.price ?? null, averageFillPrice: 0, feeAmount: 0, reduceOnly: request.reduceOnly as boolean,
      positionMode: request.positionMode as "ONE_WAY" | "HEDGE", positionSide: request.positionSide as "LONG" | "SHORT",
      rejectReason: null});
  }
  async get(orderId: string, market: string): Promise<DerivativeVenueOrder> {
    const result = await this.port.getSigned<BybitOrderResult>("/v5/order/realtime",
      {category: "linear", symbol: normalizeMarket(market), orderId: requireOrderId(orderId)},
      this.credentialsSource.getCredentials());
    return normalizeBybitOrder(result, orderId);
  }
  async cancel(orderId: string, market: string): Promise<DerivativeVenueOrder> {
    const normalizedId = requireOrderId(orderId); const normalizedMarket = normalizeMarket(market);
    const acknowledgement = await this.port.postSigned<BybitOrderResult>("/v5/order/cancel",
      {category: "linear", symbol: normalizedMarket, orderId: normalizedId}, this.credentialsSource.getCredentials());
    if (requireOrderId(acknowledgement.orderId) !== normalizedId) throw new Error("Bybit linear cancel acknowledgement order ID mismatched.");
    return this.get(normalizedId, normalizedMarket);
  }
}

export function bybitParameters(request: LiveExecutionRequest): BybitSignedPostBody {
  validateDerivativeRequest(request, "bybit");
  const positionIdx = request.positionMode === "ONE_WAY" ? 0 : request.positionSide === "LONG" ? 1 : 2;
  return {category: "linear", symbol: normalizeMarket(request.market), side: request.side === "buy" ? "Buy" : "Sell",
    orderType: request.orderType === "market" ? "Market" : "Limit", qty: format(request.quantity), positionIdx,
    reduceOnly: request.reduceOnly as boolean, timeInForce: request.orderType === "market" ? "IOC" : "GTC",
    ...(request.orderType === "limit" ? {price: format(request.price as number)} : {}),
    ...(request.clientOrderId ? {orderLinkId: request.clientOrderId} : {})};
}

function normalizeBybitOrder(result: BybitOrderResult, expectedOrderId: string): DerivativeVenueOrder {
  if (!Array.isArray(result.list)) throw new Error("Bybit linear realtime order list is missing.");
  const records = result.list.filter(isRecord).filter((item) => String(item.orderId ?? "").trim() === expectedOrderId);
  if (records.length !== 1) throw new Error("Bybit linear order response requires one exact order match.");
  const item = records[0] as BybitOrderRecord;
  const side = String(item.side).toUpperCase() === "BUY" ? "buy" as const : String(item.side).toUpperCase() === "SELL" ? "sell" as const
    : (() => { throw new Error("Bybit linear order side is invalid."); })();
  const positionIdx = Number(item.positionIdx);
  if (![0, 1, 2].includes(positionIdx)) throw new Error("Bybit linear positionIdx is invalid.");
  const positionMode = positionIdx === 0 ? "ONE_WAY" as const : "HEDGE" as const;
  const reduceOnly = item.reduceOnly === true || String(item.reduceOnly).toLowerCase() === "true";
  const positionSide = positionIdx === 1 ? "LONG" as const : positionIdx === 2 ? "SHORT" as const
    : reduceOnly ? side === "buy" ? "SHORT" as const : "LONG" as const : side === "buy" ? "LONG" as const : "SHORT" as const;
  const requestedQuantity = positive(item.qty, "Bybit linear qty");
  const filledQuantity = nonNegative(item.cumExecQty, "Bybit linear cumExecQty");
  const leaves = Number(item.leavesQty);
  const average = Number(item.avgPrice);
  const cumulativeValue = Number(item.cumExecValue);
  const averageFillPrice = Number.isFinite(average) && average > 0 ? average
    : filledQuantity > 0 && Number.isFinite(cumulativeValue) && cumulativeValue >= 0 ? cumulativeValue / filledQuantity : 0;
  const price = Number(item.price);
  const reject = nullableString(item.rejectReason);
  return Object.freeze({exchange: "bybit", market: normalizeMarket(String(item.symbol)), side,
    orderId: requireOrderId(item.orderId), clientOrderId: nullableString(item.orderLinkId), status: mapStatus(item.orderStatus),
    requestedQuantity, filledQuantity, remainingQuantity: Number.isFinite(leaves) && leaves >= 0 ? leaves : Math.max(0, requestedQuantity - filledQuantity),
    requestedPrice: price > 0 ? price : null, averageFillPrice, feeAmount: nonNegative(item.cumExecFee ?? 0, "Bybit linear cumExecFee"),
    reduceOnly, positionMode, positionSide, rejectReason: mapStatus(item.orderStatus) === "REJECTED" ? reject || "Bybit linear order was rejected." : null});
}
function mapStatus(value: unknown): DerivativeVenueOrder["status"] {
  switch (String(value).toUpperCase()) {
    case "NEW": case "UNTRIGGERED": case "CREATED": return "OPEN";
    case "PARTIALLYFILLED": case "PARTIALLY_FILLED": return "PARTIALLY_FILLED";
    case "FILLED": return "FILLED";
    case "CANCELLED": case "CANCELED": case "DEACTIVATED": return "CANCELLED";
    case "REJECTED": return "REJECTED";
    default: throw new Error(`Unsupported Bybit linear order status: ${String(value)}`);
  }
}
function normalizeMarket(value: string): string { const market = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, ""); if (!/^[A-Z0-9]{2,30}$/u.test(market)) throw new Error("Bybit linear symbol is invalid."); return market; }
function requireOrderId(value: unknown): string { const id = typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; if (!/^[A-Za-z0-9_-]{1,80}$/u.test(id)) throw new Error("Bybit linear order ID is invalid."); return id; }
function format(value: number): string { if (!Number.isFinite(value) || value <= 0) throw new Error("Bybit linear positive number is invalid."); return String(value); }
function positive(value: unknown, label: string): number { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} is invalid.`); return parsed; }
function nonNegative(value: unknown, label: string): number { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} is invalid.`); return parsed; }
function nullableString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export const bybitLinearOrderApi = new BybitLinearOrderApi();
