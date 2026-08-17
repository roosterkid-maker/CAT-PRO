import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  comparisonEngine,
} from "../../arbitrage/ComparisonEngine";

import {
  exchangePairGenerator,
} from "../../arbitrage/engines/ExchangePairGenerator";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  marketCache,
} from "../../services/cache.service";

export type StrategyOneCoverageBlocker =
  | "NOT_EXECUTABLE"
  | "MISSING_BID_PRICE"
  | "MISSING_BID_QUANTITY"
  | "MISSING_ASK_PRICE"
  | "MISSING_ASK_QUANTITY"
  | "INVALID_TIMESTAMP"
  | "FUTURE_TIMESTAMP"
  | "STALE_TIMESTAMP";

export interface StrategyOneCoverageReasonCount {
  reason:
    StrategyOneCoverageBlocker;

  count:
    number;

  percentOfExchangeQuotes:
    number;
}

export interface StrategyOneExchangeCoverageFunnel {
  exchange:
    string;

  totalCachedQuotes:
    number;

  executableFlaggedQuotes:
    number;

  structurallyExecutableQuotes:
    number;

  freshStructurallyExecutableQuotes:
    number;

  nonExecutableQuotes:
    number;

  executableFlagCoveragePercent:
    number;

  structuralCoveragePercent:
    number;

  freshStructuralCoveragePercent:
    number;

  freshness: {
    fresh:
      number;

    stale:
      number;

    invalidTimestamp:
      number;

    futureTimestamp:
      number;
  };

  blockers:
    StrategyOneCoverageReasonCount[];

  note:
    string;
}

export interface StrategyOnePairCoverageFunnel {
  firstExchange:
    string;

  secondExchange:
    string;

  sharedCachedMarkets:
    number;

  sharedExecutableMarkets:
    number;

  sharedFreshExecutableMarkets:
    number;

  generatedDirectionalPairs:
    number;

  freshExecutableCoveragePercent:
    number;
}

export interface StrategyOneMarketFunnelSummary {
  cachedQuotes:
    number;

  uniqueMarkets:
    number;

  sharedMarkets:
    number;

  executableQuotes:
    number;

  structurallyExecutableQuotes:
    number;

  freshStructurallyExecutableQuotes:
    number;

  pairableMarkets:
    number;

  generatedDirectionalPairs:
    number;
}

export interface StrategyOneCoverageFunnelReport {
  version:
    "1.0";

  generatedAt:
    number;

  strategyId:
    "cross-exchange-arbitrage";

  mode:
    "READ_ONLY_DIAGNOSTICS";

  summary:
    StrategyOneMarketFunnelSummary;

  exchanges:
    StrategyOneExchangeCoverageFunnel[];

  exchangePairs:
    StrategyOnePairCoverageFunnel[];

  observations:
    string[];

  safety: {
    readOnly:
      true;

    changesTradingPolicy:
      false;

    changesFreshnessPolicy:
      false;

    promotesTickerToExecutable:
      false;

    placesPaperOrder:
      false;

    placesLiveOrder:
      false;
  };
}

/**
 * Strategy #1 market-data conversion diagnostics.
 *
 * IMPORTANT:
 *
 * This service is deliberately read-only.
 *
 * It does NOT:
 * - mark a quote executable,
 * - increase exchange subscriptions,
 * - lower freshness requirements,
 * - guess order-book quantities,
 * - guess exchange rules,
 * - trigger PAPER execution,
 * - trigger LIVE execution.
 *
 * Its only job is to explain where current cached
 * market data is being lost before exchange-pair
 * generation.
 */
export class StrategyOneCoverageFunnelService {
  getReport(
    now =
      Date.now(),
  ): StrategyOneCoverageFunnelReport {
    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <= 0
    ) {
      throw new Error(
        "Strategy #1 coverage funnel timestamp must be a positive safe integer.",
      );
    }

    const quotes =
      marketCache.getAll();

    const snapshots =
      comparisonEngine.groupByMarket(
        quotes,
      );

    const exchangeNames =
      Array.from(
        new Set(
          quotes.map(
            (quote) =>
              this.normalizeExchange(
                quote.exchange,
              ),
          ),
        ),
      ).sort();

    const exchanges =
      exchangeNames
        .map(
          (exchange) =>
            this.buildExchangeReport(
              exchange,
              quotes,
              now,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second
              .freshStructurallyExecutableQuotes -
            first
              .freshStructurallyExecutableQuotes,
        );

    const exchangePairs =
      this.buildExchangePairReports(
        exchangeNames,
        snapshots,
        now,
      );

    const executableQuotes =
      quotes.filter(
        (quote) =>
          quote.executable,
      ).length;

    const structurallyExecutableQuotes =
      quotes.filter(
        (quote) =>
          this.isStructurallyExecutable(
            quote,
          ),
      ).length;

    const freshStructurallyExecutableQuotes =
      quotes.filter(
        (quote) =>
          this.isFreshStructurallyExecutable(
            quote,
            now,
          ),
      ).length;

    let sharedMarkets =
      0;

    let pairableMarkets =
      0;

    let generatedDirectionalPairs =
      0;

    for (
      const snapshot
      of snapshots
    ) {
      const snapshotQuotes =
        Object.values(
          snapshot.quotes,
        );

      if (
        snapshotQuotes.length <
        2
      ) {
        continue;
      }

      sharedMarkets +=
        1;

      const generatedPairs =
        exchangePairGenerator.generate(
          snapshot,
        );

      if (
        generatedPairs.length >
        0
      ) {
        pairableMarkets +=
          1;

        generatedDirectionalPairs +=
          generatedPairs.length;
      }
    }

    const summary:
      StrategyOneMarketFunnelSummary = {
      cachedQuotes:
        quotes.length,

      uniqueMarkets:
        snapshots.length,

      sharedMarkets,

      executableQuotes,

      structurallyExecutableQuotes,

      freshStructurallyExecutableQuotes,

      pairableMarkets,

      generatedDirectionalPairs,
    };

    return {
      version:
        "1.0",

      generatedAt:
        now,

      strategyId:
        "cross-exchange-arbitrage",

      mode:
        "READ_ONLY_DIAGNOSTICS",

      summary,

      exchanges,

      exchangePairs,

      observations:
        this.buildObservations(
          summary,
          exchanges,
          exchangePairs,
        ),

      safety: {
        readOnly:
          true,

        changesTradingPolicy:
          false,

        changesFreshnessPolicy:
          false,

        promotesTickerToExecutable:
          false,

        placesPaperOrder:
          false,

        placesLiveOrder:
          false,
      },
    };
  }

  private buildExchangeReport(
    exchange:
      string,

    allQuotes:
      readonly ExecutableQuote[],

    now:
      number,
  ): StrategyOneExchangeCoverageFunnel {
    const quotes =
      allQuotes.filter(
        (quote) =>
          this.normalizeExchange(
            quote.exchange,
          ) ===
          exchange,
      );

    const executableFlaggedQuotes =
      quotes.filter(
        (quote) =>
          quote.executable,
      ).length;

    const structurallyExecutableQuotes =
      quotes.filter(
        (quote) =>
          this.isStructurallyExecutable(
            quote,
          ),
      ).length;

    const freshStructurallyExecutableQuotes =
      quotes.filter(
        (quote) =>
          this.isFreshStructurallyExecutable(
            quote,
            now,
          ),
      ).length;

    let fresh =
      0;

    let stale =
      0;

    let invalidTimestamp =
      0;

    let futureTimestamp =
      0;

    const blockerCounts =
      new Map<
        StrategyOneCoverageBlocker,
        number
      >();

    for (
      const quote
      of quotes
    ) {
      if (
        !quote.executable
      ) {
        this.increment(
          blockerCounts,
          "NOT_EXECUTABLE",
        );
      }

      if (
        !this.validPositive(
          quote.bestBidPrice,
        )
      ) {
        this.increment(
          blockerCounts,
          "MISSING_BID_PRICE",
        );
      }

      if (
        !this.validPositive(
          quote.bestBidQty,
        )
      ) {
        this.increment(
          blockerCounts,
          "MISSING_BID_QUANTITY",
        );
      }

      if (
        !this.validPositive(
          quote.bestAskPrice,
        )
      ) {
        this.increment(
          blockerCounts,
          "MISSING_ASK_PRICE",
        );
      }

      if (
        !this.validPositive(
          quote.bestAskQty,
        )
      ) {
        this.increment(
          blockerCounts,
          "MISSING_ASK_QUANTITY",
        );
      }

      const freshness =
        freshnessIntegrityService
          .evaluateQuote(
            quote,
            now,
          );

      switch (
        freshness.reason
      ) {
        case "FRESH": {
          fresh +=
            1;

          break;
        }

        case "STALE_TIMESTAMP": {
          stale +=
            1;

          this.increment(
            blockerCounts,
            "STALE_TIMESTAMP",
          );

          break;
        }

        case "INVALID_TIMESTAMP": {
          invalidTimestamp +=
            1;

          this.increment(
            blockerCounts,
            "INVALID_TIMESTAMP",
          );

          break;
        }

        case "FUTURE_TIMESTAMP": {
          futureTimestamp +=
            1;

          this.increment(
            blockerCounts,
            "FUTURE_TIMESTAMP",
          );

          break;
        }
      }
    }

    const blockers =
      Array.from(
        blockerCounts.entries(),
      )
        .map(
          (
            [
              reason,
              count,
            ],
          ): StrategyOneCoverageReasonCount => ({
            reason,

            count,

            percentOfExchangeQuotes:
              this.percent(
                count,
                quotes.length,
              ),
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.count -
              first.count ||
            first.reason.localeCompare(
              second.reason,
            ),
        );

    return {
      exchange,

      totalCachedQuotes:
        quotes.length,

      executableFlaggedQuotes,

      structurallyExecutableQuotes,

      freshStructurallyExecutableQuotes,

      nonExecutableQuotes:
        quotes.length -
        executableFlaggedQuotes,

      executableFlagCoveragePercent:
        this.percent(
          executableFlaggedQuotes,
          quotes.length,
        ),

      structuralCoveragePercent:
        this.percent(
          structurallyExecutableQuotes,
          quotes.length,
        ),

      freshStructuralCoveragePercent:
        this.percent(
          freshStructurallyExecutableQuotes,
          quotes.length,
        ),

      freshness: {
        fresh,

        stale,

        invalidTimestamp,

        futureTimestamp,
      },

      blockers,

      note:
        this.exchangeNote(
          exchange,
          quotes.length,
          freshStructurallyExecutableQuotes,
        ),
    };
  }

  private buildExchangePairReports(
    exchangeNames:
      readonly string[],

    snapshots:
      ReturnType<
        typeof comparisonEngine.groupByMarket
      >,

    now:
      number,
  ): StrategyOnePairCoverageFunnel[] {
    const result:
      StrategyOnePairCoverageFunnel[] =
      [];

    for (
      let firstIndex =
        0;
      firstIndex <
      exchangeNames.length;
      firstIndex +=
        1
    ) {
      for (
        let secondIndex =
          firstIndex +
          1;
        secondIndex <
        exchangeNames.length;
        secondIndex +=
          1
      ) {
        const firstExchange =
          exchangeNames[
            firstIndex
          ];

        const secondExchange =
          exchangeNames[
            secondIndex
          ];

        if (
          !firstExchange ||
          !secondExchange
        ) {
          continue;
        }

        let sharedCachedMarkets =
          0;

        let sharedExecutableMarkets =
          0;

        let sharedFreshExecutableMarkets =
          0;

        let generatedDirectionalPairs =
          0;

        for (
          const snapshot
          of snapshots
        ) {
          const firstQuote =
            snapshot.quotes[
              firstExchange
            ];

          const secondQuote =
            snapshot.quotes[
              secondExchange
            ];

          if (
            !firstQuote ||
            !secondQuote
          ) {
            continue;
          }

          sharedCachedMarkets +=
            1;

          const bothExecutable =
            this.isStructurallyExecutable(
              firstQuote,
            ) &&
            this.isStructurallyExecutable(
              secondQuote,
            );

          if (
            bothExecutable
          ) {
            sharedExecutableMarkets +=
              1;
          }

          const bothFreshExecutable =
            this.isFreshStructurallyExecutable(
              firstQuote,
              now,
            ) &&
            this.isFreshStructurallyExecutable(
              secondQuote,
              now,
            );

          if (
            bothFreshExecutable
          ) {
            sharedFreshExecutableMarkets +=
              1;
          }

          const pairs =
            exchangePairGenerator
              .generate(
                snapshot,
              )
              .filter(
                (pair) => {
                  const buyExchange =
                    this.normalizeExchange(
                      pair.buy.exchange,
                    );

                  const sellExchange =
                    this.normalizeExchange(
                      pair.sell.exchange,
                    );

                  return (
                    (
                      buyExchange ===
                        firstExchange &&
                      sellExchange ===
                        secondExchange
                    ) ||
                    (
                      buyExchange ===
                        secondExchange &&
                      sellExchange ===
                        firstExchange
                    )
                  );
                },
              );

          generatedDirectionalPairs +=
            pairs.length;
        }

        result.push({
          firstExchange,

          secondExchange,

          sharedCachedMarkets,

          sharedExecutableMarkets,

          sharedFreshExecutableMarkets,

          generatedDirectionalPairs,

          freshExecutableCoveragePercent:
            this.percent(
              sharedFreshExecutableMarkets,
              sharedCachedMarkets,
            ),
        });
      }
    }

    return result.sort(
      (
        first,
        second,
      ) => {
        if (
          first.generatedDirectionalPairs !==
          second.generatedDirectionalPairs
        ) {
          return (
            second.generatedDirectionalPairs -
            first.generatedDirectionalPairs
          );
        }

        if (
          first.sharedFreshExecutableMarkets !==
          second.sharedFreshExecutableMarkets
        ) {
          return (
            second.sharedFreshExecutableMarkets -
            first.sharedFreshExecutableMarkets
          );
        }

        return (
          second.sharedCachedMarkets -
          first.sharedCachedMarkets
        );
      },
    );
  }

  private isStructurallyExecutable(
    quote:
      ExecutableQuote,
  ): boolean {
    return (
      quote.executable &&
      this.validPositive(
        quote.bestBidPrice,
      ) &&
      this.validPositive(
        quote.bestBidQty,
      ) &&
      this.validPositive(
        quote.bestAskPrice,
      ) &&
      this.validPositive(
        quote.bestAskQty,
      )
    );
  }

  private isFreshStructurallyExecutable(
    quote:
      ExecutableQuote,

    now:
      number,
  ): boolean {
    if (
      !this.isStructurallyExecutable(
        quote,
      )
    ) {
      return false;
    }

    return freshnessIntegrityService
      .evaluateQuote(
        quote,
        now,
      )
      .fresh;
  }

  private validPositive(
    value:
      number | null,
  ): boolean {
    return (
      value !==
        null &&
      Number.isFinite(
        value,
      ) &&
      value >
        0
    );
  }

  private increment(
    map:
      Map<
        StrategyOneCoverageBlocker,
        number
      >,

    key:
      StrategyOneCoverageBlocker,
  ): void {
    map.set(
      key,
      (
        map.get(
          key,
        ) ??
        0
      ) +
        1,
    );
  }

  private exchangeNote(
    exchange:
      string,

    totalQuotes:
      number,

    freshExecutableQuotes:
      number,
  ): string {
    if (
      totalQuotes ===
      0
    ) {
      return (
        "No cached quote is currently available."
      );
    }

    if (
      exchange ===
      "unocoin"
    ) {
      return (
        "UnoCoin total cached quotes include broad ticker discovery. " +
        "The intentionally small REST order-book fast lane means this denominator must not be interpreted as attempted executable-book coverage."
      );
    }

    if (
      exchange ===
      "coindcx"
    ) {
      return (
        "CoinDCX total cached quotes may include a broader ticker universe than the actively protected/order-book subscribed universe. " +
        "Use blocker counts and shared fresh executable markets to diagnose Strategy #1 throughput."
      );
    }

    if (
      freshExecutableQuotes ===
      0
    ) {
      return (
        "No currently fresh quantity-bearing executable top-of-book survived."
      );
    }

    return (
      "Coverage is calculated from cached quote state; Strategy #1 still requires a matching executable quote on another exchange."
    );
  }

  private buildObservations(
    summary:
      StrategyOneMarketFunnelSummary,

    exchanges:
      readonly StrategyOneExchangeCoverageFunnel[],

    pairs:
      readonly StrategyOnePairCoverageFunnel[],
  ): string[] {
    const observations:
      string[] =
      [];

    observations.push(
      `${summary.cachedQuotes} cached quotes currently reduce to ${summary.freshStructurallyExecutableQuotes} fresh, structurally executable quotes.`,
    );

    observations.push(
      `${summary.sharedMarkets} markets are visible on at least two exchanges; ${summary.pairableMarkets} currently generate at least one directional Strategy #1 route.`,
    );

    observations.push(
      `${summary.generatedDirectionalPairs} directional exchange pairs are currently generated before opportunity economics are evaluated.`,
    );

    const weakest =
      [...exchanges]
        .filter(
          (exchange) =>
            exchange.totalCachedQuotes >
            0,
        )
        .sort(
          (
            first,
            second,
          ) =>
            first
              .freshStructuralCoveragePercent -
            second
              .freshStructuralCoveragePercent,
        )[0];

    if (
      weakest
    ) {
      const primaryBlocker =
        weakest.blockers[0];

      observations.push(
        primaryBlocker
          ? `${weakest.exchange} currently has the weakest fresh structural coverage (${weakest.freshStructuralCoveragePercent.toFixed(
              2,
            )}%). Largest visible quote-level blocker is ${primaryBlocker.reason} (${primaryBlocker.count}).`
          : `${weakest.exchange} currently has the weakest fresh structural coverage (${weakest.freshStructuralCoveragePercent.toFixed(
              2,
            )}%).`,
      );
    }

    const strongestPair =
      pairs[0];

    if (
      strongestPair
    ) {
      observations.push(
        `Strongest current pair is ${strongestPair.firstExchange} <-> ${strongestPair.secondExchange}: ${strongestPair.sharedFreshExecutableMarkets} shared fresh executable markets and ${strongestPair.generatedDirectionalPairs} generated directional routes.`,
      );
    }

    if (
      summary.generatedDirectionalPairs ===
      0
    ) {
      observations.push(
        "Current throughput bottleneck is still before opportunity-profit evaluation because no directional pair is being generated.",
      );
    } else {
      observations.push(
        "Directional pairs exist. If successful PAPER trades remain low, inspect the existing Personal Strategy #1 conversion report next; the bottleneck may be economics, persistence, qualification, queue ownership or PAPER settlement rather than raw market coverage.",
      );
    }

    return observations;
  }

  private normalizeExchange(
    exchange:
      string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }

  private percent(
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

    return Math.round(
      (
        numerator /
        denominator
      ) *
        100 *
        100,
    ) /
      100;
  }
}

export const strategyOneCoverageFunnelService =
  new StrategyOneCoverageFunnelService();