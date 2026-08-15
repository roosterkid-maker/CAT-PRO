import assert from "node:assert/strict";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import type {
  ExchangeBalanceSnapshot,
} from "../../trading/account/TradingAccountService";

import type {
  CrossExchangeMarketMakingSafePriceEvidence,
} from "../models/StrategySignal";

import {
  CrossExchangeMarketMakingInventoryRouteSelector,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingInventoryRouteSelector";

const NOW = 1_800_000_000_000;
const MARKET = "BTCUSDT";

function main(): void {
  const balances = new Map<string, ExchangeBalanceSnapshot>([
    ["bybit:USDT", balance("bybit", "USDT", 1_000, NOW - 100)],
    ["binance:BTC", balance("binance", "BTC", 0.25, NOW - 200)],
    ["bybit:BTC", balance("bybit", "BTC", 0, NOW - 100)],
  ]);
  const selector = new CrossExchangeMarketMakingInventoryRouteSelector({
    getMarketCapability: (exchange, market) => capability(exchange, market),
    getBalance: (exchange, asset) => balances.get(`${exchange}:${asset}`) ?? null,
  });

  const bid = selector.evaluate(evidence("BID"), NOW);
  assert.equal(bid.state, "FEASIBLE", "Funded maker-buy / hedge-sell direction must be eligible.");
  assert.deepEqual(bid.requirements.map((item) => [item.role, item.action, item.asset, item.state]), [
    ["MAKER", "BUY", "USDT", "VERIFIED"],
    ["HEDGE", "SELL", "BTC", "VERIFIED"],
  ]);
  assert.equal(bid.requirements[0]?.requiredAmount, 10.109099);

  const ask = selector.evaluate(evidence("ASK"), NOW + 1);
  assert.equal(ask.state, "BLOCKED", "Unfunded reverse direction must fail closed before signal publication.");
  assert.deepEqual(ask.requirements.map((item) => item.state), ["INSUFFICIENT", "NOT_SYNCHRONIZED"]);
  assert.ok(ask.blockers.includes("INVENTORY_BALANCE:INSUFFICIENT:MAKER:bybit:BTC"));
  assert.ok(ask.blockers.includes("INVENTORY_BALANCE:NOT_SYNCHRONIZED:HEDGE:binance:USDT"));

  const snapshot = selector.getSnapshot(NOW + 2);
  assert.equal(snapshot.summary.evaluations, 2);
  assert.equal(snapshot.summary.feasibleRoutes, 1);
  assert.equal(snapshot.summary.blockedRoutes, 1);
  assert.equal(snapshot.safety.readOnly, true);
  assert.equal(snapshot.safety.balanceMutationPerformed, false);
  assert.equal(snapshot.safety.transferPerformed, false);
  assert.equal(Object.isFrozen(snapshot), false, "Callers receive an isolated clone of the frozen internal report.");

  const stale = new CrossExchangeMarketMakingInventoryRouteSelector({
    getMarketCapability: (exchange, market) => capability(exchange, market),
    getBalance: (exchange, asset) => {
      if (exchange === "bybit" && asset === "USDT") return balance(exchange, asset, 1_000, NOW - 20_000);
      if (exchange === "binance" && asset === "BTC") return balance(exchange, asset, 1, NOW);
      return null;
    },
  }).evaluate(evidence("BID"), NOW);
  assert.equal(stale.state, "BLOCKED");
  assert.ok(stale.blockers.includes("INVENTORY_BALANCE:STALE:MAKER:bybit:USDT"));

  const quantityMissing = selector.evaluate({...evidence("BID"), configuredMakerQuantity: null}, NOW + 3);
  assert.equal(quantityMissing.state, "BLOCKED");
  assert.deepEqual(quantityMissing.blockers, ["INVENTORY_CONFIGURED_QUANTITY_MISSING"]);

  console.log("Cross-exchange market-making inventory route selector test passed.");
  console.log("V77 selected only fresh funded directions; no balance mutation, transfer, PAPER, LIVE or order action occurred.");
}

function evidence(side: "BID" | "ASK"): CrossExchangeMarketMakingSafePriceEvidence {
  return {
    market: MARKET,
    side,
    makerExchange: "bybit",
    hedgeExchange: "binance",
    makerBestBidPrice: 99,
    makerBestBidQuantity: 5,
    makerBestAskPrice: 101,
    makerBestAskQuantity: 6,
    hedgeReferenceSide: side === "BID" ? "BID" : "ASK",
    hedgeReferencePrice: side === "BID" ? 102 : 103,
    hedgeReferenceQuantity: 8,
    economicBoundaryPrice: 100,
    passiveBoundaryPrice: side === "BID" ? 100.99 : 99.01,
    safeMakerPrice: side === "BID" ? 100.99 : 103.42,
    priceStep: 0.01,
    minimumRetainedEdgePercent: 0.2,
    modeledRetainedEdgePercent: 0.3,
    makerFee: {percent: 0.1, source: "STATIC_CONFIG", market: MARKET, synchronizedAt: null, expiresAt: null},
    hedgeTakerFee: {percent: 0.1, source: "STATIC_CONFIG", market: MARKET, synchronizedAt: null, expiresAt: null},
    makerQuoteTimestamp: NOW - 100,
    hedgeQuoteTimestamp: NOW - 100,
    makerQuoteAgeMs: 100,
    hedgeQuoteAgeMs: 100,
    timestampSkewMs: 0,
    maximumPairSkewMs: 2_000,
    makerCapabilitySynchronizedAt: NOW - 100,
    maximumCapabilityAgeMs: 60_000,
    postOnlyRequired: true,
    configuredMakerQuantity: 0.1,
    pricingModel: "ONE_BASE_UNIT_QUOTE_VALUE_PERCENT_V21_1",
    quantitySizing: "CONFIGURED_MARKET_QUANTITY_V60",
    queuePosition: "NOT_EVALUATED_V21_1",
    fillProbability: "NOT_EVALUATED_V21_1",
    makerPlacement: "NOT_SIMULATED_V21_1",
    hedgeSlippage: "NOT_EVALUATED_V21_1",
  };
}

function capability(exchange: string, market: string): ExchangeMarketCapability {
  return {
    exchange,
    market,
    baseAsset: "BTC",
    quoteAsset: "USDT",
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
    price: {minimumPrice: 0.01, maximumPrice: null, priceStep: 0.01, pricePrecision: 2},
    quantity: {minimumQuantity: 0.00001, maximumQuantity: null, quantityStep: 0.00001, quantityPrecision: 5},
    notional: {minimumNotional: 1, maximumNotional: null},
    fees: {makerFeeRate: 0.001, takerFeeRate: 0.001, feeAsset: "USDT"},
    sourceUpdatedAt: NOW,
    synchronizedAt: NOW,
  };
}

function balance(exchange: string, asset: string, availableBalance: number, synchronizedAt: number): ExchangeBalanceSnapshot {
  return {exchange, asset, availableBalance, lockedBalance: 0, totalBalance: availableBalance, synchronizedAt};
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
