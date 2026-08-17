import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  environment,
} from "../../config/Environment";

import {
  marketCache,
} from "../../services/cache.service";

import {
  freshnessIntegrityConfig,
} from "../config/freshness";

import {
  freshnessIntegrityService,
} from "./FreshnessIntegrityService";

export interface StaleOrderBookEvictionDiagnostics {
  running: boolean;
  intervalMs: number;
  lastRunAt: number | null;
  totalRuns: number;
  totalScanned: number;
  totalFresh: number;
  totalStaleRemoved: number;
}

export class StaleOrderBookEvictionService {
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

  private totalScanned =
    0;

  private totalFresh =
    0;

  private totalStaleRemoved =
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
      `[Freshness] Stale order-book eviction started (${freshnessIntegrityConfig.evictionIntervalMs}ms interval).`,
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
      "[Freshness] Stale order-book eviction stopped.",
    );
  }

  run(
    now =
      Date.now(),
  ): number {
    let removedThisRun =
      0;

    this.totalRuns +=
      1;

    this.lastRunAt =
      now;

    for (
      const book
      of orderBookService.getAll()
    ) {
      this.totalScanned +=
        1;

      const ageMs =
        now -
        book.timestamp;

      const rule =
        freshnessIntegrityService
          .getRule(
            book.exchange,
          );

      const fresh =
        Number.isFinite(
          ageMs,
        ) &&
        ageMs >=
          0 &&
        ageMs <=
          rule.maximumQuoteAgeMs;

      if (
        fresh
      ) {
        this.totalFresh +=
          1;

        continue;
      }

      /*
       * Stale depth must not remain available
       * to execution/VWAP/slippage services.
       */
      orderBookService.remove(
        book.exchange,
        book.market,
      );

      /*
       * If MarketCache still represents the
       * same or an older executable state,
       * invalidate it as well.
       *
       * If MarketCache has a newer update,
       * leave it alone.
       */
      const cached =
        marketCache.get(
          book.exchange,
          book.market,
        );

      if (
        cached?.executable &&
        cached.timestamp <=
          book.timestamp
      ) {
        marketCache.invalidateExecutable(
          book.exchange,
          book.market,
        );
      }

      this.totalStaleRemoved +=
        1;

      removedThisRun +=
        1;
    }

    if (
      removedThisRun >
        0 &&
      environment.logLevel
        .trim()
        .toLowerCase() ===
        "debug"
    ) {
      console.warn(
        `[Freshness] Removed ${removedThisRun} stale order book(s).`,
      );
    }

    return removedThisRun;
  }

  getDiagnostics():
    StaleOrderBookEvictionDiagnostics {
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

      totalScanned:
        this.totalScanned,

      totalFresh:
        this.totalFresh,

      totalStaleRemoved:
        this.totalStaleRemoved,
    };
  }
}

export const staleOrderBookEvictionService =
  new StaleOrderBookEvictionService();
