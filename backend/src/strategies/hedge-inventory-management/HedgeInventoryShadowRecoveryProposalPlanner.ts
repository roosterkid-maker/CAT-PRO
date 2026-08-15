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
  HedgeInventoryResidualReconciliationAssessment,
  HedgeInventoryResidualReconciliationRecord,
  HedgeInventoryResidualReconciliationSnapshot,
} from "./HedgeInventoryResidualReconciliationEvaluator";

export interface HedgeInventoryShadowRecoveryProposal {
  readonly id: string;
  readonly validationHash: string;
  readonly strategyId: "hedge-inventory-management";
  readonly kind: "SHADOW_RECOVERY_ACTION_PROPOSAL";
  readonly status: "PROPOSED";
  readonly mode: "SHADOW";
  readonly recoveryActionType:
    | "RESIDUAL_HEDGE_REVIEW"
    | "RESIDUAL_EXPOSURE_ESCALATION";
  readonly sourceReconciliationId: string;
  readonly sourceFillSimulationAssessmentId: string;
  readonly sourceSimulationId: string;
  readonly sourcePlanProposalId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly residualDirection: "LONG" | "SHORT";
  readonly sourceSeverity: "WARNING" | "CRITICAL";
  readonly sourceRecommendedAction:
    | "REVIEW_RESIDUAL_HEDGE"
    | "ESCALATE_RESIDUAL_EXPOSURE";
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
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly orderSubmissionAuthorized: false;
}

export type HedgeInventoryShadowRecoveryProposalAssessmentBlocker =
  | "RECONCILIATION_NOT_ELIGIBLE"
  | "INVALID_RECOVERY_REQUIRED_CONTRACT"
  | "RECONCILIATION_RECORD_FROM_FUTURE"
  | "RECONCILIATION_RECORD_STALE"
  | "RECOVERY_PROPOSAL_VALUE_LIMIT_EXCEEDED"
  | "RECOVERY_PROPOSAL_EXPIRY_INVALID";

export type HedgeInventoryShadowRecoveryProposalGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "RESIDUAL_RECONCILIATION_CONFIGURATION_NOT_READY"
  | "RECOVERY_PROPOSAL_CONFIGURATION_NOT_READY"
  | "RESIDUAL_RECONCILIATION_EVIDENCE_UNAVAILABLE"
  | "INVALID_RESIDUAL_RECONCILIATION_TIMESTAMP"
  | "RESIDUAL_RECONCILIATION_FROM_FUTURE"
  | "RESIDUAL_RECONCILIATION_STALE";

export type HedgeInventoryPostRecoveryProposalGate =
  | "OPERATOR_REVIEW_REQUIRED"
  | "RECOVERY_ACTION_NOT_CREATED"
  | "CANONICAL_EXECUTION_PLAN_NOT_CREATED"
  | "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryShadowRecoveryProposalAssessment {
  readonly id: string;
  readonly reconciliationAssessmentId: string;
  readonly reconciliationId: string | null;
  readonly simulationId: string | null;
  readonly planProposalId: string | null;
  readonly intentId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly venue: string;
  readonly market: string;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "RECOVERY_PROPOSAL_READY"
    | "NOT_REQUIRED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceReconciliationState: HedgeInventoryResidualReconciliationAssessment["state"];
  readonly reconciliationAgeMs: number | null;
  readonly proposal: HedgeInventoryShadowRecoveryProposal | null;
  readonly blockers: readonly HedgeInventoryShadowRecoveryProposalAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostRecoveryProposalGate[];
  readonly recoveryProposalGenerated: boolean;
  readonly recoveryIncidentCreated: false;
  readonly recoveryActionCreated: false;
  readonly canonicalExecutionPlanCreated: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryShadowRecoveryProposalSnapshot {
  readonly version: "22.16";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly residualReconciliationConfigurationState: string;
  readonly recoveryProposalConfigurationState: string;
  readonly sourceResidualReconciliationGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumReconciliationAgeMs: number;
    readonly proposalTtlMs: number;
    readonly maximumProposalQuoteValue: number;
  };
  readonly summary: {
    readonly recoveryRequiredAssessments: number;
    readonly recoveryProposalsReady: number;
    readonly warningProposals: number;
    readonly criticalProposals: number;
    readonly notRequiredAssessments: number;
    readonly notApplicableAssessments: number;
    readonly blockedAssessments: number;
    readonly totalProposedRecoveryQuantity: number;
    readonly totalProposedRecoveryQuoteValue: number;
    readonly recoveryIncidentsCreated: 0;
    readonly recoveryActionsCreated: 0;
    readonly canonicalExecutionPlansCreated: 0;
    readonly executableRecoveryActions: 0;
    readonly actionableRecoveryActions: 0;
  };
  readonly assessments: readonly HedgeInventoryShadowRecoveryProposalAssessment[];
  readonly blockers: readonly HedgeInventoryShadowRecoveryProposalGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly deterministicBoundedShadowProposalOnly: true;
    readonly sourceResidualNeverExceeded: true;
    readonly orderParametersSelected: false;
    readonly liveReconciliationEngineCalled: false;
    readonly executionRecoveryEngineCalled: false;
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

const REMAINING_GATES = [
  "OPERATOR_REVIEW_REQUIRED",
  "RECOVERY_ACTION_NOT_CREATED",
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostRecoveryProposalGate[];

const NOTES = [
  "V22.16 derives a deterministic, TTL-bounded SHADOW recovery-action proposal only from exact V22.15 RECOVERY_REQUIRED evidence.",
  "LONG residuals map to SELL and SHORT residuals map to BUY without exceeding reconciled residual quantity or configured quote-value limits.",
  "The proposal selects no order type or time-in-force and creates no recovery incident, recovery action, canonical plan, PAPER, LIVE or exchange order.",
] as const;

const SAFETY = {
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
} as const;

export class HedgeInventoryShadowRecoveryProposalPlanner {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    reconciliations: HedgeInventoryResidualReconciliationSnapshot,
    now = Date.now(),
  ): HedgeInventoryShadowRecoveryProposalSnapshot {
    this.validateNow(now);
    const globalBlocker =
      this.resolveGlobalBlocker(configuration, reconciliations, now);

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        reconciliations,
        now,
        globalBlocker,
      );
    }

    const assessments =
      reconciliations.assessments.map(
        (assessment) =>
          this.evaluateAssessment(configuration, assessment, now),
      );
    const proposals =
      assessments
        .map((assessment) => assessment.proposal)
        .filter(
          (proposal): proposal is HedgeInventoryShadowRecoveryProposal =>
            proposal !== null,
        );

    return immutableClone({
      version: "22.16",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0 ? "AVAILABLE" : "NO_DATA",
      configurationState: configuration.state,
      residualReconciliationConfigurationState:
        configuration.residualReconciliation.state,
      recoveryProposalConfigurationState:
        configuration.recoveryProposal.state,
      sourceResidualReconciliationGeneratedAt: reconciliations.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        recoveryRequiredAssessments:
          reconciliations.assessments.filter(
            (assessment) => assessment.state === "RECOVERY_REQUIRED",
          ).length,
        recoveryProposalsReady:
          this.countState(assessments, "RECOVERY_PROPOSAL_READY"),
        warningProposals:
          proposals.filter((proposal) => proposal.sourceSeverity === "WARNING").length,
        criticalProposals:
          proposals.filter((proposal) => proposal.sourceSeverity === "CRITICAL").length,
        notRequiredAssessments:
          this.countState(assessments, "NOT_REQUIRED"),
        notApplicableAssessments:
          this.countState(assessments, "NOT_APPLICABLE"),
        blockedAssessments:
          this.countState(assessments, "BLOCKED"),
        totalProposedRecoveryQuantity:
          sum(proposals.map((proposal) => proposal.leg.quantity)),
        totalProposedRecoveryQuoteValue:
          sum(proposals.map((proposal) => proposal.leg.estimatedQuoteValue)),
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
    assessment: HedgeInventoryResidualReconciliationAssessment,
    now: number,
  ): HedgeInventoryShadowRecoveryProposalAssessment {
    const reconciliation = assessment.reconciliation;
    const common = {
      id: `${assessment.id}:recovery-proposal`,
      reconciliationAssessmentId: assessment.id,
      reconciliationId: reconciliation?.id ?? null,
      simulationId: assessment.simulationId,
      planProposalId: assessment.planProposalId,
      intentId: assessment.intentId,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      venue: assessment.venue,
      market: assessment.market,
      sourceReconciliationState: assessment.state,
      recoveryIncidentCreated: false as const,
      recoveryActionCreated: false as const,
      canonicalExecutionPlanCreated: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (assessment.state === "RECONCILED_CLOSED") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_REQUIRED",
        reconciliationAgeMs:
          reconciliation ? now - reconciliation.reconciledAt : null,
        proposal: null,
        blockers: [],
        remainingGates: [],
        recoveryProposalGenerated: false,
      };
    }

    if (assessment.state !== "RECOVERY_REQUIRED" || reconciliation === null) {
      if (
        assessment.state === "NOT_APPLICABLE" ||
        assessment.state === "RECONCILIATION_REJECTED"
      ) {
        return {
          ...common,
          evidenceStatus: "AVAILABLE",
          state: "NOT_APPLICABLE",
          reconciliationAgeMs: null,
          proposal: null,
          blockers: ["RECONCILIATION_NOT_ELIGIBLE"],
          remainingGates: [],
          recoveryProposalGenerated: false,
        };
      }

      return this.blocked(common, null, "RECONCILIATION_NOT_ELIGIBLE");
    }

    const reconciliationAgeMs = now - reconciliation.reconciledAt;

    if (!this.isCompleteRecoveryContract(assessment, reconciliation)) {
      return this.blocked(
        common,
        reconciliationAgeMs,
        "INVALID_RECOVERY_REQUIRED_CONTRACT",
      );
    }
    if (reconciliation.reconciledAt > now) {
      return this.blocked(
        common,
        reconciliationAgeMs,
        "RECONCILIATION_RECORD_FROM_FUTURE",
      );
    }
    if (
      reconciliationAgeMs >
        configuration.recoveryProposal.maximumReconciliationAgeMs!
    ) {
      return this.blocked(
        common,
        reconciliationAgeMs,
        "RECONCILIATION_RECORD_STALE",
      );
    }
    if (
      reconciliation.reconciledResidualExposureQuoteValue >
        configuration.recoveryProposal.maximumProposalQuoteValue!
    ) {
      return this.blocked(
        common,
        reconciliationAgeMs,
        "RECOVERY_PROPOSAL_VALUE_LIMIT_EXCEEDED",
      );
    }

    const createdAt = reconciliation.reconciledAt;
    const expiresAt =
      createdAt + configuration.recoveryProposal.proposalTtlMs!;

    if (expiresAt <= now) {
      return this.blocked(
        common,
        reconciliationAgeMs,
        "RECOVERY_PROPOSAL_EXPIRY_INVALID",
      );
    }

    const proposal =
      this.createProposal(
        assessment,
        reconciliation,
        createdAt,
        expiresAt,
      );

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "RECOVERY_PROPOSAL_READY",
      reconciliationAgeMs,
      proposal,
      blockers: [],
      remainingGates: REMAINING_GATES,
      recoveryProposalGenerated: true,
    };
  }

  private createProposal(
    assessment: HedgeInventoryResidualReconciliationAssessment,
    reconciliation: HedgeInventoryResidualReconciliationRecord,
    createdAt: number,
    expiresAt: number,
  ): HedgeInventoryShadowRecoveryProposal {
    const actionType =
      reconciliation.severity === "CRITICAL"
        ? "RESIDUAL_EXPOSURE_ESCALATION" as const
        : "RESIDUAL_HEDGE_REVIEW" as const;
    const side =
      reconciliation.residualDirection === "LONG"
        ? "SELL" as const
        : "BUY" as const;
    const payload = {
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      kind: "SHADOW_RECOVERY_ACTION_PROPOSAL" as const,
      status: "PROPOSED" as const,
      mode: "SHADOW" as const,
      recoveryActionType: actionType,
      sourceReconciliationId: reconciliation.id,
      sourceFillSimulationAssessmentId: assessment.fillSimulationAssessmentId,
      sourceSimulationId: reconciliation.sourceSimulationId,
      sourcePlanProposalId: reconciliation.sourcePlanProposalId,
      routeId: reconciliation.routeId,
      asset: reconciliation.asset,
      quoteAsset: reconciliation.quoteAsset,
      residualDirection: reconciliation.residualDirection as "LONG" | "SHORT",
      sourceSeverity: reconciliation.severity as "WARNING" | "CRITICAL",
      sourceRecommendedAction:
        reconciliation.recommendedAction as
          | "REVIEW_RESIDUAL_HEDGE"
          | "ESCALATE_RESIDUAL_EXPOSURE",
      leg: {
        venue: reconciliation.venue,
        market: reconciliation.market,
        side,
        quantity: reconciliation.reconciledResidualQuantity,
        referencePrice: reconciliation.referencePrice,
        estimatedQuoteValue:
          reconciliation.reconciledResidualExposureQuoteValue,
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
    const validationHash =
      createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex");

    return immutableClone({
      id: `hedge-shadow-recovery-proposal-${validationHash}`,
      validationHash,
      ...payload,
    });
  }

  private isCompleteRecoveryContract(
    assessment: HedgeInventoryResidualReconciliationAssessment,
    reconciliation: HedgeInventoryResidualReconciliationRecord,
  ): boolean {
    const text = [
      reconciliation.id,
      reconciliation.sourceSimulationId,
      reconciliation.sourcePlanProposalId,
      reconciliation.sourceEvidenceId,
      reconciliation.routeId,
      reconciliation.asset,
      reconciliation.quoteAsset,
      reconciliation.venue,
      reconciliation.market,
    ];

    return (
      text.every((value) => value.trim().length > 0) &&
      assessment.recoveryRequired === true &&
      reconciliation.recoveryRequired === true &&
      (reconciliation.residualDirection === "LONG" ||
        reconciliation.residualDirection === "SHORT") &&
      (reconciliation.severity === "WARNING" ||
        reconciliation.severity === "CRITICAL") &&
      (
        (reconciliation.severity === "WARNING" &&
          reconciliation.recommendedAction === "REVIEW_RESIDUAL_HEDGE") ||
        (reconciliation.severity === "CRITICAL" &&
          reconciliation.recommendedAction === "ESCALATE_RESIDUAL_EXPOSURE")
      ) &&
      Number.isFinite(reconciliation.reconciledAt) &&
      reconciliation.reconciledAt > 0 &&
      Number.isFinite(reconciliation.reconciledResidualQuantity) &&
      reconciliation.reconciledResidualQuantity > 0 &&
      Number.isFinite(reconciliation.referencePrice) &&
      reconciliation.referencePrice > 0 &&
      Number.isFinite(reconciliation.reconciledResidualExposureQuoteValue) &&
      reconciliation.reconciledResidualExposureQuoteValue > 0 &&
      reconciliation.liveReconciliationRecordCreated === false &&
      reconciliation.recoveryIncidentCreated === false &&
      reconciliation.recoveryActionAuthorized === false &&
      reconciliation.executionAuthorized === false &&
      reconciliation.orderSubmissionAuthorized === false &&
      assessment.remainingGates.includes("RECOVERY_ACTION_NOT_CREATED") &&
      assessment.remainingGates.includes("INTENT_EXECUTION_NOT_AUTHORIZED")
    );
  }

  private blocked(
    common: Omit<
      HedgeInventoryShadowRecoveryProposalAssessment,
      | "evidenceStatus"
      | "state"
      | "reconciliationAgeMs"
      | "proposal"
      | "blockers"
      | "remainingGates"
      | "recoveryProposalGenerated"
    >,
    reconciliationAgeMs: number | null,
    blocker: HedgeInventoryShadowRecoveryProposalAssessmentBlocker,
  ): HedgeInventoryShadowRecoveryProposalAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      reconciliationAgeMs,
      proposal: null,
      blockers: [blocker],
      remainingGates: [],
      recoveryProposalGenerated: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    reconciliations: HedgeInventoryResidualReconciliationSnapshot,
    now: number,
  ): HedgeInventoryShadowRecoveryProposalGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.residualReconciliation.state !== "READY") {
      return "RESIDUAL_RECONCILIATION_CONFIGURATION_NOT_READY";
    }
    if (configuration.recoveryProposal.state !== "READY") {
      return "RECOVERY_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (reconciliations.evidenceStatus !== "AVAILABLE") {
      return "RESIDUAL_RECONCILIATION_EVIDENCE_UNAVAILABLE";
    }
    if (!Number.isFinite(reconciliations.generatedAt) || reconciliations.generatedAt <= 0) {
      return "INVALID_RESIDUAL_RECONCILIATION_TIMESTAMP";
    }
    if (reconciliations.generatedAt > now) {
      return "RESIDUAL_RECONCILIATION_FROM_FUTURE";
    }
    if (
      now - reconciliations.generatedAt >
        configuration.recoveryProposal.maximumReconciliationAgeMs!
    ) {
      return "RESIDUAL_RECONCILIATION_STALE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    reconciliations: HedgeInventoryResidualReconciliationSnapshot,
    now: number,
    blocker: HedgeInventoryShadowRecoveryProposalGlobalBlocker,
  ): HedgeInventoryShadowRecoveryProposalSnapshot {
    return immutableClone({
      version: "22.16",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      residualReconciliationConfigurationState:
        configuration.residualReconciliation.state,
      recoveryProposalConfigurationState:
        configuration.recoveryProposal.state,
      sourceResidualReconciliationGeneratedAt:
        Number.isFinite(reconciliations.generatedAt)
          ? reconciliations.generatedAt
          : null,
      thresholds: this.thresholds(configuration),
      summary: {
        recoveryRequiredAssessments: 0,
        recoveryProposalsReady: 0,
        warningProposals: 0,
        criticalProposals: 0,
        notRequiredAssessments: 0,
        notApplicableAssessments: 0,
        blockedAssessments: 0,
        totalProposedRecoveryQuantity: 0,
        totalProposedRecoveryQuoteValue: 0,
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
  ): HedgeInventoryShadowRecoveryProposalSnapshot["thresholds"] {
    return {
      maximumReconciliationAgeMs:
        configuration.recoveryProposal.maximumReconciliationAgeMs ?? 0,
      proposalTtlMs:
        configuration.recoveryProposal.proposalTtlMs ?? 0,
      maximumProposalQuoteValue:
        configuration.recoveryProposal.maximumProposalQuoteValue ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryShadowRecoveryProposalAssessment[],
    state: HedgeInventoryShadowRecoveryProposalAssessment["state"],
  ): number {
    return assessments.filter((assessment) => assessment.state === state).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge recovery-proposal timestamp must be positive and finite.",
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
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

