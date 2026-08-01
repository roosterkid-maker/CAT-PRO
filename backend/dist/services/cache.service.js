"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketCache = void 0;
const tickerMapper_1 = require("../core/mappers/tickerMapper");
const server_1 = require("../socket/server");
class MarketCache {
    markets = new Map();
    update(input) {
        const quote = this.isExecutableQuote(input)
            ? this.normalizeExecutableQuote(input)
            : this.normalizeExecutableQuote((0, tickerMapper_1.tickerToExecutableQuote)(input));
        if (!quote) {
            return;
        }
        const key = this.createKey(quote.exchange, quote.market);
        const previousQuote = this.markets.get(key);
        const mergedQuote = this.mergeQuotes(previousQuote, quote);
        this.markets.set(key, mergedQuote);
        try {
            (0, server_1.getIO)().emit("ticker", mergedQuote);
        }
        catch {
            // Socket server may not be initialized yet.
        }
    }
    get(exchange, market) {
        return this.markets.get(this.createKey(exchange, market));
    }
    getAll() {
        return Array.from(this.markets.values());
    }
    getByExchange(exchange) {
        const normalizedExchange = exchange.trim().toLowerCase();
        return this.getAll().filter((quote) => quote.exchange ===
            normalizedExchange);
    }
    getExecutable() {
        return this.getAll().filter((quote) => quote.executable);
    }
    getExecutableByExchange(exchange) {
        return this.getByExchange(exchange).filter((quote) => quote.executable);
    }
    size() {
        return this.markets.size;
    }
    sizeByExchange(exchange) {
        return this.getByExchange(exchange).length;
    }
    executableSize() {
        return this.getExecutable().length;
    }
    clear() {
        this.markets.clear();
    }
    isExecutableQuote(input) {
        return ("source" in input &&
            "executable" in input);
    }
    normalizeExecutableQuote(incomingQuote) {
        const exchange = incomingQuote.exchange
            .trim()
            .toLowerCase();
        const market = incomingQuote.market
            .trim()
            .toUpperCase();
        if (!exchange || !market) {
            return null;
        }
        const lastPrice = this.getValidPositiveNumber(incomingQuote.lastPrice);
        const bestBidPrice = this.getValidPositiveNumber(incomingQuote.bestBidPrice);
        const bestAskPrice = this.getValidPositiveNumber(incomingQuote.bestAskPrice);
        const bestBidQty = this.getValidNonNegativeNumber(incomingQuote.bestBidQty);
        const bestAskQty = this.getValidNonNegativeNumber(incomingQuote.bestAskQty);
        const timestamp = Number.isFinite(incomingQuote.timestamp) &&
            incomingQuote.timestamp > 0
            ? incomingQuote.timestamp
            : Date.now();
        const spread = bestBidPrice !== null &&
            bestAskPrice !== null
            ? bestAskPrice -
                bestBidPrice
            : null;
        const executable = bestBidPrice !== null &&
            bestAskPrice !== null &&
            bestBidQty !== null &&
            bestAskQty !== null &&
            bestAskPrice >=
                bestBidPrice;
        return {
            exchange,
            market,
            lastPrice,
            bestBidPrice,
            bestBidQty,
            bestAskPrice,
            bestAskQty,
            spread,
            timestamp,
            source: incomingQuote.source,
            executable,
        };
    }
    mergeQuotes(previousQuote, incomingQuote) {
        if (!previousQuote) {
            return incomingQuote;
        }
        const bestBidPrice = incomingQuote.bestBidPrice ??
            previousQuote.bestBidPrice;
        const bestBidQty = incomingQuote.bestBidQty ??
            previousQuote.bestBidQty;
        const bestAskPrice = incomingQuote.bestAskPrice ??
            previousQuote.bestAskPrice;
        const bestAskQty = incomingQuote.bestAskQty ??
            previousQuote.bestAskQty;
        const spread = bestBidPrice !== null &&
            bestAskPrice !== null
            ? bestAskPrice -
                bestBidPrice
            : null;
        const executable = bestBidPrice !== null &&
            bestAskPrice !== null &&
            bestBidQty !== null &&
            bestAskQty !== null &&
            bestAskPrice >=
                bestBidPrice;
        return {
            exchange: incomingQuote.exchange,
            market: incomingQuote.market,
            lastPrice: incomingQuote.lastPrice ??
                previousQuote.lastPrice,
            bestBidPrice,
            bestBidQty,
            bestAskPrice,
            bestAskQty,
            spread,
            timestamp: incomingQuote.timestamp,
            source: incomingQuote.source,
            executable,
        };
    }
    createKey(exchange, market) {
        return `${exchange
            .trim()
            .toLowerCase()}:${market
            .trim()
            .toUpperCase()}`;
    }
    getValidPositiveNumber(value) {
        return value !== null &&
            Number.isFinite(value) &&
            value > 0
            ? value
            : null;
    }
    getValidNonNegativeNumber(value) {
        return value !== null &&
            Number.isFinite(value) &&
            value >= 0
            ? value
            : null;
    }
}
exports.marketCache = new MarketCache();
//# sourceMappingURL=cache.service.js.map