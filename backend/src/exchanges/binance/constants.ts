export const BINANCE = {
  NAME: "Binance",

  REST: {
    /*
     * Keep signed account reads on the authenticated API host while routing
     * public catalog/activity reads through Binance's dedicated market-data
     * service. This prevents a public feed recovery from depending on the
     * private REST endpoint or its regional/API-key policy.
     */
    BASE_URL:
      process.env.BINANCE_REST_BASE_URL?.trim() ??
      "https://api.binance.com",

    PUBLIC_BASE_URL:
      process.env.BINANCE_PUBLIC_REST_BASE_URL?.trim() ??
      "https://data-api.binance.vision",

    API_RESTRICTIONS:
      "/sapi/v1/account/apiRestrictions",


  TIME:
    "/api/v3/time",

    EXCHANGE_INFO:
      "/api/v3/exchangeInfo",

    TICKER_24HR:
    "/api/v3/ticker/24hr",

    TICKER_PRICE:
  "/api/v3/ticker/price",

  ACCOUNT:
    "/api/v3/account",

  ACCOUNT_COMMISSION:
    "/api/v3/account/commission",

  ORDER:
    "/api/v3/order",

  ORDER_TEST:
    "/api/v3/order/test",

  OPEN_ORDERS:
    "/api/v3/openOrders",
},

  SOCKET: {
    URL:
      process.env.BINANCE_PUBLIC_WEBSOCKET_URL?.trim() ??
      "wss://data-stream.binance.vision:443/ws",
  },

  DEPTH: {
    LEVELS: 20,

    UPDATE_SPEED: "100ms",
  },

  QUOTE_ASSET:
    "USDT",

  SECONDARY_QUOTE_ASSETS: [
    "BTC",
    "ETH",
    "USDC",
  ],

  SECONDARY_QUOTE_RESERVE_RATIO:
    0.2,

  SYMBOLS_PER_WORKER:
    50,

  DEFAULT_MAX_MARKETS:
    200,

  ABSOLUTE_MAX_MARKETS:
    400,

  PUBLIC_REST_TIMEOUT_MS:
    30_000,

  CONNECTION_ACTIVITY_GRACE_MS:
    15_000,

  RECONNECT_DELAY:
    2_000,
} as const;
