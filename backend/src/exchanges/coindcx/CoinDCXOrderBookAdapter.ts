import { io, type Socket } from "socket.io-client";

import { marketCache } from "../../services/cache.service";
import { COINDCX } from "./constants";
import { loadMarkets } from "./marketLoader";
import { normalizeCoinDCXOrderBook } from "./orderBookNormalizer";
import type { CoinDCXOrderBookResponse } from "./orderBook.types";

export class CoinDCXOrderBookAdapter {
  private socket: Socket | null = null;

  private subscribed = false;

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(COINDCX.SOCKET.URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    this.socket.on("connect", async () => {
      console.log(
        "[CoinDCX] OrderBook Connected",
      );

      await this.subscribe();
    });

    this.socket.on(
      COINDCX.EVENTS.DEPTH_SNAPSHOT,
      (message: CoinDCXOrderBookResponse) =>
        this.handle(message),
    );

    this.socket.on(
      COINDCX.EVENTS.DEPTH_UPDATE,
      (message: CoinDCXOrderBookResponse) =>
        this.handle(message),
    );
  }

  private async subscribe(): Promise<void> {
    if (
      !this.socket ||
      !this.socket.connected ||
      this.subscribed
    ) {
      return;
    }

    const markets =
      await loadMarkets();

    const selectedMarkets =
      markets.slice(
        0,
        COINDCX.ORDER_BOOK.MAX_MARKETS,
      );

    for (const market of selectedMarkets) {
      this.socket.emit("join", {
        channelName: `${market.pair}@orderbook@${COINDCX.ORDER_BOOK.DEPTH}`,
      });
    }

    console.log(
      `[CoinDCX] Subscribed to ${selectedMarkets.length} order books`,
    );

    this.subscribed = true;
  }

  private handle(
    response: CoinDCXOrderBookResponse,
  ): void {
    try {
      const payload =
        typeof response.data === "string"
          ? JSON.parse(response.data)
          : response.data;

      if (!payload) {
        return;
      }

      const quote =
        normalizeCoinDCXOrderBook(
          payload,
        );

      if (!quote) {
        return;
      }

      marketCache.update(quote);
    } catch (error) {
      console.error(
        "[CoinDCX] OrderBook parse error",
        error,
      );
    }
  }
}