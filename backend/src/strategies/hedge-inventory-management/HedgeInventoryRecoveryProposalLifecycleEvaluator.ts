import {
  createHash,
} from "node:crypto";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

import type {
  HedgeInventoryShadowRecoveryProposal,
  HedgeInventoryShadowRecoveryProposalAssessment,
  HedgeInventoryShadowRecoveryProposalSnapshot,
} from "./HedgeInventoryShadowRecoveryProposalPlanner";

export interface HedgeInventoryRecoveryOperatorDecisionEvidence {
  readonly id: string;
  readonly proposalId: string;
  readonly proposalValidationHash: string;
  readonly decision: "APPROVE" | "REJECT";
  readonly decidedBy: string;
  readonly reason: string;
  readonly decidedAt: number;
  readonly recoveryActionAuthorized: false;
  readonly executionAuthorized: false;
  readonly orderSubmissionAuthorized: false;
}

export interface HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot {
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly decisions: readonly HedgeInventoryRecoveryOperatorDecisionEvidence[];
}

export interface HedgeInventoryRecoveryOperatorDecisionEvidenceSource {
  getRecoveryOperatorDecisionEvidence(
    now?: number,
  ): HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot | null;
}

export type HedgeInventoryRecoveryProposalLifecycleReason =
  | "SOURCE_RECOVERY_PROPOSAL_NOT_READY"
  | "INVALID_RECOVERY_PROPOSAL_CONTRACT"
  | "RECOVERY_PROPOSAL_FROM_FUTURE"
  | "RECOVERY_PROPOSAL_MAXIMUM_AGE_EXCEEDED"
  | "RECOVERY_PROPOSAL_EXPIRED"
  | "AMBIGUOUS_OPERATOR_DECISION"
  | "INVALID_OPERATOR_DECISION_CONTRACT"
  | "OPERATOR_DECISION_FROM_FUTURE"
  | "OPERATOR_DECISION_STALE"
  | "OPERATOR_DECISION_OUTSIDE_PROPOSAL_LIFETIME";

export type HedgeInventoryRecoveryProposalLifecycleGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "RECOVERY_PROPOSAL_CONFIGURATION_NOT_READY"
  | "RECOVERY_PROPOSAL_LIFECYCLE_CONFIGURATION_NOT_READY"
  | "RECOVERY_PROPOSAL_EVIDENCE_UNAVAILABLE"
  | "INVALID_RECOVERY_PROPOSAL_SNAPSHOT_TIMESTAMP"
  | "RECOVERY_PROPOSAL_SNAPSHOT_FROM_FUTURE"
  | "RECOVERY_PROPOSAL_SNAPSHOT_STALE"
  | "INVALID_OPERATOR_DECISION_SNAPSHOT_TIMESTAMP"
  | "OPERATOR_DECISION_SNAPSHOT_FROM_FUTURE"
  | "OPERATOR_DECISION_SNAPSHOT_STALE";

export type HedgeInventoryPostRecoveryProposalLifecycleGate =
  | "OPERATOR_DECISION_REQUIRED"
  | "RECOVERY_ACTION_NOT_CREATED"
  | "CANONICAL_EXECUTION_PLAN_NOT_CREATED"
  | "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryRecoveryProposalLifecycleRecord {
  readonly id: string;
  readonly proposalId: string;
  readonly proposalValidationHash: string;
  readonly state:
    | "EXPIRED"
    | "OPERATOR_APPROVED"
    | "OPERATOR_REJECTED";
  readonly reason:
    | "RECOVERY_PROPOSAL_MAXIMUM_AGE_EXCEEDED"
    | "RECOVERY_PROPOSAL_EXPIRED"
    | "EXPLICIT_OPERATOR_APPROVAL"
    | "EXPLICIT_OPERATOR_REJECTION";
  readonly recordedAt: number;
  readonly operatorDecisionId: string | null;
  readonly sourceProposalMutated: false;
  readonly recoveryActionAuthorized: false;
  readonly executionAuthorized: false;
  readonly orderSubmissionAuthorized: false;
}

export interface HedgeInventoryRecoveryProposalLifecycleAssessment {
  readonly id: string;
  readonly sourceAssessmentId: string;
  readonly proposalId: string | null;
  readonly proposalValidationHash: string | null;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly side: "BUY" | "SELL" | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "ACTIVE_AWAITING_OPERATOR_DECISION"
    | "OPERATOR_APPROVED"
    | "OPERATOR_REJECTED"
    | "EXPIRED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceProposalState: HedgeInventoryShadowRecoveryProposalAssessment["state"];
  readonly proposalAgeMs: number | null;
  readonly proposalExpiresAt: number | null;
  readonly operatorDecision: HedgeInventoryRecoveryOperatorDecisionEvidence | null;
  readonly operatorDecisionAgeMs: number | null;
  readonly lifecycleRecord: HedgeInventoryRecoveryProposalLifecycleRecord | null;
  readonly blockers: readonly HedgeInventoryRecoveryProposalLifecycleReason[];
  readonly remainingGates: readonly HedgeInventoryPostRecoveryProposalLifecycleGate[];
  readonly lifecycleRevalidated: boolean;
  readonly terminal: boolean;
  readonly sourceProposalMutated: false;
  readonly recoveryIncidentCreated: false;
  readonly recoveryActionCreated: false;
  readonly canonicalExecutionPlanCreated: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryRecoveryProposalLifecycleSnapshot {
  readonly version: "22.17";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly recoveryProposalConfigurationState: string;
  readonly recoveryProposalLifecycleConfigurationState: string;
  readonly sourceRecoveryProposalGeneratedAt: number | null;
  readonly operatorDecisionEvidenceStatus: StrategyEvidenceStatus;
  readonly sourceOperatorDecisionGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumProposalAgeMs: number;
    readonly maximumOperatorDecisionAgeMs: number;
  };
  readonly summary: {
    readonly sourceProposalsReady: number;
    readonly activeAwaitingOperatorDecision: number;
    readonly operatorApproved: number;
    readonly operatorRejected: number;
    readonly expiredProposals: number;
    readonly notApplicableAssessments: number;
    readonly blockedAssessments: number;
    readonly explicitOperatorDecisionsAccepted: number;
    readonly lifecycleRecordsProduced: number;
    readonly recoveryIncidentsCreated: 0;
    readonly recoveryActionsCreated: 0;
    readonly canonicalExecutionPlansCreated: 0;
    readonly executableRecoveryActions: 0;
    readonly actionableRecoveryActions: 0;
  };
  readonly assessments: readonly HedgeInventoryRecoveryProposalLifecycleAssessment[];
  readonly blockers: readonly HedgeInventoryRecoveryProposalLifecycleGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly immutableLifecycleEvidenceOnly: true;
    readonly exactSourceProposalAndHashRequired: true;
    readonly explicitExternalOperatorDecisionOnly: true;
    readonly readModelCreatesOperatorDecisions: false;
    readonly operatorApprovalIsExecutionAuthorization: false;
    readonly sourceProposalMutated: false;
    readonly recoveryIncidentCreationAllowed: false;
    readonly recoveryActionCreationAllowed: false;
    readonly canonicalExecutionPlanCreationAllowed: false;
    readonly portfolioMutationAllowed: false;
    readonly balanceMutationAllowed: false;
    readonly capitalReservationMutationAllowed: false;
    readonly executionAuthorized: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const ACTIVE_GATES = [
  "OPERATOR_DECISION_REQUIRED",
  "RECOVERY_ACTION_NOT_CREATED",
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostRecoveryProposalLifecycleGate[];

const APPROVED_GATES = [
  "RECOVERY_ACTION_NOT_CREATED",
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostRecoveryProposalLifecycleGate[];

const NOTES = [
  "V22.17 revalidates each exact V22.16 SHADOW recovery proposal against its immutable validation hash, configured maximum age and original expiry.",
  "Only explicit external operator APPROVE or REJECT evidence matched to the exact proposal ID and hash is accepted; reads never create a decision.",
  "Approval is evidence only and creates no recovery incident, recovery action, canonical plan, PAPER, LIVE or exchange order authority.",
] as const;

const SAFETY = {
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
} as const;

export class HedgeInventoryRecoveryProposalLifecycleEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryShadowRecoveryProposalSnapshot,
    operatorEvidence: HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryRecoveryProposalLifecycleSnapshot {
    this.validateNow(now);
    const globalBlocker =
      this.resolveGlobalBlocker(configuration, proposals, operatorEvidence, now);

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        proposals,
        operatorEvidence,
        now,
        globalBlocker,
      );
    }

    const decisions = operatorEvidence?.decisions ?? [];
    const assessments = proposals.assessments.map(
      (assessment) =>
        this.evaluateAssessment(configuration, assessment, decisions, now),
    );

    return immutableClone({
      version: "22.17",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: assessments.length > 0 ? "AVAILABLE" : "NO_DATA",
      configurationState: configuration.state,
      recoveryProposalConfigurationState: configuration.recoveryProposal.state,
      recoveryProposalLifecycleConfigurationState:
        configuration.recoveryProposalLifecycle.state,
      sourceRecoveryProposalGeneratedAt: proposals.generatedAt,
      operatorDecisionEvidenceStatus:
        operatorEvidence?.evidenceStatus ?? "NO_DATA",
      sourceOperatorDecisionGeneratedAt: operatorEvidence?.generatedAt ?? null,
      thresholds: this.thresholds(configuration),
      summary: {
        sourceProposalsReady:
          proposals.summary.recoveryProposalsReady,
        activeAwaitingOperatorDecision:
          this.countState(assessments, "ACTIVE_AWAITING_OPERATOR_DECISION"),
        operatorApproved: this.countState(assessments, "OPERATOR_APPROVED"),
        operatorRejected: this.countState(assessments, "OPERATOR_REJECTED"),
        expiredProposals: this.countState(assessments, "EXPIRED"),
        notApplicableAssessments: this.countState(assessments, "NOT_APPLICABLE"),
        blockedAssessments: this.countState(assessments, "BLOCKED"),
        explicitOperatorDecisionsAccepted:
          assessments.filter((assessment) => assessment.operatorDecision !== null).length,
        lifecycleRecordsProduced:
          assessments.filter((assessment) => assessment.lifecycleRecord !== null).length,
        recoveryIncidentsCreated: 0,
        recoveryActionsCreated: 0,
        canonicalExecutionPlansCreated: 0,
        executableRecoveryActions: 0,
        actionableRecoveryActions: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private evaluateAssessment(
    configuration: HedgeInventoryManagementConfiguration,
    assessment: HedgeInventoryShadowRecoveryProposalAssessment,
    decisions: readonly HedgeInventoryRecoveryOperatorDecisionEvidence[],
    now: number,
  ): HedgeInventoryRecoveryProposalLifecycleAssessment {
    const proposal = assessment.proposal;
    const common = {
      id: `${assessment.id}:lifecycle`,
      sourceAssessmentId: assessment.id,
      proposalId: proposal?.id ?? null,
      proposalValidationHash: proposal?.validationHash ?? null,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      venue: assessment.venue,
      market: assessment.market,
      side: proposal?.leg.side ?? null,
      sourceProposalState: assessment.state,
      proposalExpiresAt: proposal?.expiresAt ?? null,
      sourceProposalMutated: false as const,
      recoveryIncidentCreated: false as const,
      recoveryActionCreated: false as const,
      canonicalExecutionPlanCreated: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (assessment.state === "NOT_REQUIRED" || assessment.state === "NOT_APPLICABLE") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        proposalAgeMs: null,
        operatorDecision: null,
        operatorDecisionAgeMs: null,
        lifecycleRecord: null,
        blockers: [],
        remainingGates: [],
        lifecycleRevalidated: true,
        terminal: false,
      };
    }

    if (assessment.state !== "RECOVERY_PROPOSAL_READY" || proposal === null) {
      return this.blocked(
        common,
        null,
        null,
        "SOURCE_RECOVERY_PROPOSAL_NOT_READY",
      );
    }

    const proposalAgeMs = now - proposal.createdAt;

    if (!this.isCompleteProposalContract(assessment, proposal)) {
      return this.blocked(
        common,
        proposalAgeMs,
        null,
        "INVALID_RECOVERY_PROPOSAL_CONTRACT",
      );
    }
    if (proposal.createdAt > now) {
      return this.blocked(
        common,
        proposalAgeMs,
        null,
        "RECOVERY_PROPOSAL_FROM_FUTURE",
      );
    }
    if (proposalAgeMs > configuration.recoveryProposalLifecycle.maximumProposalAgeMs!) {
      return this.expired(
        common,
        proposal,
        proposalAgeMs,
        "RECOVERY_PROPOSAL_MAXIMUM_AGE_EXCEEDED",
        proposal.createdAt + configuration.recoveryProposalLifecycle.maximumProposalAgeMs!,
      );
    }
    if (proposal.expiresAt <= now) {
      return this.expired(
        common,
        proposal,
        proposalAgeMs,
        "RECOVERY_PROPOSAL_EXPIRED",
        proposal.expiresAt,
      );
    }

    const matchingDecisions = decisions.filter(
      (decision) => decision.proposalId === proposal.id,
    );

    if (matchingDecisions.length === 0) {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "ACTIVE_AWAITING_OPERATOR_DECISION",
        proposalAgeMs,
        operatorDecision: null,
        operatorDecisionAgeMs: null,
        lifecycleRecord: null,
        blockers: [],
        remainingGates: ACTIVE_GATES,
        lifecycleRevalidated: true,
        terminal: false,
      };
    }

    if (matchingDecisions.length > 1) {
      return this.blocked(
        common,
        proposalAgeMs,
        null,
        "AMBIGUOUS_OPERATOR_DECISION",
      );
    }

    const decision = matchingDecisions[0]!;
    const decisionAgeMs = now - decision.decidedAt;
    const decisionBlocker =
      this.validateDecision(
        configuration,
        proposal,
        decision,
        decisionAgeMs,
        now,
      );

    if (decisionBlocker !== null) {
      return this.blocked(
        common,
        proposalAgeMs,
        decisionAgeMs,
        decisionBlocker,
      );
    }

    const state =
      decision.decision === "APPROVE"
        ? "OPERATOR_APPROVED" as const
        : "OPERATOR_REJECTED" as const;

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state,
      proposalAgeMs,
      operatorDecision: immutableClone(decision),
      operatorDecisionAgeMs: decisionAgeMs,
      lifecycleRecord: this.createLifecycleRecord(
        proposal,
        state,
        decision.decision === "APPROVE"
          ? "EXPLICIT_OPERATOR_APPROVAL"
          : "EXPLICIT_OPERATOR_REJECTION",
        decision.decidedAt,
        decision.id,
      ),
      blockers: [],
      remainingGates: state === "OPERATOR_APPROVED" ? APPROVED_GATES : [],
      lifecycleRevalidated: true,
      terminal: state === "OPERATOR_REJECTED",
    };
  }

  private validateDecision(
    configuration: HedgeInventoryManagementConfiguration,
    proposal: HedgeInventoryShadowRecoveryProposal,
    decision: HedgeInventoryRecoveryOperatorDecisionEvidence,
    decisionAgeMs: number,
    now: number,
  ): HedgeInventoryRecoveryProposalLifecycleReason | null {
    if (
      !decision.id.trim() ||
      !decision.proposalId.trim() ||
      !decision.proposalValidationHash.trim() ||
      !decision.decidedBy.trim() ||
      !decision.reason.trim() ||
      (decision.decision !== "APPROVE" && decision.decision !== "REJECT") ||
      decision.proposalId !== proposal.id ||
      decision.proposalValidationHash !== proposal.validationHash ||
      !Number.isFinite(decision.decidedAt) ||
      decision.decidedAt <= 0 ||
      decision.recoveryActionAuthorized !== false ||
      decision.executionAuthorized !== false ||
      decision.orderSubmissionAuthorized !== false
    ) {
      return "INVALID_OPERATOR_DECISION_CONTRACT";
    }
    if (decision.decidedAt > now) {
      return "OPERATOR_DECISION_FROM_FUTURE";
    }
    if (
      decisionAgeMs >
        configuration.recoveryProposalLifecycle.maximumOperatorDecisionAgeMs!
    ) {
      return "OPERATOR_DECISION_STALE";
    }
    if (
      decision.decidedAt < proposal.createdAt ||
      decision.decidedAt > proposal.expiresAt
    ) {
      return "OPERATOR_DECISION_OUTSIDE_PROPOSAL_LIFETIME";
    }
    return null;
  }

  private isCompleteProposalContract(
    assessment: HedgeInventoryShadowRecoveryProposalAssessment,
    proposal: HedgeInventoryShadowRecoveryProposal,
  ): boolean {
    const payload = { ...proposal } as Record<string, unknown>;
    delete payload.id;
    delete payload.validationHash;
    const expectedHash = createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex");

    return (
      proposal.id === `hedge-shadow-recovery-proposal-${proposal.validationHash}` &&
      proposal.validationHash === expectedHash &&
      proposal.strategyId === HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID &&
      proposal.kind === "SHADOW_RECOVERY_ACTION_PROPOSAL" &&
      proposal.status === "PROPOSED" &&
      proposal.mode === "SHADOW" &&
      proposal.routeId === assessment.routeId &&
      proposal.asset === assessment.asset &&
      proposal.quoteAsset === assessment.quoteAsset &&
      proposal.leg.venue === assessment.venue &&
      proposal.leg.market === assessment.market &&
      Number.isFinite(proposal.createdAt) &&
      proposal.createdAt > 0 &&
      Number.isFinite(proposal.expiresAt) &&
      proposal.expiresAt > proposal.createdAt &&
      Number.isFinite(proposal.leg.quantity) &&
      proposal.leg.quantity > 0 &&
      Number.isFinite(proposal.leg.estimatedQuoteValue) &&
      proposal.leg.estimatedQuoteValue > 0 &&
      proposal.leg.orderTypeSelected === false &&
      proposal.leg.timeInForceSelected === false &&
      proposal.leg.submissionAuthorized === false &&
      proposal.recoveryIncidentCreated === false &&
      proposal.recoveryActionMaterialized === false &&
      proposal.canonicalExecutionPlanCreated === false &&
      proposal.executionAuthorized === false &&
      proposal.automaticExecutionAllowed === false &&
      proposal.orderSubmissionAuthorized === false
    );
  }

  private expired(
    common: Omit<
      HedgeInventoryRecoveryProposalLifecycleAssessment,
      | "evidenceStatus"
      | "state"
      | "proposalAgeMs"
      | "operatorDecision"
      | "operatorDecisionAgeMs"
      | "lifecycleRecord"
      | "blockers"
      | "remainingGates"
      | "lifecycleRevalidated"
      | "terminal"
    >,
    proposal: HedgeInventoryShadowRecoveryProposal,
    proposalAgeMs: number,
    reason:
      | "RECOVERY_PROPOSAL_MAXIMUM_AGE_EXCEEDED"
      | "RECOVERY_PROPOSAL_EXPIRED",
    recordedAt: number,
  ): HedgeInventoryRecoveryProposalLifecycleAssessment {
    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "EXPIRED",
      proposalAgeMs,
      operatorDecision: null,
      operatorDecisionAgeMs: null,
      lifecycleRecord: this.createLifecycleRecord(
        proposal,
        "EXPIRED",
        reason,
        recordedAt,
        null,
      ),
      blockers: [reason],
      remainingGates: [],
      lifecycleRevalidated: true,
      terminal: true,
    };
  }

  private blocked(
    common: Omit<
      HedgeInventoryRecoveryProposalLifecycleAssessment,
      | "evidenceStatus"
      | "state"
      | "proposalAgeMs"
      | "operatorDecision"
      | "operatorDecisionAgeMs"
      | "lifecycleRecord"
      | "blockers"
      | "remainingGates"
      | "lifecycleRevalidated"
      | "terminal"
    >,
    proposalAgeMs: number | null,
    operatorDecisionAgeMs: number | null,
    blocker: HedgeInventoryRecoveryProposalLifecycleReason,
  ): HedgeInventoryRecoveryProposalLifecycleAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      proposalAgeMs,
      operatorDecision: null,
      operatorDecisionAgeMs,
      lifecycleRecord: null,
      blockers: [blocker],
      remainingGates: [],
      lifecycleRevalidated: false,
      terminal: false,
    };
  }

  private createLifecycleRecord(
    proposal: HedgeInventoryShadowRecoveryProposal,
    state: HedgeInventoryRecoveryProposalLifecycleRecord["state"],
    reason: HedgeInventoryRecoveryProposalLifecycleRecord["reason"],
    recordedAt: number,
    operatorDecisionId: string | null,
  ): HedgeInventoryRecoveryProposalLifecycleRecord {
    const payload = {
      proposalId: proposal.id,
      proposalValidationHash: proposal.validationHash,
      state,
      reason,
      recordedAt,
      operatorDecisionId,
      sourceProposalMutated: false as const,
      recoveryActionAuthorized: false as const,
      executionAuthorized: false as const,
      orderSubmissionAuthorized: false as const,
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex");

    return immutableClone({
      id: `hedge-recovery-proposal-lifecycle-${fingerprint}`,
      ...payload,
    });
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryShadowRecoveryProposalSnapshot,
    operatorEvidence: HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot | null,
    now: number,
  ): HedgeInventoryRecoveryProposalLifecycleGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.recoveryProposal.state !== "READY") {
      return "RECOVERY_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (configuration.recoveryProposalLifecycle.state !== "READY") {
      return "RECOVERY_PROPOSAL_LIFECYCLE_CONFIGURATION_NOT_READY";
    }
    if (proposals.evidenceStatus !== "AVAILABLE") {
      return "RECOVERY_PROPOSAL_EVIDENCE_UNAVAILABLE";
    }
    if (!Number.isFinite(proposals.generatedAt) || proposals.generatedAt <= 0) {
      return "INVALID_RECOVERY_PROPOSAL_SNAPSHOT_TIMESTAMP";
    }
    if (proposals.generatedAt > now) {
      return "RECOVERY_PROPOSAL_SNAPSHOT_FROM_FUTURE";
    }
    if (
      now - proposals.generatedAt >
        configuration.recoveryProposalLifecycle.maximumProposalAgeMs!
    ) {
      return "RECOVERY_PROPOSAL_SNAPSHOT_STALE";
    }
    if (operatorEvidence === null) {
      return null;
    }
    if (
      !Number.isFinite(operatorEvidence.generatedAt) ||
      operatorEvidence.generatedAt <= 0
    ) {
      return "INVALID_OPERATOR_DECISION_SNAPSHOT_TIMESTAMP";
    }
    if (operatorEvidence.generatedAt > now) {
      return "OPERATOR_DECISION_SNAPSHOT_FROM_FUTURE";
    }
    if (
      now - operatorEvidence.generatedAt >
        configuration.recoveryProposalLifecycle.maximumOperatorDecisionAgeMs!
    ) {
      return "OPERATOR_DECISION_SNAPSHOT_STALE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryShadowRecoveryProposalSnapshot,
    operatorEvidence: HedgeInventoryRecoveryOperatorDecisionEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryRecoveryProposalLifecycleGlobalBlocker,
  ): HedgeInventoryRecoveryProposalLifecycleSnapshot {
    return immutableClone({
      version: "22.17",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      recoveryProposalConfigurationState: configuration.recoveryProposal.state,
      recoveryProposalLifecycleConfigurationState:
        configuration.recoveryProposalLifecycle.state,
      sourceRecoveryProposalGeneratedAt:
        Number.isFinite(proposals.generatedAt) ? proposals.generatedAt : null,
      operatorDecisionEvidenceStatus:
        operatorEvidence?.evidenceStatus ?? "NO_DATA",
      sourceOperatorDecisionGeneratedAt:
        operatorEvidence && Number.isFinite(operatorEvidence.generatedAt)
          ? operatorEvidence.generatedAt
          : null,
      thresholds: this.thresholds(configuration),
      summary: {
        sourceProposalsReady: 0,
        activeAwaitingOperatorDecision: 0,
        operatorApproved: 0,
        operatorRejected: 0,
        expiredProposals: 0,
        notApplicableAssessments: 0,
        blockedAssessments: 0,
        explicitOperatorDecisionsAccepted: 0,
        lifecycleRecordsProduced: 0,
        recoveryIncidentsCreated: 0,
        recoveryActionsCreated: 0,
        canonicalExecutionPlansCreated: 0,
        executableRecoveryActions: 0,
        actionableRecoveryActions: 0,
      },
      assessments: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private thresholds(
    configuration: HedgeInventoryManagementConfiguration,
  ): HedgeInventoryRecoveryProposalLifecycleSnapshot["thresholds"] {
    return {
      maximumProposalAgeMs:
        configuration.recoveryProposalLifecycle.maximumProposalAgeMs ?? 0,
      maximumOperatorDecisionAgeMs:
        configuration.recoveryProposalLifecycle.maximumOperatorDecisionAgeMs ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryRecoveryProposalLifecycleAssessment[],
    state: HedgeInventoryRecoveryProposalLifecycleAssessment["state"],
  ): number {
    return assessments.filter((assessment) => assessment.state === state).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge recovery-proposal lifecycle timestamp must be positive and finite.",
      );
    }
  }
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

