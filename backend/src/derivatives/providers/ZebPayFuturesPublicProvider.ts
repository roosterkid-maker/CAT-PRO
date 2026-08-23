import type {DerivativeVenuePublicSnapshot} from "../models/DerivativeMarketEvidence";
import type {DerivativePublicProvider} from "./DerivativePublicProvider";
import {DERIVATIVE_CANDIDATE_MARKETS, decimalStep, finite, isRecord, nextBoundary, nonNegative,
  objectLevels, positive, publicDerivativeEvidence, symbol, timestamp} from "./DerivativeProviderUtilities";

const BASE = "https://futuresbe.zebpay.com";

export class ZebPayFuturesPublicProvider implements DerivativePublicProvider {
  readonly exchange = "zebpay";
  constructor(private readonly request: typeof fetch = fetch,
    private readonly markets: readonly string[] = DERIVATIVE_CANDIDATE_MARKETS) {}

  async fetchSnapshot(now = Date.now()): Promise<DerivativeVenuePublicSnapshot> {
    const [rawMarkets, rawInfo] = await Promise.all([
      this.get("/api/v1/market/markets"), this.get("/api/v1/exchange/exchangeInfo"),
    ]);
    const metadata = [...records(rawMarkets), ...records(rawInfo)];
    const metaByMarket = new Map(metadata.map((item) => [marketOf(item), item]));
    const evidence = await Promise.all(this.markets.map(async (market) => {
      const [ticker, depth] = await Promise.all([
        this.get(`/api/v1/market/marketInfo?symbol=${encodeURIComponent(market)}`),
        this.get(`/api/v1/market/orderBook?symbol=${encodeURIComponent(market)}`),
      ]);
      return normalize(market, metaByMarket.get(market), unwrap(ticker), unwrap(depth), now);
    }));
    const markets = evidence.filter((item): item is NonNullable<typeof item> => item !== null);
    if (markets.length === 0) throw new Error("ZebPay futures returned no complete bounded market evidence.");
    return {exchange: this.exchange, generatedAt: now, markets};
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.request(`${BASE}${path}`, {signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error(`ZebPay futures ${path} failed with HTTP ${response.status}.`);
    return response.json();
  }
}

function normalize(market: string, metadata: Record<string, unknown> | undefined,
  ticker: Record<string, unknown> | null, depth: Record<string, unknown> | null, now: number) {
  if (!metadata || !ticker || !depth) return null;
  const base = market.endsWith("USDT") ? market.slice(0, -4) : "";
  const bids = objectLevels(depth.bids ?? depth.buy, true);
  const asks = objectLevels(depth.asks ?? depth.sell, false);
  const funding = finite(ticker.upcomingFundingRate ?? ticker.fundingRate ?? ticker.funding_rate);
  if (!base || bids.length === 0 || asks.length === 0 || funding === null) return null;
  const bid = bids[0]!; const ask = asks[0]!;
  const interval = positive(metadata.fundingIntervalMinutes ?? metadata.fundingInterval) ?? 480;
  const maker = percent(metadata.makerFee ?? metadata.maker_fee);
  const taker = percent(metadata.takerFee ?? metadata.taker_fee);
  return publicDerivativeEvidence({
    exchange: "zebpay", market, baseAsset: base, quoteAsset: "USDT", settleAsset: "USDT",
    bidPrice: bid.price, bidQuantity: bid.quantity, askPrice: ask.price, askQuantity: ask.quantity,
    markPrice: positive(ticker.marketPrice ?? ticker.markPrice) ?? 0,
    indexPrice: positive(ticker.indexPrice ?? ticker.lastPrice) ?? 0,
    fundingRate: funding, nextFundingTime: timestamp(ticker.nextFundingTime ?? ticker.next_funding_time) ?? nextBoundary(now, interval),
    fundingIntervalMinutes: interval, fundingEvidence: "EXCHANGE_REPORTED",
    openInterest: nonNegative(ticker.openInterest),
    priceStep: positive(metadata.priceStep ?? metadata.tickSize) ?? decimalStep(metadata.pricePrecision) ?? 0,
    quantityStep: positive(metadata.quantityStep ?? metadata.stepSize) ?? decimalStep(metadata.quantityPrecision) ?? 0,
    minimumQuantity: positive(metadata.minQuantity ?? metadata.minQty) ?? 0,
    maximumMarketQuantity: positive(metadata.maxQuantity ?? metadata.maxQty) ?? 0,
    minimumNotional: positive(metadata.minNotional ?? metadata.minimumNotional) ?? 0,
    maximumLeverage: positive(metadata.maxLeverage),
    ...(maker !== null && taker !== null ? {makerPercent: maker, takerPercent: taker} : {}),
    sourceTimestamp: timestamp(ticker.timestamp ?? depth.timestamp) ?? now, observedAt: now,
  });
}
function unwrap(value: unknown): Record<string, unknown> | null {
  if (isRecord(value) && isRecord(value.data)) return value.data;
  return isRecord(value) ? value : null;
}
function records(value: unknown): Record<string, unknown>[] {
  const data = isRecord(value) && "data" in value ? value.data : value;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.symbols)) return data.symbols.filter(isRecord);
  return Object.entries(data).flatMap(([key, item]) => isRecord(item) ? [{symbol: key, ...item}] : []);
}
function marketOf(value: Record<string, unknown>): string { return symbol(value.symbol ?? value.market ?? value.pair); }
function percent(value: unknown): number | null { const raw = finite(value); return raw !== null && raw >= 0 && raw <= 0.1 ? raw * 100 : null; }
