import assert from "node:assert/strict";

import { capitalReservationService } from "../../trading/capital/CapitalReservationService";
import { paperTradingService } from "../../trading/services/PaperTradingService";
import type { HedgeInventoryIntentLastLookAssessment, HedgeInventoryIntentLastLookSnapshot } from "../hedge-inventory-management/HedgeInventoryIntentLastLookEvaluator";
import { createHedgeInventoryManagementConfiguration } from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";
import { HedgeInventoryShadowExecutionPlanPlanner } from "../hedge-inventory-management/HedgeInventoryShadowExecutionPlanPlanner";

const NOW = 1_100;

function main(): void {
  const reservationsBefore = capitalReservationService.getActive().length;
  const paperTradesBefore = paperTradingService.getTrades().length;
  const planner = new HedgeInventoryShadowExecutionPlanPlanner();
  const configuration = createConfiguration();
  const preflight = createPreflight();

  const first = planner.evaluate(configuration, preflight, NOW);
  const replay = planner.evaluate(configuration, preflight, NOW);

  assert.equal(first.version, "22.13");
  assert.deepEqual(first.summary, {
    preflightPassedIntents: 1,
    planProposalsReady: 1,
    notApplicableIntents: 0,
    blockedIntents: 0,
    totalProposedQuantity: 0.1,
    totalProposedCapital: 1_120.5,
    canonicalExecutionPlansCreated: 0,
    executablePlans: 0,
    actionablePlans: 0,
  });

  const assessment = first.assessments[0];
  const proposal = assessment?.proposal;
  assert.ok(assessment);
  assert.ok(proposal);
  assert.equal(assessment.state, "PLAN_PROPOSAL_READY");
  assert.equal(proposal.id, replay.assessments[0]?.proposal?.id);
  assert.equal(proposal.validationHash, replay.assessments[0]?.proposal?.validationHash);
  assert.equal(proposal.mode, "SHADOW");
  assert.equal(proposal.executionType, "SINGLE_LEG_INVENTORY_REDUCTION");
  assert.equal(proposal.leg.venue, "coindcx");
  assert.equal(proposal.leg.market, "BTCUSDT");
  assert.equal(proposal.leg.side, "SELL");
  assert.equal(proposal.leg.quantity, 0.1);
  assert.equal(proposal.leg.referencePrice, 10_002);
  assert.equal(proposal.expiresAt, 1_150);
  assert.equal(proposal.leg.orderTypeSelected, false);
  assert.equal(proposal.leg.timeInForceSelected, false);
  assert.equal(proposal.leg.submissionAuthorized, false);
  assert.equal(proposal.capitalReservation.commitAuthorized, false);
  assert.equal(proposal.capitalReservation.releaseAuthorized, false);
  assert.equal(proposal.executionPlanMaterialized, false);
  assert.equal(proposal.executionAuthorized, false);
  assert.equal(proposal.orderSubmissionAuthorized, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(proposal), true);
  assert.deepEqual(assessment.remainingGates, [
    "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
    "EXECUTION_SIMULATION_NOT_RUN",
    "INTENT_EXECUTION_NOT_AUTHORIZED",
  ]);

  const rejected = planner.evaluate(
    configuration,
    createPreflight({ state: "PREFLIGHT_REJECTED", lastLookPassed: false, blockers: ["TERMINAL_INTENT_NOT_ELIGIBLE"], remainingGates: [] }),
    NOW,
  );
  assert.equal(rejected.assessments[0]?.state, "NOT_APPLICABLE");
  assert.equal(rejected.assessments[0]?.proposal, null);

  const invalid = planner.evaluate(
    configuration,
    createPreflight({ proposedQuantity: 0 }),
    NOW,
  );
  assert.deepEqual(invalid.assessments[0]?.blockers, ["INVALID_PREFLIGHT_CONTRACT"]);

  const stale = planner.evaluate(configuration, createPreflight({}, 1_040), NOW);
  assert.deepEqual(stale.blockers, ["INTENT_PREFLIGHT_SNAPSHOT_STALE"]);

  const expired = planner.evaluate(
    configuration,
    createPreflight({ intentExpiresAt: NOW }),
    NOW,
  );
  assert.deepEqual(expired.assessments[0]?.blockers, ["INTENT_EXPIRED_BEFORE_PLAN_PROPOSAL"]);

  assert.equal("createPlan" in planner, false);
  assert.equal("execute" in planner, false);
  assert.equal("submit" in planner, false);
  assert.equal(first.safety.canonicalExecutionPlannerCalled, false);
  assert.equal(first.safety.proposalIsCanonicalExecutionPlan, false);
  assert.equal(first.safety.orderSubmissionAllowed, false);
  assert.equal(capitalReservationService.getActive().length, reservationsBefore);
  assert.equal(paperTradingService.getTrades().length, paperTradesBefore);

  console.log("Hedge / inventory-management V22.13 SHADOW execution-plan proposal test passed.");
  console.log("Proposal identity was deterministic and bounded; no canonical ExecutionPlan, reservation mutation, PAPER, LIVE or order action occurred.");
}

function createConfiguration() {
  return createHedgeInventoryManagementConfiguration({
    enabled: true,
    valuationQuoteAsset: "USDT",
    assetAllowlist: ["BTC"],
    targetInventoryByAsset: { BTC: 0.25 },
    maximumDeviationQuoteValue: 100,
    exposureLimitQuoteValue: 2_000,
    hedgeRatio: 1,
    hedgeVenueAllowlist: ["coindcx"],
    maximumExposureAgeMs: 100,
    intentPreflight: { enabled: true, maximumLifecycleAgeMs: 50 },
    executionPlanProposal: { enabled: true, maximumPreflightAgeMs: 50, proposalTtlMs: 50 },
  });
}

function createAssessment(overrides: Partial<HedgeInventoryIntentLastLookAssessment> = {}): HedgeInventoryIntentLastLookAssessment {
  return {
    id: "strategy-intent-1:lifecycle:last-look",
    lifecycleAssessmentId: "strategy-intent-1:lifecycle",
    intentId: "strategy-intent-1",
    sourceProposalId: "hedge-intent-proposal-1",
    routeId: "hedge-route-1",
    asset: "BTC",
    quoteAsset: "USDT",
    side: "SELL",
    venue: "coindcx",
    market: "BTCUSDT",
    evidenceStatus: "AVAILABLE",
    state: "PREFLIGHT_PASS",
    sourceLifecycleState: "ACTIVE",
    sourceProposalState: "PROPOSAL_READY",
    lifecycleAgeMs: 0,
    intentAgeMs: 20,
    intentExpiresAt: 1_180,
    capitalReservationId: "reservation-1",
    capitalReservationExpiresAt: 1_300,
    proposedQuantity: 0.1,
    referenceVwapPrice: 10_002,
    proposedCapital: 1_120.5,
    blockers: [],
    remainingGates: ["EXECUTION_PLAN_NOT_CREATED", "INTENT_EXECUTION_NOT_AUTHORIZED"],
    lastLookPassed: true,
    executionPlanCreated: false,
    executionAuthorized: false,
    actionable: false,
    ...overrides,
  };
}

function createPreflight(
  overrides: Partial<HedgeInventoryIntentLastLookAssessment> = {},
  generatedAt = NOW,
): HedgeInventoryIntentLastLookSnapshot {
  const assessment = createAssessment(overrides);
  return {
    version: "22.12",
    strategyId: "hedge-inventory-management",
    generatedAt,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    intentLifecycleConfigurationState: "READY",
    intentPreflightConfigurationState: "READY",
    sourceIntentLifecycleGeneratedAt: generatedAt,
    sourceIntentProposalGeneratedAt: generatedAt,
    thresholds: { maximumLifecycleAgeMs: 50 },
    summary: {
      lifecycleIntents: 1,
      lifecycleActiveIntents: assessment.sourceLifecycleState === "ACTIVE" ? 1 : 0,
      preflightPassedIntents: assessment.state === "PREFLIGHT_PASS" ? 1 : 0,
      preflightRejectedIntents: assessment.state === "PREFLIGHT_REJECTED" ? 1 : 0,
      blockedIntents: assessment.state === "BLOCKED" ? 1 : 0,
      executionPlansCreated: 0,
      executableIntents: 0,
      actionableIntents: 0,
    },
    assessments: [assessment],
    blockers: [],
    notes: [],
    safety: {
      readOnlyLastLookEvidence: true,
      lifecycleActiveIntentsOnly: true,
      exactSourceLineageRequired: true,
      ttlRecheckedAtPreflight: true,
      preflightPassIsExecutionAuthorization: false,
      executionPlanCreationAllowed: false,
      reservationMutationAuthorized: false,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  };
}

try { main(); } catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
