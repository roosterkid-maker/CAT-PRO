"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const OpportunityMapper_1 = require("../arbitrage/mappers/OpportunityMapper");
const OpportunityService_1 = require("../arbitrage/services/OpportunityService");
const router = (0, express_1.Router)();
router.get("/", (_request, response) => {
    const opportunities = OpportunityService_1.opportunityService.getOpportunities();
    const data = OpportunityMapper_1.opportunityMapper.toDtoList(opportunities);
    response.json({
        success: true,
        count: data.length,
        data,
    });
});
exports.default = router;
//# sourceMappingURL=opportunities.js.map