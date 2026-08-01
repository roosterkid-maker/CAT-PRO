"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const comparison_1 = __importDefault(require("./routes/comparison"));
const live_1 = __importDefault(require("./routes/live"));
const opportunities_1 = __importDefault(require("./routes/opportunities"));
const paperTrades_1 = __importDefault(require("./routes/paperTrades"));
const spreads_1 = __importDefault(require("./routes/spreads"));
const systemHealth_1 = __importDefault(require("./routes/systemHealth"));
const server_1 = require("./socket/server");
const TradeMonitorRunner_1 = require("./trading/services/TradeMonitorRunner");
const manager_1 = require("./websocket/manager");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/", (_request, response) => {
    response.send("Crypto Arbitrage Server Running");
});
app.use("/api/live", live_1.default);
app.use("/api/comparison", comparison_1.default);
app.use("/api/spreads", spreads_1.default);
app.use("/api/opportunities", opportunities_1.default);
app.use("/api/system-health", systemHealth_1.default);
app.use("/api/paper-trades", paperTrades_1.default);
const server = node_http_1.default.createServer(app);
(0, server_1.initializeSocket)(server);
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    void manager_1.websocketManager.start().catch((error) => {
        console.error("[Server] Failed to start exchange services:", error);
    });
    TradeMonitorRunner_1.tradeMonitorRunner.start();
});
async function shutdown(signal) {
    console.log(`[Server] ${signal} received. Shutting down...`);
    TradeMonitorRunner_1.tradeMonitorRunner.stop();
    try {
        await manager_1.websocketManager.stop();
    }
    catch (error) {
        console.error("[Server] Exchange shutdown error:", error);
    }
    server.close((error) => {
        if (error) {
            console.error("[Server] HTTP shutdown error:", error);
            process.exit(1);
        }
        console.log("[Server] Shutdown complete");
        process.exit(0);
    });
}
process.on("SIGINT", () => {
    void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});
//# sourceMappingURL=server.js.map