import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import {
  freshnessIntegrityConfig,
} from "../config/freshness";

import {
  freshnessIntegrityService,
} from "./FreshnessIntegrityService";

export interface MarketCacheOrderBookReconciliationDiagnostics {
  running: boolean;
  intervalMs: number;
  lastRunAt: number | null;
  totalRuns: number;
  totalBooksScanned: number;
  totalFreshBooks: number;
  totalCacheRepublished: number;
}

export class MarketCacheOrderBookReconciliationService {
  private timer:
    NodeJS.Timeout |
    null =
    null;

  private lastRunAt:
    number |
    null =
    null;

  private totalRuns =
    0;

  private totalBooksScanned =
    0;

  private totalFreshBooks =
    0;

  private totalCacheRepublished =
    0;

  start(): void {
    if (
      this.timer
    ) {
      return;
    }

    this.run();

    this.timer =
      setInterval(
        () =>
          this.run(),

        freshnessIntegrityConfig
          .evictionIntervalMs,
      );

    this.timer.unref?.();

    console.log(
      `[Freshness] MarketCache/order-book reconciliation started (${freshnessIntegrityConfig.evictionIntervalMs}ms interval).`,
    );
  }

  stop(): void {
    if (
      !this.timer
    ) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;

    console.log(
      "[Freshness] MarketCache/order-book reconciliation stopped.",
    );
  }

  run(
    now =
      Date.now(),
  ): number {
    let republishedThisRun =
      0;

    this.totalRuns +=
      1;

    this.lastRunAt =
      now;

    for (
      const book
      of orderBookService.getAll()
    ) {
      this.totalBooksScanned +=
        1;

      const ageMs =
        now -
        book.timestamp;

      const rule =
        freshnessIntegrityService
          .getRule(
            book.exchange,
          );

      /*
       * NEVER turn a stale order book
       * into a fresh MarketCache quote.
       */
      if (
        !Number.isFinite(
          ageMs,
        ) ||
        ageMs <
          0 ||
        ageMs >
          rule.maximumQuoteAgeMs
      ) {
        continue;
      }

      this.totalFreshBooks +=
        1;

      const bestBid =
        book.bids[0];

      const bestAsk =
        book.asks[0];

      if (
        !bestBid ||
        !bestAsk ||
        bestBid.price <=
          0 ||
        bestAsk.price <=
          0 ||
        bestBid.quantity <=
          0 ||
        bestAsk.quantity <=
          0 ||
        bestAsk.price <
          bestBid.price
      ) {
        continue;
      }

      const cached =
        marketCache.get(
          book.exchange,
          book.market,
        );

      const cachedFresh =
        cached
          ? freshnessIntegrityService
              .evaluateQuote(
                cached,
                now,
              )
              .fresh
          : false;

      const sameTimestamp =
        cached?.timestamp ===
        book.timestamp;

      const sameTopOfBook =
        cached?.executable ===
          true &&
        cached.bestBidPrice ===
          bestBid.price &&
        cached.bestBidQty ===
          bestBid.quantity &&
        cached.bestAskPrice ===
          bestAsk.price &&
        cached.bestAskQty ===
          bestAsk.quantity;

      /*
       * Nothing to repair.
       */
      if (
        cachedFresh &&
        sameTimestamp &&
        sameTopOfBook
      ) {
        continue;
      }

      /*
       * Never overwrite a quote that is
       * newer than the order book.
       */
      if (
        cached &&
        cached.timestamp >
          book.timestamp
      ) {
        continue;
      }

      const quote:
        ExecutableQuote = {
        exchange:
          book.exchange,

        market:
          book.market,

        lastPrice:
          cached?.lastPrice ??
          (
            (
              bestBid.price +
              bestAsk.price
            ) /
            2
          ),

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

        /*
         * Critical safety rule:
         * use actual order-book timestamp.
         *
         * Never Date.now().
         */
        timestamp:
          book.timestamp,

        source:
          "orderBook",

        executable:
          true,
      };

      marketCache.update(
        quote,
      );

      this.totalCacheRepublished +=
        1;

      republishedThisRun +=
        1;
    }

    return republishedThisRun;
  }

  getDiagnostics():
    MarketCacheOrderBookReconciliationDiagnostics {
    return {
      running:
        this.timer !==
        null,

      intervalMs:
        freshnessIntegrityConfig
          .evictionIntervalMs,

      lastRunAt:
        this.lastRunAt,

      totalRuns:
        this.totalRuns,

      totalBooksScanned:
        this.totalBooksScanned,

      totalFreshBooks:
        this.totalFreshBooks,

      totalCacheRepublished:
        this.totalCacheRepublished,
    };
  }
}

export const marketCacheOrderBookReconciliationService =
  new MarketCacheOrderBookReconciliationService();