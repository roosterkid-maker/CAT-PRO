"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketRegistry = void 0;
class MarketRegistry {
    markets = new Map();
    register(symbol) {
        const clean = symbol.toUpperCase();
        if (clean.endsWith("USDT")) {
            this.markets.set(clean, {
                symbol: clean,
                base: clean.replace("USDT", ""),
                quote: "USDT"
            });
            return;
        }
        if (clean.endsWith("INR")) {
            this.markets.set(clean, {
                symbol: clean,
                base: clean.replace("INR", ""),
                quote: "INR"
            });
            return;
        }
    }
    get(symbol) {
        return this.markets.get(symbol.toUpperCase());
    }
    getAll() {
        return [...this.markets.values()];
    }
    size() {
        return this.markets.size;
    }
    clear() {
        this.markets.clear();
    }
}
exports.marketRegistry = new MarketRegistry();
//# sourceMappingURL=registry.js.map