"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCoinDCXMarkets = fetchCoinDCXMarkets;
exports.fetchMarketsByQuote = fetchMarketsByQuote;
const axios_1 = __importDefault(require("axios"));
const COINDCX_TICKER_URL = "https://api.coindcx.com/exchange/ticker";
async function fetchCoinDCXMarkets() {
    const response = await axios_1.default.get(COINDCX_TICKER_URL, {
        timeout: 10000,
    });
    return response.data;
}
async function fetchMarketsByQuote(quoteCurrency) {
    const markets = await fetchCoinDCXMarkets();
    const quote = quoteCurrency.toUpperCase();
    return markets.filter((market) => market.market.toUpperCase().endsWith(quote));
}
//# sourceMappingURL=market.service.js.map