"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketWorker = void 0;
const ws_1 = __importDefault(require("ws"));
class SocketWorker {
    config;
    socket = null;
    connected = false;
    reconnectTimer = null;
    manuallyClosed = false;
    constructor(config) {
        this.config = config;
    }
    connect() {
        if (this.socket?.readyState === ws_1.default.OPEN ||
            this.socket?.readyState ===
                ws_1.default.CONNECTING) {
            return;
        }
        this.manuallyClosed = false;
        this.socket = new ws_1.default(this.config.url);
        this.socket.on("open", () => {
            this.connected = true;
            console.log(`[${this.config.name}] Connected`);
            this.config.onOpen?.(this);
        });
        this.socket.on("message", (rawData) => {
            this.config.onMessage?.(this, rawData.toString());
        });
        this.socket.on("close", (code, reason) => {
            this.connected = false;
            console.log(`[${this.config.name}] Closed: ${code}`);
            this.config.onClose?.(this, code, reason.toString());
            if (!this.manuallyClosed) {
                this.scheduleReconnect();
            }
        });
        this.socket.on("error", (error) => {
            this.config.onError?.(this, error);
        });
    }
    disconnect() {
        this.manuallyClosed = true;
        this.connected = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.socket?.close();
        this.socket = null;
    }
    send(data) {
        if (!this.socket ||
            this.socket.readyState !==
                ws_1.default.OPEN) {
            return;
        }
        this.socket.send(JSON.stringify(data));
    }
    isConnected() {
        return this.connected;
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.config.reconnectDelay);
    }
}
exports.SocketWorker = SocketWorker;
//# sourceMappingURL=SocketWorker.js.map