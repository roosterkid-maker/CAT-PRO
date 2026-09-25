import {
  marketCache,
} from "../../services/cache.service";

import {
  getExchangeTakerFeePercent,
} from "../../arbitrage/config/fees";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  getInExchangeMakerShadow,
  InExchangeMakerShadowService,
  registerInExchangeMakerShadow,
  type MarketDetail,
  type PublicTrade,
  type TopOfBook,
} from "./InExchangeMakerShadowService";

/*
 * Live, read-only inputs for the in-exchange maker shadows:
 *   CoinDCX  maker on its INR book, hedge on its own USDT book
 *   UnoCoin  maker on its INR book, hedge on Binance/Bybit (UnoCoin's USDT
 *            books are too thin to hedge on)
 */
const COINDCX_MARKET_DETAILS_URL = "https://api.coindcx.com/exchange/v1/markets_details";
const COINDCX_TRADE_HISTORY_URL = "https://public.coindcx.com/market_data/trade_history";
const COINDCX_TICKER_URL = "https://api.coindcx.com/exchange/ticker";
const UNOCOIN_TICKERS_URL = "https://api.unocoin.com/api/v1/exchange/tickers";
const UNOCOIN_BOOK_URL = "https://api.unocoin.com/api/v1/asset/orderbook";
const UNOCOIN_TRADES_URL = "https://api.unocoin.com/api/v1/exchange/historical_trades";

const QUOTE_MAX_AGE_MS = 60_000;
const HEDGE_MAX_AGE_MS = 10_000;
const UNOCOIN_BOOK_MAX_AGE_MS = 30_000;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {signal: AbortSignal.timeout(8_000)});
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

function top(quote: ExecutableQuote | undefined, maxAgeMs: number, now = Date.now()): TopOfBook | null {
  if (!quote || quote.bestBidPrice === null || quote.bestAskPrice === null) return null;
  if (!(quote.bestBidPrice > 0) || !(quote.bestAskPrice > quote.bestBidPrice) || now - quote.timestamp > maxAgeMs) return null;
  return {bid: quote.bestBidPrice, ask: quote.bestAskPrice};
}

const canonical = (market: string) => market.toUpperCase().replace(/[^A-Z0-9]/gu, "");

/* -------------------------------------------------------------- CoinDCX */

async function coinDcxMarketDetails(): Promise<ReadonlyMap<string, MarketDetail>> {
  const rows = await fetchJson(COINDCX_MARKET_DETAILS_URL);
  if (!Array.isArray(rows)) throw new Error("CoinDCX market details are not an array.");
  const details = new Map<string, MarketDetail>();
  for (const row of rows as Record<string, unknown>[]) {
    const symbol = typeof row.symbol === "string" ? row.symbol.toUpperCase() : "";
    const pair = typeof row.pair === "string" ? row.pair : "";
    // base_currency_precision is the price's decimals (ALEXINR: 5, quoted
    // 0.44125); "step" is not the price tick.
    const precision = Number(row.base_currency_precision);
    const tick = Number.isInteger(precision) && precision >= 0 && precision <= 12 ? Number(`1e-${precision}`) : Number(row.step);
    if (!symbol || !pair || !(tick > 0)) continue;
    details.set(symbol, {pair, tick, minimumNotional: Number(row.min_notional) || 0, active: row.status === "active"});
  }
  return details;
}

async function coinDcxTrades(coin: string, detail: MarketDetail | undefined): Promise<readonly PublicTrade[]> {
  const pair = detail?.pair ?? `I-${coin}_INR`;
  const rows = await fetchJson(`${COINDCX_TRADE_HISTORY_URL}?pair=${encodeURIComponent(pair)}&limit=50`);
  if (!Array.isArray(rows)) return [];
  return (rows as Record<string, unknown>[])
    .map((row) => ({price: Number(row.p), quantity: Number(row.q), at: Number(row.T), buyerMaker: row.m === true}))
    .filter((trade) => trade.price > 0 && trade.quantity > 0 && Number.isFinite(trade.at));
}

async function coinDcxVolumes(): Promise<ReadonlyMap<string, number>> {
  const rows = await fetchJson(COINDCX_TICKER_URL);
  if (!Array.isArray(rows)) throw new Error("CoinDCX ticker is not an array.");
  const volumes = new Map<string, number>();
  for (const row of rows as Record<string, unknown>[]) {
    const market = typeof row.market === "string" ? canonical(row.market) : "";
    const volume = Number(row.volume);
    if (market && Number.isFinite(volume) && volume >= 0) volumes.set(market, volume);
  }
  return volumes;
}

function startCoinDcx(): InExchangeMakerShadowService {
  const existing = getInExchangeMakerShadow("coindcx");
  if (existing) return existing;
  const service = new InExchangeMakerShadowService({
    listInrMarkets: () => marketCache.getByExchange("coindcx").map((quote) => canonical(quote.market)).filter((market) => market.endsWith("INR")),
    getInrBook: (market) => top(marketCache.get("coindcx", market), QUOTE_MAX_AGE_MS),
    getHedgeBook: (coin) => {
      const book = top(marketCache.get("coindcx", `${coin}USDT`), QUOTE_MAX_AGE_MS);
      return book ? {...book, venue: "coindcx"} : null;
    },
    getConversion: () => top(marketCache.get("coindcx", "USDTINR"), QUOTE_MAX_AGE_MS),
    inrFeePercent: () => getExchangeTakerFeePercent("coindcx", "XINR") ?? 0.59,
    hedgeFeePercent: () => getExchangeTakerFeePercent("coindcx", "XUSDT") ?? 0.2,
    fetchMarketDetails: coinDcxMarketDetails,
    fetchTrades: coinDcxTrades,
    fetchVolumes: coinDcxVolumes,
    now: Date.now,
  }, {venue: "coindcx"});
  registerInExchangeMakerShadow("coindcx", service);
  service.start();
  return service;
}

/* -------------------------------------------------------------- UnoCoin */

const unoCoinBooks = new Map<string, TopOfBook & {at: number}>();
let unoCoinInrMarkets: string[] = [];

async function unoCoinVolumes(): Promise<ReadonlyMap<string, number>> {
  const rows = await fetchJson(UNOCOIN_TICKERS_URL);
  const list = Array.isArray(rows) ? rows : [];
  const volumes = new Map<string, number>();
  const markets: string[] = [];
  for (const row of list as Record<string, unknown>[]) {
    const ticker = typeof row.ticker_id === "string" ? row.ticker_id.toUpperCase() : "";
    if (!ticker.endsWith("_INR")) continue;
    const market = canonical(ticker);
    markets.push(market);
    // target_volume is the INR side for an INR market.
    const volume = Number(row.target_volume);
    volumes.set(market, Number.isFinite(volume) && volume >= 0 ? volume : 0);
  }
  unoCoinInrMarkets = markets;
  return volumes;
}

/** UnoCoin's public tickers copy the last trade into bid and ask: read the real book. */
async function unoCoinRefreshBooks(markets: readonly string[]): Promise<void> {
  for (const market of markets) {
    const ticker = `${market.slice(0, -3)}_INR`;
    try {
      const book = await fetchJson(`${UNOCOIN_BOOK_URL}/${encodeURIComponent(ticker)}/50`) as {bids?: unknown; asks?: unknown};
      const levels = (side: unknown) => (Array.isArray(side) ? side : [])
        .map((level) => Number((level as Record<string, unknown>).rate))
        .filter((price) => price > 0);
      const bids = levels(book.bids);
      const asks = levels(book.asks);
      if (bids.length === 0 || asks.length === 0) continue;
      const bid = Math.max(...bids);
      const ask = Math.min(...asks);
      if (ask > bid) unoCoinBooks.set(market, {bid, ask, at: Date.now()});
    } catch {
      // A failed book simply ages out.
    }
  }
}

async function unoCoinTrades(coin: string): Promise<readonly PublicTrade[]> {
  const body = await fetchJson(`${UNOCOIN_TRADES_URL}?ticker_id=${encodeURIComponent(`${coin}_INR`)}&depth=100`) as {buy?: unknown; sell?: unknown};
  const parse = (rows: unknown, buyerMaker: boolean): PublicTrade[] => (Array.isArray(rows) ? rows : [])
    .map((row) => row as Record<string, unknown>)
    // "buy" is a buyer taking the ask (the seller rested); "sell" a seller hitting the bid.
    .map((row) => ({price: Number(row.price), quantity: Number(row.target_volume), at: Number(row.trade_timestamp) * 1_000, buyerMaker}))
    .filter((trade) => trade.price > 0 && trade.quantity > 0 && Number.isFinite(trade.at));
  return [...parse(body.buy, false), ...parse(body.sell, true)];
}

function startUnoCoin(): InExchangeMakerShadowService {
  const existing = getInExchangeMakerShadow("unocoin");
  if (existing) return existing;
  const service = new InExchangeMakerShadowService({
    listInrMarkets: () => unoCoinInrMarkets,
    getInrBook: (market) => {
      const book = unoCoinBooks.get(market);
      return book && Date.now() - book.at <= UNOCOIN_BOOK_MAX_AGE_MS ? {bid: book.bid, ask: book.ask} : null;
    },
    // Hedge on whichever of Binance/Bybit prices better on each side.
    getHedgeBook: (coin) => {
      const books = (["binance", "bybit"] as const)
        .map((venue) => ({venue, book: top(marketCache.get(venue, `${coin}USDT`), HEDGE_MAX_AGE_MS)}))
        .filter((entry): entry is {venue: "binance" | "bybit"; book: TopOfBook} => entry.book !== null);
      if (books.length === 0) return null;
      const bid = Math.max(...books.map((entry) => entry.book.bid));
      const ask = Math.min(...books.map((entry) => entry.book.ask));
      return {bid, ask, venue: books.map((entry) => entry.venue).join("/")};
    },
    getConversion: () => top(marketCache.get("coindcx", "USDTINR"), QUOTE_MAX_AGE_MS),
    inrFeePercent: () => getExchangeTakerFeePercent("unocoin", "XINR") ?? 0.4,
    hedgeFeePercent: () => getExchangeTakerFeePercent("binance", "XUSDT") ?? 0.1,
    fetchMarketDetails: async () => new Map(),
    fetchTrades: (coin) => unoCoinTrades(coin),
    fetchVolumes: unoCoinVolumes,
    refreshBooks: unoCoinRefreshBooks,
    now: Date.now,
  }, {venue: "unocoin", bookRefreshCandidates: 12});
  registerInExchangeMakerShadow("unocoin", service);
  service.start();
  return service;
}

/** Starts both shadows (idempotent). */
export function startInExchangeMakerShadow(): void {
  startCoinDcx();
  startUnoCoin();
}
