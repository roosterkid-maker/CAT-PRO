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
  StrategyIntentService,
} from "../services/StrategyIntentService";

import type {
  HedgeInventoryBoundedIntentProposal,
  HedgeInventoryIntentProposalAssessment,
  HedgeInventoryIntentProposalSnapshot,
} from "./HedgeInventoryIntentProposalPlanner";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export type HedgeInventoryIntentPersistenceAssessmentBlocker =
  | "PROPOSAL_NOT_READY"
  | "INVALID_PROPOSAL_TIMESTAMP"
  | "PROPOSAL_FROM_FUTURE"
  | "PROPOSAL_STALE"
  | "PROPOSAL_EXPIRED"
  | "CANONICAL_STRATEGY_INTENT_NOT_FOUND"
  | "AMBIGUOUS_CANONICAL_STRATEGY_INTENT"
  | "CANONICAL_STRATEGY_INTENT_MISMATCH";

export type HedgeInventoryIntentPersistenceGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "INTENT_PROPOSAL_CONFIGURATION_NOT_READY"
  | "INTENT_PERSISTENCE_CONFIGURATION_NOT_READY"
  | "INTENT_PROPOSAL_EVIDENCE_UNAVAILABLE"
  | "INVALID_INTENT_PROPOSAL_SNAPSHOT_TIMESTAMP"
  | "INTENT_PROPOSAL_SNAPSHOT_FROM_FUTURE";

export type HedgeInventoryPostIntentPersistenceGate =
  "INTENT_EXECUTION_NOT_AUTHORIZED";

export interface HedgeInventoryIntentPersistenceAssessment {
  readonly id: string;
  readonly intentProposalAssessmentId: string;
  readonly sourceProposalId: string | null;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryIntentProposalAssessment["side"];
  readonly venue: string | null;
  readonly market: string | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "INTENT_PERSISTED"
    | "NOT_PERSISTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceProposalState: HedgeInventoryIntentProposalAssessment["state"];
  readonly proposalAgeMs: number | null;
  readonly intent: HedgeInventoryManagementStrategyIntent | null;
  readonly blockers: readonly HedgeInventoryIntentPersistenceAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostIntentPersistenceGate[];
  readonly intentGenerated: boolean;
  readonly intentPersisted: boolean;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryIntentPersistenceSnapshot {
  readonly version: "22.10";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly intentProposalConfigurationState: string;
  readonly intentPersistenceConfigurationState: string;
  readonly sourceIntentProposalGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumProposalAgeMs: number;
  };
  readonly summary: {
    readonly proposalsReady: number;
    readonly canonicalIntentsPersisted: number;
    readonly proposalsNotPersisted: number;
    readonly blockedRoutes: number;
    readonly activeShadowIntents: number;
    readonly executableIntents: 0;
    readonly actionableRoutes: 0;
  };
  readonly assessments: readonly HedgeInventoryIntentPersistenceAssessment[];
  readonly blockers: readonly HedgeInventoryIntentPersistenceGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly canonicalStrategyIntentServiceOnly: true;
    readonly explicitPersistenceHandoffOnly: true;
    readonly readModelCreatesIntents: false;
    readonly deterministicReplayDeduplication: true;
    readonly oneIntentPerCapitalReservation: true;
    readonly intentIsExecutionAuthorization: false;
    readonly reservationMutationAuthorized: false;
    readonly recursiveHedgeAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "INTENT_EXECUTION_NOT_AUTHORIZED",
] as const satisfies readonly HedgeInventoryPostIntentPersistenceGate[];

const NOTES = [
  "V22.10 persists only complete, fresh and unexpired V22.9 proposals through the canonical StrategyIntentService during an explicit handoff operation.",
  "Dashboard and API reads never create intents. Deterministic replays deduplicate, and one capital reservation cannot back different hedge intents.",
  "A persisted SHADOW StrategyIntent is immutable proposal evidence, not reservation mutation or execution authorization.",
] as const;

const SAFETY = {
  canonicalStrategyIntentServiceOnly: true,
  explicitPersistenceHandoffOnly: true,
  readModelCreatesIntents: false,
  deterministicReplayDeduplication: true,
  oneIntentPerCapitalReservation: true,
  intentIsExecutionAuthorization: false,
  reservationMutationAuthorized: false,
  recursiveHedgeAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryIntentPersistenceService {
  constructor(
    private readonly intentService:
      StrategyIntentService,
  ) {}

  persist(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    now = Date.now(),
  ): HedgeInventoryIntentPersistenceSnapshot {
    this.validateNow(now);

    if (
      this.resolveGlobalBlocker(
        configuration,
        proposals,
        now,
      ) === null
    ) {
      for (const assessment of proposals.assessments) {
        const proposal = assessment.proposal;

        if (
          assessment.state !== "PROPOSAL_READY" ||
          proposal === null ||
          !this.isProposalFreshAndActive(
            proposal,
            configuration,
            now,
          )
        ) {
          continue;
        }

        try {
          this.intentService
            .proposeHedgeInventoryShadow(
              proposal,
              now,
            );
        } catch {
          // The read-only evidence snapshot below fails closed when the
          // canonical service rejects or does not retain the proposal.
        }
      }
    }

    return this.evaluate(
      configuration,
      proposals,
      this.intentService.getIntents(
        HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
        1_000,
      ),
      now,
    );
  }

  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    intents: readonly StrategyIntent[],
    now = Date.now(),
  ): HedgeInventoryIntentPersistenceSnapshot {
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
      proposals.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            configuration,
            assessment,
            hedgeIntents,
            now,
          ),
      );

    return immutableClone({
      version: "22.10",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      intentProposalConfigurationState:
        configuration.intentProposal.state,
      intentPersistenceConfigurationState:
        configuration.intentPersistence.state,
      sourceIntentProposalGeneratedAt:
        proposals.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        proposalsReady:
          proposals.assessments.filter(
            (assessment) => assessment.state === "PROPOSAL_READY",
          ).length,
        canonicalIntentsPersisted:
          assessments.filter(
            (assessment) => assessment.state === "INTENT_PERSISTED",
          ).length,
        proposalsNotPersisted:
          assessments.filter(
            (assessment) => assessment.state === "NOT_PERSISTED",
          ).length,
        blockedRoutes:
          assessments.filter(
            (assessment) => assessment.state === "BLOCKED",
          ).length,
        activeShadowIntents:
          assessments.filter(
            (assessment) =>
              assessment.state === "INTENT_PERSISTED" &&
              assessment.intent !== null &&
              assessment.intent.expiresAt > now,
          ).length,
        executableIntents: 0,
        actionableRoutes: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private evaluateAssessment(
    configuration: HedgeInventoryManagementConfiguration,
    assessment: HedgeInventoryIntentProposalAssessment,
    intents: readonly HedgeInventoryManagementStrategyIntent[],
    now: number,
  ): HedgeInventoryIntentPersistenceAssessment {
    const proposal =
      assessment.proposal;

    const common = {
      id: `${assessment.id}:intent-persistence`,
      intentProposalAssessmentId: assessment.id,
      sourceProposalId: proposal?.id ?? null,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      side: assessment.side,
      venue: assessment.venue,
      market: assessment.market,
      sourceProposalState: assessment.state,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (assessment.state === "NOT_APPLICABLE") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        proposalAgeMs: null,
        intent: null,
        blockers: [],
        remainingGates: [],
        intentGenerated: false,
        intentPersisted: false,
      };
    }

    if (
      assessment.state !== "PROPOSAL_READY" ||
      proposal === null
    ) {
      return this.blocked(
        common,
        null,
        "PROPOSAL_NOT_READY",
      );
    }

    const timing =
      this.evaluateProposalTiming(
        proposal,
        configuration,
        now,
      );

    if (timing.blocker !== null) {
      return this.blocked(
        common,
        timing.ageMs,
        timing.blocker,
      );
    }

    const matches =
      intents.filter(
        (intent) =>
          intent.evidence.sourceProposalId === proposal.id,
      );

    if (matches.length === 0) {
      return {
        ...common,
        evidenceStatus: "NO_DATA",
        state: "NOT_PERSISTED",
        proposalAgeMs: timing.ageMs,
        intent: null,
        blockers: [
          "CANONICAL_STRATEGY_INTENT_NOT_FOUND",
        ],
        remainingGates: [],
        intentGenerated: false,
        intentPersisted: false,
      };
    }

    if (matches.length > 1) {
      return this.blocked(
        common,
        timing.ageMs,
        "AMBIGUOUS_CANONICAL_STRATEGY_INTENT",
      );
    }

    const intent =
      matches[0]!;

    if (!this.matchesProposal(intent, proposal)) {
      return this.blocked(
        common,
        timing.ageMs,
        "CANONICAL_STRATEGY_INTENT_MISMATCH",
      );
    }

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "INTENT_PERSISTED",
      proposalAgeMs: timing.ageMs,
      intent,
      blockers: [],
      remainingGates: REMAINING_GATES,
      intentGenerated: true,
      intentPersisted: true,
    };
  }

  private evaluateProposalTiming(
    proposal: HedgeInventoryBoundedIntentProposal,
    configuration: HedgeInventoryManagementConfiguration,
    now: number,
  ): {
    readonly ageMs: number | null;
    readonly blocker: HedgeInventoryIntentPersistenceAssessmentBlocker | null;
  } {
    if (
      !Number.isFinite(proposal.createdAt) ||
      !Number.isFinite(proposal.expiresAt) ||
      proposal.createdAt <= 0 ||
      proposal.expiresAt <= proposal.createdAt
    ) {
      return {
        ageMs: null,
        blocker: "INVALID_PROPOSAL_TIMESTAMP",
      };
    }

    if (proposal.createdAt > now) {
      return {
        ageMs: null,
        blocker: "PROPOSAL_FROM_FUTURE",
      };
    }

    const ageMs =
      now - proposal.createdAt;

    if (
      ageMs >
        configuration.intentPersistence.maximumProposalAgeMs!
    ) {
      return {
        ageMs,
        blocker: "PROPOSAL_STALE",
      };
    }

    if (
      proposal.expiresAt <= now ||
      proposal.capitalReservationExpiresAt <= now
    ) {
      return {
        ageMs,
        blocker: "PROPOSAL_EXPIRED",
      };
    }

    return {
      ageMs,
      blocker: null,
    };
  }

  private isProposalFreshAndActive(
    proposal: HedgeInventoryBoundedIntentProposal,
    configuration: HedgeInventoryManagementConfiguration,
    now: number,
  ): boolean {
    return this.evaluateProposalTiming(
      proposal,
      configuration,
      now,
    ).blocker === null;
  }

  private matchesProposal(
    intent: HedgeInventoryManagementStrategyIntent,
    proposal: HedgeInventoryBoundedIntentProposal,
  ): boolean {
    return (
      intent.signalId === proposal.id &&
      intent.proposedMode === "SHADOW" &&
      intent.proposedCapital === proposal.proposedCapital &&
      intent.createdAt === proposal.createdAt &&
      intent.expiresAt === proposal.expiresAt &&
      intent.executionAuthorized === false &&
      intent.automaticExecutionAllowed === false &&
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
      intent.evidence.capitalReservationId ===
        proposal.capitalReservationId &&
      intent.evidence.capitalReservationExpiresAt ===
        proposal.capitalReservationExpiresAt &&
      intent.evidence.recursionDepth === 0 &&
      intent.evidence.reservationMutationAuthorized === false
    );
  }

  private blocked(
    common: Omit<
      HedgeInventoryIntentPersistenceAssessment,
      | "evidenceStatus"
      | "state"
      | "proposalAgeMs"
      | "intent"
      | "blockers"
      | "remainingGates"
      | "intentGenerated"
      | "intentPersisted"
    >,
    proposalAgeMs: number | null,
    blocker: HedgeInventoryIntentPersistenceAssessmentBlocker,
  ): HedgeInventoryIntentPersistenceAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      proposalAgeMs,
      intent: null,
      blockers: [blocker],
      remainingGates: [],
      intentGenerated: false,
      intentPersisted: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    proposals: HedgeInventoryIntentProposalSnapshot,
    now: number,
  ): HedgeInventoryIntentPersistenceGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentProposal.state !== "READY") {
      return "INTENT_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentPersistence.state !== "READY") {
      return "INTENT_PERSISTENCE_CONFIGURATION_NOT_READY";
    }
    if (proposals.evidenceStatus !== "AVAILABLE") {
      return "INTENT_PROPOSAL_EVIDENCE_UNAVAILABLE";
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
    blocker: HedgeInventoryIntentPersistenceGlobalBlocker,
  ): HedgeInventoryIntentPersistenceSnapshot {
    return immutableClone({
      version: "22.10",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      intentProposalConfigurationState:
        configuration.intentProposal.state,
      intentPersistenceConfigurationState:
        configuration.intentPersistence.state,
      sourceIntentProposalGeneratedAt:
        Number.isFinite(proposals.generatedAt)
          ? proposals.generatedAt
          : null,
      thresholds: this.thresholds(configuration),
      summary: {
        proposalsReady: 0,
        canonicalIntentsPersisted: 0,
        proposalsNotPersisted: 0,
        blockedRoutes: 0,
        activeShadowIntents: 0,
        executableIntents: 0,
        actionableRoutes: 0,
      },
      assessments: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private thresholds(
    configuration: HedgeInventoryManagementConfiguration,
  ): HedgeInventoryIntentPersistenceSnapshot["thresholds"] {
    return {
      maximumProposalAgeMs:
        configuration.intentPersistence.maximumProposalAgeMs ?? 0,
    };
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge StrategyIntent persistence timestamp must be positive and finite.",
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

