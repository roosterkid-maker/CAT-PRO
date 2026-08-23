import assert from "node:assert/strict";
import type {DynamicOpportunityDiscoverySnapshot, TriangularDiscoveryPath} from "../../discovery/models/DynamicOpportunityDiscovery";
import type {ExchangeMarketCapability} from "../../execution/capabilities/models/ExchangeCapability";
import type {OrderBook} from "../../orderbook/models/OrderBook";
import {createTriangularArbitrageConfiguration} from "../triangular-arbitrage/TriangularArbitrageConfiguration";
import {TriangularArbitrageSimulationEngine} from "../triangular-arbitrage/TriangularArbitrageSimulationEngine";

function capability(market: string, base: string, quote: string, now: number): ExchangeMarketCapability {
  return {exchange: "binance", market, baseAsset: base, quoteAsset: quote, product: "spot", tradingEnabled: true,
    maintenanceMode: false, order: {supportedOrderTypes: ["market", "limit"], supportedTimeInForce: ["GTC", "IOC", "FOK"],
      supportsPostOnly: true, supportsClientOrderId: true, supportsOrderCancellation: true, supportsOrderStatusPolling: true},
    price: {minimumPrice: 0.0001, maximumPrice: null, priceStep: 0.0001, pricePrecision: 4},
    quantity: {minimumQuantity: 0.0001, maximumQuantity: 1_000_000, quantityStep: 0.0001, quantityPrecision: 4},
    notional: {minimumNotional: 1, maximumNotional: null}, fees: {makerFeeRate: 0.001, takerFeeRate: 0.001, feeAsset: null},
    sourceUpdatedAt: now, synchronizedAt: now};
}

function path(now: number, gross = 1.0201): TriangularDiscoveryPath {
  return {id: "acla-usdt-a-b", kind: "TRIANGULAR_SPOT_PATH", exchange: "binance", startAsset: "USDT",
    assets: ["USDT", "AAA", "BBB", "USDT"], legs: [
      {market: "AAAUSDT", fromAsset: "USDT", toAsset: "AAA", action: "BUY_BASE", referenceRate: 1,
        maximumInputQuantity: 100, timestamp: now},
      {market: "AAABBB", fromAsset: "AAA", toAsset: "BBB", action: "SELL_BASE", referenceRate: 1.01,
        maximumInputQuantity: 200, timestamp: now},
      {market: "BBBUSDT", fromAsset: "BBB", toAsset: "USDT", action: "SELL_BASE", referenceRate: 1.01,
        maximumInputQuantity: 200, timestamp: now},
    ], referenceGrossMultiplier: gross, feesApplied: false, marketRulesApplied: false,
    economicallyQualified: false, executionAuthorized: false};
}

function snapshot(route: TriangularDiscoveryPath): DynamicOpportunityDiscoverySnapshot {
  return {generatedAt: route.legs[0].timestamp, version: "24.0", mode: "READ_ONLY_DYNAMIC_DISCOVERY",
    summary: {cachedQuotes: 3, freshExecutableBooks: 3, rejectedQuotes: 0, exchanges: 1,
      normalizedSpotMarkets: 3, sharedSpotMarkets: 0, crossExchangeRoutes: 0, triangularPaths: 1},
    books: [], crossExchangeRoutes: [], triangularPaths: [route], safety: {marketCacheMutationAllowed: false,
      freshnessThresholdMutationAllowed: false, profitabilityQualificationAllowed: false, capitalMutationAllowed: false,
      paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}, notes: []};
}

function main(): void {
  const now = Date.now();
  const books = new Map<string, OrderBook>([
    ["AAAUSDT", {exchange: "binance", market: "AAAUSDT", bids: [{price: 0.99, quantity: 200}],
      asks: [{price: 1, quantity: 40}, {price: 1.01, quantity: 100}], timestamp: now}],
    ["AAABBB", {exchange: "binance", market: "AAABBB", bids: [{price: 1.01, quantity: 40}, {price: 1.009, quantity: 200}],
      asks: [{price: 1.011, quantity: 200}], timestamp: now}],
    ["BBBUSDT", {exchange: "binance", market: "BBBUSDT", bids: [{price: 1.01, quantity: 50}, {price: 1.009, quantity: 200}],
      asks: [{price: 1.011, quantity: 200}], timestamp: now}],
  ]);
  const capabilities = new Map([
    ["AAAUSDT", capability("AAAUSDT", "AAA", "USDT", now)], ["AAABBB", capability("AAABBB", "AAA", "BBB", now)],
    ["BBBUSDT", capability("BBBUSDT", "BBB", "USDT", now)],
  ]);
  let orderBookReads = 0;
  const engine = new TriangularArbitrageSimulationEngine({
    getFeeEvidence: (exchange, market) => ({exchange, market, makerPercent: 0.1, takerPercent: 0.1,
      source: "STATIC_CONFIG", synchronizedAt: null, expiresAt: null}),
    getCapability: (_exchange, market) => capabilities.get(market) ?? null,
    getOrderBook: (_exchange, market) => { orderBookReads += 1; return books.get(market) ?? null; },
  });
  const configuration = createTriangularArbitrageConfiguration({enabled: true, maximumInitialInputQuantity: 100,
    maximumOrderBookAgeMs: 1_000, maximumOpportunityAgeMs: 1_000, minimumNetProfitPercent: 0.25,
    minimumAbsoluteNetProfitInr: 15, startAssetInrValues: {INR: 1, USDT: 85, USDC: 85},
    capitalPool: {totalAllocationInr: 10_000, activeCycleCapitalInr: 8_500,
      recoveryReserveInr: 1_000, feeTdsDustReserveInr: 500}});
  const result = engine.evaluate(snapshot(path(now)), configuration, now).simulations[0];
  assert.ok(result);
  assert.equal(result.status, "QUALIFIED");
  assert.equal(result.legs.length, 3);
  assert.ok((result.legs[0]?.consumedDepthLevels ?? 0) >= 2);
  assert.ok((result.legs[1]?.inputQuantity ?? 0) === result.legs[0]?.outputAfterFee);
  assert.ok((result.stressNetProfitPercent ?? 0) > configuration.minimumNetProfitPercent);
  assert.ok((result.absoluteNetProfitInr ?? 0) >= configuration.minimumAbsoluteNetProfitInr);
  assert.ok(Math.abs((result.tdsCapitalLockInr ?? 0) - 85) < 0.001);
  assert.equal(result.legs.every((leg) => leg.executionPolicy === "FOK_OR_IOC_LIMIT_FUTURE_ONLY"), true);
  assert.equal(orderBookReads, 3);

  orderBookReads = 0;
  const weak = path(now, 1.001);
  const screened = engine.evaluate(snapshot(weak), configuration, now).simulations[0];
  assert.ok(screened?.blockers.includes("FAST_SCREEN_GROSS_EDGE_NOT_MET"));
  assert.equal(orderBookReads, 0);

  books.set("AAABBB", {...books.get("AAABBB")!, timestamp: now - 2_000});
  const stale = engine.evaluate(snapshot(path(now)), configuration, now).simulations[0];
  assert.ok(stale?.blockers.includes("ORDER_BOOK_STALE"));
  assert.equal(stale?.status, "BLOCKED");
  console.log("ACLA FULL-DEPTH QUALIFICATION TEST PASSED.");
  console.log("The fast screen avoided unnecessary depth reads; qualified routes consumed multi-level books, propagated exact rounded outputs and remained positive after fees, VWAP, reserves and TDS capital lock.");
}

main();
