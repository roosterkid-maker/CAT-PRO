"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ComparisonEngine_1 = require("../arbitrage/ComparisonEngine");
const cache_service_1 = require("../services/cache.service");
const router = (0, express_1.Router)();
router.get("/", (_request, response) => {
    const snapshots = ComparisonEngine_1.comparisonEngine
        .groupByMarket(cache_service_1.marketCache.getAll())
        .filter((snapshot) => Object.keys(snapshot.quotes).length >= 2);
    response.json({
        success: true,
        count: snapshots.length,
        data: snapshots,
    });
});
exports.default = router;
//# sourceMappingURL=comparison.js.map