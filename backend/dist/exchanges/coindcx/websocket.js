"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoinDCXWebSocket = void 0;
const socket_io_client_1 = require("socket.io-client");
const cache_service_1 = require("../../services/cache.service");
const constants_1 = require("./constants");
class CoinDCXWebSocket {
    name = constants_1.COINDCX.NAME;
    socket = null;
    subscribed = false;
    markets = new Set();
    lastUpdate = 0;
    tickerCallback = null;
    async connect() {
        if (this.socket?.connected) {
            return;
        }
        this.socket = (0, socket_io_client_1.io)(constants_1.COINDCX.SOCKET.URL, {
            transports: ["websocket"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 2_000,
        });
        this.socket.on("connect", () => {
            console.log(`[${this.name}] Connected`);
            this.joinCurrentPricesChannel();
        });
        this.socket.on(constants_1.COINDCX.EVENTS.CURRENT_PRICES_UPDATE, (response) => {
            this.handleCurrentPrices(response);
        });
        this.socket.on("disconnect", (reason) => {
            this.subscribed = false;
            console.log(`[${this.name}] Disconnected: ${reason}`);
        });
        this.socket.on("connect_error", (error) => {
            console.error(`[${this.name}] Connection error: ${error.message}`);
        });
    }
    async disconnect() {
        if (!this.socket) {
            return;
        }
        if (this.subscribed) {
            this.socket.emit("leave", {
                channelName: constants_1.COINDCX.CHANNELS.CURRENT_PRICES,
            });
        }
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
        this.subscribed = false;
    }
    async subscribe(_markets) {
        this.joinCurrentPricesChannel();
    }
    async unsubscribe(_markets) {
        /*
         * Aggregate feed does not support
         * individual market unsubscription.
         */
    }
    isConnected() {
        return this.socket?.connected ?? false;
    }
    getMarketCount() {
        return this.markets.size;
    }
    getLastUpdate() {
        return this.lastUpdate;
    }
    onTicker(callback) {
        this.tickerCallback = callback;
    }
    joinCurrentPricesChannel() {
        if (!this.socket?.connected ||
            this.subscribed) {
            return;
        }
        this.socket.emit("join", {
            channelName: constants_1.COINDCX.CHANNELS.CURRENT_PRICES,
        });
        this.subscribed = true;
        console.log(`[${this.name}] Joined ${constants_1.COINDCX.CHANNELS.CURRENT_PRICES}`);
    }
    handleCurrentPrices(response) {
        try {
            const payload = typeof response.data === "string"
                ? JSON.parse(response.data)
                : response.data;
            if (!payload?.prices) {
                return;
            }
            const timestamp = payload.ts ?? Date.now();
            for (const [market, rawPrice] of Object.entries(payload.prices)) {
                const lastPrice = Number(rawPrice);
                if (!Number.isFinite(lastPrice) ||
                    lastPrice <= 0) {
                    continue;
                }
                const normalizedMarket = market.toUpperCase();
                const ticker = {
                    exchange: "coindcx",
                    market: normalizedMarket,
                    lastPrice,
                    bid: null,
                    ask: null,
                    bestBidPrice: null,
                    bestBidQty: null,
                    bestAskPrice: null,
                    bestAskQty: null,
                    spread: null,
                    timestamp,
                };
                this.markets.add(normalizedMarket);
                this.lastUpdate = timestamp;
                cache_service_1.marketCache.update(ticker);
                this.tickerCallback?.(ticker);
            }
        }
        catch (error) {
            console.error(`[${this.name}] Invalid current-prices payload:`, error);
        }
    }
}
exports.CoinDCXWebSocket = CoinDCXWebSocket;
//# sourceMappingURL=websocket.js.map