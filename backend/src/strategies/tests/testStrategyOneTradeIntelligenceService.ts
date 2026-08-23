import assert
  from "node:assert/strict";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  StrategyOneTradeIntelligenceService,
} from "../services/StrategyOneTradeIntelligenceService";

const NOW =
  Date.UTC(2030, 0, 15, 6, 30);

const HOUR_MS =
  60 * 60 * 1_000;

function main(): void {
  let revision = 21;
  let sourceReads = 0;

  const best = createTrade({
    id: "coti-best",
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
    capital: 500,
    actualProfit: 12,
    closedAt: NOW - HOUR_MS,
  });
  const trades: PaperTrade[] = [
    best,
    best,
    createTrade({
      id: "coti-loss",
      market: "COTI-USDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      capital: 500,
      actualProfit: -2,
      closedAt: NOW - 2 * HOUR_MS,
    }),
    createTrade({
      id: "coti-win",
      market: "COTIUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      capital: 500,
      actualProfit: 4,
      closedAt: NOW - 26 * HOUR_MS,
    }),
    createTrade({
      id: "tree-seven-days",
      market: "TREEUSDT",
      buyExchange: "bybit",
      sellExchange: "coindcx",
      capital: 400,
      actualProfit: 6,
      closedAt: NOW - 60 * HOUR_MS,
    }),
    createTrade({
      id: "distorted",
      market: "DOGEINR",
      buyExchange: "coinswitch",
      sellExchange: "unocoin",
      capital: 300,
      actualProfit: 100,
      buyPrice: 100,
      sellPrice: 140,
      closedAt: NOW - HOUR_MS,
    }),
    createTrade({
      id: "still-open",
      market: "BTCUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      capital: 500,
      actualProfit: 0,
      closedAt: NOW - HOUR_MS,
      status: "open",
    }),
    createTrade({
      id: "other-strategy",
      market: "ETHUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      capital: 500,
      actualProfit: 20,
      closedAt: NOW - HOUR_MS,
      strategyId: "triangular-arbitrage",
    }),
    {
      ...createTrade({
        id: "missing-economics",
        market: "XRPUSDT",
        buyExchange: "coindcx",
        sellExchange: "binance",
        capital: 500,
        actualProfit: 1,
        closedAt: NOW - HOUR_MS,
      }),
      actualProfit: null,
    },
  ];

  const service = new StrategyOneTradeIntelligenceService({
    getTrades: () => {
      sourceReads += 1;
      return trades;
    },
    getSettledRevision: () => revision,
  });

  const report = service.getReport({window: "48H"}, NOW);

  assert.equal(report.version, "154.0");
  assert.equal(report.mode, "PAPER");
  assert.equal(report.window.id, "48H");
  assert.equal(report.summary.settlements, 3);
  assert.equal(report.summary.successfulSettlements, 2);
  assert.equal(report.summary.negativeSettlements, 1);
  assert.equal(report.summary.realizedPnlInr, 14);
  assert.equal(report.summary.averagePnlInr, 4.67);
  assert.equal(report.summary.medianPnlInr, 4);
  assert.equal(report.summary.capitalTurnoverInr, 1_500);
  assert.equal(report.summary.capitalEfficiencyPercent, 0.93);
  assert.equal(report.routes[0]?.market, "COTIUSDT");
  assert.equal(report.routes[0]?.settlements, 3);
  assert.equal(report.markets[0]?.leadingBuyExchange, "coindcx");
  assert.equal(report.sellExchanges[0]?.exchange, "binance");
  assert.equal(report.topSuccessfulTrades.length, 2);
  assert.equal(report.topSuccessfulTrades[0]?.id, "coti-best");
  assert.equal(report.topSuccessfulTrades[0]?.executionDurationMs, 500);
  assert.equal(report.hourlyIst.length, 24);
  assert.equal(
    report.hourlyIst.reduce((total, bucket) => total + bucket.settlements, 0),
    3,
  );

  assert.equal(report.evidence.storedPaperTrades, 9);
  assert.equal(report.evidence.attributedClosedStrategyOne, 6);
  assert.equal(report.evidence.uniqueStrategyOneSettlements, 5);
  assert.equal(report.evidence.credibleStrategyOneSettlements, 4);
  assert.equal(report.evidence.exclusions.duplicateIdsIgnored, 1);
  assert.equal(report.evidence.exclusions.distortedSettlements, 1);
  assert.equal(report.evidence.exclusions.openOrFailed, 1);
  assert.equal(report.evidence.exclusions.unattributedOrOtherStrategy, 1);
  assert.equal(report.evidence.exclusions.missingSettlementEconomics, 1);
  assert.equal(report.evidence.exclusions.syntheticDemos, 0);
  assert.equal(report.safety.orderSubmissionAllowed, false);
  assert.equal(report.safety.balancesRead, false);

  const sameBucket = service.getReport({window: "48H"}, NOW + 5_000);
  assert.strictEqual(sameBucket, report);
  assert.equal(sourceReads, 1);

  const nextBucket = service.getReport({window: "48H"}, NOW + 31_000);
  assert.notStrictEqual(nextBucket, report);
  assert.equal(sourceReads, 1, "Time-bucket refresh must reuse the revision projection.");

  const sevenDays = service.getReport({window: "7D"}, NOW);
  assert.equal(sevenDays.summary.settlements, 4);
  assert.equal(sevenDays.markets.some((market) => market.market === "TREEUSDT"), true);

  const noData = service.getReport({
    window: "CUSTOM",
    startAt: NOW - 10 * HOUR_MS,
    endAt: NOW - 9 * HOUR_MS,
  }, NOW);
  assert.equal(noData.presentation.noData, true);
  assert.equal(noData.hourlyIst.every((bucket) => bucket.state === "NO_DATA"), true);

  assert.throws(
    () => service.getReport({window: "CUSTOM", startAt: NOW, endAt: NOW - 1}, NOW),
    /startAt must be before endAt/,
  );

  revision += 1;
  service.getReport({window: "48H"}, NOW + 32_000);
  assert.equal(sourceReads, 2);
  assert.equal(Object.isFrozen(report.topSuccessfulTrades), true);

  console.log("V154 Trade Intelligence deterministic test passed.");
  console.log("Windowing, canonical exclusions, rankings, IST heatmap, bounded details, revision caching and read-only safety were verified.");
}

function createTrade(input: {
  id: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  capital: number;
  actualProfit: number;
  closedAt: number;
  buyPrice?: number;
  sellPrice?: number;
  status?: PaperTrade["status"];
  strategyId?: "cross-exchange-arbitrage" | "triangular-arbitrage";
}): PaperTrade {
  const buyPrice = input.buyPrice ?? 100;
  const sellPrice = input.sellPrice ?? 101;

  return {
    strategyAttribution: {
      attributionStatus: "ATTRIBUTED",
      strategyId: input.strategyId ?? "cross-exchange-arbitrage",
      signalId: `signal-${input.id}`,
      intentId: null,
    },
    id: input.id,
    market: input.market,
    buyExchange: input.buyExchange,
    sellExchange: input.sellExchange,
    capital: input.capital,
    quantity: 5,
    buyPrice,
    sellPrice,
    estimatedFees: 1,
    expectedProfit: input.actualProfit,
    expectedProfitPercent: input.actualProfit / input.capital * 100,
    status: input.status ?? "closed",
    openedAt: input.closedAt - 500,
    closedAt: input.closedAt,
    currentPrice: sellPrice,
    currentProfit: input.actualProfit,
    currentProfitPercent: input.actualProfit / input.capital * 100,
    highestProfit: input.actualProfit,
    lowestProfit: input.actualProfit,
    lastUpdatedAt: input.closedAt,
    actualSellPrice: sellPrice,
    actualProfit: input.actualProfit,
    actualProfitPercent: input.actualProfit / input.capital * 100,
    deployableCashProfit: input.actualProfit - 0.25,
    tdsWithheld: 0.25,
    failureReason: null,
  };
}

main();
