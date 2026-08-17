export const BYBIT = {
  NAME: "Bybit",

  SOCKET: {
    URL: "wss://stream.bybit.com/v5/public/spot",
  },

  RECONNECT_DELAY: 2_000,

  SYMBOLS: [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "PEPEUSDT",
  ],
} as const;