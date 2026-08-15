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
  HedgeInventoryRecoveryProposalLifecycleAssessment,
  HedgeInventoryRecoveryProposalLifecycleSnapshot,
} from "./HedgeInventoryRecoveryProposalLifecycleEvaluator";

import type {
  HedgeInventoryShadowRecoveryProposal,
  HedgeInventoryShadowRecoveryProposalSnapshot,
} from "./HedgeInventoryShadowRecoveryProposalPlanner";

export interface HedgeInventoryShadowRecoveryActionHandoff {
  readonly id: string;
  readonly validationHash: string;
  readonly strategyId: "hedge-inventory-management";
  readonly kind: "SHADOW_RECOVERY_ACTION_HANDOFF";
  readonly status: "HANDOFF_READY";
  readonly mode: "SHADOW";
  readonly recoveryActionType:
    | "RESIDUAL_HEDGE_REVIEW"
    | "RESIDUAL_EXPOSURE_ESCALATION";
  readonly sourceLifecycleAssessmentId: string;
  readonly sourceLifecycleRecordId: string;
  readonly sourceRecoveryProposalId: string;
  readonly sourceRecoveryProposalValidationHash: string;
  readonly sourceOperatorDecisionId: string;
  readonly sourceReconciliationId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly residualDirection: "LONG" | "SHORT";
  readonly sourceSeverity: "WARNING" | "CRITICAL";
  readonly operator: {
    readonly decidedBy: string;
    readonly reason: string;
    readonly decidedAt: number;
    readonly decision: "APPROVE";
  };
  readonly leg: {
    readonly venue: string;
    readonly market: string;
    readonly side: "BUY" | "SELL";
    readonly quantity: number;
    readonly referencePrice: number;
    readonly estimatedQuoteValue: number;
    readonly orderTypeSelected: false;
    readonly timeInForceSelected: false;
    readonly submissionAuthorized: false;
  };
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly recoveryIncidentCreated: false;
  readonly recoveryActionMaterialized: false;
  readonly canonicalExecutionPlanCreated: false;
  readonly capitalReservationCreated: false;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly orderSubmissionAuthorized: false;
}

export type HedgeInventoryShadowRecoveryActionHandoffAssessmentBlocker =
  | "RECOVERY_LIFECYCLE_NOT_ELIGIBLE"
  | "INVALID_OPERATOR_APPROVED_LIFECYCLE_CONTRACT"
  | "SOURCE_RECOVERY_PROPOSAL_NOT_FOUND"
  | "AMBIGUOUS_SOURCE_RECOVERY_PROPOSAL"
  | "SOURCE_RECOVERY_PROPOSAL_MISMATCH"
  | "RECOVERY_LIFECYCLE_FROM_FUTURE"
  | "RECOVERY_LIFECYCLE_STALE"
  | "RECOVERY_HANDOFF_VALUE_LIMIT_EXCEEDED"
  | "RECOVERY_HANDOFF_EXPIRY_INVALID";

export type HedgeInventoryShadowRecoveryActionHandoffGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "RECOVERY_PROPOSAL_CONFIGURATION_NOT_READY"
  | "RECOVERY_PROPOSAL_LIFECYCLE_CONFIGURATION_NOT_READY"
  | "RECOVERY_ACTION_HANDOFF_CONFIGURATION_NOT_READY"
  | "RECOVERY_PROPOSAL_EVIDENCE_UNAVAILABLE"
  | "RECOVERY_PROPOSAL_LIFECYCLE_EVIDENCE_UNAVAILABLE"
  | "INVALID_RECOVERY_LIFECYCLE_SNAPSHOT_TIMESTAMP"
  | "RECOVERY_LIFECYCLE_SNAPSHOT_FROM_FUTURE"
  | "RECOVERY_LIFECYCLE_SNAPSHOT_STALE";

export type HedgeInventoryPostRecoveryActionHandoffGate =
  | "RECOVERY_ACTION_NOT_CREATED"
  | "CANONICAL_EXECUTION_PLAN_NOT_CREATED"
  | "CAPITAL_RESERVATION_NOT_CREATED"
  | "INTENT_EXECUTION_NOT_AUTHORIZED"
  | "ORDER_SUBMISSION_NOT_AUTHORIZED";

export interface HedgeInventoryShadowRecoveryActionHandoffAssessment {
  readonly id: string;
  readonly lifecycleAssessmentId: string;
  readonly lifecycleRecordId: string | null;
  readonly recoveryProposalId: string | null;
  readonly operatorDecisionId: string | null;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "RECOVERY_HANDOFF_READY"
    | "AWAITING_OPERATOR_DECISION"
    | "NOT_APPROVED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceLifecycleState: HedgeInventoryRecoveryProposalLifecycleAssessment["state"];
  readonly lifecycleAgeMs: number | null;
  readonly handoff: HedgeInventoryShadowRecoveryActionHandoff | null;
  readonly blockers: readonly HedgeInventoryShadowRecoveryActionHandoffAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostRecoveryActionHandoffGate[];
  readonly handoffGenerated: boolean;
  readonly sourceProposalMutated: false;
  readonly recoveryIncidentCreated: false;
  readonly recoveryActionCreated: false;
  readonly canonicalExecutionPlanCreated: false;
  readonly capitalReservationCreated: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryShadowRecoveryActionHandoffSnapshot {
  readonly version: "22.18";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly recoveryProposalConfigurationState: string;
  readonly recoveryProposalLifecycleConfigurationState: string;
  readonly recoveryActionHandoffConfigurationState: string;
  readonly sourceRecoveryProposalGeneratedAt: number | null;
  readonly sourceRecoveryProposalLifecycleGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumLifecycleAgeMs: number;
    readonly handoffTtlMs: number;
    readonly maximumHandoffQuoteValue: number;
  };
  readonly summary: {
    readonly lifecycleAssessments: number;
    readonly operatorApprovedAssessments: number;
    readonly recoveryHandoffsReady: number;
    readonly awaitingOperatorDecision: number;
    readonly notApprovedAssessments: number;
    readonly notApplicableAssessments: number;
    readonly blockedAssessments: number;
    readonly totalHandoffQuantity: number;
    readonly totalHandoffQuoteValue: number;
    readonly recoveryIncidentsCreated: 0;
    readonly recoveryActionsCreated: 0;
    readonly canonicalExecutionPlansCreated: 0;
    readonly capitalReservationsCreated: 0;
    readonly executableRecoveryActions: 0;
    readonly actionableRecoveryActions: 0;
  };
  readonly assessments: readonly HedgeInventoryShadowRecoveryActionHandoffAssessment[];
  readonly blockers: readonly HedgeInventoryShadowRecoveryActionHandoffGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly deterministicBoundedShadowHandoffOnly: true;
    readonly exactApprovedLifecycleAndProposalLineageRequired: true;
    readonly operatorApprovalConsumedAsEvidenceOnly: true;
    readonly sourceProposalQuantityAndValueNeverExceeded: true;
    readonly originalProposalExpiryNeverExceeded: true;
    readonly orderParametersSelected: false;
    readonly sourceProposalMutated: false;
    readonly recoveryIncidentCreationAllowed: false;
    readonly recoveryActionCreationAllowed: false;
    readonly canonicalExecutionPlanCreationAllowed: false;
    readonly capitalReservationMutationAllowed: false;
    readonly portfolioMutationAllowed: false;
    readonly balanceMutationAllowed: false;
    readonly executionAuthorized: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "RECOVERY_ACTION_NOT_CREATED",
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "CAPITAL_RESERVATION_NOT_CREATED",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
  "ORDER_SUBMISSION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostRecoveryActionHandoffGate[];

const NOTES = [
  "V22.18 creates a deterministic, TTL-bounded SHADOW handoff only from exact V22.17 OPERATOR_APPROVED lifecycle evidence and its unchanged V22.16 proposal.",
  "The handoff carries the approved counter-side quantity and quote value without exceeding the source proposal or its original expiry.",
  "The handoff is not a recovery incident, recovery action, capital reservation, canonical execution plan, PAPER/LIVE instruction or exchange order.",
] as const;

const SAFETY = {
  deterministicBoundedShadowHandoffOnly: true,
  exactApprovedLifecycleAndProposalLineageRequired: true,
  operatorApprovalConsumedAsEvidenceOnly: true,
  sourceProposalQuantityAndValueNeverExceeded: true,
  originalProposalExpiryNeverExceeded: true,
  orderParametersSelected: false,
  sourceProposalMutated: false,
  recoveryIncidentCreationAllowed: false,
  recoveryActionCreationAllowed: false,
  canonicalExecutionPlanCreationAllowed: false,
  capitalReservationMutationAllowed: false,
  portfolioMutationAllowed: false,
  balanceMutationAllowed: false,
  executionAuthorized: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryShadowRecoveryActionHandoffPlanner {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryShadowRecoveryProposalSnapshot,
    lifecycle: HedgeInventoryRecoveryProposalLifecycleSnapshot,
    now = Date.now(),
  ): HedgeInventoryShadowRecoveryActionHandoffSnapshot {
    this.validateNow(now);
    const globalBlocker =
      this.resolveGlobalBlocker(configuration, proposals, lifecycle, now);

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        proposals,
        lifecycle,
        now,
        globalBlocker,
      );
    }

    const assessments = lifecycle.assessments.map(
      (assessment) =>
        this.evaluateAssessment(
          configuration,
          proposals,
          assessment,
          now,
        ),
    );
    const handoffs = assessments
      .map((assessment) => assessment.handoff)
      .filter(
        (handoff): handoff is HedgeInventoryShadowRecoveryActionHandoff =>
          handoff !== null,
      );

    return immutableClone({
      version: "22.18",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: assessments.length > 0 ? "AVAILABLE" : "NO_DATA",
      configurationState: configuration.state,
      recoveryProposalConfigurationState: configuration.recoveryProposal.state,
      recoveryProposalLifecycleConfigurationState:
        configuration.recoveryProposalLifecycle.state,
      recoveryActionHandoffConfigurationState:
        configuration.recoveryActionHandoff.state,
      sourceRecoveryProposalGeneratedAt: proposals.generatedAt,
      sourceRecoveryProposalLifecycleGeneratedAt: lifecycle.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        lifecycleAssessments: lifecycle.assessments.length,
        operatorApprovedAssessments:
          lifecycle.assessments.filter(
            (assessment) => assessment.state === "OPERATOR_APPROVED",
          ).length,
        recoveryHandoffsReady:
          this.countState(assessments, "RECOVERY_HANDOFF_READY"),
        awaitingOperatorDecision:
          this.countState(assessments, "AWAITING_OPERATOR_DECISION"),
        notApprovedAssessments:
          this.countState(assessments, "NOT_APPROVED"),
        notApplicableAssessments:
          this.countState(assessments, "NOT_APPLICABLE"),
        blockedAssessments:
          this.countState(assessments, "BLOCKED"),
        totalHandoffQuantity:
          sum(handoffs.map((handoff) => handoff.leg.quantity)),
        totalHandoffQuoteValue:
          sum(handoffs.map((handoff) => handoff.leg.estimatedQuoteValue)),
        recoveryIncidentsCreated: 0,
        recoveryActionsCreated: 0,
        canonicalExecutionPlansCreated: 0,
        capitalReservationsCreated: 0,
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
    proposals: HedgeInventoryShadowRecoveryProposalSnapshot,
    lifecycle: HedgeInventoryRecoveryProposalLifecycleAssessment,
    now: number,
  ): HedgeInventoryShadowRecoveryActionHandoffAssessment {
    const common = {
      id: `${lifecycle.id}:handoff`,
      lifecycleAssessmentId: lifecycle.id,
      lifecycleRecordId: lifecycle.lifecycleRecord?.id ?? null,
      recoveryProposalId: lifecycle.proposalId,
      operatorDecisionId: lifecycle.operatorDecision?.id ?? null,
      routeId: lifecycle.routeId,
      asset: lifecycle.asset,
      quoteAsset: lifecycle.quoteAsset,
      venue: lifecycle.venue,
      market: lifecycle.market,
      sourceLifecycleState: lifecycle.state,
      sourceProposalMutated: false as const,
      recoveryIncidentCreated: false as const,
      recoveryActionCreated: false as const,
      canonicalExecutionPlanCreated: false as const,
      capitalReservationCreated: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (lifecycle.state === "ACTIVE_AWAITING_OPERATOR_DECISION") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "AWAITING_OPERATOR_DECISION",
        lifecycleAgeMs: null,
        handoff: null,
        blockers: [],
        remainingGates: [],
        handoffGenerated: false,
      };
    }

    if (
      lifecycle.state === "OPERATOR_REJECTED" ||
      lifecycle.state === "EXPIRED"
    ) {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPROVED",
        lifecycleAgeMs:
          lifecycle.lifecycleRecord
            ? now - lifecycle.lifecycleRecord.recordedAt
            : null,
        handoff: null,
        blockers: [],
        remainingGates: [],
        handoffGenerated: false,
      };
    }

    if (lifecycle.state === "NOT_APPLICABLE") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        lifecycleAgeMs: null,
        handoff: null,
        blockers: [],
        remainingGates: [],
        handoffGenerated: false,
      };
    }

    if (lifecycle.state !== "OPERATOR_APPROVED") {
      return this.blocked(
        common,
        null,
        "RECOVERY_LIFECYCLE_NOT_ELIGIBLE",
      );
    }

    const record = lifecycle.lifecycleRecord;
    const lifecycleAgeMs = record ? now - record.recordedAt : null;

    if (!this.isCompleteApprovedLifecycleContract(lifecycle)) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "INVALID_OPERATOR_APPROVED_LIFECYCLE_CONTRACT",
      );
    }
    if (record!.recordedAt > now) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "RECOVERY_LIFECYCLE_FROM_FUTURE",
      );
    }
    if (
      lifecycleAgeMs! >
        configuration.recoveryActionHandoff.maximumLifecycleAgeMs!
    ) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "RECOVERY_LIFECYCLE_STALE",
      );
    }

    const matches = proposals.assessments.filter(
      (assessment) => assessment.proposal?.id === lifecycle.proposalId,
    );

    if (matches.length === 0) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "SOURCE_RECOVERY_PROPOSAL_NOT_FOUND",
      );
    }
    if (matches.length > 1) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "AMBIGUOUS_SOURCE_RECOVERY_PROPOSAL",
      );
    }

    const sourceAssessment = matches[0]!;
    const proposal = sourceAssessment.proposal!;

    if (!this.matchesProposal(lifecycle, proposal)) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "SOURCE_RECOVERY_PROPOSAL_MISMATCH",
      );
    }
    if (
      proposal.leg.estimatedQuoteValue >
        configuration.recoveryActionHandoff.maximumHandoffQuoteValue!
    ) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "RECOVERY_HANDOFF_VALUE_LIMIT_EXCEEDED",
      );
    }

    const createdAt = record!.recordedAt;
    const expiresAt = Math.min(
      proposal.expiresAt,
      createdAt + configuration.recoveryActionHandoff.handoffTtlMs!,
    );

    if (expiresAt <= now) {
      return this.blocked(
        common,
        lifecycleAgeMs,
        "RECOVERY_HANDOFF_EXPIRY_INVALID",
      );
    }

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "RECOVERY_HANDOFF_READY",
      lifecycleAgeMs,
      handoff: this.createHandoff(
        lifecycle,
        proposal,
        createdAt,
        expiresAt,
      ),
      blockers: [],
      remainingGates: REMAINING_GATES,
      handoffGenerated: true,
    };
  }

  private isCompleteApprovedLifecycleContract(
    lifecycle: HedgeInventoryRecoveryProposalLifecycleAssessment,
  ): boolean {
    const decision = lifecycle.operatorDecision;
    const record = lifecycle.lifecycleRecord;

    return (
      lifecycle.evidenceStatus === "AVAILABLE" &&
      lifecycle.lifecycleRevalidated === true &&
      lifecycle.terminal === false &&
      lifecycle.proposalId !== null &&
      lifecycle.proposalValidationHash !== null &&
      decision !== null &&
      decision.decision === "APPROVE" &&
      decision.proposalId === lifecycle.proposalId &&
      decision.proposalValidationHash === lifecycle.proposalValidationHash &&
      decision.recoveryActionAuthorized === false &&
      decision.executionAuthorized === false &&
      decision.orderSubmissionAuthorized === false &&
      record !== null &&
      record.proposalId === lifecycle.proposalId &&
      record.proposalValidationHash === lifecycle.proposalValidationHash &&
      record.state === "OPERATOR_APPROVED" &&
      record.reason === "EXPLICIT_OPERATOR_APPROVAL" &&
      record.operatorDecisionId === decision.id &&
      record.recordedAt === decision.decidedAt &&
      record.sourceProposalMutated === false &&
      record.recoveryActionAuthorized === false &&
      record.executionAuthorized === false &&
      record.orderSubmissionAuthorized === false &&
      lifecycle.sourceProposalMutated === false &&
      lifecycle.recoveryIncidentCreated === false &&
      lifecycle.recoveryActionCreated === false &&
      lifecycle.canonicalExecutionPlanCreated === false &&
      lifecycle.executionAuthorized === false &&
      lifecycle.actionable === false &&
      lifecycle.remainingGates.includes("RECOVERY_ACTION_NOT_CREATED") &&
      lifecycle.remainingGates.includes("CANONICAL_EXECUTION_PLAN_NOT_CREATED") &&
      lifecycle.remainingGates.includes("INTENT_EXECUTION_NOT_AUTHORIZED")
    );
  }

  private matchesProposal(
    lifecycle: HedgeInventoryRecoveryProposalLifecycleAssessment,
    proposal: HedgeInventoryShadowRecoveryProposal,
  ): boolean {
    const payload = { ...proposal } as Record<string, unknown>;
    delete payload.id;
    delete payload.validationHash;
    const expectedHash = createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex");

    return (
      lifecycle.proposalId === proposal.id &&
      lifecycle.proposalValidationHash === proposal.validationHash &&
      proposal.id === `hedge-shadow-recovery-proposal-${proposal.validationHash}` &&
      proposal.validationHash === expectedHash &&
      proposal.routeId === lifecycle.routeId &&
      proposal.asset === lifecycle.asset &&
      proposal.quoteAsset === lifecycle.quoteAsset &&
      proposal.leg.venue === lifecycle.venue &&
      proposal.leg.market === lifecycle.market &&
      proposal.leg.side === lifecycle.side &&
      proposal.createdAt <= lifecycle.operatorDecision!.decidedAt &&
      proposal.expiresAt >= lifecycle.operatorDecision!.decidedAt &&
      proposal.recoveryIncidentCreated === false &&
      proposal.recoveryActionMaterialized === false &&
      proposal.canonicalExecutionPlanCreated === false &&
      proposal.executionAuthorized === false &&
      proposal.orderSubmissionAuthorized === false
    );
  }

  private createHandoff(
    lifecycle: HedgeInventoryRecoveryProposalLifecycleAssessment,
    proposal: HedgeInventoryShadowRecoveryProposal,
    createdAt: number,
    expiresAt: number,
  ): HedgeInventoryShadowRecoveryActionHandoff {
    const decision = lifecycle.operatorDecision!;
    const payload = {
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      kind: "SHADOW_RECOVERY_ACTION_HANDOFF" as const,
      status: "HANDOFF_READY" as const,
      mode: "SHADOW" as const,
      recoveryActionType: proposal.recoveryActionType,
      sourceLifecycleAssessmentId: lifecycle.id,
      sourceLifecycleRecordId: lifecycle.lifecycleRecord!.id,
      sourceRecoveryProposalId: proposal.id,
      sourceRecoveryProposalValidationHash: proposal.validationHash,
      sourceOperatorDecisionId: decision.id,
      sourceReconciliationId: proposal.sourceReconciliationId,
      routeId: proposal.routeId,
      asset: proposal.asset,
      quoteAsset: proposal.quoteAsset,
      residualDirection: proposal.residualDirection,
      sourceSeverity: proposal.sourceSeverity,
      operator: {
        decidedBy: decision.decidedBy,
        reason: decision.reason,
        decidedAt: decision.decidedAt,
        decision: "APPROVE" as const,
      },
      leg: {
        venue: proposal.leg.venue,
        market: proposal.leg.market,
        side: proposal.leg.side,
        quantity: proposal.leg.quantity,
        referencePrice: proposal.leg.referencePrice,
        estimatedQuoteValue: proposal.leg.estimatedQuoteValue,
        orderTypeSelected: false as const,
        timeInForceSelected: false as const,
        submissionAuthorized: false as const,
      },
      createdAt,
      expiresAt,
      recoveryIncidentCreated: false as const,
      recoveryActionMaterialized: false as const,
      canonicalExecutionPlanCreated: false as const,
      capitalReservationCreated: false as const,
      executionAuthorized: false as const,
      automaticExecutionAllowed: false as const,
      orderSubmissionAuthorized: false as const,
    };
    const validationHash = createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex");

    return immutableClone({
      id: `hedge-shadow-recovery-handoff-${validationHash}`,
      validationHash,
      ...payload,
    });
  }

  private blocked(
    common: Omit<
      HedgeInventoryShadowRecoveryActionHandoffAssessment,
      | "evidenceStatus"
      | "state"
      | "lifecycleAgeMs"
      | "handoff"
      | "blockers"
      | "remainingGates"
      | "handoffGenerated"
    >,
    lifecycleAgeMs: number | null,
    blocker: HedgeInventoryShadowRecoveryActionHandoffAssessmentBlocker,
  ): HedgeInventoryShadowRecoveryActionHandoffAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      lifecycleAgeMs,
      handoff: null,
      blockers: [blocker],
      remainingGates: [],
      handoffGenerated: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryShadowRecoveryProposalSnapshot,
    lifecycle: HedgeInventoryRecoveryProposalLifecycleSnapshot,
    now: number,
  ): HedgeInventoryShadowRecoveryActionHandoffGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.recoveryProposal.state !== "READY") {
      return "RECOVERY_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (configuration.recoveryProposalLifecycle.state !== "READY") {
      return "RECOVERY_PROPOSAL_LIFECYCLE_CONFIGURATION_NOT_READY";
    }
    if (configuration.recoveryActionHandoff.state !== "READY") {
      return "RECOVERY_ACTION_HANDOFF_CONFIGURATION_NOT_READY";
    }
    if (proposals.evidenceStatus !== "AVAILABLE") {
      return "RECOVERY_PROPOSAL_EVIDENCE_UNAVAILABLE";
    }
    if (lifecycle.evidenceStatus !== "AVAILABLE") {
      return "RECOVERY_PROPOSAL_LIFECYCLE_EVIDENCE_UNAVAILABLE";
    }
    if (!Number.isFinite(lifecycle.generatedAt) || lifecycle.generatedAt <= 0) {
      return "INVALID_RECOVERY_LIFECYCLE_SNAPSHOT_TIMESTAMP";
    }
    if (lifecycle.generatedAt > now) {
      return "RECOVERY_LIFECYCLE_SNAPSHOT_FROM_FUTURE";
    }
    if (
      now - lifecycle.generatedAt >
        configuration.recoveryActionHandoff.maximumLifecycleAgeMs!
    ) {
      return "RECOVERY_LIFECYCLE_SNAPSHOT_STALE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryShadowRecoveryProposalSnapshot,
    lifecycle: HedgeInventoryRecoveryProposalLifecycleSnapshot,
    now: number,
    blocker: HedgeInventoryShadowRecoveryActionHandoffGlobalBlocker,
  ): HedgeInventoryShadowRecoveryActionHandoffSnapshot {
    return immutableClone({
      version: "22.18",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      recoveryProposalConfigurationState: configuration.recoveryProposal.state,
      recoveryProposalLifecycleConfigurationState:
        configuration.recoveryProposalLifecycle.state,
      recoveryActionHandoffConfigurationState:
        configuration.recoveryActionHandoff.state,
      sourceRecoveryProposalGeneratedAt:
        Number.isFinite(proposals.generatedAt) ? proposals.generatedAt : null,
      sourceRecoveryProposalLifecycleGeneratedAt:
        Number.isFinite(lifecycle.generatedAt) ? lifecycle.generatedAt : null,
      thresholds: this.thresholds(configuration),
      summary: {
        lifecycleAssessments: 0,
        operatorApprovedAssessments: 0,
        recoveryHandoffsReady: 0,
        awaitingOperatorDecision: 0,
        notApprovedAssessments: 0,
        notApplicableAssessments: 0,
        blockedAssessments: 0,
        totalHandoffQuantity: 0,
        totalHandoffQuoteValue: 0,
        recoveryIncidentsCreated: 0,
        recoveryActionsCreated: 0,
        canonicalExecutionPlansCreated: 0,
        capitalReservationsCreated: 0,
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
  ): HedgeInventoryShadowRecoveryActionHandoffSnapshot["thresholds"] {
    return {
      maximumLifecycleAgeMs:
        configuration.recoveryActionHandoff.maximumLifecycleAgeMs ?? 0,
      handoffTtlMs:
        configuration.recoveryActionHandoff.handoffTtlMs ?? 0,
      maximumHandoffQuoteValue:
        configuration.recoveryActionHandoff.maximumHandoffQuoteValue ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryShadowRecoveryActionHandoffAssessment[],
    state: HedgeInventoryShadowRecoveryActionHandoffAssessment["state"],
  ): number {
    return assessments.filter((assessment) => assessment.state === state).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge recovery-action handoff timestamp must be positive and finite.",
      );
    }
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
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

