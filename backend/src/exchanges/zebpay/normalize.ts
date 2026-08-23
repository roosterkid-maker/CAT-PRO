import type {
  NormalizedTicker,
} from "../coindcx/types";

import {
  ZEBPAY,
} from "./constants";

import type {
  ZebPayMarket,
  ZebPayOrderBook,
} from "./types";

export interface NormalizedZebPayMarket {
  canonicalMarket: string;

  ticker:
    NormalizedTicker;
}

export function normalizeZebPayTicker(
  incoming:
    ZebPayMarket,

  receivedAt:
    number,
): NormalizedZebPayMarket | null {
  const market =
    normalizeZebPayMarket(
      incoming.pair,
    );

  const assets =
    splitZebPayMarket(
      market,
    );

  const lastPrice =
    positiveNumberOrNull(
      incoming.market,
    );

  if (
    !assets ||
    !ZEBPAY
      .OBSERVATION_QUOTE_ASSETS
      .some(
        (asset) =>
          asset ===
          assets.quoteAsset,
      ) ||
    lastPrice ===
      null ||
    !Number.isSafeInteger(
      receivedAt,
    ) ||
    receivedAt <= 0
  ) {
    return null;
  }

  /*
   * ZebPay's public market payload names the price offered to a buyer
   * `buy` and the price received by a seller `sell`. The official public
   * order-book endpoint confirms that these correspond to ask and bid.
   * They remain discovery prices only because this payload has no size.
   */
  const bestAskPrice =
    positiveNumberOrNull(
      incoming.buy,
    );

  const bestBidPrice =
    positiveNumberOrNull(
      incoming.sell,
    );

  const validTop =
    bestBidPrice !==
      null &&
    bestAskPrice !==
      null &&
    bestAskPrice >=
      bestBidPrice;

  const bid =
    validTop
      ? bestBidPrice
      : null;

  const ask =
    validTop
      ? bestAskPrice
      : null;

  return {
    canonicalMarket:
      canonicalizeZebPayMarket(
        market,
      ),

    ticker: {
      exchange:
        ZEBPAY.NAME,

      market:
        canonicalizeZebPayMarket(
          market,
        ),

      lastPrice,

      bid,

      ask,

      bestBidPrice:
        bid,

      bestBidQty:
        null,

      bestAskPrice:
        ask,

      bestAskQty:
        null,

      spread:
        bid !==
          null &&
        ask !==
          null
          ? ask - bid
          : null,

      timestamp:
        receivedAt,
    },
  };
}

export function normalizeZebPayOrderBookTicker(
  market: string,
  incoming: ZebPayOrderBook,
  receivedAt: number,
): NormalizedTicker | null {
  const normalizedMarket =
    normalizeZebPayMarket(
      market,
    );

  const assets =
    splitZebPayMarket(
      normalizedMarket,
    );

  if (
    !assets ||
    !ZEBPAY
      .OBSERVATION_QUOTE_ASSETS
      .includes(
        assets.quoteAsset as
          typeof ZEBPAY.OBSERVATION_QUOTE_ASSETS[number],
      ) ||
    !Number.isSafeInteger(
      receivedAt,
    ) ||
    receivedAt <= 0
  ) {
    return null;
  }

  const bestBid =
    selectBestLevel(
      incoming.bids,
      "BID",
    );

  const bestAsk =
    selectBestLevel(
      incoming.asks,
      "ASK",
    );

  if (
    !bestBid ||
    !bestAsk ||
    bestAsk.price <
      bestBid.price
  ) {
    return null;
  }

  return {
    exchange:
      ZEBPAY.NAME,
    market:
      canonicalizeZebPayMarket(
        normalizedMarket,
      ),
    lastPrice:
      (
        bestBid.price +
        bestAsk.price
      ) /
      2,
    bid:
      bestBid.price,
    ask:
      bestAsk.price,
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
      receivedAt,
  };
}

export function normalizeZebPayAtomicOrderBookTicker(
  market: string,
  incoming: ZebPayOrderBook,
  volumePrecision: number,
  receivedAt: number,
): NormalizedTicker | null {
  if (
    !Number.isSafeInteger(
      volumePrecision,
    ) ||
    volumePrecision < 0 ||
    volumePrecision > 18
  ) {
    return null;
  }

  const divisor =
    10 **
    volumePrecision;

  const scale = (
    levels:
      ZebPayOrderBook["bids"],
  ) =>
    levels?.map(
      (level) => ({
        ...level,
        amount:
          Number(
            level.amount,
          ) /
          divisor,
      }),
    );

  return normalizeZebPayOrderBookTicker(
    market,
    {
      ...incoming,
      bids:
        scale(
          incoming.bids,
        ),
      asks:
        scale(
          incoming.asks,
        ),
    },
    receivedAt,
  );
}

export function isZebPaySpotObservation(
  incoming:
    ZebPayMarket,
): boolean {
  const exchangeVolume =
    nonNegativeNumberOrNull(
      incoming.volumeEx,
    );

  const hasTwoSidedPrice =
    positiveNumberOrNull(
      incoming.buy,
    ) !== null &&
    positiveNumberOrNull(
      incoming.sell,
    ) !== null;

  return (
    hasTwoSidedPrice ||
    (
      exchangeVolume !==
        null &&
      exchangeVolume > 0
    )
  );
}

export function normalizeZebPayMarket(
  value:
    unknown,
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

export function canonicalizeZebPayMarket(
  value:
    unknown,
): string {
  return normalizeZebPayMarket(
    value,
  ).replace(
    /_/g,
    "",
  );
}

function splitZebPayMarket(
  market:
    string,
): {
  baseAsset: string;
  quoteAsset: string;
} | null {
  const parts =
    market.split(
      "_",
    );

  if (
    parts.length !==
      2 ||
    !parts[0] ||
    !parts[1]
  ) {
    return null;
  }

  return {
    baseAsset:
      parts[0],

    quoteAsset:
      parts[1],
  };
}

function selectBestLevel(
  levels:
    ZebPayOrderBook["bids"],
  side:
    "BID" | "ASK",
): {
  price: number;
  quantity: number;
} | null {
  if (!Array.isArray(levels)) {
    return null;
  }

  const valid =
    levels
      .map((level) => ({
        price:
          positiveNumberOrNull(
            level.price,
          ),
        quantity:
          positiveNumberOrNull(
            level.amount,
          ),
      }))
      .filter(
        (
          level,
        ): level is {
          price: number;
          quantity: number;
        } =>
          level.price !==
            null &&
          level.quantity !==
            null,
      );

  if (valid.length === 0) {
    return null;
  }

  return valid.reduce(
    (best, level) =>
      side === "BID"
        ? (
            level.price >
              best.price
              ? level
              : best
          )
        : (
            level.price <
              best.price
              ? level
              : best
          ),
  );
}

function positiveNumberOrNull(
  value:
    unknown,
): number | null {
  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  ) &&
    parsed > 0
    ? parsed
    : null;
}

function nonNegativeNumberOrNull(
  value:
    unknown,
): number | null {
  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  ) &&
    parsed >= 0
    ? parsed
    : null;
}
