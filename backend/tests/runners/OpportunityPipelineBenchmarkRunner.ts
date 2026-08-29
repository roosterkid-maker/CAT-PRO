import {
  performance,
} from "node:perf_hooks";

import type {
  ExecutableQuote,
} from "../../src/core/models/ExecutableQuote";

import {
  OpportunityService,
} from "../../src/arbitrage/services/OpportunityService";

import {
  marketCache,
} from "../../src/services/cache.service";

const MARKET_COUNT =
  320;

const WARM_UP_SCANS =
  20;

const MEASURED_SCANS =
  200;

function quote(
  exchange:
    string,

  market:
    string,

  bestBidPrice:
    number,

  bestAskPrice:
    number,

  timestamp:
    number,
): ExecutableQuote {
  return {
    exchange,
    market,
    lastPrice:
      bestAskPrice,
    bestBidPrice,
    bestBidQty:
      100_000,
    bestAskPrice,
    bestAskQty:
      100_000,
    spread:
      bestAskPrice -
      bestBidPrice,
    timestamp,
    source:
      "orderBook",
    executable:
      true,
  };
}

function percentile(
  sorted:
    readonly number[],

  fraction:
    number,
): number {
  const index =
    Math.min(
      sorted.length -
        1,
      Math.max(
        0,
        Math.ceil(
          sorted.length *
          fraction,
        ) -
        1,
      ),
    );

  return sorted[
    index
  ]!;
}

function main(): void {
  marketCache.clear();

  try {
    const timestamp =
      Date.now();

    for (
      let index = 0;
      index < MARKET_COUNT;
      index += 1
    ) {
      const market =
        `PERF${index}INR`;

      marketCache.update(
        quote(
          "binance",
          market,
          99.9,
          100,
          timestamp,
        ),
      );
      marketCache.update(
        quote(
          "coindcx",
          market,
          101,
          101.1,
          timestamp,
        ),
      );
    }

    const service =
      new OpportunityService({
        diagnosticsLogLevel:
          "silent",
      });

    for (
      let index = 0;
      index < WARM_UP_SCANS;
      index += 1
    ) {
      service.refreshOpportunities();
    }

    const measure = (
      operation:
        () => void,
    ): number[] => {
      const samples:
        number[] =
        [];

      for (
        let index = 0;
        index < MEASURED_SCANS;
        index += 1
      ) {
        const startedAt =
          performance.now();

        operation();

        samples.push(
          performance.now() -
          startedAt,
        );
      }

      return samples.sort(
        (
          first,
          second,
        ) =>
          first -
          second,
      );
    };

    const fullScanSamples =
      measure(
        () => {
          service.refreshOpportunities();
        },
      );

    service.refreshOpportunities();

    const incrementalScanSamples =
      measure(
        () => {
          service.refreshMarkets([
            "PERF0INR",
          ]);
        },
      );

    const summarize = (
      samples:
        readonly number[],
    ) => ({
      p50Ms:
        Number(
          percentile(
            samples,
            0.5,
          ).toFixed(
            3,
          ),
        ),
      p95Ms:
        Number(
          percentile(
            samples,
            0.95,
          ).toFixed(
            3,
          ),
        ),
      p99Ms:
        Number(
          percentile(
            samples,
            0.99,
          ).toFixed(
            3,
          ),
        ),
      maxMs:
        Number(
          samples[
            samples.length -
              1
          ]!.toFixed(
            3,
          ),
        ),
    });

    console.log(
      JSON.stringify(
        {
          marketCount:
            MARKET_COUNT,
          samples:
            MEASURED_SCANS,
          acceptedOpportunities:
            service
              .getLastOpportunitySnapshot()
              ?.opportunities
              .length ??
            0,
          fullUniverse:
            summarize(
              fullScanSamples,
            ),
          changedMarketIncremental:
            summarize(
              incrementalScanSamples,
            ),
        },
        null,
        2,
      ),
    );
  } finally {
    marketCache.clear();
  }
}

main();
