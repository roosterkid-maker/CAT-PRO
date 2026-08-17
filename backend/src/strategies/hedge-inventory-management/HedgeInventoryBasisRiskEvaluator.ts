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
  HedgeInventoryPostRuleEconomicsAssessment,
  HedgeInventoryPostRuleEconomicsSnapshot,
} from "./HedgeInventoryPostRuleEconomicsEvaluator";

export type HedgeInventoryBasisRiskEvidenceSourceKind =
  "SYNCHRONIZED_RETURN_SERIES";

export interface HedgeInventoryBasisRiskEvidence {
  readonly venue: string;
  readonly market: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly observedAt: number;
  readonly referencePrice: number;
  readonly correlationCoefficient: number;
  readonly correlationObservations: number;
  readonly correlationWindowMs: number;
  readonly source: HedgeInventoryBasisRiskEvidenceSourceKind;
}

export interface HedgeInventoryBasisRiskEvidenceSnapshot {
  readonly generatedAt: number;
  readonly records: readonly HedgeInventoryBasisRiskEvidence[];
}

export interface HedgeInventoryBasisRiskEvidenceSource {
  getBasisRiskEvidence(
    now?: number,
  ): HedgeInventoryBasisRiskEvidenceSnapshot | null;
}

export type HedgeInventoryBasisRiskAssessmentBlocker =
  | "POST_RULE_ECONOMICS_NOT_REVALIDATED"
  | "ROUTE_IDENTITY_UNAVAILABLE"
  | "BASIS_RISK_EVIDENCE_NOT_FOUND"
  | "AMBIGUOUS_BASIS_RISK_EVIDENCE"
  | "INVALID_EVIDENCE_TIMESTAMP"
  | "INVALID_EVIDENCE_SOURCE"
  | "EVIDENCE_FROM_FUTURE"
  | "EVIDENCE_STALE"
  | "INVALID_REFERENCE_PRICE"
  | "INVALID_HEDGE_PRICE"
  | "INVALID_CORRELATION_COEFFICIENT"
  | "INVALID_CORRELATION_WINDOW"
  | "INVALID_CORRELATION_OBSERVATIONS"
  | "INSUFFICIENT_CORRELATION_OBSERVATIONS"
  | "BASIS_DEVIATION_LIMIT_EXCEEDED"
  | "CORRELATION_BELOW_MINIMUM";

export type HedgeInventoryBasisRiskGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "POST_RULE_ECONOMICS_CONFIGURATION_NOT_READY"
  | "BASIS_RISK_CONFIGURATION_NOT_READY"
  | "POST_RULE_ECONOMICS_EVIDENCE_UNAVAILABLE"
  | "BASIS_RISK_EVIDENCE_UNAVAILABLE"
  | "INVALID_BASIS_RISK_SNAPSHOT_TIMESTAMP"
  | "BASIS_RISK_SNAPSHOT_FROM_FUTURE";

export type HedgeInventoryPostBasisRiskGate =
  | "RISK_APPROVAL_NOT_EVALUATED"
  | "CAPITAL_NOT_RESERVED"
  | "STRATEGY_INTENT_NOT_GENERATED";

export interface HedgeInventoryBasisRiskAssessment {
  readonly id: string;
  readonly postRuleEconomicsAssessmentId: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryPostRuleEconomicsAssessment["side"];
  readonly venue: string | null;
  readonly market: string | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "RISK_PASS"
    | "RISK_REJECTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourcePostRuleEconomicsState: HedgeInventoryPostRuleEconomicsAssessment["state"];
  readonly sourceEvidenceObservedAt: number | null;
  readonly evidenceAgeMs: number | null;
  readonly hedgeQuantity: number | null;
  readonly hedgeVwapPrice: number | null;
  readonly referencePrice: number | null;
  readonly signedBasisDeviationPercent: number | null;
  readonly absoluteBasisDeviationPercent: number | null;
  readonly maximumBasisDeviationPercent: number;
  readonly correlationCoefficient: number | null;
  readonly minimumCorrelationCoefficient: number;
  readonly correlationObservations: number | null;
  readonly minimumCorrelationObservations: number;
  readonly correlationWindowMs: number | null;
  readonly evidenceSource: HedgeInventoryBasisRiskEvidenceSourceKind | null;
  readonly blockers: readonly HedgeInventoryBasisRiskAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostBasisRiskGate[];
  readonly riskApprovalGranted: false;
  readonly executionAuthorized: false;
  readonly actionable: false;
  readonly intentGenerated: false;
}

export interface HedgeInventoryBasisRiskSnapshot {
  readonly version: "22.6";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly postRuleEconomicsConfigurationState: string;
  readonly basisRiskConfigurationState: string;
  readonly sourcePostRuleEconomicsGeneratedAt: number | null;
  readonly sourceBasisRiskEvidenceGeneratedAt: number | null;
  readonly thresholds: {
    readonly maximumEvidenceAgeMs: number;
    readonly maximumBasisDeviationPercent: number;
    readonly minimumCorrelationCoefficient: number;
    readonly minimumCorrelationObservations: number;
  };
  readonly summary: {
    readonly revalidatedRoutes: number;
    readonly evidenceRecordsMatched: number;
    readonly riskPassingRoutes: number;
    readonly riskRejectedRoutes: number;
    readonly blockedRoutes: number;
    readonly maximumObservedBasisDeviationPercent: number | null;
    readonly minimumObservedCorrelationCoefficient: number | null;
    readonly actionableRoutes: 0;
    readonly riskApprovalsGranted: 0;
    readonly intentsGenerated: 0;
  };
  readonly assessments: readonly HedgeInventoryBasisRiskAssessment[];
  readonly blockers: readonly HedgeInventoryBasisRiskGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly readOnlyBasisCorrelationEvidence: true;
    readonly screenIsRiskEngineApproval: false;
    readonly riskApprovalGranted: false;
    readonly capitalReserved: false;
    readonly hedgeIntentGenerationAllowed: false;
    readonly recursiveHedgeAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const REMAINING_GATES = [
  "RISK_APPROVAL_NOT_EVALUATED",
  "CAPITAL_NOT_RESERVED",
  "STRATEGY_INTENT_NOT_GENERATED",
] as const satisfies readonly HedgeInventoryPostBasisRiskGate[];

const NOTES = [
  "V22.6 evaluates basis deviation and synchronized-return correlation only from explicit, freshness-bounded evidence matched to the V22.5-selected venue and market.",
  "Correlation is never inferred from matching asset symbols, advertised prices or a single observation.",
  "A passing basis/correlation screen is read-only SHADOW evidence, not RiskEngine approval, capital reservation, a StrategyIntent, PAPER/LIVE eligibility or an order instruction.",
] as const;

const SAFETY = {
  readOnlyBasisCorrelationEvidence: true,
  screenIsRiskEngineApproval: false,
  riskApprovalGranted: false,
  capitalReserved: false,
  hedgeIntentGenerationAllowed: false,
  recursiveHedgeAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryBasisRiskEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    postRuleEconomics: HedgeInventoryPostRuleEconomicsSnapshot,
    evidence: HedgeInventoryBasisRiskEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryBasisRiskSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        postRuleEconomics,
        evidence,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        postRuleEconomics,
        evidence,
        now,
        globalBlocker,
      );
    }

    const assessments =
      postRuleEconomics.assessments.map(
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

    const observedBasis =
      matched
        .map(
          (assessment) => assessment.absoluteBasisDeviationPercent,
        )
        .filter(
          (value): value is number => value !== null,
        );

    const observedCorrelations =
      matched
        .map(
          (assessment) => assessment.correlationCoefficient,
        )
        .filter(
          (value): value is number => value !== null,
        );

    return immutableClone({
      version: "22.6",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      postRuleEconomicsConfigurationState: configuration.postRuleEconomics.state,
      basisRiskConfigurationState: configuration.basisRisk.state,
      sourcePostRuleEconomicsGeneratedAt: postRuleEconomics.generatedAt,
      sourceBasisRiskEvidenceGeneratedAt: evidence!.generatedAt,
      thresholds: this.thresholds(configuration),
      summary: {
        revalidatedRoutes: postRuleEconomics.assessments.filter(
          (assessment) => assessment.state === "REVALIDATED",
        ).length,
        evidenceRecordsMatched: matched.length,
        riskPassingRoutes: assessments.filter(
          (assessment) => assessment.state === "RISK_PASS",
        ).length,
        riskRejectedRoutes: assessments.filter(
          (assessment) => assessment.state === "RISK_REJECTED",
        ).length,
        blockedRoutes: assessments.filter(
          (assessment) => assessment.state === "BLOCKED",
        ).length,
        maximumObservedBasisDeviationPercent:
          observedBasis.length > 0
            ? round(Math.max(...observedBasis))
            : null,
        minimumObservedCorrelationCoefficient:
          observedCorrelations.length > 0
            ? round(Math.min(...observedCorrelations))
            : null,
        actionableRoutes: 0,
        riskApprovalsGranted: 0,
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
    assessment: HedgeInventoryPostRuleEconomicsAssessment,
    evidence: HedgeInventoryBasisRiskEvidenceSnapshot,
    now: number,
  ): HedgeInventoryBasisRiskAssessment {
    const common = {
      id: `${assessment.id}:basis-risk`,
      postRuleEconomicsAssessmentId: assessment.id,
      routeId: assessment.routeId,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      side: assessment.side,
      venue: assessment.venue,
      market: assessment.market,
      sourcePostRuleEconomicsState: assessment.state,
      hedgeQuantity: assessment.quantizedQuantity,
      maximumBasisDeviationPercent:
        configuration.basisRisk.maximumBasisDeviationPercent!,
      minimumCorrelationCoefficient:
        configuration.basisRisk.minimumCorrelationCoefficient!,
      minimumCorrelationObservations:
        configuration.basisRisk.minimumCorrelationObservations!,
      riskApprovalGranted: false as const,
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
        hedgeVwapPrice: null,
        referencePrice: null,
        signedBasisDeviationPercent: null,
        absoluteBasisDeviationPercent: null,
        correlationCoefficient: null,
        correlationObservations: null,
        correlationWindowMs: null,
        evidenceSource: null,
        blockers: [],
        remainingGates: [],
      };
    }

    if (assessment.state !== "REVALIDATED") {
      return this.blockedAssessment(
        common,
        assessment.revalidatedEconomics.vwapPrice,
        "POST_RULE_ECONOMICS_NOT_REVALIDATED",
      );
    }

    if (
      assessment.venue === null ||
      assessment.market === null ||
      assessment.side === "NONE"
    ) {
      return this.blockedAssessment(
        common,
        assessment.revalidatedEconomics.vwapPrice,
        "ROUTE_IDENTITY_UNAVAILABLE",
      );
    }

    const matches =
      evidence.records.filter(
        (record) =>
          record.venue === assessment.venue &&
          record.market === assessment.market &&
          record.asset === assessment.asset &&
          record.quoteAsset === assessment.quoteAsset,
      );

    if (matches.length === 0) {
      return this.blockedAssessment(
        common,
        assessment.revalidatedEconomics.vwapPrice,
        "BASIS_RISK_EVIDENCE_NOT_FOUND",
      );
    }

    if (matches.length > 1) {
      return this.blockedAssessment(
        common,
        assessment.revalidatedEconomics.vwapPrice,
        "AMBIGUOUS_BASIS_RISK_EVIDENCE",
      );
    }

    return this.evaluateMatchedEvidence(
      common,
      assessment.revalidatedEconomics.vwapPrice,
      matches[0]!,
      configuration,
      now,
    );
  }

  private evaluateMatchedEvidence(
    common: BasisRiskAssessmentCommon,
    hedgeVwapPrice: number | null,
    evidence: HedgeInventoryBasisRiskEvidence,
    configuration: HedgeInventoryManagementConfiguration,
    now: number,
  ): HedgeInventoryBasisRiskAssessment {
    const blockers:
      HedgeInventoryBasisRiskAssessmentBlocker[] =
      [];

    if (
      evidence.source !== "SYNCHRONIZED_RETURN_SERIES"
    ) {
      blockers.push(
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
      blockers.push(
        "INVALID_EVIDENCE_TIMESTAMP",
      );
    } else if (evidence.observedAt > now) {
      blockers.push(
        "EVIDENCE_FROM_FUTURE",
      );
    } else {
      evidenceAgeMs =
        now - evidence.observedAt;

      if (
        evidenceAgeMs > configuration.basisRisk.maximumEvidenceAgeMs!
      ) {
        blockers.push(
          "EVIDENCE_STALE",
        );
      }
    }

    if (
      !Number.isFinite(evidence.referencePrice) ||
      evidence.referencePrice <= 0
    ) {
      blockers.push(
        "INVALID_REFERENCE_PRICE",
      );
    }

    if (
      hedgeVwapPrice === null ||
      !Number.isFinite(hedgeVwapPrice) ||
      hedgeVwapPrice <= 0
    ) {
      blockers.push(
        "INVALID_HEDGE_PRICE",
      );
    }

    if (
      !Number.isFinite(evidence.correlationCoefficient) ||
      evidence.correlationCoefficient < -1 ||
      evidence.correlationCoefficient > 1
    ) {
      blockers.push(
        "INVALID_CORRELATION_COEFFICIENT",
      );
    }

    if (
      !Number.isSafeInteger(evidence.correlationWindowMs) ||
      evidence.correlationWindowMs <= 0
    ) {
      blockers.push(
        "INVALID_CORRELATION_WINDOW",
      );
    }

    if (
      !Number.isSafeInteger(evidence.correlationObservations) ||
      evidence.correlationObservations <= 0
    ) {
      blockers.push(
        "INVALID_CORRELATION_OBSERVATIONS",
      );
    } else if (
      evidence.correlationObservations <
        configuration.basisRisk.minimumCorrelationObservations!
    ) {
      blockers.push(
        "INSUFFICIENT_CORRELATION_OBSERVATIONS",
      );
    }

    const pricesValid =
      !blockers.includes("INVALID_REFERENCE_PRICE") &&
      !blockers.includes("INVALID_HEDGE_PRICE");

    const signedBasisDeviationPercent =
      pricesValid
        ? (
            hedgeVwapPrice! - evidence.referencePrice
          ) /
          evidence.referencePrice *
          100
        : null;

    const absoluteBasisDeviationPercent =
      signedBasisDeviationPercent === null
        ? null
        : Math.abs(
            signedBasisDeviationPercent,
          );

    if (
      absoluteBasisDeviationPercent !== null &&
      absoluteBasisDeviationPercent >
        configuration.basisRisk.maximumBasisDeviationPercent!
    ) {
      blockers.push(
        "BASIS_DEVIATION_LIMIT_EXCEEDED",
      );
    }

    if (
      !blockers.includes("INVALID_CORRELATION_COEFFICIENT") &&
      evidence.correlationCoefficient <
        configuration.basisRisk.minimumCorrelationCoefficient!
    ) {
      blockers.push(
        "CORRELATION_BELOW_MINIMUM",
      );
    }

    const uniqueBlockers = [
      ...new Set(blockers),
    ];

    const evidenceInvalid =
      uniqueBlockers.some(
        (blocker) =>
          blocker !== "BASIS_DEVIATION_LIMIT_EXCEEDED" &&
          blocker !== "CORRELATION_BELOW_MINIMUM",
      );

    return {
      ...common,
      evidenceStatus:
        evidenceInvalid
          ? "NO_DATA"
          : "AVAILABLE",
      state:
        evidenceInvalid
          ? "BLOCKED"
          : uniqueBlockers.length > 0
            ? "RISK_REJECTED"
            : "RISK_PASS",
      sourceEvidenceObservedAt: evidence.observedAt,
      evidenceAgeMs,
      hedgeVwapPrice,
      referencePrice:
        Number.isFinite(evidence.referencePrice)
          ? evidence.referencePrice
          : null,
      signedBasisDeviationPercent:
        signedBasisDeviationPercent === null
          ? null
          : round(signedBasisDeviationPercent),
      absoluteBasisDeviationPercent:
        absoluteBasisDeviationPercent === null
          ? null
          : round(absoluteBasisDeviationPercent),
      correlationCoefficient:
        Number.isFinite(evidence.correlationCoefficient)
          ? evidence.correlationCoefficient
          : null,
      correlationObservations:
        Number.isSafeInteger(evidence.correlationObservations)
          ? evidence.correlationObservations
          : null,
      correlationWindowMs:
        Number.isSafeInteger(evidence.correlationWindowMs)
          ? evidence.correlationWindowMs
          : null,
      evidenceSource: evidence.source,
      blockers: uniqueBlockers,
      remainingGates:
        uniqueBlockers.length === 0
          ? REMAINING_GATES
          : [],
    };
  }

  private blockedAssessment(
    common: BasisRiskAssessmentCommon,
    hedgeVwapPrice: number | null,
    blocker: HedgeInventoryBasisRiskAssessmentBlocker,
  ): HedgeInventoryBasisRiskAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      sourceEvidenceObservedAt: null,
      evidenceAgeMs: null,
      hedgeVwapPrice,
      referencePrice: null,
      signedBasisDeviationPercent: null,
      absoluteBasisDeviationPercent: null,
      correlationCoefficient: null,
      correlationObservations: null,
      correlationWindowMs: null,
      evidenceSource: null,
      blockers: [blocker],
      remainingGates: [],
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    postRuleEconomics: HedgeInventoryPostRuleEconomicsSnapshot,
    evidence: HedgeInventoryBasisRiskEvidenceSnapshot | null,
    now: number,
  ): HedgeInventoryBasisRiskGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.postRuleEconomics.state !== "READY") {
      return "POST_RULE_ECONOMICS_CONFIGURATION_NOT_READY";
    }
    if (configuration.basisRisk.state !== "READY") {
      return "BASIS_RISK_CONFIGURATION_NOT_READY";
    }
    if (postRuleEconomics.evidenceStatus !== "AVAILABLE") {
      return "POST_RULE_ECONOMICS_EVIDENCE_UNAVAILABLE";
    }
    if (evidence === null) {
      return "BASIS_RISK_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(evidence.generatedAt) ||
      evidence.generatedAt <= 0
    ) {
      return "INVALID_BASIS_RISK_SNAPSHOT_TIMESTAMP";
    }
    if (evidence.generatedAt > now) {
      return "BASIS_RISK_SNAPSHOT_FROM_FUTURE";
    }
    return null;
  }

  private thresholds(
    configuration: HedgeInventoryManagementConfiguration,
  ): HedgeInventoryBasisRiskSnapshot["thresholds"] {
    return {
      maximumEvidenceAgeMs: configuration.basisRisk.maximumEvidenceAgeMs!,
      maximumBasisDeviationPercent: configuration.basisRisk.maximumBasisDeviationPercent!,
      minimumCorrelationCoefficient: configuration.basisRisk.minimumCorrelationCoefficient!,
      minimumCorrelationObservations: configuration.basisRisk.minimumCorrelationObservations!,
    };
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    postRuleEconomics: HedgeInventoryPostRuleEconomicsSnapshot,
    evidence: HedgeInventoryBasisRiskEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryBasisRiskGlobalBlocker,
  ): HedgeInventoryBasisRiskSnapshot {
    return immutableClone({
      version: "22.6",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      postRuleEconomicsConfigurationState: configuration.postRuleEconomics.state,
      basisRiskConfigurationState: configuration.basisRisk.state,
      sourcePostRuleEconomicsGeneratedAt: postRuleEconomics.generatedAt,
      sourceBasisRiskEvidenceGeneratedAt: evidence?.generatedAt ?? null,
      thresholds: {
        maximumEvidenceAgeMs: configuration.basisRisk.maximumEvidenceAgeMs ?? 0,
        maximumBasisDeviationPercent: configuration.basisRisk.maximumBasisDeviationPercent ?? 0,
        minimumCorrelationCoefficient: configuration.basisRisk.minimumCorrelationCoefficient ?? 0,
        minimumCorrelationObservations: configuration.basisRisk.minimumCorrelationObservations ?? 0,
      },
      summary: {
        revalidatedRoutes: 0,
        evidenceRecordsMatched: 0,
        riskPassingRoutes: 0,
        riskRejectedRoutes: 0,
        blockedRoutes: configuration.assetAllowlist.length,
        maximumObservedBasisDeviationPercent: null,
        minimumObservedCorrelationCoefficient: null,
        actionableRoutes: 0,
        riskApprovalsGranted: 0,
        intentsGenerated: 0,
      },
      assessments: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error(
        "Hedge basis-risk timestamp must be a positive finite number.",
      );
    }
  }
}

type BasisRiskAssessmentCommon =
  Pick<
    HedgeInventoryBasisRiskAssessment,
    | "id"
    | "postRuleEconomicsAssessmentId"
    | "routeId"
    | "asset"
    | "quoteAsset"
    | "side"
    | "venue"
    | "market"
    | "sourcePostRuleEconomicsState"
    | "hedgeQuantity"
    | "maximumBasisDeviationPercent"
    | "minimumCorrelationCoefficient"
    | "minimumCorrelationObservations"
    | "riskApprovalGranted"
    | "executionAuthorized"
    | "actionable"
    | "intentGenerated"
  >;

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

