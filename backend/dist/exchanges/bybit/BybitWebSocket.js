"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BybitWebSocket = void 0;
const ws_1 = __importDefault(require("ws"));
const cache_service_1 = require("../../services/cache.service");
const normalize_1 = require("./normalize");
class BybitWebSocket {
    socket = null;
    url = "wss://stream.bybit.com/v5/public/spot";
    markets = [
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
        "XRPUSDT",
        "DOGEUSDT",
        "PEPEUSDT",
    ];
    connect() {
        return new Promise((resolve, reject) => {
            if (this.socket?.readyState === ws_1.default.OPEN ||
                this.socket?.readyState === ws_1.default.CONNECTING) {
                resolve();
                return;
            }
            this.socket = new ws_1.default(this.url);
            this.socket.once("open", () => {
                console.log("[Bybit] Connected");
                this.subscribe();
                resolve();
            });
            this.socket.once("error", (error) => {
                reject(error);
            });
            this.socket.on("message", (raw) => {
                this.handleMessage(raw.toString());
            });
            this.socket.on("close", (code, reason) => {
                console.log(`[Bybit] Disconnected: ${code} ${reason.toString()}`);
                this.socket = null;
            });
            this.socket.on("error", (error) => {
                console.error("[Bybit] WebSocket error:", error.message);
            });
        });
    }
    disconnect() {
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
    subscribe() {
        if (!this.socket ||
            this.socket.readyState !== ws_1.default.OPEN) {
            return;
        }
        this.socket.send(JSON.stringify({
            op: "subscribe",
            args: this.markets.map((market) => `tickers.${market}`),
        }));
    }
    handleMessage(message) {
        try {
            const parsed = JSON.parse(message);
            if (this.isSubscriptionResponse(parsed)) {
                console.log("[Bybit]", parsed.ret_msg ??
                    "Subscription acknowledged");
                return;
            }
            if (!this.isTickerMessage(parsed)) {
                return;
            }
            const ticker = (0, normalize_1.normalizeBybitTicker)(parsed);
            if (!ticker) {
                return;
            }
            cache_service_1.marketCache.update(ticker);
        }
        catch (error) {
            console.error("[Bybit] Invalid ticker payload:", error);
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
}
exports.BybitWebSocket = BybitWebSocket;
//# sourceMappingURL=BybitWebSocket.js.map