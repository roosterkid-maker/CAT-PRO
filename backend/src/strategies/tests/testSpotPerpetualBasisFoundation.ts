import assert from "node:assert/strict";

import type {
  DerivativeDepthEvidence,
  DerivativeDepthVenueResult,
} from "../../derivatives/models/DerivativeDepthEvidence";

import type {
  DerivativeMarketDataSnapshot,
} from "../../derivatives/models/DerivativeMarketEvidence";

import {
  DerivativeDepthService,
  type DerivativeDepthFetcher,
} from "../../derivatives/services/DerivativeDepthService";

import {
  DerivativeFeeEvidenceService,
} from "../../derivatives/services/DerivativeFeeEvidenceService";

import type {
  DerivativeMarketDataSnapshotListener,
} from "../../derivatives/services/DerivativeMarketDataService";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  SpotPerpetualBasisEconomicsEngine,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisEconomicsEngine";

import {
  SpotPerpetualBasisStrategyController,
  type SpotPerpetualBasisMarketSource,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisStrategyController";

import {
  createSpotPerpetualBasisConfiguration,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisConfiguration";

class FixtureDepthFetcher implements DerivativeDepthFetcher {
  readonly exchange = "binance";

  async fetch(markets: readonly string[], now = Date.now()): Promise<DerivativeDepthVenueResult> {
    return {
      exchange: this.exchange,
      generatedAt: now,
      books: markets.map((market) => derivativeDepth(market, now)),
    };
  }
}

class FixtureMarketSource implements SpotPerpetualBasisMarketSource {
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

  emit(snapshot: DerivativeMarketDataSnapshot): void {
    this.snapshot = snapshot;
    this.listener?.(structuredClone(snapshot));
  }
}

function derivativeDepth(market: string, now: number): DerivativeDepthEvidence {
  return {
    exchange: "binance",
    market,
    product: "LINEAR_PERPETUAL",
    bids: [
      {price: 102, quantity: 8},
      {price: 101.9, quantity: 20},
    ],
    asks: [
      {price: 102.1, quantity: 8},
      {price: 102.2, quantity: 20},
    ],
    sourceTimestamp: now,
    observedAt: now,
    source: "PUBLIC_REST_FULL_DEPTH",
    executionAuthorized: false,
    orderSubmissionAllowed: false,
  };
}

function spotBook(now: number): OrderBook {
  return {
    exchange: "binance",
    market: "BTCUSDT",
    bids: [{price: 99.9, quantity: 50}],
    asks: [
      {price: 100, quantity: 5},
      {price: 100.1, quantity: 20},
    ],
    timestamp: now,
  };
}

function spotCapability(now: number): ExchangeMarketCapability {
  return {
    exchange: "binance",
    market: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    product: "spot",
    tradingEnabled: true,
    maintenanceMode: false,
    order: {
      supportedOrderTypes: ["market", "limit"],
      supportedTimeInForce: ["GTC", "IOC"],
      supportsPostOnly: true,
      supportsClientOrderId: true,
      supportsOrderCancellation: true,
      supportsOrderStatusPolling: true,
    },
    price: {
      minimumPrice: 0.1,
      maximumPrice: null,
      priceStep: 0.1,
      pricePrecision: 1,
    },
    quantity: {
      minimumQuantity: 0.001,
      maximumQuantity: 1_000,
      quantityStep: 0.001,
      quantityPrecision: 3,
    },
    notional: {
      minimumNotional: 5,
      maximumNotional: null,
    },
    fees: {
      makerFeeRate: 0.001,
      takerFeeRate: 0.001,
      feeAsset: null,
    },
    sourceUpdatedAt: now,
    synchronizedAt: now,
  };
}

function derivativeSnapshot(now: number): DerivativeMarketDataSnapshot {
  return {
    generatedAt: now,
    version: "26.0",
    mode: "PUBLIC_READ_ONLY_DERIVATIVES_FOUNDATION",
    freshnessThresholdMs: 15_000,
    summary: {
      providers: 1,
      readyProviders: 1,
      markets: 1,
      freshMarkets: 1,
      exchanges: 1,
      positionEvidenceMarkets: 0,
      marginEvidenceMarkets: 0,
      derivativeExecutionAdapters: 0,
    },
    providers: [],
    markets: [{
      exchange: "binance",
      market: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      settleAsset: "USDT",
      product: "LINEAR_PERPETUAL",
      tradingEnabled: true,
      bidPrice: 102,
      bidQuantity: 8,
      askPrice: 102.1,
      askQuantity: 8,
      markPrice: 101.95,
      indexPrice: 100,
      fundingRate: 0.001,
      nextFundingTime: now + 3_600_000,
      fundingIntervalMinutes: 480,
      openInterest: 100_000,
      rules: {
        priceStep: 0.1,
        quantityStep: 0.001,
        minimumQuantity: 0.001,
        maximumMarketQuantity: 500,
        minimumNotional: 5,
        maximumLeverage: null,
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
    }],
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

async function main(): Promise<void> {
  const now = Date.now();
  const depthService = new DerivativeDepthService(
    [new FixtureDepthFetcher()],
    {
      markets: ["BTCUSDT"],
      refreshIntervalMs: 60_000,
      freshnessThresholdMs: 5_000,
      retentionMs: 20_000,
    },
  );
  const depthSnapshot = await depthService.refresh(now);
  assert.equal(depthSnapshot.summary.freshBooks, 1);
  assert.equal(depthSnapshot.books[0]?.bids.length, 2);
  assert.equal(depthSnapshot.safety.liveExecutionAllowed, false);

  const missingFees = new DerivativeFeeEvidenceService([], now);
  assert.equal(missingFees.getSnapshot(now).evidenceStatus, "NO_DATA");
  assert.equal(missingFees.get("binance"), null);

  const fees = new DerivativeFeeEvidenceService([
    {exchange: "binance", makerPercent: 0.02, takerPercent: 0.05},
  ], now);
  assert.equal(fees.getSnapshot(now).evidenceStatus, "PARTIAL");

  const engine = new SpotPerpetualBasisEconomicsEngine({
    getSpotBook: () => spotBook(now),
    getDerivativeDepth: () => derivativeDepth("BTCUSDT", now),
    getSpotCapability: () => spotCapability(now),
    getSpotFee: (exchange, market) => ({
      exchange,
      market,
      makerPercent: 0.1,
      takerPercent: 0.1,
      source: "STATIC_CONFIG",
      synchronizedAt: null,
      expiresAt: null,
    }),
    getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const source = new FixtureMarketSource(derivativeSnapshot(now));
  const controller = new SpotPerpetualBasisStrategyController(
    {
      enabled: true,
      markets: ["BTCUSDT"],
      exchanges: ["binance"],
      targetQuoteCapital: 1_000,
      minimumExpectedNetPercent: 0.2,
      safetyBufferPercent: 0.1,
      maximumEvidenceAgeMs: 5_000,
      maximumTimestampSkewMs: 1_000,
    },
    source,
    engine,
  );

  controller.start();
  const signals = controller.getSignals(now + 1);
  assert.equal(signals.length, 1);
  const signal = signals[0];
  assert.equal(signal?.kind, "SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY");
  assert.equal(signal?.executionAuthorized, false);

  if (signal?.kind !== "SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY") {
    throw new Error("Expected spot-perpetual basis SHADOW signal.");
  }

  assert.ok(signal.evidence.expectedNetPercent > 1);
  assert.equal(signal.evidence.expectedFundingIsGuaranteed, false);
  assert.equal(signal.evidence.fullDepthApplied, true);
  assert.deepEqual(signal.evidence.executionReadinessBlockers, [
    "POSITION_EVIDENCE_MISSING",
    "MARGIN_EVIDENCE_MISSING",
    "LIQUIDATION_CONTROL_MISSING",
    "REDUCE_ONLY_UNVERIFIED",
    "DERIVATIVE_ADAPTER_MISSING",
  ]);

  const thresholdBlocked = engine.evaluate(
    derivativeSnapshot(now),
    createSpotPerpetualBasisConfiguration({
      enabled: true,
      exchanges: ["binance"],
      markets: ["BTCUSDT"],
      targetQuoteCapital: 1_000,
      minimumExpectedNetPercent: 5,
      safetyBufferPercent: 0.1,
      maximumEvidenceAgeMs: 5_000,
      maximumTimestampSkewMs: 1_000,
    }),
    now,
  );
  assert.equal(thresholdBlocked.qualifiedRoutes, 0);
  assert.ok(thresholdBlocked.assessments[0]?.blockers.includes("EXPECTED_NET_THRESHOLD_NOT_MET"));
  assert.ok((thresholdBlocked.assessments[0]?.economics?.expectedNetPercent ?? 0) > 1);
  assert.ok((thresholdBlocked.assessments[0]?.economics?.thresholdShortfallPercent ?? 0) > 3);

  const noFeeEngine = new SpotPerpetualBasisEconomicsEngine({
    getSpotBook: () => spotBook(now),
    getDerivativeDepth: () => derivativeDepth("BTCUSDT", now),
    getSpotCapability: () => spotCapability(now),
    getSpotFee: () => null,
    getDerivativeFee: () => null,
  });
  const blocked = noFeeEngine.evaluate(
    derivativeSnapshot(now),
    controller.getConfiguration(),
    now,
  );
  assert.equal(blocked.qualifiedRoutes, 0);
  assert.ok(blocked.assessments[0]?.blockers.includes("DERIVATIVE_FEE_EVIDENCE_MISSING"));
  assert.equal(blocked.assessments[0]?.economics, null);

  const defaultDisabled = new SpotPerpetualBasisStrategyController();
  defaultDisabled.start();
  assert.equal(defaultDisabled.isRunning(), false);
  assert.equal(defaultDisabled.getSignals().length, 0);

  controller.stop();
  console.log("SPOT-PERPETUAL BASIS FOUNDATION TEST PASSED.");
  console.log("VWAP, explicit fees, funding and rules were modeled in SHADOW; no position, margin, PAPER, LIVE or order action occurred.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
