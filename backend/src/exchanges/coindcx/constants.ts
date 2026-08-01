export const COINDCX = {
  NAME: "CoinDCX",

  REST: {
    BASE_URL: "https://api.coindcx.com",
    MARKETS: "/exchange/v1/markets_details",
  },

  SOCKET: {
    URL: "https://stream.coindcx.com",
  },

  CHANNELS: {
    CURRENT_PRICES: "currentPrices@spot@1s",
  },

  EVENTS: {
    CURRENT_PRICES_UPDATE: "currentPrices@spot#update",
  },
} as const;