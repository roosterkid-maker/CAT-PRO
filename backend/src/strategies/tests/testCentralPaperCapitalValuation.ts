import assert from "node:assert/strict";

import type {
  CentralStrategyExecutionPlan,
} from "../models/CentralStrategyExecutionPlan";

import {
  CentralPaperCapitalValuationService,
  type CentralPaperCapitalValuationPort,
} from "../services/CentralPaperCapitalValuationService";

const now = 1_780_400_000_000;

const port: CentralPaperCapitalValuationPort = {
  getSpotAsset: (_exchange, market) => market === "BTCUSDT" ? {baseAsset: "BTC", quoteAsset: "USDT"} : null,
  getPerpetualSettleAsset: () => "USDT",
  getConversionBooks: () => [
    {baseAsset: "BTC", quoteAsset: "USDT", book: {exchange: "binance", market: "BTCUSDT", timestamp: now,
      bids: [{price: 100, quantity: 10}], asks: [{price: 101, quantity: 10}]}},
    {baseAsset: "USDT", quoteAsset: "INR", book: {exchange: "coindcx", market: "USDTINR", timestamp: now,
      bids: [{price: 85, quantity: 10_000}], asks: [{price: 86, quantity: 10_000}]}},
  ],
};

function fundingPlan(): CentralStrategyExecutionPlan {
  return {id: "capital-funding", pattern: "PARALLEL_TWO_LEG", expiresAt: now + 10_000,
    settlementPolicy: {kind: "FUNDING_CAPTURE_THEN_EXIT"}, legs: [
      {id: "long", product: "PERPETUAL", exchange: "binance", market: "BTCUSDT", quantity: 1, referencePrice: 100},
      {id: "short", product: "PERPETUAL", exchange: "bybit", market: "BTCUSDT", quantity: 1, referencePrice: 100},
    ]} as unknown as CentralStrategyExecutionPlan;
}

function main(): void {
  const service = new CentralPaperCapitalValuationService(port, 15_000, 2);
  const parallel = service.value(fundingPlan(), now);
  assert.equal(parallel.amount, 17_000);
  assert.deepEqual(parallel.sourceRequirements, [{asset: "USDT", amount: 200}]);
  assert.equal(parallel.conversions[0]?.path[0]?.market, "USDTINR");

  const quoteCapital = service.convertInrToAsset("USDT", 500, "strategy-one-reference", now);
  assert.ok(quoteCapital);
  assert.equal(quoteCapital.targetAsset, "USDT");
  assert.equal(Number(quoteCapital.targetQuantity.toFixed(8)), Number((500 / 86).toFixed(8)));

  const accountCapital = service.convertAssetToInr("USDT", 1, "strategy-one-accounting", now);
  assert.ok(accountCapital);
  assert.equal(accountCapital.targetAsset, "INR");
  assert.equal(accountCapital.targetQuantity, 85);

  const detourService = new CentralPaperCapitalValuationService({...port, getConversionBooks: () => [
    ...port.getConversionBooks(now),
    {baseAsset: "USDC", quoteAsset: "INR", book: {exchange: "unocoin", market: "USDCINR", timestamp: now,
      bids: [{price: 79, quantity: 10_000}], asks: [{price: 80, quantity: 10_000}]}},
    {baseAsset: "USDC", quoteAsset: "USDT", book: {exchange: "binance", market: "USDCUSDT", timestamp: now,
      bids: [{price: 1.2, quantity: 10_000}], asks: [{price: 1.21, quantity: 10_000}]}},
  ]});
  const directPreferred = detourService.convertInrToAsset("USDT", 500, "strategy-one-direct", now);
  assert.ok(directPreferred);
  assert.deepEqual(directPreferred.path.map((item) => item.market), ["USDTINR"]);

  const triangle = service.value({...fundingPlan(), id: "capital-triangle", settlementPolicy: {
    kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "BTC",
    initialQuantity: 1, modeledFinalQuantity: 1.01, flows: [],
  }} as CentralStrategyExecutionPlan, now);
  assert.equal(triangle.amount, 8_500);
  assert.deepEqual(triangle.conversions[0]?.path.map((item) => item.market), ["BTCUSDT", "USDTINR"]);
  assert.equal(triangle.orderSubmissionAllowed, false);

  const thinPort: CentralPaperCapitalValuationPort = {...port, getConversionBooks: () => [{baseAsset: "USDT", quoteAsset: "INR",
    book: {exchange: "coindcx", market: "USDTINR", timestamp: now, bids: [{price: 85, quantity: 1}], asks: [{price: 86, quantity: 1}]}}]};
  const blocked = new CentralPaperCapitalValuationService(thinPort).value(fundingPlan(), now);
  assert.equal(blocked.amount, null);
  assert.ok(blocked.blockers.includes("INR_CONVERSION_EVIDENCE_UNAVAILABLE:USDT"));
  assert.equal(blocked.balanceMutationPerformed, false);

  console.log("CENTRAL PAPER CAPITAL VALUATION TEST PASSED.");
  console.log("Parallel requirements were summed, sequential capital was converted through bounded fresh full-depth paths, and missing INR liquidity failed closed without balance, LIVE or order action.");
}

main();
