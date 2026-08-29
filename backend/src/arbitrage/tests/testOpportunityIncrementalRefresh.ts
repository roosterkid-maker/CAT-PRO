import assert
  from "node:assert/strict";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  marketCache,
} from "../../services/cache.service";

import {
  OpportunityService,
} from "../services/OpportunityService";

function quote(
  exchange:
    string,

  market:
    string,

  bestBidPrice:
    number,

  bestAskPrice:
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
    timestamp:
      Date.now(),
    source:
      "orderBook",
    executable:
      true,
  };
}

function seedProfitableMarket(
  market:
    string,
): void {
  marketCache.update(
    quote(
      "binance",
      market,
      99.9,
      100,
    ),
  );
  marketCache.update(
    quote(
      "coindcx",
      market,
      101,
      101.1,
    ),
  );
}

function main(): void {
  marketCache.clear();

  try {
    seedProfitableMarket(
      "DOGEINR",
    );
    seedProfitableMarket(
      "ADAINR",
    );

    const service =
      new OpportunityService({
        diagnosticsLogLevel:
          "silent",
      });

    const fullSnapshot =
      service.getOpportunities();

    assert.equal(
      fullSnapshot.length,
      2,
      "The full baseline must contain both profitable markets.",
    );
    assert.equal(
      service
        .getLastDiagnostics()
        ?.scanScope,
      "FULL",
    );

    const untouchedAda =
      fullSnapshot.find(
        (opportunity) =>
          opportunity
            .pair
            .market ===
          "ADAINR",
      );

    assert.ok(
      untouchedAda,
    );

    marketCache.update(
      quote(
        "coindcx",
        "DOGEINR",
        99.8,
        100.1,
      ),
    );

    assert.equal(
      service.refreshMarkets([
        "dogeinr",
      ]),
      1,
      "Replacing one changed market must retain unrelated accepted routes.",
    );

    const incrementalSnapshot =
      service
        .getLastOpportunitySnapshot();

    assert.deepEqual(
      incrementalSnapshot
        ?.opportunities
        .map(
          (opportunity) =>
            opportunity
              .pair
              .market,
        ),
      [
        "ADAINR",
      ],
      "The changed market must be removed without rescanning away an unrelated route.",
    );
    assert.equal(
      incrementalSnapshot
        ?.opportunities[
          0
        ]
        ?.id,
      untouchedAda.id,
      "An unchanged market must preserve its last authoritative opportunity identity.",
    );

    const incrementalDiagnostics =
      service
        .getLastDiagnostics();

    assert.equal(
      incrementalDiagnostics
        ?.scanScope,
      "INCREMENTAL",
    );
    assert.equal(
      incrementalDiagnostics
        ?.evaluatedMarkets,
      1,
    );
    assert.equal(
      incrementalDiagnostics
        ?.marketSnapshots,
      2,
      "Pipeline coverage remains a complete current-universe aggregate.",
    );
    assert.equal(
      incrementalDiagnostics
        ?.acceptedOpportunities,
      1,
    );

    marketCache.remove(
      "coindcx",
      "ADAINR",
    );
    service.refreshMarkets([
      "ADAINR",
    ]);

    assert.equal(
      service
        .getLastOpportunitySnapshot()
        ?.opportunities
        .length,
      0,
      "A venue removal must invalidate the affected market on the next event scan.",
    );

    service.refreshMarkets([
      "*",
    ]);

    assert.equal(
      service
        .getLastDiagnostics()
        ?.scanScope,
      "FULL",
      "A cache-wide marker must always force complete reconciliation.",
    );

    console.log(
      "Opportunity incremental refresh tests passed.",
    );
  } finally {
    marketCache.clear();
  }
}

main();
