import type { FeeRegistry } from "../models/FeeModel";

export const exchangeFees: FeeRegistry = {
  coindcx: {
    exchange: "coindcx",

    makerPercent: 0.10,
    takerPercent: 0.10,
  },

  binance: {
    exchange: "binance",

    makerPercent: 0.10,
    takerPercent: 0.10,
  },

  bybit: {
    exchange: "bybit",

    makerPercent: 0.10,
    takerPercent: 0.10,
  },

  kucoin: {
    exchange: "kucoin",

    makerPercent: 0.10,
    takerPercent: 0.10,
  },

  okx: {
    exchange: "okx",

    makerPercent: 0.08,
    takerPercent: 0.10,
  },

  gate: {
    exchange: "gate",

    makerPercent: 0.20,
    takerPercent: 0.20,
  },
};

export function getExchangeFees(
  exchange: string,
) {
  const normalized =
    exchange
      .trim()
      .toLowerCase();

  const fees =
    exchangeFees[normalized];

  if (!fees) {
    throw new Error(
      `Fee configuration not found for exchange: ${exchange}`,
    );
  }

  return fees;
}