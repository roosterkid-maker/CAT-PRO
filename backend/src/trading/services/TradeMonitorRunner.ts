import { tradeMonitorService } from "./TradeMonitorService";

class TradeMonitorRunner {
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    if (this.interval) {
      return;
    }

    console.log("[TradeMonitor] Started");

    this.interval = setInterval(() => {
      try {
        tradeMonitorService.monitorOpenTrades();
      } catch (error) {
        console.error(
          "[TradeMonitor] Monitoring error:",
          error,
        );
      }
    }, 1_000);
  }

  stop(): void {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;

    console.log("[TradeMonitor] Stopped");
  }
}

export const tradeMonitorRunner =
  new TradeMonitorRunner();