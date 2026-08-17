import assert
  from "node:assert/strict";

import type {
  HedgeInventoryAssetAssessment,
  HedgeInventoryExposureSnapshot,
} from "../hedge-inventory-management/HedgeInventoryExposureEvaluator";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import {
  HedgeInventoryShadowTargetPlanner,
} from "../hedge-inventory-management/HedgeInventoryShadowTargetPlanner";

const EXECUTION_BLOCKERS = [
  "HEDGE_VENUE_NOT_SELECTED",
  "EXECUTION_MARKET_NOT_VERIFIED",
  "EXECUTABLE_DEPTH_NOT_EVALUATED",
  "HEDGE_FEES_NOT_EVALUATED",
  "HEDGE_SLIPPAGE_NOT_EVALUATED",
  "BASIS_CORRELATION_RISK_NOT_EVALUATED",
  "RISK_APPROVAL_NOT_EVALUATED",
  "CAPITAL_NOT_RESERVED",
] as const;

function main():
  void {
  const configuration =
    createHedgeInventoryManagementConfiguration({
      enabled:
        true,
      mode:
        "SHADOW",
      valuationQuoteAsset:
        "USDT",
      assetAllowlist: [
        "BTC",
        "ETH",
        "SOL",
        "XRP",
      ],
      targetInventoryByAsset: {
        BTC:
          0.25,
        ETH:
          2,
        SOL:
          10,
        XRP:
          100,
      },
      maximumDeviationQuoteValue:
        100,
      exposureLimitQuoteValue:
        500,
      hedgeRatio:
        0.75,
      hedgeVenueAllowlist: [
        "coindcx",
        "binance",
      ],
      maximumExposureAgeMs:
        500,
    });

  const exposure =
    createExposureSnapshot();

  const planner =
    new HedgeInventoryShadowTargetPlanner();

  const snapshot =
    planner.plan(
      configuration,
      exposure,
      1_100,
    );

  assert.equal(
    snapshot.version,
    "22.2",
  );

  assert.equal(
    snapshot.evidenceStatus,
    "AVAILABLE",
  );

  assert.deepEqual(
    snapshot.summary,
    {
      configuredAssets:
        4,
      hedgeRequiredAssets:
        2,
      modeledTargets:
        2,
      notRequiredAssets:
        1,
      blockedAssets:
        1,
      totalModeledTargetQuoteValue:
        1_237.5,
      actionableTargets:
        0,
      intentsGenerated:
        0,
    },
  );

  const btc =
    getTarget(
      snapshot,
      "BTC",
    );

  assert.deepEqual(
    {
      id:
        btc.id,
      state:
        btc.state,
      side:
        btc.side,
      urgency:
        btc.urgency,
      targetQuantity:
        btc.modeledTargetQuantity,
      targetQuoteValue:
        btc.modeledTargetQuoteValue,
      residualQuantity:
        btc.modeledResidualDeviationQuantity,
      residualQuoteValue:
        btc.modeledResidualDeviationQuoteValue,
      residualState:
        btc.modeledResidualState,
      candidateVenues:
        btc.candidateVenues,
      selectedVenue:
        btc.selectedVenue,
      executionMarket:
        btc.executionMarket,
      blockers:
        btc.blockers,
    },
    {
      id:
        "hedge-inventory-management:target:1000:BTC",
      state:
        "TARGET_MODELED",
      side:
        "SELL",
      urgency:
        "URGENT",
      targetQuantity:
        0.1125,
      targetQuoteValue:
        1_125,
      residualQuantity:
        0.0375,
      residualQuoteValue:
        375,
      residualState:
        "HEDGE_REVIEW",
      candidateVenues: [
        "binance",
        "coindcx",
      ],
      selectedVenue:
        null,
      executionMarket:
        null,
      blockers:
        EXECUTION_BLOCKERS,
    },
  );

  const sol =
    getTarget(
      snapshot,
      "SOL",
    );

  assert.deepEqual(
    {
      side:
        sol.side,
      targetQuantity:
        sol.modeledTargetQuantity,
      targetQuoteValue:
        sol.modeledTargetQuoteValue,
      residualQuantity:
        sol.modeledResidualDeviationQuantity,
      residualQuoteValue:
        sol.modeledResidualDeviationQuoteValue,
      residualState:
        sol.modeledResidualState,
    },
    {
      side:
        "BUY",
      targetQuantity:
        0.75,
      targetQuoteValue:
        112.5,
      residualQuantity:
        -0.25,
      residualQuoteValue:
        37.5,
      residualState:
        "WITHIN_TARGET",
    },
  );

  const eth =
    getTarget(
      snapshot,
      "ETH",
    );

  assert.deepEqual(
    {
      state:
        eth.state,
      side:
        eth.side,
      targetQuantity:
        eth.modeledTargetQuantity,
      blockers:
        eth.blockers,
    },
    {
      state:
        "NOT_REQUIRED",
      side:
        "NONE",
      targetQuantity:
        0,
      blockers:
        [],
    },
  );

  const xrp =
    getTarget(
      snapshot,
      "XRP",
    );

  assert.deepEqual(
    {
      evidenceStatus:
        xrp.evidenceStatus,
      state:
        xrp.state,
      targetQuantity:
        xrp.modeledTargetQuantity,
      blockers:
        xrp.blockers,
    },
    {
      evidenceStatus:
        "NO_DATA",
      state:
        "BLOCKED",
      targetQuantity:
        null,
      blockers: [
        "ASSET_EXPOSURE_EVIDENCE_UNAVAILABLE",
      ],
    },
  );

  assert.equal(
    "proposedMode" in
      btc,
    false,
    "A V22.2 target must not masquerade as StrategyIntent.",
  );

  assert.equal(
    "proposalType" in
      btc,
    false,
  );

  assert.deepEqual(
    btc.recursionProtection,
    {
      sourceStrategyId:
        "hedge-inventory-management",
      parentIntentId:
        null,
      recursionDepth:
        0,
      maximumRecursionDepth:
        0,
      recursiveHedgeAllowed:
        false,
    },
  );

  assert.equal(
    snapshot.safety
      .targetIsHedgeProposal,
    false,
  );

  assert.equal(
    snapshot.safety
      .targetIsStrategyIntent,
    false,
  );

  assert.equal(
    snapshot.safety
      .hedgeIntentGenerationAllowed,
    false,
  );

  assert.equal(
    snapshot.safety
      .orderSubmissionAllowed,
    false,
  );

  assert.equal(
    Object.isFrozen(
      snapshot,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      snapshot.targets,
    ),
    true,
  );

  const stale =
    planner.plan(
      configuration,
      exposure,
      1_501,
    );

  assert.equal(
    stale.evidenceStatus,
    "NO_DATA",
  );

  assert.deepEqual(
    stale.blockers,
    [
      "EXPOSURE_EVIDENCE_STALE",
    ],
  );

  const unavailable =
    planner.plan(
      configuration,
      {
        ...exposure,
        evidenceStatus:
          "NO_DATA",
      },
      1_100,
    );

  assert.deepEqual(
    unavailable.blockers,
    [
      "EXPOSURE_EVIDENCE_UNAVAILABLE",
    ],
  );

  const invalid =
    planner.plan(
      configuration,
      {
        ...exposure,
        assessments:
          exposure.assessments.map(
            (assessment) =>
              assessment.asset ===
                "BTC"
                ? {
                    ...assessment,
                    direction:
                      "BALANCED" as const,
                  }
                : assessment,
          ),
      },
      1_100,
    );

  assert.deepEqual(
    getTarget(
      invalid,
      "BTC",
    ).blockers,
    [
      "INVALID_DEVIATION_EVIDENCE",
    ],
  );

  assert.throws(
    () =>
      planner.plan(
        configuration,
        exposure,
        0,
      ),
    /positive finite number/,
  );

  console.log(
    "Hedge / inventory-management V22.2 SHADOW target-planning test passed.",
  );

  console.log(
    "Deviation targets and residual exposure were modeled only; venue, depth, fees, slippage, risk, capital, intent, PAPER, LIVE and order gates remained blocked.",
  );
}

function createExposureSnapshot():
  HedgeInventoryExposureSnapshot {
  return {
    version:
      "22.1",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      1_100,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    controllerRunning:
      true,
    source:
      "PortfolioSnapshot",
    sourceGeneratedAt:
      1_000,
    sourceAgeMs:
      100,
    sourceExpiresAt:
      1_500,
    valuationQuoteAsset:
      "USDT",
    summary: {
      configuredAssets:
        4,
      assessedAssets:
        3,
      withinTargetAssets:
        1,
      hedgeReviewAssets:
        1,
      exposureLimitBreachedAssets:
        1,
      unavailableAssets:
        1,
      grossDeviationQuoteValue:
        1_700,
      hedgeActionableAssets:
        0,
    },
    assessments: [
      createAvailableAssessment({
        asset:
          "BTC",
        actualQuantity:
          0.4,
        targetQuantity:
          0.25,
        deviationQuantity:
          0.15,
        direction:
          "EXCESS",
        unitPriceQuote:
          10_000,
        actualQuoteValue:
          4_000,
        deviationQuoteValue:
          1_500,
        state:
          "EXPOSURE_LIMIT_BREACHED",
        hedgeUrgency:
          "URGENT",
      }),
      createAvailableAssessment({
        asset:
          "ETH",
        actualQuantity:
          1.75,
        targetQuantity:
          2,
        deviationQuantity:
          -0.25,
        direction:
          "DEFICIT",
        unitPriceQuote:
          200,
        actualQuoteValue:
          350,
        deviationQuoteValue:
          50,
        state:
          "WITHIN_TARGET",
        hedgeUrgency:
          "NONE",
      }),
      createAvailableAssessment({
        asset:
          "SOL",
        actualQuantity:
          9,
        targetQuantity:
          10,
        deviationQuantity:
          -1,
        direction:
          "DEFICIT",
        unitPriceQuote:
          150,
        actualQuoteValue:
          1_350,
        deviationQuoteValue:
          150,
        state:
          "HEDGE_REVIEW",
        hedgeUrgency:
          "NORMAL",
      }),
      {
        asset:
          "XRP",
        evidenceStatus:
          "NO_DATA",
        actualQuantity:
          null,
        targetQuantity:
          100,
        deviationQuantity:
          null,
        direction:
          "UNKNOWN",
        unitPriceQuote:
          null,
        actualQuoteValue:
          null,
        deviationQuoteValue:
          null,
        maximumDeviationQuoteValue:
          100,
        exposureLimitQuoteValue:
          500,
        state:
          "NO_DATA",
        hedgeUrgency:
          "UNKNOWN",
        observedExchanges:
          [],
        newestBalanceSynchronizedAt:
          null,
        oldestBalanceAgeMs:
          null,
        oldestValuationAgeMs:
          null,
        blockers: [
          "ASSET_BALANCE_NOT_REPORTED",
        ],
      },
    ],
    blockers:
      [],
    notes:
      [],
    safety: {
      readOnlyExposureEvidence:
        true,
      classificationIsExecutionInstruction:
        false,
      hedgeProposalGenerated:
        false,
      hedgeIntentGenerated:
        false,
      portfolioMutationAllowed:
        false,
      balanceMutationAllowed:
        false,
      recoveryActionAllowed:
        false,
      capitalReservationAllowed:
        false,
      paperExecutionAllowed:
        false,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    },
  };
}

function createAvailableAssessment(
  input: {
    asset: string;
    actualQuantity: number;
    targetQuantity: number;
    deviationQuantity: number;
    direction: "EXCESS" | "DEFICIT" | "BALANCED";
    unitPriceQuote: number;
    actualQuoteValue: number;
    deviationQuoteValue: number;
    state:
      | "WITHIN_TARGET"
      | "HEDGE_REVIEW"
      | "EXPOSURE_LIMIT_BREACHED";
    hedgeUrgency:
      | "NONE"
      | "NORMAL"
      | "URGENT";
  },
): HedgeInventoryAssetAssessment {
  return {
    ...input,
    evidenceStatus:
      "AVAILABLE",
    maximumDeviationQuoteValue:
      100,
    exposureLimitQuoteValue:
      500,
    observedExchanges: [
      "binance",
    ],
    newestBalanceSynchronizedAt:
      950,
    oldestBalanceAgeMs:
      150,
    oldestValuationAgeMs:
      150,
    blockers:
      [],
  };
}

function getTarget(
  snapshot: {
    targets: ReturnType<
      HedgeInventoryShadowTargetPlanner["plan"]
    >["targets"];
  },
  asset:
    string,
) {
  const target =
    snapshot.targets.find(
      (candidate) =>
        candidate.asset ===
        asset,
    );

  assert.ok(
    target,
    `Expected ${asset} target.`,
  );

  return target;
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
