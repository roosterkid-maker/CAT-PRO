import assert from "node:assert/strict";
import {createStrategyRuntimeOperatorConfiguration} from "../config/StrategyRuntimeOperatorConfiguration";

async function main(): Promise<void> {
  const closed = createStrategyRuntimeOperatorConfiguration({});
  assert.equal(closed.shadowEnabledStrategies.length, 0);
  assert.equal(closed.centralPaper.enabled, false);
  assert.equal(Object.values(closed.controllerEnabled).some(Boolean), false);

  const configured = createStrategyRuntimeOperatorConfiguration({
    CAT_PRO_SHADOW_STRATEGIES: "cross-exchange-market-making,triangular-arbitrage,funding-rate-arbitrage,statistical-arbitrage,unknown",
    CAT_PRO_XEMM_MAKER_EXCHANGE: "binance", CAT_PRO_XEMM_HEDGE_EXCHANGE: "bybit", CAT_PRO_XEMM_MARKETS: "BTCUSDT,ETHUSDT",
    CAT_PRO_XEMM_QUANTITY: "0.01", CAT_PRO_XEMM_MINIMUM_RETAINED_EDGE_PERCENT: "0.05",
    CAT_PRO_CENTRAL_PAPER_STRATEGIES: "triangular-arbitrage,funding-rate-arbitrage",
    CAT_PRO_CENTRAL_PAPER_CONFIRMATION: "ENABLE_CENTRAL_PAPER_V1",
  });
  assert.equal(configured.controllerEnabled["cross-exchange-market-making"], true);
  assert.equal(configured.controllerEnabled["triangular-arbitrage"], true);
  assert.equal(configured.xemm.enabled, true);
  assert.deepEqual(configured.xemm.marketAllowlist, ["BTCUSDT", "ETHUSDT"]);
  assert.deepEqual(configured.xemm.venuePairs, [{makerExchange: "binance", hedgeExchange: "bybit"}]);
  assert.deepEqual(configured.xemm.routeStability,
    {minimumConsecutivePasses: 3, minimumDwellMs: 2_000, failoverCooldownMs: 5_000});
  assert.equal(configured.centralPaper.enabled, true);
  assert.ok(configured.blockers.some((item) => item.includes("UNKNOWN_STRATEGY")));

  const incomplete = createStrategyRuntimeOperatorConfiguration({CAT_PRO_SHADOW_STRATEGIES: "cross-exchange-market-making",
    CAT_PRO_CENTRAL_PAPER_STRATEGIES: "funding-rate-arbitrage", CAT_PRO_CENTRAL_PAPER_CONFIRMATION: "yes"});
  assert.equal(incomplete.controllerEnabled["cross-exchange-market-making"], false);
  assert.equal(incomplete.centralPaper.enabled, false);
  assert.ok(incomplete.blockers.includes("XEMM_OPERATOR_CONFIGURATION_INCOMPLETE"));
  assert.ok(incomplete.blockers.includes("CENTRAL_PAPER_CONFIRMATION_MISSING"));
  assert.equal(incomplete.safety.liveExecutionAllowed, false);

  const failover = createStrategyRuntimeOperatorConfiguration({
    CAT_PRO_SHADOW_STRATEGIES: "cross-exchange-market-making",
    CAT_PRO_XEMM_VENUE_PAIRS: "coinswitch>binance,binance>bybit,coinswitch>binance",
    CAT_PRO_XEMM_MARKETS: "BTCUSDT",
    CAT_PRO_XEMM_QUANTITY: "0.001",
    CAT_PRO_XEMM_MINIMUM_RETAINED_EDGE_PERCENT: "0.05",
    CAT_PRO_XEMM_ROUTE_MINIMUM_CONSECUTIVE_PASSES: "4",
    CAT_PRO_XEMM_ROUTE_MINIMUM_DWELL_MS: "3000",
    CAT_PRO_XEMM_ROUTE_FAILOVER_COOLDOWN_MS: "7000",
  });
  assert.equal(failover.controllerEnabled["cross-exchange-market-making"], true);
  assert.equal(failover.xemm.makerExchange, "coinswitch");
  assert.equal(failover.xemm.hedgeExchange, "binance");
  assert.deepEqual(failover.xemm.venuePairs, [
    {makerExchange: "coinswitch", hedgeExchange: "binance"},
    {makerExchange: "binance", hedgeExchange: "bybit"},
  ]);
  assert.deepEqual(failover.xemm.routeStability,
    {minimumConsecutivePasses: 4, minimumDwellMs: 3_000, failoverCooldownMs: 7_000});

  const invalidFailover = createStrategyRuntimeOperatorConfiguration({
    CAT_PRO_SHADOW_STRATEGIES: "cross-exchange-market-making",
    CAT_PRO_XEMM_VENUE_PAIRS: "bybit>bybit,unknown>binance",
    CAT_PRO_XEMM_MARKETS: "BTCUSDT",
    CAT_PRO_XEMM_QUANTITY: "0.001",
    CAT_PRO_XEMM_MINIMUM_RETAINED_EDGE_PERCENT: "0.05",
  });
  assert.equal(invalidFailover.controllerEnabled["cross-exchange-market-making"], false);
  assert.equal(invalidFailover.blockers.filter((item) => item.startsWith("CAT_PRO_XEMM_VENUE_PAIRS_INVALID")).length, 2);
  assert.ok(invalidFailover.blockers.includes("XEMM_OPERATOR_CONFIGURATION_INCOMPLETE"));

  const invalidStability = createStrategyRuntimeOperatorConfiguration({
    CAT_PRO_SHADOW_STRATEGIES: "cross-exchange-market-making",
    CAT_PRO_XEMM_VENUE_PAIRS: "bybit>coindcx",
    CAT_PRO_XEMM_MARKETS: "BTCUSDT",
    CAT_PRO_XEMM_QUANTITY: "0.001",
    CAT_PRO_XEMM_MINIMUM_RETAINED_EDGE_PERCENT: "0.05",
    CAT_PRO_XEMM_ROUTE_MINIMUM_CONSECUTIVE_PASSES: "0",
  });
  assert.equal(invalidStability.controllerEnabled["cross-exchange-market-making"], false);
  assert.ok(invalidStability.blockers.some((item) => item.startsWith("CAT_PRO_XEMM_ROUTE_MINIMUM_CONSECUTIVE_PASSES_INVALID")));

  console.log("STRATEGY RUNTIME OPERATOR CONFIGURATION TEST PASSED.");
  console.log("Strategies #2-#8 and central PAPER require explicit validated environment opt-ins; unknown/incomplete values fail closed and no LIVE control is exposed.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
