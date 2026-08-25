import assert from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import type {
  ExecutableQuote,
} from "../../../core/models/ExecutableQuote";

import {
  StrategyOneExecutionFunnelService,
} from "../dynamic/StrategyOneExecutionFunnelService";

const NOW =
  1_786_812_800_000;

function main(): void {
  const service =
    new StrategyOneExecutionFunnelService({
      getMarketCacheDiagnostics: () => ({
        generatedAt: NOW,
        scope: "PROCESS_LIFETIME",
        acceptedMarketUpdates: 21,
        executableMarketMutations: 13,
        currentQuotes: 4,
        currentExecutableQuotes: 4,
      }),
      getExecutableQuotes: () => [
        quote(
          "binance",
          99,
          100,
        ),
        quote(
          "bybit",
          102,
          103,
        ),
        quote(
          "coinswitch",
          110,
          111,
        ),
      ],
      getCurrentOpportunities: () => [
        opportunity(
          "binance",
          "bybit",
          0.42,
        ),
        opportunity(
          "coinswitch",
          "binance",
          2,
        ),
      ],
      getMeter: () => ({
        scope: "PROCESS_LIFETIME",
        startedAt: NOW - 1_000,
        dynamicExecuteRecommendations: 2,
        dynamicWaitRecommendations: 3,
        dynamicOtherRecommendations: 1,
        preflightAttempts: 2,
        preflightPassed: 1,
        preflightRejected: 1,
        rejectionCounts: {
          BUY_BOOK_STALE: 1,
        },
        recentDetailedRejections: [],
      }),
      getAuthorities: () => [],
      getSessions: () => [],
      getMinimumNetProfitPercent: () => 0.3,
    });
  const report =
    service.getReport(
      NOW,
    );

  assert.equal(
    report.counters.marketUpdates,
    13,
  );
  assert.equal(
    report.counters.sharedMarkets,
    1,
  );
  assert.equal(
    report.counters.evaluatedRoutes,
    2,
    "Two directional Binance/Bybit routes are independently visible.",
  );
  assert.equal(
    report.counters.grossSpreadPositive,
    1,
  );
  assert.equal(
    report.counters.qualifiedRoutes,
    1,
    "The non-core CoinSwitch opportunity must not enter controlled-live funnel counts.",
  );
  assert.equal(
    report.counters.dynamicExecuteRecommendations,
    2,
  );
  assert.equal(
    report.counters.preflightRejected,
    1,
  );
  assert.equal(
    report.counters.realizedNetProfit,
    0,
  );
  assert.equal(
    report.realizedNetProfit.status,
    "NO_COMPLETED_LIVE_TRADE",
  );
  assert.equal(
    report.safety.orderSubmitted,
    false,
  );
  assert.equal(
    report.safety.paperProfitIncluded,
    false,
  );

  console.log(
    "Strategy #1 execution funnel passed: core-only route counts, process/durable scopes, rejection analytics and no fabricated LIVE P&L.",
  );
}

function quote(
  exchange: string,
  bid: number,
  ask: number,
): ExecutableQuote {
  return {
    exchange,
    market: "BTCUSDT",
    lastPrice: null,
    bestBidPrice: bid,
    bestBidQty: 1,
    bestAskPrice: ask,
    bestAskQty: 1,
    spread: ask - bid,
    timestamp: NOW,
    source: "orderBook",
    executable: true,
  };
}

function opportunity(
  buyExchange: string,
  sellExchange: string,
  netProfitPercent: number,
): ArbitrageOpportunity {
  return {
    id: `${buyExchange}-${sellExchange}`,
    pair: {
      market: "BTCUSDT",
      buy: quote(
        buyExchange,
        99,
        100,
      ),
      sell: quote(
        sellExchange,
        102,
        103,
      ),
    },
    buyPrice: 100,
    sellPrice: 102,
    buyAvailableQty: 1,
    sellAvailableQty: 1,
    requiredQty: 1,
    availableExecutableQty: 1,
    executableQty: 1,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 100,
    decision: "EXECUTE",
    analysisSummary: [],
    rawSpread: 2,
    rawSpreadPercent: 2,
    estimatedFees: 0.1,
    netProfit: netProfitPercent,
    netProfitPercent,
    usedLastPriceFallback: false,
    quotesAreFresh: true,
    score: 100,
    timestamp: NOW,
  };
}

main();
