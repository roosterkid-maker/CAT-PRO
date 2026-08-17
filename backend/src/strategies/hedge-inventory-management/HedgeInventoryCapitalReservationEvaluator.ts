import type {
  CapitalReservation,
  CapitalReservationStatus,
  CreateCapitalReservationResult,
} from "../../trading/capital/CapitalReservation";

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
  HedgeInventoryRiskApprovalAssessment,
  HedgeInventoryRiskApprovalSnapshot,
} from "./HedgeInventoryRiskApprovalEvaluator";

export type HedgeInventoryCapitalReservationEvidenceSourceKind =
  "CAPITAL_RESERVATION_SERVICE";

export interface HedgeInventoryCapitalReservationEvidence {
  readonly riskApprovalAssessmentId: string;
  readonly routeId: string;
  readonly venue: string;
  readonly market: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryRiskApprovalAssessment["side"];
  readonly observedAt: number;
  readonly requestedAmount: number;
  readonly source: HedgeInventoryCapitalReservationEvidenceSourceKind;
  readonly result: CreateCapitalReservationResult;
}

export interface HedgeInventoryCapitalReservationEvidenceSnapshot {
  readonly generatedAt: number;
  readonly records: readonly HedgeInventoryCapitalReservationEvidence[];
}

export interface HedgeInventoryCapitalReservationEvidenceSource {
  getCapitalReservationEvidence(
    now?: number,
  ): HedgeInventoryCapitalReservationEvidenceSnapshot | null;
}

export type HedgeInventoryCapitalReservationAssessmentBlocker =
  | "RISK_APPROVAL_NOT_GRANTED"
  | "ROUTE_IDENTITY_UNAVAILABLE"
  | "CAPITAL_RESERVATION_EVIDENCE_NOT_FOUND"
  | "AMBIGUOUS_CAPITAL_RESERVATION_EVIDENCE"
  | "INVALID_EVIDENCE_TIMESTAMP"
  | "EVIDENCE_FROM_FUTURE"
  | "EVIDENCE_STALE"
  | "INVALID_EVIDENCE_SOURCE"
  | "INVALID_REQUESTED_AMOUNT"
  | "INVALID_RESERVATION_RESULT"
  | "RESERVATION_OWNER_MISMATCH"
  | "RESERVATION_AMOUNT_MISMATCH"
  | "INVALID_RESERVATION_TIMESTAMP"
  | "CAPITAL_RESERVATION_REJECTED"
  | "CAPITAL_RESERVATION_NOT_ACTIVE"
  | "CAPITAL_RESERVATION_EXPIRED"
  | "INSUFFICIENT_REMAINING_TTL";

export type HedgeInventoryCapitalReservationGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "RISK_APPROVAL_CONFIGURATION_NOT_READY"
  | "CAPITAL_RESERVATION_CONFIGURATION_NOT_READY"
  | "RISK_APPROVAL_EVIDENCE_UNAVAILABLE"
  | "CAPITAL_RESERVATION_EVIDENCE_UNAVAILABLE"
  | "INVALID_CAPITAL_RESERVATION_SNAPSHOT_TIMESTAMP"
  | "CAPITAL_RESERVATION_SNAPSHOT_FROM_FUTURE";

export type HedgeInventoryPostCapitalReservationGate =
  "STRATEGY_INTENT_NOT_GENERATED";

export interface HedgeInventoryCapitalReservationAssessment {
  readonly id: string;
  readonly riskApprovalAssessmentId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryRiskApprovalAssessment["side"];
  readonly venue: string | null;
  readonly market: string | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "CAPITAL_RESERVED"
    | "RESERVATION_REJECTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceRiskApprovalState: HedgeInventoryRiskApprovalAssessment["state"];
  readonly sourceEvidenceObservedAt: number | null;
  readonly evidenceAgeMs: number | null;
  readonly hedgeQuantity: number | null;
  readonly hedgeVwapPrice: number | null;
  readonly evidenceSource: HedgeInventoryCapitalReservationEvidenceSourceKind | null;
  readonly requestedAmount: number | null;
  readonly reservationId: string | null;
  readonly reservationOwnerType: CapitalReservation["ownerType"] | null;
  readonly reservationOwnerId: string | null;
  readonly reservedAmount: number | null;
  readonly reservationStatus: CapitalReservationStatus | null;
  readonly reservationCreatedAt: number | null;
  readonly reservationExpiresAt: number | null;
  readonly remainingTtlMs: number | null;
  readonly reservationReasons: readonly string[];
  readonly blockers: readonly HedgeInventoryCapitalReservationAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostCapitalReservationGate[];
  readonly riskApprovalGranted: boolean;
  readonly capitalReserved: boolean;
  readonly executionAuthorized: false;
  readonly actionable: false;
  readonly intentGenerated: false;
}

export interface HedgeInventoryCapitalReservationSnapshot {
  readonly version: "22.8";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly riskApprovalConfigurationState: string;
  readonly capitalReservationConfigurationState: string;
  readonly sourceRiskApprovalGeneratedAt: number | null;
  readonly sourceCapitalReservationEvidenceGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumEvidenceAgeMs: number;
    readonly minimumRemainingTtlMs: number;
  };
  readonly summary: {
    readonly riskApprovedRoutes: number;
    readonly evidenceRecordsMatched: number;
    readonly activeReservations: number;
    readonly reservationRejections: number;
    readonly blockedRoutes: number;
    readonly totalReservedAmount: number;
    readonly minimumObservedRemainingTtlMs: number | null;
    readonly actionableRoutes: 0;
    readonly intentsGenerated: 0;
  };
  readonly assessments: readonly HedgeInventoryCapitalReservationAssessment[];
  readonly blockers: readonly HedgeInventoryCapitalReservationGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly canonicalCapitalReservationEvidenceOnly: true;
    readonly strategyCreatesReservations: false;
    readonly strategyCommitsReservations: false;
    readonly strategyReleasesReservations: false;
    readonly reservationIsExecutionAuthorization: false;
    readonly hedgeIntentGenerationAllowed: false;
    readonly recursiveHedgeAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "STRATEGY_INTENT_NOT_GENERATED",
] as const satisfies readonly HedgeInventoryPostCapitalReservationGate[];

const NOTES = [
  "V22.8 consumes only explicit CapitalReservationService evidence owned by the exact V22.7 risk-approval assessment and matched route identity.",
  "The strategy controller never creates, commits or releases a reservation; stale, expired, ambiguous, mismatched or structurally invalid evidence fails closed.",
  "An active reservation is not execution authorization, a StrategyIntent, PAPER/LIVE eligibility or an order instruction.",
] as const;

const SAFETY = {
  canonicalCapitalReservationEvidenceOnly: true,
  strategyCreatesReservations: false,
  strategyCommitsReservations: false,
  strategyReleasesReservations: false,
  reservationIsExecutionAuthorization: false,
  hedgeIntentGenerationAllowed: false,
  recursiveHedgeAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryCapitalReservationEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    riskApproval: HedgeInventoryRiskApprovalSnapshot,
    evidence: HedgeInventoryCapitalReservationEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryCapitalReservationSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        riskApproval,
        evidence,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        riskApproval,
        evidence,
        now,
        globalBlocker,
      );
    }

    const assessments =
      riskApproval.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            configuration,
            assessment,
            evidence!,
            now,
          ),
      );

    const matched =
      assessments.filter(
        (assessment) =>
          assessment.sourceEvidenceObservedAt !== null,
      );

    const active =
      assessments.filter(
        (assessment) => assessment.state === "CAPITAL_RESERVED",
      );

    const observedTtl =
      matched
        .map(
          (assessment) => assessment.remainingTtlMs,
        )
        .filter(
          (value): value is number => value !== null,
        );

    return immutableClone({
      version: "22.8",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      riskApprovalConfigurationState: configuration.riskApproval.state,
      capitalReservationConfigurationState: configuration.capitalReservation.state,
      sourceRiskApprovalGeneratedAt: riskApproval.generatedAt,
      sourceCapitalReservationEvidenceGeneratedAt: evidence!.generatedAt,
      thresholds: {
        maximumEvidenceAgeMs:
          configuration.capitalReservation.maximumEvidenceAgeMs!,
        minimumRemainingTtlMs:
          configuration.capitalReservation.minimumRemainingTtlMs!,
      },
      summary: {
        riskApprovedRoutes: riskApproval.assessments.filter(
          (assessment) => assessment.state === "RISK_APPROVED",
        ).length,
        evidenceRecordsMatched: matched.length,
        activeReservations: active.length,
        reservationRejections: assessments.filter(
          (assessment) => assessment.state === "RESERVATION_REJECTED",
        ).length,
        blockedRoutes: assessments.filter(
          (assessment) => assessment.state === "BLOCKED",
        ).length,
        totalReservedAmount: round(
          active.reduce(
            (total, assessment) =>
              total + (assessment.reservedAmount ?? 0),
            0,
          ),
        ),
        minimumObservedRemainingTtlMs:
          observedTtl.length > 0
            ? Math.min(...observedTtl)
            : null,
        actionableRoutes: 0,
        intentsGenerated: 0,
      },
      assessments,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private evaluateAssessment(
    configuration: HedgeInventoryManagementConfiguration,
    assessment: HedgeInventoryRiskApprovalAssessment,
    evidence: HedgeInventoryCapitalReservationEvidenceSnapshot,
    now: number,
  ): HedgeInventoryCapitalReservationAssessment {
    const common = {
      id: `${assessment.id}:capital-reservation`,
      riskApprovalAssessmentId: assessment.id,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      side: assessment.side,
      venue: assessment.venue,
      market: assessment.market,
      sourceRiskApprovalState: assessment.state,
      hedgeQuantity: assessment.hedgeQuantity,
      hedgeVwapPrice: assessment.hedgeVwapPrice,
      riskApprovalGranted:
        assessment.riskApprovalGranted,
      executionAuthorized: false as const,
      actionable: false as const,
      intentGenerated: false as const,
    };

    if (assessment.state === "NOT_APPLICABLE") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        sourceEvidenceObservedAt: null,
        evidenceAgeMs: null,
        evidenceSource: null,
        requestedAmount: null,
        reservationId: null,
        reservationOwnerType: null,
        reservationOwnerId: null,
        reservedAmount: null,
        reservationStatus: null,
        reservationCreatedAt: null,
        reservationExpiresAt: null,
        remainingTtlMs: null,
        reservationReasons: [],
        blockers: [],
        remainingGates: [],
        capitalReserved: false,
      };
    }

    if (
      assessment.state !== "RISK_APPROVED" ||
      !assessment.riskApprovalGranted
    ) {
      return this.blockedAssessment(
        common,
        "RISK_APPROVAL_NOT_GRANTED",
      );
    }

    if (
      assessment.venue === null ||
      assessment.market === null ||
      assessment.side === "NONE"
    ) {
      return this.blockedAssessment(
        common,
        "ROUTE_IDENTITY_UNAVAILABLE",
      );
    }

    const matches =
      evidence.records.filter(
        (record) =>
          record.riskApprovalAssessmentId === assessment.id &&
          record.routeId === assessment.routeId &&
          record.venue === assessment.venue &&
          record.market === assessment.market &&
          record.asset === assessment.asset &&
          record.quoteAsset === assessment.quoteAsset &&
          record.side === assessment.side,
      );

    if (matches.length === 0) {
      return this.blockedAssessment(
        common,
        "CAPITAL_RESERVATION_EVIDENCE_NOT_FOUND",
      );
    }

    if (matches.length > 1) {
      return this.blockedAssessment(
        common,
        "AMBIGUOUS_CAPITAL_RESERVATION_EVIDENCE",
      );
    }

    return this.evaluateMatchedEvidence(
      common,
      matches[0]!,
      configuration,
      now,
    );
  }

  private evaluateMatchedEvidence(
    common: CapitalReservationAssessmentCommon,
    evidence: HedgeInventoryCapitalReservationEvidence,
    configuration: HedgeInventoryManagementConfiguration,
    now: number,
  ): HedgeInventoryCapitalReservationAssessment {
    const invalidBlockers:
      HedgeInventoryCapitalReservationAssessmentBlocker[] =
      [];

    if (evidence.source !== "CAPITAL_RESERVATION_SERVICE") {
      invalidBlockers.push(
        "INVALID_EVIDENCE_SOURCE",
      );
    }

    let evidenceAgeMs:
      number | null =
      null;

    if (
      !Number.isFinite(evidence.observedAt) ||
      evidence.observedAt <= 0
    ) {
      invalidBlockers.push(
        "INVALID_EVIDENCE_TIMESTAMP",
      );
    } else if (evidence.observedAt > now) {
      invalidBlockers.push(
        "EVIDENCE_FROM_FUTURE",
      );
    } else {
      evidenceAgeMs =
        now - evidence.observedAt;

      if (
        evidenceAgeMs >
          configuration.capitalReservation.maximumEvidenceAgeMs!
      ) {
        invalidBlockers.push(
          "EVIDENCE_STALE",
        );
      }
    }

    if (
      !Number.isFinite(evidence.requestedAmount) ||
      evidence.requestedAmount <= 0
    ) {
      invalidBlockers.push(
        "INVALID_REQUESTED_AMOUNT",
      );
    }

    if (!isReservationResult(evidence.result)) {
      invalidBlockers.push(
        "INVALID_RESERVATION_RESULT",
      );
    }

    if (invalidBlockers.length > 0) {
      return this.invalidAssessment(
        common,
        evidence,
        evidenceAgeMs,
        invalidBlockers,
      );
    }

    if (!evidence.result.approved) {
      return {
        ...this.emptyEvidenceFields(
          common,
          evidence,
          evidenceAgeMs,
        ),
        evidenceStatus: "AVAILABLE",
        state: "RESERVATION_REJECTED",
        requestedAmount: evidence.requestedAmount,
        reservationReasons: evidence.result.reasons,
        blockers: [
          "CAPITAL_RESERVATION_REJECTED",
        ],
        remainingGates: [],
        capitalReserved: false,
      };
    }

    const reservation =
      evidence.result.reservation!;

    const reservationBlockers:
      HedgeInventoryCapitalReservationAssessmentBlocker[] =
      [];

    if (
      reservation.ownerType !== "STRATEGY_RISK_APPROVAL" ||
      reservation.ownerId !== common.riskApprovalAssessmentId
    ) {
      reservationBlockers.push(
        "RESERVATION_OWNER_MISMATCH",
      );
    }

    if (reservation.amount !== evidence.requestedAmount) {
      reservationBlockers.push(
        "RESERVATION_AMOUNT_MISMATCH",
      );
    }

    if (
      !Number.isFinite(reservation.createdAt) ||
      reservation.createdAt <= 0 ||
      reservation.createdAt > now ||
      reservation.createdAt > evidence.observedAt ||
      !Number.isFinite(reservation.expiresAt) ||
      reservation.expiresAt <= reservation.createdAt ||
      (
        reservation.status === "ACTIVE"
          ? reservation.finalizedAt !== null
          : reservation.finalizedAt === null ||
            !Number.isFinite(reservation.finalizedAt) ||
            reservation.finalizedAt < reservation.createdAt ||
            reservation.finalizedAt > now
      )
    ) {
      reservationBlockers.push(
        "INVALID_RESERVATION_TIMESTAMP",
      );
    }

    const invalidReservation =
      reservationBlockers.some(
        (blocker) =>
          blocker === "RESERVATION_OWNER_MISMATCH" ||
          blocker === "RESERVATION_AMOUNT_MISMATCH" ||
          blocker === "INVALID_RESERVATION_TIMESTAMP",
      );

    if (invalidReservation) {
      return this.invalidAssessment(
        common,
        evidence,
        evidenceAgeMs,
        reservationBlockers,
      );
    }

    const remainingTtlMs =
      reservation.expiresAt - now;

    if (reservation.status !== "ACTIVE") {
      reservationBlockers.push(
        "CAPITAL_RESERVATION_NOT_ACTIVE",
      );
    } else if (remainingTtlMs <= 0) {
      reservationBlockers.push(
        "CAPITAL_RESERVATION_EXPIRED",
      );
    } else if (
      remainingTtlMs <
        configuration.capitalReservation.minimumRemainingTtlMs!
    ) {
      reservationBlockers.push(
        "INSUFFICIENT_REMAINING_TTL",
      );
    }

    const active =
      reservationBlockers.length === 0;

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state:
        active
          ? "CAPITAL_RESERVED"
          : "RESERVATION_REJECTED",
      sourceEvidenceObservedAt: evidence.observedAt,
      evidenceAgeMs,
      evidenceSource: evidence.source,
      requestedAmount: evidence.requestedAmount,
      reservationId: reservation.id,
      reservationOwnerType: reservation.ownerType,
      reservationOwnerId: reservation.ownerId,
      reservedAmount: reservation.amount,
      reservationStatus: reservation.status,
      reservationCreatedAt: reservation.createdAt,
      reservationExpiresAt: reservation.expiresAt,
      remainingTtlMs,
      reservationReasons: evidence.result.reasons,
      blockers: reservationBlockers,
      remainingGates:
        active
          ? REMAINING_GATES
          : [],
      capitalReserved: active,
    };
  }

  private invalidAssessment(
    common: CapitalReservationAssessmentCommon,
    evidence: HedgeInventoryCapitalReservationEvidence,
    evidenceAgeMs: number | null,
    blockers: readonly HedgeInventoryCapitalReservationAssessmentBlocker[],
  ): HedgeInventoryCapitalReservationAssessment {
    return {
      ...this.emptyEvidenceFields(
        common,
        evidence,
        evidenceAgeMs,
      ),
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      requestedAmount:
        Number.isFinite(evidence.requestedAmount)
          ? evidence.requestedAmount
          : null,
      reservationReasons: [],
      blockers: [
        ...new Set(blockers),
      ],
      remainingGates: [],
      capitalReserved: false,
    };
  }

  private emptyEvidenceFields(
    common: CapitalReservationAssessmentCommon,
    evidence: HedgeInventoryCapitalReservationEvidence,
    evidenceAgeMs: number | null,
  ) {
    return {
      ...common,
      sourceEvidenceObservedAt:
        Number.isFinite(evidence.observedAt)
          ? evidence.observedAt
          : null,
      evidenceAgeMs,
      evidenceSource: evidence.source,
      requestedAmount: null,
      reservationId: null,
      reservationOwnerType: null,
      reservationOwnerId: null,
      reservedAmount: null,
      reservationStatus: null,
      reservationCreatedAt: null,
      reservationExpiresAt: null,
      remainingTtlMs: null,
    };
  }

  private blockedAssessment(
    common: CapitalReservationAssessmentCommon,
    blocker: HedgeInventoryCapitalReservationAssessmentBlocker,
  ): HedgeInventoryCapitalReservationAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      sourceEvidenceObservedAt: null,
      evidenceAgeMs: null,
      evidenceSource: null,
      requestedAmount: null,
      reservationId: null,
      reservationOwnerType: null,
      reservationOwnerId: null,
      reservedAmount: null,
      reservationStatus: null,
      reservationCreatedAt: null,
      reservationExpiresAt: null,
      remainingTtlMs: null,
      reservationReasons: [],
      blockers: [
        blocker,
      ],
      remainingGates: [],
      capitalReserved: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    riskApproval: HedgeInventoryRiskApprovalSnapshot,
    evidence: HedgeInventoryCapitalReservationEvidenceSnapshot | null,
    now: number,
  ): HedgeInventoryCapitalReservationGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.riskApproval.state !== "READY") {
      return "RISK_APPROVAL_CONFIGURATION_NOT_READY";
    }
    if (configuration.capitalReservation.state !== "READY") {
      return "CAPITAL_RESERVATION_CONFIGURATION_NOT_READY";
    }
    if (riskApproval.evidenceStatus !== "AVAILABLE") {
      return "RISK_APPROVAL_EVIDENCE_UNAVAILABLE";
    }
    if (evidence === null) {
      return "CAPITAL_RESERVATION_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(evidence.generatedAt) ||
      evidence.generatedAt <= 0
    ) {
      return "INVALID_CAPITAL_RESERVATION_SNAPSHOT_TIMESTAMP";
    }
    if (evidence.generatedAt > now) {
      return "CAPITAL_RESERVATION_SNAPSHOT_FROM_FUTURE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    riskApproval: HedgeInventoryRiskApprovalSnapshot,
    evidence: HedgeInventoryCapitalReservationEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryCapitalReservationGlobalBlocker,
  ): HedgeInventoryCapitalReservationSnapshot {
    return immutableClone({
      version: "22.8",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      riskApprovalConfigurationState: configuration.riskApproval.state,
      capitalReservationConfigurationState: configuration.capitalReservation.state,
      sourceRiskApprovalGeneratedAt: riskApproval.generatedAt,
      sourceCapitalReservationEvidenceGeneratedAt: evidence?.generatedAt ?? null,
      thresholds: {
        maximumEvidenceAgeMs:
          configuration.capitalReservation.maximumEvidenceAgeMs ?? 0,
        minimumRemainingTtlMs:
          configuration.capitalReservation.minimumRemainingTtlMs ?? 0,
      },
      summary: {
        riskApprovedRoutes: 0,
        evidenceRecordsMatched: 0,
        activeReservations: 0,
        reservationRejections: 0,
        blockedRoutes: configuration.assetAllowlist.length,
        totalReservedAmount: 0,
        minimumObservedRemainingTtlMs: null,
        actionableRoutes: 0,
        intentsGenerated: 0,
      },
      assessments: [],
      blockers: [
        blocker,
      ],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private validateNow(
    now: number,
  ): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge capital-reservation timestamp must be a positive finite number.",
      );
    }
  }
}

type CapitalReservationAssessmentCommon =
  Pick<
    HedgeInventoryCapitalReservationAssessment,
    | "id"
    | "riskApprovalAssessmentId"
    | "routeId"
    | "asset"
    | "quoteAsset"
    | "side"
    | "venue"
    | "market"
    | "sourceRiskApprovalState"
    | "hedgeQuantity"
    | "hedgeVwapPrice"
    | "riskApprovalGranted"
    | "executionAuthorized"
    | "actionable"
    | "intentGenerated"
  >;

function isReservationResult(
  value: unknown,
): value is CreateCapitalReservationResult {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate =
    value as Partial<CreateCapitalReservationResult>;

  if (
    typeof candidate.approved !== "boolean" ||
    !isStringArray(candidate.reasons)
  ) {
    return false;
  }

  if (!candidate.approved) {
    return (
      candidate.reservation === null &&
      candidate.reasons.length > 0
    );
  }

  return (
    candidate.reasons.length === 0 &&
    isReservation(candidate.reservation)
  );
}

function isReservation(
  value: unknown,
): value is CapitalReservation {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate =
    value as Partial<CapitalReservation>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    (
      candidate.ownerType === "EXECUTION_PLAN" ||
      candidate.ownerType === "STRATEGY_RISK_APPROVAL" ||
      candidate.ownerType === "MANUAL"
    ) &&
    typeof candidate.ownerId === "string" &&
    candidate.ownerId.trim().length > 0 &&
    typeof candidate.amount === "number" &&
    Number.isFinite(candidate.amount) &&
    candidate.amount > 0 &&
    isReservationStatus(candidate.status) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.expiresAt === "number" &&
    (
      candidate.finalizedAt === null ||
      (
        typeof candidate.finalizedAt === "number" &&
        Number.isFinite(candidate.finalizedAt)
      )
    ) &&
    (
      candidate.reason === null ||
      typeof candidate.reason === "string"
    )
  );
}

function isReservationStatus(
  value: unknown,
): value is CapitalReservationStatus {
  return (
    value === "ACTIVE" ||
    value === "COMMITTED" ||
    value === "RELEASED" ||
    value === "EXPIRED"
  );
}

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.trim().length > 0,
    )
  );
}

function round(
  value: number,
  decimalPlaces = 8,
): number {
  const multiplier =
    10 ** decimalPlaces;

  return Math.round(
    (value + Number.EPSILON) * multiplier,
  ) / multiplier;
}

function immutableClone<T>(
  value: T,
): T {
  return deepFreeze(
    structuredClone(value),
  );
}

function deepFreeze<T>(
  value: T,
): T {
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

