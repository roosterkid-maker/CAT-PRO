import type { ExecutableQuote } from "../../core/models/ExecutableQuote";

import { marketRegistry } from "./registry";
import type {
  CoinDCXOrderBookPayload,
  CoinDCXOrderBookSide,
} from "./orderBook.types";

interface PriceLevel {
  price: number;
  quantity: number;
}

export function normalizeCoinDCXOrderBook(
  payload: CoinDCXOrderBookPayload,
): ExecutableQuote | null {
  const rawSymbol =
    payload.s?.trim().toUpperCase();

  if (!rawSymbol) {
    return null;
  }

  const marketInfo =
    marketRegistry.get(rawSymbol) ??
    marketRegistry.getByPair(rawSymbol);

  const market =
    marketInfo?.symbol ??
    rawSymbol;

  const bestBid =
    findBestLevel(
      payload.bids,
      "bid",
    );

  const bestAsk =
    findBestLevel(
      payload.asks,
      "ask",
    );

  if (!bestBid || !bestAsk) {
    return null;
  }

  if (bestAsk.price < bestBid.price) {
    return null;
  }

  const timestamp =
    payload.E ??
    payload.ts ??
    Date.now();

  return {
    exchange: "coindcx",

    market,

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

    timestamp,

    source: "orderBook",

    executable: true,
  };
}

function findBestLevel(
  side:
    | CoinDCXOrderBookSide
    | undefined,
  type: "bid" | "ask",
): PriceLevel | null {
  if (!side) {
    return null;
  }

  let bestLevel:
    | PriceLevel
    | null = null;

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

    if (!bestLevel) {
      bestLevel = {
        price,
        quantity,
      };

      continue;
    }

    const isBetter =
      type === "bid"
        ? price > bestLevel.price
        : price < bestLevel.price;

    if (isBetter) {
      bestLevel = {
        price,
        quantity,
      };
    }
  }

  return bestLevel;
}