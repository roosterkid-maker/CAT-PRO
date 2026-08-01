"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTicker = parseTicker;
function parseTicker(data) {
    const bestBidPrice = data.bid !== undefined
        ? Number(data.bid)
        : null;
    const bestAskPrice = data.ask !== undefined
        ? Number(data.ask)
        : null;
    const spread = bestBidPrice !== null &&
        bestAskPrice !== null &&
        Number.isFinite(bestBidPrice) &&
        Number.isFinite(bestAskPrice)
        ? bestAskPrice - bestBidPrice
        : null;
    return {
        exchange: "coindcx",
        market: (data.market ??
            data.symbol ??
            data.pair ??
            "").toUpperCase(),
        lastPrice: Number(data.last_price ??
            data.price ??
            0),
        // Backward compatibility
        bid: bestBidPrice,
        ask: bestAskPrice,
        // Executable quote fields
        bestBidPrice,
        bestBidQty: data.bid_qty !== undefined
            ? Number(data.bid_qty)
            : null,
        bestAskPrice,
        bestAskQty: data.ask_qty !== undefined
            ? Number(data.ask_qty)
            : null,
        spread,
        timestamp: data.timestamp ??
            Date.now(),
    };
}
//# sourceMappingURL=parser.js.map