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
      "ARM DYNAMIC-POOL USDT INR500 MAXINR1000 MINORDER-STEPS ATTEMPTS10 MINUTES180",
    );
    const reducedPhrase =
      StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(9);
    assert.equal(
      reducedPhrase,
      "ARM DYNAMIC-POOL USDT INR500 MAXINR1000 MINORDER-STEPS ATTEMPTS9 MINUTES180",
    );
    const continuationPhrase =
      StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(8);
    assert.equal(
      continuationPhrase,
      "ARM DYNAMIC-POOL USDT INR500 MAXINR1000 MINORDER-STEPS ATTEMPTS8 MINUTES180",
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
    assert.equal(arm.maximumCapitalPerLegInr, 1_000);
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
    assert.equal(restored.getDiagnostics(NOW).limits.maximumCapitalPerLegInr, 1_000);
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
        routePoolArmAttempts: 8,
        resetsAt: 1_787_250_600_000,
        resetPolicy: "NEXT_IST_DAY_ONLY",
        liveOffResetsConsumedAttempts: false,
      },
    );
    const continuationArm = belowRoutePoolMinimum.arm({
      market: "DYNAMIC_POOL",
      buyExchange: "coindcx",
      sellExchange: "binance",
      confirmation: continuationPhrase,
      durationMinutes: 180,
      maximumAttempts: 8,
      routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
      now: NOW,
    });
    assert.equal(continuationArm.maximumAttempts, 8);
    assert.equal(continuationArm.attemptsUsed, 0);

    verifyRetiredFixedBasketArmIsNotRestored(filePath, directory);
    verifySupersededDynamicPoolArmExpires(filePath, directory);
    verifyPriorMinimumOrderConsentExpires(filePath, directory);

    await verifyChangingRoutesCanRequestFreshBooks(directory);
    await verifyOnlyStaleRouteLegIsRequested(directory);
    await verifyBookDependentBlocksCanRequestFreshBooks(directory);
    await verifyPreflightWorkIsBoundedAndRouteFair(directory);
    await verifyHistoryMismatchesDoNotHideQualifiedRoute(directory);
    await verifyCompleteCoordinatorReasonsRemainDurable(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V190 dynamic route-pool pre-arm passed: one pool consent, ₹500 target/₹1000 hard cap, no per-coin timing approval, remaining-budget 1–10-attempt/180-minute limits, daily-cap continuation after failed-safe disarm, changing USDT routes, durable restart recovery, per-attempt freshness and no fund movement authority.",
  );
}

async function verifyPreflightWorkIsBoundedAndRouteFair(
  directory: string,
): Promise<void> {
  const routes: readonly StrategyOneTinyLiveBasketRoute[] = [
    {market: "COTIUSDT", buyExchange: "coindcx", sellExchange: "binance"},
    {market: "SANDUSDT", buyExchange: "bybit", sellExchange: "binance"},
    {market: "BTCUSDT", buyExchange: "binance", sellExchange: "bybit"},
  ];
  let clock = NOW + 40_000;
  const evaluated: string[] = [];
  const candidates = routes.map((route, index) => ({
    ...opportunity(`bounded-${index}`, route, clock),
    netProfitPercent: 1 - index * 0.1,
  }));
  const lowerDuplicate = {
    ...opportunity("bounded-duplicate", routes[0], clock),
    netProfitPercent: 0.31,
  };
  const service = new StrategyOneTinyLivePreArmService({
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: () => ({
      maximumDailyAttempts: 10,
      attemptsToday: 0,
      blockingAuthorityPresent: false,
    }),
    previewAction: (opportunityId) => {
      evaluated.push(opportunityId);
      const candidate = candidates.find((item) => item.id === opportunityId) ??
        lowerDuplicate;
      const route = {
        market: candidate.pair.market,
        buyExchange: candidate.pair.buy.exchange,
        sellExchange: candidate.pair.sell.exchange,
      } as StrategyOneTinyLiveBasketRoute;
      return bookDependentBlockedPreview(opportunityId, route, true);
    },
    now: () => clock,
  }, join(directory, "bounded-fair-preflight.jsonl"));

  service.arm({
    market: "DYNAMIC_POOL",
    buyExchange: "coindcx",
    sellExchange: "binance",
    confirmation: StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(),
    durationMinutes: 180,
    maximumAttempts: 10,
    routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
    now: clock,
  });

  const snapshot = {
    generatedAt: clock,
    opportunities: [...candidates, lowerDuplicate],
  };

  assert.equal(await service.observeSnapshot(snapshot), null);
  assert.deepEqual(evaluated, ["bounded-0"],
    "One snapshot may run at most one full exact-route preflight; a duplicate route is coalesced to its highest-net candidate.");

  assert.equal(await service.observeSnapshot(snapshot), null);
  assert.deepEqual(evaluated, ["bounded-0"],
    "No second route may start inside the post-evaluation cooldown.");

  clock += 251;
  assert.equal(await service.observeSnapshot(snapshot), null);
  clock += 251;
  assert.equal(await service.observeSnapshot(snapshot), null);
  assert.deepEqual(evaluated, ["bounded-0", "bounded-1", "bounded-2"],
    "Repeated snapshots must rotate across distinct dynamic routes instead of starving lower-ranked qualified coins.");
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
    "A pre-₹1000 dynamic arm must expire instead of silently inheriting broader capital consent.",
  );
  const [expired] = restarted.getDiagnostics(NOW).records;
  assert.equal(expired?.schemaVersion, "188.0");
  assert.equal(expired?.state, "EXPIRED");
  assert.match(
    expired?.failureReason ?? "",
    /predates the current minimum-order normalization and ₹1000 hard-cap policy/iu,
  );
}

async function verifyHistoryMismatchesDoNotHideQualifiedRoute(
  directory: string,
): Promise<void> {
  const routes: readonly StrategyOneTinyLiveBasketRoute[] = [
    {market: "NOHISTORY1USDT", buyExchange: "coindcx", sellExchange: "binance"},
    {market: "NOHISTORY2USDT", buyExchange: "bybit", sellExchange: "coindcx"},
    {market: "TUTUSDT", buyExchange: "coindcx", sellExchange: "binance"},
  ];
  const clock = NOW + 45_000;
  const evaluated: string[] = [];
  const candidates = routes.map((route, index) => ({
    ...opportunity(`history-screen-${index}`, route, clock),
    netProfitPercent: 1 - index * 0.1,
  }));
  const service = new StrategyOneTinyLivePreArmService({
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: () => ({
      maximumDailyAttempts: 10,
      attemptsToday: 0,
      blockingAuthorityPresent: false,
    }),
    previewAction: (opportunityId) => {
      evaluated.push(opportunityId);
      const index = candidates.findIndex((item) => item.id === opportunityId);

      if (index < 2) {
        return historicalMismatchPreview();
      }

      return bookDependentBlockedPreview(opportunityId, routes[2], true);
    },
    now: () => clock,
  }, join(directory, "history-screening.jsonl"));

  service.arm({
    market: "DYNAMIC_POOL",
    buyExchange: "coindcx",
    sellExchange: "binance",
    confirmation: StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(),
    durationMinutes: 180,
    maximumAttempts: 10,
    routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
    now: clock,
  });

  assert.equal(await service.observeSnapshot({
    generatedAt: clock,
    opportunities: candidates,
  }), null);
  assert.deepEqual(
    evaluated,
    candidates.map((item) => item.id),
    "History-only misses must be skipped inside one snapshot so a lower-net qualified route is not hidden.",
  );
  assert.deepEqual(service.getDiagnostics(clock).pipelineTelemetry, {
    candidatesEvaluated: 3,
    preflightBlocks: 1,
    historicalMismatchesSkipped: 2,
    refreshesRequested: 0,
    refreshesRecovered: 0,
    coordinatorStarts: 0,
  });
}

function historicalMismatchPreview() {
  return {
    approvedForAuthorization: false,
    authority: null,
    blockers: [
      "A current audited-lane opportunity exists, but it has no matching route with sufficient credible historical evidence.",
    ],
    preflight: {
      preview: {
        state: "WAITING_FOR_HISTORICAL_MATCH",
        selected: null,
      },
    },
  } as never;
}

function verifyPriorMinimumOrderConsentExpires(
  currentFilePath: string,
  directory: string,
): void {
  const priorConsentFilePath = join(directory, "prior-minimum-order-consent.jsonl");
  const envelope = JSON.parse(
    readFileSync(currentFilePath, "utf8").trim().split(/\r?\n/u)[0],
  ) as {payload: Record<string, unknown>};

  envelope.payload.requiredArmPhrase =
    "ARM DYNAMIC-POOL USDT INR500 MAXINR1000 ATTEMPTS10 MINUTES180";
  writeFileSync(priorConsentFilePath, `${JSON.stringify(envelope)}\n`, "utf8");

  const restarted = new StrategyOneTinyLivePreArmService({
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    now: () => NOW,
  }, priorConsentFilePath);

  assert.equal(
    restarted.getActiveArm(NOW),
    null,
    "A one-step-only arm must expire instead of inheriting multi-step minimum-order consent.",
  );
  const [expired] = restarted.getDiagnostics(NOW).records;
  assert.equal(expired?.schemaVersion, "190.0");
  assert.equal(expired?.state, "EXPIRED");
  assert.match(expired?.failureReason ?? "", /minimum-order normalization/iu);
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
        assert.deepEqual(input, {
          ...route,
          refreshExchanges: [
            route.buyExchange,
            route.sellExchange,
          ],
          minimumBuyTimestamp:
            candidate.pair.buy.timestamp,
          minimumSellTimestamp:
            candidate.pair.sell.timestamp,
        });
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
      historicalMismatchesSkipped: 0,
      refreshesRequested: 1,
      refreshesRecovered: 1,
      coordinatorStarts: 0,
    });
  }
}

async function verifyOnlyStaleRouteLegIsRequested(
  directory: string,
): Promise<void> {
  const route: StrategyOneTinyLiveBasketRoute = {
    market:
      "SANDUSDT",
    buyExchange:
      "bybit",
    sellExchange:
      "coindcx",
  };
  let clock =
    NOW +
    50_000;
  const candidateFixture =
    opportunity(
      "selective-stale-sell",
      route,
      clock,
    );
  const candidate: ArbitrageOpportunity = {
    ...candidateFixture,
    pair: {
      ...candidateFixture.pair,
      buy: {
        ...candidateFixture.pair.buy,
        timestamp:
          clock -
          20,
      },
      sell: {
        ...candidateFixture.pair.sell,
        timestamp:
          clock -
          500,
      },
    },
    quotesAreFresh:
      false,
  };
  const refreshed =
    opportunity(
      "selective-refreshed-sell",
      route,
      clock +
      20,
    );
  let refreshCalls =
    0;
  const service =
    new StrategyOneTinyLivePreArmService({
      runtimeGateEnabled: () =>
        true,
      getCapitalPerLegInr: () =>
        500,
      getActionDiagnostics: () => ({
        maximumDailyAttempts:
          10,
        attemptsToday:
          0,
        blockingAuthorityPresent:
          false,
      }),
      previewAction: (
        opportunityId,
      ) =>
        freshnessBlockedPreview(
          opportunityId,
          route,
        ),
      refreshActionCandidate: async (
        input,
      ) => {
        refreshCalls +=
          1;
        assert.deepEqual(input, {
          ...route,
          refreshExchanges: [
            "coindcx",
          ],
          minimumBuyTimestamp:
            candidate.pair.buy.timestamp,
          minimumSellTimestamp:
            candidate.pair.sell.timestamp,
        });
        return {
          state:
            "REFRESHED",
          opportunity:
            refreshed,
          blocker:
            null,
        } as never;
      },
      now: () =>
        ++clock,
    }, join(
      directory,
      "selective-stale-leg.jsonl",
    ));

  service.arm({
    market:
      "DYNAMIC_POOL",
    buyExchange:
      "coindcx",
    sellExchange:
      "binance",
    confirmation:
      StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(),
    durationMinutes:
      180,
    maximumAttempts:
      10,
    routePoolId:
      STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
    now:
      ++clock,
  });

  assert.equal(
    await service.observeSnapshot({
      generatedAt:
        clock,
      opportunities: [
        candidate,
      ],
    }),
    null,
  );
  assert.equal(
    refreshCalls,
    1,
  );
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
    maximumCapitalPerLegInr: 1_000,
    requiredAuthorizationPhrase: "AUTHORIZE tiny-live-durable-reasons",
  };
  const filePath = join(directory, "durable-last-look-reasons.jsonl");
  let attemptsToday = 0;
  const dependencies = {
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: () => ({
      maximumDailyAttempts: 10,
      attemptsToday,
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

  attemptsToday = 2;
  const restarted = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  assert.deepEqual(restarted.getDiagnostics(clock).records[0]?.attempts?.[0]?.reasons, attempt?.reasons);
  assert.equal(
    restarted.getDiagnostics(clock).dailyAttemptBudget.routePoolArmAttempts,
    8,
  );
  const continued = restarted.arm({
    market: "DYNAMIC_POOL",
    buyExchange: "coindcx",
    sellExchange: "binance",
    confirmation: StrategyOneTinyLivePreArmService.requiredRoutePoolArmPhrase(8),
    durationMinutes: 180,
    maximumAttempts: 8,
    routePoolId: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
    now: ++clock,
  });
  assert.equal(continued.state, "ARMED");
  assert.equal(continued.maximumAttempts, 8);
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
