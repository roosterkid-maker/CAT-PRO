"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllMarkets = getAllMarkets;
exports.getInrMarkets = getInrMarkets;
exports.getUsdtMarkets = getUsdtMarkets;
const market_service_1 = require("../services/market.service");
async function getAllMarkets(_req, res) {
    try {
        const markets = await (0, market_service_1.fetchCoinDCXMarkets)();
        res.status(200).json({
            success: true,
            count: markets.length,
            data: markets,
        });
    }
    catch (error) {
        console.error("Market API error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch CoinDCX markets",
        });
    }
}
async function getInrMarkets(_req, res) {
    try {
        const markets = await (0, market_service_1.fetchMarketsByQuote)("INR");
        res.status(200).json({
            success: true,
            quoteCurrency: "INR",
            count: markets.length,
            data: markets,
        });
    }
    catch (error) {
        console.error("INR market API error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch INR markets",
        });
    }
}
async function getUsdtMarkets(_req, res) {
    try {
        const markets = await (0, market_service_1.fetchMarketsByQuote)("USDT");
        res.status(200).json({
            success: true,
            quoteCurrency: "USDT",
            count: markets.length,
            data: markets,
        });
    }
    catch (error) {
        console.error("USDT market API error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch USDT markets",
        });
    }
}
//# sourceMappingURL=market.controller.js.map