import { BinanceAdapter } from "../exchanges/binance/BinanceAdapter";
import { BybitAdapter } from "../exchanges/bybit/BybitAdapter";

import { CoinDCXWebSocket } from "../exchanges/coindcx/websocket";
import { CoinDCXOrderBookAdapter } from "../exchanges/coindcx/CoinDCXOrderBookAdapter";

import { loadMarkets } from "../exchanges/coindcx/marketLoader";
import { marketRegistry } from "../exchanges/coindcx/registry";

import { exchangeManager } from "../exchanges/core/ExchangeManager";

class WebSocketManager {
  private initialized = false;
  private readonly coinDCXOrderBook =
    new CoinDCXOrderBookAdapter();

  async start(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    console.log(
      "[Manager] Starting Exchange Services...",
    );

    try {
      await this.bootstrapCoinDCXMarkets();
      await this.coinDCXOrderBook.connect();

      exchangeManager.register(
        new CoinDCXWebSocket(),
      );

      exchangeManager.register(
        new BinanceAdapter(),
      );

      exchangeManager.register(
        new BybitAdapter(),
      );

      await exchangeManager.connectAll();
    } catch (error) {
      this.initialized = false;

      console.error(
        "[Manager] Exchange service startup failed:",
        error,
      );

      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    console.log(
      "[Manager] Stopping Exchange Services...",
    );

    try {
      await exchangeManager.disconnectAll();
    } finally {
      marketRegistry.clear();
      this.initialized = false;
    }
  }

  private async bootstrapCoinDCXMarkets(): Promise<void> {
    console.log(
      "[CoinDCX] Loading active market metadata...",
    );

    const markets = await loadMarkets();

    marketRegistry.clear();
    marketRegistry.registerMany(markets);

    console.log(
      `[CoinDCX] Registered ${marketRegistry.size()} active markets.`,
    );

    if (marketRegistry.size() === 0) {
      throw new Error(
        "CoinDCX market registry is empty.",
      );
    }
  }
}

export const websocketManager =
  new WebSocketManager();