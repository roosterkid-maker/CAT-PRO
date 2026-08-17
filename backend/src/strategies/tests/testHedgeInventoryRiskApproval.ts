import assert
  from "node:assert/strict";

import type {
  RiskAssessment,
} from "../../risk/models/RiskAssessment";

import type {
  HedgeInventoryBasisRiskSnapshot,
} from "../hedge-inventory-management/HedgeInventoryBasisRiskEvaluator";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import {
  HedgeInventoryRiskApprovalEvaluator,
} from "../hedge-inventory-management/HedgeInventoryRiskApprovalEvaluator";

import type {
  HedgeInventoryRiskApprovalEvidence,
  HedgeInventoryRiskApprovalEvidenceSnapshot,
} from "../hedge-inventory-management/HedgeInventoryRiskApprovalEvaluator";

const NOW =
  1_100;

function main():
  void {
  const evaluator =
    new HedgeInventoryRiskApprovalEvaluator();

  const configuration =
    createConfiguration(
      true,
    );

  assert.deepEqual(
    configuration.riskApproval,
    {
      enabled:
        true,
      maximumAssessmentAgeMs:
        100,
      state:
        "READY",
      blockers:
        [],
    },
  );

  const approved =
    evaluator.evaluate(
      configuration,
      createBasisRiskSnapshot(),
      createEvidence(),
      NOW,
    );

  assert.equal(
    approved.version,
    "22.7",
  );

  assert.deepEqual(
    approved.summary,
    {
      basisRiskPassingRoutes:
        1,
      evidenceRecordsMatched:
        1,
      riskApprovalsGranted:
        1,
      riskRejections:
        0,
      blockedRoutes:
        0,
      minimumObservedRiskScore:
        92,
      actionableRoutes:
        0,
      capitalReservations:
        0,
      intentsGenerated:
        0,
    },
  );

  const assessment =
    approved.assessments[0];

  assert.ok(
    assessment,
  );

  assert.deepEqual(
    {
      state:
        assessment.state,
      evidenceStatus:
        assessment.evidenceStatus,
      assessmentAgeMs:
        assessment.assessmentAgeMs,
      evidenceSource:
        assessment.evidenceSource,
      riskLevel:
        assessment.riskLevel,
      riskScore:
        assessment.riskScore,
      approval:
        assessment.riskApprovalGranted,
      blockers:
        assessment.blockers,
      remainingGates:
        assessment.remainingGates,
    },
    {
      state:
        "RISK_APPROVED",
      evidenceStatus:
        "AVAILABLE",
      assessmentAgeMs:
        15,
      evidenceSource:
        "CANONICAL_RISK_ENGINE",
      riskLevel:
        "LOW",
      riskScore:
        92,
      approval:
        true,
      blockers:
        [],
      remainingGates: [
        "CAPITAL_NOT_RESERVED",
        "STRATEGY_INTENT_NOT_GENERATED",
      ],
    },
    "V22.7 must preserve an exact, fresh canonical RiskEngine approval without converting it into execution authority.",
  );

  const rejected =
    evaluator.evaluate(
      configuration,
      createBasisRiskSnapshot(),
      createEvidence(
        {},
        {
          approved:
            false,
          level:
            "HIGH",
          score:
            55,
          reasons: [
            "Execution confidence is below the configured threshold.",
          ],
          warnings: [
            "Execution quality requires review.",
          ],
          checks: {
            marketIntegrity:
              true,
            executionQuality:
              false,
            capitalAvailable:
              true,
            exposureAllowed:
              true,
            dailyLimitsAllowed:
              true,
          },
        },
      ),
      NOW,
    );

  assert.deepEqual(
    {
      state:
        rejected.assessments[0]
          ?.state,
      evidenceStatus:
        rejected.assessments[0]
          ?.evidenceStatus,
      approval:
        rejected.assessments[0]
          ?.riskApprovalGranted,
      blockers:
        rejected.assessments[0]
          ?.blockers,
      reasons:
        rejected.assessments[0]
          ?.reasons,
    },
    {
      state:
        "RISK_REJECTED",
      evidenceStatus:
        "AVAILABLE",
      approval:
        false,
      blockers: [
        "RISK_ENGINE_REJECTED",
      ],
      reasons: [
        "Execution confidence is below the configured threshold.",
      ],
    },
    "A genuine canonical rejection must remain rejection evidence, not NO_DATA or approval.",
  );

  const stale =
    evaluator.evaluate(
      configuration,
      createBasisRiskSnapshot(),
      createEvidence({
        assessedAt:
          999,
      }),
      NOW,
    );

  assert.deepEqual(
    stale.assessments[0]
      ?.blockers,
    [
      "ASSESSMENT_STALE",
    ],
  );
  assert.equal(
    stale.assessments[0]
      ?.evidenceStatus,
    "NO_DATA",
  );

  const wrongMarket =
    evaluator.evaluate(
      configuration,
      createBasisRiskSnapshot(),
      createEvidence({
        market:
          "ETHUSDT",
      }),
      NOW,
    );

  assert.deepEqual(
    wrongMarket.assessments[0]
      ?.blockers,
    [
      "RISK_ASSESSMENT_NOT_FOUND",
    ],
    "Risk approval evidence from another route must never be substituted.",
  );

  const evidence =
    createEvidence();

  const ambiguous =
    evaluator.evaluate(
      configuration,
      createBasisRiskSnapshot(),
      {
        ...evidence,
        records: [
          evidence.records[0]!,
          evidence.records[0]!,
        ],
      },
      NOW,
    );

  assert.deepEqual(
    ambiguous.assessments[0]
      ?.blockers,
    [
      "AMBIGUOUS_RISK_ASSESSMENT",
    ],
  );

  const invalidAssessment =
    evaluator.evaluate(
      configuration,
      createBasisRiskSnapshot(),
      createEvidence(
        {},
        {
          score:
            101,
        },
      ),
      NOW,
    );

  assert.deepEqual(
    invalidAssessment.assessments[0]
      ?.blockers,
    [
      "INVALID_RISK_ASSESSMENT",
    ],
  );

  const basisRejected =
    createBasisRiskSnapshot();

  const blockedByBasis =
    evaluator.evaluate(
      configuration,
      {
        ...basisRejected,
        assessments: [
          {
            ...basisRejected.assessments[0]!,
            state:
              "RISK_REJECTED",
            blockers: [
              "CORRELATION_BELOW_MINIMUM",
            ],
            remainingGates:
              [],
          },
        ],
      },
      createEvidence(),
      NOW,
    );

  assert.deepEqual(
    blockedByBasis.assessments[0]
      ?.blockers,
    [
      "BASIS_RISK_NOT_PASSED",
    ],
  );

  const disabled =
    evaluator.evaluate(
      createConfiguration(
        false,
      ),
      createBasisRiskSnapshot(),
      createEvidence(),
      NOW,
    );

  assert.deepEqual(
    disabled.blockers,
    [
      "RISK_APPROVAL_CONFIGURATION_NOT_READY",
    ],
  );

  const unavailable =
    evaluator.evaluate(
      configuration,
      createBasisRiskSnapshot(),
      null,
      NOW,
    );

  assert.deepEqual(
    unavailable.blockers,
    [
      "RISK_APPROVAL_EVIDENCE_UNAVAILABLE",
    ],
  );

  assert.equal(
    approved.safety.strategyCallsRiskEngineDirectly,
    false,
  );
  assert.equal(
    approved.safety.approvalIsExecutionAuthorization,
    false,
  );
  assert.equal(
    approved.safety.capitalReserved,
    false,
  );
  assert.equal(
    approved.safety.paperExecutionAllowed,
    false,
  );
  assert.equal(
    approved.safety.liveExecutionAllowed,
    false,
  );
  assert.equal(
    approved.safety.orderSubmissionAllowed,
    false,
  );
  assert.equal(
    Object.isFrozen(
      approved,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      approved.assessments[0]
        ?.riskChecks,
    ),
    true,
  );

  console.log(
    "Hedge inventory V22.7 canonical RiskEngine approval evidence tests passed.",
  );

  console.log(
    "No direct RiskEngine call, capital reservation, intent, PAPER, LIVE or order action occurred.",
  );
}

function createConfiguration(
  riskApprovalEnabled:
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
        true,
      maximumEvidenceAgeMs:
        100,
      maximumBasisDeviationPercent:
        0.5,
      minimumCorrelationCoefficient:
        0.9,
      minimumCorrelationObservations:
        30,
    },
    riskApproval: {
      enabled:
        riskApprovalEnabled,
      maximumAssessmentAgeMs:
        100,
    },
  });
}

function createEvidence(
  evidenceOverrides: Partial<HedgeInventoryRiskApprovalEvidence> = {},
  assessmentOverrides: Partial<RiskAssessment> = {},
): HedgeInventoryRiskApprovalEvidenceSnapshot {
  const assessment:
    RiskAssessment = {
    level:
      "LOW",
    approved:
      true,
    score:
      92,
    reasons: [
      "Unified risk assessment passed all configured checks.",
    ],
    warnings:
      [],
    checks: {
      marketIntegrity:
        true,
      executionQuality:
        true,
      capitalAvailable:
        true,
      exposureAllowed:
        true,
      dailyLimitsAllowed:
        true,
    },
    ...assessmentOverrides,
  };

  return {
    generatedAt:
      1_090,
    records: [
      {
        basisRiskAssessmentId:
          "hedge-inventory-management:target:1000:BTC:market-rules:post-rule-economics:basis-risk",
        routeId:
          "hedge-inventory-management:target:1000:BTC:route",
        venue:
          "coindcx",
        market:
          "BTCUSDT",
        asset:
          "BTC",
        quoteAsset:
          "USDT",
        side:
          "SELL",
        assessedAt:
          1_085,
        source:
          "CANONICAL_RISK_ENGINE",
        assessment,
        ...evidenceOverrides,
      },
    ],
  };
}

function createBasisRiskSnapshot():
  HedgeInventoryBasisRiskSnapshot {
  return {
    version:
      "22.6",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      1_090,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    postRuleEconomicsConfigurationState:
      "READY",
    basisRiskConfigurationState:
      "READY",
    sourcePostRuleEconomicsGeneratedAt:
      1_080,
    sourceBasisRiskEvidenceGeneratedAt:
      1_085,
    thresholds: {
      maximumEvidenceAgeMs:
        100,
      maximumBasisDeviationPercent:
        0.5,
      minimumCorrelationCoefficient:
        0.9,
      minimumCorrelationObservations:
        30,
    },
    summary: {
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
    assessments: [
      {
        id:
          "hedge-inventory-management:target:1000:BTC:market-rules:post-rule-economics:basis-risk",
        postRuleEconomicsAssessmentId:
          "hedge-inventory-management:target:1000:BTC:market-rules:post-rule-economics",
        routeId:
          "hedge-inventory-management:target:1000:BTC:route",
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
          "RISK_PASS",
        sourcePostRuleEconomicsState:
          "REVALIDATED",
        sourceEvidenceObservedAt:
          1_085,
        evidenceAgeMs:
          15,
        hedgeQuantity:
          0.1,
        hedgeVwapPrice:
          10_002,
        referencePrice:
          10_000,
        signedBasisDeviationPercent:
          0.02,
        absoluteBasisDeviationPercent:
          0.02,
        maximumBasisDeviationPercent:
          0.5,
        correlationCoefficient:
          0.97,
        minimumCorrelationCoefficient:
          0.9,
        correlationObservations:
          60,
        minimumCorrelationObservations:
          30,
        correlationWindowMs:
          60_000,
        evidenceSource:
          "SYNCHRONIZED_RETURN_SERIES",
        blockers:
          [],
        remainingGates: [
          "RISK_APPROVAL_NOT_EVALUATED",
          "CAPITAL_NOT_RESERVED",
          "STRATEGY_INTENT_NOT_GENERATED",
        ],
        riskApprovalGranted:
          false,
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
      readOnlyBasisCorrelationEvidence:
        true,
      screenIsRiskEngineApproval:
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
