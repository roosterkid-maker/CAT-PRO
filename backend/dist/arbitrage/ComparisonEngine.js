"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.comparisonEngine = exports.ComparisonEngine = void 0;
class ComparisonEngine {
    groupByMarket(quotes) {
        const snapshots = new Map();
        for (const incomingQuote of quotes) {
            const market = incomingQuote.market
                .trim()
                .toUpperCase();
            const exchange = incomingQuote.exchange
                .trim()
                .toLowerCase();
            if (!market || !exchange) {
                continue;
            }
            const quote = {
                exchange,
                market,
                lastPrice: incomingQuote.lastPrice,
                bestBidPrice: incomingQuote.bestBidPrice,
                bestBidQty: incomingQuote.bestBidQty,
                bestAskPrice: incomingQuote.bestAskPrice,
                bestAskQty: incomingQuote.bestAskQty,
                spread: incomingQuote.spread,
                timestamp: incomingQuote.timestamp,
                source: incomingQuote.source,
                executable: incomingQuote.executable,
            };
            const existing = snapshots.get(market);
            if (existing) {
                existing.quotes[exchange] =
                    quote;
                existing.timestamp = Math.max(existing.timestamp, quote.timestamp);
                continue;
            }
            snapshots.set(market, {
                market,
                quotes: {
                    [exchange]: quote,
                },
                timestamp: quote.timestamp,
            });
        }
        return Array.from(snapshots.values());
    }
}
exports.ComparisonEngine = ComparisonEngine;
exports.comparisonEngine = new ComparisonEngine();
//# sourceMappingURL=ComparisonEngine.js.map