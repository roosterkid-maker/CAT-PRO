import assert
  from "node:assert/strict";

import {
  OpportunityEngine,
} from "../engines/OpportunityEngine";

import {
  exchangePairGenerator,
} from "../engines/ExchangePairGenerator";

import {
  OpportunityService,
} from "../services/OpportunityService";

import type {
  ExchangePair,
} from "../models/ExchangePair";

import {
  marketCache,
} from "../../services/cache.service";

function verifyLatestRouteSnapshotBound(): void {
  marketCache.clear();

  try {
    const timestamp =
      Date.now();

    for (
      const quote
      of [
        {
          exchange: "binance",
          bestBidPrice: 5.99,
          bestAskPrice: 6,
        },
        {
          exchange: "coindcx",
          bestBidPrice: 6.18,
          bestAskPrice: 6.19,
        },
      ]
    ) {
      marketCache.update({
        exchange:
          quote.exchange,
        market:
          "DOGEINR",
        lastPrice:
          quote.bestAskPrice,
        bestBidPrice:
          quote.bestBidPrice,
        bestBidQty:
          100_000,
        bestAskPrice:
          quote.bestAskPrice,
        bestAskQty:
          100_000,
        spread:
          0.01,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      });
    }

    const service =
      new OpportunityService({
        diagnosticsLogLevel:
          "silent",
      });

    const first =
      service.getOpportunities();

    assert.equal(
      first.length,
      1,
    );
    assert.equal(
      service.getSnapshotCount(),
      1,
    );

    const second =
      service.getOpportunities();

    assert.equal(
      second.length,
      1,
    );
    assert.equal(
      service.getSnapshotCount(),
      1,
      "Repeated accepted scans must retain only the newest immutable snapshot for an exact route.",
    );
    assert.equal(
      service.getOpportunityById(
        first[0]!.id,
      ),
      null,
      "A superseded opportunity ID must fail closed immediately.",
    );
    assert.equal(
      service.getOpportunityById(
        second[0]!.id,
      )?.id,
      second[0]!.id,
    );
  } finally {
    marketCache.clear();
  }
}

function verifyPilotTimingDirectionsIndependentFromEconomics(): void {
  marketCache.clear();

  try {
    const timestamp = Date.now();
    for (const exchange of ["binance", "coindcx"]) {
      marketCache.update({
        exchange,
        market: "BTCUSDT",
        lastPrice: 100,
        bestBidPrice: 99,
        bestBidQty: 100,
        bestAskPrice: 100,
        bestAskQty: 100,
        spread: 1,
        timestamp,
        source: "orderBook",
        executable: true,
      });
    }

    const service = new OpportunityService({
      diagnosticsLogLevel: "silent",
    });
    assert.equal(
      service.getOpportunities().length,
      0,
      "The fixture must not contain a positive-spread opportunity.",
    );
    assert.deepEqual(
      service
        .getLastOpportunitySnapshot()
        ?.pilotRouteBooks
        ?.map((book) => `${book.market}:${book.buyExchange}->${book.sellExchange}`)
        .sort(),
      [
        "BTCUSDT:binance->coindcx",
        "BTCUSDT:coindcx->binance",
      ],
      "Pilot timing must observe both executable directions independently from current spread economics.",
    );
  } finally {
    marketCache.clear();
  }
}

function verifyPilotTimingSnapshotBound(): void {
  marketCache.clear();

  try {
    const timestamp = Date.now();

    for (let index = 0; index < 80; index += 1) {
      const market = `T${index}USDT`;
      for (const exchange of ["binance", "coindcx"]) {
        marketCache.update({
          exchange,
          market,
          lastPrice: 100,
          bestBidPrice: 99,
          bestBidQty: 100,
          bestAskPrice: 100,
          bestAskQty: 100,
          spread: 1,
          timestamp,
          source: "orderBook",
          executable: true,
        });
      }
    }

    const service = new OpportunityService({diagnosticsLogLevel: "silent"});
    assert.equal(service.getOpportunities().length, 0);
    assert.equal(
      service.getLastOpportunitySnapshot()?.pilotRouteBooks?.length,
      128,
      "Timing-only route books must stay bounded to the capacity consumed by evidence owners.",
    );
  } finally {
    marketCache.clear();
  }
}

function createSpreadRejectedPair(
  timestamp:
    number,
): ExchangePair {
  return {
    market:
      "BTCUSDT",

    buy: {
      exchange:
        "binance",

      market:
        "BTCUSDT",

      lastPrice:
        100,

      bestBidPrice:
        99,

      bestBidQty:
        10,

      bestAskPrice:
        100,

      bestAskQty:
        10,

      spread:
        1,

      timestamp,

      source:
        "orderBook",

      executable:
        true,
    },

    sell: {
      exchange:
        "coindcx",

      market:
        "BTCUSDT",

      lastPrice:
        100,

      bestBidPrice:
        100,

      bestBidQty:
        10,

      bestAskPrice:
        101,

      bestAskQty:
        10,

      spread:
        1,

      timestamp,

      source:
        "orderBook",

      executable:
        true,
    },
  };
}

function main():
  void {
  const originalDebug =
    console.debug;

  const debugEntries:
    unknown[][] =
    [];

  console.debug = (
    ...entries:
      unknown[]
  ) => {
    debugEntries.push(
      entries,
    );
  };

  try {
    const pair =
      createSpreadRejectedPair(
        Date.now(),
      );

    const nonPositiveBatch =
      exchangePairGenerator
        .generatePositiveSpreadCandidates({
          market:
            pair.market,
          quotes: {
            [pair.buy.exchange]:
              pair.buy,
            [pair.sell.exchange]:
              pair.sell,
          },
          timestamp:
            pair.buy.timestamp,
        });

    assert.equal(
      nonPositiveBatch
        .totalExecutablePairs,
      2,
    );

    assert.equal(
      nonPositiveBatch
        .nonPositiveSpreadPairs,
      2,
      "Only zero/negative raw-spread routes may be removed before OpportunityEngine.",
    );

    assert.equal(
      nonPositiveBatch
        .pairs.length,
      0,
    );

    const normalEngine =
      new OpportunityEngine(
        false,
      );

    const normalResult =
      normalEngine.evaluate(
        pair,
      );

    assert.equal(
      normalResult,
      null,
      "Fixture must be rejected below the configured spread threshold.",
    );

    assert.equal(
      debugEntries.length,
      0,
      "Normal log level must not emit a per-pair rejection payload.",
    );

    const fastRejectDiagnostics =
      normalEngine.getDiagnostics();

    assert.equal(
      fastRejectDiagnostics
        .engine
        .spreadRejected,
      1,
      "A mathematically non-viable route must remain an exact spread rejection.",
    );

    assert.equal(
      fastRejectDiagnostics
        .evaluator
        .evaluated,
      0,
      "A below-floor executable spread must not enter repeated freshness and fee evaluation.",
    );

    const debugEngine =
      new OpportunityEngine(
        true,
      );

    const debugResult =
      debugEngine.evaluate(
        pair,
      );

    assert.equal(
      debugResult,
      null,
    );

    assert.equal(
      debugEntries.length,
      1,
      "Debug logging must retain an opt-in detailed rejection payload.",
    );

    assert.equal(
      debugEntries[0]?.[0],
      "[Spread Rejected]",
    );

    const beforePositiveRoute =
      normalEngine.getDiagnostics();

    const stalePositiveRoute =
      createSpreadRejectedPair(
        Date.now() - 60_000,
      );

    stalePositiveRoute.sell.bestBidPrice =
      102;

    const positiveBatch =
      exchangePairGenerator
        .generatePositiveSpreadCandidates({
          market:
            stalePositiveRoute.market,
          quotes: {
            [stalePositiveRoute.buy.exchange]:
              stalePositiveRoute.buy,
            [stalePositiveRoute.sell.exchange]:
              stalePositiveRoute.sell,
          },
          timestamp:
            stalePositiveRoute.buy.timestamp,
        });

    assert.equal(
      positiveBatch
        .pairs.length,
      1,
      "Every positive raw-spread route must remain available to the full safety evaluator.",
    );

    assert.equal(
      normalEngine.evaluate(
        stalePositiveRoute,
      ),
      null,
      "A positive raw spread with stale quotes must still fail closed.",
    );

    const afterPositiveRoute =
      normalEngine.getDiagnostics();

    assert.equal(
      afterPositiveRoute
        .evaluator
        .evaluated,
      beforePositiveRoute
        .evaluator
        .evaluated + 1,
      "A route that clears the raw-spread floor must still enter the full safety evaluator.",
    );

    assert.equal(
      afterPositiveRoute
        .evaluator
        .staleBothQuotes,
      beforePositiveRoute
        .evaluator
        .staleBothQuotes + 1,
      "The full evaluator must continue rejecting stale positive-spread routes.",
    );
  } finally {
    console.debug =
      originalDebug;
  }

  const originalLog =
    console.log;

  const infoEntries:
    unknown[][] =
    [];

  console.log = (
    ...entries:
      unknown[]
  ) => {
    infoEntries.push(
      entries,
    );
  };

  try {
    const infoService =
      new OpportunityService({
        diagnosticsLogLevel:
          "info",

        diagnosticsLogIntervalMs:
          60_000,

        acceptedDiagnosticsLogIntervalMs:
          5_000,
      });

    infoService
      .getOpportunities();

    infoService
      .getOpportunities();

    assert.equal(
      infoEntries.filter(
        (
          entry,
        ) =>
          entry[0] ===
          "[Opportunity Debug]",
      ).length,
      1,
      "Info logging must sample repeated empty scan summaries.",
    );

    infoEntries.length =
      0;

    const debugService =
      new OpportunityService({
        diagnosticsLogLevel:
          "debug",

        diagnosticsLogIntervalMs:
          60_000,

        acceptedDiagnosticsLogIntervalMs:
          5_000,
      });

    debugService
      .getOpportunities();

    debugService
      .getOpportunities();

    assert.equal(
      infoEntries.filter(
        (
          entry,
        ) =>
          entry[0] ===
          "[Opportunity Debug]",
      ).length,
      2,
      "Debug logging must retain every scan summary.",
    );
  } finally {
    console.log =
      originalLog;
  }

  verifyLatestRouteSnapshotBound();
  verifyPilotTimingDirectionsIndependentFromEconomics();
  verifyPilotTimingSnapshotBound();

  console.log(
    "Opportunity rejection log-volume test passed.",
  );

  console.log(
    "Opportunity decisions, rejection records, thresholds, PAPER, and LIVE settings were not modified.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
