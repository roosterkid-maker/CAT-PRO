import { marketCache } from "../../services/cache.service";
import {
  ConnectionPool,
  type ConnectionPoolConfig,
} from "../core/ConnectionPool";
import type { ExchangeAdapter } from "../core/ExchangeAdapter";
import type { SocketWorker } from "../core/SocketWorker";
import type { NormalizedTicker } from "../coindcx/types";

import { BINANCE } from "./constants";
import type {
  BinanceBookTicker,
  BinanceExchangeInfoResponse,
  BinanceSubscriptionResponse,
} from "./types";

type BinanceMessage =
  | BinanceBookTicker
  | BinanceSubscriptionResponse;

export class BinanceAdapter implements ExchangeAdapter {
  readonly name = BINANCE.NAME;

  private pool: ConnectionPool<string> | null = null;

  private readonly markets = new Set<string>();

  private lastUpdate = 0;

  private subscriptionRequestId = 1;

  private tickerCallback:
    | ((ticker: NormalizedTicker) => void)
    | null = null;

  async connect(): Promise<void> {
    if (this.pool?.isStarted()) {
      return;
    }

    const symbols = await this.loadTradingSymbols();

    if (symbols.length === 0) {
      throw new Error(
        `[${this.name}] No active USDT Spot symbols found.`,
      );
    }

    const poolConfig: ConnectionPoolConfig<string> = {
      name: `${this.name} BookTicker Pool`,

      items: symbols,

      batchSize: BINANCE.SYMBOLS_PER_WORKER,

      createWorkerConfig: (
        batch,
        workerIndex,
      ) => ({
        name: `${this.name} Worker ${workerIndex + 1}`,

        url: BINANCE.SOCKET.URL,

        reconnectDelay:
          BINANCE.RECONNECT_DELAY,

        onOpen: (worker) => {
          this.subscribeWorker(
            worker,
            batch,
            workerIndex,
          );
        },

        onMessage: (_worker, message) => {
          this.handleMessage(message);
        },

        onClose: (
          _worker,
          code,
          reason,
        ) => {
          console.log(
            `[${this.name}] Worker ${workerIndex + 1} closed: ${code} ${reason}`,
          );
        },

        onError: (
          _worker,
          error,
        ) => {
          console.error(
            `[${this.name}] Worker ${workerIndex + 1} error:`,
            error.message,
          );
        },
      }),
    };

    this.pool =
      new ConnectionPool<string>(poolConfig);

    this.pool.start();

    console.log(
      `[${this.name}] Started ${
        Math.ceil(
          symbols.length /
            BINANCE.SYMBOLS_PER_WORKER,
        )
      } workers for ${symbols.length} USDT markets.`,
    );
  }

  async disconnect(): Promise<void> {
    this.pool?.stop();
    this.pool = null;
  }

  async subscribe(
    _markets: string[],
  ): Promise<void> {
    /*
     * Subscriptions are assigned automatically
     * when the connection pool starts.
     */
  }

  async unsubscribe(
    _markets: string[],
  ): Promise<void> {
    /*
     * Dynamic symbol removal is not required
     * for the current all-USDT pool.
     */
  }

  isConnected(): boolean {
    return (
      this.pool?.getConnectedWorkerCount() ??
      0
    ) > 0;
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

  private async loadTradingSymbols(): Promise<
    string[]
  > {
    const response = await fetch(
      BINANCE.REST.EXCHANGE_INFO,
      {
        signal:
          AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw new Error(
        `ExchangeInfo failed with HTTP ${response.status}.`,
      );
    }

    const data =
      (await response.json()) as BinanceExchangeInfoResponse;

    if (!Array.isArray(data.symbols)) {
      throw new Error(
        "Invalid Binance ExchangeInfo response.",
      );
    }

    return data.symbols
      .filter(
        (symbol) =>
          symbol.status === "TRADING" &&
          symbol.quoteAsset ===
            BINANCE.QUOTE_ASSET &&
          symbol.isSpotTradingAllowed !==
            false,
      )
      .map((symbol) =>
        symbol.symbol.toUpperCase(),
      );
  }

  private subscribeWorker(
    worker: SocketWorker,
    symbols: string[],
    workerIndex: number,
  ): void {
    const streams = symbols.map(
      (symbol) =>
        `${symbol.toLowerCase()}@bookTicker`,
    );

    const requestId =
      this.subscriptionRequestId++;

    worker.send({
      method: "SUBSCRIBE",
      params: streams,
      id: requestId,
    });

    console.log(
      `[${this.name}] Worker ${workerIndex + 1} subscribing to ${streams.length} markets. Request ID: ${requestId}`,
    );
  }

  private handleMessage(
    rawMessage: string,
  ): void {
    try {
      const parsed = JSON.parse(
        rawMessage,
      ) as BinanceMessage;

      if (
        "result" in parsed &&
        "id" in parsed
      ) {
        console.log(
          `[${this.name}] Subscription acknowledged. Request ID: ${parsed.id}`,
        );

        return;
      }

      if (
        !("s" in parsed) ||
        !("b" in parsed) ||
        !("B" in parsed) ||
        !("a" in parsed) ||
        !("A" in parsed)
      ) {
        return;
      }

      this.updateMarket(parsed);
    } catch (error) {
      console.error(
        `[${this.name}] Invalid BookTicker payload:`,
        error,
      );
    }
  }

  private updateMarket(
    ticker: BinanceBookTicker,
  ): void {
    const bestBidPrice =
      Number(ticker.b);

    const bestBidQty =
      Number(ticker.B);

    const bestAskPrice =
      Number(ticker.a);

    const bestAskQty =
      Number(ticker.A);

    if (
      !ticker.s ||
      !Number.isFinite(bestBidPrice) ||
      !Number.isFinite(bestBidQty) ||
      !Number.isFinite(bestAskPrice) ||
      !Number.isFinite(bestAskQty) ||
      bestBidPrice <= 0 ||
      bestAskPrice <= 0 ||
      bestBidQty < 0 ||
      bestAskQty < 0 ||
      bestAskPrice < bestBidPrice
    ) {
      return;
    }

    const market =
      ticker.s.toUpperCase();

    const timestamp = Date.now();

    const spread =
      bestAskPrice - bestBidPrice;

    /*
     * BookTicker doesn't include the latest
     * completed trade. Mid-price remains only
     * for display/backward compatibility.
     */
    const lastPrice =
      (bestBidPrice + bestAskPrice) /
      2;

    const normalizedTicker: NormalizedTicker = {
      exchange: "binance",

      market,

      lastPrice,

      bid: bestBidPrice,
      ask: bestAskPrice,

      bestBidPrice,
      bestBidQty,

      bestAskPrice,
      bestAskQty,

      spread,

      timestamp,
    };

    this.markets.add(market);
    this.lastUpdate = timestamp;

    marketCache.update(
      normalizedTicker,
    );

    this.tickerCallback?.(
      normalizedTicker,
    );
  }
}