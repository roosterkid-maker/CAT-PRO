import assert from "node:assert/strict";

import {
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY,
  isStrategyOneTinyLiveDynamicRoute,
} from "../StrategyOneTinyLiveBasketPolicy";

function main(): void {
  const policy = STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY;

  assert.equal(policy.schemaVersion, "190.0");
  assert.equal(policy.id, "strategy-one-dynamic-usdt-route-pool-v1");
  assert.deepEqual(policy.quoteAssets, ["USDT"]);
  assert.deepEqual(policy.venues, ["binance", "coindcx", "bybit"]);
  assert.deepEqual(policy.markets, []);
  assert.deepEqual(policy.routes, []);
  assert.deepEqual(policy.inventoryTargets, []);
  assert.equal(policy.capitalPerLegInr, 500);
  assert.equal(policy.maximumCapitalPerLegInr, 1_000);
  assert.equal(policy.minimumOrderCushionInr, 500);
  assert.equal(
    policy.timingQualification,
    "AUTOMATIC_VENUE_DIRECTION_POOL_EVIDENCE",
  );
  assert.equal(policy.maximumAttempts, 10);
  assert.equal(policy.durationMinutes, 180);
  assert.deepEqual(policy.excludedVenues, ["coinswitch", "unocoin", "zebpay"]);
  assert.equal(policy.automaticTransfersAllowed, false);
  assert.equal(policy.withdrawalsAllowed, false);
  assert.equal(policy.liveOrderSubmissionAuthorized, false);

  assert.equal(isStrategyOneTinyLiveDynamicRoute({
    market: "coti/usdt",
    buyExchange: " COINDCX ",
    sellExchange: "BINANCE",
  }), true);
  assert.equal(isStrategyOneTinyLiveDynamicRoute({
    market: "SANDUSDT",
    buyExchange: "bybit",
    sellExchange: "binance",
  }), true);
  assert.equal(isStrategyOneTinyLiveDynamicRoute({
    market: "BBUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  }), true, "Two-character base assets must remain eligible in the dynamic pool.");
  assert.equal(isStrategyOneTinyLiveDynamicRoute({
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "binance",
  }), false);
  assert.equal(isStrategyOneTinyLiveDynamicRoute({
    market: "BTCINR",
    buyExchange: "coindcx",
    sellExchange: "binance",
  }), false);
  assert.equal(isStrategyOneTinyLiveDynamicRoute({
    market: "BTCUSDT",
    buyExchange: "zebpay",
    sellExchange: "binance",
  }), false);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.routes), true);
  assert.equal(Object.isFrozen(policy.inventoryTargets), true);

  console.log(
    "V190 dynamic Tiny-LIVE route-pool policy passed: current USDT routes across three audited venues, ₹500 target/₹1000 hard cap, venue-direction timing, 10 attempts/180 minutes, excluded venues, and no transfer/withdraw/order authority.",
  );
}

try {
  main();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
