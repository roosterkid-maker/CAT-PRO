import type {
  OrderBookLevel,
} from "../../orderbook/models/OrderBookLevel";

import type {
  NormalizedTicker,
} from "../coindcx/types";

import {
  UNOCOIN,
} from "./constants";

import type {
  UnoCoinOrderBook,
  UnoCoinTicker,
} from "./types";

export interface NormalizedUnoCoinTicker {
  ticker:
    NormalizedTicker;

  canonicalMarket: string;
}

export interface NormalizedUnoCoinOrderBook {
  market: string;

  canonicalMarket: string;

  bids:
    OrderBookLevel[];

  asks:
    OrderBookLevel[];

  sourceTimestamp:
    number | null;

  receivedAt: number;
}

export function normalizeUnoCoinTicker(
  incoming:
    UnoCoinTicker,

  receivedAt:
    number,
): NormalizedUnoCoinTicker | null {
  const market =
    normalizeUnoCoinMarket(
      incoming.ticker_id,
    );

  const canonicalMarket =
    canonicalizeUnoCoinMarket(
      market,
    );

  const lastPrice =
    positiveNumberOrNull(
      incoming.last_price,
    );

  if (
    !market ||
    !canonicalMarket ||
    lastPrice ===
      null ||
    !isValidTimestamp(
      receivedAt,
    )
  ) {
    return null;
  }

  const incomingBid =
    positiveNumberOrNull(
      incoming.bid,
    );

  const incomingAsk =
    positiveNumberOrNull(
      incoming.ask,
    );

  const topOfBookIsValid =
    incomingBid !==
      null &&
    incomingAsk !==
      null &&
    incomingAsk >=
      incomingBid;

  const bestBidPrice =
    topOfBookIsValid
      ? incomingBid
      : null;

  const bestAskPrice =
    topOfBookIsValid
      ? incomingAsk
      : null;

  return {
    canonicalMarket,

    ticker: {
      exchange:
        UNOCOIN.NAME,

      market,

      lastPrice,

      bid:
        bestBidPrice,

      ask:
        bestAskPrice,

      bestBidPrice,

      /*
       * The ticker contract does not include quantity.
       * Keeping both quantities null guarantees that an
       * ordinary UnoCoin ticker can never be classified
       * as executable market data.
       */
      bestBidQty:
        null,

      bestAskPrice,

      bestAskQty:
        null,

      spread:
        bestBidPrice !==
          null &&
        bestAskPrice !==
          null
          ? bestAskPrice -
            bestBidPrice
          : null,

      timestamp:
        receivedAt,
    },
  };
}

export function normalizeUnoCoinOrderBook(
  incoming:
    UnoCoinOrderBook,

  requestedMarket:
    string,

  receivedAt:
    number,
): NormalizedUnoCoinOrderBook | null {
  const responseMarket =
    normalizeUnoCoinMarket(
      incoming.ticker_id,
    );

  const normalizedRequestedMarket =
    normalizeUnoCoinMarket(
      requestedMarket,
    );

  const market =
    responseMarket ||
    normalizedRequestedMarket;

  if (
    !market ||
    canonicalizeUnoCoinMarket(
      responseMarket,
    ) !==
      canonicalizeUnoCoinMarket(
        normalizedRequestedMarket,
      ) ||
    !isValidTimestamp(
      receivedAt,
    )
  ) {
    return null;
  }

  const bids =
    normalizeLevels(
      incoming.bids,
      "bid",
    );

  const asks =
    normalizeLevels(
      incoming.asks,
      "ask",
    );

  const bestBid =
    bids[0];

  const bestAsk =
    asks[0];

  if (
    !bestBid ||
    !bestAsk ||
    bestAsk.price <
      bestBid.price
  ) {
    return null;
  }

  return {
    market,

    canonicalMarket:
      canonicalizeUnoCoinMarket(
        market,
      ),

    bids,

    asks,

    sourceTimestamp:
      normalizeSourceTimestamp(
        incoming.timestamp,
      ),

    /*
     * The endpoint is a complete REST snapshot. The
     * retrieval time records when CAT PRO obtained the
     * snapshot; the exchange's timestamp is retained
     * separately as source diagnostics and is never
     * silently substituted for retrieval evidence.
     */
    receivedAt,
  };
}

export function normalizeUnoCoinMarket(
  value: unknown,
): string {
  if (
    typeof value !==
      "string"
  ) {
    return "";
  }

  return value
    .trim()
    .toUpperCase()
    .replace(
      /[\s\-/]+/g,
      "_",
    )
    .replace(
      /_+/g,
      "_",
    )
    .replace(
      /^_|_$/g,
      "",
    );
}

export function canonicalizeUnoCoinMarket(
  value: unknown,
): string {
  return normalizeUnoCoinMarket(
    value,
  ).replace(
    /_/g,
    "",
  );
}

function normalizeLevels(
  incoming: unknown,

  side:
    "bid" |
    "ask",
): OrderBookLevel[] {
  if (
    !Array.isArray(
      incoming,
    )
  ) {
    return [];
  }

  const byPrice =
    new Map<
      number,
      number
    >();

  for (
    const level
    of incoming
  ) {
    if (
      !Array.isArray(
        level,
      ) ||
      level.length <
        2
    ) {
      continue;
    }

    const price =
      positiveNumberOrNull(
        level[0],
      );

    const quantity =
      positiveNumberOrNull(
        level[1],
      );

    if (
      price ===
        null ||
      quantity ===
        null
    ) {
      continue;
    }

    byPrice.set(
      price,
      quantity,
    );
  }

  return [
    ...byPrice.entries(),
  ]
    .map(
      (
        [
          price,
          quantity,
        ],
      ) => ({
        price,
        quantity,
      }),
    )
    .sort(
      side ===
        "bid"
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
    )
    .slice(
      0,
      UNOCOIN
        .MAXIMUM_PUBLISHED_DEPTH,
    );
}

function positiveNumberOrNull(
  value: unknown,
): number | null {
  const parsed =
    typeof value ===
      "number" ||
    typeof value ===
      "string"
      ? Number(
          value,
        )
      : Number.NaN;

  return (
    Number.isFinite(
      parsed,
    ) &&
    parsed >
      0
  )
    ? parsed
    : null;
}

function normalizeSourceTimestamp(
  value: unknown,
): number | null {
  const parsed =
    typeof value ===
      "number" ||
    typeof value ===
      "string"
      ? Number(
          value,
        )
      : Number.NaN;

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <=
      0
  ) {
    return null;
  }

  const milliseconds =
    parsed <
      100_000_000_000
      ? parsed *
        1_000
      : parsed;

  return isValidTimestamp(
    milliseconds,
  )
    ? milliseconds
    : null;
}

function isValidTimestamp(
  value: number,
): boolean {
  return (
    Number.isSafeInteger(
      value,
    ) &&
    value >
      0 &&
    value <=
      Date.now()
  );
}
