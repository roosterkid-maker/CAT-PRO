import assert from "node:assert/strict";
import type {StrategySignal} from "../models/StrategySignal";
import {CentralStrategyExecutionPlanCompiler} from "../services/CentralStrategyExecutionPlanCompiler";

const now = 1_780_000_000_000;
const expiresAt = now + 5_000;

function base(kind: StrategySignal["kind"], strategyId: StrategySignal["strategyId"], evidence: object): StrategySignal {
  return {id: `signal:${kind}`, strategyId, kind, evidenceStatus: "AVAILABLE", source: "DerivativeMarketData",
    sourceSnapshotGeneratedAt: now, generatedAt: now, observedAt: now, expiresAt,
    executionAuthorized: false, automaticExecutionAllowed: false, evidence} as unknown as StrategySignal;
}

async function main(): Promise<void> {
  const compiler = new CentralStrategyExecutionPlanCompiler();
  const strategyOne = compiler.compile({
    ...base("CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY", "cross-exchange-arbitrage", {}),
    source: "OpportunityService", sourceOpportunityId: "op-1",
    evidence: {market: "BTCUSDT", buyExchange: "binance", sellExchange: "bybit", buyPrice: 100, sellPrice: 101,
      executableQuantity: 2, netProfit: 1.5},
  } as unknown as StrategySignal, now);
  assert.equal(strategyOne.compilationState, "REUSED_EXISTING_PATH");
  assert.equal(strategyOne.executionOwner, "EXISTING_STRATEGY_ONE_ORCHESTRATOR");
  assert.deepEqual(strategyOne.legs.map((item) => item.side), ["BUY", "SELL"]);

  const xemm = compiler.compile({
    ...base("XEMM_SAFE_MAKER_PRICE", "cross-exchange-market-making", {}), source: "XEMMPriceEngine",
    evidence: {market: "ETHUSDT", side: "BID", makerExchange: "binance", hedgeExchange: "bybit",
      safeMakerPrice: 2000, hedgeReferencePrice: 2002, modeledRetainedEdgePercent: 0.05, configuredMakerQuantity: 0.25},
  } as unknown as StrategySignal, now);
  assert.equal(xemm.pattern, "PASSIVE_MAKER_THEN_HEDGE");
  assert.equal(xemm.legs[0]?.quantity, 0.25);
  assert.ok(xemm.executionReadinessBlockers.includes("MAKER_FILL_EVIDENCE_REQUIRED"));

  const triangular = compiler.compile(base("TRIANGULAR_ARBITRAGE_SHADOW_PATH", "triangular-arbitrage", {
    exchange: "binance", startAsset: "USDT", initialInputQuantity: 100, finalOutputQuantity: 101, netProfitQuantity: 1, legs: [
      {market: "BTCUSDT", fromAsset: "USDT", toAsset: "BTC", action: "BUY_BASE", tradedInputQuantity: 100, outputBeforeFee: 1},
      {market: "ETHBTC", fromAsset: "BTC", toAsset: "ETH", action: "BUY_BASE", tradedInputQuantity: 1, outputBeforeFee: 10},
      {market: "ETHUSDT", fromAsset: "ETH", toAsset: "USDT", action: "SELL_BASE", tradedInputQuantity: 10, outputBeforeFee: 101},
    ],
  }), now);
  assert.equal(triangular.legs.length, 3);
  assert.equal(triangular.settlementPolicy.kind, "IMMEDIATE_CONVERSION_CYCLE");
  assert.deepEqual(triangular.legs.map((item) => item.dependency), ["PARALLEL", "AFTER_PREVIOUS", "AFTER_PREVIOUS"]);
  assert.throws(() => compiler.compile(base("TRIANGULAR_ARBITRAGE_SHADOW_PATH", "triangular-arbitrage", {
    exchange: "binance", startAsset: "USDT", initialInputQuantity: 100, finalOutputQuantity: 101, netProfitQuantity: 1, legs: [
      {market: "BTCUSDT", fromAsset: "USDT", toAsset: "BTC", action: "BUY_BASE", tradedInputQuantity: 100, outputBeforeFee: 1},
      {market: "ETHBTC", fromAsset: "USDC", toAsset: "ETH", action: "BUY_BASE", tradedInputQuantity: 1, outputBeforeFee: 10},
      {market: "ETHUSDT", fromAsset: "ETH", toAsset: "USDT", action: "SELL_BASE", tradedInputQuantity: 10, outputBeforeFee: 101},
    ],
  }), now), /settlement policy evidence is incomplete/,
  "A discontinuous conversion cycle must fail before central admission.");

  const fixtures: readonly StrategySignal[] = [
    base("SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY", "spot-perpetual-basis-arbitrage", {
      exchange: "binance", market: "BTCUSDT", quantity: 1, spotBuyVwap: 100, perpetualSellVwap: 102,
      grossBasisPercent: 2, nextFundingTime: now + 10_000, expectedNetQuote: 1, executionReadinessBlockers: ["DERIVATIVE_ADAPTER_MISSING"]}),
    base("FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY", "funding-rate-arbitrage", {
      market: "BTCUSDT", longExchange: "binance", shortExchange: "bybit", quantity: 1,
      longEntryVwap: 100, shortEntryVwap: 101, nextFundingTimeLong: now + 10_000, nextFundingTimeShort: now + 12_000,
      expectedNetQuote: 1, executionReadinessBlockers: ["MARGIN_EVIDENCE_MISSING"]}),
    base("PERPETUAL_PERPETUAL_ARBITRAGE_SHADOW_OPPORTUNITY", "perpetual-perpetual-arbitrage", {
      market: "ETHUSDT", longExchange: "bybit", shortExchange: "binance", quantity: 2,
      longEntryVwap: 50, shortEntryVwap: 51, grossDislocationPercent: 2,
      nextFundingTimeLong: now + 10_000, nextFundingTimeShort: now + 12_000,
      expectedNetQuote: 2, executionReadinessBlockers: []}),
    base("DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN", "dynamic-market-making", {
      exchange: "binance", market: "SOLUSDT", quoteQuantity: 3, bidQuotePrice: 20, askQuotePrice: 21,
      modeledNetCapturePercent: 0.1, executionReadinessBlockers: ["QUEUE_POSITION_UNKNOWN"]}),
    base("STATISTICAL_ARBITRAGE_SHADOW_PAIR", "statistical-arbitrage", {
      exchange: "binance", leftMarket: "ETHUSDT", rightMarket: "BTCUSDT", longMarket: "ETHUSDT", shortMarket: "BTCUSDT", longQuantity: 2, shortQuantity: 0.1,
      longEntryVwap: 50, shortEntryVwap: 1000, modeledNetQuote: 3, zScore: 2.5, baselineSpreadMean: 0.2,
      baselineSpreadStandardDeviation: 0.1, hedgeBeta: 1.2,
      nextFundingTimeLong: now + 10_000, nextFundingTimeShort: now + 12_000,
      executionReadinessBlockers: ["POSITION_EVIDENCE_MISSING"]}),
  ];
  for (const signal of fixtures) {
    const plan = compiler.compile(signal, now);
    assert.equal(plan.compilationState, "COMPILED_SHADOW");
    assert.equal(plan.promotionState, "BLOCKED");
    assert.equal(plan.executionHandoffAllowed, false);
    assert.equal(plan.paperExecutionAllowed, false);
    assert.equal(plan.liveExecutionAllowed, false);
    assert.ok(plan.executionReadinessBlockers.includes("CAPITAL_RESERVATION_REQUIRED"));
    assert.equal(plan.settlementPolicy.lifecycleOwner, "CENTRAL_SHARED_ORCHESTRATOR");
    assert.ok(Object.isFrozen(plan));
  }

  assert.throws(() => compiler.compile({...fixtures[0], executionAuthorized: true} as unknown as StrategySignal, now), /non-executable/);
  assert.throws(() => compiler.compile({...fixtures[0], generatedAt: now + 1} as unknown as StrategySignal, now), /current non-expired signal/);
  console.log("CENTRAL STRATEGY EXECUTION PLAN COMPILER TEST PASSED.");
  console.log("All eight strategy signal families compiled into one immutable leg model; Strategy #1 retained its existing owner and no PAPER, LIVE, capital or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
