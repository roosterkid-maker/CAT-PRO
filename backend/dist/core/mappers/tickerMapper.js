"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tickerToExecutableQuote = tickerToExecutableQuote;
function tickerToExecutableQuote(ticker) {
    const bestBidPrice = ticker.bestBidPrice ?? ticker.bid;
    const bestAskPrice = ticker.bestAskPrice ?? ticker.ask;
    const spread = bestBidPrice !== null &&
        bestAskPrice !== null
        ? bestAskPrice - bestBidPrice
        : null;
    return {
        exchange: ticker.exchange,
        market: ticker.market,
        lastPrice: ticker.lastPrice,
        bestBidPrice,
        bestBidQty: ticker.bestBidQty ?? null,
        bestAskPrice,
        bestAskQty: ticker.bestAskQty ?? null,
        spread,
        timestamp: ticker.timestamp,
        source: bestBidPrice !== null &&
            bestAskPrice !== null
            ? "bookTicker"
            : "ticker",
        executable: bestBidPrice !== null &&
            bestAskPrice !== null,
    };
}
//# sourceMappingURL=tickerMapper.js.map