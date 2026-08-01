"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BYBIT = void 0;
exports.BYBIT = {
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
};
//# sourceMappingURL=constants.js.map