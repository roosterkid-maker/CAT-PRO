import {
  marketCache,
} from "../../services/cache.service";

import {
  getExchangeTakerFeePercent,
} from "../../arbitrage/config/fees";

import {
  getInExchangeMakerShadow,
  InExchangeMakerShadowService,
  registerInExchangeMakerShadow,
  type MarketDetail,
  type PublicTrade,
} from "./InExchangeMakerShadowService";

/* CoinDCX public reads behind the in-exchange maker shadow. Read-only. */
const MARKET_DETAILS_URL = "https://api.coindcx.com/exchange/v1/markets_details";
const TRADE_HISTORY_URL = "https://public.coindcx.com/market_data/trade_history";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {signal: AbortSignal.timeout(8_000)});
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

async function fetchMarketDetails(): Promise<ReadonlyMap<string, MarketDetail>> {
  const rows = await fetchJson(MARKET_DETAILS_URL);
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

async function fetchTrades(pair: string): Promise<readonly PublicTrade[]> {
  const rows = await fetchJson(`${TRADE_HISTORY_URL}?pair=${encodeURIComponent(pair)}&limit=50`);
  if (!Array.isArray(rows)) return [];
  return (rows as Record<string, unknown>[])
    .map((row) => ({price: Number(row.p), quantity: Number(row.q), at: Number(row.T), buyerMaker: row.m === true}))
    .filter((trade) => trade.price > 0 && trade.quantity > 0 && Number.isFinite(trade.at));
}

/** The shared CoinDCX shadow, created and started on first use. */
export function startInExchangeMakerShadow(): InExchangeMakerShadowService {
  const existing = getInExchangeMakerShadow();
  if (existing) return existing;
  const service = new InExchangeMakerShadowService({
    getQuote: (market) => marketCache.get("coindcx", market),
    listInrMarkets: () => marketCache.getByExchange("coindcx")
      .map((quote) => quote.market.toUpperCase().replace(/[^A-Z0-9]/gu, ""))
      .filter((market) => market.endsWith("INR")),
    fetchMarketDetails,
    fetchTrades,
    getFeePercent: (market) => getExchangeTakerFeePercent("coindcx", market) ?? (market.endsWith("INR") ? 0.59 : 0.2),
    now: Date.now,
  });
  registerInExchangeMakerShadow(service);
  service.start();
  return service;
}
