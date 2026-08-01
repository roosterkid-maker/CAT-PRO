export const COINDCX = {
  NAME: "CoinDCX",

  REST: {
    BASE_URL: "https://api.coindcx.com",
    MARKETS: "/exchange/v1/markets_details",
  },

  SOCKET: {
    URL: "https://stream.coindcx.com",
  },

  ORDER_BOOK: {
    DEPTH: 20,
    MAX_MARKETS: 25,
  },

  CHANNELS: {
    CURRENT_PRICES: "currentPrices@spot@1s",
  },

  EVENTS: {
    CURRENT_PRICES_UPDATE:
      "currentPrices@spot#update",

    DEPTH_SNAPSHOT:
      "depth-snapshot",

    DEPTH_UPDATE:
      "depth-update",
  },
} as const;