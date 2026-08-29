import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";
import type {OpportunitySnapshot} from "../../../arbitrage/services/OpportunityService";
import type {ArbitrageLiveExecutionResult} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import type {
  StrategyOneDynamicPoolTimingQualification,
  StrategyOneTimingCalibrationRecord,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";
import type {StrategyOnePilotPreflightRunReport} from "../tiny-live/StrategyOnePilotPreflightService";
import {
  StrategyOneTinyLiveActionAuthorityService,
} from "../tiny-live/StrategyOneTinyLiveActionAuthorityService";
import {
  StrategyOneTinyLivePreArmService,
} from "../tiny-live/StrategyOneTinyLivePreArmService";

const NOW = 1_786_812_800_000;

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-v111-"));

  try {
    const opportunity = opportunityFixture();
    const calibration = calibrationFixture();
    const dependencies = {
      getOpportunity: (id: string) => id === opportunity.id ? opportunity : null,
      runPreflight: (input: {now?: number}) =>
        preflightFixture(input.now ?? NOW),
      getCalibration: () => calibration,
      getVenueContract: (exchange: string) => ({
        exchange,
        maximumOrderBookAgeMs: 25,
        requiredTimeInForce: "FOK" as const,
        supportedTimeInForce: ["FOK" as const],
        authoritativeFillConfirmationReady: true,
        authoritativeFeeReconciliationReady: true,
      }),
      isPairResolved: () => true,
      runtimeGateEnabled: () => true,
    };
    const service = new StrategyOneTinyLiveActionAuthorityService(
      dependencies,
      join(directory, "authorities.jsonl"),
      30_000,
      3_000,
      3,
    );
    const preview = service.preview(opportunity.id, NOW);

    assert.equal(preview.approvedForAuthorization, true);
    assert.ok(preview.authority);
    assert.equal(preview.authority.capitalPerLegInr, 500);
    assert.equal(preview.authority.exactQuantity, 0.001);
    assert.equal(preview.authority.liveOrderSubmissionAuthorized, false);
    assert.throws(
      () => service.authorize(preview.authority?.id ?? "", "wrong", NOW + 1),
      /exact one-time Tiny-LIVE authorization phrase/iu,
    );

    const authorized = service.authorize(
      preview.authority.id,
      preview.authority.requiredAuthorizationPhrase,
      NOW + 2,
    );
    assert.equal(authorized.state, "AUTHORIZED");
    assert.equal(authorized.liveOrderSubmissionAuthorized, true);

    let semanticNetProfitPercent = 0.8;
    const semanticChangeService = new StrategyOneTinyLiveActionAuthorityService(
      {
        ...dependencies,
        runPreflight: (input: {now?: number}) => {
          const report = preflightFixture(input.now ?? NOW);
          const selected = report.preview.selected;

          assert.ok(selected);
          return {
            ...report,
            preview: {
              ...report.preview,
              selected: {
                ...selected,
                currentNetProfitPercent: semanticNetProfitPercent,
              },
            },
          };
        },
      },
      join(directory, "semantic-change-authorities.jsonl"),
    );
    const semanticPreview = semanticChangeService.preview(opportunity.id, NOW + 10);

    assert.ok(semanticPreview.authority);
    semanticNetProfitPercent = 0.7;
    assert.throws(
      () => semanticChangeService.authorize(
        semanticPreview.authority?.id ?? "",
        semanticPreview.authority?.requiredAuthorizationPhrase ?? "",
        NOW + 11,
      ),
      /evidence changed after preview/iu,
      "A safety-relevant economics change must remain fingerprint-blocking.",
    );

    const consumed = service.consume({
      authorityId: authorized.id,
      opportunity,
      now: NOW + 3,
    });
    assert.equal(consumed.state, "CONSUMED");
    assert.equal(consumed.liveOrderSubmissionAuthorized, false);
    assert.throws(
      () => service.consume({authorityId: authorized.id, opportunity, now: NOW + 4}),
      /must be in AUTHORIZED state/iu,
    );

    const bound = service.bindPair(
      authorized.id,
      "strategy-one:v111:pair",
      NOW + 4,
    );
    assert.equal(bound.state, "PAIR_BOUND");

    const finalized = service.finalize(
      authorized.id,
      executionFixture(),
      NOW + 5,
    );
    assert.equal(finalized.state, "FINALIZED");
    assert.equal(finalized.requiresRecovery, false);
    assert.equal(service.getDiagnostics(NOW + 6).attemptsToday, 1);

    const restored = new StrategyOneTinyLiveActionAuthorityService(
      dependencies,
      join(directory, "authorities.jsonl"),
      30_000,
      3_000,
      3,
    );
    assert.equal(restored.get(authorized.id)?.state, "FINALIZED");
    assert.equal(restored.getDiagnostics(NOW + 6).attemptsToday, 1);

    const second = restored.preview(opportunity.id, NOW + 7);
    assert.equal(second.approvedForAuthorization, false);
    assert.equal(
      second.blockers.some((reason) => reason.includes("Bootstrap timing calibration")),
      true,
    );

    const disabled = new StrategyOneTinyLiveActionAuthorityService(
      {...dependencies, runtimeGateEnabled: () => false},
      join(directory, "disabled.jsonl"),
    );
    assert.equal(disabled.preview(opportunity.id, NOW).approvedForAuthorization, false);
    assert.equal(disabled.getDiagnostics(NOW).runtimeGateEnabled, false);
    assert.equal(disabled.getDiagnostics(NOW).maximumDailyAttempts, 10);

    testRouteSpecificActionTimeContract(directory);
    testBasketBootstrapQuotaIsRouteScoped(directory);
    testDynamicPoolQualificationNeedsNoPerCoinApproval(directory);
    testAuthoritativeRecoveryClearsFinalizedBlocker(directory);
    await testPreArmedOneShot(directory, opportunity);
    await testControlledTwoAttemptBatch(directory, opportunity);
    await testControlledTenAttemptBatch(directory, opportunity);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V111/V191 Tiny-LIVE authority passed: venue-direction timing needs no per-coin approval, while exact funded quantity, authorized route TTL, ₹1000 quote cap, three-second authority, durable claim, expiry/disarm and no automatic retry remain enforced; no exchange order occurred.",
  );
}

function testDynamicPoolQualificationNeedsNoPerCoinApproval(
  directory: string,
): void {
  let clock = NOW + 900_000;
  const route = {
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  };
  const opportunities = [1, 2, 3].map((index) =>
    routeOpportunityFixture(`dynamic-coti-${index}`, route));
  const byId = new Map(opportunities.map((item) => [item.id, item]));
  const qualification: StrategyOneDynamicPoolTimingQualification = {
    schemaVersion: "189.0",
    timingPolicyRevision: "STRATEGY_ONE_TRIGGER_SYNC_5MS_300MS_V3",
    id: "dynamic-timing-coti",
    routePoolId: "strategy-one-dynamic-usdt-route-pool-v1",
    routeKey: "COTIUSDT:coindcx->binance",
    ...route,
    source: "DYNAMIC_POOL_VENUE_DIRECTION_EVIDENCE",
    scope: "DYNAMIC_POOL",
    maximumBookAgeMs: 295,
    evidenceGeneratedAt: clock,
    evidenceRouteKey: "BTCUSDT:coindcx->binance",
    venueLaneKey: "coindcx->binance",
    perRouteOperatorApprovalRequired: false,
    liveOrderSubmissionAuthorized: false,
  };
  const calibrationHeadrooms: Array<unknown> = [];
  const service = new StrategyOneTinyLiveActionAuthorityService({
    getOpportunity: (id) => byId.get(id) ?? null,
    runPreflight: (input: {now?: number; expectedOpportunityId: string}) =>
      routePreflightFixture(
        input.now ?? clock,
        input.expectedOpportunityId,
        route,
      ),
    getCalibration: (_input, headroom) => {
      calibrationHeadrooms.push(headroom);
      return qualification;
    },
    getVenueContract: (exchange: string) => ({
      exchange,
      maximumOrderBookAgeMs: 295,
      requiredTimeInForce: exchange === "coindcx" ? "GTC" as const : "FOK" as const,
      supportedTimeInForce: exchange === "coindcx"
        ? ["GTC" as const]
        : ["FOK" as const],
      authoritativeFillConfirmationReady: true,
      authoritativeFeeReconciliationReady: true,
    }),
    isPairResolved: () => true,
    pairSessionExists: () => false,
    runtimeGateEnabled: () => true,
    getTinyLiveCapitalPerLegInr: () => 500,
  }, join(directory, "dynamic-no-per-coin-approval.jsonl"));

  for (const opportunity of opportunities) {
    const preview = service.preview(opportunity.id, ++clock);
    assert.equal(preview.approvedForAuthorization, true);
    assert.equal(preview.authority?.schemaVersion, "191.0");
    assert.equal(preview.authority?.calibrationScope, "DYNAMIC_POOL");
    assert.equal(preview.authority?.maximumOrderBookAgeMs, 295);
    const authority = preview.authority;
    assert.ok(authority);
    const authorized = service.authorize(
      authority.id,
      authority.requiredAuthorizationPhrase,
      ++clock,
    );
    service.consume({authorityId: authorized.id, opportunity, now: ++clock});
    service.finalize(authorized.id, executionFixture(opportunity), ++clock);
  }

  assert.equal(
    service.getDiagnostics(++clock).attemptsToday,
    3,
    "Pool-scoped timing qualification must not reintroduce per-route bootstrap approval quotas.",
  );
  assert.equal(calibrationHeadrooms.length, 6,
    "Preview and authorization must each bind qualification to their complete action-time preflight.");
  assert.equal(calibrationHeadrooms.every(Boolean), true,
    "The already-computed action-time headroom must be forwarded without a second evidence rebuild.");
  assert.equal(
    service.getDiagnostics(++clock).records.every(
      (record) =>
        record.schemaVersion === "191.0" &&
        record.maximumOrderBookAgeMs === 295,
    ),
    true,
    "Every dynamic authority transition must durably preserve its exact qualified TTL.",
  );
}

function testAuthoritativeRecoveryClearsFinalizedBlocker(
  directory: string,
): void {
  const opportunity = opportunityFixture();
  const calibration = calibrationFixture();
  let recoveryResolved = false;
  const filePath = join(directory, "resolved-recovery-authorities.jsonl");
  const dependencies = {
    getOpportunity: (id: string) => id === opportunity.id ? opportunity : null,
    runPreflight: (input: {now?: number}) =>
      preflightFixture(input.now ?? NOW),
    getCalibration: () => calibration,
    getVenueContract: (exchange: string) => ({
      exchange,
      maximumOrderBookAgeMs: 25,
      requiredTimeInForce: "FOK" as const,
      supportedTimeInForce: ["FOK" as const],
      authoritativeFillConfirmationReady: true,
      authoritativeFeeReconciliationReady: true,
    }),
    isPairResolved: (sessionId: string) =>
      recoveryResolved && sessionId === "strategy-one:resolved-recovery",
    pairSessionExists: () => true,
    runtimeGateEnabled: () => true,
    getTinyLiveCapitalPerLegInr: () => 500,
  };
  const service = new StrategyOneTinyLiveActionAuthorityService(
    dependencies,
    filePath,
  );
  const preview = service.preview(opportunity.id, NOW + 100);
  assert.ok(preview.authority);
  const authorized = service.authorize(
    preview.authority.id,
    preview.authority.requiredAuthorizationPhrase,
    NOW + 101,
  );
  service.consume({
    authorityId: authorized.id,
    opportunity,
    now: NOW + 102,
  });
  service.bindPair(
    authorized.id,
    "strategy-one:resolved-recovery",
    NOW + 103,
  );
  const finalized = service.finalize(
    authorized.id,
    {
      ...executionFixture(opportunity),
      success: false,
      status: "POSSIBLE_EXPOSURE",
      recoveryRequired: true,
      possibleExposure: true,
      reasons: ["Authoritative fee reconciliation was initially incomplete."],
    },
    NOW + 104,
  );

  assert.equal(finalized.state, "FINALIZED");
  assert.equal(finalized.requiresRecovery, true);
  assert.equal(service.getDiagnostics(NOW + 105).blockingAuthorityPresent, true);

  recoveryResolved = true;
  assert.equal(
    service.getDiagnostics(NOW + 106).blockingAuthorityPresent,
    false,
    "A currently valid, evidence-fingerprinted pair recovery must clear only the redundant finalized-authority blocker.",
  );
  assert.equal(service.get(authorized.id)?.state, "FINALIZED");
  assert.equal(service.get(authorized.id)?.requiresRecovery, true);

  const restarted = new StrategyOneTinyLiveActionAuthorityService(
    dependencies,
    filePath,
  );
  assert.equal(restarted.getDiagnostics(NOW + 107).blockingAuthorityPresent, false);

  recoveryResolved = false;
  assert.equal(
    restarted.getDiagnostics(NOW + 108).blockingAuthorityPresent,
    true,
    "Missing or invalidated recovery evidence must immediately fail closed again.",
  );
}

function testBasketBootstrapQuotaIsRouteScoped(
  directory: string,
): void {
  let clock = NOW + 750_000;
  const cotiRoute = {
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
  };
  const bbRoute = {
    market: "BBUSDT",
    buyExchange: "binance",
    sellExchange: "coindcx",
  };
  const opportunities = [
    routeOpportunityFixture("basket-coti-1", cotiRoute),
    routeOpportunityFixture("basket-coti-2", cotiRoute),
    routeOpportunityFixture("basket-coti-3", cotiRoute),
    routeOpportunityFixture("basket-bb-1", bbRoute),
  ];
  const byId = new Map(opportunities.map((item) => [item.id, item]));
  const calibrations = new Map([
    [
      "COTIUSDT:coindcx->binance",
      routeCalibrationFixture("basket-coti", cotiRoute, clock),
    ],
    [
      "BBUSDT:binance->coindcx",
      routeCalibrationFixture("basket-bb", bbRoute, clock),
    ],
  ]);
  const service = new StrategyOneTinyLiveActionAuthorityService(
    {
      getOpportunity: (id) => byId.get(id) ?? null,
      runPreflight: (input: {now?: number; expectedOpportunityId: string}) => {
        const opportunity = byId.get(input.expectedOpportunityId);
        assert.ok(opportunity);
        return routePreflightFixture(
          input.now ?? clock,
          opportunity.id,
          {
            market: opportunity.pair.market,
            buyExchange: opportunity.pair.buy.exchange,
            sellExchange: opportunity.pair.sell.exchange,
          },
        );
      },
      getCalibration: (input) => calibrations.get(
        `${input.market}:${input.buyExchange}->${input.sellExchange}`,
      ) ?? null,
      getVenueContract: (exchange: string) => ({
        exchange,
        maximumOrderBookAgeMs: 190,
        requiredTimeInForce: exchange === "coindcx" ? "GTC" as const : "FOK" as const,
        supportedTimeInForce: exchange === "coindcx"
          ? ["GTC" as const]
          : ["FOK" as const],
        authoritativeFillConfirmationReady: true,
        authoritativeFeeReconciliationReady: true,
      }),
      isPairResolved: () => true,
      pairSessionExists: () => false,
      runtimeGateEnabled: () => true,
      getTinyLiveCapitalPerLegInr: () => 500,
    },
    join(directory, "basket-route-scoped-authorities.jsonl"),
    30_000,
    3_000,
    10,
  );

  const complete = (opportunity: ArbitrageOpportunity): void => {
    const preview = service.preview(opportunity.id, ++clock);
    assert.equal(preview.approvedForAuthorization, true);
    assert.ok(preview.authority);
    const authorized = service.authorize(
      preview.authority.id,
      preview.authority.requiredAuthorizationPhrase,
      ++clock,
    );
    service.consume({authorityId: authorized.id, opportunity, now: ++clock});
    service.finalize(authorized.id, executionFixture(opportunity), ++clock);
  };

  complete(opportunities[0]);
  complete(opportunities[1]);

  const thirdCoti = service.preview(opportunities[2].id, ++clock);
  assert.equal(thirdCoti.approvedForAuthorization, false);
  assert.equal(
    thirdCoti.blockers.some((reason) =>
      reason.includes("at most two Tiny-LIVE attempts on this exact route")),
    true,
  );

  const firstBb = service.preview(opportunities[3].id, ++clock);
  assert.equal(firstBb.approvedForAuthorization, true);
  assert.ok(firstBb.authority);
  const authorizedBb = service.authorize(
    firstBb.authority.id,
    firstBb.authority.requiredAuthorizationPhrase,
    ++clock,
  );
  service.consume({authorityId: authorizedBb.id, opportunity: opportunities[3], now: ++clock});
  service.finalize(authorizedBb.id, executionFixture(opportunities[3]), ++clock);

  assert.equal(service.getDiagnostics(++clock).attemptsToday, 3);
}

async function testControlledTenAttemptBatch(
  directory: string,
  opportunityTemplate: ArbitrageOpportunity,
): Promise<void> {
  let clock = NOW + 600_000;
  let executionCalls = 0;
  let service: StrategyOneTinyLivePreArmService;
  const opportunities = Array.from({length: 10}, (_, index) => ({
    ...opportunityTemplate,
    id: `opportunity-v182-${index + 1}`,
  }));
  const opportunitiesById = new Map(
    opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
  const continuousCalibration: StrategyOneTimingCalibrationRecord = {
    ...calibrationFixture(),
    id: "timing-v182-continuous",
    scope: "CONTINUOUS_TINY_LIVE",
    evidenceGeneratedAt: clock,
    privateFillSamplesBuy: 512,
    privateFillSamplesSell: 512,
    proposedAt: clock,
    approvedAt: clock,
    expiresAt: clock + 3 * 60 * 60_000,
  };
  const action = new StrategyOneTinyLiveActionAuthorityService(
    {
      getOpportunity: (id) => opportunitiesById.get(id) ?? null,
      runPreflight: (input: {now?: number; expectedOpportunityId: string}) =>
        preflightFixture(input.now ?? clock, input.expectedOpportunityId),
      getCalibration: () => continuousCalibration,
      getVenueContract: (exchange: string) => ({
        exchange,
        maximumOrderBookAgeMs: 25,
        requiredTimeInForce: "FOK" as const,
        supportedTimeInForce: ["FOK" as const],
        authoritativeFillConfirmationReady: true,
        authoritativeFeeReconciliationReady: true,
      }),
      isPairResolved: () => true,
      runtimeGateEnabled: () => true,
    },
    join(directory, "ten-batch-authorities.jsonl"),
    30_000,
    3_000,
    10,
  );
  const dependencies = {
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: (now: number) => action.getDiagnostics(now),
    getCalibration: () => continuousCalibration,
    getVenueContract: (exchange: string) => ({
      exchange,
      maximumOrderBookAgeMs: 25,
      requiredTimeInForce: "FOK" as const,
      supportedTimeInForce: ["FOK" as const],
      authoritativeFillConfirmationReady: true,
      authoritativeFeeReconciliationReady: true,
    }),
    getOpportunity: (id: string) => opportunitiesById.get(id) ?? null,
    previewAction: (id: string, now: number) => action.preview(id, now),
    authorizeAction: (id: string, phrase: string, now: number) => {
      assert.equal(service.getDiagnostics(now).records[0]?.state, "CLAIMED");
      return action.authorize(id, phrase, now);
    },
    refreshAuthorizedFinalBooks: async (route: {
      market: string;
      buyExchange: string;
      sellExchange: string;
    }) => successfulAuthorizedFinalRefresh(route),
    execute: async (item: ArbitrageOpportunity, authorityId: string) => {
      executionCalls += 1;
      action.consume({authorityId, opportunity: item, now: ++clock});
      const result = executionFixture(item);
      action.finalize(authorityId, result, ++clock);
      return result;
    },
    now: () => ++clock,
  };
  const filePath = join(directory, "ten-batch-prearms.jsonl");
  service = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  const request = {
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    capitalPerLegInr: 500,
    maximumAttempts: 10 as const,
    durationMinutes: 180,
  };
  const confirmation = StrategyOneTinyLivePreArmService.requiredArmPhrase(request);
  const armed = service.arm({...request, confirmation, now: ++clock});

  assert.equal(
    confirmation,
    "ARM TEN-SLOT BTCUSDT BINANCE BYBIT INR500 ATTEMPTS10 MINUTES180",
  );
  assert.equal(armed.schemaVersion, "182.0");
  assert.equal(armed.maximumAttempts, 10);

  let latest = armed;
  for (let index = 0; index < opportunities.length; index += 1) {
    const observed = await service.observeSnapshot({
      generatedAt: clock,
      opportunities,
    });
    assert.ok(observed);
    latest = observed;
    assert.equal(latest.attemptsUsed, index + 1);
    assert.equal(latest.attempts?.[index]?.attemptNumber, index + 1);
    assert.equal(latest.state, index === 9 ? "COMPLETED" : "ARMED");
    if (latest.state === "ARMED") {
      clock = (latest.nextAttemptNotBefore ?? clock) + 1;
    }
  }

  assert.equal(executionCalls, 10);
  assert.equal(latest.attempts?.length, 10);
  assert.equal(service.getActiveArm(clock), null);

  const restored = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  assert.equal(restored.getDiagnostics(clock).records[0]?.schemaVersion, "182.0");
  assert.equal(restored.getDiagnostics(clock).records[0]?.attempts?.length, 10);
}

function testRouteSpecificActionTimeContract(
  directory: string,
): void {
  const opportunity = cotiOpportunityFixture();
  const calibration: StrategyOneTimingCalibrationRecord = {
    ...calibrationFixture(),
    id: "timing-v153-coti-route-tif",
    routeKey: "COTIUSDT:coindcx->binance",
    market: "COTIUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
    scope: "CONTINUOUS_TINY_LIVE",
  };
  let coinDCXContractMismatch = false;
  const dependencies = {
    getOpportunity: (id: string) => id === opportunity.id ? opportunity : null,
    runPreflight: (input: {now?: number; expectedOpportunityId: string}) =>
      cotiPreflightFixture(input.now ?? NOW, input.expectedOpportunityId),
    getCalibration: () => calibration,
    getVenueContract: (exchange: string) => {
      const normalized = exchange.trim().toLowerCase();
      const isCoinDCX = normalized === "coindcx";

      return {
        exchange: normalized,
        maximumOrderBookAgeMs: 190,
        requiredTimeInForce: isCoinDCX ? "GTC" as const : "FOK" as const,
        supportedTimeInForce: isCoinDCX
          ? coinDCXContractMismatch
            ? ["FOK" as const]
            : ["GTC" as const]
          : ["IOC" as const, "FOK" as const],
        authoritativeFillConfirmationReady: true,
        authoritativeFeeReconciliationReady: true,
      };
    },
    isPairResolved: () => true,
    pairSessionExists: () => false,
    runtimeGateEnabled: () => true,
    getTinyLiveCapitalPerLegInr: () => 500,
  };
  const service = new StrategyOneTinyLiveActionAuthorityService(
    dependencies,
    join(directory, "coti-route-tif-authorities.jsonl"),
  );
  const preview = service.preview(opportunity.id, NOW);

  assert.equal(preview.approvedForAuthorization, true);
  assert.ok(preview.authority);
  const authorized = service.authorize(
    preview.authority.id,
    preview.authority.requiredAuthorizationPhrase,
    NOW + 1,
  );
  assert.equal(authorized.state, "AUTHORIZED");

  const mismatchService = new StrategyOneTinyLiveActionAuthorityService(
    dependencies,
    join(directory, "coti-route-tif-mismatch-authorities.jsonl"),
  );
  coinDCXContractMismatch = false;
  const mismatchPreview = mismatchService.preview(opportunity.id, NOW + 2);

  assert.equal(mismatchPreview.approvedForAuthorization, true);
  assert.ok(mismatchPreview.authority);
  coinDCXContractMismatch = true;
  assert.throws(
    () => mismatchService.authorize(
      mismatchPreview.authority?.id ?? "",
      mismatchPreview.authority?.requiredAuthorizationPhrase ?? "",
      NOW + 3,
    ),
    /coindcx action-time LIVE contract is no longer ready/iu,
  );
}

async function testControlledTwoAttemptBatch(
  directory: string,
  firstOpportunity: ArbitrageOpportunity,
): Promise<void> {
  let clock = NOW + 300_000;
  let executionCalls = 0;
  let service: StrategyOneTinyLivePreArmService;
  const secondOpportunity = {
    ...firstOpportunity,
    id: "opportunity-v150-second",
  };
  const opportunities = new Map([
    [firstOpportunity.id, firstOpportunity],
    [secondOpportunity.id, secondOpportunity],
  ]);
  const calibration: StrategyOneTimingCalibrationRecord = {
    ...calibrationFixture(),
    id: "timing-v150-batch",
    scope: "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH",
    evidenceGeneratedAt: clock,
    proposedAt: clock,
    approvedAt: clock,
    expiresAt: clock + 3 * 60 * 60_000,
    requiredApprovalPhrase: "APPROVE timing-v150-batch ATTEMPTS2 HOURS3",
  };
  const action = new StrategyOneTinyLiveActionAuthorityService(
    {
      getOpportunity: (id) => opportunities.get(id) ?? null,
      runPreflight: (input: {now?: number; expectedOpportunityId: string}) =>
        preflightFixture(input.now ?? clock, input.expectedOpportunityId),
      getCalibration: () => calibration,
      getVenueContract: (exchange: string) => ({
        exchange,
        maximumOrderBookAgeMs: 25,
        requiredTimeInForce: "FOK" as const,
        supportedTimeInForce: ["FOK" as const],
        authoritativeFillConfirmationReady: true,
        authoritativeFeeReconciliationReady: true,
      }),
      isPairResolved: () => true,
      runtimeGateEnabled: () => true,
    },
    join(directory, "batch-authorities.jsonl"),
  );
  const dependencies = {
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: (now: number) => action.getDiagnostics(now),
    getCalibration: () => calibration,
    getVenueContract: (exchange: string) => ({
      exchange,
      maximumOrderBookAgeMs: 25,
      requiredTimeInForce: "FOK" as const,
      supportedTimeInForce: ["FOK" as const],
      authoritativeFillConfirmationReady: true,
      authoritativeFeeReconciliationReady: true,
    }),
    getOpportunity: (id: string) => opportunities.get(id) ?? null,
    previewAction: (id: string, now: number) => action.preview(id, now),
    authorizeAction: (id: string, phrase: string, now: number) => {
      assert.equal(service.getDiagnostics(now).records[0]?.state, "CLAIMED");
      return action.authorize(id, phrase, now);
    },
    refreshAuthorizedFinalBooks: async (route: {
      market: string;
      buyExchange: string;
      sellExchange: string;
    }) => successfulAuthorizedFinalRefresh(route),
    execute: async (item: ArbitrageOpportunity, authorityId: string) => {
      executionCalls += 1;
      action.consume({authorityId, opportunity: item, now: ++clock});
      const result = executionFixture(item);
      action.finalize(authorityId, result, ++clock);
      return result;
    },
    now: () => ++clock,
  };
  const filePath = join(directory, "batch-prearms.jsonl");
  service = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  const confirmation = StrategyOneTinyLivePreArmService.requiredArmPhrase({
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    capitalPerLegInr: 500,
    maximumAttempts: 2,
    durationMinutes: 180,
  });
  const armed = service.arm({
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    confirmation,
    durationMinutes: 180,
    maximumAttempts: 2,
    now: ++clock,
  });

  assert.equal(armed.schemaVersion, "150.0");
  assert.equal(armed.maximumAttempts, 2);
  assert.equal(armed.expiresAt - armed.armedAt, 180 * 60_000);

  const first = await service.observeSnapshot({
    generatedAt: clock,
    opportunities: [firstOpportunity],
  });
  assert.equal(first?.state, "ARMED");
  assert.equal(first?.attemptsUsed, 1);
  assert.equal(first?.attempts?.[0]?.success, true);
  assert.equal(executionCalls, 1);

  clock = (first?.nextAttemptNotBefore ?? clock) + 1;
  const second = await service.observeSnapshot({
    generatedAt: clock,
    opportunities: [firstOpportunity, secondOpportunity],
  });
  assert.equal(second?.state, "COMPLETED");
  assert.equal(second?.attemptsUsed, 2);
  assert.deepEqual(second?.attempts?.map((attempt) => attempt.opportunityId), [
    firstOpportunity.id,
    secondOpportunity.id,
  ]);
  assert.equal(executionCalls, 2);
  assert.equal(service.getActiveArm(clock), null);

  const restored = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  assert.equal(restored.getDiagnostics(clock).records[0]?.attempts?.length, 2);
  assert.equal(restored.getActiveArm(clock), null);
}

async function testPreArmedOneShot(
  directory: string,
  opportunity: ArbitrageOpportunity,
): Promise<void> {
  let clock = NOW + 100_000;
  let executionCalls = 0;
  const executionStages: string[] = [];
  let service: StrategyOneTinyLivePreArmService;
  const calibration = {
    ...calibrationFixture(),
    id: "timing-v125",
    scope: "CONTINUOUS_TINY_LIVE" as const,
    evidenceGeneratedAt: clock,
    proposedAt: clock,
    approvedAt: clock,
    expiresAt: clock + 60 * 60_000,
  };
  const action = new StrategyOneTinyLiveActionAuthorityService(
    {
      getOpportunity: (id) => id === opportunity.id ? opportunity : null,
      runPreflight: (input: {now?: number}) => preflightFixture(input.now ?? clock),
      getCalibration: () => calibration,
      getVenueContract: (exchange: string) => ({
        exchange,
        maximumOrderBookAgeMs: 25,
        requiredTimeInForce: "FOK" as const,
        supportedTimeInForce: ["FOK" as const],
        authoritativeFillConfirmationReady: true,
        authoritativeFeeReconciliationReady: true,
      }),
      isPairResolved: () => true,
      runtimeGateEnabled: () => true,
    },
    join(directory, "prearm-authorities.jsonl"),
  );
  const dependencies = {
    runtimeGateEnabled: () => true,
    getCapitalPerLegInr: () => 500,
    getActionDiagnostics: (now: number) => action.getDiagnostics(now),
    getCalibration: () => calibration,
    getVenueContract: (exchange: string) => ({
      exchange,
      maximumOrderBookAgeMs: 25,
      requiredTimeInForce: "FOK" as const,
      supportedTimeInForce: ["FOK" as const],
      authoritativeFillConfirmationReady: true,
      authoritativeFeeReconciliationReady: true,
    }),
    getOpportunity: (id: string) => id === opportunity.id ? opportunity : null,
    previewAction: (id: string, now: number) => action.preview(id, now),
    authorizeAction: (id: string, phrase: string, now: number) => {
      assert.equal(
        service.getDiagnostics(now).records[0]?.state,
        "CLAIMED",
        "The durable arm must be consumed before order authority is minted.",
      );
      executionStages.push("authorize");
      return action.authorize(id, phrase, now);
    },
    refreshAuthorizedFinalBooks: async (route: {
      market: string;
      buyExchange: string;
      sellExchange: string;
    }) => {
      executionStages.push("refresh");
      assert.deepEqual(route, {
        market: opportunity.pair.market,
        buyExchange: opportunity.pair.buy.exchange,
        sellExchange: opportunity.pair.sell.exchange,
      });
      return successfulAuthorizedFinalRefresh(route);
    },
    execute: async (item: ArbitrageOpportunity, authorityId: string) => {
      executionStages.push("execute");
      executionCalls += 1;
      action.consume({authorityId, opportunity: item, now: ++clock});
      const result = executionFixture();
      action.finalize(authorityId, result, ++clock);
      return result;
    },
    now: () => ++clock,
  };
  const filePath = join(directory, "prearms.jsonl");
  service = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  const confirmation = StrategyOneTinyLivePreArmService.requiredArmPhrase({
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    capitalPerLegInr: 500,
  });

  assert.throws(
    () => service.arm({
      market: "BTCUSDT",
      buyExchange: "binance",
      sellExchange: "bybit",
      confirmation: "wrong",
      now: ++clock,
    }),
    /exact pre-arm confirmation/iu,
  );

  const armed = service.arm({
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    confirmation,
    durationMinutes: 15,
    now: ++clock,
  });
  assert.equal(armed.state, "ARMED");
  assert.equal(armed.maximumAttempts, 1);
  assert.equal(armed.automaticRetryAllowed, false);

  const wrongRoute: OpportunitySnapshot = {
    generatedAt: clock,
    opportunities: [{
      ...opportunity,
      id: "wrong-route",
      pair: {
        ...opportunity.pair,
        buy: {...opportunity.pair.buy, exchange: "bybit"},
        sell: {...opportunity.pair.sell, exchange: "binance"},
      },
    }],
  };
  assert.equal(await service.observeSnapshot(wrongRoute), null);
  assert.equal(executionCalls, 0);

  const matching: OpportunitySnapshot = {
    generatedAt: clock,
    opportunities: [opportunity],
  };
  const concurrent = await Promise.all([
    service.observeSnapshot(matching),
    service.observeSnapshot(matching),
  ]);
  const completed = concurrent.find((record) => record?.state === "COMPLETED") ?? null;
  assert.equal(completed?.executionStatus, "COMPLETED");
  assert.equal(concurrent.filter((record) => record !== null).length, 1);
  assert.equal(executionCalls, 1);
  assert.deepEqual(
    executionStages,
    ["authorize", "refresh", "execute"],
    "A coordinator must only start after one-time authorization and the final bounded dual-book refresh.",
  );
  assert.equal(service.getActiveArm(clock), null);

  assert.equal(await service.observeSnapshot(matching), null);
  assert.equal(executionCalls, 1, "A consumed arm must never retry.");

  const restored = new StrategyOneTinyLivePreArmService(dependencies, filePath);
  assert.equal(restored.getDiagnostics(clock).records[0]?.state, "COMPLETED");
  assert.equal(restored.getActiveArm(clock), null);

  const disarmFile = join(directory, "disarm-prearms.jsonl");
  const disarmService = new StrategyOneTinyLivePreArmService(
    {...dependencies, getActionDiagnostics: () => ({
      maximumDailyAttempts: 3,
      attemptsToday: 0,
      blockingAuthorityPresent: false,
    })},
    disarmFile,
  );
  const disarmRecord = disarmService.arm({
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    confirmation,
    durationMinutes: 1,
    now: ++clock,
  });
  assert.throws(
    () => disarmService.disarm(disarmRecord.id, "wrong", ++clock),
    /exact disarm confirmation/iu,
  );
  assert.equal(
    disarmService.disarm(disarmRecord.id, `DISARM ${disarmRecord.id}`, ++clock).state,
    "DISARMED",
  );

  const expiryService = new StrategyOneTinyLivePreArmService(
    {...dependencies, getActionDiagnostics: () => ({
      maximumDailyAttempts: 3,
      attemptsToday: 0,
      blockingAuthorityPresent: false,
    })},
    join(directory, "expiry-prearms.jsonl"),
  );
  const expiring = expiryService.arm({
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    confirmation,
    durationMinutes: 1,
    now: ++clock,
  });
  assert.equal(expiryService.getActiveArm(expiring.expiresAt + 1), null);
  assert.equal(expiryService.getDiagnostics(expiring.expiresAt + 2).records[0]?.state, "EXPIRED");

  const disabled = new StrategyOneTinyLivePreArmService(
    {...dependencies, runtimeGateEnabled: () => false},
    join(directory, "disabled-prearms.jsonl"),
  );
  assert.throws(
    () => disabled.arm({
      market: "BTCUSDT",
      buyExchange: "binance",
      sellExchange: "bybit",
      confirmation,
      now: ++clock,
    }),
    /runtime gate is disabled/iu,
  );
}

function successfulAuthorizedFinalRefresh(route: {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}) {
  return {
    schemaVersion: "188.2",
    state: "REFRESHED",
    route,
    startedAt: NOW,
    completedAt: NOW + 1,
    durationMs: 1,
    legs: [],
    blocker: null,
    safety: {
      publicReadOnly: true,
      authorizedAttemptOnly: true,
      parallelReads: true,
      thresholdChanged: false,
      timestampFabricationAllowed: false,
      orderSubmissionAllowed: false,
      automaticRetryAllowed: false,
      transferAllowed: false,
      withdrawalAllowed: false,
    },
  } as never;
}

function opportunityFixture(): ArbitrageOpportunity {
  return {
    id: "opportunity-v111",
    pair: {
      market: "BTCUSDT",
      buy: {
        exchange: "binance",
        market: "BTCUSDT",
        lastPrice: 100_000,
        bestBidPrice: 99_999,
        bestBidQty: 1,
        bestAskPrice: 100_000,
        bestAskQty: 1,
        spread: 1,
        timestamp: NOW,
        source: "orderBook",
        executable: true,
      },
      sell: {
        exchange: "bybit",
        market: "BTCUSDT",
        lastPrice: 101_000,
        bestBidPrice: 101_000,
        bestBidQty: 1,
        bestAskPrice: 101_001,
        bestAskQty: 1,
        spread: 1,
        timestamp: NOW,
        source: "orderBook",
        executable: true,
      },
    },
    requestedCapitalInr: 500,
    quoteAsset: "USDT",
    requestedQuoteCapital: 5,
    executableQuoteCapital: 5,
    executableCapitalInr: 500,
    buyPrice: 100_000,
    sellPrice: 101_000,
    buyAvailableQty: 1,
    sellAvailableQty: 1,
    requiredQty: 0.005,
    availableExecutableQty: 1,
    executableQty: 0.005,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 100,
    decision: "EXECUTE",
    analysisSummary: [],
    rawSpread: 1_000,
    rawSpreadPercent: 1,
    estimatedFees: 200,
    netProfit: 800,
    netProfitPercent: 0.8,
    usedLastPriceFallback: false,
    quotesAreFresh: true,
    score: 100,
    timestamp: NOW,
  };
}

function cotiOpportunityFixture(): ArbitrageOpportunity {
  const base = opportunityFixture();

  return {
    ...base,
    id: "opportunity-v153-coti-route-tif",
    pair: {
      market: "COTIUSDT",
      buy: {
        ...base.pair.buy,
        exchange: "coindcx",
        market: "COTIUSDT",
      },
      sell: {
        ...base.pair.sell,
        exchange: "binance",
        market: "COTIUSDT",
      },
    },
  };
}

function routeOpportunityFixture(
  id: string,
  route: {
    market: string;
    buyExchange: string;
    sellExchange: string;
  },
): ArbitrageOpportunity {
  const base = opportunityFixture();

  return {
    ...base,
    id,
    pair: {
      market: route.market,
      buy: {
        ...base.pair.buy,
        exchange: route.buyExchange,
        market: route.market,
      },
      sell: {
        ...base.pair.sell,
        exchange: route.sellExchange,
        market: route.market,
      },
    },
  };
}

function preflightFixture(
  now: number,
  opportunityId = "opportunity-v111",
): StrategyOnePilotPreflightRunReport {
  return {
    version: "115.0",
    generatedAt: now,
    mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT",
    decision: "CORE_PREFLIGHT_PASSED",
    approvedForActivationReview: true,
    expectedOpportunityId: opportunityId,
    preview: {
      version: "115.0",
      generatedAt: now,
      mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW",
      state: "READY_FOR_OPERATOR_PREFLIGHT",
      requestedCapitalPerLegInr: 500,
      minimumTwoLegInventoryInr: 1_000,
      minimumCurrentNetProfitPercent: 0.5,
      maximumOpportunityAgeMs: 10_000,
      maximumExecutionGradeBookAgeMs: 300,
      maximumDispatchReservedBookAgeMs: 240,
      maximumExecutionGradeBookSkewMs: 250,
      evidence: {
        currentFreshExecuteOpportunities: 1,
        historicalAdapterReadyRoutes: 1,
        excludedNonPilotCurrentOpportunities: 0,
        excludedNonPilotHistoricalRoutes: 0,
        matchedCurrentRoutes: 1,
        fullyPreflightableMatches: 1,
      },
      selected: {
        opportunityId,
        routeKey: "BTCUSDT|binance>bybit",
        market: "BTCUSDT",
        buyExchange: "binance",
        sellExchange: "bybit",
        observedAt: NOW,
        ageMs: now - NOW,
        currentNetProfitPercent: 0.8,
        currentNetProfitPerBaseUnit: 800,
        currentScore: 100,
        historical: {} as never,
        apiPermissionBoundary: {
          generatedAt: now,
          venues: [
            {
              checkedAt: now - 10,
              ageMs: 10,
            },
          ],
        } as never,
        timing: {
          schemaVersion: "115.0",
          generatedAt: now,
          routeKey: "BTCUSDT:binance->bybit",
          market: "BTCUSDT",
          buyExchange: "binance",
          sellExchange: "bybit",
          state: "READY",
          absoluteBookAgeCeilingMs: 300,
          dispatchSafetyMarginMs: 10,
          requiredOperationalHeadroomMs: 10,
          timingBasis: "TINY_LIVE_TRIGGER_BOOK_AGE",
          decisionToTinyLiveTriggerP99Ms: 5,
          downstreamPaperDecisionToExecutionStartP99Ms: 5,
          decisionToExecutionStartP99Ms: 5,
          dispatchBudgetMs: 15,
          maximumBookAgeMs: 285,
          executionGradeBuyAgeP99Ms: 100,
          executionGradeSellAgeP99Ms: 100,
          executionGradeWorstAgeP99Ms: 100,
          residualOperationalHeadroomMs: 185,
          blockers: [],
          safety: {
            reviewOnly: true,
            thresholdRelaxationAllowed: false,
            automaticProposalAllowed: false,
            automaticApprovalAllowed: false,
            liveOrderSubmissionAuthorized: false,
          },
        },
        funding: {
          state: "FUNDED",
          executableQuantity: 0.001,
          evaluatedAt: now,
          buyFunding: {
            snapshotAgeMs: Math.max(0, now - NOW),
          },
          sellFunding: {
            snapshotAgeMs: Math.max(0, now - NOW),
          },
        } as never,
        stress: {
          status: "PASSED",
          evaluatedAt: now,
          sourceOpportunityAgeMs: Math.max(0, now - NOW),
          buyBookTimestamp: NOW,
          sellBookTimestamp: NOW,
          reasons: [],
        } as never,
        checks: [],
        readyForOperatorPreflight: true,
      },
      alternatives: [],
      blockers: [],
      requiredConfirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      safety: safetyFixture(),
    },
    corePreflight: {} as never,
    blockers: [],
    safety: safetyFixture(),
  };
}

function cotiPreflightFixture(
  now: number,
  opportunityId: string,
): StrategyOnePilotPreflightRunReport {
  const base = preflightFixture(now, opportunityId);
  const selected = base.preview.selected;

  assert.ok(selected);

  return {
    ...base,
    preview: {
      ...base.preview,
      selected: {
        ...selected,
        routeKey: "COTIUSDT|coindcx>binance",
        market: "COTIUSDT",
        buyExchange: "coindcx",
        sellExchange: "binance",
        timing: {
          ...selected.timing,
          routeKey: "COTIUSDT:coindcx->binance",
          market: "COTIUSDT",
          buyExchange: "coindcx",
          sellExchange: "binance",
        },
      },
    },
  };
}

function routePreflightFixture(
  now: number,
  opportunityId: string,
  route: {
    market: string;
    buyExchange: string;
    sellExchange: string;
  },
): StrategyOnePilotPreflightRunReport {
  const base = preflightFixture(now, opportunityId);
  const selected = base.preview.selected;

  assert.ok(selected);

  return {
    ...base,
    preview: {
      ...base.preview,
      selected: {
        ...selected,
        routeKey: `${route.market}|${route.buyExchange}>${route.sellExchange}`,
        market: route.market,
        buyExchange: route.buyExchange,
        sellExchange: route.sellExchange,
        funding: {
          ...selected.funding,
          maximumCapitalPerLegInr: 1_000,
          maximumConvertedQuoteCapital: 5.05,
        },
        timing: {
          ...selected.timing,
          routeKey: `${route.market}:${route.buyExchange}->${route.sellExchange}`,
          market: route.market,
          buyExchange: route.buyExchange,
          sellExchange: route.sellExchange,
        },
      },
    },
  };
}

function safetyFixture() {
  return {
    readOnlyPreview: true as const,
    historicalEvidenceIsNotCurrentAuthorization: true as const,
    operatorPreflightIsNotOrderAuthorization: true as const,
    automaticFundMovementAllowed: false as const,
    transferInitiated: false as const,
    withdrawalInitiated: false as const,
    balanceMutated: false as const,
    capitalReserved: false as const,
    liveSessionCreated: false as const,
    liveExecutionAllowed: false as const,
    orderSubmissionAllowed: false as const,
    orderSubmissionPerformed: false as const,
  };
}

function calibrationFixture(): StrategyOneTimingCalibrationRecord {
  return {
    schemaVersion: "110.0",
    id: "timing-v111",
    routeKey: "BTCUSDT:binance->bybit",
    market: "BTCUSDT",
    buyExchange: "binance",
    sellExchange: "bybit",
    status: "APPROVED",
    scope: "BOOTSTRAP_FIRST_TINY_LIVE_ATTEMPT",
    maximumBookAgeMs: 25,
    evidenceHash: "fixture",
    evidenceGeneratedAt: NOW,
    publicSamples: 512,
    privateFillSamplesBuy: 0,
    privateFillSamplesSell: 0,
    proposedAt: NOW,
    approvedAt: NOW,
    expiresAt: NOW + 60_000,
    revokedAt: null,
    requiredApprovalPhrase: "APPROVE timing-v111",
    automaticActivationAllowed: false,
    liveOrderSubmissionAuthorized: false,
  };
}

function routeCalibrationFixture(
  suffix: string,
  route: {
    market: string;
    buyExchange: string;
    sellExchange: string;
  },
  now: number,
): StrategyOneTimingCalibrationRecord {
  return {
    ...calibrationFixture(),
    id: `timing-${suffix}`,
    routeKey: `${route.market}:${route.buyExchange}->${route.sellExchange}`,
    market: route.market,
    buyExchange: route.buyExchange,
    sellExchange: route.sellExchange,
    scope: "BOOTSTRAP_CONTROLLED_TWO_ATTEMPT_BATCH",
    evidenceGeneratedAt: now,
    proposedAt: now,
    approvedAt: now,
    expiresAt: now + 3 * 60 * 60_000,
    requiredApprovalPhrase: `APPROVE timing-${suffix} ATTEMPTS2 HOURS3`,
  };
}

function executionFixture(
  opportunity: ArbitrageOpportunity = opportunityFixture(),
): ArbitrageLiveExecutionResult {
  return {
    success: true,
    status: "COMPLETED",
    opportunityId: opportunity.id,
    market: opportunity.pair.market,
    requestedQuantity: 0.001,
    buyExchange: opportunity.pair.buy.exchange,
    sellExchange: opportunity.pair.sell.exchange,
    buyResult: null,
    sellResult: null,
    matchedFilledQuantity: 0.001,
    unmatchedBuyQuantity: 0,
    unmatchedSellQuantity: 0,
    startedAt: NOW,
    completedAt: NOW + 1,
    executionTimeMs: 1,
    dispatchSkewMs: 0,
    lastLook: null,
    recoveryRequired: false,
    recoveryIntent: null,
    reasons: [],
  };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
