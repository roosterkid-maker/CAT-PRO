"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultArbitragePolicy = void 0;
exports.defaultArbitragePolicy = {
    minimumSpreadPercent: 0.2,
    minimumNetProfitPercent: 0.05,
    maximumQuoteAgeMs: 5_000,
    minimumExchangeCount: 2,
    /*
     * Development mode:
     * CoinDCX/Binance feeds me abhi bid/ask null hain,
     * isliye lastPrice fallback temporarily allowed hai.
     *
     * Real execution mode me ise false karna hoga.
     */
    allowLastPriceFallback: true,
};
//# sourceMappingURL=policy.js.map