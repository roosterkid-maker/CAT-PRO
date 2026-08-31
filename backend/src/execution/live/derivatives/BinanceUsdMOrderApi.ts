import {binanceUsdMCredentialsProvider} from "../../../derivatives/providers/BinanceUsdMCredentialsProvider";
import type {BinanceCredentials} from "../../../exchanges/binance/api/BinanceCredentialsProvider";
import {binanceUsdMHttpClient, type BinanceUsdMHttpClient} from "../../../exchanges/binance/api/BinanceUsdMHttpClient";
import {binanceSigner, type BinanceRequestParameters} from "../../../exchanges/binance/api/BinanceSigner";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {DerivativeOrderApi, DerivativeVenueOrder} from "./DerivativeOrderContract";
import {validateDerivativeRequest} from "./DerivativeOrderContract";

interface BinanceServerTimeResponse {serverTime?: unknown;}
interface BinanceUsdMOrderResponse {
  symbol?: unknown; orderId?: unknown; clientOrderId?: unknown; side?: unknown; status?: unknown; origQty?: unknown;
  executedQty?: unknown; price?: unknown; avgPrice?: unknown; cumQuote?: unknown; reduceOnly?: unknown; positionSide?: unknown;
}

export interface BinanceUsdMOrderPort {
  getPublic<T>(path: string): Promise<T>;
  postSigned<T>(path: string, parameters: BinanceRequestParameters, credentials: BinanceCredentials, timestamp: number): Promise<T>;
  getSigned<T>(path: string, parameters: BinanceRequestParameters, credentials: BinanceCredentials, timestamp: number): Promise<T>;
  deleteSigned<T>(path: string, parameters: BinanceRequestParameters, credentials: BinanceCredentials, timestamp: number): Promise<T>;
}
interface BinanceCredentialsSource {getCredentials(): BinanceCredentials;}

export class DefaultBinanceUsdMOrderPort implements BinanceUsdMOrderPort {
  constructor(private readonly client: BinanceUsdMHttpClient = binanceUsdMHttpClient) {}
  getPublic<T>(path: string): Promise<T> { return this.request<T>("GET", path, undefined, {}); }
  postSigned<T>(path: string, parameters: BinanceRequestParameters, credentials: BinanceCredentials, timestamp: number): Promise<T> {
    return this.signed<T>("POST", path, parameters, credentials, timestamp);
  }
  getSigned<T>(path: string, parameters: BinanceRequestParameters, credentials: BinanceCredentials, timestamp: number): Promise<T> {
    return this.signed<T>("GET", path, parameters, credentials, timestamp);
  }
  deleteSigned<T>(path: string, parameters: BinanceRequestParameters, credentials: BinanceCredentials, timestamp: number): Promise<T> {
    return this.signed<T>("DELETE", path, parameters, credentials, timestamp);
  }
  private signed<T>(method: "GET" | "POST" | "DELETE", path: string, parameters: BinanceRequestParameters,
    credentials: BinanceCredentials, timestamp: number): Promise<T> {
    const signed = binanceSigner.createSignedTimestampRequest(parameters, credentials.apiSecret,
      {timestamp, recvWindow: 5_000});
    const headers = {"X-MBX-APIKEY": credentials.apiKey,
      ...(method === "POST" ? {"Content-Type": "application/x-www-form-urlencoded"} : {})};
    return method === "POST"
      ? this.request<T>(method, path, signed.signedQueryString, headers)
      : this.request<T>(method, `${path}?${signed.signedQueryString}`, undefined, headers);
  }
  private async request<T>(method: string, path: string, body: string | undefined,
    headers: Readonly<Record<string, string>>): Promise<T> {
    const [canonicalPath, queryString = ""] = path.split("?", 2);
    return this.client.request<T>(method as "GET" | "POST" | "DELETE", canonicalPath!, {
      queryString,
      body,
      headers,
      parameters: Object.fromEntries(new URLSearchParams(queryString).entries()),
    });
  }
}

export class BinanceUsdMOrderApi implements DerivativeOrderApi {
  readonly exchange = "binance";
  constructor(private readonly port: BinanceUsdMOrderPort = new DefaultBinanceUsdMOrderPort(),
    private readonly credentialsSource: BinanceCredentialsSource = binanceUsdMCredentialsProvider) {}

  async create(request: LiveExecutionRequest): Promise<DerivativeVenueOrder> {
    validateDerivativeRequest(request, this.exchange);
    const credentials = this.credentialsSource.getCredentials();
    const timestamp = await this.serverTime();
    const response = await this.port.postSigned<BinanceUsdMOrderResponse>("/fapi/v1/order",
      binanceParameters(request), credentials, timestamp);
    return normalizeBinanceOrder(response, request);
  }
  async get(orderId: string, market: string): Promise<DerivativeVenueOrder> {
    const credentials = this.credentialsSource.getCredentials(); const timestamp = await this.serverTime();
    const response = await this.port.getSigned<BinanceUsdMOrderResponse>("/fapi/v1/order",
      {symbol: normalizeMarket(market), orderId: requireOrderId(orderId)}, credentials, timestamp);
    return normalizeBinanceOrder(response);
  }
  async cancel(orderId: string, market: string): Promise<DerivativeVenueOrder> {
    const credentials = this.credentialsSource.getCredentials(); const timestamp = await this.serverTime();
    const response = await this.port.deleteSigned<BinanceUsdMOrderResponse>("/fapi/v1/order",
      {symbol: normalizeMarket(market), orderId: requireOrderId(orderId)}, credentials, timestamp);
    return normalizeBinanceOrder(response);
  }
  private async serverTime(): Promise<number> {
    const response = await this.port.getPublic<BinanceServerTimeResponse>("/fapi/v1/time");
    const timestamp = Number(response.serverTime);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("Binance USD-M server time is invalid.");
    return timestamp;
  }
}

export function binanceParameters(request: LiveExecutionRequest): BinanceRequestParameters {
  validateDerivativeRequest(request, "binance");
  const oneWay = request.positionMode === "ONE_WAY";
  return {symbol: normalizeMarket(request.market), side: request.side === "buy" ? "BUY" : "SELL",
    type: request.orderType === "market" ? "MARKET" : "LIMIT", quantity: request.quantity,
    positionSide: oneWay ? "BOTH" : request.positionSide as string,
    ...(oneWay && request.reduceOnly ? {reduceOnly: true} : {}),
    ...(request.orderType === "limit" ? {price: request.price as number, timeInForce: "GTC"} : {}),
    ...(request.clientOrderId ? {newClientOrderId: request.clientOrderId} : {}), newOrderRespType: "RESULT"};
}

function normalizeBinanceOrder(response: BinanceUsdMOrderResponse, fallback?: LiveExecutionRequest): DerivativeVenueOrder {
  const market = normalizeMarket(String(response.symbol ?? fallback?.market ?? ""));
  const orderId = requireOrderId(String(response.orderId ?? ""));
  const side = String(response.side ?? (fallback?.side === "buy" ? "BUY" : "SELL")).toUpperCase() === "BUY" ? "buy" as const : "sell" as const;
  const rawPositionSide = String(response.positionSide ?? (fallback?.positionMode === "ONE_WAY" ? "BOTH" : fallback?.positionSide ?? "")).toUpperCase();
  const positionMode = rawPositionSide === "BOTH" ? "ONE_WAY" as const : "HEDGE" as const;
  const positionSide = rawPositionSide === "LONG" ? "LONG" as const : rawPositionSide === "SHORT" ? "SHORT" as const
    : fallback?.positionSide ?? inferExposureSide(side, Boolean(response.reduceOnly ?? fallback?.reduceOnly));
  const wireReduceOnly = boolean(response.reduceOnly, fallback?.positionMode === "ONE_WAY" && fallback.reduceOnly === true);
  const reduceOnly = wireReduceOnly || (positionMode === "HEDGE" && ((positionSide === "LONG" && side === "sell") ||
    (positionSide === "SHORT" && side === "buy")));
  const requestedQuantity = positive(response.origQty, fallback?.quantity, "Binance USD-M origQty");
  const filledQuantity = nonNegative(response.executedQty, 0, "Binance USD-M executedQty");
  const requestedPriceNumber = Number(response.price ?? fallback?.price ?? 0);
  const average = Number(response.avgPrice);
  const cumulativeQuote = Number(response.cumQuote);
  const averageFillPrice = Number.isFinite(average) && average > 0 ? average
    : filledQuantity > 0 && Number.isFinite(cumulativeQuote) && cumulativeQuote >= 0 ? cumulativeQuote / filledQuantity : 0;
  return Object.freeze({exchange: "binance", market, side, orderId,
    clientOrderId: nullableString(response.clientOrderId ?? fallback?.clientOrderId), status: mapStatus(response.status),
    requestedQuantity, filledQuantity, remainingQuantity: Math.max(0, requestedQuantity - filledQuantity),
    requestedPrice: requestedPriceNumber > 0 ? requestedPriceNumber : null, averageFillPrice, feeAmount: 0,
    reduceOnly, positionMode, positionSide, rejectReason: mapStatus(response.status) === "REJECTED" ? "Binance USD-M order was rejected." : null});
}

function mapStatus(value: unknown): DerivativeVenueOrder["status"] {
  switch (String(value ?? "NEW").toUpperCase()) {
    case "NEW": case "PENDING_NEW": return "OPEN";
    case "PARTIALLY_FILLED": return "PARTIALLY_FILLED";
    case "FILLED": return "FILLED";
    case "CANCELED": case "EXPIRED": case "EXPIRED_IN_MATCH": return "CANCELLED";
    case "REJECTED": return "REJECTED";
    default: throw new Error(`Unsupported Binance USD-M order status: ${String(value)}`);
  }
}
function inferExposureSide(side: "buy" | "sell", reduceOnly: boolean): "LONG" | "SHORT" { return reduceOnly ? side === "buy" ? "SHORT" : "LONG" : side === "buy" ? "LONG" : "SHORT"; }
function normalizeMarket(value: string): string { const market = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, ""); if (!/^[A-Z0-9]{2,30}$/u.test(market)) throw new Error("Binance USD-M symbol is invalid."); return market; }
function requireOrderId(value: string): string { const id = value.trim(); if (!/^[0-9]{1,30}$/u.test(id)) throw new Error("Binance USD-M order ID is invalid."); return id; }
function positive(value: unknown, fallback: unknown, label: string): number { const parsed = Number(value ?? fallback); if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} is invalid.`); return parsed; }
function nonNegative(value: unknown, fallback: unknown, label: string): number { const parsed = Number(value ?? fallback); if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} is invalid.`); return parsed; }
function boolean(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function nullableString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

export const binanceUsdMOrderApi = new BinanceUsdMOrderApi();
