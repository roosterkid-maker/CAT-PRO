import {
  create,
} from "zustand";

import type {
  MarketViewModel,
} from "@/types/MarketViewModel";

import type {
  MarketTicker,
} from "@/types/market";

export type MarketSnapshotStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

interface MarketState {
  markets:
    Record<
      string,
      MarketViewModel
    >;

  snapshotStatus:
    MarketSnapshotStatus;

  snapshotCount:
    | number
    | null;

  snapshotReceivedAt:
    | number
    | null;

  updateTicker:
    (ticker: MarketTicker) => void;

  updateTickers:
    (
      tickers:
        MarketTicker[],
    ) => void;

  hydrateSnapshot:
    (
      tickers:
        MarketTicker[],
    ) => void;

  setSnapshotLoading:
    () => void;

  setSnapshotError:
    () => void;

  clear: () => void;
}

export const useMarketStore =
  create<MarketState>(
    (
      set,
    ) => ({
      markets: {},

      snapshotStatus:
        "idle",

      snapshotCount:
        null,

      snapshotReceivedAt:
        null,

      updateTicker:
        (
          ticker,
        ) =>
          set(
            (
              state,
            ) => {
              const entry =
                createMarketEntry(
                  state.markets,
                  ticker,
                );

              return entry ===
                null
                ? state
                : {
                    markets: {
                      ...state.markets,

                      [entry.key]:
                        entry.value,
                    },
                  };
            },
          ),

      updateTickers:
        (
          tickers,
        ) =>
          set(
            (
              state,
            ) => {
              const merged =
                mergeMarketTickers(
                  state.markets,
                  tickers,
                );

              return merged ===
                state.markets
                ? state
                : {
                    markets:
                      merged,
                  };
            },
          ),

      hydrateSnapshot:
        (
          tickers,
        ) =>
          set(
            (
              state,
            ) => {
              let markets =
                state.markets;

              let changed =
                false;

              for (
                const ticker
                of tickers
              ) {
                const entry =
                  createMarketEntry(
                    markets,
                    ticker,
                  );

                if (
                  entry ===
                  null
                ) {
                  continue;
                }

                if (!changed) {
                  markets = {
                    ...markets,
                  };

                  changed =
                    true;
                }

                markets[
                  entry.key
                ] =
                  entry.value;
              }

              return {
                markets,

                snapshotStatus:
                  "ready",

                snapshotCount:
                  tickers.length,

                snapshotReceivedAt:
                  Date.now(),
              };
            },
          ),

      setSnapshotLoading:
        () =>
          set({
            snapshotStatus:
              "loading",
          }),

      setSnapshotError:
        () =>
          set({
            snapshotStatus:
              "error",
          }),

      clear:
        () =>
          set({
            markets: {},

            snapshotStatus:
              "idle",

            snapshotCount:
              null,

            snapshotReceivedAt:
              null,
          }),
    }),
  );

function createMarketEntry(
  markets:
    Record<
      string,
      MarketViewModel
    >,

  ticker:
    MarketTicker,
): {
  key: string;

  value:
    MarketViewModel;
} | null {
  const exchange =
    ticker.exchange
      .trim()
      .toLowerCase();

  const market =
    ticker.market
      .trim()
      .toUpperCase();

  if (
    !exchange ||
    !market ||
    !Number.isFinite(
      ticker.timestamp,
    ) ||
    ticker.timestamp <= 0
  ) {
    return null;
  }

  const key =
    `${exchange}:${market}`;

  const current =
    markets[key];

  if (
    current &&
    ticker.timestamp <
      current.timestamp
  ) {
    return null;
  }

  const previousPrice =
    current?.lastPrice ??
    ticker.lastPrice ??
    0;

  let direction:
    MarketViewModel["direction"] =
    "none";

  if (
    current?.lastPrice !==
      null &&
    current?.lastPrice !==
      undefined &&
    ticker.lastPrice !==
      null
  ) {
    if (
      ticker.lastPrice >
      current.lastPrice
    ) {
      direction =
        "up";
    } else if (
      ticker.lastPrice <
      current.lastPrice
    ) {
      direction =
        "down";
    }
  }

  return {
    key,

    value: {
      ...ticker,

      exchange,

      market,

      previousPrice,

      direction,
    },
  };
}

function mergeMarketTickers(
  currentMarkets:
    Record<
      string,
      MarketViewModel
    >,

  tickers:
    readonly MarketTicker[],
): Record<
  string,
  MarketViewModel
> {
  let markets =
    currentMarkets;

  for (
    const ticker
    of tickers
  ) {
    const entry =
      createMarketEntry(
        markets,
        ticker,
      );

    if (
      entry ===
      null
    ) {
      continue;
    }

    if (
      markets ===
      currentMarkets
    ) {
      markets = {
        ...currentMarkets,
      };
    }

    markets[
      entry.key
    ] =
      entry.value;
  }

  return markets;
}
