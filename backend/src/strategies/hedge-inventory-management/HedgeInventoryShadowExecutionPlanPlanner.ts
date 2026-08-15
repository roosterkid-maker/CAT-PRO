import {
  createHash,
} from "node:crypto";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import type {
  HedgeInventoryIntentLastLookAssessment,
  HedgeInventoryIntentLastLookSnapshot,
} from "./HedgeInventoryIntentLastLookEvaluator";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export interface HedgeInventoryShadowExecutionPlanProposal {
  readonly id: string;
  readonly validationHash: string;
  readonly strategyId: "hedge-inventory-management";
  readonly kind: "SHADOW_EXECUTION_PLAN_PROPOSAL";
  readonly status: "PROPOSED";
  readonly mode: "SHADOW";
  readonly executionType: "SINGLE_LEG_INVENTORY_REDUCTION";
  readonly sourceLastLookAssessmentId: string;
  readonly sourceIntentId: string;
  readonly sourceIntentProposalId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly proposedCapital: number;
  readonly leg: {
    readonly venue: string;
    readonly market: string;
    readonly side: "BUY" | "SELL";
    readonly quantity: number;
    readonly referencePrice: number;
    readonly orderTypeSelected: false;
    readonly timeInForceSelected: false;
    readonly submissionAuthorized: false;
  };
  readonly capitalReservation: {
    readonly id: string;
    readonly amount: number;
    readonly expiresAt: number;
    readonly commitAuthorized: false;
    readonly releaseAuthorized: false;
  };
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly executionPlanMaterialized: false;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
  readonly orderSubmissionAuthorized: false;
}

export type HedgeInventoryShadowExecutionPlanAssessmentBlocker =
  | "PREFLIGHT_NOT_PASSED"
  | "INVALID_PREFLIGHT_CONTRACT"
  | "INTENT_EXPIRED_BEFORE_PLAN_PROPOSAL"
  | "CAPITAL_RESERVATION_EXPIRED_BEFORE_PLAN_PROPOSAL"
  | "PLAN_PROPOSAL_EXPIRY_INVALID";

export type HedgeInventoryShadowExecutionPlanGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "INTENT_PREFLIGHT_CONFIGURATION_NOT_READY"
  | "EXECUTION_PLAN_PROPOSAL_CONFIGURATION_NOT_READY"
  | "INTENT_PREFLIGHT_EVIDENCE_UNAVAILABLE"
  | "INVALID_INTENT_PREFLIGHT_SNAPSHOT_TIMESTAMP"
  | "INTENT_PREFLIGHT_SNAPSHOT_FROM_FUTURE"
  | "INTENT_PREFLIGHT_SNAPSHOT_STALE";

export type HedgeInventoryPostExecutionPlanProposalGate =
  | "CANONICAL_EXECUTION_PLAN_NOT_CREATED"
  | "EXECUTION_SIMULATION_NOT_RUN"
  | "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryShadowExecutionPlanAssessment {
  readonly id: string;
  readonly lastLookAssessmentId: string;
  readonly intentId: string;
  readonly sourceIntentProposalId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: "BUY" | "SELL";
  readonly venue: string;
  readonly market: string;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "PLAN_PROPOSAL_READY"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourcePreflightState: HedgeInventoryIntentLastLookAssessment["state"];
  readonly preflightAgeMs: number;
  readonly proposal: HedgeInventoryShadowExecutionPlanProposal | null;
  readonly blockers: readonly HedgeInventoryShadowExecutionPlanAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostExecutionPlanProposalGate[];
  readonly planProposalGenerated: boolean;
  readonly executionPlanCreated: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryShadowExecutionPlanSnapshot {
  readonly version: "22.13";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly intentPreflightConfigurationState: string;
  readonly executionPlanProposalConfigurationState: string;
  readonly sourceIntentPreflightGeneratedAt: number | null;
  readonly sourceIntentLifecycleGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumPreflightAgeMs: number;
    readonly proposalTtlMs: number;
  };
  readonly summary: {
    readonly preflightPassedIntents: number;
    readonly planProposalsReady: number;
    readonly notApplicableIntents: number;
    readonly blockedIntents: number;
    readonly totalProposedQuantity: number;
    readonly totalProposedCapital: number;
    readonly canonicalExecutionPlansCreated: 0;
    readonly executablePlans: 0;
    readonly actionablePlans: 0;
  };
  readonly assessments: readonly HedgeInventoryShadowExecutionPlanAssessment[];
  readonly blockers: readonly HedgeInventoryShadowExecutionPlanGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly deterministicShadowProposalOnly: true;
    readonly canonicalExecutionPlannerCalled: false;
    readonly proposalIsCanonicalExecutionPlan: false;
    readonly singleLegReferenceOnly: true;
    readonly orderParametersSelected: false;
    readonly capitalReservationMutationAuthorized: false;
    readonly executionPlanCreationAllowed: false;
    readonly executionAuthorized: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "CANONICAL_EXECUTION_PLAN_NOT_CREATED",
  "EXECUTION_SIMULATION_NOT_RUN",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostExecutionPlanProposalGate[];

const NOTES = [
  "V22.13 derives a deterministic, expiry-bounded single-leg SHADOW execution-plan proposal only from V22.12 PREFLIGHT_PASS evidence.",
  "The proposal is not the authoritative trading ExecutionPlan, selects no order type or time-in-force, and never calls the canonical ExecutionPlanner.",
  "Proposal readiness grants no reservation commit/release, execution, PAPER, LIVE or order-submission authority.",
] as const;

const SAFETY = {
  deterministicShadowProposalOnly: true,
  canonicalExecutionPlannerCalled: false,
  proposalIsCanonicalExecutionPlan: false,
  singleLegReferenceOnly: true,
  orderParametersSelected: false,
  capitalReservationMutationAuthorized: false,
  executionPlanCreationAllowed: false,
  executionAuthorized: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

/**
 * Produces immutable SHADOW plan proposals only. The authoritative execution
 * planner is intentionally not a dependency of this strategy stage.
 */
export class HedgeInventoryShadowExecutionPlanPlanner {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    preflight: HedgeInventoryIntentLastLookSnapshot,
    now = Date.now(),
  ): HedgeInventoryShadowExecutionPlanSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        preflight,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        preflight,
        now,
        globalBlocker,
      );
    }

    const preflightAgeMs =
      now - preflight.generatedAt;

    const assessments =
      preflight.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            configuration,
            preflight,
            assessment,
            preflightAgeMs,
            now,
          ),
      );

    const readyProposals =
      assessments
        .map((assessment) => assessment.proposal)
        .filter(
          (proposal): proposal is HedgeInventoryShadowExecutionPlanProposal =>
            proposal !== null,
        );

    return immutableClone({
      version: "22.13",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      intentPreflightConfigurationState: configuration.intentPreflight.state,
      executionPlanProposalConfigurationState:
        configuration.executionPlanProposal.state,
      sourceIntentPreflightGeneratedAt: preflight.generatedAt,
      sourceIntentLifecycleGeneratedAt:
        preflight.sourceIntentLifecycleGeneratedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        preflightPassedIntents:
          preflight.assessments.filter(
            (assessment) => assessment.state === "PREFLIGHT_PASS",
          ).length,
        planProposalsReady:
          this.countState(assessments, "PLAN_PROPOSAL_READY"),
        notApplicableIntents:
          this.countState(assessments, "NOT_APPLICABLE"),
        blockedIntents:
          this.countState(assessments, "BLOCKED"),
        totalProposedQuantity:
          sum(readyProposals.map((proposal) => proposal.leg.quantity)),
        totalProposedCapital:
          sum(readyProposals.map((proposal) => proposal.proposedCapital)),
        canonicalExecutionPlansCreated: 0,
        executablePlans: 0,
        actionablePlans: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private evaluateAssessment(
    configuration: HedgeInventoryManagementConfiguration,
    preflightSnapshot: HedgeInventoryIntentLastLookSnapshot,
    preflight: HedgeInventoryIntentLastLookAssessment,
    preflightAgeMs: number,
    now: number,
  ): HedgeInventoryShadowExecutionPlanAssessment {
    const common = {
      id: `${preflight.id}:execution-plan-proposal`,
      lastLookAssessmentId: preflight.id,
      intentId: preflight.intentId,
      sourceIntentProposalId: preflight.sourceProposalId,
      routeId: preflight.routeId,
      asset: preflight.asset,
      quoteAsset: preflight.quoteAsset,
      side: preflight.side,
      venue: preflight.venue,
      market: preflight.market,
      sourcePreflightState: preflight.state,
      preflightAgeMs,
      executionPlanCreated: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (preflight.state !== "PREFLIGHT_PASS") {
      if (preflight.state === "PREFLIGHT_REJECTED") {
        return {
          ...common,
          evidenceStatus: "AVAILABLE",
          state: "NOT_APPLICABLE",
          proposal: null,
          blockers: ["PREFLIGHT_NOT_PASSED"],
          remainingGates: [],
          planProposalGenerated: false,
        };
      }

      return this.blocked(
        common,
        "PREFLIGHT_NOT_PASSED",
      );
    }

    if (!this.isCompletePreflightContract(preflight)) {
      return this.blocked(
        common,
        "INVALID_PREFLIGHT_CONTRACT",
      );
    }

    if (preflight.intentExpiresAt <= now) {
      return this.blocked(
        common,
        "INTENT_EXPIRED_BEFORE_PLAN_PROPOSAL",
      );
    }

    if (preflight.capitalReservationExpiresAt <= now) {
      return this.blocked(
        common,
        "CAPITAL_RESERVATION_EXPIRED_BEFORE_PLAN_PROPOSAL",
      );
    }

    const expiresAt =
      Math.min(
        preflightSnapshot.generatedAt +
          configuration.executionPlanProposal.proposalTtlMs!,
        preflight.intentExpiresAt,
        preflight.capitalReservationExpiresAt,
      );

    if (expiresAt <= now) {
      return this.blocked(
        common,
        "PLAN_PROPOSAL_EXPIRY_INVALID",
      );
    }

    const proposal =
      this.createProposal(
        preflightSnapshot.generatedAt,
        expiresAt,
        preflight,
      );

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "PLAN_PROPOSAL_READY",
      proposal,
      blockers: [],
      remainingGates: REMAINING_GATES,
      planProposalGenerated: true,
    };
  }

  private createProposal(
    createdAt: number,
    expiresAt: number,
    preflight: HedgeInventoryIntentLastLookAssessment,
  ): HedgeInventoryShadowExecutionPlanProposal {
    const payload = {
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      kind: "SHADOW_EXECUTION_PLAN_PROPOSAL" as const,
      status: "PROPOSED" as const,
      mode: "SHADOW" as const,
      executionType: "SINGLE_LEG_INVENTORY_REDUCTION" as const,
      sourceLastLookAssessmentId: preflight.id,
      sourceIntentId: preflight.intentId,
      sourceIntentProposalId: preflight.sourceProposalId,
      routeId: preflight.routeId,
      asset: preflight.asset,
      quoteAsset: preflight.quoteAsset,
      proposedCapital: preflight.proposedCapital,
      leg: {
        venue: preflight.venue,
        market: preflight.market,
        side: preflight.side,
        quantity: preflight.proposedQuantity,
        referencePrice: preflight.referenceVwapPrice,
        orderTypeSelected: false as const,
        timeInForceSelected: false as const,
        submissionAuthorized: false as const,
      },
      capitalReservation: {
        id: preflight.capitalReservationId,
        amount: preflight.proposedCapital,
        expiresAt: preflight.capitalReservationExpiresAt,
        commitAuthorized: false as const,
        releaseAuthorized: false as const,
      },
      createdAt,
      expiresAt,
      executionPlanMaterialized: false as const,
      executionAuthorized: false as const,
      automaticExecutionAllowed: false as const,
      orderSubmissionAuthorized: false as const,
    };

    const validationHash =
      createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex");

    return immutableClone({
      id: `hedge-shadow-plan-proposal-${validationHash}`,
      validationHash,
      ...payload,
    });
  }

  private isCompletePreflightContract(
    preflight: HedgeInventoryIntentLastLookAssessment,
  ): boolean {
    const requiredText = [
      preflight.id,
      preflight.lifecycleAssessmentId,
      preflight.intentId,
      preflight.sourceProposalId,
      preflight.routeId,
      preflight.asset,
      preflight.quoteAsset,
      preflight.venue,
      preflight.market,
      preflight.capitalReservationId,
    ];

    return (
      requiredText.every((value) => value.trim().length > 0) &&
      preflight.sourceLifecycleState === "ACTIVE" &&
      preflight.sourceProposalState === "PROPOSAL_READY" &&
      preflight.lastLookPassed &&
      preflight.executionPlanCreated === false &&
      preflight.executionAuthorized === false &&
      preflight.actionable === false &&
      preflight.blockers.length === 0 &&
      preflight.remainingGates.includes("EXECUTION_PLAN_NOT_CREATED") &&
      preflight.remainingGates.includes("INTENT_EXECUTION_NOT_AUTHORIZED") &&
      Number.isFinite(preflight.proposedQuantity) &&
      preflight.proposedQuantity > 0 &&
      Number.isFinite(preflight.referenceVwapPrice) &&
      preflight.referenceVwapPrice > 0 &&
      Number.isFinite(preflight.proposedCapital) &&
      preflight.proposedCapital > 0
    );
  }

  private blocked(
    common: Omit<
      HedgeInventoryShadowExecutionPlanAssessment,
      | "evidenceStatus"
      | "state"
      | "proposal"
      | "blockers"
      | "remainingGates"
      | "planProposalGenerated"
    >,
    blocker: HedgeInventoryShadowExecutionPlanAssessmentBlocker,
  ): HedgeInventoryShadowExecutionPlanAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      proposal: null,
      blockers: [blocker],
      remainingGates: [],
      planProposalGenerated: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    preflight: HedgeInventoryIntentLastLookSnapshot,
    now: number,
  ): HedgeInventoryShadowExecutionPlanGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentPreflight.state !== "READY") {
      return "INTENT_PREFLIGHT_CONFIGURATION_NOT_READY";
    }
    if (configuration.executionPlanProposal.state !== "READY") {
      return "EXECUTION_PLAN_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (preflight.evidenceStatus !== "AVAILABLE") {
      return "INTENT_PREFLIGHT_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(preflight.generatedAt) ||
      preflight.generatedAt <= 0
    ) {
      return "INVALID_INTENT_PREFLIGHT_SNAPSHOT_TIMESTAMP";
    }
    if (preflight.generatedAt > now) {
      return "INTENT_PREFLIGHT_SNAPSHOT_FROM_FUTURE";
    }
    if (
      now - preflight.generatedAt >
        configuration.executionPlanProposal.maximumPreflightAgeMs!
    ) {
      return "INTENT_PREFLIGHT_SNAPSHOT_STALE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    preflight: HedgeInventoryIntentLastLookSnapshot,
    now: number,
    blocker: HedgeInventoryShadowExecutionPlanGlobalBlocker,
  ): HedgeInventoryShadowExecutionPlanSnapshot {
    return immutableClone({
      version: "22.13",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      intentPreflightConfigurationState: configuration.intentPreflight.state,
      executionPlanProposalConfigurationState:
        configuration.executionPlanProposal.state,
      sourceIntentPreflightGeneratedAt:
        Number.isFinite(preflight.generatedAt)
          ? preflight.generatedAt
          : null,
      sourceIntentLifecycleGeneratedAt:
        preflight.sourceIntentLifecycleGeneratedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        preflightPassedIntents: 0,
        planProposalsReady: 0,
        notApplicableIntents: 0,
        blockedIntents: 0,
        totalProposedQuantity: 0,
        totalProposedCapital: 0,
        canonicalExecutionPlansCreated: 0,
        executablePlans: 0,
        actionablePlans: 0,
      },
      assessments: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private thresholds(
    configuration: HedgeInventoryManagementConfiguration,
  ): HedgeInventoryShadowExecutionPlanSnapshot["thresholds"] {
    return {
      maximumPreflightAgeMs:
        configuration.executionPlanProposal.maximumPreflightAgeMs ?? 0,
      proposalTtlMs:
        configuration.executionPlanProposal.proposalTtlMs ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryShadowExecutionPlanAssessment[],
    state: HedgeInventoryShadowExecutionPlanAssessment["state"],
  ): number {
    return assessments.filter(
      (assessment) => assessment.state === state,
    ).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge execution-plan proposal timestamp must be positive and finite.",
      );
    }
  }
}

function sum(values: readonly number[]): number {
  return values.reduce(
    (total, value) => total + value,
    0,
  );
}

function immutableClone<T>(value: T): T {
  return deepFreeze(
    structuredClone(value),
  );
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

