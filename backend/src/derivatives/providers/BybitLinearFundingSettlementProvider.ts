import type {
  DerivativeFundingSettlementEvidence,
} from "../models/DerivativeFundingSettlementEvidence";

import type {
  DerivativeFundingSettlementProvider,
  DerivativeFundingSettlementProviderResult,
} from "./DerivativeFundingSettlementProvider";

import type {
  DerivativePublicJsonFetcher,
} from "./BinanceUsdMFundingSettlementProvider";

interface BybitFundingRecord { symbol?: string; fundingRate?: string; fundingRateTimestamp?: string; }
interface BybitResponse<T> { retCode?: number; retMsg?: string; time?: number; result?: {symbol?: string; list?: T[]}; }

const BASE_URL = "https://api.bybit.com";
const DEFAULT_MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const LOOKBACK_MS = 48 * 60 * 60 * 1_000;
const MAX_MARK_CACHE = 100;

export class BybitLinearFundingSettlementProvider
implements DerivativeFundingSettlementProvider {
  readonly exchange = "bybit";
  private readonly markets: readonly string[];
  private readonly markPriceCache = new Map<string, number>();

  constructor(
    markets: readonly string[] = DEFAULT_MARKETS,
    private readonly fetcher: DerivativePublicJsonFetcher = fetchJson,
  ) {
    this.markets = normalizeMarkets(markets);
  }

  async fetchSettlements(now = Date.now()): Promise<DerivativeFundingSettlementProviderResult> {
    validateNow(now);
    const responses = await Promise.all(this.markets.map((market) => this.fetchMarket(market, now)));
    trimCache(this.markPriceCache);
    return freeze({exchange: this.exchange, generatedAt: now, evidence: responses.flat()
      .sort((first, second) => first.fundingTime - second.fundingTime || first.market.localeCompare(second.market))});
  }

  private async fetchMarket(market: string, now: number): Promise<DerivativeFundingSettlementEvidence[]> {
    const query = new URLSearchParams({category: "linear", symbol: market, startTime: String(now - LOOKBACK_MS), endTime: String(now), limit: "20"});
    const response = await this.fetcher<BybitResponse<BybitFundingRecord>>(`${BASE_URL}/v5/market/funding/history?${query.toString()}`);
    if (response.retCode !== 0 || !Array.isArray(response.result?.list)) {
      throw new Error(`Bybit funding history failed for ${market}: ${response.retMsg ?? "invalid response"}.`);
    }
    const normalized = response.result.list.map((record) => normalizeFundingRecord(record, market, now)).filter(isPresent);
    const evidence = await Promise.all(normalized.map(async (record) => {
      const markPrice = await this.getMarkPrice(market, record.fundingTime);
      if (markPrice === null) return null;
      return freeze({version: "56.0", id: `funding-settlement:bybit:${market}:${record.fundingTime}`, exchange: "bybit", market,
        settlementAsset: "USDT", fundingTime: record.fundingTime, fundingRate: record.fundingRate, markPrice,
        rateSource: "PUBLIC_SETTLED_FUNDING_RATE_HISTORY", priceSource: "ONE_MINUTE_MARK_PRICE_KLINE_OPEN",
        priceQuality: "BOUNDED_PUBLIC_MARK_KLINE_PROXY", observedAt: now,
        paymentFormula: "NEGATIVE_SIGNED_QUANTITY_X_MARK_PRICE_X_FUNDING_RATE", accountTransactionEvidenceUsed: false,
        liveExecutionAllowed: false, orderSubmissionAllowed: false} satisfies DerivativeFundingSettlementEvidence);
    }));
    return evidence.filter(isPresent);
  }

  private async getMarkPrice(market: string, fundingTime: number): Promise<number | null> {
    const key = `${market}:${fundingTime}`;
    const cached = this.markPriceCache.get(key);
    if (cached !== undefined) return cached;
    const query = new URLSearchParams({category: "linear", symbol: market, interval: "1", start: String(fundingTime),
      end: String(fundingTime + 59_999), limit: "1"});
    const response = await this.fetcher<BybitResponse<readonly string[]>>(`${BASE_URL}/v5/market/mark-price-kline?${query.toString()}`);
    if (response.retCode !== 0 || !Array.isArray(response.result?.list)) return null;
    const row = response.result.list[0];
    const rowTime = Number(row?.[0]);
    const openPrice = Number(row?.[1]);
    if (rowTime !== fundingTime || !Number.isFinite(openPrice) || openPrice <= 0) return null;
    this.markPriceCache.set(key, openPrice);
    return openPrice;
  }
}

function normalizeFundingRecord(record: BybitFundingRecord, requestedMarket: string, now: number): {fundingTime: number; fundingRate: number} | null {
  const market = symbol(record.symbol); const fundingTime = Number(record.fundingRateTimestamp); const fundingRate = Number(record.fundingRate);
  if (market !== requestedMarket || !Number.isSafeInteger(fundingTime) || fundingTime <= 0 || fundingTime > now ||
      !Number.isFinite(fundingRate) || Math.abs(fundingRate) > 1) return null;
  return {fundingTime, fundingRate};
}
async function fetchJson<T>(url: string): Promise<T> { const response = await fetch(url, {signal: AbortSignal.timeout(12_000)});
  if (!response.ok) throw new Error(`Bybit public funding request failed with HTTP ${response.status}.`); return await response.json() as T; }
function normalizeMarkets(markets: readonly string[]): readonly string[] { const normalized = [...new Set(markets.map(symbol).filter(Boolean))];
  if (normalized.length === 0 || normalized.length > 10) throw new Error("Bybit funding evidence requires 1-10 bounded markets."); return normalized; }
function symbol(value: unknown): string { return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : ""; }
function validateNow(now: number): void { if (!Number.isSafeInteger(now) || now <= LOOKBACK_MS) throw new Error("Funding evidence timestamp is invalid."); }
function trimCache(cache: Map<string, number>): void { while (cache.size > MAX_MARK_CACHE) cache.delete(cache.keys().next().value as string); }
function isPresent<T>(value: T | null): value is T { return value !== null; }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
