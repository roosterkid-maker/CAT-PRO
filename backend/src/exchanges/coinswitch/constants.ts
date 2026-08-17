export const COINSWITCH_PUBLIC_VENUES = [
  "coinswitchx",
  "c2c1",
] as const;

export type CoinSwitchPublicVenue =
  typeof COINSWITCH_PUBLIC_VENUES[number];

export const COINSWITCH = {
  NAME:
    "coinswitch",

  REST_BASE_URL:
    "https://coinswitch.co",

  REST: {
    SERVER_TIME_PATH:
      "/trade/api/v2/time",

    ALL_TICKERS_PATH:
      "/trade/api/v2/24hr/all-pairs/ticker",

    TRADING_FEE_PATH:
      "/trade/api/v2/tradingFee",

    TRADE_INFO_PATH:
      "/trade/api/v2/tradeInfo",

    VALIDATE_KEYS_PATH:
      "/trade/api/v2/validate/keys",

    PORTFOLIO_PATH:
      "/trade/api/v2/user/portfolio",

    ORDER_PATH:
      "/trade/api/v2/order",
  },

  SOCKET_BASE_URL:
    "https://ws.coinswitch.co",

  SOCKET_PATH:
    "/pro/realtime-rates-socket/spot",

  ORDER_BOOK_EVENT:
    "FETCH_ORDER_BOOK_CS_PRO",

  REQUEST_TIMEOUT_MS:
    10_000,

  SOCKET_CONNECT_TIMEOUT_MS:
    10_000,

  TICKER_REFRESH_MS:
    60_000,

  MINIMUM_TICKER_REFRESH_MS:
    30_000,

  MAXIMUM_SNAPSHOT_AGE_MS:
    15_000,

  MAXIMUM_FUTURE_SKEW_MS:
    5_000,

  MAXIMUM_PUBLISHED_DEPTH:
    50,

  DEFAULT_MAX_SUBSCRIBED_MARKETS:
    180,

  ABSOLUTE_MAX_SUBSCRIBED_MARKETS:
    250,

  PRIORITY_MARKETS: [
    "BTC_USDT",
    "ETH_USDT",
    "XRP_USDT",
    "BTC_INR",
    "ETH_INR",
    "USDT_INR",
  ],
} as const;
