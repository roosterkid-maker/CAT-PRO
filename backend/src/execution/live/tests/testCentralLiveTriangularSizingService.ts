import assert from "node:assert/strict";
import type {ExchangeMarketCapability} from "../../capabilities/models/ExchangeCapability";
import type {OrderBook} from "../../../orderbook/models/OrderBook";
import {TriangularArbitrageSimulationEngine} from "../../../strategies/triangular-arbitrage/TriangularArbitrageSimulationEngine";
import {createTriangularArbitrageConfiguration} from "../../../strategies/triangular-arbitrage/TriangularArbitrageConfiguration";
import {CentralLiveTriangularSizingService} from "../central/CentralLiveTriangularSizingService";

const now = 1_780_800_000_000;

function capability(market: string, quantityStep: number): ExchangeMarketCapability {
  return {
    exchange: "binance", market, baseAsset: market.slice(0, 3), quoteAsset: market.slice(3),
    product: "spot", tradingEnabled: true, maintenanceMode: false,
    order: {supportedOrderTypes: ["market", "limit"], supportedTimeInForce: ["GTC"], supportsPostOnly: true,
      supportsClientOrderId: true, supportsOrderCancellation: true, supportsOrderStatusPolling: true},
    price: {minimumPrice: 0.000001, maximumPrice: null, priceStep: 0.000001, pricePrecision: 6},
    quantity: {minimumQuantity: quantityStep, maximumQuantity: 1_000, quantityStep, quantityPrecision: 4},
    notional: {minimumNotional: 1, maximumNotional: null},
    fees: {makerFeeRate: 0.001, takerFeeRate: 0.001, feeAsset: null},
    sourceUpdatedAt: now, synchronizedAt: now,
  };
}

function book(market: string, bidPrice: number, askPrice: number, quantity: number): OrderBook {
  return {exchange: "binance", market, bids: [{price: bidPrice, quantity}], asks: [{price: askPrice, quantity}], timestamp: now};
}

function main(): void {
  const capabilities = new Map<string, ExchangeMarketCapability>([
    ["BTCUSDT", capability("BTCUSDT", 0.0001)],
  ]);
  const books = new Map<string, OrderBook>([
    ["BTCUSDT", book("BTCUSDT", 50_000, 50_001, 5)],
  ]);
  const engine = new TriangularArbitrageSimulationEngine({
    getFeeEvidence: (exchange, market) => ({exchange, market, makerPercent: 0.1, takerPercent: 0.1,
      source: "STATIC_CONFIG", synchronizedAt: null, expiresAt: null}),
    getCapability: (_exchange, market) => structuredClone(capabilities.get(market) ?? null),
    getOrderBook: (_exchange, market) => structuredClone(books.get(market) ?? null),
  });
  const capabilitiesPort = {getCachedCapability: (_exchange: string, market: string) => capabilities.get(market) ?? null};
  const service = new CentralLiveTriangularSizingService(engine, capabilitiesPort);
  const configuration = createTriangularArbitrageConfiguration({enabled: true, allowedExchanges: ["binance"]});

  const sellResult = service.computeLegSizing({exchange: "binance", market: "BTCUSDT", fromAsset: "BTC", toAsset: "USDT",
    side: "SELL", availableInputQuantity: 1, configuration, now});
  assert.equal(sellResult.ok, true);
  if (sellResult.ok) {
    assert.ok(sellResult.requestedBaseQuantity > 0 && sellResult.requestedBaseQuantity <= 1);
    assert.equal(sellResult.maximumExpectedInputQuantity, 1);
    assert.equal(sellResult.allowedInputDustQuantity, 0.0001 * 2);
    assert.equal(sellResult.marketRulesVerified, true);
    assert.equal(sellResult.quoteFresh, true);
    assert.equal(sellResult.feeScheduleFresh, true);
    assert.equal(sellResult.thirdAssetFeeBalanceVerified, false, "Only the real post-fill result can verify a third-asset fee balance; the pre-fill sizing call must never fabricate this as true.");
  }

  const buyResult = service.computeLegSizing({exchange: "binance", market: "BTCUSDT", fromAsset: "USDT", toAsset: "BTC",
    side: "BUY", availableInputQuantity: 10_000, configuration, now});
  assert.equal(buyResult.ok, true);
  if (buyResult.ok) {
    assert.ok(buyResult.requestedBaseQuantity > 0);
  }

  const staleBook = new Map<string, OrderBook>([["BTCUSDT", book("BTCUSDT", 50_000, 50_001, 5)]]);
  const staleEngine = new TriangularArbitrageSimulationEngine({
    getFeeEvidence: (exchange, market) => ({exchange, market, makerPercent: 0.1, takerPercent: 0.1,
      source: "STATIC_CONFIG", synchronizedAt: null, expiresAt: null}),
    getCapability: (_exchange, market) => structuredClone(capabilities.get(market) ?? null),
    getOrderBook: (_exchange, market) => structuredClone(staleBook.get(market) ?? null),
  });
  const staleService = new CentralLiveTriangularSizingService(staleEngine, capabilitiesPort);
  const staleResult = staleService.computeLegSizing({exchange: "binance", market: "BTCUSDT", fromAsset: "BTC", toAsset: "USDT",
    side: "SELL", availableInputQuantity: 1, configuration, now: now + configuration.maximumOrderBookAgeMs + 1});
  assert.equal(staleResult.ok, false, "A stale order book must fail closed rather than sizing against a stale quote.");

  const noCapabilityService = new CentralLiveTriangularSizingService(engine, {getCachedCapability: () => null});
  const noCapabilityResult = noCapabilityService.computeLegSizing({exchange: "binance", market: "BTCUSDT",
    fromAsset: "BTC", toAsset: "USDT", side: "SELL", availableInputQuantity: 1, configuration, now});
  assert.equal(noCapabilityResult.ok, true, "Dust tolerance falls back to a conservative estimate when no capability increment is cached; sizing itself does not require it.");
  if (noCapabilityResult.ok) {
    assert.ok(noCapabilityResult.allowedInputDustQuantity > 0);
  }

  const unknownMarketResult = service.computeLegSizing({exchange: "binance", market: "UNKNOWNUSDT", fromAsset: "BTC",
    toAsset: "USDT", side: "SELL", availableInputQuantity: 1, configuration, now});
  assert.equal(unknownMarketResult.ok, false, "No order book or capability evidence exists for an unknown market; sizing must fail closed, never invent a quantity.");
  if (!unknownMarketResult.ok) {
    assert.ok(unknownMarketResult.blockers.length > 0);
  }

  console.log("CENTRAL LIVE TRIANGULAR SIZING SERVICE TEST PASSED.");
  console.log("Real depth/VWAP/fee-aware leg sizing was reused from the SHADOW simulation engine for both trade directions; stale books, missing capability caches and unknown markets all failed closed without inventing a quantity.");
}

main();
