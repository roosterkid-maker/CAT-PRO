import {
  COINDCX,
} from "./constants";

import type {
  NormalizedTicker,
} from "./types";

export interface CoinDCXPublicTicker {
  market?: unknown;

  last_price?: unknown;

  timestamp?: unknown;
}

export interface CoinDCXPublicTickerApiContract {
  getTickers():
    Promise<readonly CoinDCXPublicTicker[]>;
}

export class CoinDCXPublicTickerApi
  implements CoinDCXPublicTickerApiContract {
  async getTickers():
    Promise<readonly CoinDCXPublicTicker[]> {
    const response =
      await fetch(
        new URL(
          "/exchange/ticker",
          COINDCX.REST.BASE_URL,
        ),
        {
          method:
            "GET",
          headers: {
            Accept:
              "application/json",
          },
          signal:
            AbortSignal.timeout(
              10_000,
            ),
        },
      );

    if (!response.ok) {
      throw new Error(
        `CoinDCX public ticker snapshot failed with HTTP ${response.status}.`,
      );
    }

    const body:
      unknown =
      await response.json();

    if (
      !Array.isArray(
        body,
      )
    ) {
      throw new Error(
        "CoinDCX public ticker snapshot is not an array.",
      );
    }

    return body as
      CoinDCXPublicTicker[];
  }
}

export function normalizeCoinDCXPublicTicker(
  incoming:
    CoinDCXPublicTicker,

  receivedAt:
    number,
): NormalizedTicker | null {
  const market =
    typeof incoming.market ===
      "string"
      ? incoming.market
          .trim()
          .toUpperCase()
          .replace(
            /[^A-Z0-9]/g,
            "",
          )
      : "";

  const lastPrice =
    positiveNumberOrNull(
      incoming.last_price,
    );

  if (
    !market ||
    lastPrice ===
      null ||
    !Number.isSafeInteger(
      receivedAt,
    ) ||
    receivedAt <=
      0
  ) {
    return null;
  }

  const sourceTimestamp =
    normalizeTimestamp(
      incoming.timestamp,
    );

  return {
    exchange:
      "coindcx",
    market,
    lastPrice,
    bid:
      null,
    ask:
      null,
    bestBidPrice:
      null,
    bestBidQty:
      null,
    bestAskPrice:
      null,
    bestAskQty:
      null,
    spread:
      null,
    timestamp:
      sourceTimestamp !==
          null &&
        sourceTimestamp <=
          receivedAt
        ? sourceTimestamp
        : receivedAt,
  };
}

function positiveNumberOrNull(
  value:
    unknown,
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

function normalizeTimestamp(
  value:
    unknown,
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

  return Number.isSafeInteger(
    milliseconds,
  )
    ? milliseconds
    : null;
}

export const coinDCXPublicTickerApi =
  new CoinDCXPublicTickerApi();
