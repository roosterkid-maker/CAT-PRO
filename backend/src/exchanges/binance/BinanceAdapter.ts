import { orderBookService } from "../../orderbook/services/OrderBookService";
import type { OrderBook } from "../../orderbook/models/OrderBook";
import type { OrderBookLevel } from "../../orderbook/models/OrderBookLevel";

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
  BinanceCombinedDepthMessage,
  BinanceCombinedStreamMessage,
  BinanceExchangeInfoResponse,
  BinancePartialDepth,
  BinanceSubscriptionResponse,
} from "./types";

type BinanceCombinedMessage =
  | BinanceCombinedStreamMessage
  | BinanceCombinedDepthMessage;

type BinanceMessage =
  | BinanceCombinedMessage
  | BinanceSubscriptionResponse;

export class BinanceAdapter
  implements ExchangeAdapter
{
  readonly name = BINANCE.NAME;

  private pool:
    | ConnectionPool<string>
    | null = null;

  private readonly markets =
    new Set<string>();

  private lastUpdate = 0;

  private subscriptionRequestId = 1;

  private depthUpdateCount = 0;

  private tickerCallback:
    | ((ticker: NormalizedTicker) => void)
    | null = null;

  async connect(): Promise<void> {
    if (this.pool?.isStarted()) {
      return;
    }

    const symbols =
      await this.loadTradingSymbols();

    if (symbols.length === 0) {
      throw new Error(
        `[${this.name}] No active USDT Spot symbols found.`,
      );
    }

    const poolConfig:
      ConnectionPoolConfig<string> = {
      name:
        `${this.name} Market Data Pool`,

      items: symbols,

      batchSize:
        BINANCE.SYMBOLS_PER_WORKER,

      createWorkerConfig: (
        batch,
        workerIndex,
      ) => ({
        name:
          `${this.name} Worker ${workerIndex + 1}`,

        url:
          BINANCE.SOCKET.URL,

        reconnectDelay:
          BINANCE.RECONNECT_DELAY,

        onOpen: (worker) => {
          this.subscribeWorker(
            worker,
            batch,
            workerIndex,
          );
        },

        onMessage: (
          _worker,
          message,
        ) => {
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
      new ConnectionPool<string>(
        poolConfig,
      );

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
     * Subscriptions are assigned when
     * the connection pool starts.
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
      this.pool
        ?.getConnectedWorkerCount() ??
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
    callback: (
      ticker: NormalizedTicker,
    ) => void,
  ): void {
    this.tickerCallback = callback;
  }

  private async loadTradingSymbols():
  Promise<string[]> {
    const response = await fetch(
      BINANCE.REST.EXCHANGE_INFO,
      {
        signal:
          AbortSignal.timeout(
            10_000,
          ),
      },
    );

    if (!response.ok) {
      throw new Error(
        `ExchangeInfo failed with HTTP ${response.status}.`,
      );
    }

    const data =
      (await response.json()) as
        BinanceExchangeInfoResponse;

    if (!Array.isArray(data.symbols)) {
      throw new Error(
        "Invalid Binance ExchangeInfo response.",
      );
    }

    return data.symbols
      .filter(
        (symbol) =>
          symbol.status ===
            "TRADING" &&
          symbol.quoteAsset ===
            BINANCE.QUOTE_ASSET &&
          symbol
            .isSpotTradingAllowed !==
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
    /*
     * Partial-depth events do not contain
     * the symbol. Combined mode wraps each
     * event with its stream name.
     */
    const propertyRequestId =
      this.subscriptionRequestId++;

    worker.send({
      method: "SET_PROPERTY",

      params: [
        "combined",
        true,
      ],

      id: propertyRequestId,
    });

    const streams =
      symbols.flatMap(
        (symbol) => {
          const normalizedSymbol =
            symbol.toLowerCase();

          return [
            `${normalizedSymbol}@bookTicker`,

            `${normalizedSymbol}@depth${BINANCE.DEPTH.LEVELS}@${BINANCE.DEPTH.UPDATE_SPEED}`,
          ];
        },
      );

    const subscriptionRequestId =
      this.subscriptionRequestId++;

    worker.send({
      method: "SUBSCRIBE",

      params: streams,

      id: subscriptionRequestId,
    });

    console.log(
      `[${this.name}] Worker ${workerIndex + 1} subscribing to ${streams.length} streams for ${symbols.length} markets. Request ID: ${subscriptionRequestId}`,
    );
  }

  private handleMessage(
    rawMessage: string,
  ): void {
    try {
      const parsed =
        JSON.parse(
          rawMessage,
        ) as BinanceMessage;

      if (
        "result" in parsed &&
        "id" in parsed
      ) {
        console.log(
          `[${this.name}] Request acknowledged. ID: ${parsed.id}`,
        );

        return;
      }

      if (
        !("stream" in parsed) ||
        !("data" in parsed)
      ) {
        return;
      }

      const stream =
        parsed.stream.toLowerCase();

      if (
        stream.includes(
          "@bookticker",
        )
      ) {
        this.updateMarket(
          parsed.data as
            BinanceBookTicker,
        );

        return;
      }

      if (
        stream.includes("@depth")
      ) {
        this.updateOrderBook(
          stream,
          parsed.data as
            BinancePartialDepth,
        );
      }
    } catch (error) {
      console.error(
        `[${this.name}] Invalid market-data payload:`,
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
      !Number.isFinite(
        bestBidPrice,
      ) ||
      !Number.isFinite(
        bestBidQty,
      ) ||
      !Number.isFinite(
        bestAskPrice,
      ) ||
      !Number.isFinite(
        bestAskQty,
      ) ||
      bestBidPrice <= 0 ||
      bestAskPrice <= 0 ||
      bestBidQty < 0 ||
      bestAskQty < 0 ||
      bestAskPrice <
        bestBidPrice
    ) {
      return;
    }

    const market =
      ticker.s.toUpperCase();

    const timestamp =
      Date.now();

    const spread =
      bestAskPrice -
      bestBidPrice;

    const lastPrice =
      (
        bestBidPrice +
        bestAskPrice
      ) / 2;

    const normalizedTicker:
      NormalizedTicker = {
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

    this.lastUpdate =
      timestamp;

    marketCache.update(
      normalizedTicker,
    );

    this.tickerCallback?.(
      normalizedTicker,
    );
  }

  private updateOrderBook(
    stream: string,
    depth: BinancePartialDepth,
  ): void {
    const market =
      this.extractMarketFromStream(
        stream,
      );

    if (!market) {
      return;
    }

    const bids =
      this.normalizeDepthSide(
        depth.bids,
        "bid",
      );

    const asks =
      this.normalizeDepthSide(
        depth.asks,
        "ask",
      );

    if (
      bids.length === 0 ||
      asks.length === 0
    ) {
      return;
    }

    const bestBid =
      bids[0];

    const bestAsk =
      asks[0];

    if (
      !bestBid ||
      !bestAsk ||
      bestAsk.price <
        bestBid.price
    ) {
      return;
    }

    const timestamp =
      Date.now();

    const orderBook:
      OrderBook = {
      exchange: "binance",

      market,

      bids,
      asks,

      timestamp,
    };

    /*
     * Binance partial-depth messages contain
     * a complete fresh top-N book, not deltas.
     * Therefore replace instead of merge.
     */
    orderBookService.replace(
      orderBook,
    );

    this.depthUpdateCount += 1;

    if (
      this.depthUpdateCount === 1 ||
      this.depthUpdateCount %
        1_000 ===
        0
    ) {
      console.log(
        `[${this.name}] OrderBook cache updated: ${market} | bids=${bids.length} | asks=${asks.length} | cached=${orderBookService.size()}`,
      );
    }
  }

  private extractMarketFromStream(
    stream: string,
  ): string | null {
    const separatorIndex =
      stream.indexOf("@");

    if (separatorIndex <= 0) {
      return null;
    }

    const market =
      stream
        .slice(
          0,
          separatorIndex,
        )
        .trim()
        .toUpperCase();

    return market || null;
  }

  private normalizeDepthSide(
    levels:
      | Array<
          readonly [
            string,
            string,
          ]
        >
      | undefined,

    side: "bid" | "ask",
  ): OrderBookLevel[] {
    if (!Array.isArray(levels)) {
      return [];
    }

    const normalized:
      OrderBookLevel[] = [];

    for (
      const [
        rawPrice,
        rawQuantity,
      ] of levels
    ) {
      const price =
        Number(rawPrice);

      const quantity =
        Number(rawQuantity);

      if (
        !Number.isFinite(price) ||
        !Number.isFinite(
          quantity,
        ) ||
        price <= 0 ||
        quantity <= 0
      ) {
        continue;
      }

      normalized.push({
        price,
        quantity,
      });
    }

    normalized.sort(
      side === "bid"
        ? (
            first,
            second,
          ) =>
            second.price -
            first.price
        : (
            first,
            second,
          ) =>
            first.price -
            second.price,
    );

    return normalized.slice(
      0,
      BINANCE.DEPTH.LEVELS,
    );
  }
}