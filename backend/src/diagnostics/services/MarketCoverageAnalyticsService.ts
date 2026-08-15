import {
  comparisonEngine,
} from "../../arbitrage/ComparisonEngine";

import {
  exchangePairGenerator,
} from "../../arbitrage/engines/ExchangePairGenerator";

import {
  exchangeManager,
} from "../../exchanges/core/ExchangeManager";

import {
  marketCache,
} from "../../services/cache.service";

export interface ExchangeMarketCoverage {
  exchange:
    string;

  connected:
    boolean;

  totalQuotes:
    number;

  executableQuotes:
    number;

  nonExecutableQuotes:
    number;

  uniqueMarkets:
    number;

  executableMarkets:
    number;

  executableCoveragePercent:
    number;
}

export interface ExchangePairCoverage {
  firstExchange:
    string;

  secondExchange:
    string;

  commonMarkets:
    number;

  commonExecutableMarkets:
    number;

  generatedDirectionalPairs:
    number;

  commonMarketCoveragePercent:
    number;

  commonExecutableCoveragePercent:
    number;
}

export interface SharedMarketCoverage {
  market:
    string;

  exchanges:
    string[];

  exchangeCount:
    number;

  executableExchanges:
    string[];

  executableExchangeCount:
    number;

  generatedDirectionalPairs:
    number;
}

export interface MarketCoverageSummary {
  cachedQuotes:
    number;

  executableQuotes:
    number;

  uniqueMarkets:
    number;

  sharedMarkets:
    number;

  pairableMarkets:
    number;

  generatedDirectionalPairs:
    number;

  registeredExchanges:
    number;

  connectedExchanges:
    number;
}

export interface MarketCoverageAnalyticsReport {
  generatedAt:
    number;

  summary:
    MarketCoverageSummary;

  exchanges:
    ExchangeMarketCoverage[];

  exchangePairs:
    ExchangePairCoverage[];

  mostSharedMarkets:
    SharedMarketCoverage[];

  nonPairableSharedMarkets: {
    market:
      string;

    exchanges:
      string[];

    executableExchanges:
      string[];

    reason:
      string;
  }[];

  observations:
    string[];
}

const MOST_SHARED_MARKET_LIMIT =
  50;

const NON_PAIRABLE_MARKET_LIMIT =
  100;

export class MarketCoverageAnalyticsService {
  getReport():
    MarketCoverageAnalyticsReport {
    const quotes =
      marketCache.getAll();

    const executableQuotes =
      quotes.filter(
        (quote) =>
          quote.executable,
      );

    const snapshots =
      comparisonEngine
        .groupByMarket(
          quotes,
        );

    const registeredAdapters =
      exchangeManager
        .getAll();

    const registeredExchangeNames =
      registeredAdapters
        .map(
          (exchange) =>
            exchange.name
              .trim()
              .toLowerCase(),
        );

    /*
     * Include exchanges that currently have
     * cached quotes even if an adapter is not
     * visible in ExchangeManager.
     *
     * This makes the diagnostic report robust
     * during adapter migration/testing.
     */
    const exchangeNameSet =
      new Set<string>(
        registeredExchangeNames,
      );

    for (
      const quote
      of quotes
    ) {
      exchangeNameSet.add(
        quote.exchange
          .trim()
          .toLowerCase(),
      );
    }

    const exchangeNames =
      Array.from(
        exchangeNameSet,
      ).sort();

    const exchangeCoverage =
      exchangeNames
        .map(
          (exchange) =>
            this.buildExchangeCoverage(
              exchange,
              registeredAdapters,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.executableQuotes -
            first.executableQuotes,
        );

    const pairCoverage =
      this.buildExchangePairCoverage(
        exchangeNames,
        snapshots,
      );

    const sharedMarkets:
      SharedMarketCoverage[] =
      [];

    const nonPairableSharedMarkets:
      MarketCoverageAnalyticsReport[
        "nonPairableSharedMarkets"
      ] =
      [];

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

      const exchanges =
        Array.from(
          new Set(
            snapshotQuotes.map(
              (quote) =>
                quote.exchange
                  .trim()
                  .toLowerCase(),
            ),
          ),
        ).sort();

      if (
        exchanges.length <
        2
      ) {
        continue;
      }

      const executableExchanges =
        Array.from(
          new Set(
            snapshotQuotes
              .filter(
                (quote) =>
                  this.isFullyExecutableQuote(
                    quote,
                  ),
              )
              .map(
                (quote) =>
                  quote.exchange
                    .trim()
                    .toLowerCase(),
              ),
          ),
        ).sort();

      const pairs =
        exchangePairGenerator
          .generate(
            snapshot,
          );

      if (
        pairs.length >
        0
      ) {
        pairableMarkets +=
          1;
      }

      generatedDirectionalPairs +=
        pairs.length;

      sharedMarkets.push({
        market:
          snapshot.market,

        exchanges,

        exchangeCount:
          exchanges.length,

        executableExchanges,

        executableExchangeCount:
          executableExchanges.length,

        generatedDirectionalPairs:
          pairs.length,
      });

      if (
        pairs.length ===
        0 &&
        nonPairableSharedMarkets.length <
          NON_PAIRABLE_MARKET_LIMIT
      ) {
        nonPairableSharedMarkets.push({
          market:
            snapshot.market,

          exchanges,

          executableExchanges,

          reason:
            this.resolveNonPairableReason(
              snapshotQuotes,
              executableExchanges,
            ),
        });
      }
    }

    sharedMarkets.sort(
      (
        first,
        second,
      ) => {
        if (
          first.exchangeCount !==
          second.exchangeCount
        ) {
          return (
            second.exchangeCount -
            first.exchangeCount
          );
        }

        if (
          first.generatedDirectionalPairs !==
          second.generatedDirectionalPairs
        ) {
          return (
            second.generatedDirectionalPairs -
            first.generatedDirectionalPairs
          );
        }

        return first.market
          .localeCompare(
            second.market,
          );
      },
    );

    const summary:
      MarketCoverageSummary = {
      cachedQuotes:
        quotes.length,

      executableQuotes:
        executableQuotes.length,

      uniqueMarkets:
        snapshots.length,

      sharedMarkets:
        sharedMarkets.length,

      pairableMarkets,

      generatedDirectionalPairs,

      registeredExchanges:
        registeredAdapters.length,

      connectedExchanges:
        registeredAdapters
          .filter(
            (exchange) =>
              exchange.isConnected(),
          )
          .length,
    };

    return {
      generatedAt:
        Date.now(),

      summary,

      exchanges:
        exchangeCoverage,

      exchangePairs:
        pairCoverage,

      mostSharedMarkets:
        sharedMarkets.slice(
          0,
          MOST_SHARED_MARKET_LIMIT,
        ),

      nonPairableSharedMarkets,

      observations:
        this.buildObservations(
          summary,
          exchangeCoverage,
          pairCoverage,
          nonPairableSharedMarkets.length,
        ),
    };
  }

  private buildExchangeCoverage(
    exchange:
      string,

    registeredAdapters:
      ReturnType<
        typeof exchangeManager.getAll
      >,
  ): ExchangeMarketCoverage {
    const quotes =
      marketCache
        .getByExchange(
          exchange,
        );

    const executable =
      quotes.filter(
        (quote) =>
          quote.executable,
      );

    const uniqueMarkets =
      new Set(
        quotes.map(
          (quote) =>
            quote.market
              .trim()
              .toUpperCase(),
        ),
      );

    const executableMarkets =
      new Set(
        executable.map(
          (quote) =>
            quote.market
              .trim()
              .toUpperCase(),
        ),
      );

    const adapter =
      registeredAdapters.find(
        (candidate) =>
          candidate.name
            .trim()
            .toLowerCase() ===
          exchange,
      );

    return {
      exchange,

      connected:
        adapter
          ?.isConnected() ??
        false,

      totalQuotes:
        quotes.length,

      executableQuotes:
        executable.length,

      nonExecutableQuotes:
        quotes.length -
        executable.length,

      uniqueMarkets:
        uniqueMarkets.size,

      executableMarkets:
        executableMarkets.size,

      executableCoveragePercent:
        this.calculatePercent(
          executableMarkets.size,
          uniqueMarkets.size,
        ),
    };
  }

  private buildExchangePairCoverage(
    exchangeNames:
      readonly string[],

    snapshots:
      ReturnType<
        typeof comparisonEngine.groupByMarket
      >,
  ): ExchangePairCoverage[] {
    const result:
      ExchangePairCoverage[] =
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

        let commonMarkets =
          0;

        let commonExecutableMarkets =
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

          commonMarkets +=
            1;

          const firstExecutable =
            this.isFullyExecutableQuote(
              firstQuote,
            );

          const secondExecutable =
            this.isFullyExecutableQuote(
              secondQuote,
            );

          if (
            firstExecutable &&
            secondExecutable
          ) {
            commonExecutableMarkets +=
              1;
          }

          /*
           * Count only generated directional
           * routes belonging to this exact
           * exchange pair.
           */
          const pairs =
            exchangePairGenerator
              .generate(
                snapshot,
              )
              .filter(
                (pair) => {
                  const buyExchange =
                    pair.buy.exchange
                      .trim()
                      .toLowerCase();

                  const sellExchange =
                    pair.sell.exchange
                      .trim()
                      .toLowerCase();

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

        const firstMarkets =
          marketCache
            .getByExchange(
              firstExchange,
            )
            .length;

        const secondMarkets =
          marketCache
            .getByExchange(
              secondExchange,
            )
            .length;

        const smallerMarketSet =
          Math.min(
            firstMarkets,
            secondMarkets,
          );

        const firstExecutableMarkets =
          marketCache
            .getExecutableByExchange(
              firstExchange,
            )
            .length;

        const secondExecutableMarkets =
          marketCache
            .getExecutableByExchange(
              secondExchange,
            )
            .length;

        const smallerExecutableSet =
          Math.min(
            firstExecutableMarkets,
            secondExecutableMarkets,
          );

        result.push({
          firstExchange,

          secondExchange,

          commonMarkets,

          commonExecutableMarkets,

          generatedDirectionalPairs,

          commonMarketCoveragePercent:
            this.calculatePercent(
              commonMarkets,
              smallerMarketSet,
            ),

          commonExecutableCoveragePercent:
            this.calculatePercent(
              commonExecutableMarkets,
              smallerExecutableSet,
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

        return (
          second.commonExecutableMarkets -
          first.commonExecutableMarkets
        );
      },
    );
  }

  private isFullyExecutableQuote(
    quote: {
      executable:
        boolean;

      bestBidPrice:
        number | null;

      bestBidQty:
        number | null;

      bestAskPrice:
        number | null;

      bestAskQty:
        number | null;
    },
  ): boolean {
    return (
      quote.executable &&
      quote.bestBidPrice !==
        null &&
      Number.isFinite(
        quote.bestBidPrice,
      ) &&
      quote.bestBidPrice >
        0 &&
      quote.bestBidQty !==
        null &&
      Number.isFinite(
        quote.bestBidQty,
      ) &&
      quote.bestBidQty >
        0 &&
      quote.bestAskPrice !==
        null &&
      Number.isFinite(
        quote.bestAskPrice,
      ) &&
      quote.bestAskPrice >
        0 &&
      quote.bestAskQty !==
        null &&
      Number.isFinite(
        quote.bestAskQty,
      ) &&
      quote.bestAskQty >
        0
    );
  }

  private resolveNonPairableReason(
    quotes:
      readonly {
        exchange:
          string;

        executable:
          boolean;

        bestBidPrice:
          number | null;

        bestBidQty:
          number | null;

        bestAskPrice:
          number | null;

        bestAskQty:
          number | null;
      }[],

    executableExchanges:
      readonly string[],
  ): string {
    if (
      executableExchanges.length <
      2
    ) {
      const failed =
        quotes
          .filter(
            (quote) =>
              !this.isFullyExecutableQuote(
                quote,
              ),
          )
          .map(
            (quote) => {
              const problems:
                string[] =
                [];

              if (
                !quote.executable
              ) {
                problems.push(
                  "not executable",
                );
              }

              if (
                quote.bestBidPrice ===
                  null ||
                !Number.isFinite(
                  quote.bestBidPrice,
                ) ||
                quote.bestBidPrice <=
                  0
              ) {
                problems.push(
                  "missing bid price",
                );
              }

              if (
                quote.bestBidQty ===
                  null ||
                !Number.isFinite(
                  quote.bestBidQty,
                ) ||
                quote.bestBidQty <=
                  0
              ) {
                problems.push(
                  "missing bid quantity",
                );
              }

              if (
                quote.bestAskPrice ===
                  null ||
                !Number.isFinite(
                  quote.bestAskPrice,
                ) ||
                quote.bestAskPrice <=
                  0
              ) {
                problems.push(
                  "missing ask price",
                );
              }

              if (
                quote.bestAskQty ===
                  null ||
                !Number.isFinite(
                  quote.bestAskQty,
                ) ||
                quote.bestAskQty <=
                  0
              ) {
                problems.push(
                  "missing ask quantity",
                );
              }

              return `${quote.exchange}: ${problems.join(
                ", ",
              )}`;
            },
          );

      return (
        failed.join(
          " | ",
        ) ||
        "Fewer than two exchanges have fully executable quotes."
      );
    }

    return (
      "At least two executable exchanges are present, but no valid directional exchange pair was generated."
    );
  }

  private buildObservations(
    summary:
      MarketCoverageSummary,

    exchangeCoverage:
      readonly ExchangeMarketCoverage[],

    pairCoverage:
      readonly ExchangePairCoverage[],

    nonPairableSharedMarketCount:
      number,
  ): string[] {
    const observations:
      string[] =
      [];

    if (
      summary.uniqueMarkets >
        0
    ) {
      const pairablePercent =
        this.calculatePercent(
          summary.pairableMarkets,
          summary.uniqueMarkets,
        );

      observations.push(
        `${pairablePercent.toFixed(
          2,
        )}% of cached markets currently produce at least one executable cross-exchange route.`,
      );
    }

    if (
      summary.sharedMarkets >
        0
    ) {
      const sharedPairablePercent =
        this.calculatePercent(
          summary.pairableMarkets,
          summary.sharedMarkets,
        );

      observations.push(
        `${sharedPairablePercent.toFixed(
          2,
        )}% of shared markets are currently pairable.`,
      );
    }

    const weakestExchange =
      [...exchangeCoverage]
        .filter(
          (exchange) =>
            exchange.totalQuotes >
            0,
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.executableMarkets -
            second.executableMarkets,
        )[0];

    if (
      weakestExchange
    ) {
      observations.push(
        `${weakestExchange.exchange} currently contributes the fewest executable markets (${weakestExchange.executableMarkets}).`,
      );
    }

    const strongestPair =
      pairCoverage[0];

    if (
      strongestPair
    ) {
      observations.push(
        `Strongest current exchange overlap is ${strongestPair.firstExchange} <-> ${strongestPair.secondExchange} with ${strongestPair.commonExecutableMarkets} common executable markets and ${strongestPair.generatedDirectionalPairs} generated directional routes.`,
      );
    }

    if (
      nonPairableSharedMarketCount >
      0
    ) {
      observations.push(
        `${nonPairableSharedMarketCount} sampled shared markets currently fail to produce an executable directional pair.`,
      );
    }

    if (
      summary.connectedExchanges <
      3
    ) {
      observations.push(
        "Exchange diversity is still low; adding healthy market-data adapters should materially increase possible arbitrage routes.",
      );
    }

    return observations;
  }

  private calculatePercent(
    numerator:
      number,

    denominator:
      number,
  ): number {
    if (
      !Number.isFinite(
        numerator,
      ) ||
      !Number.isFinite(
        denominator,
      ) ||
      denominator <=
        0
    ) {
      return 0;
    }

    return (
      Math.round(
        (
          numerator /
          denominator
        ) *
          100 *
          10_000,
      ) /
      10_000
    );
  }
}

export const marketCoverageAnalyticsService =
  new MarketCoverageAnalyticsService();