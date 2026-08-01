import WebSocket from "ws";

import { marketCache } from "../../services/cache.service";
import type { ExchangeAdapter } from "../core/ExchangeAdapter";
import type { NormalizedTicker } from "../coindcx/types";

import { BYBIT } from "./constants";
import { normalizeBybitTicker } from "./normalize";
import type {
  BybitSubscriptionResponse,
  BybitTickerMessage,
} from "./types";

type BybitSocketMessage =
  | BybitTickerMessage
  | BybitSubscriptionResponse;

export class BybitAdapter implements ExchangeAdapter {
  readonly name = BYBIT.NAME;

  private socket: WebSocket | null = null;
  private connected = false;

  private reconnectTimer: NodeJS.Timeout | null = null;
  private manuallyDisconnected = false;

  private readonly markets = new Set<string>();
  private lastUpdate = 0;

  private tickerCallback:
    | ((ticker: NormalizedTicker) => void)
    | null = null;

  private readonly url = BYBIT.SOCKET.URL;
  private readonly symbols = [...BYBIT.SYMBOLS];

  private rawTickerLogged = false;

  async connect(): Promise<void> {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.manuallyDisconnected = false;
    this.rawTickerLogged = false;

    this.socket = new WebSocket(this.url);

    this.socket.on("open", () => {
      this.connected = true;

      console.log(`[${this.name}] Connected`);

      void this.subscribe([]);
    });

    this.socket.on("message", (rawData) => {
      this.handleMessage(rawData.toString());
    });

    this.socket.on("close", (code, reason) => {
      this.connected = false;
      this.socket = null;

      console.log(
        `[${this.name}] Disconnected: ${code} ${reason.toString()}`,
      );

      if (!this.manuallyDisconnected) {
        this.scheduleReconnect();
      }
    });

    this.socket.on("error", (error) => {
      console.error(
        `[${this.name}] WebSocket error:`,
        error.message,
      );
    });
  }

  async disconnect(): Promise<void> {
    this.manuallyDisconnected = true;
    this.connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

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

  async subscribe(
    markets: string[],
  ): Promise<void> {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const symbols =
      markets.length > 0
        ? markets
        : this.symbols;

    this.socket.send(
      JSON.stringify({
        op: "subscribe",

        args: symbols.map(
          (symbol) =>
            `tickers.${symbol.toUpperCase()}`,
        ),
      }),
    );
  }

  async unsubscribe(
    markets: string[],
  ): Promise<void> {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN ||
      markets.length === 0
    ) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        op: "unsubscribe",

        args: markets.map(
          (symbol) =>
            `tickers.${symbol.toUpperCase()}`,
        ),
      }),
    );
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMarketCount(): number {
    return this.markets.size;
  }

  getLastUpdate(): number {
    return this.lastUpdate;
  }

  onTicker(
    callback: (ticker: NormalizedTicker) => void,
  ): void {
    this.tickerCallback = callback;
  }

  private handleMessage(
    rawMessage: string,
  ): void {
    try {
      const parsed = JSON.parse(
        rawMessage,
      ) as BybitSocketMessage;

      if (this.isSubscriptionResponse(parsed)) {
        console.log(
          `[${this.name}] ${
            parsed.ret_msg ??
            "Subscription acknowledged"
          }`,
        );

        return;
      }

      if (!this.isTickerMessage(parsed)) {
        return;
      }

      if (!this.rawTickerLogged) {
        console.log(
          "[Bybit RAW TICKER]",
          JSON.stringify(parsed, null, 2),
        );

        this.rawTickerLogged = true;
      }

      const ticker =
        normalizeBybitTicker(parsed);

      if (!ticker) {
        return;
      }

      this.markets.add(ticker.market);
      this.lastUpdate = ticker.timestamp;

      marketCache.update(ticker);
      this.tickerCallback?.(ticker);
    } catch (error) {
      console.error(
        `[${this.name}] Invalid ticker payload:`,
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

  private scheduleReconnect(): void {
    if (
      this.reconnectTimer ||
      this.manuallyDisconnected
    ) {
      return;
    }

    console.log(
      `[${this.name}] Reconnecting in ${BYBIT.RECONNECT_DELAY}ms...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      void this.connect().catch(
        (error: unknown) => {
          console.error(
            `[${this.name}] Reconnection failed:`,
            error,
          );

          this.scheduleReconnect();
        },
      );
    }, BYBIT.RECONNECT_DELAY);
  }
}