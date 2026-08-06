export const BINANCE = {
  NAME: "Binance",

   REST: {
  BASE_URL:
    process.env.BINANCE_REST_BASE_URL?.trim() ??
    "https://api.binance.com",
    API_RESTRICTIONS:
  "/sapi/v1/account/apiRestrictions",

  TIME:
    "/api/v3/time",

  EXCHANGE_INFO:
    "https://api.binance.com/api/v3/exchangeInfo",

  ACCOUNT:
    "/api/v3/account",

  ORDER:
    "/api/v3/order",

  ORDER_TEST:
    "/api/v3/order/test",

  OPEN_ORDERS:
    "/api/v3/openOrders",
},

  SOCKET: {
    URL: "wss://stream.binance.com:9443/ws",
  },

  DEPTH: {
    LEVELS: 20,

    UPDATE_SPEED: "100ms",
  },

  QUOTE_ASSET:
    "USDT",

  SYMBOLS_PER_WORKER:
    50,

  RECONNECT_DELAY:
    2_000,
} as const;