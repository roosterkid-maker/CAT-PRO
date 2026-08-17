import assert
  from "node:assert/strict";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import {
  HedgeInventoryIntentLifecycleService,
} from "../hedge-inventory-management/HedgeInventoryIntentLifecycleService";

import {
  HedgeInventoryIntentPersistenceService,
} from "../hedge-inventory-management/HedgeInventoryIntentPersistenceService";

import type {
  HedgeInventoryBoundedIntentProposal,
  HedgeInventoryIntentProposalSnapshot,
} from "../hedge-inventory-management/HedgeInventoryIntentProposalPlanner";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import {
  StrategyIntentService,
} from "../services/StrategyIntentService";

const NOW =
  1_100;

function main(): void {
  const reservationsBefore =
    capitalReservationService.getActive().length;

  const paperTradesBefore =
    paperTradingService.getTrades().length;

  const configuration =
    createConfiguration();

  const proposalSnapshot =
    createProposalSnapshot();

  const intentService =
    new StrategyIntentService();

  const persistence =
    new HedgeInventoryIntentPersistenceService(
      intentService,
    );

  persistence.persist(
    configuration,
    proposalSnapshot,
    NOW,
  );

  const intents =
    intentService.getIntents(
      "hedge-inventory-management",
    );

  assert.equal(
    intents.length,
    1,
  );

  const lifecycle =
    new HedgeInventoryIntentLifecycleService();

  const readOnlyActive =
    lifecycle.evaluate(
      configuration,
      proposalSnapshot,
      intents,
      NOW,
    );

  assert.equal(
    readOnlyActive.version,
    "22.11",
  );
  assert.deepEqual(
    readOnlyActive.summary,
    {
      canonicalIntents: 1,
      activeIntents: 1,
      expiredIntents: 0,
      revokedIntents: 0,
      blockedIntents: 0,
      terminalEventsRecorded: 0,
      executableIntents: 0,
      actionableIntents: 0,
    },
  );
  assert.equal(
    lifecycle.getTerminalEvents().length,
    0,
    "A lifecycle read must not create a terminal event.",
  );
  assert.deepEqual(
    readOnlyActive.assessments[0]?.remainingGates,
    [
      "INTENT_EXECUTION_NOT_AUTHORIZED",
    ],
  );

  const activeProcess =
    lifecycle.process(
      configuration,
      proposalSnapshot,
      intents,
      NOW,
    );

  assert.equal(
    activeProcess.summary.activeIntents,
    1,
  );
  assert.equal(
    lifecycle.getTerminalEvents().length,
    0,
    "A valid intent must not be terminalized.",
  );

  const mismatchedSnapshot =
    createProposalSnapshot({
      proposedQuantity: 0.2,
    });

  const mismatchRead =
    lifecycle.evaluate(
      configuration,
      mismatchedSnapshot,
      intents,
      NOW,
    );

  assert.equal(
    mismatchRead.assessments[0]?.state,
    "BLOCKED",
  );
  assert.deepEqual(
    mismatchRead.assessments[0]?.blockers,
    [
      "SOURCE_PROPOSAL_MISMATCH",
    ],
  );
  assert.equal(
    lifecycle.getTerminalEvents().length,
    0,
    "Mismatch inspection must remain write-free.",
  );

  const revoked =
    lifecycle.process(
      configuration,
      mismatchedSnapshot,
      intents,
      NOW,
    );

  assert.equal(
    revoked.assessments[0]?.state,
    "REVOKED",
  );
  assert.equal(
    revoked.assessments[0]?.terminalEvent?.reason,
    "SOURCE_PROPOSAL_MISMATCH",
  );
  assert.equal(
    revoked.assessments[0]?.terminalEvent?.canonicalIntentMutated,
    false,
  );
  assert.equal(
    Object.isFrozen(revoked.assessments[0]?.terminalEvent),
    true,
  );

  const revocationEventId =
    revoked.assessments[0]?.terminalEvent?.id;

  const replay =
    lifecycle.process(
      configuration,
      proposalSnapshot,
      intents,
      1_120,
    );

  assert.equal(
    replay.assessments[0]?.state,
    "REVOKED",
    "A terminal revocation must be irreversible even if source evidence returns.",
  );
  assert.equal(
    replay.assessments[0]?.terminalEvent?.id,
    revocationEventId,
  );
  assert.equal(
    lifecycle.getTerminalEvents().length,
    1,
    "A lifecycle replay must not duplicate terminal evidence.",
  );

  const expiryLifecycle =
    new HedgeInventoryIntentLifecycleService();

  const expiryRead =
    expiryLifecycle.evaluate(
      configuration,
      proposalSnapshot,
      intents,
      1_180,
    );

  assert.equal(
    expiryRead.assessments[0]?.state,
    "EXPIRED",
  );
  assert.equal(
    expiryRead.assessments[0]?.terminalEvent,
    null,
    "Computed expiry must remain write-free until the explicit lifecycle handoff.",
  );

  const expired =
    expiryLifecycle.process(
      configuration,
      proposalSnapshot,
      intents,
      1_180,
    );

  assert.equal(
    expired.assessments[0]?.state,
    "EXPIRED",
  );
  assert.equal(
    expired.assessments[0]?.terminalEvent?.reason,
    "INTENT_EXPIRED",
  );
  assert.equal(
    expired.summary.terminalEventsRecorded,
    1,
  );

  const sourceLossLifecycle =
    new HedgeInventoryIntentLifecycleService();

  const sourceLoss =
    sourceLossLifecycle.process(
      configuration,
      {
        ...proposalSnapshot,
        assessments: [],
        summary: {
          ...proposalSnapshot.summary,
          proposalsReady: 0,
        },
      },
      intents,
      NOW,
    );

  assert.equal(
    sourceLoss.assessments[0]?.state,
    "REVOKED",
  );
  assert.equal(
    sourceLoss.assessments[0]?.terminalEvent?.reason,
    "SOURCE_PROPOSAL_NOT_FOUND",
  );

  const canonicalIntent =
    intents[0]!;

  assert.equal(
    canonicalIntent.status,
    "PROPOSED",
    "Lifecycle evidence must not mutate the canonical intent.",
  );
  assert.equal(
    canonicalIntent.executionAuthorized,
    false,
  );
  assert.equal(
    Object.isFrozen(canonicalIntent),
    true,
  );
  assert.equal(
    "execute" in lifecycle,
    false,
  );
  assert.equal(
    "submit" in lifecycle,
    false,
  );
  assert.equal(
    "authorize" in lifecycle,
    false,
  );
  assert.equal(
    revoked.safety.readModelCreatesLifecycleEvents,
    false,
  );
  assert.equal(
    revoked.safety.canonicalIntentMutated,
    false,
  );
  assert.equal(
    revoked.safety.orderSubmissionAllowed,
    false,
  );

  assert.equal(
    capitalReservationService.getActive().length,
    reservationsBefore,
    "Intent lifecycle must not create, commit or release capital reservations.",
  );
  assert.equal(
    paperTradingService.getTrades().length,
    paperTradesBefore,
    "Intent lifecycle must not create a PAPER trade.",
  );

  console.log(
    "Hedge / inventory-management V22.11 immutable intent lifecycle test passed.",
  );
  console.log(
    "Reads remained write-free; explicit expiry/revocation was immutable and irreversible with no execution, reservation mutation, PAPER, LIVE or order action.",
  );
}

function createConfiguration() {
  return createHedgeInventoryManagementConfiguration({
    enabled: true,
    valuationQuoteAsset: "USDT",
    assetAllowlist: ["BTC"],
    targetInventoryByAsset: {
      BTC: 0.25,
    },
    maximumDeviationQuoteValue: 100,
    exposureLimitQuoteValue: 2_000,
    hedgeRatio: 1,
    hedgeVenueAllowlist: ["coindcx"],
    maximumExposureAgeMs: 100,
    intentProposal: {
      enabled: true,
      maximumCapitalReservationAgeMs: 100,
      proposalTtlMs: 100,
      maximumRecursionDepth: 0,
    },
    intentPersistence: {
      enabled: true,
      maximumProposalAgeMs: 100,
    },
    intentLifecycle: {
      enabled: true,
      maximumIntentAgeMs: 100,
    },
  });
}

function createProposal(
  overrides:
    Partial<HedgeInventoryBoundedIntentProposal> = {},
): HedgeInventoryBoundedIntentProposal {
  return {
    id: "hedge-intent-proposal-1",
    strategyId: "hedge-inventory-management",
    kind: "PROPOSED_STRATEGY_ACTION",
    proposalType: "HEDGE_INVENTORY_REDUCTION",
    proposedMode: "SHADOW",
    status: "PROPOSED",
    sourceType: "PORTFOLIO_EXPOSURE",
    sourceCapitalReservationAssessmentId: "capital-assessment-1",
    sourceRiskApprovalAssessmentId: "risk-approval-1",
    routeId: "hedge-route-1",
    asset: "BTC",
    quoteAsset: "USDT",
    side: "SELL",
    venue: "coindcx",
    market: "BTCUSDT",
    proposedQuantity: 0.1,
    referenceVwapPrice: 10_002,
    proposedCapital: 1_120.5,
    capitalReservationId: "reservation-1",
    capitalReservationExpiresAt: 1_300,
    recursionDepth: 0,
    createdAt: 1_080,
    expiresAt: 1_180,
    persistedAsStrategyIntent: false,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    ...overrides,
  } as HedgeInventoryBoundedIntentProposal;
}

function createProposalSnapshot(
  overrides:
    Partial<HedgeInventoryBoundedIntentProposal> = {},
): HedgeInventoryIntentProposalSnapshot {
  const proposal =
    createProposal(overrides);

  return {
    version: "22.9",
    strategyId: "hedge-inventory-management",
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    capitalReservationConfigurationState: "READY",
    intentProposalConfigurationState: "READY",
    sourceCapitalReservationGeneratedAt: 1_090,
    thresholds: {
      maximumCapitalReservationAgeMs: 100,
      proposalTtlMs: 100,
      maximumRecursionDepth: 0,
    },
    summary: {
      capitalReservedRoutes: 1,
      proposalsReady: 1,
      blockedRoutes: 0,
      notApplicableRoutes: 0,
      totalProposedQuantity: proposal.proposedQuantity,
      totalProposedCapital: proposal.proposedCapital,
      strategyIntentsGenerated: 0,
      actionableRoutes: 0,
    },
    assessments: [
      {
        id: "intent-proposal-assessment-1",
        capitalReservationAssessmentId: "capital-assessment-1",
        routeId: "hedge-route-1",
        asset: "BTC",
        quoteAsset: "USDT",
        side: "SELL",
        venue: "coindcx",
        market: "BTCUSDT",
        evidenceStatus: "AVAILABLE",
        state: "PROPOSAL_READY",
        sourceCapitalReservationState: "CAPITAL_RESERVED",
        sourceEvidenceObservedAt: 1_080,
        sourceAgeMs: 20,
        proposal,
        blockers: [],
        remainingGates: ["STRATEGY_INTENT_NOT_GENERATED"],
        proposalGenerated: true,
        persistedAsStrategyIntent: false,
        intentGenerated: false,
        executionAuthorized: false,
        actionable: false,
      },
    ],
    blockers: [],
    notes: [],
    safety: {
      exactCapitalReservationBinding: true,
      deterministicBoundedProposalOnly: true,
      proposalIsStrategyIntent: false,
      strategyPersistsIntents: false,
      strategyCallsIntentService: false,
      recursionDepth: 0,
      recursiveHedgeAllowed: false,
      capitalReservationMutationAllowed: false,
      intentExecutionAllowed: false,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
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
