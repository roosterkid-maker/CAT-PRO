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
  HedgeInventoryCapitalReservationAssessment,
  HedgeInventoryCapitalReservationSnapshot,
} from "./HedgeInventoryCapitalReservationEvaluator";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export type HedgeInventoryIntentProposalAssessmentBlocker =
  | "CAPITAL_NOT_RESERVED"
  | "ROUTE_IDENTITY_UNAVAILABLE"
  | "INVALID_HEDGE_QUANTITY"
  | "INVALID_HEDGE_PRICE"
  | "INVALID_RESERVED_CAPITAL"
  | "INVALID_RESERVATION_BINDING"
  | "INVALID_RESERVATION_SOURCE_TIMESTAMP"
  | "RESERVATION_SOURCE_FROM_FUTURE"
  | "RESERVATION_SOURCE_STALE"
  | "RESERVATION_EXPIRES_BEFORE_PROPOSAL";

export type HedgeInventoryIntentProposalGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "CAPITAL_RESERVATION_CONFIGURATION_NOT_READY"
  | "INTENT_PROPOSAL_CONFIGURATION_NOT_READY"
  | "CAPITAL_RESERVATION_EVIDENCE_UNAVAILABLE"
  | "INVALID_CAPITAL_RESERVATION_SNAPSHOT_TIMESTAMP"
  | "CAPITAL_RESERVATION_SNAPSHOT_FROM_FUTURE";

export type HedgeInventoryPostIntentProposalGate =
  "STRATEGY_INTENT_NOT_GENERATED";

export interface HedgeInventoryBoundedIntentProposal {
  readonly id: string;
  readonly strategyId: "hedge-inventory-management";
  readonly kind: "PROPOSED_STRATEGY_ACTION";
  readonly proposalType: "HEDGE_INVENTORY_REDUCTION";
  readonly proposedMode: "SHADOW";
  readonly status: "PROPOSED";
  readonly sourceType: "PORTFOLIO_EXPOSURE";
  readonly sourceCapitalReservationAssessmentId: string;
  readonly sourceRiskApprovalAssessmentId: string;
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
  readonly capitalReservationExpiresAt: number;
  readonly recursionDepth: 0;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly persistedAsStrategyIntent: false;
  readonly executionAuthorized: false;
  readonly automaticExecutionAllowed: false;
}

export interface HedgeInventoryIntentProposalAssessment {
  readonly id: string;
  readonly capitalReservationAssessmentId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryCapitalReservationAssessment["side"];
  readonly venue: string | null;
  readonly market: string | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "PROPOSAL_READY"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceCapitalReservationState: HedgeInventoryCapitalReservationAssessment["state"];
  readonly sourceEvidenceObservedAt: number | null;
  readonly sourceAgeMs: number | null;
  readonly proposal: HedgeInventoryBoundedIntentProposal | null;
  readonly blockers: readonly HedgeInventoryIntentProposalAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostIntentProposalGate[];
  readonly proposalGenerated: boolean;
  readonly persistedAsStrategyIntent: false;
  readonly intentGenerated: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
}

export interface HedgeInventoryIntentProposalSnapshot {
  readonly version: "22.9";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly capitalReservationConfigurationState: string;
  readonly intentProposalConfigurationState: string;
  readonly sourceCapitalReservationGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumCapitalReservationAgeMs: number;
    readonly proposalTtlMs: number;
    readonly maximumRecursionDepth: 0;
  };
  readonly summary: {
    readonly capitalReservedRoutes: number;
    readonly proposalsReady: number;
    readonly blockedRoutes: number;
    readonly notApplicableRoutes: number;
    readonly totalProposedQuantity: number;
    readonly totalProposedCapital: number;
    readonly strategyIntentsGenerated: 0;
    readonly actionableRoutes: 0;
  };
  readonly assessments: readonly HedgeInventoryIntentProposalAssessment[];
  readonly blockers: readonly HedgeInventoryIntentProposalGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly exactCapitalReservationBinding: true;
    readonly deterministicBoundedProposalOnly: true;
    readonly proposalIsStrategyIntent: false;
    readonly strategyPersistsIntents: false;
    readonly strategyCallsIntentService: false;
    readonly recursionDepth: 0;
    readonly recursiveHedgeAllowed: false;
    readonly capitalReservationMutationAllowed: false;
    readonly intentExecutionAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "STRATEGY_INTENT_NOT_GENERATED",
] as const satisfies readonly HedgeInventoryPostIntentProposalGate[];

const NOTES = [
  "V22.9 derives a deterministic, expiry-bounded SHADOW hedge proposal only from the exact active V22.8 capital reservation and its approved route, quantity and VWAP evidence.",
  "The V22.9 planning step is read-only and does not itself persist a canonical StrategyIntent; V22.10 persistence is a separate explicit handoff.",
  "Proposal readiness grants no reservation mutation, execution authorization, recursive hedge, PAPER, LIVE or order-submission authority.",
] as const;

const SAFETY = {
  exactCapitalReservationBinding: true,
  deterministicBoundedProposalOnly: true,
  proposalIsStrategyIntent: false,
  strategyPersistsIntents: false,
  strategyCallsIntentService: false,
  recursionDepth: 0,
  recursiveHedgeAllowed: false,
  capitalReservationMutationAllowed: false,
  intentExecutionAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryIntentProposalPlanner {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    capitalReservation: HedgeInventoryCapitalReservationSnapshot,
    now = Date.now(),
  ): HedgeInventoryIntentProposalSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        capitalReservation,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        capitalReservation,
        now,
        globalBlocker,
      );
    }

    const assessments =
      capitalReservation.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            configuration,
            assessment,
            now,
          ),
      );

    const ready =
      assessments.filter(
        (assessment) =>
          assessment.state === "PROPOSAL_READY",
      );

    return immutableClone({
      version: "22.9",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      capitalReservationConfigurationState:
        configuration.capitalReservation.state,
      intentProposalConfigurationState:
        configuration.intentProposal.state,
      sourceCapitalReservationGeneratedAt:
        capitalReservation.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        capitalReservedRoutes:
          capitalReservation.assessments.filter(
            (assessment) =>
              assessment.state === "CAPITAL_RESERVED",
          ).length,
        proposalsReady: ready.length,
        blockedRoutes:
          assessments.filter(
            (assessment) => assessment.state === "BLOCKED",
          ).length,
        notApplicableRoutes:
          assessments.filter(
            (assessment) => assessment.state === "NOT_APPLICABLE",
          ).length,
        totalProposedQuantity: round(
          ready.reduce(
            (total, assessment) =>
              total + (assessment.proposal?.proposedQuantity ?? 0),
            0,
          ),
        ),
        totalProposedCapital: round(
          ready.reduce(
            (total, assessment) =>
              total + (assessment.proposal?.proposedCapital ?? 0),
            0,
          ),
        ),
        strategyIntentsGenerated: 0,
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
    assessment: HedgeInventoryCapitalReservationAssessment,
    now: number,
  ): HedgeInventoryIntentProposalAssessment {
    const common = {
      id: `${assessment.id}:intent-proposal`,
      capitalReservationAssessmentId: assessment.id,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      side: assessment.side,
      venue: assessment.venue,
      market: assessment.market,
      sourceCapitalReservationState: assessment.state,
      sourceEvidenceObservedAt: assessment.sourceEvidenceObservedAt,
      persistedAsStrategyIntent: false as const,
      intentGenerated: false as const,
      executionAuthorized: false as const,
      actionable: false as const,
    };

    if (assessment.state === "NOT_APPLICABLE") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        sourceAgeMs: null,
        proposal: null,
        blockers: [],
        remainingGates: [],
        proposalGenerated: false,
      };
    }

    const blockers:
      HedgeInventoryIntentProposalAssessmentBlocker[] =
      [];

    if (
      assessment.state !== "CAPITAL_RESERVED" ||
      !assessment.capitalReserved
    ) {
      blockers.push("CAPITAL_NOT_RESERVED");
    }

    if (
      assessment.venue === null ||
      assessment.market === null ||
      assessment.side === "NONE"
    ) {
      blockers.push("ROUTE_IDENTITY_UNAVAILABLE");
    }

    if (
      assessment.hedgeQuantity === null ||
      !Number.isFinite(assessment.hedgeQuantity) ||
      assessment.hedgeQuantity <= 0
    ) {
      blockers.push("INVALID_HEDGE_QUANTITY");
    }

    if (
      assessment.hedgeVwapPrice === null ||
      !Number.isFinite(assessment.hedgeVwapPrice) ||
      assessment.hedgeVwapPrice <= 0
    ) {
      blockers.push("INVALID_HEDGE_PRICE");
    }

    if (
      assessment.reservedAmount === null ||
      !Number.isFinite(assessment.reservedAmount) ||
      assessment.reservedAmount <= 0
    ) {
      blockers.push("INVALID_RESERVED_CAPITAL");
    }

    if (
      assessment.reservationId === null ||
      assessment.reservationStatus !== "ACTIVE" ||
      assessment.reservationOwnerType !== "STRATEGY_RISK_APPROVAL" ||
      assessment.reservationOwnerId !== assessment.riskApprovalAssessmentId ||
      assessment.reservationExpiresAt === null
    ) {
      blockers.push("INVALID_RESERVATION_BINDING");
    }

    let sourceAgeMs: number | null = null;

    if (
      assessment.sourceEvidenceObservedAt === null ||
      !Number.isFinite(assessment.sourceEvidenceObservedAt) ||
      assessment.sourceEvidenceObservedAt <= 0
    ) {
      blockers.push("INVALID_RESERVATION_SOURCE_TIMESTAMP");
    } else if (assessment.sourceEvidenceObservedAt > now) {
      blockers.push("RESERVATION_SOURCE_FROM_FUTURE");
    } else {
      sourceAgeMs = now - assessment.sourceEvidenceObservedAt;

      if (
        sourceAgeMs >
          configuration.intentProposal.maximumCapitalReservationAgeMs!
      ) {
        blockers.push("RESERVATION_SOURCE_STALE");
      }
    }

    const createdAt =
      assessment.sourceEvidenceObservedAt;

    const expiresAt =
      createdAt === null ||
      assessment.reservationExpiresAt === null
        ? null
        : Math.min(
            createdAt + configuration.intentProposal.proposalTtlMs!,
            assessment.reservationExpiresAt,
          );

    if (
      expiresAt === null ||
      expiresAt <= now
    ) {
      blockers.push("RESERVATION_EXPIRES_BEFORE_PROPOSAL");
    }

    const uniqueBlockers = [
      ...new Set(blockers),
    ];

    if (uniqueBlockers.length > 0) {
      return {
        ...common,
        evidenceStatus: "NO_DATA",
        state: "BLOCKED",
        sourceAgeMs,
        proposal: null,
        blockers: uniqueBlockers,
        remainingGates: [],
        proposalGenerated: false,
      };
    }

    const proposalSeed = {
      sourceCapitalReservationAssessmentId: assessment.id,
      sourceRiskApprovalAssessmentId: assessment.riskApprovalAssessmentId,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      side: assessment.side as "BUY" | "SELL",
      venue: assessment.venue!,
      market: assessment.market!,
      proposedQuantity: assessment.hedgeQuantity!,
      referenceVwapPrice: assessment.hedgeVwapPrice!,
      proposedCapital: assessment.reservedAmount!,
      capitalReservationId: assessment.reservationId!,
      capitalReservationExpiresAt: assessment.reservationExpiresAt!,
      createdAt: createdAt!,
      expiresAt: expiresAt!,
    };

    const proposal:
      HedgeInventoryBoundedIntentProposal = {
      id: this.createProposalId(proposalSeed),
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      kind: "PROPOSED_STRATEGY_ACTION",
      proposalType: "HEDGE_INVENTORY_REDUCTION",
      proposedMode: "SHADOW",
      status: "PROPOSED",
      sourceType: "PORTFOLIO_EXPOSURE",
      ...proposalSeed,
      recursionDepth: 0,
      persistedAsStrategyIntent: false,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    };

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state: "PROPOSAL_READY",
      sourceAgeMs,
      proposal,
      blockers: [],
      remainingGates: REMAINING_GATES,
      proposalGenerated: true,
    };
  }

  private createProposalId(
    proposal: Omit<
      HedgeInventoryBoundedIntentProposal,
      | "id"
      | "strategyId"
      | "kind"
      | "proposalType"
      | "proposedMode"
      | "status"
      | "sourceType"
      | "recursionDepth"
      | "persistedAsStrategyIntent"
      | "executionAuthorized"
      | "automaticExecutionAllowed"
    >,
  ): string {
    const fingerprint =
      createHash("sha256")
        .update(
          JSON.stringify([
            HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
            proposal.sourceCapitalReservationAssessmentId,
            proposal.sourceRiskApprovalAssessmentId,
            proposal.routeId,
            proposal.asset,
            proposal.quoteAsset,
            proposal.side,
            proposal.venue,
            proposal.market,
            proposal.proposedQuantity,
            proposal.referenceVwapPrice,
            proposal.proposedCapital,
            proposal.capitalReservationId,
            proposal.capitalReservationExpiresAt,
            proposal.createdAt,
            proposal.expiresAt,
          ]),
          "utf8",
        )
        .digest("hex");

    return `hedge-intent-proposal-${fingerprint}`;
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    capitalReservation: HedgeInventoryCapitalReservationSnapshot,
    now: number,
  ): HedgeInventoryIntentProposalGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.capitalReservation.state !== "READY") {
      return "CAPITAL_RESERVATION_CONFIGURATION_NOT_READY";
    }
    if (configuration.intentProposal.state !== "READY") {
      return "INTENT_PROPOSAL_CONFIGURATION_NOT_READY";
    }
    if (capitalReservation.evidenceStatus !== "AVAILABLE") {
      return "CAPITAL_RESERVATION_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(capitalReservation.generatedAt) ||
      capitalReservation.generatedAt <= 0
    ) {
      return "INVALID_CAPITAL_RESERVATION_SNAPSHOT_TIMESTAMP";
    }
    if (capitalReservation.generatedAt > now) {
      return "CAPITAL_RESERVATION_SNAPSHOT_FROM_FUTURE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    capitalReservation: HedgeInventoryCapitalReservationSnapshot,
    now: number,
    blocker: HedgeInventoryIntentProposalGlobalBlocker,
  ): HedgeInventoryIntentProposalSnapshot {
    return immutableClone({
      version: "22.9",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      capitalReservationConfigurationState:
        configuration.capitalReservation.state,
      intentProposalConfigurationState:
        configuration.intentProposal.state,
      sourceCapitalReservationGeneratedAt:
        Number.isFinite(capitalReservation.generatedAt)
          ? capitalReservation.generatedAt
          : null,
      thresholds: this.thresholds(configuration),
      summary: {
        capitalReservedRoutes: 0,
        proposalsReady: 0,
        blockedRoutes: 0,
        notApplicableRoutes: 0,
        totalProposedQuantity: 0,
        totalProposedCapital: 0,
        strategyIntentsGenerated: 0,
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
  ): HedgeInventoryIntentProposalSnapshot["thresholds"] {
    return {
      maximumCapitalReservationAgeMs:
        configuration.intentProposal.maximumCapitalReservationAgeMs ?? 0,
      proposalTtlMs:
        configuration.intentProposal.proposalTtlMs ?? 0,
      maximumRecursionDepth: 0,
    };
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge intent-proposal timestamp must be a positive finite number.",
      );
    }
  }
}

function round(
  value: number,
  decimalPlaces = 8,
): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(
    (value + Number.EPSILON) * multiplier,
  ) / multiplier;
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

