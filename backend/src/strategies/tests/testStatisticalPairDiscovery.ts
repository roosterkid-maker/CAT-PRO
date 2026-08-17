import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {DerivativeMarketDataSnapshot, DerivativeMarketEvidence} from "../../derivatives/models/DerivativeMarketEvidence";
import type {DerivativeMarketDataSnapshotListener} from "../../derivatives/services/DerivativeMarketDataService";
import {DerivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import {StatisticalHistoricalDataService} from "../statistical-arbitrage/StatisticalHistoricalDataService";
import {StatisticalPairDiscoveryService} from "../statistical-arbitrage/StatisticalPairDiscoveryService";
import {StatisticalPromotionLifecycleService} from "../statistical-arbitrage/StatisticalPromotionLifecycleService";
import {StatisticalWalkForwardValidationService} from "../statistical-arbitrage/StatisticalWalkForwardValidationService";

class SilentSource {
  subscribe(_listener: DerivativeMarketDataSnapshotListener): () => void { return () => undefined; }
}

function market(symbol: string, mid: number, quantity: number, timestamp: number, exchange = "binance"): DerivativeMarketEvidence {
  return {
    exchange, market: symbol, baseAsset: symbol.replace("USDT", ""), quoteAsset: "USDT", settleAsset: "USDT",
    product: "LINEAR_PERPETUAL", tradingEnabled: true, bidPrice: mid - 0.01, bidQuantity: quantity,
    askPrice: mid + 0.01, askQuantity: quantity, markPrice: mid, indexPrice: mid, fundingRate: 0.0001,
    nextFundingTime: timestamp + 3_600_000, fundingIntervalMinutes: 480, openInterest: 100_000,
    rules: {priceStep: 0.01, quantityStep: 0.001, minimumQuantity: 0.001,
      maximumMarketQuantity: 10_000, minimumNotional: 5, maximumLeverage: 10},
    sourceTimestamp: timestamp, observedAt: timestamp,
    sources: {instrument: "PUBLIC_REST", ticker: "PUBLIC_REST", position: "NO_DATA", margin: "NO_DATA", liquidation: "NO_DATA"},
    execution: {derivativeAdapterRegistered: false, authenticatedReadVerified: false, reduceOnlyVerified: false,
      orderSubmissionAllowed: false, liveExecutionAllowed: false},
  };
}

function snapshot(index: number, timestamp: number): DerivativeMarketDataSnapshot {
  const rightMid = 100 * Math.exp(index * 0.001 + Math.sin(index * 0.37) * 0.05);
  const position = index % 10;
  const residual = position === 0 ? 0.03 : position === 5 ? -0.03 : (position === 1 || position === 6) ? 0 : Math.sin(index) * 0.002;
  const leftMid = Math.exp(Math.log(2) + 1.1 * Math.log(rightMid) + residual);
  const unrelatedMid = 70 * Math.exp(Math.sin(index * 1.7) * 0.03 + index * 0.0001);
  return {
    generatedAt: timestamp, version: "26.0", mode: "PUBLIC_READ_ONLY_DERIVATIVES_FOUNDATION", freshnessThresholdMs: 15_000,
    summary: {providers: 1, readyProviders: 1, markets: 4, freshMarkets: 3, exchanges: 1,
      positionEvidenceMarkets: 0, marginEvidenceMarkets: 0, derivativeExecutionAdapters: 0},
    providers: [], markets: [market("AAAUSDT", leftMid, 1_000, timestamp), market("BBBUSDT", rightMid, 1_000, timestamp),
      market("CCCUSDT", unrelatedMid, 10, timestamp), market("FUTUREUSDT", 50, 10_000, timestamp + 1)],
    safety: {publicReadOnly: true, topOfBookOnly: true, fullDepthAvailable: false,
      positionStateAvailable: false, marginStateAvailable: false, liquidationControlAvailable: false,
      reduceOnlyVerified: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false},
  };
}

function run(directory: string): void {
  const file = join(directory, "pair-history.jsonl");
  const seed = {pairId: "fixture:AAAUSDT:BBBUSDT", exchange: "binance", leftMarket: "AAAUSDT", rightMarket: "BBBUSDT"};
  const history = new StatisticalHistoricalDataService(file, {pairs: [seed], maximumTrackedPairs: 6,
    maximumSamplesPerPair: 100, maximumEvidenceAgeMs: 5_000, maximumEvidenceSkewMs: 1_000,
    minimumPersistenceIntervalMs: 0, rotationMaximumFileBytes: 10_000_000, rotationMaximumRecords: 1_000,
    maximumArchives: 2}, new SilentSource());
  const fees = new DerivativeFeeEvidenceService([{exchange: "binance", makerPercent: 0.005, takerPercent: 0.01},
    {exchange: "bybit", makerPercent: 0.005, takerPercent: 0.01}]);
  const discovery = new StatisticalPairDiscoveryService({maximumMarketsPerExchange: 3, maximumCandidatePairs: 3,
    maximumSelectedPairs: 2, maximumEvidenceAgeMs: 5_000, maximumEvidenceSkewMs: 1_000,
    minimumRegimeSamples: 20, minimumAbsoluteRegimeCorrelation: 0.1, highVolatilityPercent: 10,
    walkForward: {minimumTrainingSamples: 30, testSamplesPerFold: 10, minimumFolds: 3, maximumFolds: 4,
      entryZScoreThreshold: 1.5, safetyBufferPercent: 0.01, minimumTrades: 5,
      minimumNetPercent: 0, maximumDrawdownPercent: 50}},
  {history, validation: new StatisticalWalkForwardValidationService(), getFee: (exchange) => fees.get(exchange),
    promotionLifecycle: new StatisticalPromotionLifecycleService(join(directory, "pair-promotion.jsonl"))});

  const start = Date.now() - 80_000;
  let report = discovery.evaluate(snapshot(0, start), [seed], start);
  for (let index = 1; index < 80; index += 1) {
    const timestamp = start + index * 1_000;
    report = discovery.evaluate(snapshot(index, timestamp), [seed], timestamp);
  }

  assert.equal(report.version, "35.0");
  assert.equal(report.eligibleMarkets, 3, "Future-dated market evidence must be excluded.");
  assert.equal(report.candidatePairs, 3);
  assert.equal(report.selectedPairs.length, 2);
  assert.equal(report.requirements.minimumSamplesForFirstFold, 40);
  assert.equal(report.requirements.minimumSamplesForRequiredFolds, 60);
  assert.equal(report.requirements.minimumOutOfSampleTrades, 5);
  assert.ok(report.rankings.every((candidate) => candidate.exchange === "binance"));
  assert.ok(report.rankings.every((candidate) => candidate.sampleCount <= 100));
  const promoted = report.rankings.find((candidate) => candidate.pairId === seed.pairId);
  assert.ok(promoted, JSON.stringify(report.rankings, null, 2));
  assert.equal(promoted.state, "PROMOTED", JSON.stringify(promoted.blockers));
  assert.equal(promoted.walkForwardPassed, true);
  assert.equal(promoted.regimeAdmitted, true);
  assert.ok((promoted.outOfSampleNetPercent ?? 0) > 0);
  assert.equal(report.selectedPairs[0]?.pairId, seed.pairId);
  assert.equal(report.safety.thresholdsRelaxed, false);
  assert.equal(report.safety.promotionHysteresisRequired, true);
  assert.equal(report.safety.signalsRequireConfirmedPromotion, true);
  assert.equal(report.safety.liveExecutionAllowed, false);
  assert.equal(report.safety.orderSubmissionAllowed, false);

  const restored = new StatisticalHistoricalDataService(file, {pairs: [seed], maximumTrackedPairs: 6,
    maximumSamplesPerPair: 100, maximumEvidenceAgeMs: 5_000, maximumEvidenceSkewMs: 1_000,
    minimumPersistenceIntervalMs: 0, rotationMaximumFileBytes: 10_000_000, rotationMaximumRecords: 1_000,
    maximumArchives: 2}, new SilentSource());
  assert.equal(restored.getHistory(seed.pairId, 100, start + 80_000).length, 80);
  assert.ok(restored.getPairs().length >= 3);

  const venueFile = join(directory, "venue-diversity.jsonl");
  const venueHistory = new StatisticalHistoricalDataService(venueFile, {pairs: [seed], maximumTrackedPairs: 8,
    maximumSamplesPerPair: 100, maximumEvidenceAgeMs: 5_000, maximumEvidenceSkewMs: 1_000,
    minimumPersistenceIntervalMs: 0, rotationMaximumFileBytes: 10_000_000, rotationMaximumRecords: 1_000,
    maximumArchives: 2}, new SilentSource());
  const venueDiscovery = new StatisticalPairDiscoveryService({maximumMarketsPerExchange: 3, maximumCandidatePairs: 2,
    maximumSelectedPairs: 2, maximumEvidenceAgeMs: 5_000, maximumEvidenceSkewMs: 1_000},
  {history: venueHistory, validation: new StatisticalWalkForwardValidationService(), getFee: (exchange) => fees.get(exchange),
    promotionLifecycle: new StatisticalPromotionLifecycleService(join(directory, "venue-promotion.jsonl"))});
  const venueSnapshot = {...snapshot(1, start), summary: {...snapshot(1, start).summary, markets: 6, freshMarkets: 6, exchanges: 2},
    markets: [market("AAAUSDT", 100, 10_000, start), market("BBBUSDT", 101, 10_000, start),
      market("CCCUSDT", 102, 10_000, start), market("DDDUSDT", 100, 10, start, "bybit"),
      market("EEEUSDT", 101, 10, start, "bybit"), market("FFFUSDT", 102, 10, start, "bybit")]};
  const venueReport = venueDiscovery.evaluate(venueSnapshot, [], start);
  assert.deepEqual([...new Set(venueReport.rankings.map((candidate) => candidate.exchange))].sort(), ["binance", "bybit"]);
  assert.deepEqual([...new Set(venueReport.selectedPairs.map((candidate) => candidate.exchange))].sort(), ["binance", "bybit"]);
  const stablePairIds = venueReport.rankings.map((candidate) => candidate.pairId).sort();
  const rotatedLiquiditySnapshot = {...venueSnapshot, generatedAt: start + 1_000,
    markets: venueSnapshot.markets.map((item, index) => ({...item,
      bidQuantity: index % 3 === 0 ? 1 : 100_000, askQuantity: index % 3 === 0 ? 1 : 100_000,
      sourceTimestamp: start + 1_000, observedAt: start + 1_000}))};
  const stableVenueReport = venueDiscovery.evaluate(rotatedLiquiditySnapshot, [], start + 1_000);
  assert.deepEqual(stableVenueReport.rankings.map((candidate) => candidate.pairId).sort(), stablePairIds,
    "Transient top-book liquidity changes must not rotate active research pairs and reset their histories.");
  assert.equal(stableVenueReport.safety.stickyCandidateUniverse, true);
  assert.equal(venueHistory.getDiagnostics(start + 1_000).pairEvictions, 0);
  const restartedVenueDiscovery = new StatisticalPairDiscoveryService({maximumMarketsPerExchange: 3, maximumCandidatePairs: 2,
    maximumSelectedPairs: 2, maximumEvidenceAgeMs: 5_000, maximumEvidenceSkewMs: 1_000},
  {history: venueHistory, validation: new StatisticalWalkForwardValidationService(), getFee: (exchange) => fees.get(exchange),
    promotionLifecycle: new StatisticalPromotionLifecycleService(join(directory, "venue-promotion.jsonl"))});
  const restartedVenueReport = restartedVenueDiscovery.evaluate(rotatedLiquiditySnapshot, [], start + 1_000);
  assert.deepEqual(restartedVenueReport.rankings.map((candidate) => candidate.pairId).sort(), stablePairIds,
    "A restarted discovery service must reconstruct its sticky universe from persistent pair history.");
  assert.equal(venueHistory.getDiagnostics(start + 1_000).pairEvictions, 0);

  const noFee = new StatisticalPairDiscoveryService({maximumMarketsPerExchange: 3, maximumCandidatePairs: 3,
    maximumSelectedPairs: 2, maximumEvidenceAgeMs: 5_000, maximumEvidenceSkewMs: 1_000,
    minimumRegimeSamples: 20, minimumAbsoluteRegimeCorrelation: 0.1, highVolatilityPercent: 10,
    walkForward: {minimumTrainingSamples: 30, testSamplesPerFold: 10, minimumFolds: 3, maximumFolds: 4,
      entryZScoreThreshold: 1.5, safetyBufferPercent: 0.01, minimumTrades: 5,
      minimumNetPercent: 0, maximumDrawdownPercent: 50}},
  {history: restored, validation: new StatisticalWalkForwardValidationService(), getFee: () => null,
    promotionLifecycle: new StatisticalPromotionLifecycleService(join(directory, "no-fee-promotion.jsonl"))});
  const blocked = noFee.evaluate(snapshot(79, start + 79_000), [seed], start + 79_000);
  assert.equal(blocked.promotedPairs, 0);
  assert.ok(blocked.rankings.find((candidate) => candidate.pairId === seed.pairId)?.blockers
    .includes("EXPLICIT_DERIVATIVE_FEE_EVIDENCE_MISSING"));

  console.log("STATISTICAL PAIR DISCOVERY TEST PASSED.");
  console.log("Bounded same-venue pair discovery ranked persistent cost-aware walk-forward and regime evidence; future data, missing fees, LIVE and orders failed closed.");
}

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-statistical-discovery-"));
  try { run(directory); } finally { rmSync(directory, {recursive: true, force: true}); }
}

main();
