import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
  type StrategyOneTinyLiveBasketRoute,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";
import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";

import {
  StrategyOneTinyLivePreArmService,
} from "../tiny-live/StrategyOneTinyLivePreArmService";

const NOW = 1_787_226_000_000;

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-v188-route-pool-arm-"));
  const filePath = join(directory, "route-pool.jsonl");

  try {
    const service = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      getActionDiagnostics: () => ({
        maximumDailyAttempts: 10,
        attemptsToday: 0,
        blockingAuthorityPresent: false,
      }),
      now: () => NOW,
    }, filePath);
    const phrase = StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase();

    assert.equal(
      phrase,
      "ARM DYNAMIC-POOL USDT INR500 ATTEMPTS10 MINUTES180",
    );
    assert.throws(() => service.arm({
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: "wrong",
      durationMinutes: 180,
      maximumAttempts: 10,
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      now: NOW,
    }), /Exact route-pool confirmation/iu);

    const arm = service.arm({
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: phrase,
      durationMinutes: 180,
      maximumAttempts: 10,
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      now: NOW,
    });

    assert.equal(arm.schemaVersion, "188.0");
    assert.equal(arm.routeScope, "DYNAMIC_POOL");
    assert.equal(arm.routePoolId, STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID);
    assert.equal(arm.capitalPerLegInr, 500);
    assert.equal(arm.maximumAttempts, 10);
    assert.equal(arm.expiresAt, NOW + 180 * 60_000);
    assert.equal(arm.attemptsUsed, 0);
    assert.equal(arm.automaticFundMovementAllowed, false);

    const restored = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      now: () => NOW,
    }, filePath);
    assert.equal(restored.getActiveArm(NOW)?.id, arm.id);
    assert.equal(restored.getDiagnostics(NOW).routePool.id, STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID);
    assert.equal(restored.getDiagnostics(NOW).pilotBasket, null);

    verifyRetiredFixedBasketArmIsNotRestored(filePath, directory);

    await verifyChangingRoutesCanRequestFreshBooks(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V188 dynamic route-pool pre-arm passed: exact 10-attempt/180-minute consent, changing USDT routes, durable restart recovery, per-attempt freshness and no fund movement authority.",
  );
}

function verifyRetiredFixedBasketArmIsNotRestored(
  currentFilePath: string,
  directory: string,
): void {
  const retiredFilePath = join(directory, "retired-fixed-basket.jsonl");
  const envelope = JSON.parse(
    readFileSync(currentFilePath, "utf8").trim().split(/\r?\n/u)[0],
  ) as {payload: Record<string, unknown>};

  envelope.payload.schemaVersion = "183.0";
  envelope.payload.routeScope = "PILOT_BASKET";
  envelope.payload.pilotBasketId = "strategy-one-seven-coin-inventory-v1";
  delete envelope.payload.routePoolId;
  writeFileSync(retiredFilePath, `${JSON.stringify(envelope)}\n`, "utf8");

  const restarted = new StrategyOneTinyLivePreArmService({
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    now: () => NOW,
  }, retiredFilePath);

  assert.equal(
    restarted.getActiveArm(NOW),
    null,
    "A retired fixed-basket V183 arm must never be restored after restart.",
  );
  assert.equal(restarted.getDiagnostics(NOW).records.length, 0);
}

async function verifyChangingRoutesCanRequestFreshBooks(
  directory: string,
): Promise<void> {
  const routes: readonly StrategyOneTinyLiveBasketRoute[] = [
    {market: "COTIUSDT", buyExchange: "coindcx", sellExchange: "binance"},
    {market: "SANDUSDT", buyExchange: "bybit", sellExchange: "binance"},
    {market: "BTCUSDT", buyExchange: "binance", sellExchange: "bybit"},
  ];

  for (const [index, route] of routes.entries()) {
    let clock = NOW + 10_000 + index * 1_000;
    let refreshCalls = 0;
    const candidate = opportunity(`basket-${index}-stale`, route, clock);
    const refreshed = opportunity(`basket-${index}-refreshed`, route, clock + 20);
    const service = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      getActionDiagnostics: () => ({
        maximumDailyAttempts: 10,
        attemptsToday: 0,
        blockingAuthorityPresent: false,
      }),
      previewAction: (opportunityId) => freshnessBlockedPreview(opportunityId, route),
      refreshActionCandidate: async (input) => {
        refreshCalls += 1;
        assert.deepEqual(input, route);
        return {
          state: "REFRESHED",
          opportunity: refreshed,
          blocker: null,
        } as never;
      },
      now: () => ++clock,
    }, join(directory, `dynamic-route-${index}.jsonl`));

    service.arm({
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(),
      durationMinutes: 180,
      maximumAttempts: 10,
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      now: ++clock,
    });

    assert.equal(await service.observeSnapshot({
      generatedAt: clock,
      opportunities: [candidate],
    }), null);
    assert.equal(
      refreshCalls,
      1,
      `${route.market} ${route.buyExchange}->${route.sellExchange} must receive the stale-only parallel refresh rescue.`,
    );
    assert.deepEqual(service.getDiagnostics(clock).pipelineTelemetry, {
      candidatesEvaluated: 1,
      preflightBlocks: 1,
      refreshesRequested: 1,
      refreshesRecovered: 1,
      coordinatorStarts: 0,
    });
  }
}

function freshnessBlockedPreview(
  opportunityId: string,
  route: StrategyOneTinyLiveBasketRoute,
) {
  return {
    approvedForAuthorization: false,
    authority: null,
    blockers: ["CURRENT_DISPATCH_RESERVED_FRESHNESS"],
    preflight: {
      preview: {
        selected: {
          opportunityId,
          market: route.market,
          buyExchange: route.buyExchange,
          sellExchange: route.sellExchange,
          checks: [{
            key: "CURRENT_DISPATCH_RESERVED_FRESHNESS",
            state: "BLOCKED",
            reasons: ["Freshness-only fixture."],
          }],
        },
      },
    },
  } as never;
}

function opportunity(
  id: string,
  route: StrategyOneTinyLiveBasketRoute,
  timestamp: number,
): ArbitrageOpportunity {
  return {
    id,
    pair: {
      market: route.market,
      buy: {
        exchange: route.buyExchange,
        market: route.market,
        lastPrice: 100,
        bestBidPrice: 99.9,
        bestBidQty: 10,
        bestAskPrice: 100,
        bestAskQty: 10,
        spread: 0.1,
        timestamp,
        source: "orderBook",
        executable: true,
      },
      sell: {
        exchange: route.sellExchange,
        market: route.market,
        lastPrice: 101,
        bestBidPrice: 101,
        bestBidQty: 10,
        bestAskPrice: 101.1,
        bestAskQty: 10,
        spread: 0.1,
        timestamp,
        source: "orderBook",
        executable: true,
      },
    },
    requestedCapitalInr: 500,
    quoteAsset: "USDT",
    requestedQuoteCapital: 5,
    executableQuoteCapital: 5,
    executableCapitalInr: 500,
    buyPrice: 100,
    sellPrice: 101,
    buyAvailableQty: 10,
    sellAvailableQty: 10,
    requiredQty: 0.05,
    availableExecutableQty: 10,
    executableQty: 0.05,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 100,
    decision: "EXECUTE",
    analysisSummary: [],
    rawSpread: 1,
    rawSpreadPercent: 1,
    estimatedFees: 0.2,
    netProfit: 0.8,
    netProfitPercent: 0.8,
    usedLastPriceFallback: false,
    quotesAreFresh: false,
    score: 100,
    timestamp,
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
