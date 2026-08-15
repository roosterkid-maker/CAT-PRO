import {
  opportunityRejectionStore,
} from "../../arbitrage/services/OpportunityRejectionStore";

import {
  exchangeFreshnessDiagnosticsService,
} from "../../freshness/services/ExchangeFreshnessDiagnosticsService";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  staleExecutableEvictionService,
} from "../../freshness/services/StaleExecutableEvictionService";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  FreshnessAgeDistribution,
  FreshnessExchangeRootCause,
  FreshnessMismatchSample,
  FreshnessRejectionAgeSummary,
  FreshnessRootCauseClassification,
  FreshnessRootCauseReport,
} from "../models/FreshnessRootCause";

const REJECTION_SAMPLE_LIMIT =
  500;

const MISMATCH_SAMPLE_LIMIT =
  50;

export class FreshnessRootCauseAnalyzerService {
  getReport(
    now =
      Date.now(),
  ): FreshnessRootCauseReport {
    const freshnessReport =
      exchangeFreshnessDiagnosticsService
        .getReport(
          now,
        );

    const eviction =
      staleExecutableEvictionService
        .getDiagnostics();

    const quotes =
      marketCache
        .getAll();

    const executableQuotes =
      quotes.filter(
        (
          quote,
        ) =>
          quote.executable,
      );

    const books =
      orderBookService
        .getAll();

    const exchangeNames =
      new Set<string>();

    for (
      const quote
      of quotes
    ) {
      exchangeNames.add(
        this.normalizeExchange(
          quote.exchange,
        ),
      );
    }

    for (
      const book
      of books
    ) {
      exchangeNames.add(
        this.normalizeExchange(
          book.exchange,
        ),
      );
    }

    for (
      const exchange
      of freshnessReport.exchanges
    ) {
      exchangeNames.add(
        this.normalizeExchange(
          exchange.exchange,
        ),
      );
    }

    const mismatchSamples:
      FreshnessMismatchSample[] =
      [];

    const exchanges =
      Array.from(
        exchangeNames,
      )
        .sort()
        .map(
          (
            exchange,
          ) =>
            this.buildExchange(
              exchange,
              quotes,
              books,
              now,
              mismatchSamples,
            ),
        );

    const freshExecutableQuotes =
      executableQuotes.filter(
        (
          quote,
        ) =>
          freshnessIntegrityService
            .evaluateQuote(
              quote,
              now,
            )
            .fresh,
      ).length;

    const staleExecutableQuotes =
      executableQuotes.length -
      freshExecutableQuotes;

    const rejections =
      this.buildRejections();

    const classification =
      this.classify(
        eviction.running,
        executableQuotes.length,
        staleExecutableQuotes,
        exchanges,
        rejections,
      );

    const observations =
      this.buildObservations(
        classification,
        eviction.running,
        executableQuotes.length,
        staleExecutableQuotes,
        exchanges,
        rejections,
      );

    return {
      generatedAt:
        now,

      version:
        "17.3",

      build:
        "2",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      classification,

      primaryFinding:
        observations[0] ??
        "Freshness root cause is not yet identifiable from current data.",

      eviction: {
        running:
          eviction.running,

        intervalMs:
          eviction.intervalMs,

        lastRunAt:
          eviction.lastRunAt,

        totalRuns:
          eviction.totalRuns,

        totalScanned:
          eviction.totalScanned,

        totalFresh:
          eviction.totalFresh,

        totalStale:
          eviction.totalStale,

        totalEvicted:
          eviction.totalEvicted,
      },

      cache: {
        totalQuotes:
          quotes.length,

        executableQuotes:
          executableQuotes.length,

        freshExecutableQuotes,

        staleExecutableQuotes,

        executableFreshnessPercent:
          this.percentage(
            freshExecutableQuotes,
            executableQuotes.length,
          ),
      },

      exchanges,

      rejections,

      mismatchSamples:
        mismatchSamples.slice(
          0,
          MISMATCH_SAMPLE_LIMIT,
        ),

      observations,
    };
  }

  private buildExchange(
    exchange:
      string,

    quotes:
      ReturnType<
        typeof marketCache.getAll
      >,

    books:
      ReturnType<
        typeof orderBookService.getAll
      >,

    now:
      number,

    mismatchSamples:
      FreshnessMismatchSample[],
  ): FreshnessExchangeRootCause {
    const rule =
      freshnessIntegrityService
        .getRule(
          exchange,
        );

    const exchangeQuotes =
      quotes.filter(
        (
          quote,
        ) =>
          this.normalizeExchange(
            quote.exchange,
          ) ===
          exchange,
      );

    const executableQuotes =
      exchangeQuotes.filter(
        (
          quote,
        ) =>
          quote.executable,
      );

    const executableAges:
      number[] =
      [];

    let freshExecutableQuotes =
      0;

    let staleExecutableQuotes =
      0;

    for (
      const quote
      of executableQuotes
    ) {
      const evaluation =
        freshnessIntegrityService
          .evaluateQuote(
            quote,
            now,
          );

      if (
        evaluation.ageMs !==
        null
      ) {
        executableAges.push(
          evaluation.ageMs,
        );
      }

      if (
        evaluation.fresh
      ) {
        freshExecutableQuotes +=
          1;
      } else {
        staleExecutableQuotes +=
          1;
      }
    }

    const exchangeBooks =
      books.filter(
        (
          book,
        ) =>
          this.normalizeExchange(
            book.exchange,
          ) ===
          exchange,
      );

    const orderBookAges:
      number[] =
      [];

    let freshOrderBooks =
      0;

    let staleOrderBooks =
      0;

    for (
      const book
      of exchangeBooks
    ) {
      const ageMs =
        now -
        book.timestamp;

      if (
        Number.isFinite(
          ageMs,
        )
      ) {
        orderBookAges.push(
          ageMs,
        );
      }

      if (
        ageMs >=
          0 &&
        ageMs <=
          rule.maximumQuoteAgeMs
      ) {
        freshOrderBooks +=
          1;
      } else {
        staleOrderBooks +=
          1;
      }
    }

    let cacheBookMatches =
      0;

    let cacheFreshBookFresh =
      0;

    let cacheStaleBookFresh =
      0;

    let cacheFreshBookStale =
      0;

    let cacheStaleBookStale =
      0;

    const timestampDeltas:
      number[] =
      [];

    for (
      const quote
      of executableQuotes
    ) {
      const book =
        orderBookService
          .get(
            quote.exchange,
            quote.market,
          );

      if (
        !book
      ) {
        continue;
      }

      cacheBookMatches +=
        1;

      const cacheEvaluation =
        freshnessIntegrityService
          .evaluateQuote(
            quote,
            now,
          );

      const bookAgeMs =
        now -
        book.timestamp;

      const bookFresh =
        bookAgeMs >=
          0 &&
        bookAgeMs <=
          rule.maximumQuoteAgeMs;

      if (
        cacheEvaluation.fresh &&
        bookFresh
      ) {
        cacheFreshBookFresh +=
          1;
      } else if (
        !cacheEvaluation.fresh &&
        bookFresh
      ) {
        cacheStaleBookFresh +=
          1;
      } else if (
        cacheEvaluation.fresh &&
        !bookFresh
      ) {
        cacheFreshBookStale +=
          1;
      } else {
        cacheStaleBookStale +=
          1;
      }

      const timestampDeltaMs =
        Math.abs(
          quote.timestamp -
          book.timestamp,
        );

      timestampDeltas.push(
        timestampDeltaMs,
      );

      if (
        mismatchSamples.length <
          MISMATCH_SAMPLE_LIMIT &&
        (
          cacheEvaluation.fresh !==
            bookFresh ||
          timestampDeltaMs >
            250
        )
      ) {
        mismatchSamples.push({
          exchange,

          market:
            quote.market,

          cacheExecutable:
            quote.executable,

          cacheTimestamp:
            quote.timestamp,

          cacheAgeMs:
            cacheEvaluation.ageMs,

          cacheMaximumAgeMs:
            rule.maximumQuoteAgeMs,

          cacheFresh:
            cacheEvaluation.fresh,

          orderBookPresent:
            true,

          orderBookTimestamp:
            book.timestamp,

          orderBookAgeMs:
            bookAgeMs,

          orderBookFresh:
            bookFresh,

          timestampDeltaMs,

          diagnosis:
            this.mismatchDiagnosis(
              cacheEvaluation.fresh,
              bookFresh,
              timestampDeltaMs,
            ),
        });
      }
    }

    const likelyCause =
      this.classifyExchange(
        executableQuotes.length,
        staleExecutableQuotes,
        exchangeBooks.length,
        staleOrderBooks,
        cacheStaleBookFresh,
        cacheStaleBookStale,
      );

    const observations:
      string[] =
      [];

    if (
      executableQuotes.length >
      0
    ) {
      observations.push(
        `${this.percentage(
          freshExecutableQuotes,
          executableQuotes.length,
        ).toFixed(
          2,
        )}% of executable ${exchange} quotes are fresh under the current ${rule.maximumQuoteAgeMs}ms limit.`,
      );
    }

    if (
      cacheStaleBookFresh >
      0
    ) {
      observations.push(
        `${cacheStaleBookFresh} ${exchange} markets have a stale MarketCache quote while OrderBookService is fresh; this indicates publication/timestamp drift between the two caches.`,
      );
    }

    if (
      cacheStaleBookStale >
      0
    ) {
      observations.push(
        `${cacheStaleBookStale} ${exchange} markets are stale in both MarketCache and OrderBookService; this points to subscription/update inactivity rather than a cache-only timestamp mismatch.`,
      );
    }

    return {
      exchange,

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

      freshnessCoveragePercent:
        this.percentage(
          freshExecutableQuotes,
          executableQuotes.length,
        ),

      executableAge:
        this.distribution(
          executableAges,
        ),

      orderBooks:
        exchangeBooks.length,

      freshOrderBooks,

      staleOrderBooks,

      orderBookAge:
        this.distribution(
          orderBookAges,
        ),

      cacheBookMatches,

      cacheFreshBookFresh,

      cacheStaleBookFresh,

      cacheFreshBookStale,

      cacheStaleBookStale,

      timestampDelta:
        this.distribution(
          timestampDeltas,
        ),

      likelyCause,

      observations,
    };
  }

  private buildRejections():
    FreshnessRejectionAgeSummary {
    const records =
      opportunityRejectionStore
        .getRecent(
          REJECTION_SAMPLE_LIMIT,
        )
        .filter(
          (
            record,
          ) =>
            record.code ===
              "STALE_BUY_QUOTE" ||
            record.code ===
              "STALE_SELL_QUOTE" ||
            record.code ===
              "STALE_BOTH_QUOTES" ||
            record.code ===
              "PAIR_NOT_SYNCHRONIZED",
        );

    const buyAges =
      records
        .map(
          (
            record,
          ) =>
            record.buyQuoteAgeMs,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
              null &&
            Number.isFinite(
              value,
            ),
        );

    const sellAges =
      records
        .map(
          (
            record,
          ) =>
            record.sellQuoteAgeMs,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
              null &&
            Number.isFinite(
              value,
            ),
        );

    const pairSkews =
      records
        .map(
          (
            record,
          ) =>
            this.numberMetadata(
              record.metadata,
              "timestampSkewMs",
            ),
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
            null,
        );

    const routeCounts =
      new Map<
        string,
        number
      >();

    for (
      const record
      of records
    ) {
      const route =
        `${record.buyExchange}->${record.sellExchange}`;

      routeCounts.set(
        route,
        (
          routeCounts.get(
            route,
          ) ??
          0
        ) +
          1,
      );
    }

    return {
      sampleSize:
        records.length,

      staleBuy:
        records.filter(
          (
            record,
          ) =>
            record.code ===
            "STALE_BUY_QUOTE",
        ).length,

      staleSell:
        records.filter(
          (
            record,
          ) =>
            record.code ===
            "STALE_SELL_QUOTE",
        ).length,

      staleBoth:
        records.filter(
          (
            record,
          ) =>
            record.code ===
            "STALE_BOTH_QUOTES",
        ).length,

      pairNotSynchronized:
        records.filter(
          (
            record,
          ) =>
            record.code ===
            "PAIR_NOT_SYNCHRONIZED",
        ).length,

      buyAge:
        this.distribution(
          buyAges,
        ),

      sellAge:
        this.distribution(
          sellAges,
        ),

      pairSkew:
        this.distribution(
          pairSkews,
        ),

      byRoute:
        Array.from(
          routeCounts.entries(),
        )
          .map(
            (
              [
                route,
                count,
              ],
            ) => ({
              route,

              count,
            }),
          )
          .sort(
            (
              first,
              second,
            ) =>
              second.count -
              first.count,
          )
          .slice(
            0,
            20,
          ),
    };
  }

  private classify(
    evictionRunning:
      boolean,

    executableQuotes:
      number,

    staleExecutableQuotes:
      number,

    exchanges:
      FreshnessExchangeRootCause[],

    rejections:
      FreshnessRejectionAgeSummary,
  ): FreshnessRootCauseClassification {
    if (
      executableQuotes ===
        0 &&
      rejections.sampleSize ===
        0
    ) {
      return "INSUFFICIENT_DATA";
    }

    if (
      !evictionRunning &&
      staleExecutableQuotes >
        0
    ) {
      return "EVICTION_NOT_RUNNING";
    }

    if (
      exchanges.some(
        (
          exchange,
        ) =>
          exchange.cacheStaleBookFresh >
          0,
      )
    ) {
      return "CACHE_PUBLICATION_MISMATCH";
    }

    if (
      exchanges.some(
        (
          exchange,
        ) =>
          exchange.cacheStaleBookStale >
          0,
      )
    ) {
      return "ORDER_BOOK_FEED_STALE";
    }

    if (
      staleExecutableQuotes >
      0
    ) {
      return "MARKET_CACHE_STALE";
    }

    if (
      rejections.pairNotSynchronized >
      0
    ) {
      return "PAIR_SYNCHRONIZATION";
    }

    return "HEALTHY";
  }

  private classifyExchange(
    executableQuotes:
      number,

    staleExecutableQuotes:
      number,

    orderBooks:
      number,

    staleOrderBooks:
      number,

    cacheStaleBookFresh:
      number,

    cacheStaleBookStale:
      number,
  ): FreshnessRootCauseClassification {
    if (
      executableQuotes ===
        0 &&
      orderBooks ===
        0
    ) {
      return "INSUFFICIENT_DATA";
    }

    if (
      cacheStaleBookFresh >
      0
    ) {
      return "CACHE_PUBLICATION_MISMATCH";
    }

    if (
      cacheStaleBookStale >
        0 ||
      staleOrderBooks >
        0
    ) {
      return "ORDER_BOOK_FEED_STALE";
    }

    if (
      staleExecutableQuotes >
      0
    ) {
      return "MARKET_CACHE_STALE";
    }

    return "HEALTHY";
  }

  private buildObservations(
    classification:
      FreshnessRootCauseClassification,

    evictionRunning:
      boolean,

    executableQuotes:
      number,

    staleExecutableQuotes:
      number,

    exchanges:
      FreshnessExchangeRootCause[],

    rejections:
      FreshnessRejectionAgeSummary,
  ): string[] {
    const observations:
      string[] =
      [];

    if (
      !evictionRunning
    ) {
      observations.push(
        "StaleExecutableEvictionService is NOT running. Stale quotes can therefore remain marked executable in MarketCache until another component explicitly invalidates them.",
      );
    }

    if (
      executableQuotes >
      0
    ) {
      observations.push(
        `${staleExecutableQuotes} of ${executableQuotes} currently executable MarketCache quotes are stale under the same FreshnessIntegrityService policy used by the evaluator.`,
      );
    }

    const cachePublicationMismatch =
      exchanges.reduce(
        (
          sum,
          exchange,
        ) =>
          sum +
          exchange
            .cacheStaleBookFresh,
        0,
      );

    if (
      cachePublicationMismatch >
      0
    ) {
      observations.push(
        `${cachePublicationMismatch} matched markets have a fresh OrderBookService book but stale MarketCache executable quote. This is direct evidence of a cache publication/timestamp synchronization problem.`,
      );
    }

    const bothStale =
      exchanges.reduce(
        (
          sum,
          exchange,
        ) =>
          sum +
          exchange
            .cacheStaleBookStale,
        0,
      );

    if (
      bothStale >
      0
    ) {
      observations.push(
        `${bothStale} matched markets are stale in both MarketCache and OrderBookService. Those markets are not receiving sufficiently recent book updates under the current freshness policy.`,
      );
    }

    if (
      rejections.sampleSize >
      0
    ) {
      observations.push(
        `Recent freshness rejection sample contains ${rejections.staleBoth} stale-both, ${rejections.staleBuy} stale-buy, ${rejections.staleSell} stale-sell and ${rejections.pairNotSynchronized} pair-synchronization rejection(s).`,
      );
    }

    observations.push(
      `Root-cause classification: ${classification}.`,

      "This endpoint is diagnostic-only. It does not start eviction, widen freshness thresholds, mutate subscriptions, or change trading policy.",
    );

    return observations;
  }

  private mismatchDiagnosis(
    cacheFresh:
      boolean,

    bookFresh:
      boolean,

    timestampDeltaMs:
      number,
  ): string {
    if (
      !cacheFresh &&
      bookFresh
    ) {
      return "MARKET_CACHE_STALE_WHILE_ORDER_BOOK_FRESH";
    }

    if (
      cacheFresh &&
      !bookFresh
    ) {
      return "MARKET_CACHE_FRESH_WHILE_ORDER_BOOK_STALE";
    }

    if (
      !cacheFresh &&
      !bookFresh
    ) {
      return "BOTH_CACHE_AND_ORDER_BOOK_STALE";
    }

    if (
      timestampDeltaMs >
      250
    ) {
      return "TIMESTAMP_DRIFT_WITH_BOTH_CURRENTLY_FRESH";
    }

    return "TIMESTAMPS_ALIGNED";
  }

  private numberMetadata(
    metadata:
      Readonly<
        Record<
          string,
          unknown
        >
      >,

    key:
      string,
  ): number | null {
    const value =
      metadata[
        key
      ];

    return typeof value ===
      "number" &&
      Number.isFinite(
        value,
      )
      ? value
      : null;
  }

  private distribution(
    values:
      number[],
  ): FreshnessAgeDistribution {
    const finiteValues =
      values
        .filter(
          Number.isFinite,
        )
        .sort(
          (
            first,
            second,
          ) =>
            first -
            second,
        );

    if (
      finiteValues.length ===
      0
    ) {
      return {
        count:
          0,

        minimumMs:
          null,

        p50Ms:
          null,

        p95Ms:
          null,

        averageMs:
          null,

        maximumMs:
          null,
      };
    }

    const total =
      finiteValues.reduce(
        (
          sum,
          value,
        ) =>
          sum +
          value,
        0,
      );

    return {
      count:
        finiteValues.length,

      minimumMs:
        finiteValues[0] ??
        null,

      p50Ms:
        this.percentile(
          finiteValues,
          0.5,
        ),

      p95Ms:
        this.percentile(
          finiteValues,
          0.95,
        ),

      averageMs:
        total /
        finiteValues.length,

      maximumMs:
        finiteValues[
          finiteValues.length -
          1
        ] ??
        null,
    };
  }

  private percentile(
    sortedValues:
      number[],

    percentile:
      number,
  ): number | null {
    if (
      sortedValues.length ===
      0
    ) {
      return null;
    }

    const index =
      Math.min(
        sortedValues.length -
          1,

        Math.max(
          0,

          Math.ceil(
            sortedValues.length *
              percentile,
          ) -
            1,
        ),
      );

    return sortedValues[
      index
    ] ??
      null;
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

    return (
      numerator /
      denominator
    ) *
      100;
  }

  private normalizeExchange(
    exchange:
      string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }
}

export const freshnessRootCauseAnalyzerService =
  new FreshnessRootCauseAnalyzerService();