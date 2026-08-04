import {
  io,
  type Socket,
} from "socket.io-client";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import { COINDCX } from "./constants";
import { loadMarkets } from "./marketLoader";

import {
  normalizeCoinDCXFullOrderBook,
  normalizeCoinDCXOrderBook,
} from "./orderBookNormalizer";

import type {
  CoinDCXOrderBookResponse,
} from "./orderBook.types";

export class CoinDCXOrderBookAdapter {
  private socket:
    | Socket
    | null = null;

  private subscribed = false;

  private readonly subscribedChannels =
    new Set<string>();

  private updateCount = 0;

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(
      COINDCX.SOCKET.URL,
      {
        transports: [
          "websocket",
        ],

        reconnection: true,

        reconnectionAttempts:
          Infinity,

        reconnectionDelay:
          2_000,
      },
    );

    this.socket.on(
      "connect",
      () => {
        console.log(
          "[CoinDCX] OrderBook Connected",
        );

        this.subscribed = false;
        this.subscribedChannels.clear();

        void this.subscribe();
      },
    );

    this.socket.on(
      COINDCX.EVENTS
        .DEPTH_SNAPSHOT,
      (
        message:
          CoinDCXOrderBookResponse,
      ) => {
        this.handle(message);
      },
    );

    this.socket.on(
      COINDCX.EVENTS
        .DEPTH_UPDATE,
      (
        message:
          CoinDCXOrderBookResponse,
      ) => {
        this.handle(message);
      },
    );

    this.socket.on(
      "disconnect",
      (reason) => {
        this.subscribed = false;

        this.subscribedChannels.clear();

        console.log(
          `[CoinDCX] OrderBook Disconnected: ${reason}`,
        );
      },
    );

    this.socket.on(
      "connect_error",
      (error: Error) => {
        console.error(
          `[CoinDCX] OrderBook connection error: ${error.message}`,
        );
      },
    );
  }

  async disconnect(): Promise<void> {
    if (!this.socket) {
      return;
    }

    for (
      const channelName
      of this.subscribedChannels
    ) {
      this.socket.emit(
        "leave",
        {
          channelName,
        },
      );
    }

    this.socket.removeAllListeners();

    this.socket.disconnect();

    this.socket = null;

    this.subscribed = false;

    this.subscribedChannels.clear();
  }

  isConnected(): boolean {
    return (
      this.socket?.connected ??
      false
    );
  }

  getSubscribedMarketCount(): number {
    return this
      .subscribedChannels
      .size;
  }

  private async subscribe():
  Promise<void> {
    if (
      !this.socket?.connected ||
      this.subscribed
    ) {
      return;
    }

    try {
      const markets =
        await loadMarkets();

      const selectedMarkets =
        markets.slice(
          0,
          COINDCX.ORDER_BOOK
            .MAX_MARKETS,
        );

      for (
        const market
        of selectedMarkets
      ) {
        const channelName =
          `${market.pair}@orderbook@${COINDCX.ORDER_BOOK.DEPTH}`;

        this.socket.emit(
          "join",
          {
            channelName,
          },
        );

        this.subscribedChannels.add(
          channelName,
        );
      }

      this.subscribed = true;

      console.log(
        `[CoinDCX] Subscribed to ${selectedMarkets.length} order books`,
      );
    } catch (error) {
      this.subscribed = false;

      console.error(
        "[CoinDCX] Unable to subscribe to order books:",
        error,
      );
    }
  }

  private handle(
    response:
      CoinDCXOrderBookResponse,
  ): void {
    try {
      const payload =
        typeof response.data ===
        "string"
          ? JSON.parse(
              response.data,
            )
          : response.data;

      if (!payload) {
        return;
      }

      /*
       * Preserve the existing top-of-book
       * flow used by the opportunity engine.
       */
      const executableQuote =
        normalizeCoinDCXOrderBook(
          payload,
        );

      if (executableQuote) {
        marketCache.update(
          executableQuote,
        );
      }

      /*
       * Store the complete normalized depth
       * for VWAP and execution simulation.
       */
      const fullOrderBook =
        normalizeCoinDCXFullOrderBook(
          payload,
        );

      if (!fullOrderBook) {
        return;
      }

      orderBookService.update(
        fullOrderBook,
      );

      this.updateCount += 1;

      /*
       * Controlled diagnostic logging:
       * first update and every 500 updates.
       */
      if (
        this.updateCount === 1 ||
        this.updateCount % 500 ===
          0
      ) {
        console.log(
          `[CoinDCX] OrderBook cache updated: ${fullOrderBook.market} | bids=${fullOrderBook.bids.length} | asks=${fullOrderBook.asks.length} | cached=${orderBookService.size()}`,
        );
      }
    } catch (error) {
      console.error(
        "[CoinDCX] OrderBook parse error:",
        error,
      );
    }
  }
}