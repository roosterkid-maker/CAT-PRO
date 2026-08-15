import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { executionRecoveryEngine } from "../../execution/live/recovery/ExecutionRecoveryEngine";
import { capitalReservationService } from "../../trading/capital/CapitalReservationService";
import { paperTradingService } from "../../trading/services/PaperTradingService";
import type {
  HedgeInventoryRecoveryProposalLifecycleAssessment,
  HedgeInventoryRecoveryProposalLifecycleSnapshot,
} from "../hedge-inventory-management/HedgeInventoryRecoveryProposalLifecycleEvaluator";
import { createHedgeInventoryManagementConfiguration } from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";
import { HedgeInventoryShadowRecoveryActionHandoffPlanner } from "../hedge-inventory-management/HedgeInventoryShadowRecoveryActionHandoffPlanner";
import type {
  HedgeInventoryShadowRecoveryProposal,
  HedgeInventoryShadowRecoveryProposalAssessment,
  HedgeInventoryShadowRecoveryProposalSnapshot,
} from "../hedge-inventory-management/HedgeInventoryShadowRecoveryProposalPlanner";

const NOW = 20_000;

function main(): void {
  const recoveryIncidentsBefore =
    executionRecoveryEngine.getDiagnostics().incidents.length;
  const reservationsBefore = capitalReservationService.getActive().length;
  const paperTradesBefore = paperTradingService.getTrades().length;
  const planner = new HedgeInventoryShadowRecoveryActionHandoffPlanner();
  const configuration = createConfiguration();
  const approvedProposal = createProposal("approved", NOW - 10, NOW + 40);
  const activeProposal = createProposal("active", NOW - 10, NOW + 80);
  const rejectedProposal = createProposal("rejected", NOW - 10, NOW + 80);
  const proposals = createProposalSnapshot([
    createProposalAssessment("approved", approvedProposal),
    createProposalAssessment("active", activeProposal),
    createProposalAssessment("rejected", rejectedProposal),
    createProposalAssessment("closed", null, "NOT_REQUIRED"),
  ]);
  const lifecycle = createLifecycleSnapshot([
    createLifecycleAssessment("approved", approvedProposal, "OPERATOR_APPROVED"),
    createLifecycleAssessment("active", activeProposal, "ACTIVE_AWAITING_OPERATOR_DECISION"),
    createLifecycleAssessment("rejected", rejectedProposal, "OPERATOR_REJECTED"),
    createLifecycleAssessment("closed", null, "NOT_APPLICABLE"),
  ]);
  const proposalBefore = structuredClone(approvedProposal);

  const first = planner.evaluate(configuration, proposals, lifecycle, NOW);
  const replay = planner.evaluate(configuration, proposals, lifecycle, NOW);

  assert.equal(first.version, "22.18");
  assert.equal(first.evidenceStatus, "AVAILABLE");
  assert.deepEqual(first.summary, {
    lifecycleAssessments: 4,
    operatorApprovedAssessments: 1,
    recoveryHandoffsReady: 1,
    awaitingOperatorDecision: 1,
    notApprovedAssessments: 1,
    notApplicableAssessments: 1,
    blockedAssessments: 0,
    totalHandoffQuantity: 0.1,
    totalHandoffQuoteValue: 100,
    recoveryIncidentsCreated: 0,
    recoveryActionsCreated: 0,
    canonicalExecutionPlansCreated: 0,
    capitalReservationsCreated: 0,
    executableRecoveryActions: 0,
    actionableRecoveryActions: 0,
  });

  const approved = first.assessments[0];
  const active = first.assessments[1];
  const rejected = first.assessments[2];
  const closed = first.assessments[3];
  assert.ok(approved?.handoff);
  assert.equal(approved.state, "RECOVERY_HANDOFF_READY");
  assert.equal(approved.handoff.kind, "SHADOW_RECOVERY_ACTION_HANDOFF");
  assert.equal(approved.handoff.status, "HANDOFF_READY");
  assert.equal(approved.handoff.leg.side, "SELL");
  assert.equal(approved.handoff.leg.quantity, approvedProposal.leg.quantity);
  assert.equal(
    approved.handoff.leg.estimatedQuoteValue,
    approvedProposal.leg.estimatedQuoteValue,
  );
  assert.equal(approved.handoff.createdAt, NOW - 5);
  assert.equal(
    approved.handoff.expiresAt,
    approvedProposal.expiresAt,
    "Handoff TTL must never exceed the original proposal expiry.",
  );
  assert.equal(
    approved.handoff.id,
    replay.assessments[0]?.handoff?.id,
  );
  assert.equal(
    approved.handoff.validationHash,
    replay.assessments[0]?.handoff?.validationHash,
  );
  assert.equal(approved.handoff.recoveryActionMaterialized, false);
  assert.equal(approved.handoff.capitalReservationCreated, false);
  assert.equal(approved.handoff.canonicalExecutionPlanCreated, false);
  assert.equal(approved.handoff.executionAuthorized, false);
  assert.equal(approved.handoff.orderSubmissionAuthorized, false);
  assert.deepEqual(approved.remainingGates, [
    "RECOVERY_ACTION_NOT_CREATED",
    "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
    "CAPITAL_RESERVATION_NOT_CREATED",
    "INTENT_EXECUTION_NOT_AUTHORIZED",
    "ORDER_SUBMISSION_NOT_AUTHORIZED",
  ]);
  assert.equal(active?.state, "AWAITING_OPERATOR_DECISION");
  assert.equal(active?.handoff, null);
  assert.equal(rejected?.state, "NOT_APPROVED");
  assert.equal(rejected?.handoff, null);
  assert.equal(closed?.state, "NOT_APPLICABLE");
  assert.deepEqual(approvedProposal, proposalBefore);

  const capped = planner.evaluate(
    createConfiguration(50, 100, 50),
    proposals,
    lifecycle,
    NOW,
  );
  assert.deepEqual(
    capped.assessments[0]?.blockers,
    ["RECOVERY_HANDOFF_VALUE_LIMIT_EXCEEDED"],
  );

  const staleProposal = createProposal("stale", NOW - 60, NOW + 100);
  const stale = planner.evaluate(
    configuration,
    createProposalSnapshot([createProposalAssessment("stale", staleProposal)]),
    createLifecycleSnapshot([
      createLifecycleAssessment(
        "stale",
        staleProposal,
        "OPERATOR_APPROVED",
        NOW - 51,
      ),
    ]),
    NOW,
  );
  assert.deepEqual(
    stale.assessments[0]?.blockers,
    ["RECOVERY_LIFECYCLE_STALE"],
  );

  const tamperedLifecycle = createLifecycleSnapshot([
    {
      ...createLifecycleAssessment("approved", approvedProposal, "OPERATOR_APPROVED"),
      proposalValidationHash: "tampered-hash",
    },
  ]);
  const tampered = planner.evaluate(
    configuration,
    proposals,
    tamperedLifecycle,
    NOW,
  );
  assert.deepEqual(
    tampered.assessments[0]?.blockers,
    ["INVALID_OPERATOR_APPROVED_LIFECYCLE_CONTRACT"],
  );

  const expiringProposal = createProposal("expiring", NOW - 10, NOW);
  const expiring = planner.evaluate(
    configuration,
    createProposalSnapshot([
      createProposalAssessment("expiring", expiringProposal),
    ]),
    createLifecycleSnapshot([
      createLifecycleAssessment("expiring", expiringProposal, "OPERATOR_APPROVED"),
    ]),
    NOW,
  );
  assert.deepEqual(
    expiring.assessments[0]?.blockers,
    ["RECOVERY_HANDOFF_EXPIRY_INVALID"],
  );

  const staleSnapshot = planner.evaluate(
    configuration,
    proposals,
    {
      ...lifecycle,
      generatedAt: NOW - 51,
    },
    NOW,
  );
  assert.deepEqual(
    staleSnapshot.blockers,
    ["RECOVERY_LIFECYCLE_SNAPSHOT_STALE"],
  );

  const disabled = planner.evaluate(
    createHedgeInventoryManagementConfiguration(),
    proposals,
    lifecycle,
    NOW,
  );
  assert.deepEqual(
    disabled.blockers,
    ["STRATEGY_CONFIGURATION_NOT_READY"],
  );

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(approved.handoff), true);
  assert.equal("handoff" in planner, false);
  assert.equal("recover" in planner, false);
  assert.equal("execute" in planner, false);
  assert.equal(first.safety.operatorApprovalConsumedAsEvidenceOnly, true);
  assert.equal(first.safety.recoveryActionCreationAllowed, false);
  assert.equal(first.safety.canonicalExecutionPlanCreationAllowed, false);
  assert.equal(first.safety.orderSubmissionAllowed, false);
  assert.equal(
    executionRecoveryEngine.getDiagnostics().incidents.length,
    recoveryIncidentsBefore,
  );
  assert.equal(capitalReservationService.getActive().length, reservationsBefore);
  assert.equal(paperTradingService.getTrades().length, paperTradesBefore);

  console.log("Hedge / inventory-management V22.18 operator-approved SHADOW recovery handoff test passed.");
  console.log("Approved lineage, quantity, value and expiry stayed bounded; no recovery action, capital reservation, plan or order was created.");
}

function createConfiguration(
  maximumLifecycleAgeMs = 50,
  handoffTtlMs = 100,
  maximumHandoffQuoteValue = 500,
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
      maximumProposalAgeMs: 100,
      maximumOperatorDecisionAgeMs: 50,
    },
    recoveryActionHandoff: {
      enabled: true,
      maximumLifecycleAgeMs,
      handoffTtlMs,
      maximumHandoffQuoteValue,
    },
  });
}

function createProposal(
  key: string,
  createdAt: number,
  expiresAt: number,
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

function createProposalAssessment(
  key: string,
  proposal: HedgeInventoryShadowRecoveryProposal | null,
  state: HedgeInventoryShadowRecoveryProposalAssessment["state"] =
    proposal ? "RECOVERY_PROPOSAL_READY" : "NOT_REQUIRED",
): HedgeInventoryShadowRecoveryProposalAssessment {
  return {
    id: `proposal-assessment-${key}`,
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
      state === "RECOVERY_PROPOSAL_READY" ? "RECOVERY_REQUIRED" : "RECONCILED_CLOSED",
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

function createProposalSnapshot(
  assessments: readonly HedgeInventoryShadowRecoveryProposalAssessment[],
): HedgeInventoryShadowRecoveryProposalSnapshot {
  const ready = assessments.filter(
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
      recoveryRequiredAssessments: ready.length,
      recoveryProposalsReady: ready.length,
      warningProposals: ready.length,
      criticalProposals: 0,
      notRequiredAssessments:
        assessments.filter((assessment) => assessment.state === "NOT_REQUIRED").length,
      notApplicableAssessments: 0,
      blockedAssessments: 0,
      totalProposedRecoveryQuantity: ready.length * 0.1,
      totalProposedRecoveryQuoteValue: ready.length * 100,
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

function createLifecycleAssessment(
  key: string,
  proposal: HedgeInventoryShadowRecoveryProposal | null,
  state: HedgeInventoryRecoveryProposalLifecycleAssessment["state"],
  decidedAt = NOW - 5,
): HedgeInventoryRecoveryProposalLifecycleAssessment {
  const approved = state === "OPERATOR_APPROVED";
  const rejected = state === "OPERATOR_REJECTED";
  const hasDecision = approved || rejected;
  const decision = hasDecision && proposal
    ? {
        id: `operator-decision-${key}`,
        proposalId: proposal.id,
        proposalValidationHash: proposal.validationHash,
        decision: approved ? "APPROVE" as const : "REJECT" as const,
        decidedBy: "operator:test",
        reason: `${state.toLowerCase()}-test`,
        decidedAt,
        recoveryActionAuthorized: false as const,
        executionAuthorized: false as const,
        orderSubmissionAuthorized: false as const,
      }
    : null;
  const record = hasDecision && proposal && decision
    ? {
        id: `lifecycle-record-${key}`,
        proposalId: proposal.id,
        proposalValidationHash: proposal.validationHash,
        state: approved ? "OPERATOR_APPROVED" as const : "OPERATOR_REJECTED" as const,
        reason: approved ? "EXPLICIT_OPERATOR_APPROVAL" as const : "EXPLICIT_OPERATOR_REJECTION" as const,
        recordedAt: decidedAt,
        operatorDecisionId: decision.id,
        sourceProposalMutated: false as const,
        recoveryActionAuthorized: false as const,
        executionAuthorized: false as const,
        orderSubmissionAuthorized: false as const,
      }
    : null;

  return {
    id: `lifecycle-assessment-${key}`,
    sourceAssessmentId: `proposal-assessment-${key}`,
    proposalId: proposal?.id ?? null,
    proposalValidationHash: proposal?.validationHash ?? null,
    routeId: `route-${key}`,
    asset: "BTC",
    quoteAsset: "USDT",
    venue: "coindcx",
    market: "BTCUSDT",
    side: proposal?.leg.side ?? null,
    evidenceStatus: "AVAILABLE",
    state,
    sourceProposalState:
      proposal ? "RECOVERY_PROPOSAL_READY" : "NOT_REQUIRED",
    proposalAgeMs: proposal ? NOW - proposal.createdAt : null,
    proposalExpiresAt: proposal?.expiresAt ?? null,
    operatorDecision: decision,
    operatorDecisionAgeMs: decision ? NOW - decision.decidedAt : null,
    lifecycleRecord: record,
    blockers: [],
    remainingGates:
      approved
        ? [
            "RECOVERY_ACTION_NOT_CREATED",
            "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
            "INTENT_EXECUTION_NOT_AUTHORIZED",
          ]
        : state === "ACTIVE_AWAITING_OPERATOR_DECISION"
          ? [
              "OPERATOR_DECISION_REQUIRED",
              "RECOVERY_ACTION_NOT_CREATED",
              "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
              "INTENT_EXECUTION_NOT_AUTHORIZED",
            ]
          : [],
    lifecycleRevalidated: true,
    terminal: rejected,
    sourceProposalMutated: false,
    recoveryIncidentCreated: false,
    recoveryActionCreated: false,
    canonicalExecutionPlanCreated: false,
    executionAuthorized: false,
    actionable: false,
  };
}

function createLifecycleSnapshot(
  assessments: readonly HedgeInventoryRecoveryProposalLifecycleAssessment[],
): HedgeInventoryRecoveryProposalLifecycleSnapshot {
  return {
    version: "22.17",
    strategyId: "hedge-inventory-management",
    generatedAt: NOW,
    evidenceStatus: "AVAILABLE",
    configurationState: "FOUNDATION_READY",
    recoveryProposalConfigurationState: "READY",
    recoveryProposalLifecycleConfigurationState: "READY",
    sourceRecoveryProposalGeneratedAt: NOW,
    operatorDecisionEvidenceStatus: "AVAILABLE",
    sourceOperatorDecisionGeneratedAt: NOW,
    thresholds: {
      maximumProposalAgeMs: 100,
      maximumOperatorDecisionAgeMs: 50,
    },
    summary: {
      sourceProposalsReady: assessments.filter((assessment) => assessment.proposalId).length,
      activeAwaitingOperatorDecision:
        assessments.filter((assessment) => assessment.state === "ACTIVE_AWAITING_OPERATOR_DECISION").length,
      operatorApproved:
        assessments.filter((assessment) => assessment.state === "OPERATOR_APPROVED").length,
      operatorRejected:
        assessments.filter((assessment) => assessment.state === "OPERATOR_REJECTED").length,
      expiredProposals: 0,
      notApplicableAssessments:
        assessments.filter((assessment) => assessment.state === "NOT_APPLICABLE").length,
      blockedAssessments: 0,
      explicitOperatorDecisionsAccepted:
        assessments.filter((assessment) => assessment.operatorDecision).length,
      lifecycleRecordsProduced:
        assessments.filter((assessment) => assessment.lifecycleRecord).length,
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
      immutableLifecycleEvidenceOnly: true,
      exactSourceProposalAndHashRequired: true,
      explicitExternalOperatorDecisionOnly: true,
      readModelCreatesOperatorDecisions: false,
      operatorApprovalIsExecutionAuthorization: false,
      sourceProposalMutated: false,
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

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
