"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMarkets = loadMarkets;
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("./constants");
async function loadMarkets() {
    const url = constants_1.COINDCX.REST.BASE_URL + constants_1.COINDCX.REST.MARKETS;
    const response = await axios_1.default.get(url, {
        timeout: 10_000,
    });
    return response.data
        .filter((market) => market.status === "active")
        .filter((market) => Boolean(market.symbol && market.pair))
        .map((market) => ({
        symbol: market.symbol.toUpperCase(),
        pair: market.pair.toUpperCase(),
        baseCurrency: market.base_currency_short_name.toUpperCase(),
        quoteCurrency: market.target_currency_short_name.toUpperCase(),
    }));
}
//# sourceMappingURL=marketLoader.js.map