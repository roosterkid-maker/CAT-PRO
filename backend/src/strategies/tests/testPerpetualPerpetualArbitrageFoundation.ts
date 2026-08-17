import assert from "node:assert/strict";
import type {DerivativeDepthEvidence} from "../../derivatives/models/DerivativeDepthEvidence";
import type {DerivativeMarketDataSnapshot, DerivativeMarketEvidence} from "../../derivatives/models/DerivativeMarketEvidence";
import type {DerivativeMarketDataSnapshotListener} from "../../derivatives/services/DerivativeMarketDataService";
import {DerivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import {PerpetualPerpetualArbitrageEconomicsEngine} from "../perpetual-perpetual-arbitrage/PerpetualPerpetualArbitrageEconomicsEngine";
import {
  PerpetualPerpetualArbitrageStrategyController,
  type PerpetualPerpetualArbitrageMarketSource,
} from "../perpetual-perpetual-arbitrage/PerpetualPerpetualArbitrageStrategyController";

class Source implements PerpetualPerpetualArbitrageMarketSource {
  constructor(private readonly value: DerivativeMarketDataSnapshot) {}
  getSnapshot(): DerivativeMarketDataSnapshot { return structuredClone(this.value); }
  subscribe(listener: DerivativeMarketDataSnapshotListener): () => void {
    void listener;
    return () => undefined;
  }
}

function market(exchange: string, bid: number, ask: number, now: number): DerivativeMarketEvidence {
  return {
    exchange, market: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", settleAsset: "USDT",
    product: "LINEAR_PERPETUAL", tradingEnabled: true, bidPrice: bid, bidQuantity: 50,
    askPrice: ask, askQuantity: 50, markPrice: (bid + ask) / 2, indexPrice: 100,
    fundingRate: 0.001, nextFundingTime: now + 3_600_000, fundingIntervalMinutes: 480,
    openInterest: 100_000,
    rules: {priceStep: 0.1, quantityStep: 0.001, minimumQuantity: 0.001, maximumMarketQuantity: 500, minimumNotional: 5, maximumLeverage: 10},
    sourceTimestamp: now, observedAt: now,
    sources: {instrument: "PUBLIC_REST", ticker: "PUBLIC_REST", position: "NO_DATA", margin: "NO_DATA", liquidation: "NO_DATA"},
    execution: {derivativeAdapterRegistered: false, authenticatedReadVerified: false, reduceOnlyVerified: false, orderSubmissionAllowed: false, liveExecutionAllowed: false},
  };
}

function snapshot(now: number, highSpread = true): DerivativeMarketDataSnapshot {
  return {
    generatedAt: now, version: "26.0", mode: "PUBLIC_READ_ONLY_DERIVATIVES_FOUNDATION", freshnessThresholdMs: 15_000,
    summary: {providers: 2, readyProviders: 2, markets: 2, freshMarkets: 2, exchanges: 2, positionEvidenceMarkets: 0, marginEvidenceMarkets: 0, derivativeExecutionAdapters: 0},
    providers: [],
    markets: [market("binance", 100, 100.1, now), market("bybit", highSpread ? 102 : 100.15, highSpread ? 102.1 : 100.25, now)],
    safety: {publicReadOnly: true, topOfBookOnly: true, fullDepthAvailable: false, positionStateAvailable: false, marginStateAvailable: false, liquidationControlAvailable: false, reduceOnlyVerified: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false},
  };
}

function withVenueClockDrift(
  value: DerivativeMarketDataSnapshot,
  driftMs: number,
): DerivativeMarketDataSnapshot {
  return {
    ...value,
    markets: value.markets.map((item) => ({
      ...item,
      sourceTimestamp: item.sourceTimestamp + driftMs,
    })),
  };
}

function depth(exchange: string, now: number, highSpread = true): DerivativeDepthEvidence {
  const binance = exchange === "binance";
  return {
    exchange, market: "BTCUSDT", product: "LINEAR_PERPETUAL",
    bids: binance
      ? [{price: 100, quantity: 20}]
      : [{price: highSpread ? 102 : 100.15, quantity: 5}, {price: highSpread ? 101.9 : 100.1, quantity: 20}],
    asks: binance
      ? [{price: 100.1, quantity: 5}, {price: 100.2, quantity: 20}]
      : [{price: highSpread ? 102.1 : 100.25, quantity: 20}],
    sourceTimestamp: now, observedAt: now, source: "PUBLIC_REST_FULL_DEPTH",
    executionAuthorized: false, orderSubmissionAllowed: false,
  };
}

async function main(): Promise<void> {
  const now = Date.now();
  const fees = new DerivativeFeeEvidenceService([
    {exchange: "binance", makerPercent: 0.005, takerPercent: 0.01},
    {exchange: "bybit", makerPercent: 0.005, takerPercent: 0.01},
  ], now);
  const engine = new PerpetualPerpetualArbitrageEconomicsEngine({
    getDerivativeDepth: (exchange) => depth(exchange, now),
    getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const controller = new PerpetualPerpetualArbitrageStrategyController({
    enabled: true, exchanges: ["binance", "bybit"], markets: ["BTCUSDT"],
    targetQuoteNotional: 1_000, minimumGrossDislocationPercent: 0.5,
    minimumExpectedNetPercent: 0.2, safetyBufferPercent: 0.05,
    adverseFundingPeriodsReserved: 1, maximumEvidenceAgeMs: 5_000,
    maximumEvidenceSkewMs: 1_000,
  }, new Source(snapshot(now)), engine);
  controller.start();
  const signals = controller.getSignals(now + 1);
  assert.equal(signals.length, 1);
  const signal = signals[0];
  assert.equal(signal?.kind, "PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY");
  if (signal?.kind !== "PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY") throw new Error("Expected perp-perp SHADOW signal.");
  assert.equal(signal.evidence.longExchange, "binance");
  assert.equal(signal.evidence.shortExchange, "bybit");
  assert.equal(signal.evidence.convergenceGuaranteed, false);
  assert.equal(signal.evidence.roundTripFeesReserved, true);
  assert.ok(signal.evidence.adverseFundingReserveQuote > 0);
  assert.ok(signal.evidence.expectedNetPercent >= 0.2);
  assert.equal(signal.executionAuthorized, false);

  const futureVenueClock = engine.evaluate(
    withVenueClockDrift(snapshot(now), 750),
    controller.getConfiguration(),
    now,
  );
  assert.equal(futureVenueClock.qualifiedRoutes, 1);
  assert.equal(futureVenueClock.assessments[0]?.blockers.includes("EVIDENCE_STALE"), false);

  const genuinelyStaleVenueClock = engine.evaluate(
    withVenueClockDrift(snapshot(now), -6_000),
    controller.getConfiguration(),
    now,
  );
  assert.equal(genuinelyStaleVenueClock.qualifiedRoutes, 0);
  assert.ok(genuinelyStaleVenueClock.assessments[0]?.blockers.includes("EVIDENCE_STALE"));

  const noFees = new PerpetualPerpetualArbitrageEconomicsEngine({
    getDerivativeDepth: (exchange) => depth(exchange, now), getDerivativeFee: () => null,
  }).evaluate(snapshot(now), controller.getConfiguration(), now);
  assert.ok(noFees.assessments[0]?.blockers.includes("DERIVATIVE_FEE_EVIDENCE_MISSING"));
  assert.equal(noFees.assessments[0]?.economics, null);

  const lowSpreadEngine = new PerpetualPerpetualArbitrageEconomicsEngine({
    getDerivativeDepth: (exchange) => depth(exchange, now, false), getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const lowSpread = lowSpreadEngine.evaluate(snapshot(now, false), controller.getConfiguration(), now);
  assert.ok(lowSpread.assessments[0]?.blockers.includes("GROSS_DISLOCATION_TOO_LOW"));
  assert.ok(lowSpread.assessments[0]?.blockers.includes("EXPECTED_NET_THRESHOLD_NOT_MET"));
  assert.ok(lowSpread.assessments[0]?.dislocation);
  assert.ok((lowSpread.assessments[0]?.dislocation?.grossTopDislocationPercent ?? 1) < 0.5);
  assert.ok(lowSpread.assessments[0]?.economics);
  assert.ok((lowSpread.assessments[0]?.economics?.roundTripFeeQuote ?? 0) > 0);
  assert.ok((lowSpread.assessments[0]?.economics?.adverseFundingReserveQuote ?? 0) > 0);
  assert.ok((lowSpread.assessments[0]?.economics?.thresholdShortfallPercent ?? 0) > 0);

  const disabled = new PerpetualPerpetualArbitrageStrategyController();
  disabled.start();
  assert.equal(disabled.isRunning(), false);
  assert.equal(disabled.getSignals().length, 0);
  controller.stop();
  console.log("PERPETUAL-PERPETUAL ARBITRAGE FOUNDATION TEST PASSED.");
  console.log("Cross-venue dislocation used full depth, round-trip fees and adverse-funding reserve; convergence was not guaranteed and no PAPER, LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
