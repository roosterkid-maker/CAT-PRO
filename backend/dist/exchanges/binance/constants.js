"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BINANCE = void 0;
exports.BINANCE = {
    NAME: "Binance",
    REST: {
        EXCHANGE_INFO: "https://api.binance.com/api/v3/exchangeInfo",
    },
    SOCKET: {
        URL: "wss://stream.binance.com:9443/ws",
    },
    QUOTE_ASSET: "USDT",
    SYMBOLS_PER_WORKER: 50,
    RECONNECT_DELAY: 2_000,
};
//# sourceMappingURL=constants.js.map