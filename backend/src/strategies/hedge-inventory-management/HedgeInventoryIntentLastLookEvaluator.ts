import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import type {
  HedgeInventoryIntentLifecycleAssessment,
  HedgeInventoryIntentLifecycleSnapshot,
} from "./HedgeInventoryIntentLifecycleService";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export type HedgeInventoryIntentLastLookAssessmentBlocker =
  | "LIFECYCLE_NOT_ACTIVE"
  | "TERMINAL_INTENT_NOT_ELIGIBLE"
  | "INVALID_LIFECYCLE_CONTRACT"
  | "SOURCE_PROPOSAL_NOT_READY"
  | "INTENT_EXPIRED_DURING_PREFLIGHT"
  | "CAPITAL_RESERVATION_EXPIRED_DURING_PREFLIGHT";

export type HedgeInventoryIntentLastLookGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "INTENT_LIFECYCLE_CONFIGURATION_NOT_READY"
  | "INTENT_PREFLIGHT_CONFIGURATION_NOT_READY"
  | "INTENT_LIFECYCLE_EVIDENCE_UNAVAILABLE"
  | "INVALID_INTENT_LIFECYCLE_SNAPSHOT_TIMESTAMP"
  | "INTENT_LIFECYCLE_SNAPSHOT_FROM_FUTURE"
  | "INTENT_LIFECYCLE_SNAPSHOT_STALE";

export type HedgeInventoryPostIntentLastLookGate =
  | "EXECUTION_PLAN_NOT_CREATED"
  | "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryIntentLastLookAssessment {
  readonly id: string;
  readonly lifecycleAssessmentId: string;
  readonly intentId: string;
  readonly sourceProposalId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: "BUY" | "SELL";
  readonly venue: string;
  readonly market: string;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "PREFLIGHT_PASS"
    | "PREFLIGHT_REJECTED"
    | "BLOCKED";
  readonly sourceLifecycleState: HedgeInventoryIntentLifecycleAssessment["state"];
  readonly sourceProposalState: HedgeInventoryIntentLifecycleAssessment["sourceProposalState"];
  readonly lifecycleAgeMs: number;
  readonly intentAgeMs: number | null;
  readonly intentExpiresAt: number;
  readonly capitalReservationId: string;
  readonly capitalReservationExpiresAt: number;
  readonly proposedQuantity: number;
  readonly referenceVwapPrice: number;
  readonly proposedCapital: number;
  readonly blockers: readonly HedgeInventoryIntentLastLookAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostIntentLastLookGate[];
  readonly lastLookPassed: boolean;
  readonly executionPlanCreated: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryIntentLastLookSnapshot {
  readonly version: "22.12";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly intentLifecycleConfigurationState: string;
  readonly intentPreflightConfigurationState: string;
  readonly sourceIntentLifecycleGeneratedAt: number | null;
  readonly sourceIntentProposalGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumLifecycleAgeMs: number;
  };
  readonly summary: {
    readonly lifecycleIntents: number;
    readonly lifecycleActiveIntents: number;
    readonly preflightPassedIntents: number;
    readonly preflightRejectedIntents: number;
    readonly blockedIntents: number;
    readonly executionPlansCreated: 0;
    readonly executableIntents: 0;
    readonly actionableIntents: 0;
  };
  readonly assessments: readonly HedgeInventoryIntentLastLookAssessment[];
  readonly blockers: readonly HedgeInventoryIntentLastLookGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly readOnlyLastLookEvidence: true;
    readonly lifecycleActiveIntentsOnly: true;
    readonly exactSourceLineageRequired: true;
    readonly ttlRecheckedAtPreflight: true;
    readonly preflightPassIsExecutionAuthorization: false;
    readonly executionPlanCreationAllowed: false;
    readonly reservationMutationAuthorized: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "EXECUTION_PLAN_NOT_CREATED",
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostIntentLastLookGate[];

const NOTES = [
  "V22.12 accepts only lifecycle-ACTIVE canonical SHADOW intents whose exact source proposal lineage was revalidated by V22.11.",
  "Intent age, intent expiry and capital-reservation expiry are checked again at last-look time; stale lifecycle snapshots fail closed.",
  "A preflight pass is read-only evidence, not an execution plan, capital mutation, PAPER/LIVE permission or order instruction.",
] as const;

const SAFETY = {
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
} as const;

/**
 * Produces read-only last-look evidence from the immutable V22.11 lifecycle
 * snapshot. It has no execution, reservation, account or exchange dependency.
 */
export class HedgeInventoryIntentLastLookEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    lifecycle: HedgeInventoryIntentLifecycleSnapshot,
    now = Date.now(),
  ): HedgeInventoryIntentLastLookSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        lifecycle,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        lifecycle,
        now,
        globalBlocker,
      );
    }

    const lifecycleAgeMs =
      now - lifecycle.generatedAt;

    const assessments =
      lifecycle.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            assessment,
            lifecycleAgeMs,
            now,
          ),
      );

    return immutableClone({
      version: "22.12",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      intentLifecycleConfigurationState: configuration.intentLifecycle.state,
      intentPreflightConfigurationState: configuration.intentPreflight.state,
      sourceIntentLifecycleGeneratedAt: lifecycle.generatedAt,
      sourceIntentProposalGeneratedAt:
        lifecycle.sourceIntentProposalGeneratedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        lifecycleIntents: assessments.length,
        lifecycleActiveIntents:
          lifecycle.assessments.filter(
            (assessment) => assessment.state === "ACTIVE",
          ).length,
        preflightPassedIntents:
          this.countState(assessments, "PREFLIGHT_PASS"),
        preflightRejectedIntents:
          this.countState(assessments, "PREFLIGHT_REJECTED"),
        blockedIntents:
          this.countState(assessments, "BLOCKED"),
        executionPlansCreated: 0,
        executableIntents: 0,
        actionableIntents: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private evaluateAssessment(
    lifecycle: HedgeInventoryIntentLifecycleAssessment,
    lifecycleAgeMs: number,
    now: number,
  ): HedgeInventoryIntentLastLookAssessment {
    const common = {
      id: `${lifecycle.id}:last-look`,
      lifecycleAssessmentId: lifecycle.id,
      intentId: lifecycle.intentId,
      sourceProposalId: lifecycle.sourceProposalId,
      routeId: lifecycle.routeId,
      asset: lifecycle.asset,
      quoteAsset: lifecycle.quoteAsset,
      side: lifecycle.side,
      venue: lifecycle.venue,
      market: lifecycle.market,
      sourceLifecycleState: lifecycle.state,
      sourceProposalState: lifecycle.sourceProposalState,
      lifecycleAgeMs,
      intentAgeMs: lifecycle.intentAgeMs,
      intentExpiresAt: lifecycle.intentExpiresAt,
      capitalReservationId: lifecycle.capitalReservationId,
      capitalReservationExpiresAt:
        lifecycle.capitalReservationExpiresAt,
      proposedQuantity: lifecycle.proposedQuantity,
      referenceVwapPrice: lifecycle.referenceVwapPrice,
      proposedCapital: lifecycle.proposedCapital,
      executionPlanCreated: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (
      lifecycle.state === "EXPIRED" ||
      lifecycle.state === "REVOKED" ||
      lifecycle.terminal
    ) {
      return this.rejected(
        common,
        "TERMINAL_INTENT_NOT_ELIGIBLE",
      );
    }

    if (lifecycle.state !== "ACTIVE") {
      return this.blocked(
        common,
        "LIFECYCLE_NOT_ACTIVE",
      );
    }

    if (!this.isCompleteLifecycleContract(lifecycle)) {
      return this.blocked(
        common,
        "INVALID_LIFECYCLE_CONTRACT",
      );
    }

    if (lifecycle.sourceProposalState !== "PROPOSAL_READY") {
      return this.blocked(
        common,
        "SOURCE_PROPOSAL_NOT_READY",
      );
    }

    if (lifecycle.intentExpiresAt <= now) {
      return this.rejected(
        common,
        "INTENT_EXPIRED_DURING_PREFLIGHT",
      );
    }

    if (lifecycle.capitalReservationExpiresAt <= now) {
      return this.rejected(
        common,
        "CAPITAL_RESERVATION_EXPIRED_DURING_PREFLIGHT",
      );
    }

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "PREFLIGHT_PASS",
      blockers: [],
      remainingGates: REMAINING_GATES,
      lastLookPassed: true,
    };
  }

  private isCompleteLifecycleContract(
    lifecycle: HedgeInventoryIntentLifecycleAssessment,
  ): boolean {
    const requiredText = [
      lifecycle.id,
      lifecycle.intentId,
      lifecycle.sourceProposalId,
      lifecycle.routeId,
      lifecycle.asset,
      lifecycle.quoteAsset,
      lifecycle.venue,
      lifecycle.market,
      lifecycle.capitalReservationId,
    ];

    return (
      requiredText.every((value) => value.trim().length > 0) &&
      lifecycle.lifecycleRevalidated &&
      !lifecycle.terminal &&
      lifecycle.terminalEvent === null &&
      lifecycle.blockers.length === 0 &&
      lifecycle.executionAuthorized === false &&
      lifecycle.actionable === false &&
      lifecycle.remainingGates.includes(
        "INTENT_EXECUTION_NOT_AUTHORIZED",
      ) &&
      lifecycle.intentAgeMs !== null &&
      lifecycle.intentAgeMs >= 0 &&
      Number.isFinite(lifecycle.proposedQuantity) &&
      lifecycle.proposedQuantity > 0 &&
      Number.isFinite(lifecycle.referenceVwapPrice) &&
      lifecycle.referenceVwapPrice > 0 &&
      Number.isFinite(lifecycle.proposedCapital) &&
      lifecycle.proposedCapital > 0
    );
  }

  private rejected(
    common: Omit<
      HedgeInventoryIntentLastLookAssessment,
      | "evidenceStatus"
      | "state"
      | "blockers"
      | "remainingGates"
      | "lastLookPassed"
    >,
    blocker: HedgeInventoryIntentLastLookAssessmentBlocker,
  ): HedgeInventoryIntentLastLookAssessment {
    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "PREFLIGHT_REJECTED",
      blockers: [blocker],
      remainingGates: [],
      lastLookPassed: false,
    };
  }

  private blocked(
    common: Omit<
      HedgeInventoryIntentLastLookAssessment,
      | "evidenceStatus"
      | "state"
      | "blockers"
      | "remainingGates"
      | "lastLookPassed"
    >,
    blocker: HedgeInventoryIntentLastLookAssessmentBlocker,
  ): HedgeInventoryIntentLastLookAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      blockers: [blocker],
      remainingGates: [],
      lastLookPassed: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    lifecycle: HedgeInventoryIntentLifecycleSnapshot,
    now: number,
  ): HedgeInventoryIntentLastLookGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentLifecycle.state !== "READY") {
      return "INTENT_LIFECYCLE_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentPreflight.state !== "READY") {
      return "INTENT_PREFLIGHT_CONFIGURATION_NOT_READY";
    }
    if (lifecycle.evidenceStatus !== "AVAILABLE") {
      return "INTENT_LIFECYCLE_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(lifecycle.generatedAt) ||
      lifecycle.generatedAt <= 0
    ) {
      return "INVALID_INTENT_LIFECYCLE_SNAPSHOT_TIMESTAMP";
    }
    if (lifecycle.generatedAt > now) {
      return "INTENT_LIFECYCLE_SNAPSHOT_FROM_FUTURE";
    }
    if (
      now - lifecycle.generatedAt >
        configuration.intentPreflight.maximumLifecycleAgeMs!
    ) {
      return "INTENT_LIFECYCLE_SNAPSHOT_STALE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    lifecycle: HedgeInventoryIntentLifecycleSnapshot,
    now: number,
    blocker: HedgeInventoryIntentLastLookGlobalBlocker,
  ): HedgeInventoryIntentLastLookSnapshot {
    return immutableClone({
      version: "22.12",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      intentLifecycleConfigurationState: configuration.intentLifecycle.state,
      intentPreflightConfigurationState: configuration.intentPreflight.state,
      sourceIntentLifecycleGeneratedAt:
        Number.isFinite(lifecycle.generatedAt)
          ? lifecycle.generatedAt
          : null,
      sourceIntentProposalGeneratedAt:
        lifecycle.sourceIntentProposalGeneratedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        lifecycleIntents: 0,
        lifecycleActiveIntents: 0,
        preflightPassedIntents: 0,
        preflightRejectedIntents: 0,
        blockedIntents: 0,
        executionPlansCreated: 0,
        executableIntents: 0,
        actionableIntents: 0,
      },
      assessments: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private thresholds(
    configuration: HedgeInventoryManagementConfiguration,
  ): HedgeInventoryIntentLastLookSnapshot["thresholds"] {
    return {
      maximumLifecycleAgeMs:
        configuration.intentPreflight.maximumLifecycleAgeMs ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryIntentLastLookAssessment[],
    state: HedgeInventoryIntentLastLookAssessment["state"],
  ): number {
    return assessments.filter(
      (assessment) => assessment.state === state,
    ).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge StrategyIntent last-look timestamp must be positive and finite.",
      );
    }
  }
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

