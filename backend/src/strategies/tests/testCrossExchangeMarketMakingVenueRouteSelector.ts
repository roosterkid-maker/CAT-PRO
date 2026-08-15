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
  createCrossExchangeMarketMakingConfiguration,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingPricingSnapshot,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPriceEngine";

import {
  CrossExchangeMarketMakingInventoryRouteSelector,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingInventoryRouteSelector";

import {
  CrossExchangeMarketMakingVenueRouteSelector,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingVenueRouteSelector";

import {
  CrossExchangeMarketMakingMakerLifecycleSimulator,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingMakerLifecycleSimulator";

const NOW = 1_800_000_000_000;
const MARKET = "BTCUSDT";

function main(): void {
  const balances = new Map<string, ExchangeBalanceSnapshot>([
    ["bybit:USDT", balance("bybit", "USDT", 0)],
    ["bybit:BTC", balance("bybit", "BTC", 0)],
    ["coindcx:BTC", balance("coindcx", "BTC", 0)],
    ["coindcx:USDT", balance("coindcx", "USDT", 0)],
    ["binance:USDT", balance("binance", "USDT", 1_000)],
    ["binance:BTC", balance("binance", "BTC", 0)],
    ["coinswitch:BTC", balance("coinswitch", "BTC", 1)],
    ["coinswitch:USDT", balance("coinswitch", "USDT", 0)],
  ]);
  const inventory = new CrossExchangeMarketMakingInventoryRouteSelector({
    getMarketCapability: (exchange, market) => capability(exchange, market),
    getBalance: (exchange, asset) => balances.get(`${exchange}:${asset}`) ?? null,
  });
  const selector = new CrossExchangeMarketMakingVenueRouteSelector(inventory);
  const configuration = createCrossExchangeMarketMakingConfiguration({
    enabled: true,
    venuePairs: [
      {makerExchange: "bybit", hedgeExchange: "coindcx"},
      {makerExchange: "binance", hedgeExchange: "coinswitch"},
    ],
    routeStability: {minimumConsecutivePasses: 1, minimumDwellMs: 0, failoverCooldownMs: 0},
    marketAllowlist: [MARKET],
    minimumRetainedEdgePercent: 0.05,
    makerLifecycle: {enabled: true, quantityByMarket: {[MARKET]: 0.1}, maximumOrderAgeMs: 30_000, minimumRepriceTicks: 1},
  });
  assert.deepEqual(configuration.venuePairs.map((pair) => [pair.key, pair.priority]), [
    ["bybit>coindcx", 0],
    ["binance>coinswitch", 1],
  ]);
  assert.equal(configuration.makerExchange, "bybit");
  assert.equal(configuration.hedgeExchange, "coindcx");

  const selection = selector.select([
    snapshot("bybit", "coindcx", 0.9),
    snapshot("binance", "coinswitch", 0.4),
  ], configuration, NOW);
  assert.equal(selection.report.summary.operatorApprovedPairs, 2);
  assert.equal(selection.report.summary.directionsEvaluated, 4);
  assert.equal(selection.report.summary.priceQualified, 4);
  assert.equal(selection.report.summary.inventoryQualified, 1);
  assert.equal(selection.report.summary.selected, 1);
  assert.equal(selection.selected?.evidence.makerExchange, "binance");
  assert.equal(selection.selected?.evidence.hedgeExchange, "coinswitch");
  assert.equal(selection.selected?.evidence.side, "BID");
  assert.equal(selection.report.candidates.find((item) => item.selectionState === "SELECTED")?.pairPriority, 1,
    "A funded fallback must win when the higher-priority route is unfunded.");

  balances.set("bybit:USDT", balance("bybit", "USDT", 1_000));
  balances.set("coindcx:BTC", balance("coindcx", "BTC", 1));
  const prioritySelector = new CrossExchangeMarketMakingVenueRouteSelector(inventory);
  const primaryRestored = prioritySelector.select([
    snapshot("bybit", "coindcx", 0.1),
    snapshot("binance", "coinswitch", 1.5),
  ], configuration, NOW + 1);
  assert.equal(primaryRestored.selected?.evidence.makerExchange, "bybit",
    "Explicit operator pair priority must dominate the edge tie-breaker.");
  assert.equal(primaryRestored.selected?.evidence.side, "BID");
  assert.equal(primaryRestored.report.candidates.filter((item) => item.selectionState === "SELECTED").length, 1);
  assert.equal(primaryRestored.report.safety.operatorApprovedPairsOnly, true);
  assert.equal(primaryRestored.report.safety.inferredVenueAllowed, false);
  assert.equal(primaryRestored.report.safety.transferPerformed, false);

  const stabilitySelector = new CrossExchangeMarketMakingVenueRouteSelector(inventory);
  const stabilityConfiguration = createCrossExchangeMarketMakingConfiguration({
    enabled: true,
    venuePairs: [
      {makerExchange: "bybit", hedgeExchange: "coindcx"},
      {makerExchange: "binance", hedgeExchange: "coinswitch"},
    ],
    routeStability: {minimumConsecutivePasses: 3, minimumDwellMs: 2_000, failoverCooldownMs: 3_000},
    marketAllowlist: [MARKET],
    minimumRetainedEdgePercent: 0.05,
    makerLifecycle: {enabled: true, quantityByMarket: {[MARKET]: 0.1}, maximumOrderAgeMs: 30_000, minimumRepriceTicks: 1},
  });
  const stableSnapshots = [snapshot("bybit", "coindcx", 0.9), snapshot("binance", "coinswitch", 0.4)];
  assert.equal(stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW).selected, null);
  assert.equal(stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 1_000).selected, null);
  const initialActivation = stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 2_000);
  assert.equal(initialActivation.selected?.evidence.makerExchange, "bybit");
  assert.equal(initialActivation.report.summary.stable, 2);
  assert.equal(initialActivation.report.recentTransitions.at(-1)?.reason, "INITIAL_STABLE_ROUTE");

  balances.set("bybit:USDT", balance("bybit", "USDT", 0));
  const lost = stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 3_000);
  assert.equal(lost.selected, null, "Route loss must fail closed for the current evaluation even when a stable fallback exists.");
  assert.equal(lost.report.summary.cooldownUntil, NOW + 6_000);
  assert.equal(lost.report.recentTransitions.at(-1)?.type, "LOST");
  assert.equal(stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 5_000).selected, null);
  const fallbackActivation = stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 6_000);
  assert.equal(fallbackActivation.selected?.evidence.makerExchange, "binance");
  assert.equal(fallbackActivation.report.recentTransitions.at(-1)?.reason, "STABLE_FAILOVER_ROUTE");

  balances.set("bybit:USDT", balance("bybit", "USDT", 1_000));
  stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 7_000);
  stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 8_000);
  const sticky = stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 9_000);
  assert.equal(sticky.selected?.evidence.makerExchange, "binance",
    "A restored higher-priority route must not preempt a healthy active fallback.");
  assert.equal(sticky.report.candidates.find((item) => item.candidateKey.startsWith("bybit>coindcx") && item.side === "BID")?.selectionState,
    "STABLE_CANDIDATE");

  balances.set("binance:USDT", balance("binance", "USDT", 0));
  const fallbackLost = stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 10_000);
  assert.equal(fallbackLost.selected, null);
  assert.equal(fallbackLost.report.summary.cooldownUntil, NOW + 13_000);
  const primaryReactivated = stabilitySelector.select(stableSnapshots, stabilityConfiguration, NOW + 13_000);
  assert.equal(primaryReactivated.selected?.evidence.makerExchange, "bybit");
  assert.equal(primaryReactivated.report.recentTransitions.length, 5);
  assert.equal(primaryReactivated.report.safety.routeLossFailsClosed, true);
  assert.equal(primaryReactivated.report.safety.cooldownBypassAllowed, false);

  const lifecycle = new CrossExchangeMarketMakingMakerLifecycleSimulator();
  const lifecycleSnapshot = lifecycle.observe([
    snapshot("bybit", "coindcx", 0.1),
    snapshot("binance", "coinswitch", 1.5),
  ], configuration, true, NOW);
  assert.equal(lifecycleSnapshot.activeOrderCount, 4,
    "Identical market/sides on two venue pairs must retain separate SHADOW lifecycle identities.");
  assert.equal(new Set(lifecycleSnapshot.orders.map((order) => `${order.makerExchange}>${order.hedgeExchange}`)).size, 2);
  assert.equal(new Set(lifecycleSnapshot.orders.map((order) => order.id)).size, 4);

  console.log("Cross-exchange market-making operator-approved venue route selector test passed.");
  console.log("V79 required qualification dwell, failed closed on route loss, observed cooldown and kept the healthy active route sticky.");
}

function snapshot(makerExchange: string, hedgeExchange: string, edge: number): CrossExchangeMarketMakingPricingSnapshot {
  return {
    version: "21.5",
    strategyId: "cross-exchange-market-making",
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    controllerRunning: true,
    market: MARKET,
    makerExchange,
    hedgeExchange,
    inputs: {makerQuote: null, hedgeQuote: null, freshness: null, makerFee: null, hedgeFee: null,
      makerCapability: capability(makerExchange, MARKET)},
    results: ["BID", "ASK"].map((side) => ({
      side: side as "BID" | "ASK",
      status: "ACCEPTED" as const,
      blockers: [],
      expiresAt: NOW + 5_000,
      evidence: evidence(side as "BID" | "ASK", makerExchange, hedgeExchange, edge),
    })),
    safety: {
      shadowEvidenceOnly: true,
      postOnlyRequired: true,
      quantitySizingEvaluated: false,
      placementSimulated: false,
      fillSimulated: false,
      hedgeIntentGenerated: false,
      executionAuthorized: false,
      orderSubmissionAllowed: false,
    },
  };
}

function evidence(side: "BID" | "ASK", makerExchange: string, hedgeExchange: string, edge: number): CrossExchangeMarketMakingSafePriceEvidence {
  return {
    market: MARKET, side, makerExchange, hedgeExchange,
    makerBestBidPrice: 99, makerBestBidQuantity: 5, makerBestAskPrice: 101, makerBestAskQuantity: 6,
    hedgeReferenceSide: side === "BID" ? "BID" : "ASK", hedgeReferencePrice: side === "BID" ? 102 : 103,
    hedgeReferenceQuantity: 8, economicBoundaryPrice: 100, passiveBoundaryPrice: side === "BID" ? 100.99 : 99.01,
    safeMakerPrice: side === "BID" ? 100.99 : 103.42, priceStep: 0.01, minimumRetainedEdgePercent: 0.05,
    modeledRetainedEdgePercent: edge,
    makerFee: {percent: 0.1, source: "STATIC_CONFIG", market: MARKET, synchronizedAt: null, expiresAt: null},
    hedgeTakerFee: {percent: 0.1, source: "STATIC_CONFIG", market: MARKET, synchronizedAt: null, expiresAt: null},
    makerQuoteTimestamp: NOW - 100, hedgeQuoteTimestamp: NOW - 100, makerQuoteAgeMs: 100, hedgeQuoteAgeMs: 100,
    timestampSkewMs: 0, maximumPairSkewMs: 2_000, makerCapabilitySynchronizedAt: NOW - 100,
    maximumCapabilityAgeMs: 60_000, postOnlyRequired: true, configuredMakerQuantity: 0.1,
    pricingModel: "ONE_BASE_UNIT_QUOTE_VALUE_PERCENT_V21_1", quantitySizing: "CONFIGURED_MARKET_QUANTITY_V60",
    queuePosition: "NOT_EVALUATED_V21_1", fillProbability: "NOT_EVALUATED_V21_1",
    makerPlacement: "NOT_SIMULATED_V21_1", hedgeSlippage: "NOT_EVALUATED_V21_1",
  };
}

function capability(exchange: string, market: string): ExchangeMarketCapability {
  return {
    exchange, market, baseAsset: "BTC", quoteAsset: "USDT", product: "spot", tradingEnabled: true, maintenanceMode: false,
    order: {supportedOrderTypes: ["market", "limit"], supportedTimeInForce: ["GTC"], supportsPostOnly: true,
      supportsClientOrderId: true, supportsOrderCancellation: true, supportsOrderStatusPolling: true},
    price: {minimumPrice: 0.01, maximumPrice: null, priceStep: 0.01, pricePrecision: 2},
    quantity: {minimumQuantity: 0.00001, maximumQuantity: null, quantityStep: 0.00001, quantityPrecision: 5},
    notional: {minimumNotional: 1, maximumNotional: null},
    fees: {makerFeeRate: 0.001, takerFeeRate: 0.001, feeAsset: "USDT"}, sourceUpdatedAt: NOW, synchronizedAt: NOW,
  };
}

function balance(exchange: string, asset: string, availableBalance: number): ExchangeBalanceSnapshot {
  return {exchange, asset, availableBalance, lockedBalance: 0, totalBalance: availableBalance, synchronizedAt: NOW};
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
