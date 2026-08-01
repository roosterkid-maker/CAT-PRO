"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paperTradeStore = exports.PaperTradeStore = void 0;
class PaperTradeStore {
    trades = new Map();
    create(trade) {
        if (this.trades.has(trade.id)) {
            throw new Error(`Paper trade already exists: ${trade.id}`);
        }
        this.trades.set(trade.id, trade);
        return trade;
    }
    getById(id) {
        return this.trades.get(id);
    }
    getAll() {
        return Array.from(this.trades.values()).sort((first, second) => second.openedAt - first.openedAt);
    }
    getByStatus(status) {
        return this.getAll().filter((trade) => trade.status === status);
    }
    update(id, changes) {
        const existingTrade = this.trades.get(id);
        if (!existingTrade) {
            return undefined;
        }
        const updatedTrade = {
            ...existingTrade,
            ...changes,
            id: existingTrade.id,
        };
        this.trades.set(id, updatedTrade);
        return updatedTrade;
    }
    countOpenTrades() {
        return this.countActiveTrades();
    }
    countActiveTrades() {
        return this.getAll().filter((trade) => trade.status === "validated" ||
            trade.status === "open" ||
            trade.status === "monitoring").length;
    }
    clear() {
        this.trades.clear();
    }
}
exports.PaperTradeStore = PaperTradeStore;
exports.paperTradeStore = new PaperTradeStore();
//# sourceMappingURL=PaperTradeStore.js.map