"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangePairGenerator = exports.ExchangePairGenerator = void 0;
class ExchangePairGenerator {
    generate(snapshot) {
        const quotes = Object.values(snapshot.quotes);
        const pairs = [];
        for (let buyIndex = 0; buyIndex < quotes.length; buyIndex++) {
            for (let sellIndex = 0; sellIndex < quotes.length; sellIndex++) {
                if (buyIndex === sellIndex) {
                    continue;
                }
                const buy = quotes[buyIndex];
                const sell = quotes[sellIndex];
                if (!this.isExecutableBuyQuote(buy) ||
                    !this.isExecutableSellQuote(sell)) {
                    continue;
                }
                if (buy.exchange === sell.exchange) {
                    continue;
                }
                pairs.push({
                    market: snapshot.market,
                    buy,
                    sell,
                });
            }
        }
        return pairs;
    }
    isExecutableBuyQuote(quote) {
        return Boolean(quote &&
            quote.executable &&
            Number.isFinite(quote.bestAskPrice) &&
            quote.bestAskPrice > 0 &&
            Number.isFinite(quote.bestAskQty) &&
            quote.bestAskQty > 0);
    }
    isExecutableSellQuote(quote) {
        return Boolean(quote &&
            quote.executable &&
            Number.isFinite(quote.bestBidPrice) &&
            quote.bestBidPrice > 0 &&
            Number.isFinite(quote.bestBidQty) &&
            quote.bestBidQty > 0);
    }
}
exports.ExchangePairGenerator = ExchangePairGenerator;
exports.exchangePairGenerator = new ExchangePairGenerator();
//# sourceMappingURL=ExchangePairGenerator.js.map