import assert from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  orderBookService,
} from "../../../orderbook/services/OrderBookService";

import {
  strategyOneLiveOnlyStressGateService,
} from "../live-only/StrategyOneLiveOnlyStressGateService";

const NOW =
  1_900_000_000_000;

function opportunity(): ArbitrageOpportunity {
  return {
    id:
      "live-only-stress-test",
    pair: {
      market:
        "TESTUSDT",
      buy: {
        exchange:
          "binance",
        market:
          "TESTUSDT",
        lastPrice:
          100,
        bestBidPrice:
          99.9,
        bestBidQty:
          10,
        bestAskPrice:
          100,
        bestAskQty:
          10,
        spread:
          0.1,
        timestamp:
          NOW - 100,
        source:
          "orderBook",
        executable:
          true,
      },
      sell: {
        exchange:
          "bybit",
        market:
          "TESTUSDT",
        lastPrice:
          101,
        bestBidPrice:
          101,
        bestBidQty:
          10,
        bestAskPrice:
          101.1,
        bestAskQty:
          10,
        spread:
          0.1,
        timestamp:
          NOW - 100,
        source:
          "orderBook",
        executable:
          true,
      },
    },
    buyPrice:
      100,
    sellPrice:
      101,
    buyAvailableQty:
      10,
    sellAvailableQty:
      10,
    requiredQty:
      1,
    availableExecutableQty:
      10,
    executableQty:
      1,
    liquidityScore:
      100,
    enoughLiquidity:
      true,
    freshnessScore:
      100,
    feeScore:
      100,
    spreadScore:
      100,
    decision:
      "EXECUTE",
    analysisSummary:
      [],
    rawSpread:
      1,
    rawSpreadPercent:
      1,
    estimatedFees:
      0.2,
    netProfit:
      0.8,
    netProfitPercent:
      0.8,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      100,
    timestamp:
      NOW - 100,
  };
}

function setBooks(
  timestamp:
    number,
  depth =
    10,
): void {
  orderBookService.replace({
    exchange:
      "binance",
    market:
      "TESTUSDT",
    bids: [
      {
        price:
          99.9,
        quantity:
          depth,
      },
    ],
    asks: [
      {
        price:
          100,
        quantity:
          depth,
      },
    ],
    timestamp,
  });
  orderBookService.replace({
    exchange:
      "bybit",
    market:
      "TESTUSDT",
    bids: [
      {
        price:
          101,
        quantity:
          depth,
      },
    ],
    asks: [
      {
        price:
          101.1,
        quantity:
          depth,
      },
    ],
    timestamp,
  });
}

async function main(): Promise<void> {
  orderBookService.clear();
  setBooks(
    NOW - 100,
  );

  const passed =
    strategyOneLiveOnlyStressGateService
      .evaluate({
        opportunity:
          opportunity(),
        quantity:
          1,
        minimumNetProfitPercent:
          0.15,
        now:
          NOW,
      });
  assert.equal(
    passed.status,
    "PASSED",
  );
  assert.equal(
    passed.buyFillPercent,
    100,
  );
  assert.equal(
    passed.sellFillPercent,
    100,
  );

  setBooks(
    NOW - 501,
  );
  const stale =
    strategyOneLiveOnlyStressGateService
      .evaluate({
        opportunity:
          opportunity(),
        quantity:
          1,
        minimumNetProfitPercent:
          0.15,
        now:
          NOW,
      });
  assert.equal(
    stale.status,
    "BLOCKED",
  );
  assert.match(
    stale.reasons.join(" "),
    /older than 500 ms/u,
  );

  setBooks(
    NOW - 100,
    0.5,
  );
  const partial =
    strategyOneLiveOnlyStressGateService
      .evaluate({
        opportunity:
          opportunity(),
        quantity:
          1,
        minimumNetProfitPercent:
          0.15,
        now:
          NOW,
      });
  assert.equal(
    partial.status,
    "BLOCKED",
  );
  assert.match(
    partial.reasons.join(" "),
    /depth is partial/u,
  );

  orderBookService.clear();
  console.log(
    "LIVE-only stress gate test passed: exact fresh depth passed while stale and partial books failed closed; no exchange I/O or order occurred.",
  );
}

void main();
