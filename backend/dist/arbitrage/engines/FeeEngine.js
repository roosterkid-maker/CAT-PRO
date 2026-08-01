"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feeEngine = exports.FeeEngine = void 0;
const fees_1 = require("../config/fees");
class FeeEngine {
    apply(opportunity) {
        const buyFeeConfig = fees_1.exchangeFees[opportunity.pair.buy.exchange];
        const sellFeeConfig = fees_1.exchangeFees[opportunity.pair.sell.exchange];
        if (!buyFeeConfig ||
            !sellFeeConfig) {
            return null;
        }
        const buyPrice = opportunity.buyPrice;
        const sellPrice = opportunity.sellPrice;
        if (!Number.isFinite(buyPrice) ||
            !Number.isFinite(sellPrice) ||
            buyPrice <= 0 ||
            sellPrice <= 0) {
            return null;
        }
        const buyFeeAmount = buyPrice *
            (buyFeeConfig.takerPercent / 100);
        const sellFeeAmount = sellPrice *
            (sellFeeConfig.takerPercent / 100);
        const estimatedFees = buyFeeAmount + sellFeeAmount;
        const netProfit = opportunity.rawSpread -
            estimatedFees;
        const netProfitPercent = (netProfit / buyPrice) * 100;
        return {
            ...opportunity,
            estimatedFees,
            netProfit,
            netProfitPercent,
        };
    }
}
exports.FeeEngine = FeeEngine;
exports.feeEngine = new FeeEngine();
//# sourceMappingURL=FeeEngine.js.map