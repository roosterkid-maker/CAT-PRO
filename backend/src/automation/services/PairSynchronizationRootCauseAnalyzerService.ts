import {
  opportunityRejectionStore,
} from "../../arbitrage/services/OpportunityRejectionStore";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  PairSynchronizationDistribution,
  PairSynchronizationMismatchSample,
  PairSynchronizationRootCauseReport,
  PairSynchronizationRouteDiagnostic,
} from "../models/PairSynchronizationRootCause";

const REJECTION_SAMPLE_LIMIT =
  500;

const MISMATCH_SAMPLE_LIMIT =
  60;

interface RouteAccumulator {
  buyExchange: string;

  sellExchange: string;

  maximumPairSkewMs: number;

  totalCurrentPairs: number;

  bothFreshPairs: number;

  synchronizedPairs: number;

  unsynchronizedPairs: number;

  skews: number[];

  buyAges: number[];

  sellAges: number[];

  buyNewer: number;

  sellNewer: number;

  equalTimestamp: number;

  recentRejections: number;
}

export class PairSynchronizationRootCauseAnalyzerService {
  getReport(
    now =
      Date.now(),
  ): PairSynchronizationRootCauseReport {
    const executableQuotes =
      marketCache
        .getAll()
        .filter(
          (
            quote,
          ) =>
            quote.executable,
        );

    /*
     * Important:
     *
     * Pair synchronization is analyzed ONLY after
     * both individual quotes pass the existing
     * freshness policy.
     *
     * This prevents ordinary stale-data failures
     * from contaminating pair-skew diagnostics.
     */
    const freshQuotes =
      executableQuotes
        .filter(
          (
            quote,
          ) =>
            freshnessIntegrityService
              .evaluateQuote(
                quote,
                now,
              )
              .fresh,
        );

    const groups =
      new Map<
        string,
        ExecutableQuote[]
      >();

    for (
      const quote
      of freshQuotes
    ) {
      const market =
        quote.market
          .trim()
          .toUpperCase();

      const existing =
        groups.get(
          market,
        ) ??
        [];

      existing.push(
        quote,
      );

      groups.set(
        market,
        existing,
      );
    }

    const routeMap =
      new Map<
        string,
        RouteAccumulator
      >();

    const mismatchSamples:
      PairSynchronizationMismatchSample[] =
      [];

    for (
      const [
        market,
        quotes,
      ]
      of groups.entries()
    ) {
      for (
        let buyIndex =
          0;

        buyIndex <
        quotes.length;

        buyIndex +=
          1
      ) {
        for (
          let sellIndex =
            0;

          sellIndex <
          quotes.length;

          sellIndex +=
            1
        ) {
          if (
            buyIndex ===
            sellIndex
          ) {
            continue;
          }

          const buy =
            quotes[
              buyIndex
            ];

          const sell =
            quotes[
              sellIndex
            ];

          if (
            !buy ||
            !sell
          ) {
            continue;
          }

          const buyExchange =
            this.normalizeExchange(
              buy.exchange,
            );

          const sellExchange =
            this.normalizeExchange(
              sell.exchange,
            );

          if (
            buyExchange ===
            sellExchange
          ) {
            continue;
          }

          const routeKey =
            `${buyExchange}->${sellExchange}`;

          const pair =
            freshnessIntegrityService
              .evaluatePair(
                buy,
                sell,
                now,
              );

          const buyAgeMs =
            pair.buy
              .ageMs;

          const sellAgeMs =
            pair.sell
              .ageMs;

          if (
            buyAgeMs ===
              null ||
            sellAgeMs ===
              null ||
            pair.timestampSkewMs ===
              null
          ) {
            continue;
          }

          const accumulator =
            routeMap.get(
              routeKey,
            ) ??
            {
              buyExchange,

              sellExchange,

              maximumPairSkewMs:
                pair.maximumPairSkewMs,

              totalCurrentPairs:
                0,

              bothFreshPairs:
                0,

              synchronizedPairs:
                0,

              unsynchronizedPairs:
                0,

              skews:
                [],

              buyAges:
                [],

              sellAges:
                [],

              buyNewer:
                0,

              sellNewer:
                0,

              equalTimestamp:
                0,

              recentRejections:
                0,
            };

          accumulator
            .totalCurrentPairs +=
            1;

          accumulator
            .bothFreshPairs +=
            1;

          accumulator
            .skews
            .push(
              pair.timestampSkewMs,
            );

          accumulator
            .buyAges
            .push(
              buyAgeMs,
            );

          accumulator
            .sellAges
            .push(
              sellAgeMs,
            );

          if (
            pair.synchronized
          ) {
            accumulator
              .synchronizedPairs +=
              1;
          } else {
            accumulator
              .unsynchronizedPairs +=
              1;

            if (
              mismatchSamples.length <
              MISMATCH_SAMPLE_LIMIT
            ) {
              mismatchSamples.push({
                market,

                buyExchange,

                sellExchange,

                buyTimestamp:
                  buy.timestamp,

                sellTimestamp:
                  sell.timestamp,

                buyAgeMs,

                sellAgeMs,

                timestampSkewMs:
                  pair.timestampSkewMs,

                maximumPairSkewMs:
                  pair.maximumPairSkewMs,

                olderSide:
                  buy.timestamp ===
                    sell.timestamp
                    ? "EQUAL"
                    : buy.timestamp <
                        sell.timestamp
                      ? "BUY"
                      : "SELL",

                exceededByMs:
                  Math.max(
                    0,

                    pair.timestampSkewMs -
                      pair.maximumPairSkewMs,
                  ),
              });
            }
          }

          if (
            buy.timestamp >
            sell.timestamp
          ) {
            accumulator
              .buyNewer +=
              1;
          } else if (
            sell.timestamp >
            buy.timestamp
          ) {
            accumulator
              .sellNewer +=
              1;
          } else {
            accumulator
              .equalTimestamp +=
              1;
          }

          routeMap.set(
            routeKey,
            accumulator,
          );
        }
      }
    }

    /*
     * Recent rejection history is separate from
     * the current snapshot.
     *
     * We use it only to see whether the same route
     * repeatedly experiences synchronization
     * failures over time.
     */
    const recentPairRejections =
      opportunityRejectionStore
        .getRecent(
          REJECTION_SAMPLE_LIMIT,
        )
        .filter(
          (
            record,
          ) =>
            record.code ===
            "PAIR_NOT_SYNCHRONIZED",
        );

    for (
      const rejection
      of recentPairRejections
    ) {
      const routeKey =
        `${this.normalizeExchange(
          rejection.buyExchange,
        )}->${this.normalizeExchange(
          rejection.sellExchange,
        )}`;

      const accumulator =
        routeMap.get(
          routeKey,
        );

      if (
        accumulator
      ) {
        accumulator
          .recentRejections +=
          1;
      }
    }

    const routes =
      Array.from(
        routeMap.entries(),
      )
        .map(
          (
            [
              route,
              accumulator,
            ],
          ) =>
            this.toRouteDiagnostic(
              route,
              accumulator,
            ),
        )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              second
                .unsynchronizedPairs !==
              first
                .unsynchronizedPairs
            ) {
              return (
                second
                  .unsynchronizedPairs -
                first
                  .unsynchronizedPairs
              );
            }

            return (
              second
                .recentRejections -
              first
                .recentRejections
            );
          },
        );

    const currentFreshDirectionalPairs =
      routes.reduce(
        (
          sum,
          route,
        ) =>
          sum +
          route
            .bothFreshPairs,

        0,
      );

    const synchronizedDirectionalPairs =
      routes.reduce(
        (
          sum,
          route,
        ) =>
          sum +
          route
            .synchronizedPairs,

        0,
      );

    const unsynchronizedDirectionalPairs =
      routes.reduce(
        (
          sum,
          route,
        ) =>
          sum +
          route
            .unsynchronizedPairs,

        0,
      );

    const synchronizationRatePercent =
      this.percentage(
        synchronizedDirectionalPairs,
        currentFreshDirectionalPairs,
      );

    const classification =
      this.classify(
        currentFreshDirectionalPairs,
        synchronizationRatePercent,
        routes,
      );

    const observations =
      this.buildObservations(
        classification,
        synchronizationRatePercent,
        routes,
        recentPairRejections.length,
      );

    return {
      generatedAt:
        now,

      version:
        "17.3",

      build:
        "4",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      classification,

      primaryFinding:
        observations[0] ??
        "Pair synchronization data is insufficient.",

      summary: {
        currentExecutableQuotes:
          executableQuotes.length,

        currentFreshExecutableQuotes:
          freshQuotes.length,

        currentFreshDirectionalPairs,

        synchronizedDirectionalPairs,

        unsynchronizedDirectionalPairs,

        synchronizationRatePercent,

        recentPairSynchronizationRejections:
          recentPairRejections.length,
      },

      routes,

      mismatchSamples:
        mismatchSamples
          .sort(
            (
              first,
              second,
            ) =>
              second.timestampSkewMs -
              first.timestampSkewMs,
          ),

      observations,
    };
  }

  private toRouteDiagnostic(
    route:
      string,

    accumulator:
      RouteAccumulator,
  ): PairSynchronizationRouteDiagnostic {
    const synchronizationRatePercent =
      this.percentage(
        accumulator
          .synchronizedPairs,

        accumulator
          .bothFreshPairs,
      );

    return {
      route,

      buyExchange:
        accumulator.buyExchange,

      sellExchange:
        accumulator.sellExchange,

      maximumPairSkewMs:
        accumulator
          .maximumPairSkewMs,

      totalCurrentPairs:
        accumulator
          .totalCurrentPairs,

      bothFreshPairs:
        accumulator
          .bothFreshPairs,

      synchronizedPairs:
        accumulator
          .synchronizedPairs,

      unsynchronizedPairs:
        accumulator
          .unsynchronizedPairs,

      synchronizationRatePercent,

      skew:
        this.distribution(
          accumulator.skews,
        ),

      buyAge:
        this.distribution(
          accumulator.buyAges,
        ),

      sellAge:
        this.distribution(
          accumulator.sellAges,
        ),

      buyNewer:
        accumulator.buyNewer,

      sellNewer:
        accumulator.sellNewer,

      equalTimestamp:
        accumulator
          .equalTimestamp,

      recentRejections:
        accumulator
          .recentRejections,

      likelyCause:
        this.routeCause(
          accumulator,
          synchronizationRatePercent,
        ),
    };
  }

  private routeCause(
    accumulator:
      RouteAccumulator,

    synchronizationRatePercent:
      number,
  ): string {
    if (
      accumulator
        .bothFreshPairs ===
      0
    ) {
      return "INSUFFICIENT_DATA";
    }

    if (
      synchronizationRatePercent >=
      95
    ) {
      return "HEALTHY";
    }

    const dominantSideRatio =
      Math.max(
        accumulator.buyNewer,
        accumulator.sellNewer,
      ) /
      accumulator
        .bothFreshPairs;

    if (
      dominantSideRatio >=
      0.75
    ) {
      return accumulator
        .buyNewer >
        accumulator
          .sellNewer
        ? "SELL_SIDE_UPDATES_LAG_BUY_SIDE"
        : "BUY_SIDE_UPDATES_LAG_SELL_SIDE";
    }

    return "ASYMMETRIC_UPDATE_CADENCE";
  }

  private classify(
    pairCount:
      number,

    synchronizationRatePercent:
      number,

    routes:
      PairSynchronizationRouteDiagnostic[],
  ): PairSynchronizationRootCauseReport[
    "classification"
  ] {
    if (
      pairCount ===
      0
    ) {
      return "INSUFFICIENT_DATA";
    }

    if (
      synchronizationRatePercent >=
      95
    ) {
      return "HEALTHY";
    }

    const unhealthyRoutes =
      routes.filter(
        (
          route,
        ) =>
          route
            .synchronizationRatePercent <
          90,
      );

    if (
      unhealthyRoutes.length <=
      Math.max(
        1,

        Math.floor(
          routes.length /
            3,
        ),
      )
    ) {
      return "ROUTE_SPECIFIC_SKEW";
    }

    return "SYSTEMIC_SKEW";
  }

  private buildObservations(
    classification:
      PairSynchronizationRootCauseReport[
        "classification"
      ],

    synchronizationRatePercent:
      number,

    routes:
      PairSynchronizationRouteDiagnostic[],

    recentRejections:
      number,
  ): string[] {
    const observations:
      string[] =
      [];

    observations.push(
      `Fresh executable cross-exchange synchronization rate is ${synchronizationRatePercent.toFixed(
        2,
      )}% under the current exchange-specific skew limits.`,
    );

    const worst =
      routes[0];

    if (
      worst
    ) {
      observations.push(
        `Worst current route is ${worst.route}: ${worst.unsynchronizedPairs}/${worst.bothFreshPairs} fresh directional pairs exceed the ${worst.maximumPairSkewMs}ms skew limit; p95 skew=${worst.skew.p95Ms ?? "n/a"}ms.`,
      );
    }

    observations.push(
      `Recent rejection history contains ${recentRejections} PAIR_NOT_SYNCHRONIZED record(s).`,

      `Root-cause classification: ${classification}.`,

      "This endpoint is diagnostic-only. Pair-skew thresholds, quote freshness thresholds, subscriptions, and trading policy are not modified.",
    );

    return observations;
  }

  private distribution(
    values:
      number[],
  ): PairSynchronizationDistribution {
    const sorted =
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
      sorted.length ===
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
      sorted.reduce(
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
        sorted.length,

      minimumMs:
        sorted[0] ??
        null,

      p50Ms:
        this.percentile(
          sorted,
          0.5,
        ),

      p95Ms:
        this.percentile(
          sorted,
          0.95,
        ),

      averageMs:
        total /
        sorted.length,

      maximumMs:
        sorted[
          sorted.length -
          1
        ] ??
        null,
    };
  }

  private percentile(
    sorted:
      number[],

    percentile:
      number,
  ): number | null {
    if (
      sorted.length ===
      0
    ) {
      return null;
    }

    const index =
      Math.min(
        sorted.length -
          1,

        Math.max(
          0,

          Math.ceil(
            sorted.length *
              percentile,
          ) -
            1,
        ),
      );

    return sorted[
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
    return denominator >
      0
      ? (
          numerator /
          denominator
        ) *
          100
      : 0;
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

export const pairSynchronizationRootCauseAnalyzerService =
  new PairSynchronizationRootCauseAnalyzerService();