"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarkets = void 0;
const market_service_1 = require("../services/market.service");
const getMarkets = async (_req, res) => {
    try {
        const markets = await (0, market_service_1.fetchCoinDCXMarkets)();
        res.status(200).json({
            success: true,
            count: markets.length,
            data: markets,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to fetch CoinDCX market data",
        });
    }
};
exports.getMarkets = getMarkets;
//# sourceMappingURL=market.controller.js.map