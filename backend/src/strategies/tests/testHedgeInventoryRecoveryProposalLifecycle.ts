import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { executionRecoveryEngine } from "../../execution/live/recovery/ExecutionRecoveryEngine";
import { capitalReservationService } from "../../trading/capital/CapitalReservationService";
import { paperTradingService } from "../../trading/services/PaperTradingService";
import {
  HedgeInventoryRecoveryProposalLifecycleEvaluator,
} from "../hedge-inventory-management/HedgeInventoryRecoveryProposalLifecycleEvaluator";
import type {
  HedgeInventoryRecoveryOperatorDecisionEvidence,
  HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot,
} from "../hedge-inventory-management/HedgeInventoryRecoveryProposalLifecycleEvaluator";
import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";
import type {
  HedgeInventoryShadowRecoveryProposal,
  HedgeInventoryShadowRecoveryProposalAssessment,
  HedgeInventoryShadowRecoveryProposalSnapshot,
} from "../hedge-inventory-management/HedgeInventoryShadowRecoveryProposalPlanner";

const NOW = 10_000;

function main(): void {
  const recoveryIncidentsBefore =
    executionRecoveryEngine.getDiagnostics().incidents.length;
  const reservationsBefore = capitalReservationService.getActive().length;
  const paperTradesBefore = paperTradingService.getTrades().length;
  const evaluator = new HedgeInventoryRecoveryProposalLifecycleEvaluator();
  const configuration = createConfiguration();
  const active = createAssessment("active");
  const approved = createAssessment("approved");
  const rejected = createAssessment("rejected");
  const notRequired = createAssessment("closed", "NOT_REQUIRED");
  const proposals = createSnapshot([active, approved, rejected, notRequired]);
  const approvedProposal = approved.proposal!;
  const rejectedProposal = rejected.proposal!;
  const proposalBefore = structuredClone(approvedProposal);
  const operatorEvidence = createOperatorEvidence([
    createDecision("approve", approvedProposal, "APPROVE"),
    createDecision("reject", rejectedProposal, "REJECT"),
  ]);

  const first = evaluator.evaluate(
    configuration,
    proposals,
    operatorEvidence,
    NOW,
  );
  const replay = evaluator.evaluate(
    configuration,
    proposals,
    operatorEvidence,
    NOW,
  );

  assert.equal(first.version, "22.17");
  assert.equal(first.evidenceStatus, "AVAILABLE");
  assert.deepEqual(first.summary, {
    sourceProposalsReady: 3,
    activeAwaitingOperatorDecision: 1,
    operatorApproved: 1,
    operatorRejected: 1,
    expiredProposals: 0,
    notApplicableAssessments: 1,
    blockedAssessments: 0,
    explicitOperatorDecisionsAccepted: 2,
    lifecycleRecordsProduced: 2,
    recoveryIncidentsCreated: 0,
    recoveryActionsCreated: 0,
    canonicalExecutionPlansCreated: 0,
    executableRecoveryActions: 0,
    actionableRecoveryActions: 0,
  });

  const activeResult = first.assessments[0];
  const approvedResult = first.assessments[1];
  const rejectedResult = first.assessments[2];
  const closedResult = first.assessments[3];
  assert.equal(activeResult?.state, "ACTIVE_AWAITING_OPERATOR_DECISION");
  assert.equal(activeResult?.operatorDecision, null);
  assert.deepEqual(activeResult?.remainingGates, [
    "OPERATOR_DECISION_REQUIRED",
    "RECOVERY_ACTION_NOT_CREATED",
    "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
    "INTENT_EXECUTION_NOT_AUTHORIZED",
  ]);
  assert.equal(approvedResult?.state, "OPERATOR_APPROVED");
  assert.equal(approvedResult?.operatorDecision?.decision, "APPROVE");
  assert.equal(approvedResult?.terminal, false);
  assert.equal(approvedResult?.executionAuthorized, false);
  assert.deepEqual(approvedResult?.remainingGates, [
    "RECOVERY_ACTION_NOT_CREATED",
    "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
    "INTENT_EXECUTION_NOT_AUTHORIZED",
  ]);
  assert.equal(rejectedResult?.state, "OPERATOR_REJECTED");
  assert.equal(rejectedResult?.operatorDecision?.decision, "REJECT");
  assert.equal(rejectedResult?.terminal, true);
  assert.deepEqual(rejectedResult?.remainingGates, []);
  assert.equal(closedResult?.state, "NOT_APPLICABLE");
  assert.equal(
    approvedResult?.lifecycleRecord?.id,
    replay.assessments[1]?.lifecycleRecord?.id,
  );
  assert.deepEqual(approvedProposal, proposalBefore);

  const expiredProposal = createProposal("expired", NOW - 20, NOW);
  const expired = evaluator.evaluate(
    configuration,
    createSnapshot([createAssessment("expired", "RECOVERY_PROPOSAL_READY", expiredProposal)]),
    null,
    NOW,
  );
  assert.equal(expired.assessments[0]?.state, "EXPIRED");
  assert.deepEqual(
    expired.assessments[0]?.blockers,
    ["RECOVERY_PROPOSAL_EXPIRED"],
  );
  assert.equal(expired.assessments[0]?.lifecycleRecord?.recordedAt, NOW);

  const maximumAgeProposal = createProposal("maximum-age", NOW - 101, NOW + 100);
  const maximumAge = evaluator.evaluate(
    configuration,
    createSnapshot([createAssessment("maximum-age", "RECOVERY_PROPOSAL_READY", maximumAgeProposal)]),
    null,
    NOW,
  );
  assert.equal(maximumAge.assessments[0]?.state, "EXPIRED");
  assert.deepEqual(
    maximumAge.assessments[0]?.blockers,
    ["RECOVERY_PROPOSAL_MAXIMUM_AGE_EXCEEDED"],
  );

  const staleDecisionConfiguration = createConfiguration(200, 50);
  const staleProposal = createProposal("stale-decision", NOW - 100, NOW + 100);
  const staleDecision = evaluator.evaluate(
    staleDecisionConfiguration,
    createSnapshot([createAssessment("stale-decision", "RECOVERY_PROPOSAL_READY", staleProposal)]),
    createOperatorEvidence([
      createDecision("stale", staleProposal, "APPROVE", NOW - 51),
    ]),
    NOW,
  );
  assert.equal(staleDecision.assessments[0]?.state, "BLOCKED");
  assert.deepEqual(
    staleDecision.assessments[0]?.blockers,
    ["OPERATOR_DECISION_STALE"],
  );

  const ambiguous = evaluator.evaluate(
    configuration,
    createSnapshot([approved]),
    createOperatorEvidence([
      createDecision("first", approvedProposal, "APPROVE"),
      createDecision("second", approvedProposal, "REJECT"),
    ]),
    NOW,
  );
  assert.deepEqual(
    ambiguous.assessments[0]?.blockers,
    ["AMBIGUOUS_OPERATOR_DECISION"],
  );

  const tamperedProposal = {
    ...approvedProposal,
    leg: {
      ...approvedProposal.leg,
      quantity: approvedProposal.leg.quantity + 1,
    },
  };
  const tampered = evaluator.evaluate(
    configuration,
    createSnapshot([
      createAssessment("tampered", "RECOVERY_PROPOSAL_READY", tamperedProposal),
    ]),
    null,
    NOW,
  );
  assert.deepEqual(
    tampered.assessments[0]?.blockers,
    ["INVALID_RECOVERY_PROPOSAL_CONTRACT"],
  );

  const staleSnapshot = evaluator.evaluate(
    configuration,
    {
      ...createSnapshot([active]),
      generatedAt: NOW - 101,
    },
    null,
    NOW,
  );
  assert.deepEqual(
    staleSnapshot.blockers,
    ["RECOVERY_PROPOSAL_SNAPSHOT_STALE"],
  );

  const disabled = evaluator.evaluate(
    createHedgeInventoryManagementConfiguration(),
    proposals,
    null,
    NOW,
  );
  assert.deepEqual(
    disabled.blockers,
    ["STRATEGY_CONFIGURATION_NOT_READY"],
  );

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(approvedResult?.lifecycleRecord), true);
  assert.equal("approve" in evaluator, false);
  assert.equal("reject" in evaluator, false);
  assert.equal("execute" in evaluator, false);
  assert.equal(first.safety.readModelCreatesOperatorDecisions, false);
  assert.equal(first.safety.operatorApprovalIsExecutionAuthorization, false);
  assert.equal(first.safety.recoveryActionCreationAllowed, false);
  assert.equal(first.safety.orderSubmissionAllowed, false);
  assert.equal(
    executionRecoveryEngine.getDiagnostics().incidents.length,
    recoveryIncidentsBefore,
  );
  assert.equal(capitalReservationService.getActive().length, reservationsBefore);
  assert.equal(paperTradingService.getTrades().length, paperTradesBefore);

  console.log("Hedge / inventory-management V22.17 immutable recovery-proposal lifecycle test passed.");
  console.log("Expiry and exact operator decisions remained deterministic evidence; no recovery action, capital mutation, execution plan or order was created.");
}

function createConfiguration(
  maximumProposalAgeMs = 100,
  maximumOperatorDecisionAgeMs = 50,
) {
  return createHedgeInventoryManagementConfiguration({
    enabled: true,
    valuationQuoteAsset: "USDT",
    assetAllowlist: ["BTC"],
    targetInventoryByAsset: { BTC: 0.25 },
    maximumDeviationQuoteValue: 100,
    exposureLimitQuoteValue: 5_000,
    hedgeRatio: 1,
    hedgeVenueAllowlist: ["coindcx"],
    maximumExposureAgeMs: 100,
    recoveryProposal: {
      enabled: true,
      maximumReconciliationAgeMs: 100,
      proposalTtlMs: 200,
      maximumProposalQuoteValue: 5_000,
    },
    recoveryProposalLifecycle: {
      enabled: true,
      maximumProposalAgeMs,
      maximumOperatorDecisionAgeMs,
    },
  });
}

function createProposal(
  key: string,
  createdAt = NOW - 10,
  expiresAt = NOW + 100,
): HedgeInventoryShadowRecoveryProposal {
  const payload = {
    strategyId: "hedge-inventory-management" as const,
    kind: "SHADOW_RECOVERY_ACTION_PROPOSAL" as const,
    status: "PROPOSED" as const,
    mode: "SHADOW" as const,
    recoveryActionType: "RESIDUAL_HEDGE_REVIEW" as const,
    sourceReconciliationId: `reconciliation-${key}`,
    sourceFillSimulationAssessmentId: `fill-assessment-${key}`,
    sourceSimulationId: `simulation-${key}`,
    sourcePlanProposalId: `plan-${key}`,
    routeId: `route-${key}`,
    asset: "BTC",
    quoteAsset: "USDT",
    residualDirection: "LONG" as const,
    sourceSeverity: "WARNING" as const,
    sourceRecommendedAction: "REVIEW_RESIDUAL_HEDGE" as const,
    leg: {
      venue: "coindcx",
      market: "BTCUSDT",
      side: "SELL" as const,
      quantity: 0.1,
      referencePrice: 1_000,
      estimatedQuoteValue: 100,
      orderTypeSelected: false as const,
      timeInForceSelected: false as const,
      submissionAuthorized: false as const,
    },
    createdAt,
    expiresAt,
    recoveryIncidentCreated: false as const,
    recoveryActionMaterialized: false as const,
    canonicalExecutionPlanCreated: false as const,
    executionAuthorized: false as const,
    automaticExecutionAllowed: false as const,
    orderSubmissionAuthorized: false as const,
  };
  const validationHash = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");

  return {
    id: `hedge-shadow-recovery-proposal-${validationHash}`,
    validationHash,
    ...payload,
  };
}

function createAssessment(
  key: string,
  state:
    HedgeInventoryShadowRecoveryProposalAssessment["state"] =
      "RECOVERY_PROPOSAL_READY",
  proposal:
    HedgeInventoryShadowRecoveryProposal | null =
      state === "RECOVERY_PROPOSAL_READY" ? createProposal(key) : null,
): HedgeInventoryShadowRecoveryProposalAssessment {
  return {
    id: `recovery-proposal-assessment-${key}`,
    reconciliationAssessmentId: `reconciliation-assessment-${key}`,
    reconciliationId: `reconciliation-${key}`,
    simulationId: `simulation-${key}`,
    planProposalId: `plan-${key}`,
    intentId: `intent-${key}`,
    routeId: `route-${key}`,
    asset: "BTC",
    quoteAsset: "USDT",
    venue: "coindcx",
    market: "BTCUSDT",
    evidenceStatus: "AVAILABLE",
    state,
    sourceReconciliationState:
      state === "NOT_REQUIRED" ? "RECONCILED_CLOSED" : "RECOVERY_REQUIRED",
    reconciliationAgeMs: 10,
    proposal,
    blockers: [],
    remainingGates:
      proposal
        ? [
            "OPERATOR_REVIEW_REQUIRED",
            "RECOVERY_ACTION_NOT_CREATED",
            "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
            "INTENT_EXECUTION_NOT_AUTHORIZED",
          ]
        : [],
    recoveryProposalGenerated: proposal !== null,
    recoveryIncidentCreated: false,
    recoveryActionCreated: false,
    canonicalExecutionPlanCreated: false,
    executionAuthorized: false,
    actionable: false,
  };
}

function createSnapshot(
  assessments: readonly HedgeInventoryShadowRecoveryProposalAssessment[],
): HedgeInventoryShadowRecoveryProposalSnapshot {
  const proposals = assessments.filter(
    (assessment) => assessment.state === "RECOVERY_PROPOSAL_READY",
  );
  return {
    version: "22.16",
    strategyId: "hedge-inventory-management",
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    residualReconciliationConfigurationState: "READY",
    recoveryProposalConfigurationState: "READY",
    sourceResidualReconciliationGeneratedAt: NOW,
    thresholds: {
      maximumReconciliationAgeMs: 100,
      proposalTtlMs: 200,
      maximumProposalQuoteValue: 5_000,
    },
    summary: {
      recoveryRequiredAssessments: proposals.length,
      recoveryProposalsReady: proposals.length,
      warningProposals: proposals.length,
      criticalProposals: 0,
      notRequiredAssessments:
        assessments.filter((assessment) => assessment.state === "NOT_REQUIRED").length,
      notApplicableAssessments: 0,
      blockedAssessments: 0,
      totalProposedRecoveryQuantity: proposals.length * 0.1,
      totalProposedRecoveryQuoteValue: proposals.length * 100,
      recoveryIncidentsCreated: 0,
      recoveryActionsCreated: 0,
      canonicalExecutionPlansCreated: 0,
      executableRecoveryActions: 0,
      actionableRecoveryActions: 0,
    },
    assessments,
    blockers: [],
    notes: [],
    safety: {
      deterministicBoundedShadowProposalOnly: true,
      sourceResidualNeverExceeded: true,
      orderParametersSelected: false,
      liveReconciliationEngineCalled: false,
      executionRecoveryEngineCalled: false,
      recoveryIncidentCreationAllowed: false,
      recoveryActionCreationAllowed: false,
      canonicalExecutionPlanCreationAllowed: false,
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

function createDecision(
  key: string,
  proposal: HedgeInventoryShadowRecoveryProposal,
  decision: "APPROVE" | "REJECT",
  decidedAt = NOW - 5,
): HedgeInventoryRecoveryOperatorDecisionEvidence {
  return {
    id: `operator-decision-${key}`,
    proposalId: proposal.id,
    proposalValidationHash: proposal.validationHash,
    decision,
    decidedBy: "operator:test",
    reason: `${decision.toLowerCase()}-test-evidence`,
    decidedAt,
    recoveryActionAuthorized: false,
    executionAuthorized: false,
    orderSubmissionAuthorized: false,
  };
}

function createOperatorEvidence(
  decisions: readonly HedgeInventoryRecoveryOperatorDecisionEvidence[],
): HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot {
  return {
    generatedAt: NOW,
    evidenceStatus: decisions.length > 0 ? "AVAILABLE" : "NO_DATA",
    decisions,
  };
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
