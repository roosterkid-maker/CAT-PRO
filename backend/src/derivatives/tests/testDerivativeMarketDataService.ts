import assert from "node:assert/strict";

import type {
  DerivativeMarketEvidence,
  DerivativeVenuePublicSnapshot,
} from "../models/DerivativeMarketEvidence";

import type {
  DerivativePublicProvider,
} from "../providers/DerivativePublicProvider";

import {
  DerivativeMarketDataService,
} from "../services/DerivativeMarketDataService";

class FixtureProvider implements DerivativePublicProvider {
  constructor(
    readonly exchange: string,
    private readonly factory: (now: number) => DerivativeVenuePublicSnapshot,
  ) {}

  async fetchSnapshot(now = Date.now()): Promise<DerivativeVenuePublicSnapshot> {
    return this.factory(now);
  }
}

class FailingProvider implements DerivativePublicProvider {
  constructor(readonly exchange: string) {}

  async fetchSnapshot(): Promise<DerivativeVenuePublicSnapshot> {
    throw new Error("fixture provider unavailable");
  }
}

class CompletionTimestampProvider implements DerivativePublicProvider {
  readonly exchange = "completion";
  async fetchSnapshot(_startedAt: number): Promise<DerivativeVenuePublicSnapshot> {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    const completedEvidenceAt = Date.now();
    return {exchange: this.exchange, generatedAt: completedEvidenceAt,
      markets: [market(this.exchange, completedEvidenceAt)]};
  }
}

class FutureClockProvider implements DerivativePublicProvider {
  readonly exchange = "future-clock";
  async fetchSnapshot(now: number): Promise<DerivativeVenuePublicSnapshot> {
    return {exchange: this.exchange, generatedAt: now,
      markets: [market(this.exchange, now + 1_000)]};
  }
}

function market(exchange: string, now: number): DerivativeMarketEvidence {
  return {
    exchange,
    market: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    product: "LINEAR_PERPETUAL",
    tradingEnabled: true,
    bidPrice: 100,
    bidQuantity: 10,
    askPrice: 100.1,
    askQuantity: 11,
    markPrice: 100.05,
    indexPrice: 100.04,
    fundingRate: 0.0001,
    nextFundingTime: now + 3_600_000,
    fundingIntervalMinutes: 480,
    openInterest: 1_000,
    rules: {
      priceStep: 0.1,
      quantityStep: 0.001,
      minimumQuantity: 0.001,
      maximumMarketQuantity: 100,
      minimumNotional: 5,
      maximumLeverage: exchange === "binance" ? null : 50,
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

async function main(): Promise<void> {
  const now = 10_000;
  const service = new DerivativeMarketDataService(
    [
      new FixtureProvider("binance", (timestamp) => ({
        exchange: "binance",
        generatedAt: timestamp,
        markets: [market("binance", timestamp)],
      })),
      new FixtureProvider("bybit", (timestamp) => ({
        exchange: "bybit",
        generatedAt: timestamp,
        markets: [market("bybit", timestamp)],
      })),
    ],
    {
      refreshIntervalMs: 60_000,
      freshnessThresholdMs: 5_000,
      retentionMs: 20_000,
    },
  );

  const snapshot = await service.refresh(now);
  assert.equal(snapshot.summary.providers, 2);
  assert.equal(snapshot.summary.readyProviders, 2);
  assert.equal(snapshot.summary.markets, 2);
  assert.equal(snapshot.summary.freshMarkets, 2);
  assert.equal(snapshot.summary.positionEvidenceMarkets, 0);
  assert.equal(snapshot.summary.marginEvidenceMarkets, 0);
  assert.equal(snapshot.summary.derivativeExecutionAdapters, 0);
  assert.equal(snapshot.safety.fullDepthAvailable, false);
  assert.equal(snapshot.safety.liveExecutionAllowed, false);
  assert.equal(snapshot.safety.orderSubmissionAllowed, false);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.markets));

  const stale = service.getSnapshot(now + 6_000);
  assert.equal(stale.summary.freshMarkets, 0);
  assert.equal(stale.summary.markets, 2);

  const failing = new DerivativeMarketDataService(
    [new FailingProvider("bybit")],
    {
      refreshIntervalMs: 60_000,
      freshnessThresholdMs: 5_000,
      retentionMs: 20_000,
    },
  );
  const failedSnapshot = await failing.refresh(now);
  assert.equal(failedSnapshot.providers[0]?.state, "NO_DATA");
  assert.match(failedSnapshot.providers[0]?.lastError ?? "", /unavailable/);

  const completionClock = new DerivativeMarketDataService([new CompletionTimestampProvider()], {
    refreshIntervalMs: 60_000, freshnessThresholdMs: 5_000, retentionMs: 20_000,
  });
  const completionSnapshot = await completionClock.refresh();
  assert.ok(completionSnapshot.generatedAt >= (completionSnapshot.markets[0]?.sourceTimestamp ?? Number.MAX_SAFE_INTEGER));
  assert.equal(completionSnapshot.summary.freshMarkets, 1);

  const boundedClock = new DerivativeMarketDataService([new FutureClockProvider()], {
    refreshIntervalMs: 60_000, freshnessThresholdMs: 5_000, retentionMs: 20_000,
    maximumFutureClockSkewMs: 1_500,
  });
  const normalizedClockSnapshot = await boundedClock.refresh(now);
  assert.equal(normalizedClockSnapshot.markets[0]?.sourceTimestamp, now);
  assert.equal(normalizedClockSnapshot.markets[0]?.rawSourceTimestamp, now + 1_000);
  assert.equal(normalizedClockSnapshot.markets[0]?.sourceClockOffsetMs, 1_000);
  assert.equal(normalizedClockSnapshot.markets[0]?.sourceTimestampNormalization, "BOUNDED_FUTURE_CLOCK_SKEW");
  assert.equal(normalizedClockSnapshot.summary.freshMarkets, 1);

  console.log("DERIVATIVE MARKET DATA FOUNDATION TEST PASSED.");
  console.log("Public mark/index/funding/book/rule evidence stayed separate from position, margin and execution readiness.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
