import { io, type Socket } from "socket.io-client";

import { marketCache } from "../../services/cache.service";
import type { ExchangeAdapter } from "../core/ExchangeAdapter";
import { COINDCX } from "./constants";
import {
  coinDCXPublicTickerApi,
  normalizeCoinDCXPublicTicker,
  type CoinDCXPublicTickerApiContract,
} from "./CoinDCXPublicTickerApi";
import type { NormalizedTicker } from "./types";

interface CoinDCXCurrentPricesPayload {
  ts?: number;
  prices?: Record<string, string | number>;
}

interface CoinDCXSocketResponse {
  data?: string | CoinDCXCurrentPricesPayload;
}

export class CoinDCXWebSocket implements ExchangeAdapter {
  readonly name = COINDCX.NAME;

  private static readonly PUBLIC_TICKER_REFRESH_MS =
    60_000;

  private socket: Socket | null = null;
  private subscribed = false;

  private readonly markets = new Set<string>();
  private lastUpdate = 0;

  private publicTickerRefreshTimer:
    ReturnType<typeof setInterval> | null =
    null;

  private publicTickerRefreshInProgress =
    false;

  constructor(
    private readonly publicTickerApi:
      CoinDCXPublicTickerApiContract =
      coinDCXPublicTickerApi,
  ) {}

  private tickerCallback:
    | ((ticker: NormalizedTicker) => void)
    | null = null;

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    await this.refreshPublicTickerSnapshot();

    this.startPublicTickerRefresh();

    this.socket = io(COINDCX.SOCKET.URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2_000,
    });

    this.socket.on("connect", () => {
      console.log(`[${this.name}] Connected`);
      this.joinCurrentPricesChannel();
    });

    this.socket.on(
      COINDCX.EVENTS.CURRENT_PRICES_UPDATE,
      (response: CoinDCXSocketResponse) => {
        this.handleCurrentPrices(response);
      },
    );

    this.socket.on("disconnect", (reason) => {
      this.subscribed = false;

      console.log(
        `[${this.name}] Disconnected: ${reason}`,
      );
    });

    this.socket.on("connect_error", (error: Error) => {
      console.error(
        `[${this.name}] Connection error: ${error.message}`,
      );
    });
  }

  async disconnect(): Promise<void> {
    this.stopPublicTickerRefresh();

    if (!this.socket) {
      return;
    }

    if (this.subscribed) {
      this.socket.emit("leave", {
        channelName:
          COINDCX.CHANNELS.CURRENT_PRICES,
      });
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();

    this.socket = null;
    this.subscribed = false;
  }

  async subscribe(
    _markets: string[],
  ): Promise<void> {
    this.joinCurrentPricesChannel();
  }

  async unsubscribe(
    _markets: string[],
  ): Promise<void> {
    /*
     * Aggregate feed does not support
     * individual market unsubscription.
     */
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
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

  private joinCurrentPricesChannel(): void {
    if (
      !this.socket?.connected ||
      this.subscribed
    ) {
      return;
    }

    this.socket.emit("join", {
      channelName:
        COINDCX.CHANNELS.CURRENT_PRICES,
    });

    this.subscribed = true;

    console.log(
      `[${this.name}] Joined ${COINDCX.CHANNELS.CURRENT_PRICES}`,
    );
  }

  private handleCurrentPrices(
    response: CoinDCXSocketResponse,
  ): void {
    try {
      const payload =
        typeof response.data === "string"
          ? (JSON.parse(
              response.data,
            ) as CoinDCXCurrentPricesPayload)
          : response.data;

      if (!payload?.prices) {
        return;
      }

      const timestamp =
        payload.ts ?? Date.now();

      for (const [market, rawPrice] of Object.entries(
        payload.prices,
      )) {
        const lastPrice = Number(rawPrice);

        if (
          !Number.isFinite(lastPrice) ||
          lastPrice <= 0
        ) {
          continue;
        }

        const normalizedMarket =
          market.toUpperCase();

        const ticker: NormalizedTicker = {
          exchange: "coindcx",
          market: normalizedMarket,

          lastPrice,

          bid: null,
          ask: null,

          bestBidPrice: null,
          bestBidQty: null,

          bestAskPrice: null,
          bestAskQty: null,

          spread: null,

          timestamp,
        };

        this.publishTicker(
          ticker,
        );
      }
    } catch (error) {
      console.error(
        `[${this.name}] Invalid current-prices payload:`,
        error,
      );
    }
  }

  private async refreshPublicTickerSnapshot():
    Promise<void> {
    if (
      this.publicTickerRefreshInProgress
    ) {
      return;
    }

    this.publicTickerRefreshInProgress =
      true;

    try {
      const receivedAt =
        Date.now();

      const tickers =
        await this.publicTickerApi
          .getTickers();

      let published =
        0;

      for (const incoming of tickers) {
        const ticker =
          normalizeCoinDCXPublicTicker(
            incoming,
            receivedAt,
          );

        if (!ticker) {
          continue;
        }

        this.publishTicker(
          ticker,
        );

        published +=
          1;
      }

      console.log(
        `[${this.name}] Loaded ${published} ticker-only public REST markets for cross-exchange depth discovery.`,
      );
    } catch (
      error:
        unknown
    ) {
      console.warn(
        `[${this.name}] Public ticker discovery snapshot failed; websocket discovery remains active: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.publicTickerRefreshInProgress =
        false;
    }
  }

  private startPublicTickerRefresh():
    void {
    if (
      this.publicTickerRefreshTimer
    ) {
      return;
    }

    this.publicTickerRefreshTimer =
      setInterval(
        () => {
          void this
            .refreshPublicTickerSnapshot();
        },
        CoinDCXWebSocket
          .PUBLIC_TICKER_REFRESH_MS,
      );
  }

  private stopPublicTickerRefresh():
    void {
    if (
      !this.publicTickerRefreshTimer
    ) {
      return;
    }

    clearInterval(
      this.publicTickerRefreshTimer,
    );

    this.publicTickerRefreshTimer =
      null;
  }

  private publishTicker(
    ticker:
      NormalizedTicker,
  ): void {
    this.markets.add(
      ticker.market,
    );

    this.lastUpdate =
      Math.max(
        this.lastUpdate,
        ticker.timestamp,
      );

    marketCache.update(
      ticker,
    );

    this.tickerCallback?.(
      ticker,
    );
  }
}
