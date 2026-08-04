import type { ExecutableQuote } from "../../core/models/ExecutableQuote";
import type { OrderBook } from "../../orderbook/models/OrderBook";
import type { OrderBookLevel } from "../../orderbook/models/OrderBookLevel";

import { COINDCX } from "./constants";
import { marketRegistry } from "./registry";

import type {
  CoinDCXOrderBookPayload,
  CoinDCXOrderBookSide,
} from "./orderBook.types";


function resolveMarket(
  payload: CoinDCXOrderBookPayload,
): string | null {
  const rawSymbol =
    payload.s?.trim().toUpperCase();

  if (!rawSymbol) {
    return null;
  }

  const marketInfo =
    marketRegistry.get(rawSymbol) ??
    marketRegistry.getByPair(rawSymbol);

  return (
    marketInfo?.symbol ??
    rawSymbol
  );
}

function resolveTimestamp(
  payload: CoinDCXOrderBookPayload,
): number {
  const timestamp =
    payload.E ??
    payload.ts ??
    Date.now();

  return Number.isFinite(timestamp)
    ? timestamp
    : Date.now();
}

function normalizeSide(
  side: CoinDCXOrderBookSide | undefined,
  direction: "bid" | "ask",
  maximumLevels = COINDCX.ORDER_BOOK.DEPTH,
): OrderBookLevel[] {
  if (!side) {
    return [];
  }

  const levels: OrderBookLevel[] = [];

  for (const [
    rawPrice,
    rawQuantity,
  ] of Object.entries(side)) {
    const price =
      Number(rawPrice);

    const quantity =
      Number(rawQuantity);

    if (
      !Number.isFinite(price) ||
      !Number.isFinite(quantity) ||
      price <= 0 ||
      quantity <= 0
    ) {
      continue;
    }

    levels.push({
      price,
      quantity,
    });
  }

  levels.sort(
    direction === "bid"
      ? (
          first,
          second,
        ) =>
          second.price -
          first.price
      : (
          first,
          second,
        ) =>
          first.price -
          second.price,
  );

  return levels.slice(
    0,
    maximumLevels,
  );
}

export function normalizeCoinDCXFullOrderBook(
  payload: CoinDCXOrderBookPayload,
): OrderBook | null {
  const market =
    resolveMarket(payload);

  if (!market) {
    return null;
  }

  const bids =
    normalizeSide(
      payload.bids,
      "bid",
    );

  const asks =
    normalizeSide(
      payload.asks,
      "ask",
    );

  if (
    bids.length === 0 ||
    asks.length === 0
  ) {
    return null;
  }

  const bestBid =
    bids[0];

  const bestAsk =
    asks[0];

  if (
    !bestBid ||
    !bestAsk ||
    bestAsk.price < bestBid.price
  ) {
    return null;
  }

  return {
    exchange: "coindcx",

    market,

    bids,
    asks,

    timestamp:
      resolveTimestamp(payload),
  };
}

export function normalizeCoinDCXOrderBook(
  payload: CoinDCXOrderBookPayload,
): ExecutableQuote | null {
  const orderBook =
    normalizeCoinDCXFullOrderBook(
      payload,
    );

  if (!orderBook) {
    return null;
  }

  const bestBid =
    orderBook.bids[0];

  const bestAsk =
    orderBook.asks[0];

  if (!bestBid || !bestAsk) {
    return null;
  }

  return {
    exchange: "coindcx",

    market:
      orderBook.market,

    lastPrice: null,

    bestBidPrice:
      bestBid.price,

    bestBidQty:
      bestBid.quantity,

    bestAskPrice:
      bestAsk.price,

    bestAskQty:
      bestAsk.quantity,

    spread:
      bestAsk.price -
      bestBid.price,

    timestamp:
      orderBook.timestamp,

    source: "orderBook",

    executable: true,
  };
}