import assert from "node:assert/strict";

import type {
  DerivativeDepthEvidence,
} from "../../derivatives/models/DerivativeDepthEvidence";

import type {ExchangeFeeEvidence} from "../../arbitrage/models/FeeModel";
import type {ExchangeMarketCapability} from "../../execution/capabilities/models/ExchangeCapability";
import type {OrderBook} from "../../orderbook/models/OrderBook";

import type {
  DerivativeMarketDataSnapshot,
  DerivativeMarketEvidence,
} from "../../derivatives/models/DerivativeMarketEvidence";

import type {
  DerivativeMarketDataSnapshotListener,
} from "../../derivatives/services/DerivativeMarketDataService";

import {
  DerivativeFeeEvidenceService,
} from "../../derivatives/services/DerivativeFeeEvidenceService";

import {
  createFundingRateArbitrageConfiguration,
} from "../funding-rate-arbitrage/FundingRateArbitrageConfiguration";

import {
  FundingRateArbitrageEconomicsEngine,
} from "../funding-rate-arbitrage/FundingRateArbitrageEconomicsEngine";

import {
  FundingRateArbitrageStrategyController,
  type FundingRateArbitrageMarketSource,
} from "../funding-rate-arbitrage/FundingRateArbitrageStrategyController";

class FixtureMarketSource implements FundingRateArbitrageMarketSource {
  private listener: DerivativeMarketDataSnapshotListener | null = null;

  constructor(private snapshot: DerivativeMarketDataSnapshot) {}

  getSnapshot(): DerivativeMarketDataSnapshot {
    return structuredClone(this.snapshot);
  }

  subscribe(listener: DerivativeMarketDataSnapshotListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }
}

function derivativeMarket(
  exchange: string,
  fundingRate: number,
  bidPrice: number,
  askPrice: number,
  now: number,
  fundingIntervalMinutes = 480,
): DerivativeMarketEvidence {
  return {
    exchange,
    market: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    product: "LINEAR_PERPETUAL",
    tradingEnabled: true,
    bidPrice,
    bidQuantity: 50,
    askPrice,
    askQuantity: 50,
    markPrice: (bidPrice + askPrice) / 2,
    indexPrice: 100,
    fundingRate,
    nextFundingTime: now + 3_600_000,
    fundingIntervalMinutes,
    openInterest: 100_000,
    rules: {
      priceStep: 0.1,
      quantityStep: 0.001,
      minimumQuantity: 0.001,
      maximumMarketQuantity: 500,
      minimumNotional: 5,
      maximumLeverage: 10,
    },
    sourceTimestamp: now,
    observedAt: now,
    sources: {
      instrument: "PUBLIC_REST",
      ticker: "PUBLIC_REST",
      position: "NO_DATA",
      margin: "NO_DATA",
      liquidation: "NO_DATA",
    },
    execution: {
      derivativeAdapterRegistered: false,
      authenticatedReadVerified: false,
      reduceOnlyVerified: false,
      orderSubmissionAllowed: false,
      liveExecutionAllowed: false,
    },
  };
}

function snapshot(now: number, intervalMismatch = false): DerivativeMarketDataSnapshot {
  return {
    generatedAt: now,
    version: "26.0",
    mode: "PUBLIC_READ_ONLY_DERIVATIVES_FOUNDATION",
    freshnessThresholdMs: 15_000,
    summary: {
      providers: 2,
      readyProviders: 2,
      markets: 2,
      freshMarkets: 2,
      exchanges: 2,
      positionEvidenceMarkets: 0,
      marginEvidenceMarkets: 0,
      derivativeExecutionAdapters: 0,
    },
    providers: [],
    markets: [
      derivativeMarket("binance", -0.002, 100, 100.1, now, 480),
      derivativeMarket("bybit", 0.004, 100.3, 100.4, now, intervalMismatch ? 240 : 480),
    ],
    safety: {
      publicReadOnly: true,
      topOfBookOnly: true,
      fullDepthAvailable: false,
      positionStateAvailable: false,
      marginStateAvailable: false,
      liquidationControlAvailable: false,
      reduceOnlyVerified: false,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  };
}

function withVenueClockAhead(
  value: DerivativeMarketDataSnapshot,
  driftMs: number,
): DerivativeMarketDataSnapshot {
  return {
    ...value,
    markets: value.markets.map((market) => ({
      ...market,
      sourceTimestamp: market.sourceTimestamp + driftMs,
    })),
  };
}

function depth(exchange: string, now: number): DerivativeDepthEvidence {
  const isLongVenue = exchange === "binance";
  return {
    exchange,
    market: "BTCUSDT",
    product: "LINEAR_PERPETUAL",
    bids: isLongVenue
      ? [{price: 100, quantity: 20}, {price: 99.9, quantity: 20}]
      : [{price: 100.3, quantity: 5}, {price: 100.2, quantity: 20}],
    asks: isLongVenue
      ? [{price: 100.1, quantity: 5}, {price: 100.2, quantity: 20}]
      : [{price: 100.4, quantity: 20}],
    sourceTimestamp: now,
    observedAt: now,
    source: "PUBLIC_REST_FULL_DEPTH",
    executionAuthorized: false,
    orderSubmissionAllowed: false,
  };
}

async function main(): Promise<void> {
  const now = Date.now();
  const fees = new DerivativeFeeEvidenceService([
    {exchange: "binance", makerPercent: 0.005, takerPercent: 0.01},
    {exchange: "bybit", makerPercent: 0.005, takerPercent: 0.01},
  ], now);
  const engine = new FundingRateArbitrageEconomicsEngine({
    getDerivativeDepth: (exchange) => depth(exchange, now),
    getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const source = new FixtureMarketSource(snapshot(now));
  const controller = new FundingRateArbitrageStrategyController(
    {
      enabled: true,
      exchanges: ["binance", "bybit"],
      markets: ["BTCUSDT"],
      targetQuoteNotional: 1_000,
      minimumFundingDifferentialPercent: 0.1,
      minimumExpectedNetPercent: 0.2,
      safetyBufferPercent: 0.05,
      maximumFundingPeriodsToCapture: 6,
      maximumEvidenceAgeMs: 5_000,
      maximumEvidenceSkewMs: 1_000,
      maximumFundingTimeSkewMs: 1_000,
    },
    source,
    engine,
  );

  controller.start();
  const signals = controller.getSignals(now + 1);
  assert.equal(signals.length, 1);
  const signal = signals[0];
  assert.equal(signal?.kind, "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY");
  assert.equal(signal?.executionAuthorized, false);
  if (signal?.kind !== "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY") {
    throw new Error("Expected funding-rate SHADOW signal.");
  }
  assert.equal(signal.evidence.longExchange, "binance");
  assert.equal(signal.evidence.shortExchange, "bybit");
  assert.equal(signal.evidence.expectedFundingGuaranteed, false);
  assert.equal(signal.evidence.projectedFundingRatePersistenceRequired, true);
  assert.equal(signal.evidence.modeledFundingPeriods, 1);
  assert.equal(signal.evidence.minimumQualifyingFundingPeriods, 1);
  assert.equal(signal.evidence.maximumFundingPeriodsToCapture, 6);
  assert.equal(signal.evidence.favorableEntryBasisExcluded, true);
  assert.equal(signal.evidence.roundTripFeesReserved, true);
  assert.equal(signal.evidence.fullDepthApplied, true);
  assert.ok(signal.evidence.expectedNetPercent >= 0.2);
  assert.deepEqual(signal.evidence.executionReadinessBlockers, [
    "POSITION_EVIDENCE_MISSING",
    "MARGIN_EVIDENCE_MISSING",
    "LIQUIDATION_CONTROL_MISSING",
    "REDUCE_ONLY_UNVERIFIED",
    "DERIVATIVE_ADAPTER_MISSING",
  ]);

  const futureVenueClock = engine.evaluate(
    withVenueClockAhead(snapshot(now), 750),
    controller.getConfiguration(),
    now,
  );

  const oneRefreshCadenceSkewEngine = new FundingRateArbitrageEconomicsEngine({
    getDerivativeDepth: (exchange) => depth(exchange, now - 4_500),
    getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const defaultSkewTolerance = oneRefreshCadenceSkewEngine.evaluate(
    snapshot(now),
    createFundingRateArbitrageConfiguration({
      enabled: true,
      exchanges: ["binance", "bybit"],
      markets: ["BTCUSDT"],
    }),
    now,
  );
  assert.equal(
    defaultSkewTolerance.assessments[0]?.blockers.includes("EVIDENCE_SKEW_EXCEEDED"),
    false,
  );

  const beyondRefreshCadenceSkewEngine = new FundingRateArbitrageEconomicsEngine({
    getDerivativeDepth: (exchange) => depth(exchange, now - 5_001),
    getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const beyondDefaultSkew = beyondRefreshCadenceSkewEngine.evaluate(
    snapshot(now),
    createFundingRateArbitrageConfiguration({
      enabled: true,
      exchanges: ["binance", "bybit"],
      markets: ["BTCUSDT"],
    }),
    now,
  );
  assert.ok(beyondDefaultSkew.assessments[0]?.blockers.includes("EVIDENCE_SKEW_EXCEEDED"));
  assert.equal(futureVenueClock.qualifiedRoutes, 1);
  assert.equal(
    futureVenueClock.assessments[0]?.blockers.includes("EVIDENCE_STALE"),
    false,
  );

  const boundedCarrySnapshot = snapshot(now);
  const boundedCarry = engine.evaluate({
    ...boundedCarrySnapshot,
    markets: boundedCarrySnapshot.markets.map((market) => ({
      ...market,
      fundingRate: market.exchange === "binance" ? -0.0002 : 0.001,
    })),
  }, controller.getConfiguration(), now);
  assert.equal(boundedCarry.qualifiedRoutes, 1);
  // Four settlements are required once both perpetual legs reserve adverse
  // entry/exit slippage in addition to fees, basis and the safety buffer.
  assert.equal(boundedCarry.assessments[0]?.economics?.modeledFundingPeriods, 4);
  assert.equal(boundedCarry.assessments[0]?.economics?.minimumQualifyingFundingPeriods, 4);
  assert.ok((boundedCarry.assessments[0]?.economics?.expectedNetPercent ?? 0) >= 0.2);
  assert.equal(
    boundedCarry.assessments[0]?.blockers.includes("FUNDING_CARRY_HORIZON_EXCEEDED"),
    false,
  );

  const lowDifferentialSnapshot = snapshot(now);
  const lowDifferential = engine.evaluate({
    ...lowDifferentialSnapshot,
    markets: lowDifferentialSnapshot.markets.map((market) => ({
      ...market,
      fundingRate: market.exchange === "binance" ? 0.0001 : 0.00015,
    })),
  }, controller.getConfiguration(), now);
  assert.equal(lowDifferential.qualifiedRoutes, 0);
  assert.ok(lowDifferential.assessments[0]?.blockers.includes("FUNDING_DIFFERENTIAL_TOO_LOW"));
  assert.ok(lowDifferential.assessments[0]?.blockers.includes("EXPECTED_NET_THRESHOLD_NOT_MET"));
  assert.ok(lowDifferential.assessments[0]?.blockers.includes("FUNDING_CARRY_HORIZON_EXCEEDED"));
  assert.ok(lowDifferential.assessments[0]?.differential.fundingDifferentialPercent < 0.1);
  assert.ok((lowDifferential.assessments[0]?.economics?.expectedNetPercent ?? 0) < 0);

  const genuinelyStaleVenueClock = engine.evaluate(
    withVenueClockAhead(snapshot(now), -6_000),
    controller.getConfiguration(),
    now,
  );
  assert.equal(genuinelyStaleVenueClock.qualifiedRoutes, 0);
  assert.ok(genuinelyStaleVenueClock.assessments[0]?.blockers.includes("EVIDENCE_STALE"));

  const noFeeEngine = new FundingRateArbitrageEconomicsEngine({
    getDerivativeDepth: (exchange) => depth(exchange, now),
    getDerivativeFee: () => null,
  });
  const noFeeResult = noFeeEngine.evaluate(snapshot(now), controller.getConfiguration(), now);
  assert.equal(noFeeResult.qualifiedRoutes, 0);
  assert.ok(noFeeResult.assessments[0]?.blockers.includes("DERIVATIVE_FEE_EVIDENCE_MISSING"));
  assert.equal(noFeeResult.assessments[0]?.economics, null);

  const intraDepth: DerivativeDepthEvidence = {
    ...depth("binance", now),
    bids: [{price: 100.3, quantity: 20}],
    asks: [{price: 100.4, quantity: 20}],
  };
  const spotBook: OrderBook = {
    exchange: "binance", market: "BTCUSDT", timestamp: now,
    bids: [{price: 99.9, quantity: 20}], asks: [{price: 100, quantity: 20}],
  };
  const spotCapability: ExchangeMarketCapability = {
    exchange: "binance", market: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT",
    product: "spot", tradingEnabled: true, maintenanceMode: false,
    order: {supportedOrderTypes: ["market", "limit"], supportedTimeInForce: ["GTC", "IOC"],
      supportsPostOnly: true, supportsClientOrderId: true, supportsOrderCancellation: true,
      supportsOrderStatusPolling: true},
    price: {minimumPrice: 0.1, maximumPrice: null, priceStep: 0.1, pricePrecision: 1},
    quantity: {minimumQuantity: 0.001, maximumQuantity: 500, quantityStep: 0.001, quantityPrecision: 3},
    notional: {minimumNotional: 5, maximumNotional: null},
    fees: {makerFeeRate: 0.005, takerFeeRate: 0.01, feeAsset: "USDT"},
    sourceUpdatedAt: now, synchronizedAt: now,
  };
  const spotFee: ExchangeFeeEvidence = {
    exchange: "binance", market: "BTCUSDT", makerPercent: 0.005, takerPercent: 0.01,
    source: "ACCOUNT_API", synchronizedAt: now, expiresAt: now + 60_000,
  };
  const intraEngine = new FundingRateArbitrageEconomicsEngine({
    getDerivativeDepth: () => intraDepth,
    getDerivativeFee: (exchange) => fees.get(exchange),
    getSpotBook: () => spotBook,
    getSpotCapability: () => spotCapability,
    getSpotFee: () => spotFee,
  });
  const intraSnapshot = snapshot(now);
  const intraResult = intraEngine.evaluate({
    ...intraSnapshot,
    markets: [derivativeMarket("binance", 0.004, 100.3, 100.4, now)],
  }, createFundingRateArbitrageConfiguration({
    enabled: true,
    exchanges: ["binance"],
    spotExchanges: ["binance"],
    routeModes: ["INTRA_SPOT_PERPETUAL"],
    markets: ["BTCUSDT"],
    targetQuoteNotional: 1_000,
    minimumFundingDifferentialPercent: 0.1,
    minimumExpectedNetPercent: 0.15,
    maximumFundingPeriodsToCapture: 2,
    maximumEvidenceAgeMs: 5_000,
    maximumEvidenceSkewMs: 1_000,
  }), now);
  assert.equal(intraResult.evaluatedRoutes, 1);
  assert.equal(intraResult.qualifiedRoutes, 1);
  const intraAssessment = intraResult.assessments[0]!;
  assert.equal(intraAssessment.routeKind, "INTRA_SPOT_PERPETUAL");
  assert.equal(intraAssessment.evidence?.routeKind, "INTRA_SPOT_PERPETUAL");
  assert.equal(intraAssessment.evidence?.longProduct, "SPOT");
  assert.equal(intraAssessment.evidence?.longExchange, "binance");
  assert.equal(intraAssessment.evidence?.shortExchange, "binance");
  assert.ok((intraAssessment.economics?.expectedNetPercent ?? 0) >= 0.15);

  const intervalResult = engine.evaluate(snapshot(now, true), controller.getConfiguration(), now);
  assert.equal(intervalResult.qualifiedRoutes, 1);
  assert.ok(!intervalResult.assessments[0]?.blockers.includes("FUNDING_INTERVAL_INVALID"));
  assert.equal(intervalResult.assessments[0]?.differential.longFundingIntervalMinutes, 480);
  assert.equal(intervalResult.assessments[0]?.differential.shortFundingIntervalMinutes, 240);
  assert.ok(
    (intervalResult.assessments[0]?.differential.shortNormalizedDailyFundingRate ?? 0) >
    (intervalResult.assessments[0]?.differential.longNormalizedDailyFundingRate ?? 0),
  );

  const offsetSettlementSnapshot = snapshot(now);
  const offsetSettlementResult = engine.evaluate({
    ...offsetSettlementSnapshot,
    markets: offsetSettlementSnapshot.markets.map((market) => ({
      ...market,
      nextFundingTime: market.exchange === "binance"
        ? now + 30 * 60_000
        : now + 4 * 60 * 60_000,
    })),
  }, controller.getConfiguration(), now);
  assert.equal(offsetSettlementResult.qualifiedRoutes, 1);
  assert.ok(
    (offsetSettlementResult.assessments[0]?.differential.fundingTimeSkewMs ?? 0) >
      controller.getConfiguration().maximumFundingTimeSkewMs,
  );
  assert.equal(
    offsetSettlementResult.assessments[0]?.blockers.includes("FUNDING_TIME_SKEW_EXCEEDED"),
    false,
  );

  const defaultDisabled = new FundingRateArbitrageStrategyController();
  defaultDisabled.start();
  assert.equal(defaultDisabled.isRunning(), false);
  assert.equal(defaultDisabled.getSignals().length, 0);

  controller.stop();
  console.log("FUNDING-RATE ARBITRAGE FOUNDATION TEST PASSED.");
  console.log("Matched two-venue funding economics used full depth and explicit round-trip fees; no position, margin, PAPER, LIVE or order action occurred.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
