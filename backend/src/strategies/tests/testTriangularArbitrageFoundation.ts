import assert from "node:assert/strict";

import type {
  DynamicOpportunityDiscoverySnapshot,
} from "../../discovery/models/DynamicOpportunityDiscovery";

import type {
  DynamicOpportunityDiscoverySnapshotListener,
} from "../../discovery/services/DynamicOpportunityDiscoveryRunnerService";

import type {ExecutableQuote} from "../../core/models/ExecutableQuote";

import type {
  MarketCacheExecutableUpdate,
  MarketCacheExecutableUpdateListener,
} from "../../services/cache.service";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import type {OrderBook} from "../../orderbook/models/OrderBook";

import {
  TriangularArbitrageSimulationEngine,
} from "../triangular-arbitrage/TriangularArbitrageSimulationEngine";

import {
  TriangularArbitrageStrategyController,
  type TriangularArbitrageDiscoverySource,
} from "../triangular-arbitrage/TriangularArbitrageStrategyController";

class TestDiscoverySource implements TriangularArbitrageDiscoverySource {
  private listener: DynamicOpportunityDiscoverySnapshotListener | null = null;

  private latest: DynamicOpportunityDiscoverySnapshot | null = null;

  getLatestSnapshot(): DynamicOpportunityDiscoverySnapshot | null {
    return this.latest === null ? null : structuredClone(this.latest);
  }

  subscribe(listener: DynamicOpportunityDiscoverySnapshotListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  emit(snapshot: DynamicOpportunityDiscoverySnapshot): void {
    this.latest = structuredClone(snapshot);
    this.listener?.(structuredClone(snapshot));
  }
}

class TestMarketEventSource {
  private listener: MarketCacheExecutableUpdateListener | null = null;

  constructor(private readonly quotes: ReadonlyMap<string, ExecutableQuote>) {}

  get(exchange: string, market: string): ExecutableQuote | undefined {
    const value = this.quotes.get(`${exchange}:${market}`);
    return value ? structuredClone(value) : undefined;
  }

  subscribeToExecutableUpdates(listener: MarketCacheExecutableUpdateListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  emit(update: MarketCacheExecutableUpdate): void {
    this.listener?.({...update});
  }
}

function capability(
  market: string,
  baseAsset: string,
  quoteAsset: string,
  synchronizedAt: number,
): ExchangeMarketCapability {
  return {
    exchange: "binance",
    market,
    baseAsset,
    quoteAsset,
    product: "spot",
    tradingEnabled: true,
    maintenanceMode: false,
    order: {
      supportedOrderTypes: ["market", "limit"],
      supportedTimeInForce: ["GTC"],
      supportsPostOnly: true,
      supportsClientOrderId: true,
      supportsOrderCancellation: true,
      supportsOrderStatusPolling: true,
    },
    price: {
      minimumPrice: 0.000001,
      maximumPrice: null,
      priceStep: 0.000001,
      pricePrecision: 6,
    },
    quantity: {
      minimumQuantity: 0.0001,
      maximumQuantity: 1_000,
      quantityStep: 0.0001,
      quantityPrecision: 4,
    },
    notional: {
      minimumNotional: 1,
      maximumNotional: null,
    },
    fees: {
      makerFeeRate: 0.001,
      takerFeeRate: 0.001,
      feeAsset: null,
    },
    sourceUpdatedAt: synchronizedAt,
    synchronizedAt,
  };
}

function snapshot(now: number): DynamicOpportunityDiscoverySnapshot {
  return {
    generatedAt: now,
    version: "24.0",
    mode: "READ_ONLY_DYNAMIC_DISCOVERY",
    summary: {
      cachedQuotes: 3,
      freshExecutableBooks: 3,
      rejectedQuotes: 0,
      exchanges: 1,
      normalizedSpotMarkets: 3,
      sharedSpotMarkets: 0,
      crossExchangeRoutes: 0,
      triangularPaths: 1,
    },
    books: [],
    crossExchangeRoutes: [],
    triangularPaths: [{
      id: "binance-btc-usdt-eth-cycle",
      kind: "TRIANGULAR_SPOT_PATH",
      exchange: "binance",
      startAsset: "BTC",
      assets: ["BTC", "USDT", "ETH", "BTC"],
      legs: [
        {
          market: "BTCUSDT",
          fromAsset: "BTC",
          toAsset: "USDT",
          action: "SELL_BASE",
          referenceRate: 100,
          maximumInputQuantity: 10,
          timestamp: now,
        },
        {
          market: "ETHUSDT",
          fromAsset: "USDT",
          toAsset: "ETH",
          action: "BUY_BASE",
          referenceRate: 0.1,
          maximumInputQuantity: 1_000,
          timestamp: now,
        },
        {
          market: "ETHBTC",
          fromAsset: "ETH",
          toAsset: "BTC",
          action: "SELL_BASE",
          referenceRate: 0.105,
          maximumInputQuantity: 50,
          timestamp: now,
        },
      ],
      referenceGrossMultiplier: 1.05,
      feesApplied: false,
      marketRulesApplied: false,
      economicallyQualified: false,
      executionAuthorized: false,
    }],
    safety: {
      marketCacheMutationAllowed: false,
      freshnessThresholdMutationAllowed: false,
      profitabilityQualificationAllowed: false,
      capitalMutationAllowed: false,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
    notes: [],
  };
}

async function main(): Promise<void> {
  const now = Date.now();
  const capabilities = new Map([
    ["BTCUSDT", capability("BTCUSDT", "BTC", "USDT", now)],
    ["ETHUSDT", capability("ETHUSDT", "ETH", "USDT", now)],
    ["ETHBTC", capability("ETHBTC", "ETH", "BTC", now)],
  ]);
  const books = new Map<string, OrderBook>([
    ["BTCUSDT", {exchange: "binance", market: "BTCUSDT", bids: [{price: 100, quantity: 10}], asks: [{price: 101, quantity: 10}], timestamp: now}],
    ["ETHUSDT", {exchange: "binance", market: "ETHUSDT", bids: [{price: 9.9, quantity: 100}], asks: [{price: 10, quantity: 100}], timestamp: now}],
    ["ETHBTC", {exchange: "binance", market: "ETHBTC", bids: [{price: 0.105, quantity: 100}], asks: [{price: 0.106, quantity: 100}], timestamp: now}],
  ]);

  const engine = new TriangularArbitrageSimulationEngine({
    getFeeEvidence: (exchange, market) => ({
      exchange,
      market,
      makerPercent: 0.1,
      takerPercent: 0.1,
      source: "STATIC_CONFIG",
      synchronizedAt: null,
      expiresAt: null,
    }),
    getCapability: (_exchange, market) =>
      structuredClone(capabilities.get(market) ?? null),
    getOrderBook: (_exchange, market) => structuredClone(books.get(market) ?? null),
  });

  const source = new TestDiscoverySource();
  const executableQuotes = new Map<string, ExecutableQuote>([
    ["binance:BTCUSDT", {exchange: "binance", market: "BTCUSDT", lastPrice: 100,
      bestBidPrice: 100, bestBidQty: 10, bestAskPrice: 101, bestAskQty: 10,
      spread: 1, timestamp: now, source: "bookTicker", executable: true}],
    ["binance:ETHUSDT", {exchange: "binance", market: "ETHUSDT", lastPrice: 10,
      bestBidPrice: 9.9, bestBidQty: 100, bestAskPrice: 10, bestAskQty: 100,
      spread: 0.1, timestamp: now, source: "bookTicker", executable: true}],
    ["binance:ETHBTC", {exchange: "binance", market: "ETHBTC", lastPrice: 0.105,
      bestBidPrice: 0.105, bestBidQty: 100, bestAskPrice: 0.106, bestAskQty: 100,
      spread: 0.001, timestamp: now, source: "bookTicker", executable: true}],
  ]);
  const marketEvents = new TestMarketEventSource(executableQuotes);
  const controller = new TriangularArbitrageStrategyController(
    {
      enabled: true,
      allowedExchanges: ["binance"],
      minimumNetProfitPercent: 0.2,
      maximumInitialInputQuantity: 20,
      signalTtlMs: 5_000,
      maximumOrderBookAgeMs: 5_000,
      maximumOpportunityAgeMs: 5_000,
      allowedStartingAssets: ["BTC"],
      startAssetInrValues: {BTC: 1_000},
      capitalPool: {totalAllocationInr: 10_000, activeCycleCapitalInr: 8_500,
        recoveryReserveInr: 1_000, feeTdsDustReserveInr: 500},
    },
    source,
    engine,
    marketEvents,
    30,
  );

  controller.start();
  source.emit(snapshot(now));

  const signals = controller.getSignals(now + 1);
  assert.equal(signals.length, 1);

  const signal = signals[0];
  assert.ok(signal);
  assert.equal(signal.kind, "TRIANGULAR_ARBITRAGE_SHADOW_PATH");
  assert.equal(signal.executionAuthorized, false);
  assert.equal(signal.automaticExecutionAllowed, false);

  if (signal.kind !== "TRIANGULAR_ARBITRAGE_SHADOW_PATH") {
    throw new Error("Expected triangular arbitrage evidence.");
  }

  assert.equal(signal.evidence.legs.length, 3);
  assert.equal(signal.evidence.initialInputQuantity, 5);
  assert.ok(
    signal.evidence.legs.every((leg) =>
      leg.inputQuantity <= leg.topOfBookMaximumInput,
    ),
  );
  assert.ok(signal.evidence.netProfitPercent > 4);
  assert.equal(signal.evidence.feesApplied, true);
  assert.equal(signal.evidence.marketRulesApplied, true);
  assert.equal(signal.evidence.topOfBookDepthApplied, true);

  const quantizedSource = snapshot(now + 2);
  const quantizedPath = quantizedSource.triangularPaths[0];
  assert.ok(quantizedPath);
  const quantizedSnapshot: DynamicOpportunityDiscoverySnapshot = {
    ...quantizedSource,
    triangularPaths: [{
      ...quantizedPath,
      legs: [
        {...quantizedPath.legs[0], maximumInputQuantity: 5.00005},
        quantizedPath.legs[1],
        {...quantizedPath.legs[2], maximumInputQuantity: 51},
      ],
    }],
  };
  const quantized = engine.evaluate(
    quantizedSnapshot,
    controller.getConfiguration(),
    now + 2,
  ).simulations[0];
  assert.ok(quantized);
  assert.equal(quantized.initialSizingLimitQuantity, 5.00005);
  assert.equal(quantized.initialInputQuantity, 5);
  assert.ok(quantized.retainedStartQuantity > 0);
  assert.ok(quantized.capitalUtilizationPercent < 100);
  assert.ok((quantized.feeDragPercent ?? 0) > 0);
  assert.ok((quantized.quantizationDragPercent ?? 0) >= 0);

  const emptyAfterEconomic = snapshot(now + 3);
  source.emit({
    ...emptyAfterEconomic,
    summary: {...emptyAfterEconomic.summary, triangularPaths: 0},
    triangularPaths: [],
  });
  assert.equal(controller.getSimulationSnapshot()?.evaluatedPaths, 0);
  assert.equal(
    controller.getLastEconomicallyEvaluableSimulationSnapshot()?.qualifiedPaths,
    1,
  );
  assert.equal(controller.getSignals(now + 4).length, 0);

  source.emit(snapshot(now + 5));
  for (let index = 0; index < 100; index += 1) {
    marketEvents.emit({exchange: "binance", market: "BTCUSDT", timestamp: now + 5 + index, kind: "UPSERT"});
  }
  await new Promise((resolve) => setTimeout(resolve, 60));
  const performance = controller.getPerformanceSnapshot();
  assert.equal(performance.affectedRouteWakeups, 100);
  assert.equal(performance.affectedRefreshRuns, 1);
  assert.equal(performance.coalescedMarketUpdates, 99);
  assert.equal(performance.affectedRefreshIntervalMs, 30);

  const basePath = snapshot(now + 7).triangularPaths[0];
  assert.ok(basePath);
  const priorityPaths = Array.from({length: 10}, (_, index) => ({
    ...structuredClone(basePath),
    id: `low-reference-${index}`,
    referenceGrossMultiplier: 1.001,
  }));
  priorityPaths.push({
    ...structuredClone(basePath),
    id: "highest-reference-last",
    referenceGrossMultiplier: 1.05,
  });
  const prioritized = engine.evaluate({
    ...snapshot(now + 7),
    summary: {...snapshot(now + 7).summary, triangularPaths: priorityPaths.length},
    triangularPaths: priorityPaths,
  }, {
    ...controller.getConfiguration(),
    maximumSignalsPerSnapshot: 1,
  }, now + 7);
  assert.equal(prioritized.evaluatedPaths, 10);
  assert.equal(prioritized.qualifiedPaths, 1);
  assert.equal(prioritized.simulations[0]?.pathId, "highest-reference-last");

  capabilities.delete("ETHBTC");
  const blocked = engine.evaluate(
    snapshot(now + 10),
    controller.getConfiguration(),
    now + 10,
  );

  assert.equal(blocked.qualifiedPaths, 0);
  assert.ok(
    blocked.simulations[0]?.blockers.includes("CAPABILITY_EVIDENCE_MISSING"),
  );

  const defaultDisabled = new TriangularArbitrageStrategyController();
  defaultDisabled.start();
  assert.equal(defaultDisabled.isRunning(), false);
  assert.equal(defaultDisabled.getSignals().length, 0);
  assert.equal(defaultDisabled.getPerformanceSnapshot().affectedRefreshIntervalMs, 50);
  assert.throws(
    () => new TriangularArbitrageStrategyController({
      enabled: true,
      maximumOpportunityAgeMs: 50,
    }),
    /below the opportunity freshness limit/,
  );

  controller.stop();

  console.log("TRIANGULAR ARBITRAGE FOUNDATION TEST PASSED.");
  console.log("Three-leg evidence was simulated; no PAPER, LIVE, capital or order action occurred.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
