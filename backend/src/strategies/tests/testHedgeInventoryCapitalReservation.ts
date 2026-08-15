import assert
  from "node:assert/strict";

import type {
  CapitalReservation,
  CreateCapitalReservationResult,
} from "../../trading/capital/CapitalReservation";

import {
  HedgeInventoryCapitalReservationEvaluator,
} from "../hedge-inventory-management/HedgeInventoryCapitalReservationEvaluator";

import type {
  HedgeInventoryCapitalReservationEvidence,
  HedgeInventoryCapitalReservationEvidenceSnapshot,
} from "../hedge-inventory-management/HedgeInventoryCapitalReservationEvaluator";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import type {
  HedgeInventoryRiskApprovalSnapshot,
} from "../hedge-inventory-management/HedgeInventoryRiskApprovalEvaluator";

const NOW =
  1_100;

const RISK_APPROVAL_ID =
  "hedge-inventory-management:target:1000:BTC:market-rules:post-rule-economics:basis-risk:risk-approval";

function main():
  void {
  const evaluator =
    new HedgeInventoryCapitalReservationEvaluator();

  const configuration =
    createConfiguration(
      true,
    );

  assert.deepEqual(
    configuration.capitalReservation,
    {
      enabled:
        true,
      maximumEvidenceAgeMs:
        100,
      minimumRemainingTtlMs:
        1_000,
      state:
        "READY",
      blockers:
        [],
    },
  );

  const reserved =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      createEvidence(),
      NOW,
    );

  assert.equal(
    reserved.version,
    "22.8",
  );

  assert.deepEqual(
    reserved.summary,
    {
      riskApprovedRoutes:
        1,
      evidenceRecordsMatched:
        1,
      activeReservations:
        1,
      reservationRejections:
        0,
      blockedRoutes:
        0,
      totalReservedAmount:
        1_120.5,
      minimumObservedRemainingTtlMs:
        2_000,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
  );

  const assessment =
    reserved.assessments[0];

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
      source:
        assessment.evidenceSource,
      reservationId:
        assessment.reservationId,
      ownerType:
        assessment.reservationOwnerType,
      ownerId:
        assessment.reservationOwnerId,
      requested:
        assessment.requestedAmount,
      reserved:
        assessment.reservedAmount,
      status:
        assessment.reservationStatus,
      remainingTtlMs:
        assessment.remainingTtlMs,
      capitalReserved:
        assessment.capitalReserved,
      remainingGates:
        assessment.remainingGates,
    },
    {
      state:
        "CAPITAL_RESERVED",
      evidenceStatus:
        "AVAILABLE",
      evidenceAgeMs:
        15,
      source:
        "CAPITAL_RESERVATION_SERVICE",
      reservationId:
        "reservation-v228-btc",
      ownerType:
        "STRATEGY_RISK_APPROVAL",
      ownerId:
        RISK_APPROVAL_ID,
      requested:
        1_120.5,
      reserved:
        1_120.5,
      status:
        "ACTIVE",
      remainingTtlMs:
        2_000,
      capitalReserved:
        true,
      remainingGates: [
        "STRATEGY_INTENT_NOT_GENERATED",
      ],
    },
    "V22.8 must accept only a fresh active reservation owned by the exact risk-approved route.",
  );

  const rejected =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      createEvidence(
        {},
        {
          approved:
            false,
          reservation:
            null,
          reasons: [
            "Insufficient available trading capital.",
          ],
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
      reasons:
        rejected.assessments[0]
          ?.reservationReasons,
      blockers:
        rejected.assessments[0]
          ?.blockers,
      capitalReserved:
        rejected.assessments[0]
          ?.capitalReserved,
    },
    {
      state:
        "RESERVATION_REJECTED",
      evidenceStatus:
        "AVAILABLE",
      reasons: [
        "Insufficient available trading capital.",
      ],
      blockers: [
        "CAPITAL_RESERVATION_REJECTED",
      ],
      capitalReserved:
        false,
    },
  );

  const shortTtl =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      createEvidence(
        {},
        {},
        {
          expiresAt:
            1_900,
        },
      ),
      NOW,
    );

  assert.deepEqual(
    shortTtl.assessments[0]
      ?.blockers,
    [
      "INSUFFICIENT_REMAINING_TTL",
    ],
  );
  assert.equal(
    shortTtl.assessments[0]
      ?.evidenceStatus,
    "AVAILABLE",
  );

  const expired =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      createEvidence(
        {},
        {},
        {
          expiresAt:
            1_050,
        },
      ),
      NOW,
    );

  assert.deepEqual(
    expired.assessments[0]
      ?.blockers,
    [
      "CAPITAL_RESERVATION_EXPIRED",
    ],
  );

  const stale =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      createEvidence({
        observedAt:
          999,
      }),
      NOW,
    );

  assert.deepEqual(
    stale.assessments[0]
      ?.blockers,
    [
      "EVIDENCE_STALE",
    ],
  );
  assert.equal(
    stale.assessments[0]
      ?.evidenceStatus,
    "NO_DATA",
  );

  const wrongOwner =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      createEvidence(
        {},
        {},
        {
          ownerId:
            "another-risk-approval",
        },
      ),
      NOW,
    );

  assert.deepEqual(
    wrongOwner.assessments[0]
      ?.blockers,
    [
      "RESERVATION_OWNER_MISMATCH",
    ],
    "Capital reserved for another owner must never be reused.",
  );

  const amountMismatch =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      createEvidence(
        {},
        {},
        {
          amount:
            1_000,
        },
      ),
      NOW,
    );

  assert.deepEqual(
    amountMismatch.assessments[0]
      ?.blockers,
    [
      "RESERVATION_AMOUNT_MISMATCH",
    ],
  );

  const wrongMarket =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
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
      "CAPITAL_RESERVATION_EVIDENCE_NOT_FOUND",
    ],
  );

  const evidence =
    createEvidence();

  const ambiguous =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
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
      "AMBIGUOUS_CAPITAL_RESERVATION_EVIDENCE",
    ],
  );

  const riskRejected =
    createRiskApprovalSnapshot();

  const blockedByRisk =
    evaluator.evaluate(
      configuration,
      {
        ...riskRejected,
        assessments: [
          {
            ...riskRejected.assessments[0]!,
            state:
              "RISK_REJECTED",
            riskApprovalGranted:
              false,
            blockers: [
              "RISK_ENGINE_REJECTED",
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
    blockedByRisk.assessments[0]
      ?.blockers,
    [
      "RISK_APPROVAL_NOT_GRANTED",
    ],
  );

  const disabled =
    evaluator.evaluate(
      createConfiguration(
        false,
      ),
      createRiskApprovalSnapshot(),
      createEvidence(),
      NOW,
    );

  assert.deepEqual(
    disabled.blockers,
    [
      "CAPITAL_RESERVATION_CONFIGURATION_NOT_READY",
    ],
  );

  const unavailable =
    evaluator.evaluate(
      configuration,
      createRiskApprovalSnapshot(),
      null,
      NOW,
    );

  assert.deepEqual(
    unavailable.blockers,
    [
      "CAPITAL_RESERVATION_EVIDENCE_UNAVAILABLE",
    ],
  );

  assert.equal(
    reserved.safety.strategyCreatesReservations,
    false,
  );
  assert.equal(
    reserved.safety.strategyCommitsReservations,
    false,
  );
  assert.equal(
    reserved.safety.strategyReleasesReservations,
    false,
  );
  assert.equal(
    reserved.safety.reservationIsExecutionAuthorization,
    false,
  );
  assert.equal(
    reserved.safety.paperExecutionAllowed,
    false,
  );
  assert.equal(
    reserved.safety.liveExecutionAllowed,
    false,
  );
  assert.equal(
    reserved.safety.orderSubmissionAllowed,
    false,
  );
  assert.equal(
    Object.isFrozen(
      reserved,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      reserved.assessments,
    ),
    true,
  );

  console.log(
    "Hedge inventory V22.8 canonical capital-reservation evidence tests passed.",
  );

  console.log(
    "The strategy created, committed and released no reservation; no intent, PAPER, LIVE or order action occurred.",
  );
}

function createConfiguration(
  capitalReservationEnabled:
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
        true,
      maximumAssessmentAgeMs:
        100,
    },
    capitalReservation: {
      enabled:
        capitalReservationEnabled,
      maximumEvidenceAgeMs:
        100,
      minimumRemainingTtlMs:
        1_000,
    },
  });
}

function createEvidence(
  evidenceOverrides: Partial<HedgeInventoryCapitalReservationEvidence> = {},
  resultOverrides: Partial<CreateCapitalReservationResult> = {},
  reservationOverrides: Partial<CapitalReservation> = {},
): HedgeInventoryCapitalReservationEvidenceSnapshot {
  const reservation:
    CapitalReservation = {
    id:
      "reservation-v228-btc",
    ownerType:
      "STRATEGY_RISK_APPROVAL",
    ownerId:
      RISK_APPROVAL_ID,
    amount:
      1_120.5,
    status:
      "ACTIVE",
    createdAt:
      1_000,
    expiresAt:
      3_100,
    finalizedAt:
      null,
    reason:
      null,
    ...reservationOverrides,
  };

  const result:
    CreateCapitalReservationResult = {
    approved:
      true,
    reservation,
    reasons:
      [],
    ...resultOverrides,
  };

  return {
    generatedAt:
      1_090,
    records: [
      {
        riskApprovalAssessmentId:
          RISK_APPROVAL_ID,
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
        observedAt:
          1_085,
        requestedAmount:
          1_120.5,
        source:
          "CAPITAL_RESERVATION_SERVICE",
        result,
        ...evidenceOverrides,
      },
    ],
  };
}

function createRiskApprovalSnapshot():
  HedgeInventoryRiskApprovalSnapshot {
  return {
    version:
      "22.7",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      1_090,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    basisRiskConfigurationState:
      "READY",
    riskApprovalConfigurationState:
      "READY",
    sourceBasisRiskGeneratedAt:
      1_080,
    sourceRiskApprovalEvidenceGeneratedAt:
      1_085,
    thresholds: {
      maximumAssessmentAgeMs:
        100,
    },
    summary: {
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
    assessments: [
      {
        id:
          RISK_APPROVAL_ID,
        basisRiskAssessmentId:
          "hedge-inventory-management:target:1000:BTC:market-rules:post-rule-economics:basis-risk",
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
          "RISK_APPROVED",
        sourceBasisRiskState:
          "RISK_PASS",
        sourceAssessmentAssessedAt:
          1_085,
        assessmentAgeMs:
          15,
        hedgeQuantity:
          0.1,
        hedgeVwapPrice:
          10_002,
        evidenceSource:
          "CANONICAL_RISK_ENGINE",
        riskLevel:
          "LOW",
        riskScore:
          92,
        riskChecks: {
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
        reasons: [
          "Unified risk assessment passed all configured checks.",
        ],
        warnings:
          [],
        blockers:
          [],
        remainingGates: [
          "CAPITAL_NOT_RESERVED",
          "STRATEGY_INTENT_NOT_GENERATED",
        ],
        riskApprovalGranted:
          true,
        executionAuthorized:
          false,
        actionable:
          false,
        capitalReserved:
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
      canonicalRiskEngineEvidenceOnly:
        true,
      strategyCallsRiskEngineDirectly:
        false,
      approvalIsExecutionAuthorization:
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
