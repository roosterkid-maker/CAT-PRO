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
      "ARM DYNAMIC-POOL USDT INR500 MAXINR505 ATTEMPTS10 MINUTES180",
    );
    const reducedPhrase =
      StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(9);
    assert.equal(
      reducedPhrase,
      "ARM DYNAMIC-POOL USDT INR500 MAXINR505 ATTEMPTS9 MINUTES180",
    );
    const reducedFilePath = join(directory, "reduced-route-pool.jsonl");
    const reducedService = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      getActionDiagnostics: () => ({
        maximumDailyAttempts: 10,
        attemptsToday: 1,
        blockingAuthorityPresent: false,
      }),
      now: () => NOW,
    }, reducedFilePath);
    assert.deepEqual(
      reducedService.getDiagnostics(NOW).dailyAttemptBudget,
      {
        maximumDailyAttempts: 10,
        attemptsToday: 1,
        remainingDailyAttempts: 9,
        routePoolArmAttempts: 9,
        resetsAt: 1_787_250_600_000,
        resetPolicy: "NEXT_IST_DAY_ONLY",
        liveOffResetsConsumedAttempts: false,
      },
    );
    assert.throws(() => reducedService.arm({
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: phrase,
      durationMinutes: 180,
      maximumAttempts: 10,
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      now: NOW,
    }), /exceeds the remaining Tiny-LIVE daily attempt cap/iu);
    const reducedArm = reducedService.arm({
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: reducedPhrase,
      durationMinutes: 180,
      maximumAttempts: 9,
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      now: NOW,
    });
    assert.equal(reducedArm.maximumAttempts, 9);
    assert.equal(reducedArm.requiredArmPhrase, reducedPhrase);
    assert.equal(
      new StrategyOneTinyLivePreArmService({
        runtimeGateEnabled: () => true,
        getCapitalPerLegInr: () => 500,
        now: () => NOW,
      }, reducedFilePath).getActiveArm(NOW)?.maximumAttempts,
      9,
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

    assert.equal(arm.schemaVersion, "190.0");
    assert.equal(arm.routeScope, "DYNAMIC_POOL");
    assert.equal(arm.routePoolId, STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID);
    assert.equal(arm.capitalPerLegInr, 500);
    assert.equal(arm.maximumCapitalPerLegInr, 505);
    assert.equal(arm.maximumAttempts, 10);
    assert.equal(arm.expiresAt, NOW + 180 * 60_000);
    assert.equal(arm.attemptsUsed, 0);
    assert.equal(arm.automaticFundMovementAllowed, false);

    const restored = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      getActionDiagnostics: () => ({
        maximumDailyAttempts: 10,
        attemptsToday: 0,
        blockingAuthorityPresent: false,
      }),
      now: () => NOW,
    }, filePath);
    assert.equal(restored.getActiveArm(NOW)?.id, arm.id);
    assert.equal(restored.getDiagnostics(NOW).routePool.id, STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID);
    assert.equal(restored.getDiagnostics(NOW).pilotBasket, null);
    assert.equal(service.getDiagnostics(NOW).dailyAttemptBudget.routePoolArmAttempts, 10);

    const belowRoutePoolMinimum = new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () => true,
      getCapitalPerLegInr: () => 500,
      getActionDiagnostics: () => ({
        maximumDailyAttempts: 10,
        attemptsToday: 2,
        blockingAuthorityPresent: false,
      }),
      now: () => NOW,
    }, join(directory, "below-route-pool-minimum.jsonl"));
    assert.deepEqual(
      belowRoutePoolMinimum.getDiagnostics(NOW).dailyAttemptBudget,
      {
        maximumDailyAttempts: 10,
        attemptsToday: 2,
        remainingDailyAttempts: 8,
        routePoolArmAttempts: null,
        resetsAt: 1_787_250_600_000,
        resetPolicy: "NEXT_IST_DAY_ONLY",
        liveOffResetsConsumedAttempts: false,
      },
    );

    verifyRetiredFixedBasketArmIsNotRestored(filePath, directory);
    verifySupersededDynamicPoolArmExpires(filePath, directory);

    await verifyChangingRoutesCanRequestFreshBooks(directory);
    await verifyBookDependentBlocksCanRequestFreshBooks(directory);
    await verifyCompleteCoordinatorReasonsRemainDurable(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V190 dynamic route-pool pre-arm passed: one pool consent, ₹500 target/₹505 hard cap, no per-coin timing approval, exact 9-or-10-attempt/180-minute limits, daily-cap enforcement, changing USDT routes, durable restart recovery, per-attempt freshness and no fund movement authority.",
  );
}

function verifySupersededDynamicPoolArmExpires(
  currentFilePath: string,
  directory: string,
): void {
  const supersededFilePath = join(directory, "superseded-route-pool.jsonl");
  const envelope = JSON.parse(
    readFileSync(currentFilePath, "utf8").trim().split(/\r?\n/u)[0],
  ) as {payload: Record<string, unknown>};

  envelope.payload.schemaVersion = "188.0";
  envelope.payload.requiredArmPhrase =
    "ARM DYNAMIC-POOL USDT INR500 ATTEMPTS10 MINUTES180";
  delete envelope.payload.maximumCapitalPerLegInr;
  writeFileSync(supersededFilePath, `${JSON.stringify(envelope)}\n`, "utf8");

  const restarted = new StrategyOneTinyLivePreArmService({
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    now: () => NOW,
  }, supersededFilePath);

  assert.equal(
    restarted.getActiveArm(NOW),
    null,
    "A pre-₹505 dynamic arm must expire instead of silently inheriting broader capital consent.",
  );
  const [expired] = restarted.getDiagnostics(NOW).records;
  assert.equal(expired?.schemaVersion, "188.0");
  assert.equal(expired?.state, "EXPIRED");
  assert.match(expired?.failureReason ?? "", /predates the ₹505 hard-cap policy/iu);
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

async function verifyCompleteCoordinatorReasonsRemainDurable(
  directory: string,
): Promise<void> {
  const route: StrategyOneTinyLiveBasketRoute = {
    market: "SANDUSDT",
    buyExchange: "bybit",
    sellExchange: "coindcx",
  };
  let clock = NOW + 30_000;
  const candidate = opportunity("durable-last-look-reasons", route, clock);
  const authority = {
    id: "tiny-live-durable-reasons",
    state: "PREVIEWED",
    market: route.market,
    buyExchange: route.buyExchange,
    sellExchange: route.sellExchange,
    capitalPerLegInr: 500,
    maximumCapitalPerLegInr: 505,
    requiredAuthorizationPhrase: "AUTHORIZE tiny-live-durable-reasons",
  };
  const filePath = join(directory, "durable-last-look-reasons.jsonl");
  const dependencies = {
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: () => ({
      maximumDailyAttempts: 10,
      attemptsToday: 0,
      blockingAuthorityPresent: false,
    }),
    getOpportunity: (id: string) => id === candidate.id ? candidate : null,
    previewAction: () => ({
      approvedForAuthorization: true,
      authority,
      preflight: null,
      blockers: [],
    } as never),
    authorizeAction: () => ({id: authority.id, state: "AUTHORIZED"}),
    refreshAuthorizedFinalBooks: async () => ({
      state: "REFRESHED",
      blocker: null,
    } as never),
    execute: async () => ({
      success: false,
      status: "BLOCKED" as const,
      opportunityId: candidate.id,
      market: route.market,
      requestedQuantity: 118,
      buyExchange: route.buyExchange,
      sellExchange: route.sellExchange,
      buyResult: null,
      sellResult: null,
      matchedFilledQuantity: 0,
      unmatchedBuyQuantity: 0,
      unmatchedSellQuantity: 0,
      startedAt: clock,
      completedAt: clock + 1,
      executionTimeMs: 1,
      recoveryRequired: false,
      possibleExposure: false,
      reasons: [
        "Strategy #1 order-time last-look blocked exchange submission.",
        "SELL book exceeded the calibrated dispatch-reserved freshness ceiling.",
        "Post-stress net fell below the immutable 0.30% floor.",
      ],
    }),
    now: () => ++clock,
  };
  const service = new StrategyOneTinyLivePreArmService(dependencies, filePath);

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

  const completed = await service.observeSnapshot({
    generatedAt: clock,
    opportunities: [candidate],
  });
  const attempt = completed?.attempts?.[0];

  assert.equal(completed?.state, "FAILED_SAFE");
  assert.equal(attempt?.reason, "Strategy #1 order-time last-look blocked exchange submission.");
  assert.deepEqual(attempt?.reasons, [
    "Strategy #1 order-time last-look blocked exchange submission.",
    "SELL book exceeded the calibrated dispatch-reserved freshness ceiling.",
    "Post-stress net fell below the immutable 0.30% floor.",
  ]);

  const restarted = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  assert.deepEqual(restarted.getDiagnostics(clock).records[0]?.attempts?.[0]?.reasons, attempt?.reasons);
}

async function verifyBookDependentBlocksCanRequestFreshBooks(
  directory: string,
): Promise<void> {
  const route: StrategyOneTinyLiveBasketRoute = {
    market: "SANDUSDT",
    buyExchange: "bybit",
    sellExchange: "coindcx",
  };
  let clock = NOW + 20_000;
  let refreshCalls = 0;
  const candidate = opportunity("book-dependent-stale", route, clock);
  const service = new StrategyOneTinyLivePreArmService({
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: () => ({
      maximumDailyAttempts: 10,
      attemptsToday: 0,
      blockingAuthorityPresent: false,
    }),
    previewAction: (opportunityId) => bookDependentBlockedPreview(opportunityId, route),
    refreshActionCandidate: async () => {
      refreshCalls += 1;
      return {state: "BLOCKED", opportunity: null, blocker: "Fixture remains blocked."} as never;
    },
    now: () => ++clock,
  }, join(directory, "book-dependent-refresh.jsonl"));

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
  assert.equal(await service.observeSnapshot({generatedAt: clock, opportunities: [candidate]}), null);
  assert.equal(refreshCalls, 1,
    "Fresh balances plus a rounding/minimum block may request one bounded public refresh before full preflight reruns.");

  let immutableBlockRefreshCalls = 0;
  const immutableBlocked = new StrategyOneTinyLivePreArmService({
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: () => ({
      maximumDailyAttempts: 10,
      attemptsToday: 0,
      blockingAuthorityPresent: false,
    }),
    previewAction: (opportunityId) =>
      bookDependentBlockedPreview(opportunityId, route, true),
    refreshActionCandidate: async () => {
      immutableBlockRefreshCalls += 1;
      throw new Error("Immutable blockers must prevent refresh.");
    },
    now: () => ++clock,
  }, join(directory, "immutable-block-no-refresh.jsonl"));
  immutableBlocked.arm({
    market: "DYNAMIC_POOL",
    buyExchange: "coindcx",
    sellExchange: "binance",
    confirmation: StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(),
    durationMinutes: 180,
    maximumAttempts: 10,
    routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
    now: ++clock,
  });
  assert.equal(await immutableBlocked.observeSnapshot({generatedAt: clock, opportunities: [candidate]}), null);
  assert.equal(immutableBlockRefreshCalls, 0,
    "A missing immutable timing gate must prevent the public refresh rescue.");
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
          funding: refreshableFundingFixture("NORMALIZED"),
        },
      },
    },
  } as never;
}

function bookDependentBlockedPreview(
  opportunityId: string,
  route: StrategyOneTinyLiveBasketRoute,
  immutableTimingBlocked = false,
) {
  return {
    approvedForAuthorization: false,
    authority: null,
    blockers: ["CURRENT_DISPATCH_RESERVED_FRESHNESS", "FRESH_TWO_LEG_FUNDING_AND_RULES"],
    preflight: {
      preview: {
        selected: {
          opportunityId,
          market: route.market,
          buyExchange: route.buyExchange,
          sellExchange: route.sellExchange,
          checks: [
            {key: "CURRENT_DISPATCH_RESERVED_FRESHNESS", state: "BLOCKED", reasons: ["Stale fixture."]},
            {key: "FRESH_TWO_LEG_FUNDING_AND_RULES", state: "BLOCKED", reasons: ["Rounded notional is below minimum."]},
            {key: "POST_STRESS_DEPTH_AND_ECONOMICS", state: "BLOCKED", reasons: ["Exact quantity is unavailable."]},
            ...(immutableTimingBlocked
              ? [{key: "PILOT_TIMING_HEADROOM", state: "BLOCKED", reasons: ["Timing evidence is incomplete."]}]
              : []),
          ],
          funding: refreshableFundingFixture("BLOCKED"),
        },
      },
    },
  } as never;
}

function refreshableFundingFixture(
  state: "NORMALIZED" | "BLOCKED",
) {
  return {
    fundingBoundary: "AUTHENTICATED_LIVE_READINESS",
    buyFunding: {sufficient: true},
    sellFunding: {sufficient: true},
    quantityNeverIncreased: true,
    quantityNormalization: {
      state,
      incrementEvidenceComplete: true,
    },
  };
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
