import assert from "node:assert/strict";
import type {ExchangeMarketCapability} from "../../execution/capabilities/models/ExchangeCapability";
import type {OrderBook} from "../../orderbook/models/OrderBook";
import type {CrossExchangeMarketMakingPublicTrade} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";
import {DynamicMarketMakingEngine} from "../dynamic-market-making/DynamicMarketMakingEngine";
import {
  DynamicMarketMakingStrategyController,
  type DynamicMarketMakingBookSource,
} from "../dynamic-market-making/DynamicMarketMakingStrategyController";

class BookSource implements DynamicMarketMakingBookSource {
  constructor(private book: OrderBook) {}
  set(book: OrderBook): void { this.book = book; }
  getAll(): OrderBook[] { return [structuredClone(this.book)]; }
}

function book(mid: number, timestamp: number): OrderBook {
  return {
    exchange: "binance", market: "BTCUSDT", timestamp,
    bids: [{price: mid - 0.1, quantity: 8}, {price: mid - 0.2, quantity: 12}],
    asks: [{price: mid + 0.1, quantity: 3}, {price: mid + 0.2, quantity: 15}],
  };
}

function capability(now: number): ExchangeMarketCapability {
  return {
    exchange: "binance", market: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT",
    product: "spot", tradingEnabled: true, maintenanceMode: false,
    order: {supportedOrderTypes: ["market", "limit"], supportedTimeInForce: ["GTC", "IOC"],
      supportsPostOnly: true, supportsClientOrderId: true, supportsOrderCancellation: true,
      supportsOrderStatusPolling: true},
    price: {minimumPrice: 0.1, maximumPrice: null, priceStep: 0.1, pricePrecision: 1},
    quantity: {minimumQuantity: 0.001, maximumQuantity: 1000, quantityStep: 0.001, quantityPrecision: 3},
    notional: {minimumNotional: 5, maximumNotional: null},
    fees: {makerFeeRate: 0.0002, takerFeeRate: 0.001, feeAsset: null},
    sourceUpdatedAt: now, synchronizedAt: now,
  };
}

function trades(now: number): CrossExchangeMarketMakingPublicTrade[] {
  return Array.from({length: 12}, (_, index) => ({
    id: `trade-${index}`, exchange: "binance", market: "BTCUSDT",
    price: index % 2 === 0 ? 90 : 110, quantity: 0.5, occurredAt: now - 500 + index,
    aggressorSide: index % 2 === 0 ? "SELL" as const : "BUY" as const,
    source: "BINANCE_AGG_TRADE" as const,
  }));
}

async function main(): Promise<void> {
  const now = Date.now();
  const source = new BookSource(book(100, now));
  const engine = new DynamicMarketMakingEngine({
    getCapability: () => capability(now),
    getFee: (exchange, market) => ({exchange, market, makerPercent: 0.02, takerPercent: 0.1,
      source: "STATIC_CONFIG", synchronizedAt: null, expiresAt: null}),
    getBalance: (exchange, asset) => ({exchange, asset, availableBalance: asset === "BTC" ? 2 : 20_000,
      lockedBalance: 0, totalBalance: asset === "BTC" ? 2 : 20_000, synchronizedAt: now}),
    watchPublicTrades: () => undefined,
    getPublicTrades: () => trades(now),
  });
  const controller = new DynamicMarketMakingStrategyController({
    enabled: true, exchanges: ["binance"], markets: ["BTCUSDT"], targetQuoteNotional: 100,
    minimumSamples: 4, maximumSamples: 10, volatilitySpreadMultiplier: 1,
    imbalanceFairValueWeight: 0.5, minimumHalfSpreadPercent: 0.05,
    minimumModeledNetCapturePercent: 0.05, safetyBufferPercent: 0.02,
    minimumPublicTradeSamples: 10, minimumEmpiricalFillProbabilityPercent: 1,
    maximumEvidenceAgeMs: 10_000, refreshIntervalMs: 60_000, signalTtlMs: 5_000,
  }, source, engine);
  controller.start();
  assert.equal(controller.getSignals().length, 0);
  assert.ok(controller.getDynamicSnapshot()?.assessments[0]?.blockers.includes("HISTORY_INSUFFICIENT"));
  assert.ok(controller.getDynamicSnapshot()?.assessments[0]?.diagnostics.book);
  assert.ok(controller.getDynamicSnapshot()?.assessments[0]?.diagnostics.capability);

  const mids = [100.2, 99.8, 100.4];
  mids.forEach((mid, index) => {
    const timestamp = now + (index + 1) * 1_000;
    source.set(book(mid, timestamp));
    controller.runOnce(timestamp);
  });
  const finalTime = now + 3_000;
  const signals = controller.getSignals(finalTime);
  assert.equal(signals.length, 1);
  const signal = signals[0];
  assert.equal(signal?.kind, "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN");
  if (signal?.kind !== "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN") throw new Error("Expected dynamic market-making SHADOW signal.");
  assert.ok(signal.evidence.realizedVolatilityPercent > 0);
  assert.ok(signal.evidence.adaptiveHalfSpreadPercent > 0.05);
  assert.ok(signal.evidence.bidQuotePrice < signal.evidence.askQuotePrice);
  assert.equal(signal.evidence.passiveQuotesEnforced, true);
  assert.equal(signal.evidence.inventoryAdjustmentApplied, true);
  assert.equal(signal.evidence.inventoryEvidenceSource, "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS");
  assert.ok(signal.evidence.inventoryBaseSharePercent < signal.evidence.inventoryTargetBasePercent);
  assert.ok(signal.evidence.inventorySkewPercent > 0);
  assert.ok(signal.evidence.fairPrice > signal.evidence.unadjustedFairPrice);
  assert.equal(signal.evidence.publicTradeSampleCount, 12);
  assert.equal(signal.evidence.fillProbabilityKnown, true);
  assert.ok(signal.evidence.bidFillProbabilityPercent > 0);
  assert.ok(signal.evidence.askFillProbabilityPercent > 0);
  assert.ok(["CALM", "NORMAL", "VOLATILE"].includes(signal.evidence.marketRegime));
  assert.ok(signal.evidence.liquidityCoverageMultiple > 0);
  assert.equal(signal.evidence.queuePositionKnown, false);
  assert.equal(signal.evidence.modeledCaptureGuaranteed, false);
  assert.equal(signal.executionAuthorized, false);
  const qualifiedDiagnostics = controller.getDynamicSnapshot()?.assessments[0]?.diagnostics;
  assert.ok(qualifiedDiagnostics?.book);
  assert.ok(qualifiedDiagnostics?.capability);
  assert.ok(qualifiedDiagnostics?.inventory);
  assert.ok(qualifiedDiagnostics?.fillQuality);
  assert.ok(qualifiedDiagnostics?.economics);
  assert.deepEqual(signal.evidence.executionReadinessBlockers, [
    "QUEUE_POSITION_UNKNOWN", "POST_ONLY_EXECUTION_UNVERIFIED",
  ]);

  const futureBookEngine = new DynamicMarketMakingEngine({
    getCapability: () => capability(now),
    getFee: (exchange, market) => ({exchange, market, makerPercent: 0.02, takerPercent: 0.1,
      source: "STATIC_CONFIG", synchronizedAt: null, expiresAt: null}),
    getBalance: (exchange, asset) => ({exchange, asset, availableBalance: asset === "BTC" ? 2 : 20_000,
      lockedBalance: 0, totalBalance: asset === "BTC" ? 2 : 20_000, synchronizedAt: now}),
    watchPublicTrades: () => undefined,
    getPublicTrades: () => trades(now),
  });
  const futureBook = futureBookEngine.evaluate([book(100, now + 20_000)], controller.getConfiguration(), now);
  assert.ok(futureBook.assessments[0]?.blockers.includes("BOOK_STALE"));
  let recoveredAfterFutureBook = futureBook;
  for (let index = 1; index <= 4; index += 1) {
    recoveredAfterFutureBook = futureBookEngine.evaluate(
      [book(100 + index * 0.1, now + index)],
      controller.getConfiguration(),
      now + index,
    );
  }
  assert.equal(recoveredAfterFutureBook.qualifiedMarkets, 1);
  const capabilityStillBoundedAndCurrent = futureBookEngine.evaluate(
    [book(101, now + 6_000)],
    controller.getConfiguration(),
    now + 6_000,
  );
  assert.equal(capabilityStillBoundedAndCurrent.assessments[0]?.blockers.includes("CAPABILITY_STALE"), false);
  assert.equal(capabilityStillBoundedAndCurrent.qualifiedMarkets, 1);

  const noFee = new DynamicMarketMakingEngine({getCapability: () => capability(now), getFee: () => null});
  const config = controller.getConfiguration();
  const noFeeResult = noFee.evaluate([book(100, now)], config, now);
  assert.ok(noFeeResult.assessments[0]?.blockers.includes("FEE_EVIDENCE_MISSING"));
  assert.ok(noFeeResult.assessments[0]?.diagnostics.book);
  assert.equal(noFeeResult.assessments[0]?.diagnostics.capability, null);

  const noInventory = new DynamicMarketMakingEngine({
    getCapability: () => capability(now),
    getFee: (exchange, market) => ({exchange, market, makerPercent: 0.02, takerPercent: 0.1,
      source: "STATIC_CONFIG", synchronizedAt: null, expiresAt: null}),
    getBalance: () => null,
  });
  for (let index = 0; index < 4; index += 1) noInventory.evaluate([book(100 + index * 0.1, now + index)], config, now + index);
  const noInventoryResult = noInventory.evaluate([book(100.5, now + 10)], config, now + 10);
  assert.equal(noInventoryResult.qualifiedMarkets, 0);
  assert.ok(noInventoryResult.assessments[0]?.blockers.includes("INVENTORY_EVIDENCE_MISSING"));
  assert.ok(noInventoryResult.assessments[0]?.diagnostics.capability);
  assert.equal(noInventoryResult.assessments[0]?.diagnostics.inventory, null);

  const noTrades = new DynamicMarketMakingEngine({
    getCapability: () => capability(now),
    getFee: (exchange, market) => ({exchange, market, makerPercent: 0.02, takerPercent: 0.1,
      source: "STATIC_CONFIG", synchronizedAt: null, expiresAt: null}),
    getBalance: (exchange, asset) => ({exchange, asset, availableBalance: 100,
      lockedBalance: 0, totalBalance: 100, synchronizedAt: now}),
    watchPublicTrades: () => undefined,
    getPublicTrades: () => [],
  });
  for (let index = 0; index < 4; index += 1) noTrades.evaluate([book(100 + index * 0.1, now + index)], config, now + index);
  const noTradesResult = noTrades.evaluate([book(100.5, now + 10)], config, now + 10);
  assert.ok(noTradesResult.assessments[0]?.blockers.includes("PUBLIC_TRADE_EVIDENCE_INSUFFICIENT"));
  assert.ok(noTradesResult.assessments[0]?.diagnostics.inventory);
  assert.equal(noTradesResult.assessments[0]?.diagnostics.fillQuality?.sampleCount, 0);
  assert.equal(noTradesResult.assessments[0]?.diagnostics.economics, null);

  const disabled = new DynamicMarketMakingStrategyController();
  disabled.start();
  assert.equal(disabled.isRunning(), false);
  assert.equal(disabled.getSignals().length, 0);
  controller.stop();
  console.log("DYNAMIC MARKET-MAKING FOUNDATION TEST PASSED.");
  console.log("Authenticated inventory plus empirical trade-flow, fill likelihood, regime, liquidity and volatility adapted passive SHADOW quotes; missing evidence failed closed and no LIVE/order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
