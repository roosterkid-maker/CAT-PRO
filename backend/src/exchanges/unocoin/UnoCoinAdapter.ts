import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  ExchangeAdapter,
} from "../core/ExchangeAdapter";

import type {
  NormalizedTicker,
} from "../coindcx/types";

import {
  UNOCOIN,
} from "./constants";

import {
  canonicalizeUnoCoinMarket,
  normalizeUnoCoinMarket,
  normalizeUnoCoinOrderBook,
  normalizeUnoCoinTicker,
} from "./normalize";

import {
  unoCoinPublicApi,
  type UnoCoinPublicMarketApi,
} from "./UnoCoinPublicApi";

import type {
  UnoCoinPair,
  UnoCoinTicker,
} from "./types";

interface UnoCoinAvailableMarket {
  tickerId: string;

  canonicalMarket: string;
}

export interface UnoCoinAdapterDiagnostics {
  pairsLoaded: number;

  tickersLoaded: number;

  subscribedMarkets: number;

  subscribedMarketIds:
    readonly string[];

  successfulPublicReads: number;

  failedPublicReads: number;

  validBooksPublished: number;

  rejectedBooks: number;

  quarantinedMarkets: number;

  activeQuarantinedMarkets: number;

  activeQuarantinedMarketIds:
    readonly string[];

  quarantineRecoveries: number;

  quarantineCooldownMs: number;

  orderBookRefreshMs: number;

  maximumConcurrentBookReads: number;

  transientFailuresRetained: number;

  lastSuccessfulReadAt:
    number | null;

  lastBookReceivedAt:
    number | null;

  lastBookSourceTimestamp:
    number | null;
}

export interface UnoCoinAdapterOptions {
  api?:
    UnoCoinPublicMarketApi;

  now?:
    () => number;

  scheduleTimers?:
    boolean;
}

export class UnoCoinAdapter
  implements ExchangeAdapter
{
  readonly name =
    UNOCOIN.NAME;

  private readonly api:
    UnoCoinPublicMarketApi;

  private readonly now:
    () => number;

  private readonly scheduleTimers:
    boolean;

  private readonly availableMarkets =
    new Map<
      string,
      UnoCoinAvailableMarket
    >();

  private readonly subscribedMarkets =
    new Map<
      string,
      string
    >();

  private readonly publishedMarkets =
    new Set<string>();

  private readonly consecutiveBookFailures =
    new Map<
      string,
      number
    >();

  /*
   * V20.9 Build 4B.1
   *
   * A quarantined market is not immediately eligible for
   * dynamic reselection.
   */
  private readonly quarantinedUntilByMarket =
    new Map<
      string,
      number
    >();

  private connected =
    false;

  private lastUpdate =
    0;

  private tickerRefreshTimer:
    NodeJS.Timeout | null =
    null;

  private orderBookRefreshTimer:
    NodeJS.Timeout | null =
    null;

  private tickerRefreshInProgress =
    false;

  private orderBookRefreshInProgress =
    false;

  private tickerCallback:
    | ((
        ticker:
          NormalizedTicker,
      ) => void)
    | null =
    null;

  private readonly diagnostics:
    UnoCoinAdapterDiagnostics = {
    pairsLoaded:
      0,

    tickersLoaded:
      0,

    subscribedMarkets:
      0,

    subscribedMarketIds:
      [],

    successfulPublicReads:
      0,

    failedPublicReads:
      0,

    validBooksPublished:
      0,

    rejectedBooks:
      0,

    quarantinedMarkets:
      0,

    activeQuarantinedMarkets:
      0,

    activeQuarantinedMarketIds:
      [],

    quarantineRecoveries:
      0,

    quarantineCooldownMs:
      0,

    orderBookRefreshMs:
      UNOCOIN.ORDER_BOOK_REFRESH_MS,

    maximumConcurrentBookReads:
      UNOCOIN.MAXIMUM_CONCURRENT_BOOK_READS,

    transientFailuresRetained:
      0,

    lastSuccessfulReadAt:
      null,

    lastBookReceivedAt:
      null,

    lastBookSourceTimestamp:
      null,
  };

  constructor(
    options:
      UnoCoinAdapterOptions = {},
  ) {
    this.api =
      options.api ??
      unoCoinPublicApi;

    this.now =
      options.now ??
      (() =>
        Date.now());

    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.diagnostics
      .maximumConcurrentBookReads =
      this.resolveMaximumConcurrentBookReads();
  }

  async connect():
    Promise<void> {
    if (
      this.connected &&
      this.isConnected()
    ) {
      return;
    }

    this.stopTimers();

    this.connected =
      false;

    const [
      pairs,
      tickers,
    ] =
      await Promise.all([
        this.api.getPairs(),
        this.api.getTickers(),
      ]);

    this.diagnostics
      .successfulPublicReads +=
      2;

    this.recordSuccessfulRead();

    this.rebuildAvailableMarkets(
      pairs,
      tickers,
    );

    if (
      this.availableMarkets.size ===
        0
    ) {
      throw new Error(
        "UnoCoin returned no valid public exchange markets.",
      );
    }

    this.publishTickers(
      tickers,
    );

    this.connected =
      true;

    this.startTickerRefreshTimer();

    console.log(
      `[${this.name}] Public REST snapshot source connected with ${this.availableMarkets.size} validated ticker markets. LIVE execution remains unavailable.`,
    );
  }

  async disconnect():
    Promise<void> {
    this.connected =
      false;

    this.stopTimers();

    for (
      const market
      of this.publishedMarkets
    ) {
      marketCache
        .invalidateExecutable(
          this.name,
          market,
        );

      orderBookService
        .remove(
          this.name,
          market,
        );
    }

    this.availableMarkets
      .clear();

    this.subscribedMarkets
      .clear();

    this.publishedMarkets
      .clear();

    this.consecutiveBookFailures
      .clear();

    this.quarantinedUntilByMarket
      .clear();

    this.diagnostics
      .activeQuarantinedMarkets =
      0;

    this.diagnostics
      .subscribedMarkets =
      0;
  }

  async subscribe(
    markets: string[],
  ): Promise<void> {
    if (!this.connected) {
      throw new Error(
        "UnoCoin public market data is not connected.",
      );
    }

    const selectedMarkets =
      this.selectAvailableMarkets(
        markets,
      );

    const nextMarkets =
      new Map(
        selectedMarkets.map(
          (market) => [
            market.canonicalMarket,
            market.tickerId,
          ] as const,
        ),
      );

    /*
     * V20.9 Build 4B.1
     *
     * Incremental reconciliation preserves failure evidence.
     */
    for (
      const [
        canonicalMarket,
        tickerId,
      ]
      of [
        ...this.subscribedMarkets
          .entries(),
      ]
    ) {
      const nextTickerId =
        nextMarkets.get(
          canonicalMarket,
        );

      if (
        nextTickerId ===
        tickerId
      ) {
        nextMarkets.delete(
          canonicalMarket,
        );

        continue;
      }

      this.subscribedMarkets
        .delete(
          canonicalMarket,
        );

      this.invalidateExecutableMarket(
        tickerId,
      );
    }

    for (
      const [
        canonicalMarket,
        tickerId,
      ]
      of nextMarkets
    ) {
      this.subscribedMarkets
        .set(
          canonicalMarket,
          tickerId,
        );
    }

    this.diagnostics
      .subscribedMarkets =
      this.subscribedMarkets
        .size;

    if (
      this.subscribedMarkets.size ===
        0
    ) {
      this.stopOrderBookRefreshTimer();

      console.warn(
        `[${this.name}] No requested non-quarantined markets matched the validated public market catalog.`,
      );

      return;
    }

    await this.refreshOrderBooks();

    this.startOrderBookRefreshTimer();

    console.log(
      `[${this.name}] Polling validated REST order-book snapshots for ${this.subscribedMarkets.size} shared markets.`,
    );
  }

  async unsubscribe(
    markets: string[],
  ): Promise<void> {
    for (
      const market
      of markets
    ) {
      const canonicalMarket =
        canonicalizeUnoCoinMarket(
          market,
        );

      const tickerId =
        this.subscribedMarkets
          .get(
            canonicalMarket,
          );

      if (!tickerId) {
        continue;
      }

      this.subscribedMarkets
        .delete(
          canonicalMarket,
        );

      this.invalidateExecutableMarket(
        tickerId,
      );
    }

    this.diagnostics
      .subscribedMarkets =
      this.subscribedMarkets
        .size;

    if (
      this.subscribedMarkets.size ===
        0
    ) {
      this.stopOrderBookRefreshTimer();
    }
  }

  isConnected():
    boolean {
    const lastSuccessfulReadAt =
      this.diagnostics
        .lastSuccessfulReadAt;

    if (
      !this.connected ||
      lastSuccessfulReadAt ===
        null
    ) {
      return false;
    }

    const maximumAge =
      this.resolveTickerRefreshMs() *
      UNOCOIN
        .CONNECTION_STALE_MULTIPLIER;

    return (
      this.now() -
        lastSuccessfulReadAt <=
      maximumAge
    );
  }

  getMarketCount():
    number {
    return this.publishedMarkets
      .size;
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

  getAvailableMarkets():
    string[] {
    return [
      ...this.availableMarkets
        .values(),
    ]
      .map(
        (market) =>
          market.tickerId,
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.localeCompare(
            second,
          ),
      );
  }

  getDiagnostics():
    UnoCoinAdapterDiagnostics {
    this.releaseExpiredQuarantines();

    this.diagnostics
      .activeQuarantinedMarkets =
      this.quarantinedUntilByMarket
        .size;

    this.diagnostics
      .subscribedMarketIds = [
      ...this.subscribedMarkets.values(),
    ];

    this.diagnostics
      .activeQuarantinedMarketIds = [
      ...this.quarantinedUntilByMarket.keys(),
    ];

    this.diagnostics
      .quarantineCooldownMs =
      this.resolveQuarantineCooldownMs();

    this.diagnostics
      .orderBookRefreshMs =
      this.resolveOrderBookRefreshMs();

    return {
      ...this.diagnostics,
    };
  }

  private rebuildAvailableMarkets(
    pairs:
      UnoCoinPair[],

    tickers:
      UnoCoinTicker[],
  ): void {
    const documentedPairs =
      new Set(
        pairs
          .map(
            (pair) =>
              canonicalizeUnoCoinMarket(
                pair.ticker_id,
              ),
          )
          .filter(
            (market) =>
              market.length >
              0,
          ),
      );

    const nextAvailableMarkets =
      new Map<
        string,
        UnoCoinAvailableMarket
      >();

    for (
      const ticker
      of tickers
    ) {
      const tickerId =
        normalizeUnoCoinMarket(
          ticker.ticker_id,
        );

      const canonicalMarket =
        canonicalizeUnoCoinMarket(
          tickerId,
        );

      if (
        !tickerId ||
        !canonicalMarket ||
        !documentedPairs.has(
          canonicalMarket,
        )
      ) {
        continue;
      }

      nextAvailableMarkets.set(
        canonicalMarket,
        {
          tickerId,

          canonicalMarket,
        },
      );
    }

    this.availableMarkets
      .clear();

    for (
      const [
        canonicalMarket,
        market,
      ]
      of nextAvailableMarkets
    ) {
      this.availableMarkets
        .set(
          canonicalMarket,
          market,
        );
    }

    this.diagnostics
      .pairsLoaded =
      documentedPairs.size;

    this.diagnostics
      .tickersLoaded =
      nextAvailableMarkets.size;
  }

  private publishTickers(
    tickers:
      UnoCoinTicker[],
  ): void {
    const receivedAt =
      this.now();

    for (
      const incomingTicker
      of tickers
    ) {
      const normalized =
        normalizeUnoCoinTicker(
          incomingTicker,
          receivedAt,
        );

      if (!normalized) {
        continue;
      }

      if (
        !this.availableMarkets
          .has(
            normalized
              .canonicalMarket,
          )
      ) {
        continue;
      }

      marketCache.update(
        normalized.ticker,
      );

      this.tickerCallback?.(
        normalized.ticker,
      );

      this.lastUpdate =
        Math.max(
          this.lastUpdate,
          receivedAt,
        );
    }
  }

  private async refreshTickers():
    Promise<void> {
    if (
      !this.connected ||
      this.tickerRefreshInProgress
    ) {
      return;
    }

    this.tickerRefreshInProgress =
      true;

    try {
      const tickers =
        await this.api
          .getTickers();

      this.diagnostics
        .successfulPublicReads +=
        1;

      this.recordSuccessfulRead();

      this.publishTickers(
        tickers,
      );
    } catch (
      error
    ) {
      this.diagnostics
        .failedPublicReads +=
        1;

      console.error(
        `[${this.name}] Public ticker refresh failed:`,
        error instanceof Error
          ? error.message
          : error,
      );
    } finally {
      this.tickerRefreshInProgress =
        false;
    }
  }

  private async refreshOrderBooks():
    Promise<void> {
    if (
      !this.connected ||
      this.orderBookRefreshInProgress ||
      this.subscribedMarkets.size ===
        0
    ) {
      return;
    }

    this.orderBookRefreshInProgress =
      true;

    try {
      const tickerIds = [
        ...this.subscribedMarkets
          .values(),
      ];

      let nextIndex =
        0;

      const workers =
        Array.from(
          {
            length:
              Math.min(
                this.diagnostics
                  .maximumConcurrentBookReads,
                tickerIds.length,
              ),
          },
          async () => {
            while (
              nextIndex <
              tickerIds.length
            ) {
              const tickerId =
                tickerIds[
                  nextIndex
                ];

              nextIndex +=
                1;

              if (tickerId) {
                await this
                  .refreshOrderBook(
                    tickerId,
                  );
              }
            }
          },
        );

      await Promise.all(
        workers,
      );
    } finally {
      this.orderBookRefreshInProgress =
        false;
    }
  }

  private async refreshOrderBook(
    tickerId: string,
  ): Promise<void> {
    try {
      const incomingBook =
        await this.api
          .getOrderBook(
            tickerId,
            UNOCOIN
              .ORDER_BOOK_DEPTH,
          );

      const receivedAt =
        this.now();

      this.diagnostics
        .successfulPublicReads +=
        1;

      this.recordSuccessfulRead(
        receivedAt,
      );

      const book =
        normalizeUnoCoinOrderBook(
          incomingBook,
          tickerId,
          receivedAt,
        );

      if (!book) {
        this.diagnostics
          .rejectedBooks +=
          1;

        this.recordBookFailure(
          tickerId,
          "invalid or crossed snapshot",
        );

        return;
      }

      const replacement =
        orderBookService
        .replace({
        exchange:
          this.name,

        market:
          book.canonicalMarket,

        bids:
          book.bids,

        asks:
          book.asks,

        timestamp:
          book.receivedAt,
      });

      /*
       * MarketCache and OrderBookService must advance atomically. Publishing
       * an executable quote after the authoritative book store rejected the
       * same snapshot creates a UI opportunity that the capital optimizer
       * cannot execute. Keep the previous still-fresh book on an isolated bad
       * poll; the existing three-strike and freshness eviction policies remain
       * the fail-closed invalidation owners.
       */
      if (
        !replacement.accepted
      ) {
        this.diagnostics
          .rejectedBooks +=
          1;

        this.recordBookFailure(
          tickerId,
          `authoritative store rejected snapshot: ${replacement.reason}`,
        );

        return;
      }

      const bestBid =
        book.bids[0];

      const bestAsk =
        book.asks[0];

      if (
        !bestBid ||
        !bestAsk
      ) {
        this.diagnostics
          .rejectedBooks +=
          1;

        this.invalidateExecutableMarket(
          tickerId,
        );

        return;
      }

      const ticker:
        NormalizedTicker = {
      exchange:
        this.name,

      market:
        book.canonicalMarket,

      lastPrice:
        (
          bestBid.price +
          bestAsk.price
        ) /
        2,

      bid:
        bestBid.price,

      ask:
        bestAsk.price,

      bestBidPrice:
        bestBid.price,

      bestBidQty:
        bestBid.quantity,

      bestAskPrice:
        bestAsk.price,

      bestAskQty:
        bestAsk.quantity,

      spread:
        bestAsk.price -
        bestBid.price,

      timestamp:
        book.receivedAt,
    };

      marketCache.update(
        ticker,
      );

      this.tickerCallback?.(
        ticker,
      );

      this.publishedMarkets.add(
        book.canonicalMarket,
      );

      this.lastUpdate =
        Math.max(
          this.lastUpdate,
          book.receivedAt,
        );

      this.diagnostics
        .validBooksPublished +=
        1;

      this.diagnostics
        .lastBookReceivedAt =
        book.receivedAt;

      this.diagnostics
        .lastBookSourceTimestamp =
        book.sourceTimestamp;

      this.consecutiveBookFailures
        .delete(
          book.canonicalMarket,
        );

      if (
        this.quarantinedUntilByMarket
          .delete(
            book.canonicalMarket,
          )
      ) {
        this.diagnostics
          .quarantineRecoveries +=
          1;
      }

      this.diagnostics
        .activeQuarantinedMarkets =
        this.quarantinedUntilByMarket
          .size;
    } catch (
      error
    ) {
      this.diagnostics
        .failedPublicReads +=
        1;

      const normalizedMarket =
        normalizeUnoCoinMarket(
          tickerId,
        );

      const canonicalMarket =
        canonicalizeUnoCoinMarket(
          tickerId,
        );

      const nextFailureCount =
        (
          this.consecutiveBookFailures
            .get(
              canonicalMarket,
            ) ??
          0
        ) +
        1;

      if (
        normalizedMarket &&
        this.publishedMarkets.has(
          canonicalMarket,
        ) &&
        nextFailureCount <
          UNOCOIN
            .MAXIMUM_CONSECUTIVE_BOOK_FAILURES
      ) {
        this.diagnostics
          .transientFailuresRetained +=
          1;
      }

      this.recordBookFailure(
        tickerId,
        error instanceof Error
          ? error.message
          : "unknown public API failure",
      );
    }
  }

  private recordBookFailure(
    tickerId: string,
    reason: string,
  ): void {
    const canonicalMarket =
      canonicalizeUnoCoinMarket(
        tickerId,
      );

    if (!canonicalMarket) {
      return;
    }

    const failureCount =
      (
        this.consecutiveBookFailures
          .get(
            canonicalMarket,
          ) ??
        0
      ) +
      1;

    this.consecutiveBookFailures
      .set(
        canonicalMarket,
        failureCount,
      );

    if (
      failureCount <
        UNOCOIN
          .MAXIMUM_CONSECUTIVE_BOOK_FAILURES
    ) {
      if (
        failureCount ===
          1
      ) {
        console.warn(
          `[${this.name}] Order-book evidence rejected for ${tickerId}; retry remains bounded. Reason: ${reason}`,
        );
      }

      return;
    }

    this.subscribedMarkets
      .delete(
        canonicalMarket,
      );

    this.invalidateExecutableMarket(
      tickerId,
    );

    this.diagnostics
      .subscribedMarkets =
      this.subscribedMarkets
        .size;

    this.diagnostics
      .quarantinedMarkets +=
      1;

    const quarantineUntil =
      this.now() +
      this.resolveQuarantineCooldownMs();

    this.quarantinedUntilByMarket
      .set(
        canonicalMarket,
        quarantineUntil,
      );

    this.diagnostics
      .activeQuarantinedMarkets =
      this.quarantinedUntilByMarket
        .size;

    console.warn(
      `[${this.name}] Quarantined ${tickerId} after ${failureCount} consecutive invalid depth attempts until ${new Date(quarantineUntil).toISOString()}. Reason: ${reason}`,
    );

    if (
      this.subscribedMarkets.size ===
        0
    ) {
      this.stopOrderBookRefreshTimer();
    }
  }

  private selectAvailableMarkets(
    requestedMarkets:
      readonly string[],
  ): UnoCoinAvailableMarket[] {
    this.releaseExpiredQuarantines();

    const selected =
      new Map<
        string,
        UnoCoinAvailableMarket
      >();

    for (
      const market
      of requestedMarkets
    ) {
      const canonicalMarket =
        canonicalizeUnoCoinMarket(
          market,
        );

      const availableMarket =
        this.availableMarkets
          .get(
            canonicalMarket,
          );

      if (
        availableMarket &&
        !this.isMarketQuarantined(
          canonicalMarket,
        )
      ) {
        selected.set(
          canonicalMarket,
          availableMarket,
        );
      }
    }

    /*
     * The manager supplies a deterministic, price-aligned priority order.
     * Preserve it so scarce REST polling slots are spent on the strongest
     * current cross-exchange discovery candidates instead of alphabetical
     * markets or permanently fixed symbols.
     */
    return [
      ...selected.values(),
    ].slice(
        0,
        this.resolveMaximumOrderBookMarkets(),
      );
  }

  private isMarketQuarantined(
    canonicalMarket: string,
  ): boolean {
    const quarantineUntil =
      this.quarantinedUntilByMarket
        .get(
          canonicalMarket,
        );

    if (
      quarantineUntil ===
      undefined
    ) {
      return false;
    }

    if (
      quarantineUntil >
      this.now()
    ) {
      return true;
    }

    this.quarantinedUntilByMarket
      .delete(
        canonicalMarket,
      );

    this.consecutiveBookFailures
      .delete(
        canonicalMarket,
      );

    this.diagnostics
      .quarantineRecoveries +=
      1;

    this.diagnostics
      .activeQuarantinedMarkets =
      this.quarantinedUntilByMarket
        .size;

    return false;
  }

  private releaseExpiredQuarantines():
    void {
    const now =
      this.now();

    for (
      const [
        canonicalMarket,
        quarantineUntil,
      ]
      of [
        ...this.quarantinedUntilByMarket
          .entries(),
      ]
    ) {
      if (
        quarantineUntil >
        now
      ) {
        continue;
      }

      this.quarantinedUntilByMarket
        .delete(
          canonicalMarket,
        );

      this.consecutiveBookFailures
        .delete(
          canonicalMarket,
        );

      this.diagnostics
        .quarantineRecoveries +=
        1;
    }

    this.diagnostics
      .activeQuarantinedMarkets =
      this.quarantinedUntilByMarket
        .size;
  }

  private resolveQuarantineCooldownMs():
    number {
    return this.resolveBoundedInteger(
      process.env
        .UNOCOIN_QUARANTINE_COOLDOWN_MS,

      5 *
        60 *
        1_000,

      30_000,

      60 *
        60 *
        1_000,
    );
  }

  private invalidateExecutableMarket(
    market: string,
  ): void {
    const canonicalMarket =
      canonicalizeUnoCoinMarket(
        market,
      );

    if (!canonicalMarket) {
      return;
    }

    marketCache
      .invalidateExecutable(
        this.name,
        canonicalMarket,
      );

    orderBookService
      .remove(
        this.name,
        canonicalMarket,
      );

    this.publishedMarkets
      .delete(
        canonicalMarket,
      );
  }

  private recordSuccessfulRead(
    timestamp =
      this.now(),
  ): void {
    this.diagnostics
      .lastSuccessfulReadAt =
      timestamp;
  }

  private startTickerRefreshTimer():
    void {
    if (
      !this.scheduleTimers ||
      this.tickerRefreshTimer
    ) {
      return;
    }

    this.tickerRefreshTimer =
      setInterval(
        () => {
          void this
            .refreshTickers();
        },
        this.resolveTickerRefreshMs(),
      );
  }

  private startOrderBookRefreshTimer():
    void {
    if (
      !this.scheduleTimers ||
      this.orderBookRefreshTimer
    ) {
      return;
    }

    this.orderBookRefreshTimer =
      setInterval(
        () => {
          void this
            .refreshOrderBooks();
        },
        this.resolveOrderBookRefreshMs(),
      );
  }

  private stopTimers():
    void {
    if (
      this.tickerRefreshTimer
    ) {
      clearInterval(
        this.tickerRefreshTimer,
      );

      this.tickerRefreshTimer =
        null;
    }

    this.stopOrderBookRefreshTimer();
  }

  private stopOrderBookRefreshTimer():
    void {
    if (
      !this.orderBookRefreshTimer
    ) {
      return;
    }

    clearInterval(
      this.orderBookRefreshTimer,
    );

    this.orderBookRefreshTimer =
      null;
  }

  private resolveTickerRefreshMs():
    number {
    return this.resolveBoundedInteger(
      process.env
        .UNOCOIN_TICKER_REFRESH_MS,

      UNOCOIN
        .TICKER_REFRESH_MS,

      UNOCOIN
        .MINIMUM_TICKER_REFRESH_MS,

      10 *
        60 *
        1_000,
    );
  }

  private resolveOrderBookRefreshMs():
    number {
    return this.resolveBoundedInteger(
      process.env
        .UNOCOIN_ORDER_BOOK_REFRESH_MS,

      UNOCOIN
        .ORDER_BOOK_REFRESH_MS,

      UNOCOIN
        .MINIMUM_ORDER_BOOK_REFRESH_MS,

      5 *
        60 *
        1_000,
    );
  }

  private resolveMaximumOrderBookMarkets():
    number {
    return this.resolveBoundedInteger(
      process.env
        .UNOCOIN_MAX_ORDER_BOOK_MARKETS,

      UNOCOIN
        .DEFAULT_MAX_ORDER_BOOK_MARKETS,

      1,

      UNOCOIN
        .ABSOLUTE_MAX_ORDER_BOOK_MARKETS,
    );
  }

  private resolveMaximumConcurrentBookReads():
    number {
    return this.resolveBoundedInteger(
      process.env
        .UNOCOIN_MAX_CONCURRENT_BOOK_READS,

      UNOCOIN
        .MAXIMUM_CONCURRENT_BOOK_READS,

      1,

      UNOCOIN
        .ABSOLUTE_MAXIMUM_CONCURRENT_BOOK_READS,
    );
  }

  private resolveBoundedInteger(
    rawValue:
      string | undefined,

    fallback:
      number,

    minimum:
      number,

    maximum:
      number,
  ): number {
    if (
      rawValue ===
        undefined ||
      rawValue
        .trim()
        .length ===
        0
    ) {
      return fallback;
    }

    const parsed =
      Number(
        rawValue,
      );

    if (
      !Number.isSafeInteger(
        parsed,
      )
    ) {
      return fallback;
    }

    return Math.min(
      maximum,
      Math.max(
        minimum,
        parsed,
      ),
    );
  }
}
