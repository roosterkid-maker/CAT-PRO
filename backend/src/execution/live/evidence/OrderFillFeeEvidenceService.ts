import {createHash} from "node:crypto";
import {binanceUsdMCredentialsProvider} from "../../../derivatives/providers/BinanceUsdMCredentialsProvider";
import {binanceHttpClient} from "../../../exchanges/binance/api/BinanceHttpClient";
import type {BinanceCredentials} from "../../../exchanges/binance/api/BinanceCredentialsProvider";
import {binanceCredentialsProvider} from "../../../exchanges/binance/api/BinanceCredentialsProvider";
import type {BinanceRequestParameters} from "../../../exchanges/binance/api/BinanceSigner";
import {bybitCredentialsProvider, type BybitCredentials} from "../../../exchanges/bybit/api/BybitCredentialsProvider";
import {bybitPrivateHttpClient} from "../../../exchanges/bybit/api/BybitPrivateHttpClient";
import {DefaultBinanceUsdMOrderPort, type BinanceUsdMOrderPort} from "../derivatives/BinanceUsdMOrderApi";

const EPSILON = 1e-10;

export interface VenueOrderFill {
  readonly executionId: string;
  readonly orderId: string;
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly price: number;
  readonly quantity: number;
  readonly quoteQuantity: number;
  readonly feeAsset: string;
  readonly feeAmount: number;
  readonly maker: boolean;
  readonly executedAt: number;
  readonly additionalFeeMetadataPresent: boolean;
}

export interface OrderFillFeeEvidence {
  readonly version: "75.0";
  readonly id: string;
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly orderId: string;
  readonly generatedAt: number;
  readonly expectedFilledQuantity: number;
  readonly observedFilledQuantity: number;
  readonly observedQuoteQuantity: number;
  readonly averageFillPrice: number;
  readonly fills: readonly VenueOrderFill[];
  readonly fees: readonly {readonly asset: string; readonly amount: number}[];
  readonly complete: boolean;
  readonly blockers: readonly string[];
  readonly source: "BINANCE_ACCOUNT_TRADES" | "BINANCE_USDM_ACCOUNT_TRADES" | "BYBIT_EXECUTION_HISTORY";
}

export interface OrderFillFeeInspectionRequest {
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly orderId: string;
  readonly expectedFilledQuantity: number;
}

export interface OrderFillFeeSource {
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly source: OrderFillFeeEvidence["source"];
  getFills(market: string, orderId: string): Promise<readonly VenueOrderFill[]>;
}

export class OrderFillFeeEvidenceService {
  private readonly sources = new Map<string, OrderFillFeeSource>();
  constructor(sources: readonly OrderFillFeeSource[] = defaultSources()) {
    for (const source of sources) {
      const key = sourceKey(source.exchange, source.product);
      if (this.sources.has(key)) throw new Error(`Duplicate order fill-fee source: ${key}`);
      this.sources.set(key, source);
    }
  }

  async inspect(request: OrderFillFeeInspectionRequest, now = Date.now()): Promise<OrderFillFeeEvidence> {
    const exchange = normalizeExchange(request.exchange); const market = normalizeMarket(request.market);
    const orderId = requireId(request.orderId, "order");
    if (!Number.isSafeInteger(now) || now <= 0 || !nonNegative(request.expectedFilledQuantity)) {
      throw new Error("Order fill-fee inspection input is invalid.");
    }
    const source = this.sources.get(sourceKey(exchange, request.product));
    if (!source) throw new Error(`Authoritative fill-fee source is not registered: ${exchange}:${request.product}`);
    const fills = (await source.getFills(market, orderId)).map((item) => validateFill(item, exchange, request.product, market, orderId, now));
    const executionIds = new Set<string>(); const blockers: string[] = [];
    for (const fill of fills) {
      if (executionIds.has(fill.executionId)) blockers.push(`DUPLICATE_EXECUTION_ID:${fill.executionId}`);
      executionIds.add(fill.executionId);
      if (fill.additionalFeeMetadataPresent) blockers.push(`ADDITIONAL_FEE_RECONCILIATION_REQUIRED:${fill.executionId}`);
    }
    const observedFilledQuantity = normalize(fills.reduce((sum, item) => sum + item.quantity, 0));
    const observedQuoteQuantity = normalize(fills.reduce((sum, item) => sum + item.quoteQuantity, 0));
    if (Math.abs(observedFilledQuantity - request.expectedFilledQuantity) > EPSILON) blockers.push("FILL_QUANTITY_DOES_NOT_RECONCILE_WITH_ORDER_STATUS");
    const feeTotals = new Map<string, number>();
    for (const fill of fills) feeTotals.set(fill.feeAsset, normalize((feeTotals.get(fill.feeAsset) ?? 0) + fill.feeAmount));
    const fees = [...feeTotals.entries()].sort(([first], [second]) => first.localeCompare(second))
      .map(([asset, amount]) => freeze({asset, amount}));
    const averageFillPrice = observedFilledQuantity > EPSILON ? normalize(observedQuoteQuantity / observedFilledQuantity) : 0;
    const uniqueBlockers = [...new Set(blockers)];
    const identity = JSON.stringify({exchange, product: request.product, market, orderId, expected: request.expectedFilledQuantity,
      fills: fills.map((item) => [item.executionId, item.quantity, item.quoteQuantity, item.feeAsset, item.feeAmount]), blockers: uniqueBlockers});
    return freeze({version: "75.0", id: `order-fill-fee:${createHash("sha256").update(identity).digest("hex")}`,
      exchange, product: request.product, market, orderId, generatedAt: now,
      expectedFilledQuantity: request.expectedFilledQuantity, observedFilledQuantity, observedQuoteQuantity,
      averageFillPrice, fills, fees, complete: uniqueBlockers.length === 0, blockers: uniqueBlockers, source: source.source});
  }

  getDiagnostics() {
    const sources = [...this.sources.values()].map((item) => ({exchange: item.exchange, product: item.product, source: item.source}));
    return freeze({version: "75.0" as const, registeredSources: sources.length, sources,
      safety: {actualExecutionRecordsRequired: true, exactOrderReconciliationRequired: true,
        multiAssetFeesPreserved: true, additionalFeeMetadataFailsClosed: true, zeroFeeAssumptionAllowed: false}});
  }
}

export interface BinanceSignedReadPort {
  synchronizeServerTime(): Promise<number>;
  getSigned<T>(path: string, parameters?: BinanceRequestParameters, credentials?: BinanceCredentials): Promise<T>;
}
export class BinanceSpotOrderFillFeeSource implements OrderFillFeeSource {
  readonly exchange = "binance"; readonly product = "SPOT" as const; readonly source = "BINANCE_ACCOUNT_TRADES" as const;
  constructor(private readonly port: BinanceSignedReadPort = binanceHttpClient,
    private readonly credentials: {getCredentials(): BinanceCredentials} = binanceCredentialsProvider) {}
  async getFills(market: string, orderId: string): Promise<readonly VenueOrderFill[]> {
    await this.port.synchronizeServerTime();
    const response = await this.port.getSigned<unknown>("/api/v3/myTrades", {symbol: market, orderId}, this.credentials.getCredentials());
    if (!Array.isArray(response)) throw new Error("Binance spot account-trade response must be an array.");
    return response.map((value) => binanceFill(value, this.product, market, orderId));
  }
}

interface BinanceServerTime {serverTime?: unknown;}
export class BinanceUsdMOrderFillFeeSource implements OrderFillFeeSource {
  readonly exchange = "binance"; readonly product = "PERPETUAL" as const;
  readonly source = "BINANCE_USDM_ACCOUNT_TRADES" as const;
  constructor(private readonly port: BinanceUsdMOrderPort = new DefaultBinanceUsdMOrderPort(),
    private readonly credentials: {getCredentials(): BinanceCredentials} = binanceUsdMCredentialsProvider) {}
  async getFills(market: string, orderId: string): Promise<readonly VenueOrderFill[]> {
    const time = await this.port.getPublic<BinanceServerTime>("/fapi/v1/time"); const timestamp = Number(time.serverTime);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("Binance USD-M server time is invalid.");
    const response = await this.port.getSigned<unknown>("/fapi/v1/userTrades", {symbol: market, orderId},
      this.credentials.getCredentials(), timestamp);
    if (!Array.isArray(response)) throw new Error("Binance USD-M account-trade response must be an array.");
    return response.map((value) => binanceFill(value, this.product, market, orderId));
  }
}

interface BybitExecutionResult {list?: unknown;}
interface BybitExecutionRecord {execId?: unknown; orderId?: unknown; symbol?: unknown; execPrice?: unknown; execQty?: unknown;
  execValue?: unknown; execFee?: unknown; feeCurrency?: unknown; isMaker?: unknown; execTime?: unknown; extraFees?: unknown; execType?: unknown;}
export interface BybitSignedReadPort {getSigned<T>(path: string, parameters: Record<string, string>, credentials?: BybitCredentials): Promise<T>;}
export class BybitOrderFillFeeSource implements OrderFillFeeSource {
  readonly exchange = "bybit"; readonly source = "BYBIT_EXECUTION_HISTORY" as const;
  constructor(readonly product: "SPOT" | "PERPETUAL", private readonly port: BybitSignedReadPort = bybitPrivateHttpClient,
    private readonly credentials: {getCredentials(): BybitCredentials} = bybitCredentialsProvider) {}
  async getFills(market: string, orderId: string): Promise<readonly VenueOrderFill[]> {
    const response = await this.port.getSigned<BybitExecutionResult>("/v5/execution/list",
      {category: this.product === "SPOT" ? "spot" : "linear", symbol: market, orderId, limit: "100"},
      this.credentials.getCredentials());
    if (!Array.isArray(response.list)) throw new Error("Bybit execution-history list is missing.");
    return response.list.map((value) => this.normalize(value, market, orderId));
  }
  private normalize(value: unknown, market: string, orderId: string): VenueOrderFill {
    if (!isRecord(value)) throw new Error("Bybit execution-history record is invalid.");
    const item = value as BybitExecutionRecord;
    if (String(item.execType ?? "Trade").toUpperCase() !== "TRADE") throw new Error("Bybit order fill evidence must be execution type Trade.");
    const exactOrderId = requireId(item.orderId, "Bybit order"); if (exactOrderId !== orderId) throw new Error("Bybit execution order ID mismatched.");
    const exactMarket = normalizeMarket(String(item.symbol)); if (exactMarket !== market) throw new Error("Bybit execution market mismatched.");
    const quantity = positive(item.execQty, "Bybit execution quantity"); const price = positive(item.execPrice, "Bybit execution price");
    const quote = positive(item.execValue, "Bybit execution value");
    return freeze({executionId: requireId(item.execId, "Bybit execution"), orderId, exchange: this.exchange,
      product: this.product, market, price, quantity, quoteQuantity: quote,
      feeAsset: asset(item.feeCurrency), feeAmount: nonNegativeNumber(item.execFee, "Bybit execution fee"),
      maker: item.isMaker === true, executedAt: positiveInteger(item.execTime, "Bybit execution time"),
      additionalFeeMetadataPresent: hasAdditionalFees(item.extraFees)});
  }
}

function binanceFill(value: unknown, product: "SPOT" | "PERPETUAL", market: string, orderId: string): VenueOrderFill {
  if (!isRecord(value)) throw new Error("Binance account-trade record is invalid.");
  const exactOrderId = requireId(value.orderId, "Binance order"); if (exactOrderId !== orderId) throw new Error("Binance account-trade order ID mismatched.");
  const quantity = positive(value.qty, "Binance trade quantity"); const price = positive(value.price, "Binance trade price");
  const quoteQuantity = positive(value.quoteQty, "Binance trade quote quantity");
  return freeze({executionId: requireId(value.id, "Binance execution"), orderId, exchange: "binance", product,
    market, price, quantity, quoteQuantity, feeAsset: asset(value.commissionAsset),
    feeAmount: nonNegativeNumber(value.commission, "Binance trade commission"), maker: value.isMaker === true || value.maker === true,
    executedAt: positiveInteger(value.time, "Binance trade time"), additionalFeeMetadataPresent: false});
}
function defaultSources(): OrderFillFeeSource[] { return [new BinanceSpotOrderFillFeeSource(), new BinanceUsdMOrderFillFeeSource(),
  new BybitOrderFillFeeSource("SPOT"), new BybitOrderFillFeeSource("PERPETUAL")]; }
function validateFill(fill: VenueOrderFill, exchange: string, product: "SPOT" | "PERPETUAL", market: string,
  orderId: string, now: number): VenueOrderFill {
  if (normalizeExchange(fill.exchange) !== exchange || fill.product !== product || normalizeMarket(fill.market) !== market ||
    requireId(fill.orderId, "order") !== orderId || !requireId(fill.executionId, "execution") || !positive(fill.price, "fill price") ||
    !positive(fill.quantity, "fill quantity") || !positive(fill.quoteQuantity, "fill quote quantity") || !asset(fill.feeAsset) ||
    !nonNegative(fill.feeAmount) || !Number.isSafeInteger(fill.executedAt) || fill.executedAt <= 0 || fill.executedAt > now) {
    throw new Error("Order fill-fee evidence record is invalid or mismatched.");
  }
  return freeze({...fill, exchange, product, market, orderId, feeAsset: asset(fill.feeAsset)});
}
function sourceKey(exchange: string, product: string): string { return `${normalizeExchange(exchange)}:${product}`; }
function normalizeExchange(value: string): string { const normalized = value.trim().toLowerCase(); if (!/^[a-z0-9_-]{2,30}$/u.test(normalized)) throw new Error("Fill-fee exchange is invalid."); return normalized; }
function normalizeMarket(value: string): string { const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, ""); if (!/^[A-Z0-9]{2,30}$/u.test(normalized)) throw new Error("Fill-fee market is invalid."); return normalized; }
function requireId(value: unknown, label: string): string { const id = typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; if (!/^[A-Za-z0-9_.:/-]{1,100}$/u.test(id)) throw new Error(`${label} ID is invalid.`); return id; }
function asset(value: unknown): string { const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""; if (!/^[A-Z0-9]{2,12}$/u.test(normalized)) throw new Error("Fill fee asset is invalid."); return normalized; }
function positive(value: unknown, label: string): number { const result = Number(value); if (!Number.isFinite(result) || result <= 0) throw new Error(`${label} must be positive.`); return result; }
function nonNegativeNumber(value: unknown, label: string): number { const result = Number(value); if (!Number.isFinite(result) || result < 0) throw new Error(`${label} must be non-negative.`); return result; }
function positiveInteger(value: unknown, label: string): number { const result = Number(value); if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} must be a positive integer.`); return result; }
function nonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function hasAdditionalFees(value: unknown): boolean { if (Array.isArray(value)) return value.length > 0; if (typeof value === "string") return value.trim() !== "" && value.trim() !== "[]" && value.trim() !== "{}"; return value !== null && value !== undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function normalize(value: number): number { return Math.abs(value) <= EPSILON ? 0 : Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const orderFillFeeEvidenceService = new OrderFillFeeEvidenceService();
