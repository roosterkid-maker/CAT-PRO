import assert
  from "node:assert/strict";

import {
  HedgeInventoryBasisRiskEvaluator,
} from "../hedge-inventory-management/HedgeInventoryBasisRiskEvaluator";

import type {
  HedgeInventoryBasisRiskEvidence,
  HedgeInventoryBasisRiskEvidenceSnapshot,
} from "../hedge-inventory-management/HedgeInventoryBasisRiskEvaluator";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import type {
  HedgeInventoryPostRuleEconomicsSnapshot,
} from "../hedge-inventory-management/HedgeInventoryPostRuleEconomicsEvaluator";

const NOW =
  1_100;

function main():
  void {
  const evaluator =
    new HedgeInventoryBasisRiskEvaluator();

  const configuration =
    createConfiguration(
      true,
    );

  assert.deepEqual(
    configuration.basisRisk,
    {
      enabled:
        true,
      maximumEvidenceAgeMs:
        100,
      maximumBasisDeviationPercent:
        0.5,
      minimumCorrelationCoefficient:
        0.9,
      minimumCorrelationObservations:
        30,
      state:
        "READY",
      blockers:
        [],
    },
  );

  const passing =
    evaluator.evaluate(
      configuration,
      createPostRuleSnapshot(),
      createEvidence(),
      NOW,
    );

  assert.equal(
    passing.version,
    "22.6",
  );

  assert.deepEqual(
    passing.summary,
    {
      revalidatedRoutes:
        1,
      evidenceRecordsMatched:
        1,
      riskPassingRoutes:
        1,
      riskRejectedRoutes:
        0,
      blockedRoutes:
        0,
      maximumObservedBasisDeviationPercent:
        0.02,
      minimumObservedCorrelationCoefficient:
        0.97,
      actionableRoutes:
        0,
      riskApprovalsGranted:
        0,
      intentsGenerated:
        0,
    },
  );

  const assessment =
    passing.assessments[0];

  assert.ok(
    assessment,
  );

  assert.deepEqual(
    {
      state:
        assessment.state,
      evidenceStatus:
        assessment.evidenceStatus,
      evidenceAgeMs:
        assessment.evidenceAgeMs,
      hedgeVwapPrice:
        assessment.hedgeVwapPrice,
      referencePrice:
        assessment.referencePrice,
      signedBasisDeviationPercent:
        assessment.signedBasisDeviationPercent,
      absoluteBasisDeviationPercent:
        assessment.absoluteBasisDeviationPercent,
      correlationCoefficient:
        assessment.correlationCoefficient,
      correlationObservations:
        assessment.correlationObservations,
      evidenceSource:
        assessment.evidenceSource,
      blockers:
        assessment.blockers,
      remainingGates:
        assessment.remainingGates,
    },
    {
      state:
        "RISK_PASS",
      evidenceStatus:
        "AVAILABLE",
      evidenceAgeMs:
        15,
      hedgeVwapPrice:
        10_002,
      referencePrice:
        10_000,
      signedBasisDeviationPercent:
        0.02,
      absoluteBasisDeviationPercent:
        0.02,
      correlationCoefficient:
        0.97,
      correlationObservations:
        60,
      evidenceSource:
        "SYNCHRONIZED_RETURN_SERIES",
      blockers:
        [],
      remainingGates: [
        "RISK_APPROVAL_NOT_EVALUATED",
        "CAPITAL_NOT_RESERVED",
        "STRATEGY_INTENT_NOT_GENERATED",
      ],
    },
    "V22.6 must pass only fresh, explicit, route-matched basis and synchronized-return correlation evidence.",
  );

  const excessiveBasis =
    evaluator.evaluate(
      configuration,
      createPostRuleSnapshot(),
      createEvidence({
        referencePrice:
          9_900,
      }),
      NOW,
    );

  assert.equal(
    excessiveBasis.assessments[0]
      ?.state,
    "RISK_REJECTED",
  );
  assert.deepEqual(
    excessiveBasis.assessments[0]
      ?.blockers,
    [
      "BASIS_DEVIATION_LIMIT_EXCEEDED",
    ],
  );

  const weakCorrelation =
    evaluator.evaluate(
      configuration,
      createPostRuleSnapshot(),
      createEvidence({
        correlationCoefficient:
          0.75,
      }),
      NOW,
    );

  assert.deepEqual(
    {
      state:
        weakCorrelation.assessments[0]
          ?.state,
      evidenceStatus:
        weakCorrelation.assessments[0]
          ?.evidenceStatus,
      blockers:
        weakCorrelation.assessments[0]
          ?.blockers,
    },
    {
      state:
        "RISK_REJECTED",
      evidenceStatus:
        "AVAILABLE",
      blockers: [
        "CORRELATION_BELOW_MINIMUM",
      ],
    },
  );

  const insufficientHistory =
    evaluator.evaluate(
      configuration,
      createPostRuleSnapshot(),
      createEvidence({
        correlationObservations:
          29,
      }),
      NOW,
    );

  assert.deepEqual(
    {
      state:
        insufficientHistory.assessments[0]
          ?.state,
      evidenceStatus:
        insufficientHistory.assessments[0]
          ?.evidenceStatus,
      blockers:
        insufficientHistory.assessments[0]
          ?.blockers,
    },
    {
      state:
        "BLOCKED",
      evidenceStatus:
        "NO_DATA",
      blockers: [
        "INSUFFICIENT_CORRELATION_OBSERVATIONS",
      ],
    },
    "Too few synchronized returns must be missing evidence, not a fabricated correlation decision.",
  );

  const staleEvidence =
    evaluator.evaluate(
      configuration,
      createPostRuleSnapshot(),
      createEvidence({
        observedAt:
          999,
      }),
      NOW,
    );

  assert.deepEqual(
    staleEvidence.assessments[0]
      ?.blockers,
    [
      "EVIDENCE_STALE",
    ],
  );

  const missingRouteEvidence =
    evaluator.evaluate(
      configuration,
      createPostRuleSnapshot(),
      createEvidence(
        {
          market:
            "ETHUSDT",
        },
      ),
      NOW,
    );

  assert.deepEqual(
    missingRouteEvidence.assessments[0]
      ?.blockers,
    [
      "BASIS_RISK_EVIDENCE_NOT_FOUND",
    ],
    "V22.6 must not substitute evidence from another market.",
  );

  const disabled =
    evaluator.evaluate(
      createConfiguration(
        false,
      ),
      createPostRuleSnapshot(),
      createEvidence(),
      NOW,
    );

  assert.deepEqual(
    disabled.blockers,
    [
      "BASIS_RISK_CONFIGURATION_NOT_READY",
    ],
  );

  const unavailable =
    evaluator.evaluate(
      configuration,
      createPostRuleSnapshot(),
      null,
      NOW,
    );

  assert.deepEqual(
    unavailable.blockers,
    [
      "BASIS_RISK_EVIDENCE_UNAVAILABLE",
    ],
  );

  assert.equal(
    passing.safety.screenIsRiskEngineApproval,
    false,
  );
  assert.equal(
    passing.safety.riskApprovalGranted,
    false,
  );
  assert.equal(
    passing.safety.capitalReserved,
    false,
  );
  assert.equal(
    passing.safety.paperExecutionAllowed,
    false,
  );
  assert.equal(
    passing.safety.liveExecutionAllowed,
    false,
  );
  assert.equal(
    passing.safety.orderSubmissionAllowed,
    false,
  );
  assert.equal(
    Object.isFrozen(
      passing,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      passing.assessments,
    ),
    true,
  );

  console.log(
    "Hedge inventory V22.6 explicit basis/correlation risk tests passed.",
  );

  console.log(
    "No correlation was inferred and no RiskEngine approval, capital reservation, intent, PAPER, LIVE or order action occurred.",
  );
}

function createConfiguration(
  basisRiskEnabled:
    boolean,
) {
  return createHedgeInventoryManagementConfiguration({
    enabled:
      true,
    mode:
      "SHADOW",
    valuationQuoteAsset:
      "USDT",
    assetAllowlist: [
      "BTC",
    ],
    targetInventoryByAsset: {
      BTC:
        0.25,
    },
    maximumDeviationQuoteValue:
      100,
    exposureLimitQuoteValue:
      500,
    hedgeRatio:
      0.75,
    hedgeVenueAllowlist: [
      "coindcx",
    ],
    maximumExposureAgeMs:
      500,
    routeEconomics: {
      enabled:
        true,
      maximumOrderBookAgeMs:
        100,
      maximumFeeAgeMs:
        100,
      maximumSlippagePercent:
        0.5,
    },
    marketRules: {
      enabled:
        true,
      maximumCapabilityAgeMs:
        100,
      maximumQuantizationLossPercent:
        1,
    },
    postRuleEconomics: {
      enabled:
        true,
    },
    basisRisk: {
      enabled:
        basisRiskEnabled,
      maximumEvidenceAgeMs:
        100,
      maximumBasisDeviationPercent:
        0.5,
      minimumCorrelationCoefficient:
        0.9,
      minimumCorrelationObservations:
        30,
    },
  });
}

function createEvidence(
  overrides: Partial<HedgeInventoryBasisRiskEvidence> = {},
): HedgeInventoryBasisRiskEvidenceSnapshot {
  return {
    generatedAt:
      1_090,
    records: [
      {
        venue:
          "coindcx",
        market:
          "BTCUSDT",
        asset:
          "BTC",
        quoteAsset:
          "USDT",
        observedAt:
          1_085,
        referencePrice:
          10_000,
        correlationCoefficient:
          0.97,
        correlationObservations:
          60,
        correlationWindowMs:
          60_000,
        source:
          "SYNCHRONIZED_RETURN_SERIES",
        ...overrides,
      },
    ],
  };
}

function createPostRuleSnapshot():
  HedgeInventoryPostRuleEconomicsSnapshot {
  return {
    version:
      "22.5",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      1_090,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    routeEconomicsConfigurationState:
      "READY",
    marketRuleConfigurationState:
      "READY",
    postRuleEconomicsConfigurationState:
      "READY",
    sourceRouteGeneratedAt:
      1_070,
    sourceMarketRuleGeneratedAt:
      1_080,
    sourceRouteEvidenceGeneratedAt:
      1_085,
    summary: {
      marketRuleAssessments:
        1,
      routesRequiringRevalidation:
        1,
      routesRevalidated:
        1,
      routesRejected:
        0,
      blockedRoutes:
        0,
      changedQuantityRoutes:
        1,
      revalidatedFeeQuoteValue:
        1.68,
      revalidatedSlippageQuoteValue:
        0.31,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
    assessments: [
      {
        id:
          "hedge-inventory-management:target:1000:BTC:market-rules:post-rule-economics",
        routeId:
          "hedge-inventory-management:target:1000:BTC:route",
        marketRuleAssessmentId:
          "hedge-inventory-management:target:1000:BTC:market-rules",
        asset:
          "BTC",
        quoteAsset:
          "USDT",
        side:
          "SELL",
        venue:
          "coindcx",
        market:
          "BTCUSDT",
        evidenceStatus:
          "AVAILABLE",
        state:
          "REVALIDATED",
        sourceMarketRuleState:
          "RULES_PASS",
        originalTargetQuantity:
          0.1125,
        quantizedQuantity:
          0.112,
        quantityChanged:
          true,
        originalEconomics: {
          vwapPrice:
            10_002.2,
          estimatedFeeQuoteValue:
            1.687,
          estimatedSlippageQuoteValue:
            0.312,
          modeledAllInQuoteValue:
            1_123.5,
        },
        revalidatedEconomics: {
          requestedQuantity:
            0.112,
          vwapPrice:
            10_002,
          executableQuantity:
            0.112,
          estimatedFeeQuoteValue:
            1.68,
          estimatedSlippageQuoteValue:
            0.31,
          modeledAllInQuoteValue:
            1_118.5,
        },
        candidateBlockers:
          [],
        blockers:
          [],
        remainingGates: [
          "BASIS_CORRELATION_RISK_NOT_EVALUATED",
          "RISK_APPROVAL_NOT_EVALUATED",
          "CAPITAL_NOT_RESERVED",
          "STRATEGY_INTENT_NOT_GENERATED",
        ],
        executionAuthorized:
          false,
        actionable:
          false,
        intentGenerated:
          false,
      },
    ],
    blockers:
      [],
    notes:
      [],
    safety: {
      readOnlyRevalidationEvidence:
        true,
      revalidationIsExecutionApproval:
        false,
      basisCorrelationRiskEvaluated:
        false,
      riskApprovalGranted:
        false,
      capitalReserved:
        false,
      hedgeIntentGenerationAllowed:
        false,
      recursiveHedgeAllowed:
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
