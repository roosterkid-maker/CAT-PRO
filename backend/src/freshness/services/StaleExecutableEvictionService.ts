import { marketCache } from "../../services/cache.service";
import { environment } from "../../config/Environment";
import { freshnessIntegrityConfig } from "../config/freshness";
import { freshnessIntegrityService } from "./FreshnessIntegrityService";

export interface ExchangeEvictionStatistics {
  scanned: number;
  fresh: number;
  stale: number;
  evicted: number;
}

export interface StaleExecutableEvictionDiagnostics {
  running: boolean;
  intervalMs: number;
  lastRunAt: number | null;
  totalRuns: number;
  totalScanned: number;
  totalFresh: number;
  totalStale: number;
  totalEvicted: number;
  byExchange: Record<string, ExchangeEvictionStatistics>;
}

export class StaleExecutableEvictionService {
  private timer: NodeJS.Timeout | null = null;
  private lastRunAt: number | null = null;

  private totalRuns = 0;
  private totalScanned = 0;
  private totalFresh = 0;
  private totalStale = 0;
  private totalEvicted = 0;

  private readonly byExchange =
    new Map<string, ExchangeEvictionStatistics>();

  start(): void {
    if (this.timer) {
      return;
    }

    this.run();

    this.timer = setInterval(
      () => this.run(),
      freshnessIntegrityConfig.evictionIntervalMs,
    );

    this.timer.unref?.();

    console.log(
      `[Freshness] Stale executable eviction started (${freshnessIntegrityConfig.evictionIntervalMs}ms interval).`,
    );
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer = null;

    console.log(
      "[Freshness] Stale executable eviction stopped.",
    );
  }

  run(
    now = Date.now(),
  ): number {
    const executableQuotes =
      marketCache.getExecutable();

    let evictedThisRun =
      0;

    this.totalRuns +=
      1;

    this.lastRunAt =
      now;

    for (
      const quote
      of executableQuotes
    ) {
      this.totalScanned +=
        1;

      const exchange =
        quote.exchange
          .trim()
          .toLowerCase();

      const statistics =
        this.getExchangeStatistics(
          exchange,
        );

      statistics.scanned +=
        1;

      const freshness =
        freshnessIntegrityService
          .evaluateQuote(
            quote,
            now,
          );

      if (
        freshness.fresh
      ) {
        this.totalFresh +=
          1;

        statistics.fresh +=
          1;

        continue;
      }

      this.totalStale +=
        1;

      statistics.stale +=
        1;

      const invalidated =
        marketCache
          .invalidateExecutable(
            quote.exchange,
            quote.market,
          );

      if (
        invalidated
      ) {
        this.totalEvicted +=
          1;

        statistics.evicted +=
          1;

        evictedThisRun +=
          1;
      }
    }

    if (
      evictedThisRun >
        0 &&
      environment.logLevel
        .trim()
        .toLowerCase() ===
        "debug"
    ) {
      console.warn(
        `[Freshness] Evicted ${evictedThisRun} stale executable quote(s).`,
      );
    }

    return evictedThisRun;
  }

  getDiagnostics():
    StaleExecutableEvictionDiagnostics {
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

      totalStale:
        this.totalStale,

      totalEvicted:
        this.totalEvicted,

      byExchange:
        Object.fromEntries(
          Array.from(
            this.byExchange
              .entries(),
          ).map(
            (
              [
                exchange,
                statistics,
              ],
            ) => [
              exchange,

              {
                ...statistics,
              },
            ],
          ),
        ),
    };
  }

  resetDiagnostics():
    void {
    this.lastRunAt =
      null;

    this.totalRuns =
      0;

    this.totalScanned =
      0;

    this.totalFresh =
      0;

    this.totalStale =
      0;

    this.totalEvicted =
      0;

    this.byExchange
      .clear();
  }

  private getExchangeStatistics(
    exchange:
      string,
  ): ExchangeEvictionStatistics {
    const existing =
      this.byExchange
        .get(
          exchange,
        );

    if (
      existing
    ) {
      return existing;
    }

    const created:
      ExchangeEvictionStatistics = {
      scanned:
        0,

      fresh:
        0,

      stale:
        0,

      evicted:
        0,
    };

    this.byExchange
      .set(
        exchange,
        created,
      );

    return created;
  }
}

export const staleExecutableEvictionService =
  new StaleExecutableEvictionService();
