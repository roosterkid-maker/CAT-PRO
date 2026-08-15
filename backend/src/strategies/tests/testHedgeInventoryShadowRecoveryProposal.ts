import assert from "node:assert/strict";

import { executionReconciliationEngine } from "../../execution/live/reconciliation/ExecutionReconciliationEngine";
import { executionRecoveryEngine } from "../../execution/live/recovery/ExecutionRecoveryEngine";
import { capitalReservationService } from "../../trading/capital/CapitalReservationService";
import { paperTradingService } from "../../trading/services/PaperTradingService";
import type { HedgeInventoryResidualReconciliationAssessment, HedgeInventoryResidualReconciliationRecord, HedgeInventoryResidualReconciliationSnapshot } from "../hedge-inventory-management/HedgeInventoryResidualReconciliationEvaluator";
import { createHedgeInventoryManagementConfiguration } from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";
import { HedgeInventoryShadowRecoveryProposalPlanner } from "../hedge-inventory-management/HedgeInventoryShadowRecoveryProposalPlanner";

const NOW = 4_000;

function main(): void {
  const reconciliationRecordsBefore =
    executionReconciliationEngine.getDiagnostics().records.length;
  const recoveryIncidentsBefore =
    executionRecoveryEngine.getDiagnostics().incidents.length;
  const reservationsBefore = capitalReservationService.getActive().length;
  const paperTradesBefore = paperTradingService.getTrades().length;
  const planner = new HedgeInventoryShadowRecoveryProposalPlanner();
  const configuration = createConfiguration();
  const reconciliations = createSnapshot();

  const first = planner.evaluate(configuration, reconciliations, NOW);
  const replay = planner.evaluate(configuration, reconciliations, NOW);

  assert.equal(first.version, "22.16");
  assert.equal(first.evidenceStatus, "AVAILABLE");
  assert.deepEqual(first.summary, {
    recoveryRequiredAssessments: 2,
    recoveryProposalsReady: 2,
    warningProposals: 1,
    criticalProposals: 1,
    notRequiredAssessments: 1,
    notApplicableAssessments: 0,
    blockedAssessments: 0,
    totalProposedRecoveryQuantity: 1.1,
    totalProposedRecoveryQuoteValue: 1_100,
    recoveryIncidentsCreated: 0,
    recoveryActionsCreated: 0,
    canonicalExecutionPlansCreated: 0,
    executableRecoveryActions: 0,
    actionableRecoveryActions: 0,
  });

  const closed = first.assessments[0];
  const warning = first.assessments[1];
  const critical = first.assessments[2];
  assert.ok(closed);
  assert.ok(warning?.proposal);
  assert.ok(critical?.proposal);
  assert.equal(closed.state, "NOT_REQUIRED");
  assert.equal(closed.proposal, null);
  assert.equal(warning.state, "RECOVERY_PROPOSAL_READY");
  assert.equal(warning.proposal.recoveryActionType, "RESIDUAL_HEDGE_REVIEW");
  assert.equal(warning.proposal.residualDirection, "LONG");
  assert.equal(warning.proposal.leg.side, "SELL");
  assert.equal(warning.proposal.leg.quantity, 0.1);
  assert.equal(warning.proposal.leg.estimatedQuoteValue, 100);
  assert.equal(critical.proposal.recoveryActionType, "RESIDUAL_EXPOSURE_ESCALATION");
  assert.equal(critical.proposal.residualDirection, "SHORT");
  assert.equal(critical.proposal.leg.side, "BUY");
  assert.equal(critical.proposal.leg.quantity, 1);
  assert.equal(critical.proposal.leg.estimatedQuoteValue, 1_000);
  assert.equal(critical.proposal.createdAt, NOW);
  assert.equal(critical.proposal.expiresAt, NOW + 100);
  assert.equal(critical.proposal.id, replay.assessments[2]?.proposal?.id);
  assert.equal(
    critical.proposal.validationHash,
    replay.assessments[2]?.proposal?.validationHash,
  );
  assert.equal(critical.proposal.leg.orderTypeSelected, false);
  assert.equal(critical.proposal.leg.timeInForceSelected, false);
  assert.equal(critical.proposal.leg.submissionAuthorized, false);
  assert.equal(critical.proposal.recoveryActionMaterialized, false);
  assert.equal(critical.proposal.canonicalExecutionPlanCreated, false);
  assert.deepEqual(critical.remainingGates, [
    "OPERATOR_REVIEW_REQUIRED",
    "RECOVERY_ACTION_NOT_CREATED",
    "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
    "INTENT_EXECUTION_NOT_AUTHORIZED",
  ]);

  const capped = planner.evaluate(
    createHedgeInventoryManagementConfiguration({
      ...baseConfigurationInput(),
      recoveryProposal: {
        enabled: true,
        maximumReconciliationAgeMs: 50,
        proposalTtlMs: 100,
        maximumProposalQuoteValue: 500,
      },
    }),
    reconciliations,
    NOW,
  );
  assert.equal(capped.assessments[1]?.state, "RECOVERY_PROPOSAL_READY");
  assert.deepEqual(
    capped.assessments[2]?.blockers,
    ["RECOVERY_PROPOSAL_VALUE_LIMIT_EXCEEDED"],
  );

  const staleSnapshot = createSnapshot({
    warningReconciledAt: NOW - 51,
  });
  const stale = planner.evaluate(configuration, staleSnapshot, NOW);
  assert.deepEqual(
    stale.assessments[1]?.blockers,
    ["RECONCILIATION_RECORD_STALE"],
  );

  const invalidSnapshot = createSnapshot({
    warningRecoveryRequired: false,
  });
  const invalid = planner.evaluate(configuration, invalidSnapshot, NOW);
  assert.deepEqual(
    invalid.assessments[1]?.blockers,
    ["INVALID_RECOVERY_REQUIRED_CONTRACT"],
  );

  const unavailable = planner.evaluate(
    createHedgeInventoryManagementConfiguration({
      ...baseConfigurationInput(),
      recoveryProposal: { enabled: false },
    }),
    reconciliations,
    NOW,
  );
  assert.deepEqual(
    unavailable.blockers,
    ["RECOVERY_PROPOSAL_CONFIGURATION_NOT_READY"],
  );

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(critical.proposal), true);
  assert.equal("recover" in planner, false);
  assert.equal("execute" in planner, false);
  assert.equal("submit" in planner, false);
  assert.equal(first.safety.liveReconciliationEngineCalled, false);
  assert.equal(first.safety.executionRecoveryEngineCalled, false);
  assert.equal(first.safety.recoveryActionCreationAllowed, false);
  assert.equal(first.safety.canonicalExecutionPlanCreationAllowed, false);
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

  console.log("Hedge / inventory-management V22.16 bounded SHADOW recovery-proposal test passed.");
  console.log("Counter-side, quantity, value and TTL were deterministic and bounded; no recovery incident/action, canonical plan, capital mutation or order execution occurred.");
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
    residualReconciliation: {
      enabled: true,
      maximumEvidenceAgeMs: 50,
      residualQuantityTolerance: 0.000001,
      criticalResidualExposureQuoteValue: 500,
    },
  } as const;
}

function createConfiguration() {
  return createHedgeInventoryManagementConfiguration({
    ...baseConfigurationInput(),
    recoveryProposal: {
      enabled: true,
      maximumReconciliationAgeMs: 50,
      proposalTtlMs: 100,
      maximumProposalQuoteValue: 2_000,
    },
  });
}

function createSnapshot(
  options: {
    warningReconciledAt?: number;
    warningRecoveryRequired?: boolean;
  } = {},
): HedgeInventoryResidualReconciliationSnapshot {
  const closed = createAssessment(
    "closed",
    "BTC",
    "BTCUSDT",
    "SELL",
    "RECONCILED_CLOSED",
    createRecord("closed", "BTC", "BTCUSDT", "SELL", "FLAT", "NONE", 0, 0),
    false,
  );
  const warningRecord = createRecord(
    "warning",
    "ETH",
    "ETHUSDT",
    "SELL",
    "LONG",
    "WARNING",
    0.1,
    100,
    options.warningReconciledAt ?? NOW,
    options.warningRecoveryRequired ?? true,
  );
  const warning = createAssessment(
    "warning",
    "ETH",
    "ETHUSDT",
    "SELL",
    "RECOVERY_REQUIRED",
    warningRecord,
    true,
  );
  const critical = createAssessment(
    "critical",
    "SOL",
    "SOLUSDT",
    "BUY",
    "RECOVERY_REQUIRED",
    createRecord("critical", "SOL", "SOLUSDT", "BUY", "SHORT", "CRITICAL", 1, 1_000),
    true,
  );

  return {
    version: "22.15",
    strategyId: "hedge-inventory-management",
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    shadowFillSimulationConfigurationState: "READY",
    residualReconciliationConfigurationState: "READY",
    sourceFillSimulationGeneratedAt: NOW,
    sourceReconciliationEvidenceGeneratedAt: NOW,
    thresholds: {
      maximumEvidenceAgeMs: 50,
      residualQuantityTolerance: 0.000001,
      criticalResidualExposureQuoteValue: 500,
    },
    summary: {
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
    },
    assessments: [closed, warning, critical],
    blockers: [],
    notes: [],
    safety: {
      readOnlyShadowReconciliationOnly: true,
      exactSimulationAndLedgerLineageRequired: true,
      liveReconciliationEngineCalled: false,
      executionRecoveryEngineCalled: false,
      recoveryIncidentCreationAllowed: false,
      recoveryActionCreationAllowed: false,
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

function createRecord(
  key: string,
  asset: string,
  market: string,
  sourceSide: "BUY" | "SELL",
  residualDirection: "LONG" | "SHORT" | "FLAT",
  severity: "NONE" | "WARNING" | "CRITICAL",
  residualQuantity: number,
  residualValue: number,
  reconciledAt = NOW,
  recoveryRequired = residualQuantity > 0,
): HedgeInventoryResidualReconciliationRecord {
  return {
    id: `reconciliation-${key}`,
    strategyId: "hedge-inventory-management",
    sourceSimulationId: `simulation-${key}`,
    sourcePlanProposalId: `plan-${key}`,
    sourceEvidenceId: `ledger-${key}`,
    routeId: `route-${key}`,
    asset,
    quoteAsset: "USDT",
    venue: "coindcx",
    market,
    side: sourceSide,
    residualDirection,
    requestedQuantity: key === "critical" ? 2 : 1,
    reconciledFilledQuantity: key === "critical" ? 1 : 1 - residualQuantity,
    reconciledResidualQuantity: residualQuantity,
    referencePrice: 1_000,
    reconciledResidualExposureQuoteValue: residualValue,
    recoveryRequired,
    severity,
    recommendedAction:
      severity === "CRITICAL"
        ? "ESCALATE_RESIDUAL_EXPOSURE"
        : severity === "WARNING"
          ? "REVIEW_RESIDUAL_HEDGE"
          : "NONE",
    reconciledAt,
    evidenceObservedAt: reconciledAt,
    method: "EXACT_MATCH_SHADOW_LEDGER_RECONCILIATION_V22_15",
    liveReconciliationRecordCreated: false,
    recoveryIncidentCreated: false,
    recoveryActionAuthorized: false,
    balanceMutationAuthorized: false,
    executionAuthorized: false,
    orderSubmissionAuthorized: false,
  };
}

function createAssessment(
  key: string,
  asset: string,
  market: string,
  side: "BUY" | "SELL",
  state: "RECONCILED_CLOSED" | "RECOVERY_REQUIRED",
  reconciliation: HedgeInventoryResidualReconciliationRecord,
  recoveryRequired: boolean,
): HedgeInventoryResidualReconciliationAssessment {
  return {
    id: `reconciliation-assessment-${key}`,
    fillSimulationAssessmentId: `fill-assessment-${key}`,
    simulationId: `simulation-${key}`,
    planProposalId: `plan-${key}`,
    intentId: `intent-${key}`,
    routeId: `route-${key}`,
    asset,
    quoteAsset: "USDT",
    venue: "coindcx",
    market,
    side,
    evidenceStatus: "AVAILABLE",
    state,
    sourceFillSimulationState:
      state === "RECONCILED_CLOSED"
        ? "SIMULATED_FULL_FILL"
        : "SIMULATED_PARTIAL_FILL",
    evidenceAgeMs: 0,
    reconciliation,
    recoveryRequired,
    blockers: [],
    remainingGates:
      recoveryRequired
        ? [
            "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
            "RECOVERY_ACTION_NOT_CREATED",
            "INTENT_EXECUTION_NOT_AUTHORIZED",
          ]
        : [
            "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
            "INTENT_EXECUTION_NOT_AUTHORIZED",
          ],
    liveReconciliationRecordCreated: false,
    recoveryIncidentCreated: false,
    recoveryActionCreated: false,
    executionAuthorized: false,
    actionable: false,
  };
}

try { main(); } catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
