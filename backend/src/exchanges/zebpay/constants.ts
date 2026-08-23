export const ZEBPAY = {
  NAME:
    "zebpay",

  REST: {
    BASE_URL:
      "https://www.zebapi.com",

    MARKETS_PATH:
      "/api/v1/market",

    TRADE_PAIRS_PATH:
      "/api/v1/tradepairs/IN",

    ORDER_BOOK_PATH_PREFIX:
      "/api/v1/market",

    WALLET_BALANCE_PATH:
      "/api/v1/wallet/balance",

    TRADE_FEES_PATH_PREFIX:
      "/api/v1/tradefees",

    ORDERS_PATH:
      "/api/v1/orders",

    ORDER_BALANCE_PATH:
      "/api/v1/orders/balance",
  },

  WEBSOCKET: {
    PUBLIC_URL:
      "wss://socket.zebapi.com/api/v1/websocket/public",

    MAXIMUM_ACTIVE_MARKETS:
      24,

    RECONNECT_DELAY_MS:
      2_000,

    PING_INTERVAL_MS:
      20_000,
  },

  REQUEST_TIMEOUT_MS:
    10_000,

  MARKET_REFRESH_MS:
    60_000,

  AUTHENTICATED_READ_REFRESH_MS:
    20_000,

  ACCOUNT_FEE_REFRESH_MS:
    5 * 60_000,

  ACCOUNT_FEE_TTL_MS:
    10 * 60_000,

  TRADE_PAIR_REFRESH_MS:
    5 * 60_000,

  ORDER_BOOK_BOOTSTRAP_CONCURRENCY:
    4,

  AUTHENTICATED_USER_AGENT:
    "CAT-PRO/1.0",

  REFERENCE_FEE_MARKET:
    "BTC-INR",

  CONNECTION_STALE_MULTIPLIER:
    3,

  OBSERVATION_QUOTE_ASSETS: [
    "INR",
    "USDT",
  ],
} as const;
