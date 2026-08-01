"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opportunityEvaluator = exports.OpportunityEvaluator = void 0;
const fees_1 = require("../config/fees");
const QuoteFreshnessValidator_1 = require("./QuoteFreshnessValidator");
const QuotePriceResolver_1 = require("./QuotePriceResolver");
class OpportunityEvaluator {
    evaluate(pair, policy, now = Date.now()) {
        const buyQuoteIsFresh = QuoteFreshnessValidator_1.quoteFreshnessValidator.isFresh(pair.buy, policy.maximumQuoteAgeMs, now);
        const sellQuoteIsFresh = QuoteFreshnessValidator_1.quoteFreshnessValidator.isFresh(pair.sell, policy.maximumQuoteAgeMs, now);
        const quotesAreFresh = buyQuoteIsFresh && sellQuoteIsFresh;
        if (!quotesAreFresh) {
            return null;
        }
        const resolvedPrices = QuotePriceResolver_1.quotePriceResolver.resolve(pair.buy, pair.sell);
        if (!resolvedPrices) {
            return null;
        }
        const buyFeeConfig = fees_1.exchangeFees[pair.buy.exchange];
        const sellFeeConfig = fees_1.exchangeFees[pair.sell.exchange];
        if (!buyFeeConfig || !sellFeeConfig) {
            return null;
        }
        const rawSpread = resolvedPrices.sellPrice - resolvedPrices.buyPrice;
        const rawSpreadPercent = (rawSpread / resolvedPrices.buyPrice) * 100;
        const buyFeeAmount = resolvedPrices.buyPrice *
            (buyFeeConfig.takerPercent / 100);
        const sellFeeAmount = resolvedPrices.sellPrice *
            (sellFeeConfig.takerPercent / 100);
        const estimatedFees = buyFeeAmount + sellFeeAmount;
        const netProfit = rawSpread - estimatedFees;
        const netProfitPercent = (netProfit / resolvedPrices.buyPrice) * 100;
        return {
            rawSpread,
            rawSpreadPercent,
            estimatedFees,
            netProfit,
            netProfitPercent,
            usedLastPriceFallback: resolvedPrices.usedLastPriceFallback,
            quotesAreFresh,
        };
    }
}
exports.OpportunityEvaluator = OpportunityEvaluator;
exports.opportunityEvaluator = new OpportunityEvaluator();
//# sourceMappingURL=OpportunityEvaluator.js.map