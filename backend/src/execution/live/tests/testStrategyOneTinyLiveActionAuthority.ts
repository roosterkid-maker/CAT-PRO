import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";
import type {OpportunitySnapshot} from "../../../arbitrage/services/OpportunityService";
import type {ArbitrageLiveExecutionResult} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import type {StrategyOneTimingCalibrationRecord} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";
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
        supportedTimeInForce: ["FOK" as const],
        authoritativeFillConfirmationReady: true,
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

    await testPreArmedOneShot(directory, opportunity);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "V111/V125 Tiny-LIVE authority passed: funded three-second authority plus durable exact-route pre-arm, claim-before-authority, expiry/disarm, one execution and no automatic retry; no exchange order occurred.",
  );
}

async function testPreArmedOneShot(
  directory: string,
  opportunity: ArbitrageOpportunity,
): Promise<void> {
  let clock = NOW + 100_000;
  let executionCalls = 0;
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
        supportedTimeInForce: ["FOK" as const],
        authoritativeFillConfirmationReady: true,
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
      supportedTimeInForce: ["FOK" as const],
      authoritativeFillConfirmationReady: true,
    }),
    getOpportunity: (id: string) => id === opportunity.id ? opportunity : null,
    previewAction: (id: string, now: number) => action.preview(id, now),
    authorizeAction: (id: string, phrase: string, now: number) => {
      assert.equal(
        service.getDiagnostics(now).records[0]?.state,
        "CLAIMED",
        "The durable arm must be consumed before order authority is minted.",
      );
      return action.authorize(id, phrase, now);
    },
    execute: async (item: ArbitrageOpportunity, authorityId: string) => {
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

function preflightFixture(now: number): StrategyOnePilotPreflightRunReport {
  return {
    version: "115.0",
    generatedAt: now,
    mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT",
    decision: "CORE_PREFLIGHT_PASSED",
    approvedForActivationReview: true,
    expectedOpportunityId: "opportunity-v111",
    preview: {
      version: "115.0",
      generatedAt: now,
      mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW",
      state: "READY_FOR_OPERATOR_PREFLIGHT",
      requestedCapitalPerLegInr: 500,
      minimumTwoLegInventoryInr: 1_000,
      minimumCurrentNetProfitPercent: 0.5,
      maximumOpportunityAgeMs: 10_000,
      maximumExecutionGradeBookAgeMs: 250,
      maximumDispatchReservedBookAgeMs: 190,
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
        opportunityId: "opportunity-v111",
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
        apiPermissionBoundary: {} as never,
        timing: {
          schemaVersion: "115.0",
          generatedAt: now,
          routeKey: "BTCUSDT:binance->bybit",
          market: "BTCUSDT",
          buyExchange: "binance",
          sellExchange: "bybit",
          state: "READY",
          absoluteBookAgeCeilingMs: 250,
          dispatchSafetyMarginMs: 10,
          requiredOperationalHeadroomMs: 10,
          decisionToExecutionStartP99Ms: 5,
          dispatchBudgetMs: 15,
          maximumBookAgeMs: 235,
          executionGradeBuyAgeP99Ms: 100,
          executionGradeSellAgeP99Ms: 100,
          executionGradeWorstAgeP99Ms: 100,
          residualOperationalHeadroomMs: 135,
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
        } as never,
        stress: {status: "PASSED", reasons: []} as never,
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

function executionFixture(): ArbitrageLiveExecutionResult {
  return {
    success: true,
    status: "COMPLETED",
    opportunityId: "opportunity-v111",
    market: "BTCUSDT",
    requestedQuantity: 0.001,
    buyExchange: "binance",
    sellExchange: "bybit",
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
