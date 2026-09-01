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

    /*
     * The catalog/activity host is deliberately isolated from signed account
     * reads, but it is materially slower from the Mumbai runtime. The exact
     * action-time depth rescue has its own official Binance endpoint so it can
     * meet the bounded action-time fail-closed deadline without moving any
     * authenticated or order traffic.
     */
    ACTION_TIME_PUBLIC_BASE_URL:
      process.env.BINANCE_ACTION_TIME_PUBLIC_REST_BASE_URL?.trim() ??
      process.env.BINANCE_REST_BASE_URL?.trim() ??
      "https://api.binance.com",

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

    ORDER_BOOK:
  "/api/v3/depth",

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

  /*
   * Rebalancing execution (Strategy: Automated Capital Rebalancer).
   * UNIVERSAL_TRANSFER moves funds between wallet types on the SAME
   * account (e.g. MAIN -> UMFUTURE) - no withdrawal permission needed.
   * WITHDRAW/WITHDRAW_HISTORY/DEPOSIT_ADDRESS require the withdrawal
   * permission this codebase otherwise keeps off every other key; only
   * a key explicitly provisioned for the rebalancer should ever carry it.
   */
  UNIVERSAL_TRANSFER:
    "/sapi/v1/asset/transfer",

  WITHDRAW:
    "/sapi/v1/capital/withdraw/apply",

  WITHDRAW_HISTORY:
    "/sapi/v1/capital/withdraw/history",

  DEPOSIT_ADDRESS:
    "/sapi/v1/capital/deposit/address",

  ASSET_CONFIG:
    "/sapi/v1/capital/config/getall",

  WITHDRAW_ADDRESS_LIST:
    "/sapi/v1/capital/withdraw/address/list",
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

  /*
   * Public market-data protection only. These symbols stay subscribed when
   * activity ranking changes; this does not grant trading authority.
   */
  DEFAULT_PROTECTED_MARKETS: [
    "COTIUSDT",
  ],

  PUBLIC_REST_TIMEOUT_MS:
    30_000,

  ACTION_TIME_ORDER_BOOK_TIMEOUT_MS:
    250,

  CONNECTION_ACTIVITY_GRACE_MS:
    15_000,

  RECONNECT_DELAY:
    2_000,
} as const;
