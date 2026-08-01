import WebSocket from "ws";

import { marketCache } from "../../services/cache.service";

import { normalizeBybitTicker } from "./normalize";
import type {
  BybitSubscriptionResponse,
  BybitTickerMessage,
} from "./types";

type BybitSocketMessage =
  | BybitTickerMessage
  | BybitSubscriptionResponse;

export class BybitWebSocket {
  private socket: WebSocket | null = null;

  private readonly url =
    "wss://stream.bybit.com/v5/public/spot";

  private readonly markets = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "PEPEUSDT",
  ];

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (
        this.socket?.readyState === WebSocket.OPEN ||
        this.socket?.readyState === WebSocket.CONNECTING
      ) {
        resolve();
        return;
      }

      this.socket = new WebSocket(this.url);

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
        console.log(
          `[Bybit] Disconnected: ${code} ${reason.toString()}`,
        );

        this.socket = null;
      });

      this.socket.on("error", (error) => {
        console.error(
          "[Bybit] WebSocket error:",
          error.message,
        );
      });
    });
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;

    socket.removeAllListeners();

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }

  private subscribe(): void {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        op: "subscribe",

        args: this.markets.map(
          (market) =>
            `tickers.${market}`,
        ),
      }),
    );
  }

  private handleMessage(
    message: string,
  ): void {
    try {
      const parsed = JSON.parse(
        message,
      ) as BybitSocketMessage;

      if (this.isSubscriptionResponse(parsed)) {
        console.log(
          "[Bybit]",
          parsed.ret_msg ??
            "Subscription acknowledged",
        );

        return;
      }

      if (!this.isTickerMessage(parsed)) {
        return;
      }

      const ticker =
        normalizeBybitTicker(parsed);

      if (!ticker) {
        return;
      }

      marketCache.update(ticker);
    } catch (error) {
      console.error(
        "[Bybit] Invalid ticker payload:",
        error,
      );
    }
  }

  private isSubscriptionResponse(
    message: BybitSocketMessage,
  ): message is BybitSubscriptionResponse {
    return (
      typeof message === "object" &&
      message !== null &&
      "op" in message &&
      !("topic" in message)
    );
  }

  private isTickerMessage(
    message: BybitSocketMessage,
  ): message is BybitTickerMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "topic" in message &&
      typeof message.topic === "string" &&
      "data" in message
    );
  }
}