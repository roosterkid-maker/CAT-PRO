import type { FeeRegistry } from "../models/FeeModel";

export const exchangeFees: FeeRegistry = {
  binance: {
    exchange: "binance",
    makerPercent: 0.1,
    takerPercent: 0.1,
  },

  coindcx: {
    exchange: "coindcx",
    makerPercent: 0.1,
    takerPercent: 0.1,
  },
};