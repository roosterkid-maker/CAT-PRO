export const UNOCOIN = {
  NAME:
    "unocoin",

  REST: {
    BASE_URL:
      "https://api.unocoin.com",

    PAIRS_PATH:
      "/api/v1/exchange/pairs",

    TICKERS_PATH:
      "/api/v1/exchange/tickers",

    ORDER_BOOK_PATH:
      "/api/v1/exchange/orderbook",

    ASSET_ORDER_BOOK_PATH:
      "/api/v1/asset/orderbook",

    BASE_COIN_SETTINGS_PATH:
      "/api/exchange/base-coin-settings",

    WALLET_PATH:
      "/api/wallet",
  },

  REQUEST_TIMEOUT_MS:
    10_000,

  TICKER_REFRESH_MS:
    60_000,

  MINIMUM_TICKER_REFRESH_MS:
    30_000,

  ORDER_BOOK_REFRESH_MS:
    3_000,

  MINIMUM_ORDER_BOOK_REFRESH_MS:
    1_000,

  MAXIMUM_CONCURRENT_BOOK_READS:
    4,

  ABSOLUTE_MAXIMUM_CONCURRENT_BOOK_READS:
    8,

  ORDER_BOOK_DEPTH:
    100,

  MAXIMUM_PUBLISHED_DEPTH:
    50,

  /*
   * UnoCoin's official exchange order/history contract serializes both
   * `rate` and `volume` with eight decimal places. Treat that published
   * representation as a precision ceiling only; it is not evidence of a
   * pair-specific tick or lot step, so the capability provider keeps both
   * step fields unknown.
   */
  EXCHANGE_DECIMAL_PRECISION:
    8,

  DEFAULT_MAX_ORDER_BOOK_MARKETS:
    12,

  ABSOLUTE_MAX_ORDER_BOOK_MARKETS:
    24,

  MAXIMUM_CONSECUTIVE_BOOK_FAILURES:
    3,

  CONNECTION_STALE_MULTIPLIER:
    3,

  PRIORITY_MARKETS: [
    "BTC_USDT",
    "ETH_USDT",
    "XRP_USDT",
    "BTC_INR",
    "ETH_INR",
    "USDT_INR",
  ],
} as const;
