"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opportunityEngine = exports.OpportunityEngine = void 0;
const policy_1 = require("../config/policy");
const OpportunityEvaluator_1 = require("./OpportunityEvaluator");
class OpportunityEngine {
    evaluate(pair, policy = policy_1.defaultArbitragePolicy) {
        const evaluation = OpportunityEvaluator_1.opportunityEvaluator.evaluate(pair, policy);
        if (!evaluation) {
            return null;
        }
        const buyPrice = pair.buy.bestAskPrice;
        const sellPrice = pair.sell.bestBidPrice;
        const buyAvailableQty = pair.buy.bestAskQty;
        const sellAvailableQty = pair.sell.bestBidQty;
        if (buyPrice === null ||
            sellPrice === null ||
            buyAvailableQty === null ||
            sellAvailableQty === null ||
            !Number.isFinite(buyPrice) ||
            !Number.isFinite(sellPrice) ||
            !Number.isFinite(buyAvailableQty) ||
            !Number.isFinite(sellAvailableQty) ||
            buyPrice <= 0 ||
            sellPrice <= 0 ||
            buyAvailableQty <= 0 ||
            sellAvailableQty <= 0) {
            return null;
        }
        if (evaluation.rawSpreadPercent <
            policy.minimumSpreadPercent) {
            return null;
        }
        if (evaluation.netProfitPercent <
            policy.minimumNetProfitPercent) {
            return null;
        }
        const executableQty = Math.min(buyAvailableQty, sellAvailableQty);
        if (!Number.isFinite(executableQty) ||
            executableQty <= 0) {
            return null;
        }
        return {
            pair,
            buyPrice,
            sellPrice,
            buyAvailableQty,
            sellAvailableQty,
            executableQty,
            rawSpread: evaluation.rawSpread,
            rawSpreadPercent: evaluation.rawSpreadPercent,
            estimatedFees: evaluation.estimatedFees,
            netProfit: evaluation.netProfit,
            netProfitPercent: evaluation.netProfitPercent,
            usedLastPriceFallback: false,
            quotesAreFresh: evaluation.quotesAreFresh,
            score: 0,
            timestamp: Math.max(pair.buy.timestamp, pair.sell.timestamp),
        };
    }
}
exports.OpportunityEngine = OpportunityEngine;
exports.opportunityEngine = new OpportunityEngine();
//# sourceMappingURL=OpportunityEngine.js.map