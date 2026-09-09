import type {OrderBook} from "../../orderbook/models/OrderBook";
import type {NormalizedTicker} from "../coindcx/types";
import {GIOTTUS} from "./constants";
import type {GiottusOrderBook, GiottusOrderBookLevel, GiottusTicker} from "./types";

export function normalizeGiottusSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  const match = /^([A-Z0-9]+)[\/_-]([A-Z0-9]+)$/.exec(normalized);
  return match?.[1] && match[2] ? `${match[1]}/${match[2]}` : "";
}

export function canonicalizeGiottusMarket(symbol: string): string {
  return normalizeGiottusSymbol(symbol).replace("/", "");
}

export function isGiottusObservationMarket(symbol: string): boolean {
  const normalized = normalizeGiottusSymbol(symbol);
  const quote = normalized.split("/")[1];
  return Boolean(
    quote &&
      GIOTTUS.OBSERVATION_QUOTE_ASSETS.includes(
        quote as (typeof GIOTTUS.OBSERVATION_QUOTE_ASSETS)[number],
      ),
  );
}

export function normalizeGiottusTicker(
  incoming: GiottusTicker,
  receivedAt: number,
): NormalizedTicker | null {
  const symbol = typeof incoming.symbol === "string" ? incoming.symbol : "";
  const market = canonicalizeGiottusMarket(symbol);
  const lastPrice = positiveNumber(incoming.lastPrice);
  if (!market || !isGiottusObservationMarket(symbol) || lastPrice === null || !validTime(receivedAt)) {
    return null;
  }
  return {
    exchange: GIOTTUS.NAME,
    market,
    lastPrice,
    bid: null,
    ask: null,
    bestBidPrice: null,
    bestBidQty: null,
    bestAskPrice: null,
    bestAskQty: null,
    spread: null,
    timestamp: receivedAt,
  };
}

export function normalizeGiottusOrderBook(
  symbol: string,
  incoming: GiottusOrderBook,
  receivedAt: number,
): OrderBook | null {
  const market = canonicalizeGiottusMarket(symbol);
  if (!market || !isGiottusObservationMarket(symbol) || !validTime(receivedAt)) return null;
  const bids = normalizeLevels(incoming.bids, "BID");
  const asks = normalizeLevels(incoming.asks, "ASK");
  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (!bestBid || !bestAsk || bestAsk.price < bestBid.price) return null;
  return {exchange: GIOTTUS.NAME, market, bids, asks, timestamp: receivedAt};
}

export function tickerFromGiottusBook(book: OrderBook): NormalizedTicker | null {
  const bestBid = book.bids[0];
  const bestAsk = book.asks[0];
  if (!bestBid || !bestAsk || bestAsk.price < bestBid.price) return null;
  return {
    exchange: GIOTTUS.NAME,
    market: book.market,
    lastPrice: (bestBid.price + bestAsk.price) / 2,
    bid: bestBid.price,
    ask: bestAsk.price,
    bestBidPrice: bestBid.price,
    bestBidQty: bestBid.quantity,
    bestAskPrice: bestAsk.price,
    bestAskQty: bestAsk.quantity,
    spread: bestAsk.price - bestBid.price,
    timestamp: book.timestamp,
  };
}

function normalizeLevels(
  levels: GiottusOrderBookLevel[] | undefined,
  side: "BID" | "ASK",
): Array<{price: number; quantity: number}> {
  const normalized = (levels ?? [])
    .map(([priceValue, quantityValue]) => ({
      price: positiveNumber(priceValue),
      quantity: positiveNumber(quantityValue),
    }))
    .filter(
      (level): level is {price: number; quantity: number} =>
        level.price !== null && level.quantity !== null,
    );
  normalized.sort((first, second) =>
    side === "BID" ? second.price - first.price : first.price - second.price,
  );
  return normalized;
}

function positiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
