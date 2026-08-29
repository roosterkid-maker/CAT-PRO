import {
  tickerToExecutableQuote,
} from "../core/mappers/tickerMapper";

import type {
  ExecutableQuote,
} from "../core/models/ExecutableQuote";

import type {
  NormalizedTicker,
} from "../exchanges/coindcx/types";

import {
  getIO,
} from "../socket/server";

type MarketCacheInput =
  | NormalizedTicker
  | ExecutableQuote;

export interface MarketCacheExecutableUpdate {
  exchange: string;

  market: string;

  timestamp: number;

  kind:
    | "UPSERT"
    | "INVALIDATED"
    | "REMOVED"
    | "CLEARED";
}

export type MarketCacheExecutableUpdateListener =
  (
    update:
      MarketCacheExecutableUpdate,
  ) => void;

class MarketCache {
  private static readonly UI_BATCH_INTERVAL_MS =
    100;

  private readonly markets =
    new Map<
      string,
      ExecutableQuote
    >();

  /*
   * Read-side indexes keep diagnostics and the opportunity scanner from
   * repeatedly walking the complete multi-exchange ticker catalog. They are
   * updated in the same synchronous mutation as the authoritative map.
   */
  private readonly marketsByExchange =
    new Map<
      string,
      Map<string, ExecutableQuote>
    >();

  private readonly executableMarkets =
    new Map<
      string,
      ExecutableQuote
    >();

  private readonly executableMarketsByExchange =
    new Map<
      string,
      Map<string, ExecutableQuote>
    >();

  /*
   * V115 hot-path admission index. Most five-exchange executable updates
   * belong to a market currently present on only one venue and therefore
   * cannot create a cross-exchange opportunity. Keep an O(1) market -> venue
   * index so the event-driven scanner can suppress that noise without ever
   * suppressing the second venue that makes a route possible.
   */
  private readonly executableMarketsByMarket =
    new Map<
      string,
      Map<string, ExecutableQuote>
    >();

  private readonly executableUpdateListeners =
    new Set<
      MarketCacheExecutableUpdateListener
    >();

  private readonly pendingUiQuotes =
    new Map<
      string,
      ExecutableQuote
    >();

  private uiBatchTimer:
    NodeJS.Timeout | null =
    null;

  update(
    input:
      MarketCacheInput,
  ): void {
    /*
     * -------------------------------------------------
     * EXECUTABLE FRESHNESS INTEGRITY
     * -------------------------------------------------
     *
     * Not every NormalizedTicker represents fresh
     * executable market data.
     *
     * Ordinary ticker / last-price updates must NEVER
     * refresh an old executable bid/ask timestamp.
     *
     * However Binance and Bybit depth adapters publish
     * a NormalizedTicker containing:
     *
     * - bestBidPrice
     * - bestBidQty
     * - bestAskPrice
     * - bestAskQty
     *
     * When all four values form a valid executable
     * top-of-book, that payload IS fresh executable
     * market data and is allowed to refresh:
     *
     * - bid
     * - ask
     * - quantities
     * - executable state
     * - executable timestamp
     *
     * This distinction prevents stale executable quotes
     * without allowing ordinary ticker messages to fake
     * order-book freshness.
     */

    const incomingIsExecutableQuote =
      this.isExecutableQuote(
        input,
      );

    const quote =
      incomingIsExecutableQuote
        ? this.normalizeExecutableQuote(
            input,
          )
        : this.normalizeExecutableQuote(
            tickerToExecutableQuote(
              input,
            ),
          );

    if (
      !quote
    ) {
      return;
    }

    const incomingRefreshesExecutableState =
      incomingIsExecutableQuote ||
      this.normalizedTickerCarriesExecutableTopOfBook(
        input,
      );

    const key =
      this.createKey(
        quote.exchange,
        quote.market,
      );

    const previousQuote =
      this.markets.get(
        key,
      );

    const mergedQuote =
      this.mergeQuotes(
        previousQuote,
        quote,
        incomingRefreshesExecutableState,
      );

    this.markets.set(
      key,
      mergedQuote,
    );

    this.indexQuote(
      key,
      mergedQuote,
    );

    if (
      incomingRefreshesExecutableState &&
      (
        mergedQuote.executable ||
        previousQuote?.executable ===
          true
      )
    ) {
      this.publishExecutableUpdate({
        exchange:
          mergedQuote.exchange,

        market:
          mergedQuote.market,

        timestamp:
          mergedQuote.timestamp,

        kind:
          "UPSERT",
      });
    }

    this.queueUiQuote(
      key,
      mergedQuote,
    );
  }

  get(
    exchange:
      string,

    market:
      string,
  ): ExecutableQuote | undefined {
    return this.markets.get(
      this.createKey(
        exchange,
        market,
      ),
    );
  }

  getAll():
    ExecutableQuote[] {
    return Array.from(
      this.markets.values(),
    );
  }

  getByExchange(
    exchange:
      string,
  ): ExecutableQuote[] {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    return Array.from(
      this.marketsByExchange
        .get(
          normalizedExchange,
        )
        ?.values() ??
        [],
    );
  }

  getExecutable():
    ExecutableQuote[] {
    return Array.from(
      this.executableMarkets
        .values(),
    );
  }

  getExecutableByExchange(
    exchange:
      string,
  ): ExecutableQuote[] {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    return Array.from(
      this.executableMarketsByExchange
        .get(
          normalizedExchange,
        )
        ?.values() ??
        [],
    );
  }

  size():
    number {
    return this.markets.size;
  }

  sizeByExchange(
    exchange:
      string,
  ): number {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    return this.marketsByExchange
      .get(
        normalizedExchange,
      )
      ?.size ??
      0;
  }

  executableSize():
    number {
    return this.executableMarkets
      .size;
  }

  /**
   * Read-only traversal for the Strategy #1 scanner. Reuses the cache's
   * existing market index instead of flattening and regrouping every quote.
   */
  executableMarketEntries():
    IterableIterator<
      [
        string,
        ReadonlyMap<
          string,
          ExecutableQuote
        >,
      ]
    > {
    return this.executableMarketsByMarket
      .entries();
  }

  /**
   * O(1) read for an event-driven rescan of one changed market. The returned
   * map is the same authoritative read-only index used by the full scanner;
   * no quote array or universe-wide grouping is allocated here.
   */
  getExecutableMarketQuotes(
    market:
      string,
  ): ReadonlyMap<
    string,
    ExecutableQuote
  > | undefined {
    const normalizedMarket =
      market
        .trim()
        .toUpperCase();

    if (!normalizedMarket) {
      return undefined;
    }

    return this.executableMarketsByMarket
      .get(
        normalizedMarket,
      );
  }

  getExecutableExchangeCountForMarket(
    market:
      string,
  ): number {
    const normalizedMarket =
      market
        .trim()
        .toUpperCase();

    if (!normalizedMarket) {
      return 0;
    }

    return this.executableMarketsByMarket
      .get(
        normalizedMarket,
      )
      ?.size ??
      0;
  }

  /**
   * Subscribe to genuine executable-book mutations. Ticker-only traffic is
   * deliberately excluded so downstream hot paths are not awakened by data
   * that cannot create, alter, or invalidate an executable opportunity.
   */
  subscribeToExecutableUpdates(
    listener:
      MarketCacheExecutableUpdateListener,
  ): () => void {
    this.executableUpdateListeners
      .add(
        listener,
      );

    return () => {
      this.executableUpdateListeners
        .delete(
          listener,
        );
    };
  }

  /*
   * Explicitly invalidate executable top-of-book data.
   *
   * Used when:
   *
   * - executable quote becomes stale
   * - subscription is released
   * - subscription fails
   * - executable market data is intentionally removed
   *
   * lastPrice remains available for market discovery.
   */
  invalidateExecutable(
    exchange:
      string,

    market:
      string,
  ): boolean {
    const key =
      this.createKey(
        exchange,
        market,
      );

    const previousQuote =
      this.markets.get(
        key,
      );

    if (
      !previousQuote
    ) {
      return false;
    }

    const invalidatedQuote:
      ExecutableQuote = {
      exchange:
        previousQuote.exchange,

      market:
        previousQuote.market,

      lastPrice:
        previousQuote.lastPrice,

      bestBidPrice:
        null,

      bestBidQty:
        null,

      bestAskPrice:
        null,

      bestAskQty:
        null,

      spread:
        null,

      /*
       * This timestamp represents the invalidation event.
       *
       * Because executable=false, it must not be treated
       * as executable order-book freshness.
       */
      timestamp:
        Date.now(),

      source:
        previousQuote.source,

      executable:
        false,
    };

    this.markets.set(
      key,
      invalidatedQuote,
    );

    this.indexQuote(
      key,
      invalidatedQuote,
    );

    if (
      previousQuote.executable
    ) {
      this.publishExecutableUpdate({
        exchange:
          invalidatedQuote.exchange,

        market:
          invalidatedQuote.market,

        timestamp:
          invalidatedQuote.timestamp,

        kind:
          "INVALIDATED",
      });
    }

    this.queueUiQuote(
      key,
      invalidatedQuote,
    );

    return true;
  }

  remove(
    exchange:
      string,

    market:
      string,
  ): boolean {
    const key =
      this.createKey(
        exchange,
        market,
      );

    const previousQuote =
      this.markets.get(
        key,
      );

    const removed =
      this.markets.delete(
        key,
      );

    if (
      removed &&
      previousQuote
    ) {
      this.removeIndexedQuote(
        key,
        previousQuote.exchange,
        previousQuote.market,
      );
    }

    if (
      removed &&
      previousQuote?.executable
    ) {
      this.publishExecutableUpdate({
        exchange:
          previousQuote.exchange,

        market:
          previousQuote.market,

        timestamp:
          Date.now(),

        kind:
          "REMOVED",
      });
    }

    return removed;
  }

  clear():
    void {
    const hadExecutableQuotes =
      Array.from(
        this.markets.values(),
      ).some(
        (quote) =>
          quote.executable,
      );

    this.markets.clear();
    this.marketsByExchange.clear();
    this.executableMarkets.clear();
    this.executableMarketsByExchange.clear();
    this.executableMarketsByMarket.clear();

    if (
      hadExecutableQuotes
    ) {
      this.publishExecutableUpdate({
        exchange:
          "*",

        market:
          "*",

        timestamp:
          Date.now(),

        kind:
          "CLEARED",
      });
    }
  }

  private publishExecutableUpdate(
    update:
      MarketCacheExecutableUpdate,
  ): void {
    for (
      const listener
      of this.executableUpdateListeners
    ) {
      try {
        listener(
          update,
        );
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[MarketCache] Executable update listener failed:",

          error instanceof Error
            ? error.message
            : "Unknown executable update listener error.",
        );
      }
    }
  }

  private indexQuote(
    key:
      string,

    quote:
      ExecutableQuote,
  ): void {
    const exchange =
      quote.exchange;

    let exchangeMarkets =
      this.marketsByExchange.get(
        exchange,
      );

    if (!exchangeMarkets) {
      exchangeMarkets =
        new Map();

      this.marketsByExchange.set(
        exchange,
        exchangeMarkets,
      );
    }

    exchangeMarkets.set(
      key,
      quote,
    );

    if (
      quote.executable
    ) {
      this.executableMarkets.set(
        key,
        quote,
      );

      let executableExchangeMarkets =
        this.executableMarketsByExchange.get(
          exchange,
        );

      if (!executableExchangeMarkets) {
        executableExchangeMarkets =
          new Map();

        this.executableMarketsByExchange.set(
          exchange,
          executableExchangeMarkets,
        );
      }

      executableExchangeMarkets.set(
        key,
        quote,
      );

      let executableMarketExchanges =
        this.executableMarketsByMarket.get(
          quote.market,
        );

      if (!executableMarketExchanges) {
        executableMarketExchanges =
          new Map();

        this.executableMarketsByMarket.set(
          quote.market,
          executableMarketExchanges,
        );
      }

      executableMarketExchanges.set(
        quote.exchange,
        quote,
      );

      return;
    }

    this.executableMarkets.delete(
      key,
    );

    const executableExchangeMarkets =
      this.executableMarketsByExchange.get(
        exchange,
      );

    executableExchangeMarkets?.delete(
      key,
    );

    if (
      executableExchangeMarkets?.size ===
      0
    ) {
      this.executableMarketsByExchange.delete(
        exchange,
      );
    }

    this.removeExecutableMarketIndex(
      quote.market,
      quote.exchange,
    );
  }

  private removeIndexedQuote(
    key:
      string,

    exchange:
      string,

    market:
      string,
  ): void {
    const exchangeMarkets =
      this.marketsByExchange.get(
        exchange,
      );

    exchangeMarkets?.delete(
      key,
    );

    if (
      exchangeMarkets?.size ===
      0
    ) {
      this.marketsByExchange.delete(
        exchange,
      );
    }

    this.executableMarkets.delete(
      key,
    );

    const executableExchangeMarkets =
      this.executableMarketsByExchange.get(
        exchange,
      );

    executableExchangeMarkets?.delete(
      key,
    );

    if (
      executableExchangeMarkets?.size ===
      0
    ) {
      this.executableMarketsByExchange.delete(
        exchange,
      );
    }

    this.removeExecutableMarketIndex(
      market,
      exchange,
    );
  }

  private removeExecutableMarketIndex(
    market:
      string,

    exchange:
      string,
  ): void {
    const executableMarketExchanges =
      this.executableMarketsByMarket.get(
        market,
      );

    executableMarketExchanges?.delete(
      exchange,
    );

    if (
      executableMarketExchanges?.size ===
      0
    ) {
      this.executableMarketsByMarket.delete(
        market,
      );
    }
  }

  /**
   * UI telemetry is deliberately decoupled from the trading hot path. Keep
   * only the newest quote per exchange/market and publish one volatile batch
   * per display frame window. The authoritative cache and opportunity
   * listeners still receive every source update immediately.
   */
  private queueUiQuote(
    key:
      string,

    quote:
      ExecutableQuote,
  ): void {
    this.pendingUiQuotes.set(
      key,
      quote,
    );

    if (
      this.uiBatchTimer !==
      null
    ) {
      return;
    }

    this.uiBatchTimer =
      setTimeout(
        () => {
          this.uiBatchTimer =
            null;

          this.flushUiQuotes();
        },
        MarketCache
          .UI_BATCH_INTERVAL_MS,
      );

    this.uiBatchTimer.unref();
  }

  private flushUiQuotes():
    void {
    if (
      this.pendingUiQuotes.size ===
      0
    ) {
      return;
    }

    const quotes =
      Array.from(
        this.pendingUiQuotes.values(),
      );

    this.pendingUiQuotes.clear();

    try {
      getIO()
        .volatile
        .emit(
          "tickers",
          quotes,
        );
    } catch {
      /*
       * Socket server may not be initialized yet.
       */
    }
  }

  private isExecutableQuote(
    input:
      MarketCacheInput,
  ): input is ExecutableQuote {
    return (
      "source" in
        input &&
      "executable" in
        input
    );
  }

  /*
   * -------------------------------------------------
   * NORMALIZED TICKER EXECUTABLE DETECTION
   * -------------------------------------------------
   *
   * This is the Version 17.3 repair.
   *
   * A NormalizedTicker is allowed to refresh executable
   * freshness ONLY when it explicitly contains a valid
   * complete top-of-book:
   *
   * bid price
   * bid quantity
   * ask price
   * ask quantity
   *
   * Merely having bid/ask prices is insufficient.
   */
  private normalizedTickerCarriesExecutableTopOfBook(
    input:
      MarketCacheInput,
  ): boolean {
    if (
      this.isExecutableQuote(
        input,
      )
    ) {
      return false;
    }

    return this.isExecutableTopOfBook(
      this.getValidPositiveNumber(
        input.bestBidPrice,
      ),

      this.getValidNonNegativeNumber(
        input.bestBidQty,
      ),

      this.getValidPositiveNumber(
        input.bestAskPrice,
      ),

      this.getValidNonNegativeNumber(
        input.bestAskQty,
      ),
    );
  }

  private normalizeExecutableQuote(
    incomingQuote:
      ExecutableQuote,
  ): ExecutableQuote | null {
    const exchange =
      incomingQuote.exchange
        .trim()
        .toLowerCase();

    const market =
      incomingQuote.market
        .trim()
        .toUpperCase();

    if (
      !exchange ||
      !market
    ) {
      return null;
    }

    const lastPrice =
      this.getValidPositiveNumber(
        incomingQuote
          .lastPrice,
      );

    const bestBidPrice =
      this.getValidPositiveNumber(
        incomingQuote
          .bestBidPrice,
      );

    const bestAskPrice =
      this.getValidPositiveNumber(
        incomingQuote
          .bestAskPrice,
      );

    const bestBidQty =
      this.getValidNonNegativeNumber(
        incomingQuote
          .bestBidQty,
      );

    const bestAskQty =
      this.getValidNonNegativeNumber(
        incomingQuote
          .bestAskQty,
      );

    const timestamp =
      Number.isFinite(
        incomingQuote.timestamp,
      ) &&
      incomingQuote.timestamp >
        0
        ? incomingQuote.timestamp
        : Date.now();

    const spread =
      bestBidPrice !==
        null &&
      bestAskPrice !==
        null
        ? bestAskPrice -
          bestBidPrice
        : null;

    const executable =
      this.isExecutableTopOfBook(
        bestBidPrice,
        bestBidQty,
        bestAskPrice,
        bestAskQty,
      );

    return {
      exchange,

      market,

      lastPrice,

      bestBidPrice,

      bestBidQty,

      bestAskPrice,

      bestAskQty,

      spread,

      timestamp,

      source:
        incomingQuote.source,

      executable,
    };
  }

  private mergeQuotes(
    previousQuote:
      | ExecutableQuote
      | undefined,

    incomingQuote:
      ExecutableQuote,

    incomingRefreshesExecutableState:
      boolean,
  ): ExecutableQuote {
    if (
      !previousQuote
    ) {
      return incomingQuote;
    }

    /*
     * -------------------------------------------------
     * CASE 1
     * FRESH EXECUTABLE MARKET DATA
     * -------------------------------------------------
     *
     * Either:
     *
     * - native ExecutableQuote
     *
     * OR
     *
     * - NormalizedTicker carrying a complete valid
     *   executable top-of-book.
     *
     * This data may refresh executable timestamp.
     */
    if (
      incomingRefreshesExecutableState
    ) {
      const bestBidPrice =
        incomingQuote
          .bestBidPrice ??
        previousQuote
          .bestBidPrice;

      const bestBidQty =
        incomingQuote
          .bestBidQty ??
        previousQuote
          .bestBidQty;

      const bestAskPrice =
        incomingQuote
          .bestAskPrice ??
        previousQuote
          .bestAskPrice;

      const bestAskQty =
        incomingQuote
          .bestAskQty ??
        previousQuote
          .bestAskQty;

      const spread =
        bestBidPrice !==
          null &&
        bestAskPrice !==
          null
          ? bestAskPrice -
            bestBidPrice
          : null;

      const executable =
        this.isExecutableTopOfBook(
          bestBidPrice,
          bestBidQty,
          bestAskPrice,
          bestAskQty,
        );

      return {
        exchange:
          incomingQuote.exchange,

        market:
          incomingQuote.market,

        lastPrice:
          incomingQuote
            .lastPrice ??
          previousQuote
            .lastPrice,

        bestBidPrice,

        bestBidQty,

        bestAskPrice,

        bestAskQty,

        spread,

        /*
         * Critical Version 17.3 behavior:
         *
         * Fresh executable top-of-book publication
         * refreshes executable timestamp.
         */
        timestamp:
          incomingQuote
            .timestamp,

        source:
          incomingQuote
            .source,

        executable,
      };
    }

    /*
     * -------------------------------------------------
     * CASE 2
     * TICKER-ONLY UPDATE
     * -------------------------------------------------
     *
     * If an executable book already exists, ticker-only
     * data may update lastPrice but may NOT:
     *
     * - refresh executable timestamp
     * - alter executable prices
     * - alter executable quantities
     *
     * This prevents ordinary ticker traffic from making
     * stale order-book data appear fresh.
     */
    if (
      previousQuote.executable
    ) {
      return {
        exchange:
          previousQuote
            .exchange,

        market:
          previousQuote
            .market,

        lastPrice:
          incomingQuote
            .lastPrice ??
          previousQuote
            .lastPrice,

        bestBidPrice:
          previousQuote
            .bestBidPrice,

        bestBidQty:
          previousQuote
            .bestBidQty,

        bestAskPrice:
          previousQuote
            .bestAskPrice,

        bestAskQty:
          previousQuote
            .bestAskQty,

        spread:
          previousQuote
            .spread,

        timestamp:
          previousQuote
            .timestamp,

        source:
          previousQuote
            .source,

        executable:
          true,
      };
    }

    /*
     * -------------------------------------------------
     * CASE 3
     * NO EXISTING EXECUTABLE BOOK
     * -------------------------------------------------
     *
     * Normal ticker merge is safe.
     */
    return {
      exchange:
        incomingQuote.exchange,

      market:
        incomingQuote.market,

      lastPrice:
        incomingQuote
          .lastPrice ??
        previousQuote
          .lastPrice,

      bestBidPrice:
        incomingQuote
          .bestBidPrice,

      bestBidQty:
        incomingQuote
          .bestBidQty,

      bestAskPrice:
        incomingQuote
          .bestAskPrice,

      bestAskQty:
        incomingQuote
          .bestAskQty,

      spread:
        incomingQuote
          .spread,

      timestamp:
        incomingQuote
          .timestamp,

      source:
        incomingQuote
          .source,

      executable:
        incomingQuote
          .executable,
    };
  }

  private isExecutableTopOfBook(
    bestBidPrice:
      number | null,

    bestBidQty:
      number | null,

    bestAskPrice:
      number | null,

    bestAskQty:
      number | null,
  ): boolean {
    return (
      bestBidPrice !==
        null &&
      bestAskPrice !==
        null &&
      bestBidQty !==
        null &&
      bestAskQty !==
        null &&
      bestBidPrice >
        0 &&
      bestAskPrice >
        0 &&
      /*
       * Zero quantity is not executable.
       */
      bestBidQty >
        0 &&
      bestAskQty >
        0 &&
      /*
       * Crossed books are unsafe.
       */
      bestAskPrice >=
        bestBidPrice
    );
  }

  private createKey(
    exchange:
      string,

    market:
      string,
  ): string {
    return `${exchange
      .trim()
      .toLowerCase()}:${market
      .trim()
      .toUpperCase()}`;
  }

  private getValidPositiveNumber(
    value:
      number | null,
  ): number | null {
    return (
      value !==
        null &&
      Number.isFinite(
        value,
      ) &&
      value >
        0
    )
      ? value
      : null;
  }

  private getValidNonNegativeNumber(
    value:
      number | null,
  ): number | null {
    return (
      value !==
        null &&
      Number.isFinite(
        value,
      ) &&
      value >=
        0
    )
      ? value
      : null;
  }
}

export const marketCache =
  new MarketCache();
