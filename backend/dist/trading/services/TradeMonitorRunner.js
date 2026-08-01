"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tradeMonitorRunner = void 0;
const TradeMonitorService_1 = require("./TradeMonitorService");
class TradeMonitorRunner {
    interval = null;
    start() {
        if (this.interval) {
            return;
        }
        console.log("[TradeMonitor] Started");
        this.interval = setInterval(() => {
            try {
                TradeMonitorService_1.tradeMonitorService.monitorOpenTrades();
            }
            catch (error) {
                console.error("[TradeMonitor] Monitoring error:", error);
            }
        }, 1_000);
    }
    stop() {
        if (!this.interval) {
            return;
        }
        clearInterval(this.interval);
        this.interval = null;
        console.log("[TradeMonitor] Stopped");
    }
}
exports.tradeMonitorRunner = new TradeMonitorRunner();
//# sourceMappingURL=TradeMonitorRunner.js.map