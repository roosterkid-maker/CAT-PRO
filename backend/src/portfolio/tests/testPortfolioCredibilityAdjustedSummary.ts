import assert from "node:assert/strict";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
  CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
} from "../../strategies/models/StrategyMetadata";

import type {
  TradingAccount,
} from "../../trading/account/TradingAccount";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  PortfolioService,
} from "../services/PortfolioService";

const NOW =
  Date.UTC(
    2026,
    7,
    15,
    6,
    30,
  );

function main(): void {
  const credibleStrategyOne =
    createTrade(
      "credible-strategy-one",
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
      100,
      102,
      1.8,
    );

  const distortedStrategyOne =
    createTrade(
      "distorted-strategy-one",
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
      100,
      140,
      39.8,
    );

  /*
   * The cross-venue Strategy #1 ratio policy must not be projected onto a
   * different strategy whose execution semantics may be intentionally
   * different.
   */
  const otherStrategy =
    createTrade(
      "other-strategy",
      CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
      100,
      140,
      100,
    );

  const account:
    TradingAccount = {
    id:
      "portfolio-test",
    name:
      "Portfolio Test",
    mode:
      "PAPER",
    enabled:
      true,
    emergencyStop:
      false,
    limits: {
      maximumCapitalPerTrade:
        10_000,
      maximumDailyLoss:
        1_000,
      maximumOpenTrades:
        5,
      maximumDailyTrades:
        500,
    },
    initialCapital:
      100_000,
    currentCapital:
      100_141.6,
    availableCapital:
      100_141.6,
    todayProfit:
      141.6,
    todayLoss:
      0,
    openTrades:
      0,
    tradesToday:
      3,
  };

  const summary =
    new PortfolioService()
      .getSummary(
        [
          credibleStrategyOne,
          distortedStrategyOne,
          otherStrategy,
        ],
        account,
        NOW,
      );

  assert.equal(
    summary.accountingBasis,
    "CREDIBILITY_ADJUSTED",
  );
  assert.equal(
    summary.storedClosedTrades,
    3,
  );
  assert.equal(
    summary.closedTrades,
    2,
  );
  assert.equal(
    summary.excludedDistortedTrades,
    1,
  );
  assert.equal(
    summary.excludedDistortedPnl,
    39.8,
  );
  assert.equal(
    summary.totalRealizedProfit,
    101.8,
  );
  assert.equal(
    summary.currentCapital,
    100_101.8,
  );
  assert.equal(
    summary.availableCapital,
    100_101.8,
  );
  assert.equal(
    summary.todayProfit,
    101.8,
  );
  assert.equal(
    summary.todayNetProfit,
    101.8,
  );
  assert.equal(
    summary.ledgerCurrentCapital,
    100_141.6,
  );
  assert.equal(
    summary.ledgerAvailableCapital,
    100_141.6,
  );
  assert.equal(
    summary.winningTrades,
    2,
  );
  assert.equal(
    summary.winRatePercent,
    100,
  );

  console.log(
    "Portfolio credibility-adjusted summary tests passed.",
  );
}

function createTrade(
  id:
    string,
  strategyId:
    string,
  buyPrice:
    number,
  sellPrice:
    number,
  actualProfit:
    number,
): PaperTrade {
  return {
    id,
    strategyAttribution: {
      attributionStatus:
        "ATTRIBUTED",
      strategyId,
      signalId:
        `signal-${id}`,
      intentId:
        null,
    },
    market:
      "TESTUSDT",
    buyExchange:
      "coindcx",
    sellExchange:
      "binance",
    capital:
      100,
    quantity:
      1,
    buyPrice,
    sellPrice,
    estimatedFees:
      0.2,
    expectedProfit:
      actualProfit,
    expectedProfitPercent:
      actualProfit,
    status:
      "closed",
    openedAt:
      NOW -
      1_000,
    closedAt:
      NOW,
    currentPrice:
      sellPrice,
    currentProfit:
      actualProfit,
    currentProfitPercent:
      actualProfit,
    highestProfit:
      actualProfit,
    lowestProfit:
      actualProfit,
    lastUpdatedAt:
      NOW,
    actualSellPrice:
      sellPrice,
    actualProfit,
    actualProfitPercent:
      actualProfit,
    failureReason:
      null,
  };
}

main();
