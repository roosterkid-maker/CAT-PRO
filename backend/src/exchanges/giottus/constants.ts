export const GIOTTUS = {
  NAME:
    "giottus",

  REST: {
    BASE_URL:
      "https://api.giottus.com",

    WALLET_PATH:
      "/api/v1/wallet",
  },

  REQUEST_TIMEOUT_MS:
    10_000,

  AUTHENTICATED_READ_REFRESH_MS:
    20_000,

  RECEIVE_WINDOW_MS:
    5_000,

  AUTHENTICATED_USER_AGENT:
    "CAT-PRO/20.0",
} as const;
