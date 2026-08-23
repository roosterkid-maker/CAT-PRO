import type {DerivativeVenuePublicSnapshot} from "../models/DerivativeMarketEvidence";
import type {DerivativePublicProvider} from "./DerivativePublicProvider";
import {DERIVATIVE_CANDIDATE_MARKETS, decimalStep, finite, isRecord, nextBoundary,
  nonNegative, objectLevels, positive, publicDerivativeEvidence, timestamp,
} from "./DerivativeProviderUtilities";

const DATA_BASE = "https://api.coindcx.com/exchange/v1/derivatives/futures/data";
const DEPTH_BASE = "https://public.coindcx.com/market_data/v3/orderbook";

export class CoinDCXFuturesPublicProvider implements DerivativePublicProvider {
  readonly exchange = "coindcx";

  constructor(private readonly request: typeof fetch = fetch,
    private readonly markets: readonly string[] = DERIVATIVE_CANDIDATE_MARKETS) {}

  async fetchSnapshot(now = Date.now()): Promise<DerivativeVenuePublicSnapshot> {
    const evidence = await Promise.all(this.markets.map((market) => this.fetchMarket(market, now)));
    const markets = evidence.filter((item): item is NonNullable<typeof item> => item !== null);
    if (markets.length === 0) throw new Error("CoinDCX futures returned no complete bounded market evidence.");
    return {exchange: this.exchange, generatedAt: now, markets};
  }

  private async fetchMarket(market: string, now: number) {
    const base = market.endsWith("USDT") ? market.slice(0, -4) : "";
    if (!base) return null;
    const pair = `B-${base}_USDT`;
    const [instrument, depth] = await Promise.all([
      this.get(`${DATA_BASE}/instrument?pair=${encodeURIComponent(pair)}&margin_currency_short_name=USDT`),
      this.get(`${DEPTH_BASE}/${encodeURIComponent(pair)}-futures/50`),
    ]);
    const metadata = unwrapRecord(instrument);
    const book = unwrapRecord(depth);
    if (!metadata || !book) return null;
    const bids = objectLevels(book.bids ?? book.buy, true);
    const asks = objectLevels(book.asks ?? book.sell, false);
    if (bids.length === 0 || asks.length === 0) return null;
    const bid = bids[0]!;
    const ask = asks[0]!;
    const midpoint = (bid.price + ask.price) / 2;
    const priceStep = positive(metadata.price_step ?? metadata.tick_size) ??
      decimalStep(metadata.price_precision);
    const quantityStep = positive(metadata.quantity_step ?? metadata.qty_step ?? metadata.step_size) ??
      decimalStep(metadata.quantity_precision);
    const maker = feePercent(metadata.maker_fee ?? metadata.maker_fee_rate);
    const taker = feePercent(metadata.taker_fee ?? metadata.taker_fee_rate);
    return publicDerivativeEvidence({
      exchange: this.exchange, market, baseAsset: base, quoteAsset: "USDT", settleAsset: "USDT",
      bidPrice: bid.price, bidQuantity: bid.quantity, askPrice: ask.price, askQuantity: ask.quantity,
      markPrice: positive(metadata.mark_price) ?? midpoint,
      indexPrice: positive(metadata.index_price) ?? midpoint,
      fundingRate: 0, nextFundingTime: nextBoundary(now, fundingMinutes(metadata)),
      fundingIntervalMinutes: fundingMinutes(metadata), fundingEvidence: "UNAVAILABLE",
      openInterest: nonNegative(metadata.open_interest), priceStep: priceStep ?? 0,
      quantityStep: quantityStep ?? 0,
      minimumQuantity: positive(metadata.min_quantity ?? metadata.minimum_quantity ?? metadata.min_order_quantity) ?? 0,
      maximumMarketQuantity: positive(metadata.max_quantity ?? metadata.maximum_quantity ?? metadata.max_order_quantity) ?? 0,
      minimumNotional: positive(metadata.min_notional ?? metadata.minimum_notional) ?? 0,
      maximumLeverage: positive(metadata.max_leverage),
      ...(maker !== null && taker !== null ? {makerPercent: maker, takerPercent: taker} : {}),
      sourceTimestamp: timestamp(book.timestamp ?? book.ts ?? metadata.timestamp) ?? now,
      observedAt: now,
    });
  }

  private async get(url: string): Promise<unknown> {
    const response = await this.request(url, {signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error(`CoinDCX futures public read failed with HTTP ${response.status}.`);
    return response.json();
  }
}

function unwrapRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value) && isRecord(value.data)) return value.data;
  if (isRecord(value)) return value;
  return null;
}
function fundingMinutes(value: Record<string, unknown>): number {
  const raw = positive(value.funding_frequency ?? value.funding_interval_minutes);
  if (raw === null) return 480;
  return raw <= 24 ? raw * 60 : raw;
}
function feePercent(value: unknown): number | null {
  const raw = finite(value);
  return raw !== null && raw >= 0 && raw <= 0.1 ? raw * 100 : null;
}
