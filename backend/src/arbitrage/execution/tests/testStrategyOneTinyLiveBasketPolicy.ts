import assert from "node:assert/strict";

import {
  STRATEGY_ONE_TINY_LIVE_BASKET_POLICY,
  isStrategyOneTinyLiveBasketRoute,
} from "../StrategyOneTinyLiveBasketPolicy";

function main(): void {
  const policy = STRATEGY_ONE_TINY_LIVE_BASKET_POLICY;

  assert.equal(policy.id, "strategy-one-seven-coin-inventory-v1");
  assert.deepEqual(policy.markets, [
    "COTIUSDT",
    "BBUSDT",
    "HEMIUSDT",
    "TREEUSDT",
    "NEXOUSDT",
    "PYBOBOUSDT",
    "GPSUSDT",
  ]);
  assert.deepEqual(policy.inventoryTargets, [
    {exchange: "binance", asset: "COTI", targetNotionalInr: 1_000},
    {exchange: "binance", asset: "BB", targetNotionalInr: 500},
    {exchange: "binance", asset: "HEMI", targetNotionalInr: 500},
    {exchange: "coindcx", asset: "BB", targetNotionalInr: 500},
    {exchange: "coindcx", asset: "TREE", targetNotionalInr: 500},
    {exchange: "coindcx", asset: "HEMI", targetNotionalInr: 500},
    {exchange: "coindcx", asset: "NEXO", targetNotionalInr: 500},
    {exchange: "bybit", asset: "PYBOBO", targetNotionalInr: 500},
    {exchange: "bybit", asset: "GPS", targetNotionalInr: 500},
  ]);
  assert.equal(
    policy.inventoryTargets.reduce((total, target) => total + target.targetNotionalInr, 0),
    5_000,
  );
  assert.equal(policy.routes.length, 11);
  assert.equal(policy.capitalPerLegInr, 500);
  assert.equal(policy.maximumAttempts, 10);
  assert.equal(policy.durationMinutes, 180);
  assert.deepEqual(policy.excludedVenues, ["coinswitch", "unocoin", "zebpay"]);
  assert.equal(policy.automaticTransfersAllowed, false);
  assert.equal(policy.withdrawalsAllowed, false);
  assert.equal(policy.liveOrderSubmissionAuthorized, false);

  for (const route of policy.routes) {
    assert.equal(isStrategyOneTinyLiveBasketRoute(route), true);
  }

  assert.equal(isStrategyOneTinyLiveBasketRoute({
    market: "coti/usdt",
    buyExchange: " COINDCX ",
    sellExchange: "BINANCE",
  }), true);
  assert.equal(isStrategyOneTinyLiveBasketRoute({
    market: "COTIUSDT",
    buyExchange: "binance",
    sellExchange: "coindcx",
  }), false);
  assert.equal(isStrategyOneTinyLiveBasketRoute({
    market: "BTCUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  }), false);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.routes), true);
  assert.equal(Object.isFrozen(policy.inventoryTargets), true);

  console.log(
    "V183 seven-coin Tiny-LIVE basket policy passed: exact ₹5,000 sell inventory, 11 immutable route directions, ₹500/leg, 10 attempts/180 minutes, excluded venues, and no transfer/withdraw/order authority.",
  );
}

try {
  main();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
