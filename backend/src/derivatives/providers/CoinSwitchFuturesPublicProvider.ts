import type {DerivativeVenuePublicSnapshot} from "../models/DerivativeMarketEvidence";
import {CoinSwitchReadOnlyHttpClient} from "../../exchanges/coinswitch/api/CoinSwitchReadOnlyHttpClient";
import type {DerivativePublicProvider} from "./DerivativePublicProvider";
import {DERIVATIVE_CANDIDATE_MARKETS, decimalStep, finite, isRecord, nextBoundary, nonNegative,
  positive, publicDerivativeEvidence, symbol, timestamp} from "./DerivativeProviderUtilities";

export class CoinSwitchFuturesPublicProvider implements DerivativePublicProvider {
  readonly exchange = "coinswitch";
  constructor(private readonly client = new CoinSwitchReadOnlyHttpClient(),
    private readonly markets: readonly string[] = DERIVATIVE_CANDIDATE_MARKETS) {}

  async fetchSnapshot(now = Date.now()): Promise<DerivativeVenuePublicSnapshot> {
    const [rawInstruments, rawTickers] = await Promise.all([
      this.client.getSigned<unknown>("/trade/api/v2/futures/instrument_info", {exchange: "EXCHANGE_2"}),
      this.client.getSigned<unknown>("/trade/api/v2/futures/all-pairs/ticker", {exchange: "EXCHANGE_2"}),
    ]);
    const instruments = records(rawInstruments);
    const tickers = records(rawTickers);
    const instrumentByMarket = new Map(instruments.map((item) => [marketOf(item), item]));
    const tickerByMarket = new Map(tickers.map((item) => [marketOf(item), item]));
    const markets = this.markets.map((market) => normalize(
      market, instrumentByMarket.get(market), tickerByMarket.get(market), now,
    )).filter((item): item is NonNullable<typeof item> => item !== null);
    if (markets.length === 0) throw new Error("CoinSwitch futures returned no complete bounded market evidence.");
    return {exchange: this.exchange, generatedAt: now, markets};
  }
}

function normalize(market: string, instrument: Record<string, unknown> | undefined,
  ticker: Record<string, unknown> | undefined, now: number) {
  if (!instrument || !ticker) return null;
  const base = market.endsWith("USDT") ? market.slice(0, -4) : "";
  const bid = positive(ticker.best_bid_price ?? ticker.bid_price ?? ticker.bidPrice);
  const ask = positive(ticker.best_ask_price ?? ticker.ask_price ?? ticker.askPrice);
  const funding = finite(ticker.funding_rate ?? ticker.fundingRate);
  const maker = percent(instrument.maker_fee ?? instrument.makerFee);
  const taker = percent(instrument.taker_fee ?? instrument.takerFee);
  if (!base || bid === null || ask === null || funding === null) return null;
  const interval = positive(instrument.funding_interval_minutes ?? instrument.funding_interval) ?? 480;
  return publicDerivativeEvidence({
    exchange: "coinswitch", market, baseAsset: base, quoteAsset: "USDT", settleAsset: "USDT",
    bidPrice: bid, bidQuantity: positive(ticker.best_bid_quantity ?? ticker.bid_quantity ?? ticker.bidQty) ?? 0,
    askPrice: ask, askQuantity: positive(ticker.best_ask_quantity ?? ticker.ask_quantity ?? ticker.askQty) ?? 0,
    markPrice: positive(ticker.mark_price ?? ticker.markPrice) ?? 0,
    indexPrice: positive(ticker.index_price ?? ticker.indexPrice) ?? 0,
    fundingRate: funding, nextFundingTime: timestamp(ticker.next_funding_timestamp ?? ticker.nextFundingTime) ?? nextBoundary(now, interval),
    fundingIntervalMinutes: interval, fundingEvidence: "EXCHANGE_REPORTED",
    openInterest: nonNegative(ticker.open_interest ?? ticker.openInterest),
    priceStep: positive(instrument.price_step ?? instrument.tick_size) ?? decimalStep(instrument.price_precision) ?? 0,
    quantityStep: positive(instrument.quantity_step ?? instrument.qty_step) ?? decimalStep(instrument.quantity_precision) ?? 0,
    minimumQuantity: positive(instrument.min_order_quantity ?? instrument.minimum_quantity) ?? 0,
    maximumMarketQuantity: positive(instrument.max_order_quantity ?? instrument.maximum_quantity) ?? 0,
    minimumNotional: positive(instrument.min_notional ?? instrument.minimum_notional) ?? 0,
    maximumLeverage: positive(instrument.max_leverage),
    ...(maker !== null && taker !== null ? {makerPercent: maker, takerPercent: taker} : {}),
    sourceTimestamp: timestamp(ticker.timestamp ?? ticker.ts) ?? now, observedAt: now,
  });
}
function records(value: unknown): Record<string, unknown>[] {
  const data = isRecord(value) && "data" in value ? value.data : value;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  return Object.entries(data).flatMap(([key, item]) => isRecord(item) ? [{symbol: key, ...item}] : []);
}
function marketOf(value: Record<string, unknown>): string {
  return symbol(value.symbol ?? value.market ?? value.pair).replace(/^EXCHANGE2/, "");
}
function percent(value: unknown): number | null {
  const raw = finite(value); return raw !== null && raw >= 0 && raw <= 0.1 ? raw * 100 : null;
}
