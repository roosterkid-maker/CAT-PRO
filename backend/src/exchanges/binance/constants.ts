export const BINANCE = {
  NAME: "Binance",

  REST: {
    EXCHANGE_INFO:
      "https://api.binance.com/api/v3/exchangeInfo",
  },

  SOCKET: {
    URL: "wss://stream.binance.com:9443/ws",
  },
  
  DEPTH: {
  LEVELS: 20,

  UPDATE_SPEED: "100ms",
},

  QUOTE_ASSET: "USDT",

  SYMBOLS_PER_WORKER: 50,

  RECONNECT_DELAY: 2_000,
} as const;