import assert
  from "node:assert/strict";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import type {
  HedgeInventoryBoundedIntentProposal,
  HedgeInventoryIntentProposalSnapshot,
} from "../hedge-inventory-management/HedgeInventoryIntentProposalPlanner";

import {
  HedgeInventoryIntentPersistenceService,
} from "../hedge-inventory-management/HedgeInventoryIntentPersistenceService";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import {
  StrategyIntentService,
} from "../services/StrategyIntentService";

const NOW =
  1_100;

function main(): void {
  const capitalReservationsBefore =
    capitalReservationService
      .getActive()
      .length;

  const paperTradesBefore =
    paperTradingService
      .getTrades()
      .length;

  const configuration =
    createConfiguration();

  const proposalSnapshot =
    createProposalSnapshot();

  const readOnlyIntentService =
    new StrategyIntentService();

  const readOnlyPersistence =
    new HedgeInventoryIntentPersistenceService(
      readOnlyIntentService,
    );

  const beforeExplicitHandoff =
    readOnlyPersistence.evaluate(
      configuration,
      proposalSnapshot,
      [],
      NOW,
    );

  assert.equal(
    beforeExplicitHandoff.assessments[0]?.state,
    "NOT_PERSISTED",
  );
  assert.deepEqual(
    beforeExplicitHandoff.assessments[0]?.blockers,
    [
      "CANONICAL_STRATEGY_INTENT_NOT_FOUND",
    ],
  );
  assert.equal(
    readOnlyIntentService.getIntents(
      "hedge-inventory-management",
    ).length,
    0,
    "Read-model evaluation must not create a StrategyIntent.",
  );

  const intentService =
    new StrategyIntentService({
      maximumIntents:
        10,
    });

  const persistence =
    new HedgeInventoryIntentPersistenceService(
      intentService,
    );

  const first =
    persistence.persist(
      configuration,
      proposalSnapshot,
      NOW,
    );

  const replay =
    persistence.persist(
      configuration,
      proposalSnapshot,
      NOW,
    );

  assert.equal(
    first.version,
    "22.10",
  );
  assert.equal(
    first.evidenceStatus,
    "AVAILABLE",
  );
  assert.deepEqual(
    first.summary,
    {
      proposalsReady:
        1,
      canonicalIntentsPersisted:
        1,
      proposalsNotPersisted:
        0,
      blockedRoutes:
        0,
      activeShadowIntents:
        1,
      executableIntents:
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
    "INTENT_PERSISTED",
  );
  assert.equal(
    assessment.intentGenerated,
    true,
  );
  assert.equal(
    assessment.intentPersisted,
    true,
  );
  assert.deepEqual(
    assessment.remainingGates,
    [
      "INTENT_EXECUTION_NOT_AUTHORIZED",
    ],
  );

  const intent =
    assessment.intent;

  assert.ok(intent);
  assert.equal(
    intent.id,
    replay.assessments[0]?.intent?.id,
    "An exact replay must resolve to the same canonical StrategyIntent.",
  );
  assert.equal(
    intentService.getIntents(
      "hedge-inventory-management",
    ).length,
    1,
    "An exact replay must not create a duplicate intent record.",
  );
  assert.equal(
    intent.signalId,
    "hedge-intent-proposal-1",
  );
  assert.equal(
    intent.proposedMode,
    "SHADOW",
  );
  assert.equal(
    intent.proposalType,
    "HEDGE_INVENTORY_REDUCTION",
  );
  assert.equal(
    intent.executionAuthorized,
    false,
  );
  assert.equal(
    intent.automaticExecutionAllowed,
    false,
  );
  assert.equal(
    intent.evidence.capitalReservationId,
    "reservation-1",
  );
  assert.equal(
    intent.evidence.proposedQuantity,
    0.1,
  );
  assert.equal(
    intent.evidence.referenceVwapPrice,
    10_002,
  );
  assert.equal(
    intent.evidence.recursionDepth,
    0,
  );
  assert.equal(
    intent.evidence.reservationMutationAuthorized,
    false,
  );
  assert.equal(
    Object.isFrozen(first),
    true,
  );
  assert.equal(
    Object.isFrozen(intent),
    true,
  );
  assert.equal(
    Object.isFrozen(intent.evidence),
    true,
  );

  const expired =
    persistence.evaluate(
      configuration,
      proposalSnapshot,
      intentService.getIntents(
        "hedge-inventory-management",
      ),
      1_180,
    );

  assert.ok(
    expired.assessments[0]?.blockers.includes(
      "PROPOSAL_EXPIRED",
    ),
  );
  assert.equal(
    expired.summary.activeShadowIntents,
    0,
  );

  const staleConfiguration =
    createConfiguration(
      10,
    );

  const stale =
    persistence.evaluate(
      staleConfiguration,
      proposalSnapshot,
      intentService.getIntents(
        "hedge-inventory-management",
      ),
      NOW,
    );

  assert.ok(
    stale.assessments[0]?.blockers.includes(
      "PROPOSAL_STALE",
    ),
  );

  const conflict = {
    ...createProposal(),
    id:
      "different-proposal-same-reservation",
  } as HedgeInventoryBoundedIntentProposal;

  assert.throws(
    () =>
      intentService.proposeHedgeInventoryShadow(
        conflict,
        NOW,
      ),
    /already bound/,
  );

  assert.throws(
    () =>
      intentService.proposeHedgeInventoryShadow(
        {
          ...createProposal(),
          recursionDepth:
            1,
        } as unknown as HedgeInventoryBoundedIntentProposal,
        NOW,
      ),
    /complete non-executable/,
  );

  assert.equal(
    "execute" in intentService,
    false,
  );
  assert.equal(
    "submit" in intentService,
    false,
  );
  assert.equal(
    "authorize" in intentService,
    false,
  );
  assert.equal(
    first.safety.readModelCreatesIntents,
    false,
  );
  assert.equal(
    first.safety.intentIsExecutionAuthorization,
    false,
  );
  assert.equal(
    first.safety.orderSubmissionAllowed,
    false,
  );

  assert.equal(
    capitalReservationService
      .getActive()
      .length,
    capitalReservationsBefore,
    "StrategyIntent persistence must not create, commit or release a capital reservation.",
  );
  assert.equal(
    paperTradingService
      .getTrades()
      .length,
    paperTradesBefore,
    "SHADOW StrategyIntent persistence must not create a PAPER trade.",
  );

  console.log(
    "Hedge / inventory-management V22.10 canonical StrategyIntent persistence test passed.",
  );
  console.log(
    "Explicit handoff was immutable, deduplicated, expiry-bounded and reservation-exclusive; reads created nothing and no execution, capital mutation, PAPER, LIVE or order action occurred.",
  );
}

function createConfiguration(
  maximumProposalAgeMs =
    100,
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
    intentProposal: {
      enabled:
        true,
      maximumCapitalReservationAgeMs:
        100,
      proposalTtlMs:
        100,
      maximumRecursionDepth:
        0,
    },
    intentPersistence: {
      enabled:
        true,
      maximumProposalAgeMs,
    },
  });
}

function createProposal():
  HedgeInventoryBoundedIntentProposal {
  return {
    id:
      "hedge-intent-proposal-1",
    strategyId:
      "hedge-inventory-management",
    kind:
      "PROPOSED_STRATEGY_ACTION",
    proposalType:
      "HEDGE_INVENTORY_REDUCTION",
    proposedMode:
      "SHADOW",
    status:
      "PROPOSED",
    sourceType:
      "PORTFOLIO_EXPOSURE",
    sourceCapitalReservationAssessmentId:
      "capital-assessment-1",
    sourceRiskApprovalAssessmentId:
      "risk-approval-1",
    routeId:
      "hedge-route-1",
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
    proposedQuantity:
      0.1,
    referenceVwapPrice:
      10_002,
    proposedCapital:
      1_120.5,
    capitalReservationId:
      "reservation-1",
    capitalReservationExpiresAt:
      1_300,
    recursionDepth:
      0,
    createdAt:
      1_080,
    expiresAt:
      1_180,
    persistedAsStrategyIntent:
      false,
    executionAuthorized:
      false,
    automaticExecutionAllowed:
      false,
  };
}

function createProposalSnapshot():
  HedgeInventoryIntentProposalSnapshot {
  const proposal =
    createProposal();

  return {
    version:
      "22.9",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      NOW,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    capitalReservationConfigurationState:
      "READY",
    intentProposalConfigurationState:
      "READY",
    sourceCapitalReservationGeneratedAt:
      1_090,
    thresholds: {
      maximumCapitalReservationAgeMs:
        100,
      proposalTtlMs:
        100,
      maximumRecursionDepth:
        0,
    },
    summary: {
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
    assessments: [
      {
        id:
          "intent-proposal-assessment-1",
        capitalReservationAssessmentId:
          "capital-assessment-1",
        routeId:
          "hedge-route-1",
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
          "PROPOSAL_READY",
        sourceCapitalReservationState:
          "CAPITAL_RESERVED",
        sourceEvidenceObservedAt:
          1_080,
        sourceAgeMs:
          20,
        proposal,
        blockers:
          [],
        remainingGates: [
          "STRATEGY_INTENT_NOT_GENERATED",
        ],
        proposalGenerated:
          true,
        persistedAsStrategyIntent:
          false,
        intentGenerated:
          false,
        executionAuthorized:
          false,
        actionable:
          false,
      },
    ],
    blockers:
      [],
    notes:
      [],
    safety: {
      exactCapitalReservationBinding:
        true,
      deterministicBoundedProposalOnly:
        true,
      proposalIsStrategyIntent:
        false,
      strategyPersistsIntents:
        false,
      strategyCallsIntentService:
        false,
      recursionDepth:
        0,
      recursiveHedgeAllowed:
        false,
      capitalReservationMutationAllowed:
        false,
      intentExecutionAllowed:
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
