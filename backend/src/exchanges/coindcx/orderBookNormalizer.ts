import type { ExecutableQuote } from "../../core/models/ExecutableQuote";
import type { OrderBook } from "../../orderbook/models/OrderBook";
import type { OrderBookLevel } from "../../orderbook/models/OrderBookLevel";

import { COINDCX } from "./constants";
import { marketRegistry } from "./registry";

import type {
  CoinDCXOrderBookPayload,
  CoinDCXOrderBookSide,
} from "./orderBook.types";


export function resolveCoinDCXMarket(
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

export function resolveCoinDCXSourceTimestamp(
  payload: CoinDCXOrderBookPayload,
): number | null {
  const timestamp =
    payload.E ??
    payload.ts;

  return Number.isFinite(timestamp)
    ? timestamp ?? null
    : null;
}

export function resolveCoinDCXSourceVersion(
  payload: CoinDCXOrderBookPayload,
): number | null {
  return Number.isSafeInteger(
    payload.vs,
  ) &&
    (payload.vs ?? 0) >=
      0
    ? payload.vs ?? null
    : null;
}

function resolveTimestamp(
  payload: CoinDCXOrderBookPayload,
): number {
  return (
    resolveCoinDCXSourceTimestamp(
      payload,
    ) ??
    Date.now()
  );
}

function normalizeSide(
  side: CoinDCXOrderBookSide | undefined,
  direction: "bid" | "ask",
  maximumLevels:
    number = COINDCX.ORDER_BOOK.DEPTH,
  preserveDeletions = false,
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
      quantity < 0 ||
      (
        !preserveDeletions &&
        quantity === 0
      )
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

export function normalizeCoinDCXOrderBookSnapshot(
  payload: CoinDCXOrderBookPayload,
): OrderBook | null {
  const market =
    resolveCoinDCXMarket(
      payload,
    );

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

  return {
    exchange: "coindcx",

    market,

    bids,
    asks,

    timestamp:
      resolveTimestamp(payload),
  };
}

export function normalizeCoinDCXOrderBookDelta(
  payload: CoinDCXOrderBookPayload,
): OrderBook | null {
  const market =
    resolveCoinDCXMarket(
      payload,
    );

  if (!market) {
    return null;
  }

  const bids =
    normalizeSide(
      payload.bids,
      "bid",
      Number.MAX_SAFE_INTEGER,
      true,
    );

  const asks =
    normalizeSide(
      payload.asks,
      "ask",
      Number.MAX_SAFE_INTEGER,
      true,
    );

  if (
    bids.length === 0 &&
    asks.length === 0
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

export function normalizeCoinDCXFullOrderBook(
  payload: CoinDCXOrderBookPayload,
): OrderBook | null {
  const orderBook =
    normalizeCoinDCXOrderBookSnapshot(
      payload,
    );

  if (!orderBook) {
    return null;
  }

  const bestBid =
    orderBook.bids[0];

  const bestAsk =
    orderBook.asks[0];

  if (
    !bestBid ||
    !bestAsk ||
    bestAsk.price < bestBid.price
  ) {
    return null;
  }

  return orderBook;
}

export function coinDCXOrderBookToExecutableQuote(
  orderBook: OrderBook,
): ExecutableQuote | null {
  const bestBid =
    orderBook.bids[0];

  const bestAsk =
    orderBook.asks[0];

  if (
    !bestBid ||
    !bestAsk ||
    bestAsk.price <
      bestBid.price
  ) {
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

  return coinDCXOrderBookToExecutableQuote(
    orderBook,
  );
}
