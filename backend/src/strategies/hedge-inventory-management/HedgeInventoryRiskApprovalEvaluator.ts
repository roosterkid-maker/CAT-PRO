import type {
  RiskAssessment,
  RiskAssessmentChecks,
  RiskLevel,
} from "../../risk/models/RiskAssessment";

import type {
  StrategyEvidenceStatus,
} from "../models/StrategyEvidenceStatus";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  HedgeInventoryBasisRiskAssessment,
  HedgeInventoryBasisRiskSnapshot,
} from "./HedgeInventoryBasisRiskEvaluator";

import type {
  HedgeInventoryManagementConfiguration,
} from "./HedgeInventoryManagementConfiguration";

export type HedgeInventoryRiskApprovalEvidenceSourceKind =
  "CANONICAL_RISK_ENGINE";

export interface HedgeInventoryRiskApprovalEvidence {
  readonly basisRiskAssessmentId: string;
  readonly routeId: string;
  readonly venue: string;
  readonly market: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryBasisRiskAssessment["side"];
  readonly assessedAt: number;
  readonly source: HedgeInventoryRiskApprovalEvidenceSourceKind;
  readonly assessment: RiskAssessment;
}

export interface HedgeInventoryRiskApprovalEvidenceSnapshot {
  readonly generatedAt: number;
  readonly records: readonly HedgeInventoryRiskApprovalEvidence[];
}

export interface HedgeInventoryRiskApprovalEvidenceSource {
  getRiskApprovalEvidence(
    now?: number,
  ): HedgeInventoryRiskApprovalEvidenceSnapshot | null;
}

export type HedgeInventoryRiskApprovalAssessmentBlocker =
  | "BASIS_RISK_NOT_PASSED"
  | "ROUTE_IDENTITY_UNAVAILABLE"
  | "RISK_ASSESSMENT_NOT_FOUND"
  | "AMBIGUOUS_RISK_ASSESSMENT"
  | "INVALID_ASSESSMENT_TIMESTAMP"
  | "ASSESSMENT_FROM_FUTURE"
  | "ASSESSMENT_STALE"
  | "INVALID_ASSESSMENT_SOURCE"
  | "INVALID_RISK_ASSESSMENT"
  | "RISK_ENGINE_REJECTED";

export type HedgeInventoryRiskApprovalGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "BASIS_RISK_CONFIGURATION_NOT_READY"
  | "RISK_APPROVAL_CONFIGURATION_NOT_READY"
  | "BASIS_RISK_EVIDENCE_UNAVAILABLE"
  | "RISK_APPROVAL_EVIDENCE_UNAVAILABLE"
  | "INVALID_RISK_APPROVAL_SNAPSHOT_TIMESTAMP"
  | "RISK_APPROVAL_SNAPSHOT_FROM_FUTURE";

export type HedgeInventoryPostRiskApprovalGate =
  | "CAPITAL_NOT_RESERVED"
  | "STRATEGY_INTENT_NOT_GENERATED";

export interface HedgeInventoryRiskApprovalAssessment {
  readonly id: string;
  readonly basisRiskAssessmentId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryBasisRiskAssessment["side"];
  readonly venue: string | null;
  readonly market: string | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "RISK_APPROVED"
    | "RISK_REJECTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceBasisRiskState: HedgeInventoryBasisRiskAssessment["state"];
  readonly sourceAssessmentAssessedAt: number | null;
  readonly assessmentAgeMs: number | null;
  readonly hedgeQuantity: number | null;
  readonly hedgeVwapPrice: number | null;
  readonly evidenceSource: HedgeInventoryRiskApprovalEvidenceSourceKind | null;
  readonly riskLevel: RiskLevel | null;
  readonly riskScore: number | null;
  readonly riskChecks: RiskAssessmentChecks | null;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly HedgeInventoryRiskApprovalAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostRiskApprovalGate[];
  readonly riskApprovalGranted: boolean;
  readonly executionAuthorized: false;
  readonly actionable: false;
  readonly capitalReserved: false;
  readonly intentGenerated: false;
}

export interface HedgeInventoryRiskApprovalSnapshot {
  readonly version: "22.7";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly basisRiskConfigurationState: string;
  readonly riskApprovalConfigurationState: string;
  readonly sourceBasisRiskGeneratedAt: number | null;
  readonly sourceRiskApprovalEvidenceGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumAssessmentAgeMs: number;
  };
  readonly summary: {
    readonly basisRiskPassingRoutes: number;
    readonly evidenceRecordsMatched: number;
    readonly riskApprovalsGranted: number;
    readonly riskRejections: number;
    readonly blockedRoutes: number;
    readonly minimumObservedRiskScore: number | null;
    readonly actionableRoutes: 0;
    readonly capitalReservations: 0;
    readonly intentsGenerated: 0;
  };
  readonly assessments: readonly HedgeInventoryRiskApprovalAssessment[];
  readonly blockers: readonly HedgeInventoryRiskApprovalGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly canonicalRiskEngineEvidenceOnly: true;
    readonly strategyCallsRiskEngineDirectly: false;
    readonly approvalIsExecutionAuthorization: false;
    readonly capitalReserved: false;
    readonly hedgeIntentGenerationAllowed: false;
    readonly recursiveHedgeAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "CAPITAL_NOT_RESERVED",
  "STRATEGY_INTENT_NOT_GENERATED",
] as const satisfies readonly HedgeInventoryPostRiskApprovalGate[];

const NOTES = [
  "V22.7 consumes only explicit, freshness-bounded approval evidence produced by CAT PRO's canonical RiskEngine for the exact V22.6 basis-risk assessment and route identity.",
  "The strategy controller never calls or bypasses RiskEngine directly; missing, stale, ambiguous or structurally invalid assessment evidence fails closed.",
  "RiskEngine approval remains read-only SHADOW evidence, not capital reservation, a StrategyIntent, PAPER/LIVE eligibility or an order instruction.",
] as const;

const SAFETY = {
  canonicalRiskEngineEvidenceOnly: true,
  strategyCallsRiskEngineDirectly: false,
  approvalIsExecutionAuthorization: false,
  capitalReserved: false,
  hedgeIntentGenerationAllowed: false,
  recursiveHedgeAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryRiskApprovalEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    basisRisk: HedgeInventoryBasisRiskSnapshot,
    evidence: HedgeInventoryRiskApprovalEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryRiskApprovalSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        basisRisk,
        evidence,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        basisRisk,
        evidence,
        now,
        globalBlocker,
      );
    }

    const assessments =
      basisRisk.assessments.map(
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
          assessment.sourceAssessmentAssessedAt !== null,
      );

    const observedScores =
      matched
        .map(
          (assessment) => assessment.riskScore,
        )
        .filter(
          (score): score is number => score !== null,
        );

    return immutableClone({
      version: "22.7",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      basisRiskConfigurationState: configuration.basisRisk.state,
      riskApprovalConfigurationState: configuration.riskApproval.state,
      sourceBasisRiskGeneratedAt: basisRisk.generatedAt,
      sourceRiskApprovalEvidenceGeneratedAt: evidence!.generatedAt,
      thresholds: {
        maximumAssessmentAgeMs:
          configuration.riskApproval.maximumAssessmentAgeMs!,
      },
      summary: {
        basisRiskPassingRoutes: basisRisk.assessments.filter(
          (assessment) => assessment.state === "RISK_PASS",
        ).length,
        evidenceRecordsMatched: matched.length,
        riskApprovalsGranted: assessments.filter(
          (assessment) => assessment.state === "RISK_APPROVED",
        ).length,
        riskRejections: assessments.filter(
          (assessment) => assessment.state === "RISK_REJECTED",
        ).length,
        blockedRoutes: assessments.filter(
          (assessment) => assessment.state === "BLOCKED",
        ).length,
        minimumObservedRiskScore:
          observedScores.length > 0
            ? round(Math.min(...observedScores))
            : null,
        actionableRoutes: 0,
        capitalReservations: 0,
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
    assessment: HedgeInventoryBasisRiskAssessment,
    evidence: HedgeInventoryRiskApprovalEvidenceSnapshot,
    now: number,
  ): HedgeInventoryRiskApprovalAssessment {
    const common = {
      id: `${assessment.id}:risk-approval`,
      basisRiskAssessmentId: assessment.id,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      side: assessment.side,
      venue: assessment.venue,
      market: assessment.market,
      sourceBasisRiskState: assessment.state,
      hedgeQuantity: assessment.hedgeQuantity,
      hedgeVwapPrice: assessment.hedgeVwapPrice,
      executionAuthorized: false as const,
      actionable: false as const,
      capitalReserved: false as const,
      intentGenerated: false as const,
    };

    if (assessment.state === "NOT_APPLICABLE") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        sourceAssessmentAssessedAt: null,
        assessmentAgeMs: null,
        evidenceSource: null,
        riskLevel: null,
        riskScore: null,
        riskChecks: null,
        reasons: [],
        warnings: [],
        blockers: [],
        remainingGates: [],
        riskApprovalGranted: false,
      };
    }

    if (assessment.state !== "RISK_PASS") {
      return this.blockedAssessment(
        common,
        "BASIS_RISK_NOT_PASSED",
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
          record.basisRiskAssessmentId === assessment.id &&
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
        "RISK_ASSESSMENT_NOT_FOUND",
      );
    }

    if (matches.length > 1) {
      return this.blockedAssessment(
        common,
        "AMBIGUOUS_RISK_ASSESSMENT",
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
    common: RiskApprovalAssessmentCommon,
    evidence: HedgeInventoryRiskApprovalEvidence,
    configuration: HedgeInventoryManagementConfiguration,
    now: number,
  ): HedgeInventoryRiskApprovalAssessment {
    const blockers:
      HedgeInventoryRiskApprovalAssessmentBlocker[] =
      [];

    if (evidence.source !== "CANONICAL_RISK_ENGINE") {
      blockers.push(
        "INVALID_ASSESSMENT_SOURCE",
      );
    }

    let assessmentAgeMs:
      number | null =
      null;

    if (
      !Number.isFinite(evidence.assessedAt) ||
      evidence.assessedAt <= 0
    ) {
      blockers.push(
        "INVALID_ASSESSMENT_TIMESTAMP",
      );
    } else if (evidence.assessedAt > now) {
      blockers.push(
        "ASSESSMENT_FROM_FUTURE",
      );
    } else {
      assessmentAgeMs =
        now - evidence.assessedAt;

      if (
        assessmentAgeMs >
          configuration.riskApproval.maximumAssessmentAgeMs!
      ) {
        blockers.push(
          "ASSESSMENT_STALE",
        );
      }
    }

    const riskAssessmentValid =
      isRiskAssessment(
        evidence.assessment,
      );

    if (!riskAssessmentValid) {
      blockers.push(
        "INVALID_RISK_ASSESSMENT",
      );
    }

    const uniqueBlockers = [
      ...new Set(blockers),
    ];

    if (uniqueBlockers.length > 0) {
      return {
        ...common,
        evidenceStatus: "NO_DATA",
        state: "BLOCKED",
        sourceAssessmentAssessedAt:
          Number.isFinite(evidence.assessedAt)
            ? evidence.assessedAt
            : null,
        assessmentAgeMs,
        evidenceSource: evidence.source,
        riskLevel: null,
        riskScore: null,
        riskChecks: null,
        reasons: [],
        warnings: [],
        blockers: uniqueBlockers,
        remainingGates: [],
        riskApprovalGranted: false,
      };
    }

    const approved =
      evidence.assessment.approved;

    return {
      ...common,
      evidenceStatus: "AVAILABLE",
      state:
        approved
          ? "RISK_APPROVED"
          : "RISK_REJECTED",
      sourceAssessmentAssessedAt: evidence.assessedAt,
      assessmentAgeMs,
      evidenceSource: evidence.source,
      riskLevel: evidence.assessment.level,
      riskScore: round(evidence.assessment.score),
      riskChecks: evidence.assessment.checks,
      reasons: evidence.assessment.reasons,
      warnings: evidence.assessment.warnings,
      blockers:
        approved
          ? []
          : [
              "RISK_ENGINE_REJECTED",
            ],
      remainingGates:
        approved
          ? REMAINING_GATES
          : [],
      riskApprovalGranted: approved,
    };
  }

  private blockedAssessment(
    common: RiskApprovalAssessmentCommon,
    blocker: HedgeInventoryRiskApprovalAssessmentBlocker,
  ): HedgeInventoryRiskApprovalAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      sourceAssessmentAssessedAt: null,
      assessmentAgeMs: null,
      evidenceSource: null,
      riskLevel: null,
      riskScore: null,
      riskChecks: null,
      reasons: [],
      warnings: [],
      blockers: [
        blocker,
      ],
      remainingGates: [],
      riskApprovalGranted: false,
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    basisRisk: HedgeInventoryBasisRiskSnapshot,
    evidence: HedgeInventoryRiskApprovalEvidenceSnapshot | null,
    now: number,
  ): HedgeInventoryRiskApprovalGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.basisRisk.state !== "READY") {
      return "BASIS_RISK_CONFIGURATION_NOT_READY";
    }
    if (configuration.riskApproval.state !== "READY") {
      return "RISK_APPROVAL_CONFIGURATION_NOT_READY";
    }
    if (basisRisk.evidenceStatus !== "AVAILABLE") {
      return "BASIS_RISK_EVIDENCE_UNAVAILABLE";
    }
    if (evidence === null) {
      return "RISK_APPROVAL_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(evidence.generatedAt) ||
      evidence.generatedAt <= 0
    ) {
      return "INVALID_RISK_APPROVAL_SNAPSHOT_TIMESTAMP";
    }
    if (evidence.generatedAt > now) {
      return "RISK_APPROVAL_SNAPSHOT_FROM_FUTURE";
    }
    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    basisRisk: HedgeInventoryBasisRiskSnapshot,
    evidence: HedgeInventoryRiskApprovalEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryRiskApprovalGlobalBlocker,
  ): HedgeInventoryRiskApprovalSnapshot {
    return immutableClone({
      version: "22.7",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      basisRiskConfigurationState: configuration.basisRisk.state,
      riskApprovalConfigurationState: configuration.riskApproval.state,
      sourceBasisRiskGeneratedAt: basisRisk.generatedAt,
      sourceRiskApprovalEvidenceGeneratedAt: evidence?.generatedAt ?? null,
      thresholds: {
        maximumAssessmentAgeMs:
          configuration.riskApproval.maximumAssessmentAgeMs ?? 0,
      },
      summary: {
        basisRiskPassingRoutes: 0,
        evidenceRecordsMatched: 0,
        riskApprovalsGranted: 0,
        riskRejections: 0,
        blockedRoutes: configuration.assetAllowlist.length,
        minimumObservedRiskScore: null,
        actionableRoutes: 0,
        capitalReservations: 0,
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
        "Hedge risk-approval timestamp must be a positive finite number.",
      );
    }
  }
}

type RiskApprovalAssessmentCommon =
  Pick<
    HedgeInventoryRiskApprovalAssessment,
    | "id"
    | "basisRiskAssessmentId"
    | "routeId"
    | "asset"
    | "quoteAsset"
    | "side"
    | "venue"
    | "market"
    | "sourceBasisRiskState"
    | "hedgeQuantity"
    | "hedgeVwapPrice"
    | "executionAuthorized"
    | "actionable"
    | "capitalReserved"
    | "intentGenerated"
  >;

function isRiskAssessment(
  value: unknown,
): value is RiskAssessment {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate =
    value as Partial<RiskAssessment>;

  return (
    typeof candidate.approved === "boolean" &&
    isRiskLevel(candidate.level) &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    candidate.score >= 0 &&
    candidate.score <= 100 &&
    isStringArray(candidate.reasons) &&
    isStringArray(candidate.warnings) &&
    isRiskAssessmentChecks(candidate.checks)
  );
}

function isRiskLevel(
  value: unknown,
): value is RiskLevel {
  return (
    value === "LOW" ||
    value === "MEDIUM" ||
    value === "HIGH" ||
    value === "BLOCKED"
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

function isRiskAssessmentChecks(
  value: unknown,
): value is RiskAssessmentChecks {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate =
    value as Partial<RiskAssessmentChecks>;

  return [
    candidate.marketIntegrity,
    candidate.executionQuality,
    candidate.capitalAvailable,
    candidate.exposureAllowed,
    candidate.dailyLimitsAllowed,
  ].every(
    (check) => typeof check === "boolean",
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

