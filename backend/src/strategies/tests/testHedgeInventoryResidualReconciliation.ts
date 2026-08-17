import assert from "node:assert/strict";

import { executionReconciliationEngine } from "../../execution/live/reconciliation/ExecutionReconciliationEngine";
import { executionRecoveryEngine } from "../../execution/live/recovery/ExecutionRecoveryEngine";
import { capitalReservationService } from "../../trading/capital/CapitalReservationService";
import { paperTradingService } from "../../trading/services/PaperTradingService";
import type { HedgeInventoryResidualReconciliationEvidenceRecord, HedgeInventoryResidualReconciliationEvidenceSnapshot } from "../hedge-inventory-management/HedgeInventoryResidualReconciliationEvaluator";
import { HedgeInventoryResidualReconciliationEvaluator } from "../hedge-inventory-management/HedgeInventoryResidualReconciliationEvaluator";
import { createHedgeInventoryManagementConfiguration } from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";
import type { HedgeInventoryShadowFillSimulation, HedgeInventoryShadowFillSimulationAssessment, HedgeInventoryShadowFillSimulationSnapshot } from "../hedge-inventory-management/HedgeInventoryShadowFillSimulator";

const NOW = 3_000;

function main(): void {
  const reconciliationRecordsBefore =
    executionReconciliationEngine.getDiagnostics().records.length;
  const recoveryIncidentsBefore =
    executionRecoveryEngine.getDiagnostics().incidents.length;
  const reservationsBefore = capitalReservationService.getActive().length;
  const paperTradesBefore = paperTradingService.getTrades().length;
  const configuration = createConfiguration();
  const simulations = createSimulationSnapshot();
  const sourceSimulations = simulations.assessments.map(
    (assessment) => assessment.simulation,
  );
  assert.ok(sourceSimulations.every((simulation) => simulation !== null));
  const [closedSimulation, warningSimulation, criticalSimulation] =
    sourceSimulations as HedgeInventoryShadowFillSimulation[];
  assert.ok(closedSimulation);
  assert.ok(warningSimulation);
  assert.ok(criticalSimulation);

  const evidence = createEvidence([
    createRecord(closedSimulation),
    createRecord(warningSimulation),
    createRecord(criticalSimulation),
  ]);
  const evaluator = new HedgeInventoryResidualReconciliationEvaluator();
  const first = evaluator.evaluate(configuration, simulations, evidence, NOW);
  const replay = evaluator.evaluate(configuration, simulations, evidence, NOW);

  assert.equal(first.version, "22.15");
  assert.equal(first.evidenceStatus, "AVAILABLE");
  assert.deepEqual(first.summary, {
    eligibleSimulations: 3,
    reconciledClosed: 1,
    recoveryRequired: 2,
    warningResiduals: 1,
    criticalResiduals: 1,
    rejectedReconciliations: 0,
    notApplicableSimulations: 0,
    blockedSimulations: 0,
    totalReconciledResidualQuantity: 1.1,
    totalReconciledResidualExposureQuoteValue: 1_100,
    liveReconciliationRecordsCreated: 0,
    recoveryIncidentsCreated: 0,
    recoveryActionsCreated: 0,
    executableRecoveryActions: 0,
    actionableRecoveryActions: 0,
  });

  const closed = first.assessments[0];
  const warning = first.assessments[1];
  const critical = first.assessments[2];
  assert.ok(closed?.reconciliation);
  assert.ok(warning?.reconciliation);
  assert.ok(critical?.reconciliation);
  assert.equal(closed.state, "RECONCILED_CLOSED");
  assert.equal(closed.recoveryRequired, false);
  assert.equal(closed.reconciliation.residualDirection, "FLAT");
  assert.equal(closed.reconciliation.severity, "NONE");
  assert.equal(closed.reconciliation.recommendedAction, "NONE");
  assert.equal(warning.state, "RECOVERY_REQUIRED");
  assert.equal(warning.recoveryRequired, true);
  assert.equal(warning.reconciliation.residualDirection, "LONG");
  assert.equal(warning.reconciliation.severity, "WARNING");
  assert.equal(warning.reconciliation.recommendedAction, "REVIEW_RESIDUAL_HEDGE");
  assert.equal(critical.state, "RECOVERY_REQUIRED");
  assert.equal(critical.reconciliation.residualDirection, "SHORT");
  assert.equal(critical.reconciliation.severity, "CRITICAL");
  assert.equal(critical.reconciliation.recommendedAction, "ESCALATE_RESIDUAL_EXPOSURE");
  assert.equal(
    critical.reconciliation.id,
    replay.assessments[2]?.reconciliation?.id,
  );
  assert.deepEqual(critical.remainingGates, [
    "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
    "RECOVERY_ACTION_NOT_CREATED",
    "INTENT_EXECUTION_NOT_AUTHORIZED",
  ]);

  const mismatch = evaluator.evaluate(
    configuration,
    simulations,
    createEvidence([
      createRecord(closedSimulation, {
        sourcePlanValidationHash: "mismatched-plan-hash",
      }),
      createRecord(warningSimulation),
      createRecord(criticalSimulation),
    ]),
    NOW,
  );
  assert.deepEqual(
    mismatch.assessments[0]?.blockers,
    ["RECONCILIATION_EVIDENCE_LINEAGE_MISMATCH"],
  );

  const stale = evaluator.evaluate(
    configuration,
    simulations,
    createEvidence([
      createRecord(closedSimulation),
      createRecord(warningSimulation, { observedAt: NOW - 51 }),
      createRecord(criticalSimulation),
    ]),
    NOW,
  );
  assert.deepEqual(
    stale.assessments[1]?.blockers,
    ["RECONCILIATION_EVIDENCE_STALE"],
  );

  const drift = evaluator.evaluate(
    configuration,
    simulations,
    createEvidence([
      createRecord(closedSimulation),
      createRecord(warningSimulation, {
        filledQuantity: 0.8,
        residualQuantity: 0.2,
        residualExposureQuoteValue: 200,
      }),
      createRecord(criticalSimulation),
    ]),
    NOW,
  );
  assert.equal(drift.assessments[1]?.state, "RECONCILIATION_REJECTED");
  assert.equal(drift.assessments[1]?.recoveryRequired, null);
  assert.deepEqual(
    drift.assessments[1]?.blockers,
    ["RECONCILIATION_QUANTITY_OR_VALUE_DRIFT"],
  );

  const unavailable = evaluator.evaluate(
    createHedgeInventoryManagementConfiguration({
      ...baseConfigurationInput(),
      residualReconciliation: { enabled: false },
    }),
    simulations,
    evidence,
    NOW,
  );
  assert.deepEqual(
    unavailable.blockers,
    ["RESIDUAL_RECONCILIATION_CONFIGURATION_NOT_READY"],
  );

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(critical.reconciliation), true);
  assert.equal("reconcile" in evaluator, false);
  assert.equal("recover" in evaluator, false);
  assert.equal(first.safety.liveReconciliationEngineCalled, false);
  assert.equal(first.safety.executionRecoveryEngineCalled, false);
  assert.equal(first.safety.recoveryActionCreationAllowed, false);
  assert.equal(first.safety.orderSubmissionAllowed, false);
  assert.equal(
    executionReconciliationEngine.getDiagnostics().records.length,
    reconciliationRecordsBefore,
  );
  assert.equal(
    executionRecoveryEngine.getDiagnostics().incidents.length,
    recoveryIncidentsBefore,
  );
  assert.equal(capitalReservationService.getActive().length, reservationsBefore);
  assert.equal(paperTradingService.getTrades().length, paperTradesBefore);

  console.log("Hedge / inventory-management V22.15 residual-reconciliation test passed.");
  console.log("Closed, warning and critical SHADOW residual evidence was classified without LIVE reconciliation, recovery incident/action, capital mutation or order execution.");
}

function baseConfigurationInput() {
  return {
    enabled: true,
    valuationQuoteAsset: "USDT",
    assetAllowlist: ["BTC", "ETH", "SOL"],
    targetInventoryByAsset: { BTC: 0.25, ETH: 2, SOL: 10 },
    maximumDeviationQuoteValue: 100,
    exposureLimitQuoteValue: 5_000,
    hedgeRatio: 1,
    hedgeVenueAllowlist: ["coindcx"],
    maximumExposureAgeMs: 100,
    shadowFillSimulation: {
      enabled: true,
      maximumEvidenceAgeMs: 50,
      maximumSlippagePercent: 1,
    },
  } as const;
}

function createConfiguration() {
  return createHedgeInventoryManagementConfiguration({
    ...baseConfigurationInput(),
    residualReconciliation: {
      enabled: true,
      maximumEvidenceAgeMs: 50,
      residualQuantityTolerance: 0.000001,
      criticalResidualExposureQuoteValue: 500,
    },
  });
}

function createSimulationSnapshot(): HedgeInventoryShadowFillSimulationSnapshot {
  const simulations = [
    createSimulation("closed", "BTC", "BTCUSDT", "SELL", 1, 1, 1_000),
    createSimulation("warning", "ETH", "ETHUSDT", "SELL", 1, 0.9, 1_000),
    createSimulation("critical", "SOL", "SOLUSDT", "BUY", 2, 1, 1_000),
  ];
  const assessments = simulations.map(createAssessment);

  return {
    version: "22.14",
    strategyId: "hedge-inventory-management",
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    executionPlanProposalConfigurationState: "READY",
    shadowFillSimulationConfigurationState: "READY",
    sourceExecutionPlanProposalGeneratedAt: NOW,
    sourceFillEvidenceGeneratedAt: NOW,
    thresholds: { maximumEvidenceAgeMs: 50, maximumSlippagePercent: 1 },
    summary: {
      planProposalsEvaluated: 3,
      simulatedFullFills: 1,
      simulatedPartialFills: 2,
      rejectedSimulations: 0,
      notApplicablePlans: 0,
      blockedPlans: 0,
      totalRequestedQuantity: 4,
      totalSimulatedFilledQuantity: 2.9,
      totalSimulatedResidualQuantity: 1.1,
      totalSimulatedGrossQuoteValue: 2_900,
      totalSimulatedFeeQuoteValue: 0,
      totalSimulatedSlippageQuoteValue: 0,
      totalResidualExposureQuoteValue: 1_100,
      actualExchangeFills: 0,
      canonicalExecutionPlansCreated: 0,
      executablePlans: 0,
      actionablePlans: 0,
    },
    assessments,
    blockers: [],
    notes: [],
    safety: {
      readOnlyShadowSimulationOnly: true,
      exactPlanAndEvidenceLineageRequired: true,
      feesVwapSlippageAndResidualModeled: true,
      exchangeFillCreated: false,
      canonicalExecutionPlannerCalled: false,
      executionReconciliationAllowed: false,
      portfolioMutationAllowed: false,
      balanceMutationAllowed: false,
      capitalReservationMutationAllowed: false,
      executionAuthorized: false,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  };
}

function createSimulation(
  key: string,
  asset: string,
  market: string,
  side: "BUY" | "SELL",
  requestedQuantity: number,
  filledQuantity: number,
  referencePrice: number,
): HedgeInventoryShadowFillSimulation {
  const residualQuantity = requestedQuantity - filledQuantity;
  return {
    id: `simulation-${key}`,
    strategyId: "hedge-inventory-management",
    sourcePlanProposalId: `plan-${key}`,
    sourcePlanValidationHash: `plan-hash-${key}`,
    sourceEvidenceId: `fill-evidence-${key}`,
    routeId: `route-${key}`,
    asset,
    quoteAsset: "USDT",
    venue: "coindcx",
    market,
    side,
    requestedQuantity,
    simulatedFilledQuantity: filledQuantity,
    simulatedResidualQuantity: residualQuantity,
    fillRatioPercent: (filledQuantity / requestedQuantity) * 100,
    referencePrice,
    simulatedVwapPrice: referencePrice,
    simulatedGrossQuoteValue: filledQuantity * referencePrice,
    simulatedFeeQuoteValue: 0,
    quoteFlow: side === "BUY" ? "COST" : "PROCEEDS",
    simulatedQuoteValueAfterFees: filledQuantity * referencePrice,
    simulatedSlippagePercent: 0,
    simulatedSlippageQuoteValue: 0,
    residualExposureQuoteValue: residualQuantity * referencePrice,
    simulatedAt: NOW,
    evidenceObservedAt: NOW,
    method: "EXACT_MATCH_SHADOW_ORDER_BOOK_REPLAY_V22_14",
    exchangeFill: false,
    balanceMutationAuthorized: false,
    capitalReservationMutationAuthorized: false,
    executionAuthorized: false,
    orderSubmissionAuthorized: false,
  };
}

function createAssessment(
  simulation: HedgeInventoryShadowFillSimulation,
): HedgeInventoryShadowFillSimulationAssessment {
  const state = simulation.simulatedResidualQuantity === 0
    ? "SIMULATED_FULL_FILL" as const
    : "SIMULATED_PARTIAL_FILL" as const;
  return {
    id: `${simulation.id}:assessment`,
    planAssessmentId: `${simulation.sourcePlanProposalId}:assessment`,
    planProposalId: simulation.sourcePlanProposalId,
    intentId: `intent-${simulation.asset}`,
    routeId: simulation.routeId,
    asset: simulation.asset,
    quoteAsset: simulation.quoteAsset,
    venue: simulation.venue,
    market: simulation.market,
    side: simulation.side,
    evidenceStatus: "AVAILABLE",
    state,
    sourcePlanState: "PLAN_PROPOSAL_READY",
    evidenceAgeMs: 0,
    simulation,
    blockers: [],
    remainingGates: [
      "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
      "EXECUTION_RECONCILIATION_NOT_RUN",
      "INTENT_EXECUTION_NOT_AUTHORIZED",
    ],
    simulatedFillGenerated: true,
    exchangeFillCreated: false,
    executionReconciled: false,
    executionAuthorized: false,
    actionable: false,
  };
}

function createEvidence(
  records: readonly HedgeInventoryResidualReconciliationEvidenceRecord[],
): HedgeInventoryResidualReconciliationEvidenceSnapshot {
  return {
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    records,
  };
}

function createRecord(
  simulation: HedgeInventoryShadowFillSimulation,
  overrides: Partial<HedgeInventoryResidualReconciliationEvidenceRecord> = {},
): HedgeInventoryResidualReconciliationEvidenceRecord {
  return {
    id: `${simulation.id}:ledger-evidence`,
    sourceSimulationId: simulation.id,
    sourcePlanProposalId: simulation.sourcePlanProposalId,
    sourcePlanValidationHash: simulation.sourcePlanValidationHash,
    routeId: simulation.routeId,
    asset: simulation.asset,
    quoteAsset: simulation.quoteAsset,
    venue: simulation.venue,
    market: simulation.market,
    side: simulation.side,
    observedAt: NOW,
    requestedQuantity: simulation.requestedQuantity,
    filledQuantity: simulation.simulatedFilledQuantity,
    residualQuantity: simulation.simulatedResidualQuantity,
    referencePrice: simulation.referencePrice,
    residualExposureQuoteValue: simulation.residualExposureQuoteValue,
    source: "SHADOW_LEDGER_REPLAY",
    ...overrides,
  };
}

try { main(); } catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
