"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const OpportunityService_1 = require("../arbitrage/services/OpportunityService");
const PaperTradingService_1 = require("../trading/services/PaperTradingService");
const router = (0, express_1.Router)();
router.get("/", (_request, response) => {
    const trades = PaperTradingService_1.paperTradingService.getTrades();
    response.json({
        success: true,
        count: trades.length,
        data: trades,
    });
});
router.get("/:id", (request, response) => {
    const trade = PaperTradingService_1.paperTradingService.getTrade(request.params.id);
    if (!trade) {
        response.status(404).json({
            success: false,
            message: "Paper trade not found.",
        });
        return;
    }
    response.json({
        success: true,
        data: trade,
    });
});
router.post("/", (request, response) => {
    try {
        const market = String(request.body?.market ?? "").toUpperCase();
        const buyExchange = String(request.body?.buyExchange ?? "").toLowerCase();
        const sellExchange = String(request.body?.sellExchange ?? "").toLowerCase();
        const capital = Number(request.body?.capital);
        const opportunity = OpportunityService_1.opportunityService
            .getOpportunities()
            .find((item) => item.pair.market === market &&
            item.pair.buy.exchange === buyExchange &&
            item.pair.sell.exchange === sellExchange);
        if (!opportunity) {
            response.status(404).json({
                success: false,
                message: "Matching live opportunity was not found.",
            });
            return;
        }
        const trade = PaperTradingService_1.paperTradingService.openTrade(opportunity, capital);
        response.status(201).json({
            success: true,
            data: trade,
        });
    }
    catch (error) {
        response.status(400).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Unable to create paper trade.",
        });
    }
});
exports.default = router;
//# sourceMappingURL=paperTrades.js.map