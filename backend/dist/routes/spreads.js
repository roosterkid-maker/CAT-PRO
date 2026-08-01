"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ComparisonEngine_1 = require("../arbitrage/ComparisonEngine");
const ExchangePairGenerator_1 = require("../arbitrage/engines/ExchangePairGenerator");
const FeeEngine_1 = require("../arbitrage/engines/FeeEngine");
const SpreadEngine_1 = require("../arbitrage/SpreadEngine");
const cache_service_1 = require("../services/cache.service");
const router = (0, express_1.Router)();
router.get("/", (_request, response) => {
    const snapshots = ComparisonEngine_1.comparisonEngine.groupByMarket(cache_service_1.marketCache.getAll());
    const opportunities = snapshots.flatMap((snapshot) => {
        const pairs = ExchangePairGenerator_1.exchangePairGenerator.generate(snapshot);
        return pairs
            .map((pair) => SpreadEngine_1.spreadEngine.calculate(pair))
            .filter((opportunity) => opportunity !== null)
            .map((opportunity) => FeeEngine_1.feeEngine.apply(opportunity))
            .filter((opportunity) => opportunity !== null);
    });
    response.json({
        success: true,
        count: opportunities.length,
        data: opportunities,
    });
});
exports.default = router;
//# sourceMappingURL=spreads.js.map