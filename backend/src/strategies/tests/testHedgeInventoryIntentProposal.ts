import assert
  from "node:assert/strict";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import type {
  HedgeInventoryCapitalReservationSnapshot,
} from "../hedge-inventory-management/HedgeInventoryCapitalReservationEvaluator";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import {
  HedgeInventoryIntentProposalPlanner,
} from "../hedge-inventory-management/HedgeInventoryIntentProposalPlanner";

const NOW =
  1_100;

const RISK_APPROVAL_ID =
  "hedge-inventory-management:target:1000:BTC:market-rules:post-rule-economics:basis-risk:risk-approval";

function main(): void {
  const planner =
    new HedgeInventoryIntentProposalPlanner();

  const configuration =
    createConfiguration();

  const capitalReservationsBefore =
    capitalReservationService
      .getActive()
      .length;

  const paperTradesBefore =
    paperTradingService
      .getTrades()
      .length;

  const first =
    planner.evaluate(
      configuration,
      createCapitalReservationSnapshot(),
      NOW,
    );

  const duplicate =
    planner.evaluate(
      configuration,
      createCapitalReservationSnapshot(),
      NOW,
    );

  assert.equal(
    first.version,
    "22.9",
  );
  assert.equal(
    first.evidenceStatus,
    "AVAILABLE",
  );
  assert.deepEqual(
    first.summary,
    {
      capitalReservedRoutes:
        1,
      proposalsReady:
        1,
      blockedRoutes:
        0,
      notApplicableRoutes:
        0,
      totalProposedQuantity:
        0.1,
      totalProposedCapital:
        1_120.5,
      strategyIntentsGenerated:
        0,
      actionableRoutes:
        0,
    },
  );

  const assessment =
    first.assessments[0];

  assert.ok(assessment);
  assert.equal(
    assessment.state,
    "PROPOSAL_READY",
  );
  assert.equal(
    assessment.proposalGenerated,
    true,
  );
  assert.equal(
    assessment.intentGenerated,
    false,
  );
  assert.deepEqual(
    assessment.remainingGates,
    [
      "STRATEGY_INTENT_NOT_GENERATED",
    ],
  );

  const proposal =
    assessment.proposal;

  assert.ok(proposal);
  assert.equal(
    proposal.id,
    duplicate.assessments[0]?.proposal?.id,
    "Identical exact-route reservation evidence must produce a stable proposal ID.",
  );
  assert.equal(
    proposal.proposedMode,
    "SHADOW",
  );
  assert.equal(
    proposal.proposalType,
    "HEDGE_INVENTORY_REDUCTION",
  );
  assert.equal(
    proposal.proposedQuantity,
    0.1,
  );
  assert.equal(
    proposal.referenceVwapPrice,
    10_002,
  );
  assert.equal(
    proposal.proposedCapital,
    1_120.5,
  );
  assert.equal(
    proposal.capitalReservationId,
    "reservation-1",
  );
  assert.equal(
    proposal.sourceRiskApprovalAssessmentId,
    RISK_APPROVAL_ID,
  );
  assert.equal(
    proposal.createdAt,
    1_080,
  );
  assert.equal(
    proposal.expiresAt,
    1_180,
  );
  assert.equal(
    proposal.recursionDepth,
    0,
  );
  assert.equal(
    proposal.persistedAsStrategyIntent,
    false,
  );
  assert.equal(
    proposal.executionAuthorized,
    false,
  );
  assert.equal(
    proposal.automaticExecutionAllowed,
    false,
  );
  assert.equal(
    Object.isFrozen(first),
    true,
  );
  assert.equal(
    Object.isFrozen(assessment),
    true,
  );
  assert.equal(
    Object.isFrozen(proposal),
    true,
  );

  const stale =
    planner.evaluate(
      configuration,
      createCapitalReservationSnapshot({
        sourceEvidenceObservedAt:
          900,
      }),
      NOW,
    );

  assert.equal(
    stale.assessments[0]?.state,
    "BLOCKED",
  );
  assert.ok(
    stale.assessments[0]?.blockers.includes(
      "RESERVATION_SOURCE_STALE",
    ),
  );

  const expiring =
    planner.evaluate(
      configuration,
      createCapitalReservationSnapshot({
        reservationExpiresAt:
          1_100,
      }),
      NOW,
    );

  assert.ok(
    expiring.assessments[0]?.blockers.includes(
      "RESERVATION_EXPIRES_BEFORE_PROPOSAL",
    ),
  );

  const notReserved =
    planner.evaluate(
      configuration,
      createCapitalReservationSnapshot({
        state:
          "RESERVATION_REJECTED",
        capitalReserved:
          false,
      }),
      NOW,
    );

  assert.ok(
    notReserved.assessments[0]?.blockers.includes(
      "CAPITAL_NOT_RESERVED",
    ),
  );

  const recursiveConfiguration =
    createConfiguration({
      maximumRecursionDepth:
        1,
    });

  assert.equal(
    recursiveConfiguration.intentProposal.state,
    "INCOMPLETE",
  );
  assert.ok(
    recursiveConfiguration.intentProposal.blockers.includes(
      "RECURSION_DEPTH_MUST_BE_ZERO",
    ),
  );
  assert.deepEqual(
    planner.evaluate(
      recursiveConfiguration,
      createCapitalReservationSnapshot(),
      NOW,
    ).blockers,
    [
      "INTENT_PROPOSAL_CONFIGURATION_NOT_READY",
    ],
  );

  const defaultDisabled =
    planner.evaluate(
      createHedgeInventoryManagementConfiguration(),
      createCapitalReservationSnapshot(),
      NOW,
    );

  assert.deepEqual(
    defaultDisabled.blockers,
    [
      "STRATEGY_CONFIGURATION_NOT_READY",
    ],
  );
  assert.equal(
    defaultDisabled.summary.proposalsReady,
    0,
  );
  assert.equal(
    defaultDisabled.safety.proposalIsStrategyIntent,
    false,
  );
  assert.equal(
    defaultDisabled.safety.strategyCallsIntentService,
    false,
  );
  assert.equal(
    defaultDisabled.safety.intentExecutionAllowed,
    false,
  );

  assert.equal(
    capitalReservationService
      .getActive()
      .length,
    capitalReservationsBefore,
    "Intent proposal planning must not create, commit or release capital reservations.",
  );
  assert.equal(
    paperTradingService
      .getTrades()
      .length,
    paperTradesBefore,
    "Intent proposal planning must not create a PAPER trade.",
  );

  console.log(
    "Hedge / inventory-management V22.9 bounded intent-proposal test passed.",
  );
  console.log(
    "Exact-route proposal generation was deterministic, expiry-bounded and recursion-safe; no StrategyIntent persistence, capital mutation, execution authorization, PAPER, LIVE or order action occurred.",
  );
}

function createConfiguration(
  intentProposal: {
    maximumRecursionDepth?: number;
  } = {},
) {
  return createHedgeInventoryManagementConfiguration({
    enabled:
      true,
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
      2_000,
    hedgeRatio:
      1,
    hedgeVenueAllowlist: [
      "coindcx",
    ],
    maximumExposureAgeMs:
      100,
    capitalReservation: {
      enabled:
        true,
      maximumEvidenceAgeMs:
        100,
      minimumRemainingTtlMs:
        100,
    },
    intentProposal: {
      enabled:
        true,
      maximumCapitalReservationAgeMs:
        100,
      proposalTtlMs:
        100,
      maximumRecursionDepth:
        intentProposal.maximumRecursionDepth ?? 0,
    },
  });
}

function createCapitalReservationSnapshot(
  overrides: Partial<
    HedgeInventoryCapitalReservationSnapshot["assessments"][number]
  > = {},
): HedgeInventoryCapitalReservationSnapshot {
  return {
    version:
      "22.8",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      NOW,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    riskApprovalConfigurationState:
      "READY",
    capitalReservationConfigurationState:
      "READY",
    sourceRiskApprovalGeneratedAt:
      1_070,
    sourceCapitalReservationEvidenceGeneratedAt:
      1_080,
    thresholds: {
      maximumEvidenceAgeMs:
        100,
      minimumRemainingTtlMs:
        100,
    },
    summary: {
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
        200,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
    assessments: [
      {
        id:
          `${RISK_APPROVAL_ID}:capital-reservation`,
        riskApprovalAssessmentId:
          RISK_APPROVAL_ID,
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
          "CAPITAL_RESERVED",
        sourceRiskApprovalState:
          "RISK_APPROVED",
        sourceEvidenceObservedAt:
          1_080,
        evidenceAgeMs:
          20,
        hedgeQuantity:
          0.1,
        hedgeVwapPrice:
          10_002,
        evidenceSource:
          "CAPITAL_RESERVATION_SERVICE",
        requestedAmount:
          1_120.5,
        reservationId:
          "reservation-1",
        reservationOwnerType:
          "STRATEGY_RISK_APPROVAL",
        reservationOwnerId:
          RISK_APPROVAL_ID,
        reservedAmount:
          1_120.5,
        reservationStatus:
          "ACTIVE",
        reservationCreatedAt:
          1_070,
        reservationExpiresAt:
          1_300,
        remainingTtlMs:
          200,
        reservationReasons:
          [],
        blockers:
          [],
        remainingGates: [
          "STRATEGY_INTENT_NOT_GENERATED",
        ],
        riskApprovalGranted:
          true,
        capitalReserved:
          true,
        executionAuthorized:
          false,
        actionable:
          false,
        intentGenerated:
          false,
        ...overrides,
      },
    ],
    blockers:
      [],
    notes:
      [],
    safety: {
      canonicalCapitalReservationEvidenceOnly:
        true,
      strategyCreatesReservations:
        false,
      strategyCommitsReservations:
        false,
      strategyReleasesReservations:
        false,
      reservationIsExecutionAuthorization:
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
