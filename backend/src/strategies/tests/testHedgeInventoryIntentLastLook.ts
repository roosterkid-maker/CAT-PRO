import assert
  from "node:assert/strict";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import {
  HedgeInventoryIntentLastLookEvaluator,
} from "../hedge-inventory-management/HedgeInventoryIntentLastLookEvaluator";

import type {
  HedgeInventoryIntentLifecycleAssessment,
  HedgeInventoryIntentLifecycleSnapshot,
} from "../hedge-inventory-management/HedgeInventoryIntentLifecycleService";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

const NOW =
  1_100;

function main(): void {
  const reservationsBefore =
    capitalReservationService.getActive().length;

  const paperTradesBefore =
    paperTradingService.getTrades().length;

  const configuration =
    createConfiguration();

  const evaluator =
    new HedgeInventoryIntentLastLookEvaluator();

  const active =
    evaluator.evaluate(
      configuration,
      createLifecycleSnapshot(),
      NOW,
    );

  assert.equal(
    active.version,
    "22.12",
  );
  assert.deepEqual(
    active.summary,
    {
      lifecycleIntents: 1,
      lifecycleActiveIntents: 1,
      preflightPassedIntents: 1,
      preflightRejectedIntents: 0,
      blockedIntents: 0,
      executionPlansCreated: 0,
      executableIntents: 0,
      actionableIntents: 0,
    },
  );

  const activeAssessment =
    active.assessments[0];

  assert.ok(activeAssessment);
  assert.equal(
    activeAssessment.state,
    "PREFLIGHT_PASS",
  );
  assert.equal(
    activeAssessment.lastLookPassed,
    true,
  );
  assert.equal(
    activeAssessment.proposedQuantity,
    0.1,
  );
  assert.equal(
    activeAssessment.referenceVwapPrice,
    10_002,
  );
  assert.equal(
    activeAssessment.proposedCapital,
    1_120.5,
  );
  assert.equal(
    activeAssessment.capitalReservationId,
    "reservation-1",
  );
  assert.deepEqual(
    activeAssessment.remainingGates,
    [
      "EXECUTION_PLAN_NOT_CREATED",
      "INTENT_EXECUTION_NOT_AUTHORIZED",
    ],
  );
  assert.equal(
    activeAssessment.executionPlanCreated,
    false,
  );
  assert.equal(
    activeAssessment.executionAuthorized,
    false,
  );
  assert.equal(
    Object.isFrozen(active),
    true,
  );
  assert.equal(
    Object.isFrozen(activeAssessment),
    true,
  );

  const stale =
    evaluator.evaluate(
      configuration,
      createLifecycleSnapshot(
        {},
        1_040,
      ),
      NOW,
    );

  assert.deepEqual(
    stale.blockers,
    [
      "INTENT_LIFECYCLE_SNAPSHOT_STALE",
    ],
  );
  assert.equal(
    stale.summary.preflightPassedIntents,
    0,
  );

  const terminal =
    evaluator.evaluate(
      configuration,
      createLifecycleSnapshot({
        state: "REVOKED",
        sourceProposalState: null,
        terminal: true,
        terminalEvent: {
          id: "terminal-event-1",
          intentId: "strategy-intent-1",
          sourceProposalId: "hedge-intent-proposal-1",
          state: "REVOKED",
          reason: "SOURCE_PROPOSAL_MISMATCH",
          recordedAt: 1_095,
          canonicalIntentMutated: false,
          reservationMutationAuthorized: false,
          executionAuthorized: false,
        },
        blockers: [
          "SOURCE_PROPOSAL_MISMATCH",
        ],
        remainingGates: [],
      }),
      NOW,
    );

  assert.equal(
    terminal.assessments[0]?.state,
    "PREFLIGHT_REJECTED",
  );
  assert.deepEqual(
    terminal.assessments[0]?.blockers,
    [
      "TERMINAL_INTENT_NOT_ELIGIBLE",
    ],
  );

  const sourceNotReady =
    evaluator.evaluate(
      configuration,
      createLifecycleSnapshot({
        sourceProposalState: null,
      }),
      NOW,
    );

  assert.equal(
    sourceNotReady.assessments[0]?.state,
    "BLOCKED",
  );
  assert.deepEqual(
    sourceNotReady.assessments[0]?.blockers,
    [
      "SOURCE_PROPOSAL_NOT_READY",
    ],
  );

  const expiredDuringPreflight =
    evaluator.evaluate(
      configuration,
      createLifecycleSnapshot({
        intentExpiresAt: NOW,
      }),
      NOW,
    );

  assert.equal(
    expiredDuringPreflight.assessments[0]?.state,
    "PREFLIGHT_REJECTED",
  );
  assert.deepEqual(
    expiredDuringPreflight.assessments[0]?.blockers,
    [
      "INTENT_EXPIRED_DURING_PREFLIGHT",
    ],
  );

  const reservationExpired =
    evaluator.evaluate(
      configuration,
      createLifecycleSnapshot({
        capitalReservationExpiresAt: NOW,
      }),
      NOW,
    );

  assert.deepEqual(
    reservationExpired.assessments[0]?.blockers,
    [
      "CAPITAL_RESERVATION_EXPIRED_DURING_PREFLIGHT",
    ],
  );

  const incomplete =
    evaluator.evaluate(
      configuration,
      createLifecycleSnapshot({
        proposedQuantity: 0,
      }),
      NOW,
    );

  assert.equal(
    incomplete.assessments[0]?.state,
    "BLOCKED",
  );
  assert.deepEqual(
    incomplete.assessments[0]?.blockers,
    [
      "INVALID_LIFECYCLE_CONTRACT",
    ],
  );

  assert.equal(
    "execute" in evaluator,
    false,
  );
  assert.equal(
    "submit" in evaluator,
    false,
  );
  assert.equal(
    "authorize" in evaluator,
    false,
  );
  assert.equal(
    active.safety.preflightPassIsExecutionAuthorization,
    false,
  );
  assert.equal(
    active.safety.executionPlanCreationAllowed,
    false,
  );
  assert.equal(
    active.safety.orderSubmissionAllowed,
    false,
  );

  assert.equal(
    capitalReservationService.getActive().length,
    reservationsBefore,
    "Last-look evidence must not create, commit or release capital reservations.",
  );
  assert.equal(
    paperTradingService.getTrades().length,
    paperTradesBefore,
    "SHADOW last-look evidence must not create a PAPER trade.",
  );

  console.log(
    "Hedge / inventory-management V22.12 lifecycle-active intent last-look test passed.",
  );
  console.log(
    "Fresh exact lineage passed read-only preflight; stale, terminal, incomplete and expired evidence failed closed with no execution plan, capital mutation, PAPER, LIVE or order action.",
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
    intentPreflight: {
      enabled: true,
      maximumLifecycleAgeMs: 50,
    },
  });
}

function createLifecycleAssessment(
  overrides:
    Partial<HedgeInventoryIntentLifecycleAssessment> = {},
): HedgeInventoryIntentLifecycleAssessment {
  return {
    id: "strategy-intent-1:lifecycle",
    intentId: "strategy-intent-1",
    sourceProposalId: "hedge-intent-proposal-1",
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
    evidenceStatus: "AVAILABLE",
    state: "ACTIVE",
    sourceProposalState: "PROPOSAL_READY",
    intentAgeMs: 20,
    intentExpiresAt: 1_180,
    capitalReservationExpiresAt: 1_300,
    terminalEvent: null,
    blockers: [],
    remainingGates: [
      "INTENT_EXECUTION_NOT_AUTHORIZED",
    ],
    lifecycleRevalidated: true,
    terminal: false,
    executionAuthorized: false,
    actionable: false,
    ...overrides,
  };
}

function createLifecycleSnapshot(
  assessmentOverrides:
    Partial<HedgeInventoryIntentLifecycleAssessment> = {},
  generatedAt =
    NOW,
): HedgeInventoryIntentLifecycleSnapshot {
  const assessment =
    createLifecycleAssessment(
      assessmentOverrides,
    );

  return {
    version: "22.11",
    strategyId: "hedge-inventory-management",
    generatedAt,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    intentProposalConfigurationState: "READY",
    intentPersistenceConfigurationState: "READY",
    intentLifecycleConfigurationState: "READY",
    sourceIntentProposalGeneratedAt: generatedAt,
    thresholds: {
      maximumIntentAgeMs: 100,
    },
    summary: {
      canonicalIntents: 1,
      activeIntents:
        assessment.state === "ACTIVE"
          ? 1
          : 0,
      expiredIntents:
        assessment.state === "EXPIRED"
          ? 1
          : 0,
      revokedIntents:
        assessment.state === "REVOKED"
          ? 1
          : 0,
      blockedIntents:
        assessment.state === "BLOCKED"
          ? 1
          : 0,
      terminalEventsRecorded:
        assessment.terminalEvent === null
          ? 0
          : 1,
      executableIntents: 0,
      actionableIntents: 0,
    },
    assessments: [assessment],
    blockers: [],
    notes: [],
    safety: {
      immutableTerminalEvidenceOnly: true,
      explicitLifecycleHandoffOnly: true,
      readModelCreatesLifecycleEvents: false,
      terminalStateIrreversible: true,
      canonicalIntentMutated: false,
      sourceProposalRevalidatedExactly: true,
      reservationMutationAuthorized: false,
      intentIsExecutionAuthorization: false,
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
