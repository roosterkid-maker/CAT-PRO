"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.websocketManager = void 0;
const BinanceAdapter_1 = require("../exchanges/binance/BinanceAdapter");
const BybitAdapter_1 = require("../exchanges/bybit/BybitAdapter");
const websocket_1 = require("../exchanges/coindcx/websocket");
const ExchangeManager_1 = require("../exchanges/core/ExchangeManager");
class WebSocketManager {
    initialized = false;
    async start() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        console.log("[Manager] Starting Exchange Services...");
        ExchangeManager_1.exchangeManager.register(new websocket_1.CoinDCXWebSocket());
        ExchangeManager_1.exchangeManager.register(new BinanceAdapter_1.BinanceAdapter());
        ExchangeManager_1.exchangeManager.register(new BybitAdapter_1.BybitAdapter());
        try {
            await ExchangeManager_1.exchangeManager.connectAll();
        }
        catch (error) {
            this.initialized = false;
            throw error;
        }
    }
    async stop() {
        if (!this.initialized) {
            return;
        }
        console.log("[Manager] Stopping Exchange Services...");
        await ExchangeManager_1.exchangeManager.disconnectAll();
        this.initialized = false;
    }
}
exports.websocketManager = new WebSocketManager();
//# sourceMappingURL=manager.js.map