"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tradeMonitorService = exports.TradeMonitorService = void 0;
const cache_service_1 = require("../../services/cache.service");
const execution_1 = require("../config/execution");
const PaperTradingService_1 = require("./PaperTradingService");
const PaperTradeStore_1 = require("./PaperTradeStore");
class TradeMonitorService {
    monitorOpenTrades() {
        const activeTrades = PaperTradeStore_1.paperTradeStore
            .getAll()
            .filter((trade) => trade.status === "open" ||
            trade.status === "monitoring");
        for (const trade of activeTrades) {
            const quote = cache_service_1.marketCache.get(trade.sellExchange, trade.market);
            if (!quote) {
                continue;
            }
            /*
             * Open arbitrage trade ko close karne ke liye
             * sell exchange ka executable best bid use hoga.
             */
            const currentPrice = quote.bestBidPrice;
            if (!quote.executable ||
                currentPrice === null ||
                !Number.isFinite(currentPrice) ||
                currentPrice <= 0) {
                continue;
            }
            /*
             * Current executable sell liquidity ko verify karo.
             * Agar complete paper-trade quantity top-of-book par
             * available nahi hai, trade ko abhi close nahi karte.
             */
            const availableSellQty = quote.bestBidQty;
            if (availableSellQty === null ||
                !Number.isFinite(availableSellQty) ||
                availableSellQty < trade.quantity) {
                continue;
            }
            const currentProfit = (currentPrice - trade.buyPrice) *
                trade.quantity -
                trade.estimatedFees;
            const currentProfitPercent = trade.capital > 0
                ? (currentProfit / trade.capital) * 100
                : 0;
            const highestProfit = Math.max(trade.highestProfit, currentProfit);
            const lowestProfit = Math.min(trade.lowestProfit, currentProfit);
            const now = Date.now();
            const targetReached = currentProfitPercent >=
                execution_1.defaultTradingExecutionConfig
                    .targetProfitPercent;
            if (targetReached) {
                PaperTradeStore_1.paperTradeStore.update(trade.id, {
                    status: "target-hit",
                    currentPrice,
                    currentProfit,
                    currentProfitPercent,
                    highestProfit,
                    lowestProfit,
                    lastUpdatedAt: now,
                });
                PaperTradingService_1.paperTradingService.closeTrade(trade.id, currentPrice, currentProfit, currentProfitPercent);
                console.log(`[TradeMonitor] Closed ${trade.market} at ${currentProfitPercent.toFixed(2)}% profit`);
                continue;
            }
            PaperTradeStore_1.paperTradeStore.update(trade.id, {
                status: "monitoring",
                currentPrice,
                currentProfit,
                currentProfitPercent,
                highestProfit,
                lowestProfit,
                lastUpdatedAt: now,
            });
        }
    }
}
exports.TradeMonitorService = TradeMonitorService;
exports.tradeMonitorService = new TradeMonitorService();
//# sourceMappingURL=TradeMonitorService.js.map