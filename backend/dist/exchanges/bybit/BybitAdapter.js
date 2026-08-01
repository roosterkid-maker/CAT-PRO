"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BybitAdapter = void 0;
const ws_1 = __importDefault(require("ws"));
const cache_service_1 = require("../../services/cache.service");
const constants_1 = require("./constants");
const normalize_1 = require("./normalize");
class BybitAdapter {
    name = constants_1.BYBIT.NAME;
    socket = null;
    connected = false;
    reconnectTimer = null;
    manuallyDisconnected = false;
    markets = new Set();
    lastUpdate = 0;
    tickerCallback = null;
    url = constants_1.BYBIT.SOCKET.URL;
    symbols = [...constants_1.BYBIT.SYMBOLS];
    rawTickerLogged = false;
    async connect() {
        if (this.socket?.readyState === ws_1.default.OPEN ||
            this.socket?.readyState === ws_1.default.CONNECTING) {
            return;
        }
        this.manuallyDisconnected = false;
        this.rawTickerLogged = false;
        this.socket = new ws_1.default(this.url);
        this.socket.on("open", () => {
            this.connected = true;
            console.log(`[${this.name}] Connected`);
            void this.subscribe([]);
        });
        this.socket.on("message", (rawData) => {
            this.handleMessage(rawData.toString());
        });
        this.socket.on("close", (code, reason) => {
            this.connected = false;
            this.socket = null;
            console.log(`[${this.name}] Disconnected: ${code} ${reason.toString()}`);
            if (!this.manuallyDisconnected) {
                this.scheduleReconnect();
            }
        });
        this.socket.on("error", (error) => {
            console.error(`[${this.name}] WebSocket error:`, error.message);
        });
    }
    async disconnect() {
        this.manuallyDisconnected = true;
        this.connected = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (!this.socket) {
            return;
        }
        const socket = this.socket;
        this.socket = null;
        socket.removeAllListeners();
        if (socket.readyState === ws_1.default.OPEN ||
            socket.readyState === ws_1.default.CONNECTING) {
            socket.close();
        }
    }
    async subscribe(markets) {
        if (!this.socket ||
            this.socket.readyState !== ws_1.default.OPEN) {
            return;
        }
        const symbols = markets.length > 0
            ? markets
            : this.symbols;
        this.socket.send(JSON.stringify({
            op: "subscribe",
            args: symbols.map((symbol) => `tickers.${symbol.toUpperCase()}`),
        }));
    }
    async unsubscribe(markets) {
        if (!this.socket ||
            this.socket.readyState !== ws_1.default.OPEN ||
            markets.length === 0) {
            return;
        }
        this.socket.send(JSON.stringify({
            op: "unsubscribe",
            args: markets.map((symbol) => `tickers.${symbol.toUpperCase()}`),
        }));
    }
    isConnected() {
        return this.connected;
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
    handleMessage(rawMessage) {
        try {
            const parsed = JSON.parse(rawMessage);
            if (this.isSubscriptionResponse(parsed)) {
                console.log(`[${this.name}] ${parsed.ret_msg ??
                    "Subscription acknowledged"}`);
                return;
            }
            if (!this.isTickerMessage(parsed)) {
                return;
            }
            if (!this.rawTickerLogged) {
                console.log("[Bybit RAW TICKER]", JSON.stringify(parsed, null, 2));
                this.rawTickerLogged = true;
            }
            const ticker = (0, normalize_1.normalizeBybitTicker)(parsed);
            if (!ticker) {
                return;
            }
            this.markets.add(ticker.market);
            this.lastUpdate = ticker.timestamp;
            cache_service_1.marketCache.update(ticker);
            this.tickerCallback?.(ticker);
        }
        catch (error) {
            console.error(`[${this.name}] Invalid ticker payload:`, error);
        }
    }
    isSubscriptionResponse(message) {
        return (typeof message === "object" &&
            message !== null &&
            "op" in message &&
            !("topic" in message));
    }
    isTickerMessage(message) {
        return (typeof message === "object" &&
            message !== null &&
            "topic" in message &&
            typeof message.topic === "string" &&
            "data" in message);
    }
    scheduleReconnect() {
        if (this.reconnectTimer ||
            this.manuallyDisconnected) {
            return;
        }
        console.log(`[${this.name}] Reconnecting in ${constants_1.BYBIT.RECONNECT_DELAY}ms...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect().catch((error) => {
                console.error(`[${this.name}] Reconnection failed:`, error);
                this.scheduleReconnect();
            });
        }, constants_1.BYBIT.RECONNECT_DELAY);
    }
}
exports.BybitAdapter = BybitAdapter;
//# sourceMappingURL=BybitAdapter.js.map