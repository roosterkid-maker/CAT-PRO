"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opportunityMapper = exports.OpportunityMapper = void 0;
class OpportunityMapper {
    toDto(opportunity) {
        return {
            market: opportunity.pair.market,
            buyExchange: opportunity.pair.buy.exchange,
            buyPrice: opportunity.buyPrice,
            buyAvailableQty: opportunity.buyAvailableQty,
            sellExchange: opportunity.pair.sell.exchange,
            sellPrice: opportunity.sellPrice,
            sellAvailableQty: opportunity.sellAvailableQty,
            executableQty: opportunity.executableQty,
            rawSpread: opportunity.rawSpread,
            rawSpreadPercent: opportunity.rawSpreadPercent,
            estimatedFees: opportunity.estimatedFees,
            netProfit: opportunity.netProfit,
            netProfitPercent: opportunity.netProfitPercent,
            usedLastPriceFallback: false,
            quotesAreFresh: opportunity.quotesAreFresh,
            score: opportunity.score,
            timestamp: opportunity.timestamp,
        };
    }
    toDtoList(opportunities) {
        return opportunities.map((opportunity) => this.toDto(opportunity));
    }
}
exports.OpportunityMapper = OpportunityMapper;
exports.opportunityMapper = new OpportunityMapper();
//# sourceMappingURL=OpportunityMapper.js.map