import {
  createHash,
} from "node:crypto";

import type {
  HedgeInventoryManagementStrategyIntent,
  StrategyIntent,
} from "../models/StrategyIntent";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import type {
  HedgeInventoryBoundedIntentProposal,
  HedgeInventoryIntentProposalAssessment,
  HedgeInventoryIntentProposalSnapshot,
} from "./HedgeInventoryIntentProposalPlanner";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export type HedgeInventoryIntentLifecycleReason =
  | "INVALID_INTENT_CONTRACT"
  | "INVALID_INTENT_TIMESTAMP"
  | "INTENT_FROM_FUTURE"
  | "INTENT_MAXIMUM_AGE_EXCEEDED"
  | "INTENT_EXPIRED"
  | "CAPITAL_RESERVATION_EXPIRED"
  | "SOURCE_PROPOSAL_NOT_FOUND"
  | "AMBIGUOUS_SOURCE_PROPOSAL"
  | "SOURCE_PROPOSAL_NOT_READY"
  | "SOURCE_PROPOSAL_MISMATCH";

export type HedgeInventoryIntentLifecycleGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "INTENT_PROPOSAL_CONFIGURATION_NOT_READY"
  | "INTENT_PERSISTENCE_CONFIGURATION_NOT_READY"
  | "INTENT_LIFECYCLE_CONFIGURATION_NOT_READY"
  | "INVALID_INTENT_PROPOSAL_SNAPSHOT_TIMESTAMP"
  | "INTENT_PROPOSAL_SNAPSHOT_FROM_FUTURE";

export type HedgeInventoryPostIntentLifecycleGate =
  "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryIntentLifecycleEvent {
  readonly id: string;
  readonly intentId: string;
  readonly sourceProposalId: string;
  readonly state:
    | "EXPIRED"
    | "REVOKED";
  readonly reason: HedgeInventoryIntentLifecycleReason;
  readonly recordedAt: number;
  readonly canonicalIntentMutated: false;
  readonly reservationMutationAuthorized: false;
  readonly executionAuthorized: false;
}

export interface HedgeInventoryIntentLifecycleAssessment {
  readonly id: string;
  readonly intentId: string;
  readonly sourceProposalId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: "BUY" | "SELL";
  readonly venue: string;
  readonly market: string;
  readonly proposedQuantity: number;
  readonly referenceVwapPrice: number;
  readonly proposedCapital: number;
  readonly capitalReservationId: string;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "ACTIVE"
    | "EXPIRED"
    | "REVOKED"
    | "BLOCKED";
  readonly sourceProposalState: HedgeInventoryIntentProposalAssessment["state"] | null;
  readonly intentAgeMs: number | null;
  readonly intentExpiresAt: number;
  readonly capitalReservationExpiresAt: number;
  readonly terminalEvent: HedgeInventoryIntentLifecycleEvent | null;
  readonly blockers: readonly HedgeInventoryIntentLifecycleReason[];
  readonly remainingGates: readonly HedgeInventoryPostIntentLifecycleGate[];
  readonly lifecycleRevalidated: boolean;
  readonly terminal: boolean;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryIntentLifecycleSnapshot {
  readonly version: "22.11";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly intentProposalConfigurationState: string;
  readonly intentPersistenceConfigurationState: string;
  readonly intentLifecycleConfigurationState: string;
  readonly sourceIntentProposalGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumIntentAgeMs: number;
  };
  readonly summary: {
    readonly canonicalIntents: number;
    readonly activeIntents: number;
    readonly expiredIntents: number;
    readonly revokedIntents: number;
    readonly blockedIntents: number;
    readonly terminalEventsRecorded: number;
    readonly executableIntents: 0;
    readonly actionableIntents: 0;
  };
  readonly assessments: readonly HedgeInventoryIntentLifecycleAssessment[];
  readonly blockers: readonly HedgeInventoryIntentLifecycleGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly immutableTerminalEvidenceOnly: true;
    readonly explicitLifecycleHandoffOnly: true;
    readonly readModelCreatesLifecycleEvents: false;
    readonly terminalStateIrreversible: true;
    readonly canonicalIntentMutated: false;
    readonly sourceProposalRevalidatedExactly: true;
    readonly reservationMutationAuthorized: false;
    readonly intentIsExecutionAuthorization: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostIntentLifecycleGate[];

const NOTES = [
  "V22.11 revalidates each canonical SHADOW hedge intent against its exact current V22.9 source proposal, intent TTL and capital-reservation TTL.",
  "Expiry and revocation are separate immutable terminal evidence; the canonical StrategyIntent is never edited, and dashboard/API reads never create lifecycle events.",
  "A lifecycle-active intent remains non-executable and grants no capital mutation, PAPER, LIVE or order-submission authority.",
] as const;

const SAFETY = {
  immutableTerminalEvidenceOnly: true,
  explicitLifecycleHandoffOnly: true,
  readModelCreatesLifecycleEvents: false,
  terminalStateIrreversible: true,
  canonicalIntentMutated: false,
  sourceProposalRevalidatedExactly: true,
  reservationMutationAuthorized: false,
  intentIsExecutionAuthorization: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

/**
 * Maintains immutable expiry/revocation tombstones for canonical SHADOW hedge
 * intents. It has no execution, capital, reservation or exchange dependency.
 */
export class HedgeInventoryIntentLifecycleService {
  private readonly terminalEvents =
    new Map<string, HedgeInventoryIntentLifecycleEvent>();

  process(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    intents: readonly StrategyIntent[],
    now = Date.now(),
  ): HedgeInventoryIntentLifecycleSnapshot {
    const before =
      this.evaluate(
        configuration,
        proposals,
        intents,
        now,
      );

    if (before.blockers.length === 0) {
      for (const assessment of before.assessments) {
        if (
          assessment.terminalEvent !== null ||
          (
            assessment.state !== "EXPIRED" &&
            assessment.state !== "BLOCKED"
          ) ||
          assessment.blockers.length === 0
        ) {
          continue;
        }

        this.recordTerminalEvent(
          assessment,
          assessment.state === "EXPIRED"
            ? "EXPIRED"
            : "REVOKED",
          assessment.blockers[0]!,
          now,
        );
      }
    }

    return this.evaluate(
      configuration,
      proposals,
      intents,
      now,
    );
  }

  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    intents: readonly StrategyIntent[],
    now = Date.now(),
  ): HedgeInventoryIntentLifecycleSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        proposals,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        proposals,
        now,
        globalBlocker,
      );
    }

    const hedgeIntents =
      intents.filter(
        (intent): intent is HedgeInventoryManagementStrategyIntent =>
          intent.strategyId === HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID &&
          intent.proposalType === "HEDGE_INVENTORY_REDUCTION",
      );

    const assessments =
      hedgeIntents.map(
        (intent) =>
          this.evaluateIntent(
            configuration,
            proposals,
            intent,
            now,
          ),
      );

    return immutableClone({
      version: "22.11",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      intentProposalConfigurationState: configuration.intentProposal.state,
      intentPersistenceConfigurationState: configuration.intentPersistence.state,
      intentLifecycleConfigurationState: configuration.intentLifecycle.state,
      sourceIntentProposalGeneratedAt: proposals.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        canonicalIntents: assessments.length,
        activeIntents: this.countState(assessments, "ACTIVE"),
        expiredIntents: this.countState(assessments, "EXPIRED"),
        revokedIntents: this.countState(assessments, "REVOKED"),
        blockedIntents: this.countState(assessments, "BLOCKED"),
        terminalEventsRecorded:
          assessments.filter(
            (assessment) => assessment.terminalEvent !== null,
          ).length,
        executableIntents: 0,
        actionableIntents: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  getTerminalEvents(): readonly HedgeInventoryIntentLifecycleEvent[] {
    return [...this.terminalEvents.values()]
      .sort(
        (first, second) =>
          second.recordedAt - first.recordedAt ||
          first.id.localeCompare(second.id),
      )
      .map(immutableClone);
  }

  isTerminal(intentId: string): boolean {
    return this.terminalEvents.has(intentId);
  }

  private evaluateIntent(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    intent: HedgeInventoryManagementStrategyIntent,
    now: number,
  ): HedgeInventoryIntentLifecycleAssessment {
    const existingEvent =
      this.terminalEvents.get(intent.id) ?? null;

    const common = {
      id: `${intent.id}:lifecycle`,
      intentId: intent.id,
      sourceProposalId: intent.evidence.sourceProposalId,
      routeId: intent.evidence.routeId,
      asset: intent.evidence.asset,
      quoteAsset: intent.evidence.quoteAsset,
      side: intent.evidence.side,
      venue: intent.evidence.venue,
      market: intent.evidence.market,
      proposedQuantity: intent.evidence.proposedQuantity,
      referenceVwapPrice: intent.evidence.referenceVwapPrice,
      proposedCapital: intent.proposedCapital,
      capitalReservationId: intent.evidence.capitalReservationId,
      intentExpiresAt: intent.expiresAt,
      capitalReservationExpiresAt:
        intent.evidence.capitalReservationExpiresAt,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (existingEvent !== null) {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: existingEvent.state,
        sourceProposalState: null,
        intentAgeMs:
          intent.createdAt <= now
            ? now - intent.createdAt
            : null,
        terminalEvent: existingEvent,
        blockers: [existingEvent.reason],
        remainingGates: [],
        lifecycleRevalidated: true,
        terminal: true,
      };
    }

    const timing =
      this.evaluateTiming(
        configuration,
        intent,
        now,
      );

    if (timing.reason !== null) {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state:
          timing.expired
            ? "EXPIRED"
            : "BLOCKED",
        sourceProposalState: null,
        intentAgeMs: timing.ageMs,
        terminalEvent: null,
        blockers: [timing.reason],
        remainingGates: [],
        lifecycleRevalidated: true,
        terminal: timing.expired,
      };
    }

    if (!this.isCompleteIntentContract(intent)) {
      return this.blocked(
        common,
        timing.ageMs,
        null,
        "INVALID_INTENT_CONTRACT",
      );
    }

    const sourceAssessments =
      proposals.assessments.filter(
        (assessment) =>
          assessment.proposal?.id ===
            intent.evidence.sourceProposalId,
      );

    if (sourceAssessments.length === 0) {
      return this.blocked(
        common,
        timing.ageMs,
        null,
        "SOURCE_PROPOSAL_NOT_FOUND",
      );
    }

    if (sourceAssessments.length > 1) {
      return this.blocked(
        common,
        timing.ageMs,
        null,
        "AMBIGUOUS_SOURCE_PROPOSAL",
      );
    }

    const sourceAssessment =
      sourceAssessments[0]!;

    if (
      sourceAssessment.state !== "PROPOSAL_READY" ||
      sourceAssessment.proposal === null
    ) {
      return this.blocked(
        common,
        timing.ageMs,
        sourceAssessment.state,
        "SOURCE_PROPOSAL_NOT_READY",
      );
    }

    if (!this.matchesProposal(intent, sourceAssessment.proposal)) {
      return this.blocked(
        common,
        timing.ageMs,
        sourceAssessment.state,
        "SOURCE_PROPOSAL_MISMATCH",
      );
    }

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "ACTIVE",
      sourceProposalState: sourceAssessment.state,
      intentAgeMs: timing.ageMs,
      terminalEvent: null,
      blockers: [],
      remainingGates: REMAINING_GATES,
      lifecycleRevalidated: true,
      terminal: false,
    };
  }

  private evaluateTiming(
    configuration: HedgeInventoryManagementConfiguration,
    intent: HedgeInventoryManagementStrategyIntent,
    now: number,
  ): {
    readonly ageMs: number | null;
    readonly reason: HedgeInventoryIntentLifecycleReason | null;
    readonly expired: boolean;
  } {
    if (
      !Number.isFinite(intent.createdAt) ||
      !Number.isFinite(intent.expiresAt) ||
      !Number.isFinite(intent.evidence.capitalReservationExpiresAt) ||
      intent.createdAt <= 0 ||
      intent.expiresAt <= intent.createdAt ||
      intent.expiresAt > intent.evidence.capitalReservationExpiresAt
    ) {
      return {
        ageMs: null,
        reason: "INVALID_INTENT_TIMESTAMP",
        expired: false,
      };
    }

    if (intent.createdAt > now) {
      return {
        ageMs: null,
        reason: "INTENT_FROM_FUTURE",
        expired: false,
      };
    }

    const ageMs =
      now - intent.createdAt;

    if (intent.expiresAt <= now) {
      return {
        ageMs,
        reason: "INTENT_EXPIRED",
        expired: true,
      };
    }

    if (intent.evidence.capitalReservationExpiresAt <= now) {
      return {
        ageMs,
        reason: "CAPITAL_RESERVATION_EXPIRED",
        expired: true,
      };
    }

    if (
      ageMs >
        configuration.intentLifecycle.maximumIntentAgeMs!
    ) {
      return {
        ageMs,
        reason: "INTENT_MAXIMUM_AGE_EXCEEDED",
        expired: false,
      };
    }

    return {
      ageMs,
      reason: null,
      expired: false,
    };
  }

  private isCompleteIntentContract(
    intent: HedgeInventoryManagementStrategyIntent,
  ): boolean {
    const requiredText = [
      intent.id,
      intent.signalId,
      intent.evidence.sourceProposalId,
      intent.evidence.sourceCapitalReservationAssessmentId,
      intent.evidence.sourceRiskApprovalAssessmentId,
      intent.evidence.routeId,
      intent.evidence.asset,
      intent.evidence.quoteAsset,
      intent.evidence.venue,
      intent.evidence.market,
      intent.evidence.capitalReservationId,
    ];

    return (
      requiredText.every((value) => value.trim().length > 0) &&
      intent.kind === "PROPOSED_STRATEGY_ACTION" &&
      intent.proposedMode === "SHADOW" &&
      intent.status === "PROPOSED" &&
      intent.executionAuthorized === false &&
      intent.automaticExecutionAllowed === false &&
      intent.evidence.sourceType === "PORTFOLIO_EXPOSURE" &&
      intent.evidence.recursionDepth === 0 &&
      intent.evidence.reservationMutationAuthorized === false &&
      Number.isFinite(intent.proposedCapital) &&
      intent.proposedCapital > 0 &&
      Number.isFinite(intent.evidence.proposedQuantity) &&
      intent.evidence.proposedQuantity > 0 &&
      Number.isFinite(intent.evidence.referenceVwapPrice) &&
      intent.evidence.referenceVwapPrice > 0
    );
  }

  private matchesProposal(
    intent: HedgeInventoryManagementStrategyIntent,
    proposal: HedgeInventoryBoundedIntentProposal,
  ): boolean {
    return (
      intent.signalId === proposal.id &&
      intent.proposedCapital === proposal.proposedCapital &&
      intent.createdAt === proposal.createdAt &&
      intent.expiresAt === proposal.expiresAt &&
      intent.evidence.sourceProposalId === proposal.id &&
      intent.evidence.sourceType === proposal.sourceType &&
      intent.evidence.sourceCapitalReservationAssessmentId ===
        proposal.sourceCapitalReservationAssessmentId &&
      intent.evidence.sourceRiskApprovalAssessmentId ===
        proposal.sourceRiskApprovalAssessmentId &&
      intent.evidence.routeId === proposal.routeId &&
      intent.evidence.asset === proposal.asset &&
      intent.evidence.quoteAsset === proposal.quoteAsset &&
      intent.evidence.side === proposal.side &&
      intent.evidence.venue === proposal.venue &&
      intent.evidence.market === proposal.market &&
      intent.evidence.proposedQuantity === proposal.proposedQuantity &&
      intent.evidence.referenceVwapPrice === proposal.referenceVwapPrice &&
      intent.evidence.capitalReservationId === proposal.capitalReservationId &&
      intent.evidence.capitalReservationExpiresAt ===
        proposal.capitalReservationExpiresAt &&
      proposal.recursionDepth === 0 &&
      proposal.persistedAsStrategyIntent === false &&
      proposal.executionAuthorized === false &&
      proposal.automaticExecutionAllowed === false
    );
  }

  private blocked(
    common: Omit<
      HedgeInventoryIntentLifecycleAssessment,
      | "evidenceStatus"
      | "state"
      | "sourceProposalState"
      | "intentAgeMs"
      | "terminalEvent"
      | "blockers"
      | "remainingGates"
      | "lifecycleRevalidated"
      | "terminal"
    >,
    intentAgeMs: number | null,
    sourceProposalState: HedgeInventoryIntentProposalAssessment["state"] | null,
    reason: HedgeInventoryIntentLifecycleReason,
  ): HedgeInventoryIntentLifecycleAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      sourceProposalState,
      intentAgeMs,
      terminalEvent: null,
      blockers: [reason],
      remainingGates: [],
      lifecycleRevalidated: false,
      terminal: false,
    };
  }

  private recordTerminalEvent(
    assessment: HedgeInventoryIntentLifecycleAssessment,
    state: HedgeInventoryIntentLifecycleEvent["state"],
    reason: HedgeInventoryIntentLifecycleReason,
    now: number,
  ): void {
    if (this.terminalEvents.has(assessment.intentId)) {
      return;
    }

    const fingerprint =
      createHash("sha256")
        .update(
          JSON.stringify([
            HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
            assessment.intentId,
            assessment.sourceProposalId,
            state,
            reason,
          ]),
          "utf8",
        )
        .digest("hex");

    const event =
      immutableClone({
        id: `hedge-intent-lifecycle-${fingerprint}`,
        intentId: assessment.intentId,
        sourceProposalId: assessment.sourceProposalId,
        state,
        reason,
        recordedAt: now,
        canonicalIntentMutated: false,
        reservationMutationAuthorized: false,
        executionAuthorized: false,
      } as const);

    this.terminalEvents.set(
      assessment.intentId,
      event,
    );
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    now: number,
  ): HedgeInventoryIntentLifecycleGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentProposal.state !== "READY") {
      return "INTENT_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentPersistence.state !== "READY") {
      return "INTENT_PERSISTENCE_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentLifecycle.state !== "READY") {
      return "INTENT_LIFECYCLE_CONFIGURATION_NOT_READY";
    }
    if (
      !Number.isFinite(proposals.generatedAt) ||
      proposals.generatedAt <= 0
    ) {
      return "INVALID_INTENT_PROPOSAL_SNAPSHOT_TIMESTAMP";
    }
    if (proposals.generatedAt > now) {
      return "INTENT_PROPOSAL_SNAPSHOT_FROM_FUTURE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    now: number,
    blocker: HedgeInventoryIntentLifecycleGlobalBlocker,
  ): HedgeInventoryIntentLifecycleSnapshot {
    return immutableClone({
      version: "22.11",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      intentProposalConfigurationState: configuration.intentProposal.state,
      intentPersistenceConfigurationState: configuration.intentPersistence.state,
      intentLifecycleConfigurationState: configuration.intentLifecycle.state,
      sourceIntentProposalGeneratedAt:
        Number.isFinite(proposals.generatedAt)
          ? proposals.generatedAt
          : null,
      thresholds: this.thresholds(configuration),
      summary: {
        canonicalIntents: 0,
        activeIntents: 0,
        expiredIntents: 0,
        revokedIntents: 0,
        blockedIntents: 0,
        terminalEventsRecorded: 0,
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
  ): HedgeInventoryIntentLifecycleSnapshot["thresholds"] {
    return {
      maximumIntentAgeMs:
        configuration.intentLifecycle.maximumIntentAgeMs ?? 0,
    };
  }

  private countState(
    assessments: readonly HedgeInventoryIntentLifecycleAssessment[],
    state: HedgeInventoryIntentLifecycleAssessment["state"],
  ): number {
    return assessments.filter(
      (assessment) => assessment.state === state,
    ).length;
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge StrategyIntent lifecycle timestamp must be positive and finite.",
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

