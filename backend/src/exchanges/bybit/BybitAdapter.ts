import WebSocket from "ws";

import {
  bybitSubscriptionAuditService,
} from "../../diagnostics/services/BybitSubscriptionAuditService";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  OrderBookLevel,
} from "../../orderbook/models/OrderBookLevel";

import {
  marketCache,
} from "../../services/cache.service";

import {
  crossExchangeMarketMakingPublicTradeTapeService,
} from "../../strategies/cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";

import type {
  ExchangeAdapter,
} from "../core/ExchangeAdapter";

import {
  spotMarketUniverseSelector,
} from "../core/SpotMarketUniverseSelector";

import type {
  SpotMarketUniverseSelection,
} from "../core/SpotMarketUniverseSelector";

import type {
  NormalizedTicker,
} from "../coindcx/types";

import {
  BYBIT,
} from "./constants";

import {
  loadBybitSpotMarketActivity,
  loadBybitSpotInstruments,
} from "./marketLoader";

import type {
  BybitOrderBookLevel,
  BybitOrderBookMessage,
  BybitPublicTradeMessage,
  BybitSubscriptionResponse,
  BybitTickerMessage,
} from "./types";

type BybitSocketMessage =
  | BybitTickerMessage
  | BybitOrderBookMessage
  | BybitPublicTradeMessage
  | BybitSubscriptionResponse;

export interface BybitActionTimeOrderBookRefreshReport {
  readonly exchange: "bybit";
  readonly market: string;
  readonly accepted: boolean;
  readonly requestedAt: number;
  readonly receivedAt: number | null;
  readonly roundTripMs: number;
  readonly error: string | null;
}

export interface BybitPublicOrderBookSnapshotFetcher {
  fetch(
    market: string,
    timeoutMs: number,
  ): Promise<unknown>;
}

interface BybitRestOrderBookResponse {
  readonly retCode?: unknown;
  readonly retMsg?: unknown;
  readonly result?: {
    readonly s?: unknown;
    readonly b?: unknown;
    readonly a?: unknown;
    readonly u?: unknown;
    readonly seq?: unknown;
  };
}

const DEFAULT_PUBLIC_ORDER_BOOK_SNAPSHOT_FETCHER:
  BybitPublicOrderBookSnapshotFetcher = {
  async fetch(
    market,
    timeoutMs,
  ): Promise<unknown> {
    const response = await fetch(
      buildBybitActionTimeOrderBookUrl(market),
      {signal: AbortSignal.timeout(timeoutMs)},
    );

    if (!response.ok) {
      throw new Error(
        `Bybit public order-book refresh failed with HTTP ${response.status}.`,
      );
    }

    return response.json();
  },
};

export function buildBybitActionTimeOrderBookUrl(market: string): URL {
  const url = new URL("https://api.bybit.com/v5/market/orderbook");
  url.searchParams.set("category", "spot");
  url.searchParams.set("symbol", market);
  url.searchParams.set("limit", String(BybitAdapter.ORDER_BOOK_DEPTH));
  return url;
}

interface LocalBybitOrderBook {
  bids:
    Map<number, number>;

  asks:
    Map<number, number>;

  lastUpdateId:
    number | null;

  lastSequence:
    number | null;

  timestamp:
    number;
}

interface BybitAdapterDiagnostics {
  universeSelection:
    SpotMarketUniverseSelection | null;

  snapshotsReceived:
    number;

  deltasReceived:
    number;

  booksPublished:
    number;

  invalidMessages:
    number;

  crossedBooksRejected:
    number;

  emptyBooksRejected:
    number;

  lastSourceTimestamp:
    number | null;

  lastReceivedAt:
    number | null;

  lastObservedClockOffsetMs:
    number | null;
}

const diagnostics:
  BybitAdapterDiagnostics = {
  universeSelection:
    null,

  snapshotsReceived:
    0,

  deltasReceived:
    0,

  booksPublished:
    0,

  invalidMessages:
    0,

  crossedBooksRejected:
    0,

  emptyBooksRejected:
    0,

  lastSourceTimestamp:
    null,

  lastReceivedAt:
    null,

  lastObservedClockOffsetMs:
    null,
};

export class BybitAdapter
  implements ExchangeAdapter
{
  readonly name =
    BYBIT.NAME;

  /*
   * Controlled rollout.
   *
   * Current scanner has already proven
   * stable with 100 Bybit USDT markets.
   */
  private static readonly DEFAULT_MAX_MARKETS =
    200;

  private static readonly ABSOLUTE_MAX_MARKETS =
    400;

  /*
   * Full-depth websocket book used by:
   *
   * verification
   * executable depth
   * VWAP
   * slippage
   * simulation
   * last-look
   */
  static readonly ORDER_BOOK_DEPTH =
    50;

  /*
   * Live testing showed Bybit rejects
   * subscribe requests containing more
   * than 10 topic arguments.
   */
  private static readonly SUBSCRIPTION_BATCH_SIZE =
    10;

  private static readonly SUBSCRIPTION_BATCH_DELAY_MS =
    100;

  private static readonly HEARTBEAT_INTERVAL_MS =
    20_000;

  private socket:
    WebSocket | null =
    null;

  private connected =
    false;

  private reconnectTimer:
    NodeJS.Timeout | null =
    null;

  private heartbeatTimer:
    NodeJS.Timeout | null =
    null;

  private manuallyDisconnected =
    false;

  /*
   * Markets where valid Bybit executable
   * books have actually been published.
   */
  private readonly markets =
    new Set<string>();

  /*
   * Dynamically loaded USDT markets.
   */
  private symbols:
    string[] =
    [];

  /*
   * Local full-depth state.
   *
   * orderbook.50 sends:
   *
   * snapshot
   * then incremental deltas.
   *
   * Therefore we reconstruct the authoritative
   * book here before publishing it to the common
   * OrderBookService.
   */
  private readonly localBooks =
    new Map<
      string,
      LocalBybitOrderBook
    >();

  private lastUpdate =
    0;

  private tickerCallback:
    | ((
        ticker:
          NormalizedTicker,
      ) => void)
    | null =
    null;

  private readonly url =
    BYBIT.SOCKET.URL;

  constructor(
    private readonly publicOrderBookSnapshotFetcher:
      BybitPublicOrderBookSnapshotFetcher =
      DEFAULT_PUBLIC_ORDER_BOOK_SNAPSHOT_FETCHER,
  ) {}

  async connect():
    Promise<void> {
    if (
      this.socket?.readyState ===
        WebSocket.OPEN ||
      this.socket?.readyState ===
        WebSocket.CONNECTING
    ) {
      return;
    }

    if (
      this.symbols.length ===
      0
    ) {
      await this.loadMarkets();
    }

    this.manuallyDisconnected =
      false;

    this.socket =
      new WebSocket(
        this.url,
      );

    this.socket.on(
      "open",
      () => {
        this.connected =
          true;

        console.log(
          `[${this.name}] Connected`,
        );

        this.startHeartbeat();

        void this
          .subscribe(
            [],
          )
          .catch(
            (
              error:
                unknown,
            ) => {
              console.error(
                `[${this.name}] Initial subscription failed:`,
                error,
              );
            },
          );
      },
    );

    this.socket.on(
      "message",
      (
        rawData,
      ) => {
        this.handleMessage(
          rawData.toString(),
        );
      },
    );

    this.socket.on(
      "close",
      (
        code,
        reason,
      ) => {
        this.connected =
          false;

        this.stopHeartbeat();

        this.socket =
          null;

        /*
         * Never reuse reconstructed delta books
         * after a websocket reconnect.
         *
         * New websocket subscriptions will send
         * fresh snapshots.
         */
        this.localBooks.clear();

        console.log(
          `[${this.name}] Disconnected: ${code} ${reason.toString()}`,
        );

        if (
          !this.manuallyDisconnected
        ) {
          this.scheduleReconnect();
        }
      },
    );

    this.socket.on(
      "error",
      (
        error,
      ) => {
        console.error(
          `[${this.name}] WebSocket error:`,
          error.message,
        );
      },
    );
  }

  async disconnect():
    Promise<void> {
    this.manuallyDisconnected =
      true;

    this.connected =
      false;

    this.stopHeartbeat();

    if (
      this.reconnectTimer
    ) {
      clearTimeout(
        this.reconnectTimer,
      );

      this.reconnectTimer =
        null;
    }

    if (
      this.socket
    ) {
      const socket =
        this.socket;

      this.socket =
        null;

      socket.removeAllListeners();

      if (
        socket.readyState ===
          WebSocket.OPEN ||
        socket.readyState ===
          WebSocket.CONNECTING
      ) {
        socket.close();
      }
    }

    for (
      const market
      of this.markets
    ) {
      orderBookService.remove(
        "bybit",
        market,
      );
    }

    this.markets.clear();

    this.localBooks.clear();

    bybitSubscriptionAuditService
      .clear();
  }

  async subscribe(
    markets:
      string[],
  ): Promise<void> {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    const sourceSymbols =
      markets.length >
        0
        ? markets
        : this.symbols;

    const symbols =
      this.normalizeSymbols(
        sourceSymbols,
      );

    if (
      symbols.length ===
      0
    ) {
      console.warn(
        `[${this.name}] No symbols available for subscription.`,
      );

      return;
    }

    bybitSubscriptionAuditService
      .recordSubscribe(
        symbols,
      );

    /*
     * Keep ticker subscription for general
     * market information.
     *
     * Execution data now comes from:
     *
     * orderbook.50.*
     */
    const args =
      symbols.flatMap(
        (
          symbol,
        ) => [
          `tickers.${symbol}`,

          `orderbook.${BybitAdapter.ORDER_BOOK_DEPTH}.${symbol}`,

          ...(
            crossExchangeMarketMakingPublicTradeTapeService
              .isWatched(
                "bybit",
                symbol,
              )
              ? [
                  `publicTrade.${symbol}`,
                ]
              : []
          ),
        ],
      );

    const batches =
      this.chunk(
        args,
        BybitAdapter
          .SUBSCRIPTION_BATCH_SIZE,
      );

    let sentRequests =
      0;

    for (
      let index =
        0;
      index <
        batches.length;
      index +=
        1
    ) {
      const batch =
        batches[
          index
        ];

      if (
        !batch ||
        batch.length ===
          0
      ) {
        continue;
      }

      if (
        !this.socket ||
        this.socket
          .readyState !==
          WebSocket.OPEN
      ) {
        console.warn(
          `[${this.name}] Socket closed before all subscriptions were sent.`,
        );

        return;
      }

      this.socket.send(
        JSON.stringify({
          op:
            "subscribe",

          args:
            batch,
        }),
      );

      sentRequests +=
        1;

      if (
        index <
        batches.length -
          1
      ) {
        await this.sleep(
          BybitAdapter
            .SUBSCRIPTION_BATCH_DELAY_MS,
        );
      }
    }

    console.log(
      `[${this.name}] Subscribed to ${symbols.length} ticker + level-${BybitAdapter.ORDER_BOOK_DEPTH} order books in ${sentRequests} request(s).`,
    );
  }

  async unsubscribe(
    markets:
      string[],
  ): Promise<void> {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN ||
      markets.length ===
        0
    ) {
      return;
    }

    const symbols =
      this.normalizeSymbols(
        markets,
      );

    const args =
      symbols.flatMap(
        (
          symbol,
        ) => [
          `tickers.${symbol}`,

          `orderbook.${BybitAdapter.ORDER_BOOK_DEPTH}.${symbol}`,

          ...(
            crossExchangeMarketMakingPublicTradeTapeService
              .isWatched(
                "bybit",
                symbol,
              )
              ? [
                  `publicTrade.${symbol}`,
                ]
              : []
          ),
        ],
      );

    const batches =
      this.chunk(
        args,
        BybitAdapter
          .SUBSCRIPTION_BATCH_SIZE,
      );

    for (
      let index =
        0;
      index <
        batches.length;
      index +=
        1
    ) {
      const batch =
        batches[
          index
        ];

      if (
        !batch ||
        batch.length ===
          0
      ) {
        continue;
      }

      if (
        !this.socket ||
        this.socket
          .readyState !==
          WebSocket.OPEN
      ) {
        return;
      }

      this.socket.send(
        JSON.stringify({
          op:
            "unsubscribe",

          args:
            batch,
        }),
      );

      if (
        index <
        batches.length -
          1
      ) {
        await this.sleep(
          BybitAdapter
            .SUBSCRIPTION_BATCH_DELAY_MS,
        );
      }
    }

    bybitSubscriptionAuditService
      .remove(
        symbols,
      );

    for (
      const market
      of symbols
    ) {
      this.markets.delete(
        market,
      );

      this.localBooks.delete(
        market,
      );

      orderBookService.remove(
        "bybit",
        market,
      );
    }
  }

  isConnected():
    boolean {
    return this.connected;
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

  /**
   * Bounded public-read refresh used only after an otherwise-qualified
   * Strategy #1 Bybit route is blocked by stale books. The response is
   * validated and published through the same OrderBookService/MarketCache
   * path as websocket depth; this method grants no order authority.
   */
  async refreshOrderBookSnapshot(
    marketValue: string,
    timeoutMs = 190,
  ): Promise<BybitActionTimeOrderBookRefreshReport> {
    const market = marketValue.trim().toUpperCase();
    const requestedAt = Date.now();

    if (!/^[A-Z0-9]{6,24}$/u.test(market)) {
      return {
        exchange: "bybit",
        market,
        accepted: false,
        requestedAt,
        receivedAt: null,
        roundTripMs: 0,
        error: "Bybit action-time order-book market is invalid.",
      };
    }

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 1_000) {
      return {
        exchange: "bybit",
        market,
        accepted: false,
        requestedAt,
        receivedAt: null,
        roundTripMs: 0,
        error: "Bybit action-time order-book timeout must be 50-1000 ms.",
      };
    }

    try {
      const payload = await this.publicOrderBookSnapshotFetcher.fetch(
        market,
        timeoutMs,
      ) as BybitRestOrderBookResponse;
      const receivedAt = Date.now();
      const accepted = this.applyRestOrderBookSnapshot(
        market,
        payload,
        receivedAt,
      );

      return {
        exchange: "bybit",
        market,
        accepted: accepted.accepted,
        requestedAt,
        receivedAt: accepted.accepted ? receivedAt : null,
        roundTripMs: Math.max(0, receivedAt - requestedAt),
        error: accepted.accepted ? null : accepted.reason,
      };
    } catch (error: unknown) {
      const completedAt = Date.now();
      return {
        exchange: "bybit",
        market,
        accepted: false,
        requestedAt,
        receivedAt: null,
        roundTripMs: Math.max(0, completedAt - requestedAt),
        error: error instanceof Error
          ? error.message
          : "Unknown Bybit action-time order-book refresh failure.",
      };
    }
  }

  getDiagnostics():
    BybitAdapterDiagnostics {
    return {
      ...diagnostics,

      universeSelection:
        diagnostics.universeSelection
          ? structuredClone(
              diagnostics.universeSelection,
            )
          : null,
    };
  }

  resetDiagnostics():
    void {
    diagnostics.snapshotsReceived =
      0;

    diagnostics.deltasReceived =
      0;

    diagnostics.booksPublished =
      0;

    diagnostics.invalidMessages =
      0;

    diagnostics.crossedBooksRejected =
      0;

    diagnostics.emptyBooksRejected =
      0;
  }

  private async loadMarkets():
    Promise<void> {
    console.log(
      `[${this.name}] Loading bounded multi-quote spot markets...`,
    );

    const [
      catalogResult,
      activityResult,
    ] =
      await Promise.allSettled([
        loadBybitSpotInstruments(),
        loadBybitSpotMarketActivity(),
      ]);

    if (
      catalogResult.status ===
      "rejected"
    ) {
      throw catalogResult.reason;
    }

    const allowedQuotes =
      new Set([
        "USDT",
        "BTC",
        "ETH",
        "USDC",
      ]);

    const catalog =
      catalogResult.value
        .filter((instrument) =>
          instrument.status.trim().toUpperCase() === "TRADING" &&
          allowedQuotes.has(instrument.quoteCoin.trim().toUpperCase()),
        )
        .map((instrument) => ({
          symbol: instrument.symbol,
          baseAsset: instrument.baseCoin,
          quoteAsset: instrument.quoteCoin,
        }));

    if (
      catalog.length ===
      0
    ) {
      throw new Error(
        "Bybit returned no active supported-quote spot markets.",
      );
    }

    const maximumMarkets =
      this.resolveMaximumMarkets();

    const activityEvidence =
      activityResult.status ===
      "fulfilled"
        ? activityResult.value
        : [];

    if (
      activityResult.status ===
      "rejected"
    ) {
      console.warn(
        `[${this.name}] 24h activity ranking unavailable; using deterministic catalog fallback.`,
        activityResult.reason,
      );
    }

    const externalMarkets =
      new Set(
        marketCache
          .getAll()
          .filter(
            (
              quote,
            ) =>
              quote.exchange
                .trim()
                .toLowerCase() !==
              "bybit",
          )
          .map(
            (
              quote,
            ) =>
              quote.market,
          ),
      );

    const selection =
      spotMarketUniverseSelector.select(
        catalog,
        activityEvidence,
        externalMarkets,
        maximumMarkets,
        "USDT",
        ["BTC", "ETH", "USDC"],
        0.2,
      );

    this.symbols =
      [...selection.selected];

    diagnostics.universeSelection =
      selection;

    console.log(
      `[${this.name}] Selected ${this.symbols.length} of ${catalog.length} active spot markets (primary=${selection.selectedPrimaryMarkets}, secondary=${selection.selectedSecondaryMarkets}, anchors=${selection.selectedAnchorMarkets}, overlap=${selection.selectedExternalOverlapMarkets}, activity=${selection.selectedWithActivityEvidence}, quotes=${JSON.stringify(selection.quoteDistribution)}, limit=${maximumMarkets}).`,
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
          BybitSocketMessage;

      if (
        this.isSubscriptionResponse(
          parsed,
        )
      ) {
        this.handleSubscriptionResponse(
          parsed,
        );

        return;
      }

      if (
        this.isPublicTradeMessage(
          parsed,
        )
      ) {
        this.handlePublicTradeMessage(
          parsed,
        );

        return;
      }

      if (
        this.isOrderBookMessage(
          parsed,
        )
      ) {
        this.handleOrderBookMessage(
          parsed,
        );

        return;
      }

      /*
       * Tickers remain available for future
       * analytics, but executable market data
       * is sourced exclusively from orderbook.50.
       */
      if (
        this.isTickerMessage(
          parsed,
        )
      ) {
        return;
      }
    } catch (
      error
    ) {
      diagnostics.invalidMessages +=
        1;

      console.error(
        `[${this.name}] Invalid market-data payload:`,
        error,
      );
    }
  }

  private handlePublicTradeMessage(
    message:
      BybitPublicTradeMessage,
  ): void {
    for (
      const trade
      of message.data
    ) {
      crossExchangeMarketMakingPublicTradeTapeService
        .record({
          id:
            `bybit:${trade.s}:${trade.i}`,
          exchange:
            "bybit",
          market:
            trade.s,
          price:
            Number(
              trade.p,
            ),
          quantity:
            Number(
              trade.v,
            ),
          occurredAt:
            trade.T,
          aggressorSide:
            trade.S ===
              "Buy"
              ? "BUY"
              : "SELL",
          source:
            "BYBIT_PUBLIC_TRADE",
        });
    }
  }

  private handleSubscriptionResponse(
    message:
      BybitSubscriptionResponse,
  ): void {
    if (
      message.op ===
      "pong"
    ) {
      return;
    }

    if (
      message.success ===
      false
    ) {
      bybitSubscriptionAuditService
        .recordReject();

      console.error(
        `[${this.name}] Subscription rejected:`,
        message,
      );

      return;
    }

    bybitSubscriptionAuditService
      .recordAck();

    /*
     * Avoid terminal flooding from many
     * successful subscription acknowledgements.
     */
  }

  private handleOrderBookMessage(
    message:
      BybitOrderBookMessage,
  ): void {
    const data =
      message.data;

    if (
      !data ||
      typeof data.s !==
        "string"
    ) {
      diagnostics.invalidMessages +=
        1;

      return;
    }

    const market =
      data.s
        .trim()
        .toUpperCase();

    if (
      market.length ===
      0
    ) {
      diagnostics.invalidMessages +=
        1;

      return;
    }

    const timestamp =
      this.resolveTimestamp(
        message,
      );

    /*
     * Bybit documentation:
     *
     * snapshot:
     * reset the complete local book.
     *
     * delta:
     * quantity 0 = delete level
     * absent level = insert
     * existing level = update.
     *
     * Bybit may also send update ID 1 when
     * its order-book service restarts.
     * Treat that as a fresh snapshot/reset.
     */
    const shouldReset =
      message.type ===
        "snapshot" ||
      data.u ===
        1;

    let localBook =
      this.localBooks.get(
        market,
      );

    if (
      shouldReset ||
      !localBook
    ) {
      localBook = {
        bids:
          new Map<
            number,
            number
          >(),

        asks:
          new Map<
            number,
            number
          >(),

        lastUpdateId:
          null,

        lastSequence:
          null,

        timestamp,
      };

      this.localBooks.set(
        market,
        localBook,
      );

      diagnostics.snapshotsReceived +=
        1;
    } else {
      diagnostics.deltasReceived +=
        1;
    }

    this.applyLevels(
      localBook.bids,
      data.b,
    );

    this.applyLevels(
      localBook.asks,
      data.a,
    );

    localBook.timestamp =
      timestamp;

    if (
      Number.isFinite(
        data.u,
      )
    ) {
      localBook.lastUpdateId =
        data.u ??
        null;
    }

    if (
      Number.isFinite(
        data.seq,
      )
    ) {
      localBook.lastSequence =
        data.seq ??
        null;
    }

    this.publishBook(
      market,
      localBook,
    );
  }

  private publishBook(
    market:
      string,

    localBook:
      LocalBybitOrderBook,
  ): void {
    const bids =
      this.mapToLevels(
        localBook.bids,
        "bid",
      );

    const asks =
      this.mapToLevels(
        localBook.asks,
        "ask",
      );

    if (
      bids.length ===
        0 ||
      asks.length ===
        0
    ) {
      diagnostics.emptyBooksRejected +=
        1;

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
      !bestAsk
    ) {
      diagnostics.emptyBooksRejected +=
        1;

      return;
    }

    if (
      bestAsk.price <
      bestBid.price
    ) {
      diagnostics.crossedBooksRejected +=
        1;

      return;
    }

    /*
     * Publish reconstructed full depth
     * snapshot into the shared cache.
     *
     * replace() is intentional:
     * Local Bybit state has already applied
     * all deltas and represents the complete
     * current top-50 book.
     */
    orderBookService.replace({
      exchange:
        "bybit",

      market,

      bids,

      asks,

      timestamp:
        localBook.timestamp,
    });

    const bestBidPrice =
      bestBid.price;

    const bestBidQty =
      bestBid.quantity;

    const bestAskPrice =
      bestAsk.price;

    const bestAskQty =
      bestAsk.quantity;

    const spread =
      bestAskPrice -
      bestBidPrice;

    const lastPrice =
      (
        bestBidPrice +
        bestAskPrice
      ) /
      2;

    const ticker:
      NormalizedTicker = {
      exchange:
        "bybit",

      market,

      lastPrice,

      bid:
        bestBidPrice,

      ask:
        bestAskPrice,

      bestBidPrice,

      bestBidQty,

      bestAskPrice,

      bestAskQty,

      spread,

      timestamp:
        localBook.timestamp,
    };

    marketCache.update(
      ticker,
    );

    this.tickerCallback?.(
      ticker,
    );

    /*
     * V19.19
     *
     * Feed-quality evidence is recorded only after a
     * valid reconstructed book has been published.
     */
    bybitSubscriptionAuditService
      .recordData(
        market,
      );

    this.markets.add(
      market,
    );

    this.lastUpdate =
      localBook.timestamp;

    diagnostics.booksPublished +=
      1;

    if (
      diagnostics.booksPublished ===
        1 ||
      diagnostics.booksPublished %
          5_000 ===
        0
    ) {
      console.log(
        `[${this.name}] Full order book: ${market} | bids=${bids.length} | asks=${asks.length} | bid=${bestBidPrice} | ask=${bestAskPrice} | cached=${orderBookService.size()} | published=${diagnostics.booksPublished}`,
      );
    }
  }

  private applyRestOrderBookSnapshot(
    market: string,
    payload: BybitRestOrderBookResponse,
    receivedAt: number,
  ): {readonly accepted: boolean; readonly reason: string | null} {
    if (
      payload?.retCode !== 0 ||
      !payload.result ||
      payload.result.s !== market ||
      !Array.isArray(payload.result.b) ||
      !Array.isArray(payload.result.a)
    ) {
      return {
        accepted: false,
        reason: typeof payload?.retMsg === "string" && payload.retMsg.trim()
          ? `Bybit order-book refresh was rejected: ${payload.retMsg.trim()}.`
          : "Bybit order-book refresh returned an invalid payload.",
      };
    }

    const localBook: LocalBybitOrderBook = {
      bids: new Map<number, number>(),
      asks: new Map<number, number>(),
      lastUpdateId: Number.isFinite(Number(payload.result.u))
        ? Number(payload.result.u)
        : null,
      lastSequence: Number.isFinite(Number(payload.result.seq))
        ? Number(payload.result.seq)
        : null,
      timestamp: receivedAt,
    };

    this.applyLevels(
      localBook.bids,
      payload.result.b as BybitOrderBookLevel[],
    );
    this.applyLevels(
      localBook.asks,
      payload.result.a as BybitOrderBookLevel[],
    );

    const bids = this.mapToLevels(localBook.bids, "bid");
    const asks = this.mapToLevels(localBook.asks, "ask");
    const bestBid = bids[0];
    const bestAsk = asks[0];

    if (!bestBid || !bestAsk) {
      return {
        accepted: false,
        reason: "Bybit order-book refresh has no valid two-sided depth.",
      };
    }

    if (bestAsk.price < bestBid.price) {
      return {
        accepted: false,
        reason: "Bybit order-book refresh is crossed.",
      };
    }

    this.localBooks.set(market, localBook);
    this.publishBook(market, localBook);

    const published = marketCache.get("bybit", market);
    if (!published?.executable || published.timestamp !== receivedAt) {
      return {
        accepted: false,
        reason: "Bybit order-book refresh was not published as executable depth.",
      };
    }

    return {accepted: true, reason: null};
  }

  private applyLevels(
    target:
      Map<number, number>,

    updates:
      BybitOrderBookLevel[]
      | undefined,
  ): void {
    if (
      !Array.isArray(
        updates,
      )
    ) {
      return;
    }

    for (
      const level
      of updates
    ) {
      if (
        !Array.isArray(
          level,
        ) ||
      level.length <
        2
      ) {
        continue;
      }

      const price =
        Number(
          level[
            0
          ],
        );

      const quantity =
        Number(
          level[
            1
          ],
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
      quantity <
        0
      ) {
        continue;
      }

      /*
       * Bybit delta contract:
       *
       * quantity === 0
       * means remove this price level.
       */
      if (
        quantity ===
        0
      ) {
        target.delete(
          price,
        );

        continue;
      }

      target.set(
        price,
        quantity,
      );
    }
  }

  private mapToLevels(
    source:
      Map<number, number>,

    side:
      "bid" |
      "ask",
  ): OrderBookLevel[] {
    const levels:
      OrderBookLevel[] =
      [];

    for (
      const [
        price,
        quantity,
      ]
      of source
    ) {
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

      levels.push({
        price,
        quantity,
      });
    }

    levels.sort(
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

    return levels.slice(
      0,
      BybitAdapter
        .ORDER_BOOK_DEPTH,
    );
  }

  private resolveTimestamp(
    message:
      BybitOrderBookMessage,
  ): number {
    const sourceTimestamp =
      message.cts ??
      message.ts ??
      null;

    const receivedAt =
      Date.now();

    if (
      Number.isFinite(
        sourceTimestamp,
      ) &&
      (sourceTimestamp ?? 0) >
        0
    ) {
      diagnostics.lastSourceTimestamp =
        sourceTimestamp as number;

      diagnostics.lastReceivedAt =
        receivedAt;

      diagnostics.lastObservedClockOffsetMs =
        (sourceTimestamp as number) -
        receivedAt;
    }

    /*
     * Keep venue time for diagnostics, but timestamp executable
     * evidence with local receipt time.  Freshness must not fail just
     * because Bybit's clock is a fraction ahead of the host clock.
     */
    return receivedAt;
  }

  private resolveMaximumMarkets():
    number {
    const rawValue =
      process.env.BYBIT_MAX_MARKETS;

    if (
      rawValue === undefined ||
      rawValue.trim().length ===
        0
    ) {
      return BybitAdapter
        .DEFAULT_MAX_MARKETS;
    }

    const parsed =
      Number(rawValue);

    if (
      !Number.isSafeInteger(
        parsed,
      ) ||
      parsed <=
        0
    ) {
      console.warn(
        `[${this.name}] Invalid BYBIT_MAX_MARKETS="${rawValue}". Using default ${BybitAdapter.DEFAULT_MAX_MARKETS}.`,
      );

      return BybitAdapter
        .DEFAULT_MAX_MARKETS;
    }

    return Math.min(
      parsed,
      BybitAdapter
        .ABSOLUTE_MAX_MARKETS,
    );
  }

  private normalizeSymbols(
    symbols:
      string[],
  ): string[] {
    return Array.from(
      new Set(
        symbols
          .map(
            (
              symbol,
            ) =>
              this.normalizeMarketSymbol(
                symbol,
              ),
          )
          .filter(
            (
              symbol,
            ) =>
              symbol.length >
              0,
          ),
      ),
    );
  }

  private normalizeMarketSymbol(
    symbol:
      string,
  ): string {
    return symbol
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }

  private isSubscriptionResponse(
    message:
      BybitSocketMessage,
  ): message is
    BybitSubscriptionResponse {
    return (
      typeof message ===
        "object" &&
      message !==
        null &&
      "op" in
        message &&
      !(
        "topic" in
        message
      )
    );
  }

  private isTickerMessage(
    message:
      BybitSocketMessage,
  ): message is
    BybitTickerMessage {
    return (
      typeof message ===
        "object" &&
      message !==
        null &&
      "topic" in
        message &&
      typeof message.topic ===
        "string" &&
      message.topic.startsWith(
        "tickers.",
      ) &&
      "data" in
        message
    );
  }

  private isPublicTradeMessage(
    message:
      BybitSocketMessage,
  ): message is
    BybitPublicTradeMessage {
    return (
      typeof message ===
        "object" &&
      message !==
        null &&
      "topic" in
        message &&
      typeof message.topic ===
        "string" &&
      message.topic.startsWith(
        "publicTrade.",
      ) &&
      "data" in
        message &&
      Array.isArray(
        message.data,
      )
    );
  }

  private isOrderBookMessage(
    message:
      BybitSocketMessage,
  ): message is
    BybitOrderBookMessage {
    return (
      typeof message ===
        "object" &&
      message !==
        null &&
      "topic" in
        message &&
      typeof message.topic ===
        "string" &&
      message.topic.startsWith(
        `orderbook.${BybitAdapter.ORDER_BOOK_DEPTH}.`,
      ) &&
      "data" in
        message
    );
  }

  private startHeartbeat():
    void {
    this.stopHeartbeat();

    this.heartbeatTimer =
      setInterval(
        () => {
          if (
            !this.socket ||
            this.socket
              .readyState !==
              WebSocket.OPEN
          ) {
            return;
          }

          this.socket.send(
            JSON.stringify({
              op:
                "ping",
            }),
          );
        },
        BybitAdapter
          .HEARTBEAT_INTERVAL_MS,
      );
  }

  private stopHeartbeat():
    void {
    if (
      !this.heartbeatTimer
    ) {
      return;
    }

    clearInterval(
      this.heartbeatTimer,
    );

    this.heartbeatTimer =
      null;
  }

  private scheduleReconnect():
    void {
    if (
      this.reconnectTimer ||
      this.manuallyDisconnected
    ) {
      return;
    }

    console.log(
      `[${this.name}] Reconnecting in ${BYBIT.RECONNECT_DELAY}ms...`,
    );

    this.reconnectTimer =
      setTimeout(
        () => {
          this.reconnectTimer =
            null;

          void this
            .connect()
            .catch(
              (
                error:
                  unknown,
              ) => {
                console.error(
                  `[${this.name}] Reconnection failed:`,
                  error,
                );

                this.scheduleReconnect();
              },
            );
        },
        BYBIT
          .RECONNECT_DELAY,
      );
  }

  private chunk<T>(
    items:
      readonly T[],

    size:
      number,
  ): T[][] {
    if (
      !Number.isSafeInteger(
        size,
      ) ||
      size <=
        0
    ) {
      throw new Error(
        "Bybit subscription batch size must be a positive integer.",
      );
    }

    const chunks:
      T[][] =
      [];

    for (
      let index =
        0;
      index <
        items.length;
      index +=
        size
    ) {
      chunks.push(
        items.slice(
          index,
          index +
            size,
        ),
      );
    }

    return chunks;
  }

  private sleep(
    milliseconds:
      number,
  ): Promise<void> {
    return new Promise(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
}
