export const GIOTTUS = {
  NAME:
    "giottus",

  REST: {
    BASE_URL:
      "https://api.giottus.com",

    TICKER_PATH:
      "/api/v1/public/exchange/ticker",

    SYMBOLS_PATH:
      "/api/v1/public/exchange/symbols",

    ORDER_BOOK_PATH:
      "/api/v1/public/market/orderbook",

    WALLET_PATH:
      "/api/v1/wallet",

    OPEN_ORDERS_PATH:
      "/api/v1/spot/orders/open",
  },

  REQUEST_TIMEOUT_MS:
    10_000,

  AUTHENTICATED_READ_REFRESH_MS:
    20_000,

  RECEIVE_WINDOW_MS:
    5_000,

  AUTHENTICATED_USER_AGENT:
    "CAT-PRO/20.0",

  MARKET_REFRESH_MS:
    60_000,

  ORDER_BOOK_REFRESH_MS:
    10_000,

  MINIMUM_RATE_LIMIT_COOLDOWN_MS:
    10_000,

  CONNECTION_STALE_MULTIPLIER:
    3,

  ORDER_BOOK_DEPTH:
    20,

  MAXIMUM_ACTIVE_MARKETS:
    8,

  ORDER_BOOK_CONCURRENCY:
    1,

  OBSERVATION_QUOTE_ASSETS: [
    "USDT",
    "INR",
  ],
} as const;
