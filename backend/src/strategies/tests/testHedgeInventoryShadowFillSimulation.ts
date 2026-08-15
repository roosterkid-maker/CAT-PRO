import assert from "node:assert/strict";

import { capitalReservationService } from "../../trading/capital/CapitalReservationService";
import { paperTradingService } from "../../trading/services/PaperTradingService";
import type { HedgeInventoryIntentLastLookAssessment, HedgeInventoryIntentLastLookSnapshot } from "../hedge-inventory-management/HedgeInventoryIntentLastLookEvaluator";
import { createHedgeInventoryManagementConfiguration } from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";
import type { HedgeInventoryShadowFillEvidenceRecord, HedgeInventoryShadowFillEvidenceSnapshot } from "../hedge-inventory-management/HedgeInventoryShadowFillSimulator";
import { HedgeInventoryShadowFillSimulator } from "../hedge-inventory-management/HedgeInventoryShadowFillSimulator";
import { HedgeInventoryShadowExecutionPlanPlanner } from "../hedge-inventory-management/HedgeInventoryShadowExecutionPlanPlanner";

const NOW = 2_000;

function main(): void {
  const reservationsBefore = capitalReservationService.getActive().length;
  const paperTradesBefore = paperTradingService.getTrades().length;
  const configuration = createConfiguration();
  const planner = new HedgeInventoryShadowExecutionPlanPlanner();
  const plans = planner.evaluate(configuration, createPreflight(), NOW);
  const sellProposal = plans.assessments[0]?.proposal;
  const buyProposal = plans.assessments[1]?.proposal;
  assert.ok(sellProposal);
  assert.ok(buyProposal);

  const simulator = new HedgeInventoryShadowFillSimulator();
  const evidence = createEvidence([
    createRecord(sellProposal, {
      id: "fill-evidence-full",
      executableQuantity: 0.1,
      vwapPrice: 9_990,
      feeQuoteValue: 1,
      slippagePercent: 0.1,
    }),
    createRecord(buyProposal, {
      id: "fill-evidence-partial",
      executableQuantity: 0.4,
      vwapPrice: 2_002,
      feeQuoteValue: 0.8,
      slippagePercent: 0.1,
    }),
  ]);

  const first = simulator.evaluate(configuration, plans, evidence, NOW);
  const replay = simulator.evaluate(configuration, plans, evidence, NOW);

  assert.equal(first.version, "22.14");
  assert.equal(first.evidenceStatus, "AVAILABLE");
  assert.equal(first.summary.planProposalsEvaluated, 2);
  assert.equal(first.summary.simulatedFullFills, 1);
  assert.equal(first.summary.simulatedPartialFills, 1);
  assert.equal(first.summary.rejectedSimulations, 0);
  assert.equal(first.summary.blockedPlans, 0);
  assert.equal(first.summary.actualExchangeFills, 0);
  assert.equal(first.summary.canonicalExecutionPlansCreated, 0);
  assert.equal(first.summary.executablePlans, 0);
  assert.equal(first.summary.actionablePlans, 0);
  assertClose(first.summary.totalRequestedQuantity, 1.1);
  assertClose(first.summary.totalSimulatedFilledQuantity, 0.5);
  assertClose(first.summary.totalSimulatedResidualQuantity, 0.6);
  assertClose(first.summary.totalSimulatedGrossQuoteValue, 1_799.8);
  assertClose(first.summary.totalSimulatedFeeQuoteValue, 1.8);
  assertClose(first.summary.totalSimulatedSlippageQuoteValue, 1.8);
  assertClose(first.summary.totalResidualExposureQuoteValue, 1_200);

  const full = first.assessments[0];
  const partial = first.assessments[1];
  assert.ok(full?.simulation);
  assert.ok(partial?.simulation);
  assert.equal(full.state, "SIMULATED_FULL_FILL");
  assert.equal(full.simulation.simulatedResidualQuantity, 0);
  assert.equal(full.simulation.quoteFlow, "PROCEEDS");
  assertClose(full.simulation.simulatedQuoteValueAfterFees, 998);
  assert.equal(partial.state, "SIMULATED_PARTIAL_FILL");
  assertClose(partial.simulation.simulatedResidualQuantity, 0.6);
  assertClose(partial.simulation.fillRatioPercent, 40);
  assert.equal(partial.simulation.quoteFlow, "COST");
  assertClose(partial.simulation.simulatedQuoteValueAfterFees, 801.6);
  assertClose(partial.simulation.residualExposureQuoteValue, 1_200);
  assert.equal(full.simulation.id, replay.assessments[0]?.simulation?.id);
  assert.equal(partial.simulation.id, replay.assessments[1]?.simulation?.id);
  assert.deepEqual(partial.remainingGates, [
    "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
    "EXECUTION_RECONCILIATION_NOT_RUN",
    "INTENT_EXECUTION_NOT_AUTHORIZED",
  ]);

  const mismatchRecord = createRecord(sellProposal, {
    sourcePlanValidationHash: "wrong-validation-hash",
  });
  const mismatch = simulator.evaluate(
    configuration,
    plans,
    createEvidence([
      mismatchRecord,
      createRecord(buyProposal),
    ]),
    NOW,
  );
  assert.deepEqual(
    mismatch.assessments[0]?.blockers,
    ["FILL_EVIDENCE_LINEAGE_MISMATCH"],
  );

  const stale = simulator.evaluate(
    configuration,
    plans,
    createEvidence([
      createRecord(sellProposal, { observedAt: NOW - 51 }),
      createRecord(buyProposal),
    ]),
    NOW,
  );
  assert.deepEqual(
    stale.assessments[0]?.blockers,
    ["FILL_EVIDENCE_STALE"],
  );

  const excessiveSlippage = simulator.evaluate(
    configuration,
    plans,
    createEvidence([
      createRecord(sellProposal, {
        vwapPrice: 9_800,
        slippagePercent: 2,
      }),
      createRecord(buyProposal),
    ]),
    NOW,
  );
  assert.equal(excessiveSlippage.assessments[0]?.state, "SIMULATION_REJECTED");
  assert.deepEqual(
    excessiveSlippage.assessments[0]?.blockers,
    ["SIMULATED_SLIPPAGE_LIMIT_EXCEEDED"],
  );

  const unavailable = simulator.evaluate(
    createHedgeInventoryManagementConfiguration({
      ...baseConfigurationInput(),
      shadowFillSimulation: { enabled: false },
    }),
    plans,
    evidence,
    NOW,
  );
  assert.deepEqual(
    unavailable.blockers,
    ["SHADOW_FILL_SIMULATION_CONFIGURATION_NOT_READY"],
  );

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(full.simulation), true);
  assert.equal("execute" in simulator, false);
  assert.equal("submit" in simulator, false);
  assert.equal(first.safety.exchangeFillCreated, false);
  assert.equal(first.safety.executionReconciliationAllowed, false);
  assert.equal(first.safety.balanceMutationAllowed, false);
  assert.equal(first.safety.orderSubmissionAllowed, false);
  assert.equal(capitalReservationService.getActive().length, reservationsBefore);
  assert.equal(paperTradingService.getTrades().length, paperTradesBefore);

  console.log("Hedge / inventory-management V22.14 exact-match SHADOW fill-simulation test passed.");
  console.log("Full/partial fill, VWAP, fees, adverse slippage and residual exposure were modeled without an exchange fill, reconciliation, capital mutation or order action.");
}

function baseConfigurationInput() {
  return {
    enabled: true,
    valuationQuoteAsset: "USDT",
    assetAllowlist: ["BTC", "ETH"],
    targetInventoryByAsset: { BTC: 0.25, ETH: 2 },
    maximumDeviationQuoteValue: 100,
    exposureLimitQuoteValue: 5_000,
    hedgeRatio: 1,
    hedgeVenueAllowlist: ["coindcx"],
    maximumExposureAgeMs: 100,
    intentPreflight: { enabled: true, maximumLifecycleAgeMs: 50 },
    executionPlanProposal: { enabled: true, maximumPreflightAgeMs: 50, proposalTtlMs: 100 },
  } as const;
}

function createConfiguration() {
  return createHedgeInventoryManagementConfiguration({
    ...baseConfigurationInput(),
    shadowFillSimulation: {
      enabled: true,
      maximumEvidenceAgeMs: 50,
      maximumSlippagePercent: 1,
    },
  });
}

function createAssessment(
  id: string,
  overrides: Partial<HedgeInventoryIntentLastLookAssessment> = {},
): HedgeInventoryIntentLastLookAssessment {
  return {
    id: `${id}:lifecycle:last-look`,
    lifecycleAssessmentId: `${id}:lifecycle`,
    intentId: id,
    sourceProposalId: `${id}:proposal`,
    routeId: `${id}:route`,
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
    intentAgeMs: 10,
    intentExpiresAt: 2_300,
    capitalReservationId: `${id}:reservation`,
    capitalReservationExpiresAt: 2_400,
    proposedQuantity: 0.1,
    referenceVwapPrice: 10_000,
    proposedCapital: 1_000,
    blockers: [],
    remainingGates: ["EXECUTION_PLAN_NOT_CREATED", "INTENT_EXECUTION_NOT_AUTHORIZED"],
    lastLookPassed: true,
    executionPlanCreated: false,
    executionAuthorized: false,
    actionable: false,
    ...overrides,
  };
}

function createPreflight(): HedgeInventoryIntentLastLookSnapshot {
  const assessments = [
    createAssessment("strategy-intent-sell"),
    createAssessment("strategy-intent-buy", {
      asset: "ETH",
      side: "BUY",
      market: "ETHUSDT",
      proposedQuantity: 1,
      referenceVwapPrice: 2_000,
      proposedCapital: 2_000,
    }),
  ];

  return {
    version: "22.12",
    strategyId: "hedge-inventory-management",
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    intentLifecycleConfigurationState: "READY",
    intentPreflightConfigurationState: "READY",
    sourceIntentLifecycleGeneratedAt: NOW,
    sourceIntentProposalGeneratedAt: NOW,
    thresholds: { maximumLifecycleAgeMs: 50 },
    summary: {
      lifecycleIntents: 2,
      lifecycleActiveIntents: 2,
      preflightPassedIntents: 2,
      preflightRejectedIntents: 0,
      blockedIntents: 0,
      executionPlansCreated: 0,
      executableIntents: 0,
      actionableIntents: 0,
    },
    assessments,
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

function createEvidence(
  records: readonly HedgeInventoryShadowFillEvidenceRecord[],
): HedgeInventoryShadowFillEvidenceSnapshot {
  return {
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    records,
  };
}

function createRecord(
  proposal: NonNullable<ReturnType<HedgeInventoryShadowExecutionPlanPlanner["evaluate"]>["assessments"][number]["proposal"]>,
  overrides: Partial<HedgeInventoryShadowFillEvidenceRecord> = {},
): HedgeInventoryShadowFillEvidenceRecord {
  return {
    id: `${proposal.id}:fill-evidence`,
    sourcePlanProposalId: proposal.id,
    sourcePlanValidationHash: proposal.validationHash,
    routeId: proposal.routeId,
    asset: proposal.asset,
    quoteAsset: proposal.quoteAsset,
    venue: proposal.leg.venue,
    market: proposal.leg.market,
    side: proposal.leg.side,
    requestedQuantity: proposal.leg.quantity,
    observedAt: NOW,
    executableQuantity: proposal.leg.quantity,
    vwapPrice: proposal.leg.referencePrice,
    feeQuoteValue: 0,
    slippagePercent: 0,
    source: "SHADOW_ORDER_BOOK_REPLAY",
    ...overrides,
  };
}

function assertClose(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `Expected ${actual} to be close to ${expected}.`,
  );
}

try { main(); } catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
