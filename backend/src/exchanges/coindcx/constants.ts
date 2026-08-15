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

    /*
     * Controlled default for CoinDCX depth coverage.
     *
     * Runtime override:
     * COINDCX_ORDER_BOOK_MAX_MARKETS
     */
    DEFAULT_MAX_MARKETS: 120,

    /*
     * Hard safety ceiling. We scale gradually instead
     * of opening an unbounded number of order books.
     */
    ABSOLUTE_MAX_MARKETS: 300,

    /*
     * Join subscriptions in controlled batches.
     */
    SUBSCRIPTION_BATCH_SIZE: 10,
    SUBSCRIPTION_BATCH_DELAY_MS: 100,
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