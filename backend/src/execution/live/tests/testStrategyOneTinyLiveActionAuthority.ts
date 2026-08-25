import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";
import type {ArbitrageLiveExecutionResult} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";
import type {StrategyOneTimingCalibrationRecord} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";
import type {StrategyOnePilotPreflightRunReport} from "../tiny-live/StrategyOnePilotPreflightService";
import {
  StrategyOneTinyLiveActionAuthorityService,
} from "../tiny-live/StrategyOneTinyLiveActionAuthorityService";

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
      runCanonicalPreflight: (input: {opportunityId: string}) => ({
        approvedForOneTimeArm: true,
        opportunityId: input.opportunityId,
        recommendedQuantity: 0.001,
        blockers: [],
        fingerprintMaterial: "canonical-controlled-live-fixture-v1",
      }),
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

    const continuousCalibration = {
      ...calibration,
      id:
        "timing-continuous",
      scope:
        "CONTINUOUS_TINY_LIVE" as const,
    };

    const dailyLimited =
      new StrategyOneTinyLiveActionAuthorityService(
        {
          ...dependencies,
          getCalibration:
            () =>
              continuousCalibration,
        },
        join(
          directory,
          "daily-limited-authorities.jsonl",
        ),
      );
    const firstDailyPreview =
      dailyLimited.preview(
        opportunity.id,
        NOW + 10,
      );
    assert.ok(
      firstDailyPreview.authority,
    );
    const firstDailyAuthority =
      dailyLimited.authorize(
        firstDailyPreview.authority.id,
        firstDailyPreview.authority.requiredAuthorizationPhrase,
        NOW + 11,
      );
    dailyLimited.consume({
      authorityId:
        firstDailyAuthority.id,
      opportunity,
      now:
        NOW + 12,
    });
    dailyLimited.finalize(
      firstDailyAuthority.id,
      executionFixture(),
      NOW + 13,
    );
    const secondDailyPreview =
      dailyLimited.preview(
        opportunity.id,
        NOW + 14,
      );
    assert.equal(
      secondDailyPreview.approvedForAuthorization,
      false,
    );
    assert.equal(
      secondDailyPreview.blockers.some(
        (blocker) =>
          blocker.includes(
            "daily attempt cap 1",
          ),
      ),
      true,
    );

    const concurrent =
      new StrategyOneTinyLiveActionAuthorityService(
        {
          ...dependencies,
          getCalibration:
            () =>
              continuousCalibration,
        },
        join(
          directory,
          "concurrent-authorities.jsonl",
        ),
        30_000,
        60_000,
        1,
      );
    const concurrentFirst =
      concurrent.preview(
        opportunity.id,
        NOW + 20,
      );
    const concurrentSecond =
      concurrent.preview(
        opportunity.id,
        NOW + 21,
      );
    assert.ok(
      concurrentFirst.authority &&
      concurrentSecond.authority,
    );
    concurrent.authorize(
      concurrentFirst.authority.id,
      concurrentFirst.authority.requiredAuthorizationPhrase,
      NOW + 22,
    );
    assert.throws(
      () =>
        concurrent.authorize(
          concurrentSecond.authority?.id ??
            "",
          concurrentSecond.authority?.requiredAuthorizationPhrase ??
            "",
          NOW + 23,
        ),
      /another Tiny-LIVE authority/iu,
    );

    let mutableOpportunity =
      opportunity;
    const materialChange =
      new StrategyOneTinyLiveActionAuthorityService(
        {
          ...dependencies,
          getOpportunity:
            () =>
              mutableOpportunity,
          getCalibration:
            () =>
              continuousCalibration,
        },
        join(
          directory,
          "material-change-authorities.jsonl",
        ),
      );
    const materialPreview =
      materialChange.preview(
        opportunity.id,
        NOW + 30,
      );
    assert.ok(
      materialPreview.authority,
    );
    const materialAuthorized =
      materialChange.authorize(
        materialPreview.authority.id,
        materialPreview.authority.requiredAuthorizationPhrase,
        NOW + 31,
      );
    mutableOpportunity = {
      ...opportunity,
      buyPrice:
        opportunity.buyPrice +
        1,
    };
    assert.throws(
      () =>
        materialChange.consume({
          authorityId:
            materialAuthorized.id,
          opportunity:
            mutableOpportunity,
          now:
            NOW + 32,
        }),
      /expired or not bound/iu,
      "A material quote change must invalidate exact opportunity authority.",
    );

    const quoteExpiry =
      new StrategyOneTinyLiveActionAuthorityService(
        {
          ...dependencies,
          getOpportunity:
            () =>
              opportunity,
          runPreflight:
            (input: {now?: number}) => {
              if (
                (
                  input.now ??
                  NOW
                ) >
                NOW + 41
              ) {
                throw new Error(
                  "Exact quote expired.",
                );
              }

              return preflightFixture(
                input.now ??
                NOW,
              );
            },
          getCalibration:
            () =>
              continuousCalibration,
        },
        join(
          directory,
          "quote-expiry-authorities.jsonl",
        ),
      );
    const expiryPreview =
      quoteExpiry.preview(
        opportunity.id,
        NOW + 40,
      );
    assert.ok(
      expiryPreview.authority,
    );
    const expiryAuthorized =
      quoteExpiry.authorize(
        expiryPreview.authority.id,
        expiryPreview.authority.requiredAuthorizationPhrase,
        NOW + 41,
      );
    assert.throws(
      () =>
        quoteExpiry.consume({
          authorityId:
            expiryAuthorized.id,
          opportunity,
          now:
            NOW + 42,
        }),
      /quote expired/iu,
    );

    const disabled = new StrategyOneTinyLiveActionAuthorityService(
      {...dependencies, runtimeGateEnabled: () => false},
      join(directory, "disabled.jsonl"),
    );
    assert.equal(disabled.preview(opportunity.id, NOW).approvedForAuthorization, false);
    assert.equal(disabled.getDiagnostics(NOW).runtimeGateEnabled, false);
    assert.equal(
      disabled.getDiagnostics(NOW).safety.authorityTtlMs,
      60_000,
      "Production authority uses a reviewable one-minute window and still revalidates fresh evidence before consumption.",
    );

    const canonicalBlocked =
      new StrategyOneTinyLiveActionAuthorityService(
        {
          ...dependencies,
          runCanonicalPreflight: (input: {opportunityId: string}) => ({
            approvedForOneTimeArm: false,
            opportunityId: input.opportunityId,
            recommendedQuantity: null,
            blockers: [
              "DYNAMIC_RECOMMENDATION_EXECUTABLE",
            ],
            fingerprintMaterial: "canonical-blocked-fixture-v1",
          }),
        },
        join(
          directory,
          "canonical-blocked-authorities.jsonl",
        ),
      );
    const canonicalBlockedPreview =
      canonicalBlocked.preview(
        opportunity.id,
        NOW,
      );
    assert.equal(
      canonicalBlockedPreview.approvedForAuthorization,
      false,
      "A legacy pilot PASS must not bypass the canonical dynamic preflight.",
    );
    assert.equal(
      canonicalBlockedPreview.authority,
      null,
    );

    const cancellable =
      new StrategyOneTinyLiveActionAuthorityService(
        dependencies,
        join(
          directory,
          "cancel-authorities.jsonl",
        ),
      );
    const cancellablePreview =
      cancellable.preview(
        opportunity.id,
        NOW,
      );
    assert.ok(
      cancellablePreview.authority,
    );
    const cancelled =
      cancellable.cancel(
        cancellablePreview.authority.id,
        `CANCEL ${cancellablePreview.authority.id}`,
        NOW + 1,
      );
    assert.equal(
      cancelled.state,
      "CANCELLED",
    );
    assert.equal(
      cancelled.liveOrderSubmissionAuthorized,
      false,
    );

  } finally {
    rmSync(directory, {recursive: true, force: true});
  }

  console.log(
    "Strategy #1 exact-opportunity authority passed: preview, explicit authorization, fresh-evidence consumption, durable pair binding, one-time use and no automatic retry; no exchange order occurred.",
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
