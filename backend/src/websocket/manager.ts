import { BinanceAdapter } from "../exchanges/binance/BinanceAdapter";
import { BybitAdapter } from "../exchanges/bybit/BybitAdapter";
import { CoinDCXWebSocket } from "../exchanges/coindcx/websocket";
import { exchangeManager } from "../exchanges/core/ExchangeManager";

class WebSocketManager {
  private initialized = false;

  async start(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    console.log("[Manager] Starting Exchange Services...");

    exchangeManager.register(new CoinDCXWebSocket());
    exchangeManager.register(new BinanceAdapter());
    exchangeManager.register(new BybitAdapter());

    try {
      await exchangeManager.connectAll();
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    console.log("[Manager] Stopping Exchange Services...");

    await exchangeManager.disconnectAll();

    this.initialized = false;
  }
}

export const websocketManager =
  new WebSocketManager();