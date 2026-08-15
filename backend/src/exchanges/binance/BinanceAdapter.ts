import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import type {
  OrderBookLevel,
} from "../../orderbook/models/OrderBookLevel";

import {
  marketCache,
} from "../../services/cache.service";

import {
  crossExchangeMarketMakingPublicTradeTapeService,
} from "../../strategies/cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";

import {
  ConnectionPool,
  type ConnectionPoolConfig,
} from "../core/ConnectionPool";

import {
  spotMarketUniverseSelector,
} from "../core/SpotMarketUniverseSelector";

import type {
  ExchangeAdapter,
} from "../core/ExchangeAdapter";

import type {
  SocketWorker,
} from "../core/SocketWorker";

import type {
  NormalizedTicker,
} from "../coindcx/types";

import {
  BINANCE,
} from "./constants";

import type {
  BinanceBookTicker,
  BinanceAggregateTrade,
  BinanceCombinedAggregateTradeMessage,
  BinanceCombinedDepthMessage,
  BinanceCombinedStreamMessage,
  BinanceExchangeInfoResponse,
  BinancePartialDepth,
  BinanceSubscriptionResponse,
  BinanceTicker24Hour,
} from "./types";

type BinanceCombinedMessage =
  | BinanceCombinedStreamMessage
  | BinanceCombinedDepthMessage
  | BinanceCombinedAggregateTradeMessage;

type BinanceMessage =
  | BinanceCombinedMessage
  | BinanceSubscriptionResponse;

export class BinanceAdapter
  implements ExchangeAdapter
{
  readonly name =
    BINANCE.NAME;

  private pool:
    | ConnectionPool<string>
    | null =
    null;

  private readonly markets =
    new Set<string>();

  private selectedSymbols:
    string[] = [];

  private lastUpdate =
    0;

  private subscriptionRequestId =
    1;

  private depthUpdateCount =
    0;

  private tickerUpdateCount =
    0;

  private tickerCallback:
    | ((
        ticker:
          NormalizedTicker,
      ) => void)
    | null =
    null;

  async connect():
    Promise<void> {
    if (
      this.pool?.isStarted()
    ) {
      return;
    }

    const symbols =
      this.selectedSymbols.length >
        0
        ? [...this.selectedSymbols]
        : await this.loadTradingSymbols();

    if (
      symbols.length ===
      0
    ) {
      throw new Error(
        `[${this.name}] No active supported-quote Spot symbols found.`,
      );
    }

    if (
      this.selectedSymbols.length ===
      0
    ) {
      this.selectedSymbols =
        [...symbols];
    } else {
      console.log(
        `[${this.name}] Reusing ${symbols.length} cached market subscriptions for bounded pool recovery.`,
      );
    }

    const poolConfig:
      ConnectionPoolConfig<string> = {
      name:
        `${this.name} Market Data Pool`,

      items:
        symbols,

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

        onOpen: (
          worker,
        ) => {
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
          this.handleMessage(
            message,
          );
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
            BINANCE
              .SYMBOLS_PER_WORKER,
        )
      } workers for ${symbols.length} bounded spot markets.`,
    );
  }

  async disconnect():
    Promise<void> {
    this.pool?.stop();

    this.pool =
      null;

    this.markets.clear();
  }

  async subscribe(
    _markets:
      string[],
  ): Promise<void> {
    /*
     * Subscriptions are assigned when
     * the connection pool starts.
     */
  }

  async unsubscribe(
    _markets:
      string[],
  ): Promise<void> {
    /*
     * Dynamic symbol removal is not required
     * for the current all-USDT pool.
     */
  }

  isConnected():
    boolean {
    const connectedWorkers =
      this.pool
        ?.getConnectedWorkerCount() ??
      0;

    if (
      connectedWorkers >
      0
    ) {
      return true;
    }

    /*
     * A worker reconnect is normally shorter than the executable-quote
     * freshness window. Recent authoritative market data therefore remains
     * stronger health evidence than an instantaneous socket-state sample.
     */
    return (
      this.lastUpdate >
        0 &&
      Date.now() -
        this.lastUpdate <=
        BINANCE
          .CONNECTION_ACTIVITY_GRACE_MS
    );
  }

  getMarketCount():
    number {
    return this.markets.size;
  }

  getLastUpdate():
    number {
    return this.lastUpdate;
  }

  onTicker(
    callback: (
      ticker:
        NormalizedTicker,
    ) => void,
  ): void {
    this.tickerCallback =
      callback;
  }

  private async loadTradingSymbols():
    Promise<string[]> {
    const [
      exchangeInfoResult,
      activityResult,
    ] = await Promise.allSettled([
      fetch(
        `${BINANCE.REST.PUBLIC_BASE_URL}${BINANCE.REST.EXCHANGE_INFO}`,
        {signal: AbortSignal.timeout(BINANCE.PUBLIC_REST_TIMEOUT_MS)},
      ),
      fetch(
        `${BINANCE.REST.PUBLIC_BASE_URL}${BINANCE.REST.TICKER_24HR}`,
        {signal: AbortSignal.timeout(BINANCE.PUBLIC_REST_TIMEOUT_MS)},
      ),
    ]);

    if (exchangeInfoResult.status === "rejected") {
      throw exchangeInfoResult.reason;
    }

    const response = exchangeInfoResult.value;

    if (
      !response.ok
    ) {
      throw new Error(
        `ExchangeInfo failed with HTTP ${response.status}.`,
      );
    }

    const data =
      (
        await response.json()
      ) as BinanceExchangeInfoResponse;

    if (
      !Array.isArray(
        data.symbols,
      )
    ) {
      throw new Error(
        "Invalid Binance ExchangeInfo response.",
      );
    }

    const allowedQuotes =
      new Set<string>([
        BINANCE.QUOTE_ASSET,
        ...BINANCE.SECONDARY_QUOTE_ASSETS,
      ]);

    const activeSymbols =
      data.symbols
      .filter(
        (
          symbol,
        ) =>
          symbol.status ===
            "TRADING" &&
          allowedQuotes.has(symbol.quoteAsset.toUpperCase()) &&
          symbol
            .isSpotTradingAllowed !==
            false,
      )
      .map((symbol) => ({
        symbol: symbol.symbol.toUpperCase(),
        baseAsset: symbol.baseAsset.toUpperCase(),
        quoteAsset: symbol.quoteAsset.toUpperCase(),
      }));

    const maximumMarkets =
      this.resolveMaximumMarkets();

    let activityEvidence: Array<{
      symbol: string;
      turnover24h: number;
      volume24h: number;
    }> = [];

    if (
      activityResult.status === "fulfilled" &&
      activityResult.value.ok
    ) {
      const activity =
        (await activityResult.value.json()) as BinanceTicker24Hour[];

      if (Array.isArray(activity)) {
        activityEvidence = activity
          .map((ticker) => ({
            symbol: String(ticker.symbol ?? ""),
            turnover24h: Number(ticker.quoteVolume),
            volume24h: Number(ticker.volume),
          }));
      }
    } else {
      console.warn(
        `[${this.name}] 24h activity ranking unavailable; using deterministic catalog fallback.`,
      );
    }

    const externalMarkets =
      new Set(
        marketCache.getAll()
          .filter((quote) => quote.exchange.trim().toLowerCase() !== "binance")
          .map((quote) => quote.market),
      );

    const selection =
      spotMarketUniverseSelector.select(
        activeSymbols,
        activityEvidence,
        externalMarkets,
        maximumMarkets,
        BINANCE.QUOTE_ASSET,
        BINANCE.SECONDARY_QUOTE_ASSETS,
        BINANCE.SECONDARY_QUOTE_RESERVE_RATIO,
      );

    const selectedSymbols = [...selection.selected];

    console.log(
      `[${this.name}] Selected ${selectedSymbols.length} of ${activeSymbols.length} active spot markets (primary=${selection.selectedPrimaryMarkets}, secondary=${selection.selectedSecondaryMarkets}, anchors=${selection.selectedAnchorMarkets}, overlap=${selection.selectedExternalOverlapMarkets}, activity=${selection.selectedWithActivityEvidence}, quotes=${JSON.stringify(selection.quoteDistribution)}, limit=${maximumMarkets}).`,
    );

    return selectedSymbols;
  }

  private resolveMaximumMarkets():
    number {
    const rawValue =
      process.env.BINANCE_MAX_MARKETS;

    if (
      rawValue === undefined ||
      rawValue.trim().length ===
        0
    ) {
      return BINANCE
        .DEFAULT_MAX_MARKETS;
    }

    const parsed =
      Number(
        rawValue,
      );

    if (
      !Number.isSafeInteger(
        parsed,
      ) ||
      parsed <=
        0
    ) {
      console.warn(
        `[${this.name}] Invalid BINANCE_MAX_MARKETS="${rawValue}". Using default ${BINANCE.DEFAULT_MAX_MARKETS}.`,
      );

      return BINANCE
        .DEFAULT_MAX_MARKETS;
    }

    return Math.min(
      parsed,
      BINANCE
        .ABSOLUTE_MAX_MARKETS,
    );
  }

  private subscribeWorker(
    worker:
      SocketWorker,

    symbols:
      string[],

    workerIndex:
      number,
  ): void {
    /*
     * Partial-depth events do not contain
     * the symbol.
     *
     * Combined mode wraps each payload
     * with its stream name.
     */
    const propertyRequestId =
      this.subscriptionRequestId++;

    worker.send({
      method:
        "SET_PROPERTY",

      params: [
        "combined",
        true,
      ],

      id:
        propertyRequestId,
    });

    const streams =
      symbols.flatMap(
        (
          symbol,
        ) => {
          const normalizedSymbol =
            symbol
              .toLowerCase();

          return [
            `${normalizedSymbol}@bookTicker`,

            `${normalizedSymbol}@depth${BINANCE.DEPTH.LEVELS}@${BINANCE.DEPTH.UPDATE_SPEED}`,

            ...(
              crossExchangeMarketMakingPublicTradeTapeService
                .isWatched(
                  "binance",
                  symbol,
                )
                ? [
                    `${normalizedSymbol}@aggTrade`,
                  ]
                : []
            ),
          ];
        },
      );

    const subscriptionRequestId =
      this.subscriptionRequestId++;

    worker.send({
      method:
        "SUBSCRIBE",

      params:
        streams,

      id:
        subscriptionRequestId,
    });

    console.log(
      `[${this.name}] Worker ${workerIndex + 1} subscribing to ${streams.length} streams for ${symbols.length} markets. Request ID: ${subscriptionRequestId}`,
    );
  }

  private handleMessage(
    rawMessage:
      string,
  ): void {
    try {
      const parsed =
        JSON.parse(
          rawMessage,
        ) as
          BinanceMessage;

      if (
        "result" in
          parsed &&
        "id" in
          parsed
      ) {
        console.log(
          `[${this.name}] Request acknowledged. ID: ${parsed.id}`,
        );

        return;
      }

      if (
        !(
          "stream" in
          parsed
        ) ||
        !(
          "data" in
          parsed
        )
      ) {
        return;
      }

      const stream =
        parsed.stream
          .toLowerCase();

      if (
        stream.includes(
          "@aggtrade",
        )
      ) {
        this.recordPublicTrade(
          parsed.data as
            BinanceAggregateTrade,
        );

        return;
      }

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
        stream.includes(
          "@depth",
        )
      ) {
        this.updateOrderBook(
          stream,
          parsed.data as
            BinancePartialDepth,
        );
      }
    } catch (
      error
    ) {
      console.error(
        `[${this.name}] Invalid market-data payload:`,
        error,
      );
    }
  }

  private recordPublicTrade(
    trade:
      BinanceAggregateTrade,
  ): void {
    const price =
      Number(
        trade.p,
      );
    const quantity =
      Number(
        trade.q,
      );

    crossExchangeMarketMakingPublicTradeTapeService
      .record({
        id:
          `binance:${trade.s}:${trade.a}`,
        exchange:
          "binance",
        market:
          trade.s,
        price,
        quantity,
        occurredAt:
          trade.T,
        aggressorSide:
          trade.m
            ? "SELL"
            : "BUY",
        source:
          "BINANCE_AGG_TRADE",
      });
  }

  /*
   * -------------------------------------------------
   * BOOK TICKER
   * -------------------------------------------------
   *
   * BookTicker remains useful because it provides
   * lightweight top-of-book changes.
   *
   * However it is NOT the only source responsible
   * for refreshing MarketCache anymore.
   *
   * Partial-depth snapshots also refresh executable
   * quote timestamps so unchanged best prices do not
   * incorrectly become "stale".
   */
  private updateMarket(
    ticker:
      BinanceBookTicker,
  ): void {
    const bestBidPrice =
      Number(
        ticker.b,
      );

    const bestBidQty =
      Number(
        ticker.B,
      );

    const bestAskPrice =
      Number(
        ticker.a,
      );

    const bestAskQty =
      Number(
        ticker.A,
      );

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
      bestBidPrice <=
        0 ||
      bestAskPrice <=
        0 ||
      bestBidQty <
        0 ||
      bestAskQty <
        0 ||
      bestAskPrice <
        bestBidPrice
    ) {
      return;
    }

    const market =
      ticker.s
        .trim()
        .toUpperCase();

    if (
      market.length ===
      0
    ) {
      return;
    }

    const timestamp =
      Date.now();

    const normalizedTicker =
      this.createNormalizedTicker(
        market,
        bestBidPrice,
        bestBidQty,
        bestAskPrice,
        bestAskQty,
        timestamp,
      );

    this.publishExecutableQuote(
      normalizedTicker,
    );

    this.tickerUpdateCount +=
      1;
  }

  /*
   * -------------------------------------------------
   * PARTIAL DEPTH
   * -------------------------------------------------
   *
   * This is now the authoritative synchronization
   * path for:
   *
   * OrderBookService
   * +
   * MarketCache
   *
   * The same received snapshot timestamp is used
   * in both stores.
   *
   * Result:
   *
   * OpportunityEvaluator sees freshness derived from
   * the same market-data event that execution VWAP /
   * depth verification sees.
   */
  private updateOrderBook(
    stream:
      string,

    depth:
      BinancePartialDepth,
  ): void {
    const market =
      this.extractMarketFromStream(
        stream,
      );

    if (
      !market
    ) {
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
      bids.length ===
        0 ||
      asks.length ===
        0
    ) {
      return;
    }

    const bestBid =
      bids[
        0
      ];

    const bestAsk =
      asks[
        0
      ];

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
      exchange:
        "binance",

      market,

      bids,

      asks,

      timestamp,
    };

    /*
     * Binance partial-depth payloads are complete
     * fresh top-N snapshots, not incremental deltas.
     *
     * Therefore replace() is correct.
     */
    orderBookService.replace(
      orderBook,
    );

    /*
     * CRITICAL FRESHNESS SYNCHRONIZATION
     *
     * Previously this fresh depth event updated only
     * OrderBookService.
     *
     * OpportunityEvaluator reads MarketCache instead,
     * therefore an unchanged @bookTicker could become
     * older than maximumQuoteAgeMs even while the
     * Binance depth stream was healthy and fresh.
     *
     * Publish the exact same top-of-book snapshot and
     * timestamp into MarketCache.
     */
    const normalizedTicker =
      this.createNormalizedTicker(
        market,
        bestBid.price,
        bestBid.quantity,
        bestAsk.price,
        bestAsk.quantity,
        timestamp,
      );

    this.publishExecutableQuote(
      normalizedTicker,
    );

    this.depthUpdateCount +=
      1;

    if (
      this.depthUpdateCount ===
        1 ||
      this.depthUpdateCount %
          5_000 ===
        0
    ) {
      console.log(
        `[${this.name}] Synchronized depth: ${market} | bids=${bids.length} | asks=${asks.length} | bid=${bestBid.price} | ask=${bestAsk.price} | books=${orderBookService.size()} | depthUpdates=${this.depthUpdateCount}`,
      );
    }
  }

  /*
   * Build one consistent top-of-book model regardless
   * of whether the source event was @bookTicker or
   * partial-depth.
   */
  private createNormalizedTicker(
    market:
      string,

    bestBidPrice:
      number,

    bestBidQty:
      number,

    bestAskPrice:
      number,

    bestAskQty:
      number,

    timestamp:
      number,
  ): NormalizedTicker {
    const spread =
      bestAskPrice -
      bestBidPrice;

    const lastPrice =
      (
        bestBidPrice +
        bestAskPrice
      ) /
      2;

    return {
      exchange:
        "binance",

      market,

      lastPrice,

      // Backward-compatible fields.
      bid:
        bestBidPrice,

      ask:
        bestAskPrice,

      // Executable top-of-book.
      bestBidPrice,

      bestBidQty,

      bestAskPrice,

      bestAskQty,

      spread,

      timestamp,
    };
  }

  /*
   * Single publication path prevents timestamp drift
   * between different Binance handlers.
   */
  private publishExecutableQuote(
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

  private extractMarketFromStream(
    stream:
      string,
  ): string | null {
    const separatorIndex =
      stream.indexOf(
        "@",
      );

    if (
      separatorIndex <=
      0
    ) {
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

    return market ||
      null;
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

    side:
      "bid" |
      "ask",
  ): OrderBookLevel[] {
    if (
      !Array.isArray(
        levels,
      )
    ) {
      return [];
    }

    const normalized:
      OrderBookLevel[] =
      [];

    for (
      const [
        rawPrice,
        rawQuantity,
      ]
      of levels
    ) {
      const price =
        Number(
          rawPrice,
        );

      const quantity =
        Number(
          rawQuantity,
        );

      if (
        !Number.isFinite(
          price,
        ) ||
        !Number.isFinite(
          quantity,
        ) ||
        price <=
          0 ||
        quantity <=
          0
      ) {
        continue;
      }

      normalized.push({
        price,

        quantity,
      });
    }

    normalized.sort(
      side ===
        "bid"
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
      BINANCE.DEPTH
        .LEVELS,
    );
  }
}
