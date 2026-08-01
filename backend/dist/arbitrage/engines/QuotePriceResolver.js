"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotePriceResolver = exports.QuotePriceResolver = void 0;
class QuotePriceResolver {
    resolve(buyQuote, sellQuote) {
        const buyPrice = buyQuote.bestAskPrice;
        const sellPrice = sellQuote.bestBidPrice;
        if (!buyQuote.executable ||
            !sellQuote.executable ||
            buyPrice === null ||
            sellPrice === null ||
            !Number.isFinite(buyPrice) ||
            !Number.isFinite(sellPrice) ||
            buyPrice <= 0 ||
            sellPrice <= 0) {
            return null;
        }
        return {
            buyPrice,
            sellPrice,
            usedLastPriceFallback: false,
        };
    }
}
exports.QuotePriceResolver = QuotePriceResolver;
exports.quotePriceResolver = new QuotePriceResolver();
//# sourceMappingURL=QuotePriceResolver.js.map