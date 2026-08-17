import assert from "node:assert/strict";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";
import {
  shouldScheduleOpportunityEvaluation,
} from "../services/OpportunityDiagnosticsRunner";
import {
  marketCache,
  type MarketCacheExecutableUpdate,
} from "../../services/cache.service";
import {
  ComparisonEngine,
} from "../ComparisonEngine";

const NOW =
  Date.UTC(
    2026,
    7,
    16,
    12,
    0,
    0,
  );

function executableQuote(
  exchange:
    string,

  market:
    string,
): ExecutableQuote {
  return {
    exchange,
    market,
    lastPrice:
      100,
    bestBidPrice:
      99.9,
    bestBidQty:
      10,
    bestAskPrice:
      100.1,
    bestAskQty:
      10,
    spread:
      0.2,
    timestamp:
      NOW,
    source:
      "orderBook",
    executable:
      true,
  };
}

function update(
  kind:
    MarketCacheExecutableUpdate["kind"],

  market =
    "BTCUSDT",
): MarketCacheExecutableUpdate {
  return {
    exchange:
      "binance",
    market,
    timestamp:
      NOW,
    kind,
  };
}

function main(): void {
  const normalizedQuotes = [
    executableQuote("binance", "BTCUSDT"),
    executableQuote("bybit", "BTCUSDT"),
  ];
  const normalizedSnapshots = new ComparisonEngine()
    .groupNormalizedExecutableByMarket(normalizedQuotes);
  assert.equal(normalizedSnapshots.length, 1);
  assert.equal(normalizedSnapshots[0].market, "BTCUSDT");
  assert.equal(
    normalizedSnapshots[0].quotes.binance,
    normalizedQuotes[0],
    "The trusted hot path must reuse immutable normalized quote references.",
  );

  marketCache.clear();

  try {
    marketCache.update(
      executableQuote(
        "binance",
        "BTCUSDT",
      ),
    );
    assert.equal(
      marketCache.getExecutableExchangeCountForMarket(
        "btcusdt",
      ),
      1,
    );
    assert.equal(
      shouldScheduleOpportunityEvaluation(
        update("UPSERT"),
        1,
      ),
      false,
      "A single-venue market cannot create a cross-exchange route.",
    );

    marketCache.update(
      executableQuote(
        "bybit",
        "BTCUSDT",
      ),
    );
    assert.equal(
      marketCache.getExecutableExchangeCountForMarket(
        "BTCUSDT",
      ),
      2,
    );
    assert.equal(
      shouldScheduleOpportunityEvaluation(
        update("UPSERT"),
        2,
      ),
      true,
      "The second venue that makes a route possible must never be suppressed.",
    );

    marketCache.update(
      executableQuote(
        "binance",
        "ETHUSDT",
      ),
    );
    assert.equal(
      marketCache.getExecutableExchangeCountForMarket(
        "ETHUSDT",
      ),
      1,
      "The market index must not mix venues from unrelated markets.",
    );

    marketCache.invalidateExecutable(
      "bybit",
      "BTCUSDT",
    );
    assert.equal(
      marketCache.getExecutableExchangeCountForMarket(
        "BTCUSDT",
      ),
      1,
    );
    assert.equal(
      shouldScheduleOpportunityEvaluation(
        update("INVALIDATED"),
        1,
      ),
      true,
      "Invalidations must always wake the scanner to remove stale routes.",
    );

    marketCache.remove(
      "binance",
      "BTCUSDT",
    );
    assert.equal(
      marketCache.getExecutableExchangeCountForMarket(
        "BTCUSDT",
      ),
      0,
      "Removing the last executable venue must clean the O(1) market index.",
    );
    assert.equal(
      shouldScheduleOpportunityEvaluation(
        update("REMOVED"),
        0,
      ),
      true,
    );
    assert.equal(
      shouldScheduleOpportunityEvaluation(
        update("CLEARED", "*"),
        0,
      ),
      true,
    );

    console.log(
      "Strategy #1 opportunity event admission tests passed.",
    );
  } finally {
    marketCache.clear();
  }
}

main();
