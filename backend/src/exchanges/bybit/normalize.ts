import type { NormalizedTicker } from "../coindcx/types";
import type { BybitTickerMessage } from "./types";

export function normalizeBybitTicker(
  message: BybitTickerMessage,
): NormalizedTicker | null {
  const data = message.data;

  if (!data?.symbol || !data.lastPrice) {
    return null;
  }

  const bestBidPrice =
    data.bid1Price != null
      ? Number(data.bid1Price)
      : null;

  const bestAskPrice =
    data.ask1Price != null
      ? Number(data.ask1Price)
      : null;

  const spread =
    bestBidPrice !== null &&
    bestAskPrice !== null
      ? bestAskPrice - bestBidPrice
      : null;

  return {
    exchange: "bybit",

    market: data.symbol.toUpperCase(),

    lastPrice: Number(data.lastPrice),

    // Backward compatibility
    bid: bestBidPrice,
    ask: bestAskPrice,

    // Executable model
    bestBidPrice,
    bestBidQty: null,

    bestAskPrice,
    bestAskQty: null,

    spread,

    timestamp:
      message.ts ??
      data.timestamp ??
      Date.now(),
  };
}