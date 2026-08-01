"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opportunityService = exports.OpportunityService = void 0;
const ComparisonEngine_1 = require("../ComparisonEngine");
const ExchangePairGenerator_1 = require("../engines/ExchangePairGenerator");
const OpportunityEngine_1 = require("../engines/OpportunityEngine");
const cache_service_1 = require("../../services/cache.service");
class OpportunityService {
    getOpportunities() {
        const snapshots = ComparisonEngine_1.comparisonEngine.groupByMarket(cache_service_1.marketCache.getAll());
        return snapshots
            .flatMap((snapshot) => ExchangePairGenerator_1.exchangePairGenerator.generate(snapshot))
            .map((pair) => OpportunityEngine_1.opportunityEngine.evaluate(pair))
            .filter((opportunity) => opportunity !== null)
            .sort((first, second) => second.netProfitPercent - first.netProfitPercent);
    }
}
exports.OpportunityService = OpportunityService;
exports.opportunityService = new OpportunityService();
//# sourceMappingURL=OpportunityService.js.map