import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ExecutionResult} from "../../models/ExecutionResult";
import type {PaperTrade} from "../../models/PaperTrade";
import {PaperTradeStore} from "../PaperTradeStore";
import {PaperTradingService} from "../PaperTradingService";
import {PostGuardProfitValidationLedgerService} from "../PostGuardProfitValidationLedgerService";

const NOW = 1_900_000_000_000;

function main(): void {
  verifyTaggedCohortMetrics();
  verifyRouteAdmissionPolicy();
  verifyExactUnoCoinRouteLineage();
  verifyValidationTarget();
  verifyRevisionCache();
  verifySettledRevision();
  verifyRestartSafeEvidencePersistence();

  console.log("POST-GUARD PROFIT VALIDATION LEDGER TEST PASSED.");
  console.log("Tagged PAPER-only expectancy, drawdown, fee/slippage, route quarantine and restart persistence stayed fail-closed with LIVE/orders disabled.");
}

function verifySettledRevision(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-settled-revision-"));
  const path = join(directory, "paper-trades.jsonl");

  try {
    const store = new PaperTradeStore(path);
    const openTrade: PaperTrade = {
      ...createTrade("settled-revision", 1, NOW - 1_000),
      status: "open",
      closedAt: null,
      actualSellPrice: null,
      actualProfit: null,
      actualProfitPercent: null,
    };

    store.create(openTrade);
    assert.equal(
      store.getSettledRevision(),
      0,
      "Creating a non-terminal trade must not invalidate settled analytics.",
    );

    store.update(openTrade.id, {currentPrice: 101});
    assert.equal(
      store.getSettledRevision(),
      0,
      "Monitoring-only updates must not rebuild settled profitability.",
    );

    store.update(openTrade.id, {
      status: "closed",
      closedAt: NOW,
      actualSellPrice: 102,
      actualProfit: 1,
      actualProfitPercent: 1,
    });
    assert.equal(
      store.getSettledRevision(),
      1,
      "A completed settlement must invalidate profitability immediately.",
    );

    store.update(openTrade.id, {actualProfit: 2});
    assert.equal(
      store.getSettledRevision(),
      2,
      "A correction to terminal evidence must invalidate profitability.",
    );
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

function verifyTaggedCohortMetrics(): void {
  const trades = [
    createTrade("legacy-profitable", 50, NOW - 10_000, false),
    createTrade("price-only-profitable", 40, NOW - 5_000, true, false),
    createTrade("tagged-win-a", 5, NOW - 4_000),
    createTrade("tagged-loss-a", -2, NOW - 3_000),
    createTrade("tagged-win-b", 3, NOW - 2_000),
    createTrade("tagged-loss-b", -1, NOW - 1_000),
  ];
  const service = new PostGuardProfitValidationLedgerService({getTrades: () => trades});
  const report = service.getReport(NOW);

  assert.equal(report.version, "83.0");
  assert.equal(report.validationStatus, "COLLECTING");
  assert.equal(report.expectancyDecision, "INSUFFICIENT_SAMPLE");
  assert.equal(report.overall.trades, 4, "Historical untagged profit must not enter the post-guard cohort.");
  assert.equal(report.overall.wins, 2);
  assert.equal(report.overall.losses, 2);
  assert.equal(report.overall.netPnl, 5);
  assert.equal(report.overall.expectancyPerTrade, 1.25);
  assert.ok(closeEnough(report.overall.profitFactor ?? 0, 8 / 3));
  assert.equal(report.overall.maximumDrawdown, 2);
  assert.ok(closeEnough(report.overall.totalFees, 0.8));
  assert.ok(closeEnough(report.overall.feeDragPercent ?? 0, 0.2));
  assert.ok(closeEnough(report.overall.averageAdverseSlippagePercent ?? 0, 0.05));
  assert.equal(report.routes.length, 1);
  assert.equal(report.markets[0]?.market, "BTCUSDT");
  assert.equal(report.safety.taggedSettlementsOnly, true);
  assert.equal(report.safety.historicalTradesExcluded, true);
  assert.equal(report.safety.liveExecutionAllowed, false);
  assert.equal(report.safety.orderSubmissionAllowed, false);
}

function verifyExactUnoCoinRouteLineage(): void {
  const coindcxToUnocoin = Array.from({length: 10}, (_, index) =>
    rebindRoute(
      createTrade(`unocoin-losing-${index}`, -1, NOW - (20 - index) * 1_000),
      "BTCINR",
      "CoinDCX",
      "UnoCoin",
    ));
  const unocoinToCoindcx = rebindRoute(
    createTrade("unocoin-reverse-win", 2, NOW - 1_000),
    "BTCINR",
    "UnoCoin",
    "CoinDCX",
  );
  const mismatchedLineage = {
    ...createTrade("unocoin-mismatched-lineage", 100, NOW - 500),
    market: "BTCINR",
    buyExchange: "coindcx",
    sellExchange: "unocoin",
  };
  const service = new PostGuardProfitValidationLedgerService({
    getTrades: () => [
      ...coindcxToUnocoin,
      unocoinToCoindcx,
      mismatchedLineage,
    ],
  });

  const forward = service.evaluateAdmission({
    market: "btcinr",
    buyExchange: "coindcx",
    sellExchange: "unocoin",
  }, NOW);
  const reverse = service.evaluateAdmission({
    market: "BTCINR",
    buyExchange: "UNOCOIN",
    sellExchange: "COINDCX",
  }, NOW);
  const report = service.getReport(NOW);

  assert.equal(forward.allowed, false, "A losing CoinDCX to UnoCoin direction must be quarantined.");
  assert.equal(forward.sampleSize, 10);
  assert.equal(reverse.allowed, true, "The reverse UnoCoin route must retain its independent evidence state.");
  assert.equal(reverse.sampleSize, 1);
  assert.equal(report.overall.trades, 11, "A trade whose credibility route does not match its settlement route must be excluded.");
  assert.equal(report.routes.length, 2);
}

function verifyRouteAdmissionPolicy(): void {
  const losingTrades = Array.from({length: 10}, (_, index) =>
    createTrade(`losing-${index}`, -1, NOW - (10 - index) * 1_000));
  const losingService = new PostGuardProfitValidationLedgerService({getTrades: () => losingTrades});
  const blocked = losingService.evaluateAdmission({
    market: "btcusdt",
    buyExchange: "CoinDCX",
    sellExchange: "BINANCE",
  }, NOW);

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.state, "QUARANTINED");
  assert.equal(blocked.sampleSize, 10);
  assert.equal(blocked.liveExecutionAllowed, false);
  assert.equal(blocked.orderSubmissionAllowed, false);

  const afterQuarantine = losingService.evaluateAdmission({
    market: "BTCUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  }, NOW + 31 * 60 * 1_000);
  assert.equal(afterQuarantine.allowed, true);
  assert.equal(afterQuarantine.state, "PROBE_ELIGIBLE");

  const profitableTrades = Array.from({length: 10}, (_, index) =>
    createTrade(`winning-${index}`, 1, NOW - (10 - index) * 1_000));
  const profitableService = new PostGuardProfitValidationLedgerService({getTrades: () => profitableTrades});
  const eligible = profitableService.evaluateAdmission({
    market: "BTCUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  }, NOW);
  assert.equal(eligible.allowed, true);
  assert.equal(eligible.state, "ELIGIBLE");
}

function verifyValidationTarget(): void {
  const trades = Array.from({length: 100}, (_, index) =>
    createTrade(`sample-${index}`, 0.5, NOW - (100 - index) * 1_000));
  const report = new PostGuardProfitValidationLedgerService({getTrades: () => trades}).getReport(NOW);

  assert.equal(report.validationStatus, "SAMPLE_COMPLETE");
  assert.equal(report.expectancyDecision, "POSITIVE_EXPECTANCY_OBSERVED");
  assert.equal(report.remainingMinimumTrades, 0);
  assert.equal(report.remainingTargetTrades, 0);
  assert.equal(report.readyForVpsPaperReview, true);
}

function verifyRevisionCache(): void {
  let trades = Array.from({length: 10}, (_, index) =>
    createTrade(`cached-losing-${index}`, -1, NOW - (10 - index) * 1_000));
  let revision = 1;
  let reads = 0;
  const service = new PostGuardProfitValidationLedgerService({
    getTrades: () => {
      reads += 1;
      return trades;
    },
    getRevision: () => revision,
  });

  const first = service.getReport(NOW);
  const cached = service.getReport(NOW + 100);

  assert.equal(first.routes[0]?.state, "QUARANTINED");
  assert.equal(reads, 1, "An unchanged durable trade revision must reuse the profitability analysis.");
  assert.equal(cached.generatedAt, NOW + 100, "A cached read must retain the caller's observation time.");
  assert.equal(cached.routes[0]?.state, "QUARANTINED");

  trades = [
    ...trades,
    createTrade("cached-revision-win", 1, NOW + 200),
  ];
  revision += 1;

  const refreshed = service.getReport(NOW + 200);
  assert.equal(reads, 2, "A changed trade revision must invalidate the profitability cache immediately.");
  assert.equal(refreshed.overall.trades, 11);

  const quarantineUntil = refreshed.routes[0]?.quarantineUntil;
  assert.ok(quarantineUntil !== null && quarantineUntil !== undefined);

  const expired = service.getReport(quarantineUntil);
  assert.equal(reads, 3, "A time-driven quarantine transition must invalidate the cache at its exact expiry.");
  assert.equal(expired.routes[0]?.state, "PROBE_ELIGIBLE");
}

function verifyRestartSafeEvidencePersistence(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-postguard-"));
  const path = join(directory, "paper-trades.jsonl");

  try {
    const firstStore = new PaperTradeStore(path);
    const trading = new PaperTradingService(firstStore);
    const result = createExecutionResult();
    const persisted = trading.recordCompletedExecution(result);

    assert.equal(persisted.priceCredibility?.guard, "CROSS_VENUE_PRICE_CREDIBILITY_V1");
    assert.equal(persisted.paperExecutionStress?.guard, "STRATEGY_ONE_PAPER_STRESS_V1");
    assert.equal(persisted.capitalConversion?.accountCurrency, "INR");
    assert.equal(persisted.capitalConversion?.marketQuoteAsset, "USDT");
    assert.equal(persisted.capitalConversion?.quoteToInrRate, 83);
    assert.equal(persisted.capital, 8_308.3, "The durable trade must store account INR, not quote USDT capital.");
    assert.equal(persisted.quoteCapitalUsed, 100.1);
    assert.equal(persisted.quoteNetProfit, 1.598);
    assert.ok(closeEnough(persisted.executionQuality?.combinedAdverseSlippagePercent ?? 0, 0.2));

    const restored = new PaperTradeStore(path).getById(result.planId);
    assert.equal(restored?.priceCredibility?.outcome, "PASSED");
    assert.equal(restored?.paperExecutionStress?.outcome, "PASSED");
    assert.equal(restored?.paperExecutionStress?.paperOnly, true);
    assert.equal(restored?.capitalConversion?.requestedCapitalInr, 8_308.3);
    assert.equal(restored?.capitalConversion?.allocatedQuoteCapital, 100.1);
    assert.equal(restored?.quoteTotalFees, 0.2);
    assert.deepEqual(restored?.priceCredibility?.freshVenues, ["coindcx", "binance", "bybit"]);
    assert.ok(closeEnough(restored?.executionQuality?.buyAdverseSlippagePercent ?? 0, 0.1));
    assert.ok(closeEnough(restored?.executionQuality?.sellAdverseSlippagePercent ?? 0, 0.1));

    const restoredReport = new PostGuardProfitValidationLedgerService({
      getTrades: () => new PaperTradeStore(path).getAll(),
    }).getReport(NOW);
    assert.equal(restoredReport.overall.trades, 1);
    assert.equal(restoredReport.overall.netPnl, result.netProfit);

    firstStore.clear();

    const afterConfirmedReset =
      new PaperTradeStore(
        path,
      );

    assert.equal(
      afterConfirmedReset
        .getAll()
        .length,
      0,
      "An explicit PAPER reset must remain empty after store restart.",
    );
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

function createTrade(
  id: string,
  pnl: number,
  closedAt: number,
  tagged = true,
  stressTagged = tagged,
): PaperTrade {
  return {
    strategyAttribution: {
      attributionStatus: "ATTRIBUTED",
      strategyId: "cross-exchange-arbitrage",
      signalId: `signal-${id}`,
      intentId: null,
    },
    priceCredibility: tagged ? createPriceCredibility(closedAt - 100) : null,
    paperExecutionStress: stressTagged ? createStressEvidence(closedAt - 50) : null,
    executionQuality: tagged ? {
      schemaVersion: 1,
      buyRequestedPrice: 100,
      buyAverageFillPrice: 100.02,
      sellRequestedPrice: 102,
      sellAverageFillPrice: 101.9694,
      buyAdverseSlippagePercent: 0.02,
      sellAdverseSlippagePercent: 0.03,
      combinedAdverseSlippagePercent: 0.05,
    } : null,
    id,
    market: "BTCUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
    capital: 100,
    quantity: 1,
    buyPrice: 100,
    sellPrice: 102,
    estimatedFees: 0.2,
    expectedProfit: pnl,
    expectedProfitPercent: pnl,
    status: "closed",
    openedAt: closedAt - 1_000,
    closedAt,
    currentPrice: 102,
    currentProfit: pnl,
    currentProfitPercent: pnl,
    highestProfit: Math.max(0, pnl),
    lowestProfit: Math.min(0, pnl),
    lastUpdatedAt: closedAt,
    actualSellPrice: 102,
    actualProfit: pnl,
    actualProfitPercent: pnl,
    failureReason: null,
  };
}

function createExecutionResult(): ExecutionResult {
  const completedAt = NOW - 1_000;
  return {
    strategyAttribution: {
      attributionStatus: "ATTRIBUTED",
      strategyId: "cross-exchange-arbitrage",
      signalId: "restart-signal",
      intentId: null,
    },
    priceCredibility: createPriceCredibility(completedAt - 100),
    capitalConversion: {
      schemaVersion: 1,
      accountCurrency: "INR",
      marketQuoteAsset: "USDT",
      requestedCapitalInr: 8_308.3,
      allocatedQuoteCapital: 100.1,
      quoteToInrRate: 83,
      inrToQuoteEvidenceId: "conversion:inr-to-usdt",
      quoteToInrEvidenceId: "conversion:usdt-to-inr",
      generatedAt: completedAt - 200,
      expiresAt: completedAt + 14_800,
    },
    paperExecutionStress: createStressEvidence(completedAt - 50),
    quoteCapitalUsed: 100.1,
    quoteGrossProfit: 1.798,
    quoteTotalFees: 0.2,
    quoteNetProfit: 1.598,
    planId: "restart-tagged-trade",
    market: "BTCUSDT",
    mode: "PAPER",
    status: "COMPLETED",
    buy: {
      exchange: "coindcx",
      market: "BTCUSDT",
      side: "BUY",
      requestedQuantity: 1,
      filledQuantity: 1,
      requestedPrice: 100,
      averageFillPrice: 100.1,
      status: "FILLED",
      orderId: null,
      error: null,
      startedAt: completedAt - 1_000,
      completedAt,
    },
    sell: {
      exchange: "binance",
      market: "BTCUSDT",
      side: "SELL",
      requestedQuantity: 1,
      filledQuantity: 1,
      requestedPrice: 102,
      averageFillPrice: 101.898,
      status: "FILLED",
      orderId: null,
      error: null,
      startedAt: completedAt - 1_000,
      completedAt,
    },
    capitalUsed: 8_308.3,
    grossProfit: 149.234,
    totalFees: 16.6,
    netProfit: 132.634,
    netProfitPercent: 1.5964035964,
    startedAt: completedAt - 1_000,
    completedAt,
    successful: true,
    failureReason: null,
  };
}

function rebindRoute(
  trade: PaperTrade,
  market: string,
  buyExchange: string,
  sellExchange: string,
): PaperTrade {
  return {
    ...trade,
    market,
    buyExchange,
    sellExchange,
    priceCredibility: trade.priceCredibility ? {
      ...trade.priceCredibility,
      market,
      buyExchange,
      sellExchange,
    } : null,
  };
}

function createStressEvidence(evaluatedAt: number) {
  return {
    schemaVersion: 1 as const,
    guard: "STRATEGY_ONE_PAPER_STRESS_V1" as const,
    outcome: "PASSED" as const,
    evaluatedAt,
    sourceOpportunityAgeMs: 25,
    buyBookTimestamp: evaluatedAt - 10,
    sellBookTimestamp: evaluatedAt - 8,
    timestampSkewMs: 2,
    quantity: 1,
    buyFillPercent: 100,
    sellFillPercent: 100,
    buyVwap: 100.02,
    sellVwap: 101.9694,
    buyLimitPrice: 100.1,
    sellLimitPrice: 101.9,
    combinedDepthSlippagePercent: 0.05,
    adverseMoveReservePercentPerLeg: 0.05,
    tradingFees: 0.2,
    safetyBuffer: 0.1,
    postStressNetProfit: 1.5,
    postStressNetProfitPercent: 1.5,
    minimumNetProfitPercent: 0.3,
    reasons: ["Passed deterministic final depth and fee stress."],
    paperOnly: true as const,
    liveExecutionAllowed: false as const,
    orderSubmissionAllowed: false as const,
  };
}

function createPriceCredibility(evaluatedAt: number) {
  return {
    schemaVersion: 1 as const,
    guard: "CROSS_VENUE_PRICE_CREDIBILITY_V1" as const,
    outcome: "PASSED" as const,
    evaluatedAt,
    market: "BTCUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
    freshVenueCount: 3,
    freshVenues: ["coindcx", "binance", "bybit"],
    candidatePriceRatio: 1.02,
    currentPriceRatio: 1.02,
    medianMidPrice: 101,
    buyDeviationFromMedianPercent: 0.990099,
    sellDeviationFromMedianPercent: 0.990099,
    maximumPriceRatio: 1.05,
    maximumCandidatePriceDriftPercent: 1,
    maximumConsensusDeviationPercent: 3,
    reasons: ["Passed deterministic cross-venue evidence."],
  };
}

function closeEnough(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-9;
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
