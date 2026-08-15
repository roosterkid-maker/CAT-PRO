import type {
  OrderBookLevel,
} from "../../orderbook/models/OrderBookLevel";

import type {
  NormalizedTicker,
} from "../coindcx/types";

import {
  COINSWITCH,
  type CoinSwitchPublicVenue,
} from "./constants";

import type {
  CoinSwitchMarketDescriptor,
  CoinSwitchOrderBookPayload,
  CoinSwitchTicker,
} from "./types";

export interface NormalizedCoinSwitchTicker {
  descriptor:
    CoinSwitchMarketDescriptor;

  ticker:
    NormalizedTicker;
}

export interface NormalizedCoinSwitchOrderBook {
  market: string;

  canonicalMarket: string;

  bids:
    OrderBookLevel[];

  asks:
    OrderBookLevel[];

  timestamp: number;

  sourceTimestamp: number;
}

export function normalizeCoinSwitchTicker(
  venue:
    CoinSwitchPublicVenue,

  responseSymbol:
    string,

  incoming:
    CoinSwitchTicker,

  receivedAt: number,
): NormalizedCoinSwitchTicker | null {
  const symbol =
    normalizeCoinSwitchSymbol(
      typeof incoming.symbol ===
        "string"
        ? incoming.symbol
        : responseSymbol,
    );

  const assets =
    splitCoinSwitchSymbol(
      symbol,
    );

  const lastPrice =
    positiveNumberOrNull(
      incoming.lastPrice,
    );

  if (
    !assets ||
    !lastPrice ||
    !venueSupportsQuote(
      venue,
      assets.quoteAsset,
    ) ||
    !isValidReceivedAt(
      receivedAt,
    )
  ) {
    return null;
  }

  const incomingBid =
    positiveNumberOrNull(
      incoming.bidPrice,
    );

  const incomingAsk =
    positiveNumberOrNull(
      incoming.askPrice,
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

  const market =
    `${assets.baseAsset}_${assets.quoteAsset}`;

  const canonicalMarket =
    canonicalizeCoinSwitchMarket(
      market,
    );

  const descriptor:
    CoinSwitchMarketDescriptor = {
    venue,

    symbol,

    market,

    canonicalMarket,

    baseAsset:
      assets.baseAsset,

    quoteAsset:
      assets.quoteAsset,

    ticker:
      structuredClone(
        incoming,
      ),
  };

  return {
    descriptor,

    ticker: {
      exchange:
        COINSWITCH.NAME,

      market,

      lastPrice,

      bid:
        bestBidPrice,

      ask:
        bestAskPrice,

      bestBidPrice,

      /*
       * REST tickers do not expose quantities. They
       * may support discovery and price display but
       * must never refresh executable book evidence.
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

export function normalizeCoinSwitchOrderBook(
  incoming:
    CoinSwitchOrderBookPayload,

  expectedMarket:
    CoinSwitchMarketDescriptor,

  receivedAt: number,
): NormalizedCoinSwitchOrderBook | null {
  const responseCanonicalMarket =
    canonicalizeCoinSwitchMarket(
      incoming.s,
    );

  if (
    !responseCanonicalMarket ||
    responseCanonicalMarket !==
      expectedMarket
        .canonicalMarket
  ) {
    return null;
  }

  const timestamp =
    Number(
      incoming.timestamp,
    );

  if (
    !Number.isSafeInteger(
      timestamp,
    ) ||
    timestamp <=
      0 ||
    timestamp -
      receivedAt >
      COINSWITCH
        .MAXIMUM_FUTURE_SKEW_MS ||
    receivedAt -
      timestamp >
      COINSWITCH
        .MAXIMUM_SNAPSHOT_AGE_MS
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
    market:
      expectedMarket.market,

    canonicalMarket:
      expectedMarket
        .canonicalMarket,

    bids,

    asks,

    /*
     * Executable freshness is measured from the instant CAT PRO
     * received and validated the book.  The venue clock is retained
     * separately for integrity/clock-offset diagnostics; using it as
     * the cache timestamp made otherwise valid books appear to come
     * from the future whenever the two machines were slightly skewed.
     */
    timestamp:
      receivedAt,

    sourceTimestamp:
      timestamp,
  };
}

export function normalizeCoinSwitchSymbol(
  value: unknown,
): string {
  if (
    typeof value !==
      "string"
  ) {
    return "";
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  const delimitedAssets =
    normalized
      .split(
        /[\s_,\-/]+/,
      )
      .filter(
        (asset) =>
          asset.length >
          0,
      );

  let assets =
    delimitedAssets;

  /*
   * The public catalog uses BTC/USDT while the shared-universe
   * manager and websocket payloads use BTCUSDT.  Accept both forms
   * by splitting compact symbols only on CoinSwitch's authoritative
   * quote currencies.  This avoids the old 7-market subscription
   * ceiling without guessing arbitrary asset boundaries.
   */
  if (
    assets.length ===
      1 &&
    /^[A-Z0-9]+$/.test(
      normalized,
    )
  ) {
    const compactQuote =
      [
        "USDT",
        "INR",
      ].find(
        (quote) =>
          normalized.endsWith(
            quote,
          ) &&
          normalized.length >
            quote.length,
      );

    if (compactQuote) {
      assets = [
        normalized.slice(
          0,
          -compactQuote.length,
        ),
        compactQuote,
      ];
    }
  }

  if (
    assets.length !==
      2
  ) {
    return "";
  }

  return `${assets[0]}/${assets[1]}`;
}

export function canonicalizeCoinSwitchMarket(
  value: unknown,
): string {
  return normalizeCoinSwitchSymbol(
    value,
  ).replace(
    "/",
    "",
  );
}

export function toCoinSwitchSocketPair(
  symbol: string,
): string {
  return normalizeCoinSwitchSymbol(
    symbol,
  ).replace(
    "/",
    ",",
  );
}

function splitCoinSwitchSymbol(
  symbol: string,
): {
  baseAsset: string;

  quoteAsset: string;
} | null {
  const [
    baseAsset,
    quoteAsset,
  ] =
    symbol.split(
      "/",
    );

  if (
    !baseAsset ||
    !quoteAsset
  ) {
    return null;
  }

  return {
    baseAsset,
    quoteAsset,
  };
}

function venueSupportsQuote(
  venue:
    CoinSwitchPublicVenue,

  quoteAsset: string,
): boolean {
  switch (venue) {
    case "coinswitchx":
      return quoteAsset ===
        "INR";

    case "c2c1":
      return quoteAsset ===
        "USDT";
  }
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
      COINSWITCH
        .MAXIMUM_PUBLISHED_DEPTH,
    );
}

function positiveNumberOrNull(
  value: unknown,
): number | null {
  const parsed =
    typeof value ===
      "string" ||
    typeof value ===
      "number"
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

function isValidReceivedAt(
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
