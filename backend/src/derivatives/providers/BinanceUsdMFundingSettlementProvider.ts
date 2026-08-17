import type {
  DerivativeFundingSettlementEvidence,
} from "../models/DerivativeFundingSettlementEvidence";

import type {
  DerivativeFundingSettlementProvider,
  DerivativeFundingSettlementProviderResult,
} from "./DerivativeFundingSettlementProvider";

interface BinanceFundingRecord {
  symbol?: string;
  fundingRate?: string;
  fundingTime?: number;
  markPrice?: string;
  rateType?: string;
}

export type DerivativePublicJsonFetcher = <T>(url: string) => Promise<T>;

const BASE_URL = "https://fapi.binance.com";
const DEFAULT_MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const LOOKBACK_MS = 48 * 60 * 60 * 1_000;

export class BinanceUsdMFundingSettlementProvider
implements DerivativeFundingSettlementProvider {
  readonly exchange = "binance";
  private readonly markets: readonly string[];

  constructor(
    markets: readonly string[] = DEFAULT_MARKETS,
    private readonly fetcher: DerivativePublicJsonFetcher = fetchJson,
  ) {
    this.markets = normalizeMarkets(markets);
  }

  async fetchSettlements(now = Date.now()): Promise<DerivativeFundingSettlementProviderResult> {
    validateNow(now);
    const responses = await Promise.all(this.markets.map(async (market) => {
      const query = new URLSearchParams({
        symbol: market,
        startTime: String(now - LOOKBACK_MS),
        endTime: String(now),
        limit: "20",
      });
      const response = await this.fetcher<BinanceFundingRecord[]>(
        `${BASE_URL}/fapi/v1/fundingRate?${query.toString()}`,
      );
      if (!Array.isArray(response)) throw new Error(`Binance funding history is invalid for ${market}.`);
      return response.map((record) => normalizeRecord(record, market, now)).filter(isPresent);
    }));
    return freeze({exchange: this.exchange, generatedAt: now, evidence: responses.flat()
      .sort((first, second) => first.fundingTime - second.fundingTime || first.market.localeCompare(second.market))});
  }
}

function normalizeRecord(record: BinanceFundingRecord, requestedMarket: string, observedAt: number): DerivativeFundingSettlementEvidence | null {
  const market = symbol(record.symbol);
  const fundingTime = Number(record.fundingTime);
  const fundingRate = Number(record.fundingRate);
  const markPrice = Number(record.markPrice);
  if (market !== requestedMarket || !Number.isSafeInteger(fundingTime) || fundingTime <= 0 || fundingTime > observedAt ||
      !Number.isFinite(fundingRate) || Math.abs(fundingRate) > 1 || !Number.isFinite(markPrice) || markPrice <= 0 ||
      (record.rateType !== undefined && record.rateType !== "Regular")) return null;
  return freeze({version: "56.0", id: `funding-settlement:binance:${market}:${fundingTime}`, exchange: "binance", market,
    settlementAsset: "USDT", fundingTime, fundingRate, markPrice, rateSource: "PUBLIC_SETTLED_FUNDING_RATE_HISTORY",
    priceSource: "FUNDING_HISTORY_ASSOCIATED_MARK_PRICE", priceQuality: "EXACT_EXCHANGE_ASSOCIATED_MARK_PRICE", observedAt,
    paymentFormula: "NEGATIVE_SIGNED_QUANTITY_X_MARK_PRICE_X_FUNDING_RATE", accountTransactionEvidenceUsed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false});
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {signal: AbortSignal.timeout(12_000)});
  if (!response.ok) throw new Error(`Binance public funding request failed with HTTP ${response.status}.`);
  return await response.json() as T;
}
function normalizeMarkets(markets: readonly string[]): readonly string[] {
  const normalized = [...new Set(markets.map(symbol).filter(Boolean))];
  if (normalized.length === 0 || normalized.length > 10) throw new Error("Binance funding evidence requires 1-10 bounded markets.");
  return normalized;
}
function symbol(value: unknown): string { return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : ""; }
function validateNow(now: number): void { if (!Number.isSafeInteger(now) || now <= LOOKBACK_MS) throw new Error("Funding evidence timestamp is invalid."); }
function isPresent<T>(value: T | null): value is T { return value !== null; }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
