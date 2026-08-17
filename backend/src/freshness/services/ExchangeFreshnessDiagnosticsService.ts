import {
  exchangeManager,
} from "../../exchanges/core/ExchangeManager";

import {
  marketCache,
} from "../../services/cache.service";

import {
  freshnessIntegrityService,
} from "./FreshnessIntegrityService";

import {
  staleExecutableEvictionService,
} from "./StaleExecutableEvictionService";

export interface ExchangeFreshnessDiagnostics {
  exchange:
    string;

  connected:
    boolean;

  maximumQuoteAgeMs:
    number;

  maximumPairSkewMs:
    number;

  totalQuotes:
    number;

  executableQuotes:
    number;

  freshExecutableQuotes:
    number;

  staleExecutableQuotes:
    number;

  invalidTimestampExecutableQuotes:
    number;

  futureTimestampExecutableQuotes:
    number;

  freshnessCoveragePercent:
    number;

  averageExecutableAgeMs:
    number | null;

  oldestExecutableAgeMs:
    number | null;

  newestExecutableAgeMs:
    number | null;

  oldestExecutableMarket:
    string | null;

  eviction: {
    scanned:
      number;

    staleDetected:
      number;

    evicted:
      number;
  };
}

export interface FreshnessDiagnosticsSummary {
  exchanges:
    number;

  connectedExchanges:
    number;

  totalQuotes:
    number;

  executableQuotes:
    number;

  freshExecutableQuotes:
    number;

  staleExecutableQuotes:
    number;

  freshnessCoveragePercent:
    number;

  totalEvictedSinceStart:
    number;
}

export interface FreshnessDiagnosticsReport {
  generatedAt:
    number;

  eviction: {
    running:
      boolean;

    intervalMs:
      number;

    lastRunAt:
      number | null;

    totalRuns:
      number;

    totalEvicted:
      number;
  };

  summary:
    FreshnessDiagnosticsSummary;

  exchanges:
    ExchangeFreshnessDiagnostics[];
}

export class ExchangeFreshnessDiagnosticsService {
  getReport(
    now =
      Date.now(),
  ): FreshnessDiagnosticsReport {
    const quotes =
      marketCache
        .getAll();

    const registeredAdapters =
      exchangeManager
        .getAll();

    const evictionDiagnostics =
      staleExecutableEvictionService
        .getDiagnostics();

    const exchangeNames =
      new Set<string>();

    /*
     * Include all registered exchanges,
     * even if they currently have no quotes.
     */
    for (
      const adapter
      of registeredAdapters
    ) {
      exchangeNames.add(
        adapter.name
          .trim()
          .toLowerCase(),
      );
    }

    /*
     * Also include exchanges present
     * inside the market cache.
     */
    for (
      const quote
      of quotes
    ) {
      exchangeNames.add(
        quote.exchange
          .trim()
          .toLowerCase(),
      );
    }

    /*
     * Include exchanges that may currently
     * have zero executable quotes but have
     * previously produced stale evictions.
     */
    for (
      const exchange
      of Object.keys(
        evictionDiagnostics
          .byExchange,
      )
    ) {
      exchangeNames.add(
        exchange
          .trim()
          .toLowerCase(),
      );
    }

    const exchanges =
      Array.from(
        exchangeNames,
      )
        .sort()
        .map(
          (
            exchange,
          ) =>
            this.buildExchangeReport(
              exchange,
              registeredAdapters,
              evictionDiagnostics
                .byExchange,
              now,
            ),
        );

    const totalQuotes =
      exchanges.reduce(
        (
          sum,
          exchange,
        ) =>
          sum +
          exchange.totalQuotes,
        0,
      );

    const executableQuotes =
      exchanges.reduce(
        (
          sum,
          exchange,
        ) =>
          sum +
          exchange.executableQuotes,
        0,
      );

    const freshExecutableQuotes =
      exchanges.reduce(
        (
          sum,
          exchange,
        ) =>
          sum +
          exchange
            .freshExecutableQuotes,
        0,
      );

    const staleExecutableQuotes =
      exchanges.reduce(
        (
          sum,
          exchange,
        ) =>
          sum +
          exchange
            .staleExecutableQuotes,
        0,
      );

    const connectedExchanges =
      exchanges.filter(
        (
          exchange,
        ) =>
          exchange.connected,
      ).length;

    return {
      generatedAt:
        now,

      eviction: {
        running:
          evictionDiagnostics
            .running,

        intervalMs:
          evictionDiagnostics
            .intervalMs,

        lastRunAt:
          evictionDiagnostics
            .lastRunAt,

        totalRuns:
          evictionDiagnostics
            .totalRuns,

        totalEvicted:
          evictionDiagnostics
            .totalEvicted,
      },

      summary: {
        exchanges:
          exchanges.length,

        connectedExchanges,

        totalQuotes,

        executableQuotes,

        freshExecutableQuotes,

        staleExecutableQuotes,

        freshnessCoveragePercent:
          this.percentage(
            freshExecutableQuotes,
            executableQuotes,
          ),

        totalEvictedSinceStart:
          evictionDiagnostics
            .totalEvicted,
      },

      exchanges,
    };
  }

  private buildExchangeReport(
    exchange:
      string,

    registeredAdapters:
      ReturnType<
        typeof exchangeManager.getAll
      >,

    evictionByExchange:
      ReturnType<
        typeof staleExecutableEvictionService.getDiagnostics
      >["byExchange"],

    now:
      number,
  ): ExchangeFreshnessDiagnostics {
    const exchangeQuotes =
      marketCache
        .getByExchange(
          exchange,
        );

    const executableQuotes =
      exchangeQuotes
        .filter(
          (
            quote,
          ) =>
            quote.executable,
        );

    const rule =
      freshnessIntegrityService
        .getRule(
          exchange,
        );

    let freshExecutableQuotes =
      0;

    let staleExecutableQuotes =
      0;

    let invalidTimestampExecutableQuotes =
      0;

    let futureTimestampExecutableQuotes =
      0;

    let ageTotal =
      0;

    let ageCount =
      0;

    let oldestExecutableAgeMs:
      number | null =
      null;

    let newestExecutableAgeMs:
      number | null =
      null;

    let oldestExecutableMarket:
      string | null =
      null;

    for (
      const quote
      of executableQuotes
    ) {
      const freshness =
        freshnessIntegrityService
          .evaluateQuote(
            quote,
            now,
          );

      if (
        freshness.fresh
      ) {
        freshExecutableQuotes +=
          1;
      } else if (
        freshness.reason ===
        "STALE_TIMESTAMP"
      ) {
        staleExecutableQuotes +=
          1;
      } else if (
        freshness.reason ===
        "INVALID_TIMESTAMP"
      ) {
        invalidTimestampExecutableQuotes +=
          1;
      } else if (
        freshness.reason ===
        "FUTURE_TIMESTAMP"
      ) {
        futureTimestampExecutableQuotes +=
          1;
      }

      /*
       * Negative age indicates future
       * timestamp and is excluded from
       * normal age statistics.
       */
      if (
        freshness.ageMs !==
          null &&
        freshness.ageMs >=
          0
      ) {
        ageTotal +=
          freshness.ageMs;

        ageCount +=
          1;

        if (
          oldestExecutableAgeMs ===
            null ||
          freshness.ageMs >
            oldestExecutableAgeMs
        ) {
          oldestExecutableAgeMs =
            freshness.ageMs;

          oldestExecutableMarket =
            quote.market;
        }

        if (
          newestExecutableAgeMs ===
            null ||
          freshness.ageMs <
            newestExecutableAgeMs
        ) {
          newestExecutableAgeMs =
            freshness.ageMs;
        }
      }
    }

    const adapter =
      registeredAdapters
        .find(
          (
            candidate,
          ) =>
            candidate.name
              .trim()
              .toLowerCase() ===
            exchange,
        );

    const eviction =
      evictionByExchange[
        exchange
      ];

    return {
      exchange,

      connected:
        adapter
          ?.isConnected() ??
        false,

      maximumQuoteAgeMs:
        rule.maximumQuoteAgeMs,

      maximumPairSkewMs:
        rule.maximumPairSkewMs,

      totalQuotes:
        exchangeQuotes.length,

      executableQuotes:
        executableQuotes.length,

      freshExecutableQuotes,

      staleExecutableQuotes,

      invalidTimestampExecutableQuotes,

      futureTimestampExecutableQuotes,

      freshnessCoveragePercent:
        this.percentage(
          freshExecutableQuotes,
          executableQuotes.length,
        ),

      averageExecutableAgeMs:
        ageCount >
        0
          ? Math.round(
              ageTotal /
                ageCount,
            )
          : null,

      oldestExecutableAgeMs,

      newestExecutableAgeMs,

      oldestExecutableMarket,

      eviction: {
        scanned:
          eviction
            ?.scanned ??
          0,

        staleDetected:
          eviction
            ?.stale ??
          0,

        evicted:
          eviction
            ?.evicted ??
          0,
      },
    };
  }

  private percentage(
    numerator:
      number,

    denominator:
      number,
  ): number {
    if (
      denominator <=
      0
    ) {
      return 0;
    }

    return Number(
      (
        (
          numerator /
          denominator
        ) *
        100
      ).toFixed(
        2,
      ),
    );
  }
}

export const exchangeFreshnessDiagnosticsService =
  new ExchangeFreshnessDiagnosticsService();