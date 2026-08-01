import { create } from "zustand";

import type { MarketViewModel } from "@/modules/market/types/MarketViewModel";
import type { MarketTicker } from "@/types/market";

interface MarketState {
  markets: Record<string, MarketViewModel>;

  updateTicker: (ticker: MarketTicker) => void;

  clear: () => void;
}

export const useMarketStore =
  create<MarketState>((set) => ({
    markets: {},

    updateTicker: (ticker) =>
      set((state) => {
        const key = `${ticker.exchange}:${ticker.market}`;

        const current =
          state.markets[key];

        const previousPrice =
          current?.lastPrice ??
          ticker.lastPrice ??
          0;

        const currentPrice =
          ticker.lastPrice ?? 0;

        let direction:
          | "up"
          | "down"
          | "none" = "none";

        if (currentPrice > previousPrice) {
          direction = "up";
        } else if (
          currentPrice < previousPrice
        ) {
          direction = "down";
        }

        return {
          markets: {
            ...state.markets,

            [key]: {
              ...ticker,

              previousPrice,

              direction,
            },
          },
        };
      }),

    clear: () =>
      set({
        markets: {},
      }),
  }));