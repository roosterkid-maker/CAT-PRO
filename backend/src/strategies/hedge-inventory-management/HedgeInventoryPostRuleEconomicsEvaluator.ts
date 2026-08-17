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
  HedgeInventoryMarketRuleAssessment,
  HedgeInventoryMarketRuleSnapshot,
} from "./HedgeInventoryMarketRuleEvaluator";

import {
  HedgeInventoryRouteEconomicsEvaluator,
} from "./HedgeInventoryRouteEconomicsEvaluator";

import type {
  HedgeInventoryRouteCandidate,
  HedgeInventoryRouteCandidateBlocker,
  HedgeInventoryRouteEconomicsSnapshot,
  HedgeInventoryRouteEvidenceSnapshot,
} from "./HedgeInventoryRouteEconomicsEvaluator";

export type HedgeInventoryPostRuleEconomicsAssessmentBlocker =
  | "MARKET_RULES_NOT_PASSED"
  | "QUANTIZED_QUANTITY_INVALID"
  | "SELECTED_ROUTE_UNAVAILABLE"
  | "ROUTE_EVIDENCE_NOT_FOUND"
  | "AMBIGUOUS_ROUTE_EVIDENCE"
  | "ECONOMICS_REVALIDATION_REJECTED";

export type HedgeInventoryPostRuleEconomicsGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "ROUTE_ECONOMICS_CONFIGURATION_NOT_READY"
  | "MARKET_RULE_CONFIGURATION_NOT_READY"
  | "POST_RULE_ECONOMICS_CONFIGURATION_NOT_READY"
  | "HEDGE_ROUTE_EVIDENCE_UNAVAILABLE"
  | "MARKET_RULE_EVIDENCE_UNAVAILABLE"
  | "ROUTE_EVIDENCE_UNAVAILABLE"
  | "INVALID_ROUTE_EVIDENCE_TIMESTAMP"
  | "ROUTE_EVIDENCE_FROM_FUTURE";

export type HedgeInventoryPostRuleEconomicsRemainingGate =
  | "BASIS_CORRELATION_RISK_NOT_EVALUATED"
  | "RISK_APPROVAL_NOT_EVALUATED"
  | "CAPITAL_NOT_RESERVED"
  | "STRATEGY_INTENT_NOT_GENERATED";

export interface HedgeInventoryPostRuleEconomicsAssessment {
  readonly id: string;
  readonly routeId: string;
  readonly marketRuleAssessmentId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryMarketRuleAssessment["side"];
  readonly venue: string | null;
  readonly market: string | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "REVALIDATED"
    | "REJECTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceMarketRuleState: HedgeInventoryMarketRuleAssessment["state"];
  readonly originalTargetQuantity: number | null;
  readonly quantizedQuantity: number | null;
  readonly quantityChanged: boolean | null;
  readonly originalEconomics: {
    readonly vwapPrice: number | null;
    readonly estimatedFeeQuoteValue: number | null;
    readonly estimatedSlippageQuoteValue: number | null;
    readonly modeledAllInQuoteValue: number | null;
  };
  readonly revalidatedEconomics: {
    readonly requestedQuantity: number | null;
    readonly vwapPrice: number | null;
    readonly executableQuantity: number | null;
    readonly estimatedFeeQuoteValue: number | null;
    readonly estimatedSlippageQuoteValue: number | null;
    readonly modeledAllInQuoteValue: number | null;
  };
  readonly candidateBlockers: readonly HedgeInventoryRouteCandidateBlocker[];
  readonly blockers: readonly HedgeInventoryPostRuleEconomicsAssessmentBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostRuleEconomicsRemainingGate[];
  readonly executionAuthorized: false;
  readonly actionable: false;
  readonly intentGenerated: false;
}

export interface HedgeInventoryPostRuleEconomicsSnapshot {
  readonly version: "22.5";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly routeEconomicsConfigurationState: string;
  readonly marketRuleConfigurationState: string;
  readonly postRuleEconomicsConfigurationState: string;
  readonly sourceRouteGeneratedAt: number | null;
  readonly sourceMarketRuleGeneratedAt: number | null;
  readonly sourceRouteEvidenceGeneratedAt: number | null;
  readonly summary: {
    readonly marketRuleAssessments: number;
    readonly routesRequiringRevalidation: number;
    readonly routesRevalidated: number;
    readonly routesRejected: number;
    readonly blockedRoutes: number;
    readonly changedQuantityRoutes: number;
    readonly revalidatedFeeQuoteValue: number | null;
    readonly revalidatedSlippageQuoteValue: number | null;
    readonly actionableRoutes: 0;
    readonly intentsGenerated: 0;
  };
  readonly assessments: readonly HedgeInventoryPostRuleEconomicsAssessment[];
  readonly blockers: readonly HedgeInventoryPostRuleEconomicsGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly readOnlyRevalidationEvidence: true;
    readonly revalidationIsExecutionApproval: false;
    readonly basisCorrelationRiskEvaluated: false;
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
  "BASIS_CORRELATION_RISK_NOT_EVALUATED",
  "RISK_APPROVAL_NOT_EVALUATED",
  "CAPITAL_NOT_RESERVED",
  "STRATEGY_INTENT_NOT_GENERATED",
] as const satisfies readonly HedgeInventoryPostRuleEconomicsRemainingGate[];

const NOTES = [
  "V22.5 re-runs full-depth VWAP, taker-fee, freshness and slippage checks for the exact V22.4-quantized quantity on the already selected SHADOW route.",
  "Revalidation uses a fresh immutable route-evidence snapshot and never switches venue or market silently.",
  "Passing revalidation is not risk approval, capital reservation, a StrategyIntent, PAPER eligibility, LIVE eligibility or an order instruction.",
] as const;

const SAFETY = {
  readOnlyRevalidationEvidence: true,
  revalidationIsExecutionApproval: false,
  basisCorrelationRiskEvaluated: false,
  riskApprovalGranted: false,
  capitalReserved: false,
  hedgeIntentGenerationAllowed: false,
  recursiveHedgeAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

const EMPTY_ORIGINAL_ECONOMICS = {
  vwapPrice: null,
  estimatedFeeQuoteValue: null,
  estimatedSlippageQuoteValue: null,
  modeledAllInQuoteValue: null,
} as const;

const EMPTY_REVALIDATED_ECONOMICS = {
  requestedQuantity: null,
  vwapPrice: null,
  executableQuantity: null,
  estimatedFeeQuoteValue: null,
  estimatedSlippageQuoteValue: null,
  modeledAllInQuoteValue: null,
} as const;

export class HedgeInventoryPostRuleEconomicsEvaluator {
  constructor(
    private readonly routeEconomicsEvaluator:
      HedgeInventoryRouteEconomicsEvaluator =
        new HedgeInventoryRouteEconomicsEvaluator(),
  ) {}

  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    routes: HedgeInventoryRouteEconomicsSnapshot,
    marketRules: HedgeInventoryMarketRuleSnapshot,
    routeEvidence: HedgeInventoryRouteEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryPostRuleEconomicsSnapshot {
    this.validateNow(now);

    const globalBlocker =
      this.resolveGlobalBlocker(
        configuration,
        routes,
        marketRules,
        routeEvidence,
        now,
      );

    if (globalBlocker !== null) {
      return this.unavailable(
        configuration,
        routes,
        marketRules,
        routeEvidence,
        now,
        globalBlocker,
      );
    }

    const assessments =
      marketRules.assessments.map(
        (assessment) =>
          this.evaluateAssessment(
            configuration,
            routes,
            assessment,
            routeEvidence!,
            now,
          ),
      );

    const revalidated =
      assessments.filter(
        (assessment) =>
          assessment.state === "REVALIDATED",
      );

    return immutableClone({
      version: "22.5",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus:
        assessments.length > 0
          ? "AVAILABLE"
          : "NO_DATA",
      configurationState: configuration.state,
      routeEconomicsConfigurationState: configuration.routeEconomics.state,
      marketRuleConfigurationState: configuration.marketRules.state,
      postRuleEconomicsConfigurationState: configuration.postRuleEconomics.state,
      sourceRouteGeneratedAt: routes.generatedAt,
      sourceMarketRuleGeneratedAt: marketRules.generatedAt,
      sourceRouteEvidenceGeneratedAt: routeEvidence!.generatedAt,
      summary: {
        marketRuleAssessments: assessments.length,
        routesRequiringRevalidation: marketRules.assessments.filter(
          (assessment) => assessment.state === "RULES_PASS",
        ).length,
        routesRevalidated: revalidated.length,
        routesRejected: assessments.filter(
          (assessment) => assessment.state === "REJECTED",
        ).length,
        blockedRoutes: assessments.filter(
          (assessment) => assessment.state === "BLOCKED",
        ).length,
        changedQuantityRoutes: assessments.filter(
          (assessment) => assessment.quantityChanged === true,
        ).length,
        revalidatedFeeQuoteValue: sumNullable(
          revalidated.map(
            (assessment) => assessment.revalidatedEconomics.estimatedFeeQuoteValue,
          ),
        ),
        revalidatedSlippageQuoteValue: sumNullable(
          revalidated.map(
            (assessment) => assessment.revalidatedEconomics.estimatedSlippageQuoteValue,
          ),
        ),
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
    routes: HedgeInventoryRouteEconomicsSnapshot,
    assessment: HedgeInventoryMarketRuleAssessment,
    routeEvidence: HedgeInventoryRouteEvidenceSnapshot,
    now: number,
  ): HedgeInventoryPostRuleEconomicsAssessment {
    const sourceRoute =
      routes.routes.find(
        (route) => route.id === assessment.routeId,
      );

    const originalCandidate =
      sourceRoute?.selectedCandidate ?? null;

    const common = {
      id: `${assessment.id}:post-rule-economics`,
      routeId: assessment.routeId,
      marketRuleAssessmentId: assessment.id,
      asset: assessment.asset,
      quoteAsset: assessment.quoteAsset,
      side: assessment.side,
      venue: assessment.venue,
      market: assessment.market,
      sourceMarketRuleState: assessment.state,
      originalTargetQuantity: assessment.originalTargetQuantity,
      quantizedQuantity: assessment.quantizedQuantity,
      quantityChanged:
        assessment.originalTargetQuantity !== null &&
        assessment.quantizedQuantity !== null
          ? Math.abs(
              assessment.originalTargetQuantity - assessment.quantizedQuantity,
            ) > 1e-12
          : null,
      originalEconomics: this.toOriginalEconomics(originalCandidate),
      executionAuthorized: false as const,
      actionable: false as const,
      intentGenerated: false as const,
    };

    if (assessment.state === "NOT_APPLICABLE") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        revalidatedEconomics: EMPTY_REVALIDATED_ECONOMICS,
        candidateBlockers: [],
        blockers: [],
        remainingGates: [],
      };
    }

    if (assessment.state !== "RULES_PASS") {
      return this.blockedAssessment(
        common,
        "MARKET_RULES_NOT_PASSED",
      );
    }

    if (
      assessment.quantizedQuantity === null ||
      !Number.isFinite(assessment.quantizedQuantity) ||
      assessment.quantizedQuantity <= 0
    ) {
      return this.blockedAssessment(
        common,
        "QUANTIZED_QUANTITY_INVALID",
      );
    }

    if (
      originalCandidate === null ||
      assessment.venue === null ||
      assessment.market === null ||
      assessment.side === "NONE"
    ) {
      return this.blockedAssessment(
        common,
        "SELECTED_ROUTE_UNAVAILABLE",
      );
    }

    const matchingEvidence =
      routeEvidence.candidates.filter(
        (candidate) =>
          candidate.venue === assessment.venue &&
          candidate.market === assessment.market &&
          candidate.asset === assessment.asset &&
          candidate.quoteAsset === assessment.quoteAsset,
      );

    if (matchingEvidence.length === 0) {
      return this.blockedAssessment(
        common,
        "ROUTE_EVIDENCE_NOT_FOUND",
      );
    }

    if (matchingEvidence.length > 1) {
      return this.blockedAssessment(
        common,
        "AMBIGUOUS_ROUTE_EVIDENCE",
      );
    }

    const candidate =
      this.routeEconomicsEvaluator.evaluateExplicitCandidate(
        configuration,
        assessment.side,
        assessment.quantizedQuantity,
        matchingEvidence[0]!,
        now,
      );

    return {
      ...common,
      evidenceStatus:
        candidate.state === "ECONOMICS_PASS"
          ? "AVAILABLE"
          : "NO_DATA",
      state:
        candidate.state === "ECONOMICS_PASS"
          ? "REVALIDATED"
          : "REJECTED",
      revalidatedEconomics: this.toRevalidatedEconomics(candidate),
      candidateBlockers: candidate.blockers,
      blockers:
        candidate.state === "ECONOMICS_PASS"
          ? []
          : [
              "ECONOMICS_REVALIDATION_REJECTED",
            ],
      remainingGates:
        candidate.state === "ECONOMICS_PASS"
          ? REMAINING_GATES
          : [],
    };
  }

  private resolveGlobalBlocker(
    configuration: HedgeInventoryManagementConfiguration,
    routes: HedgeInventoryRouteEconomicsSnapshot,
    marketRules: HedgeInventoryMarketRuleSnapshot,
    routeEvidence: HedgeInventoryRouteEvidenceSnapshot | null,
    now: number,
  ): HedgeInventoryPostRuleEconomicsGlobalBlocker | null {
    if (configuration.state !== "FOUNDATION_READY") {
      return "STRATEGY_CONFIGURATION_NOT_READY";
    }
    if (configuration.routeEconomics.state !== "READY") {
      return "ROUTE_ECONOMICS_CONFIGURATION_NOT_READY";
    }
    if (configuration.marketRules.state !== "READY") {
      return "MARKET_RULE_CONFIGURATION_NOT_READY";
    }
    if (configuration.postRuleEconomics.state !== "READY") {
      return "POST_RULE_ECONOMICS_CONFIGURATION_NOT_READY";
    }
    if (routes.evidenceStatus !== "AVAILABLE") {
      return "HEDGE_ROUTE_EVIDENCE_UNAVAILABLE";
    }
    if (marketRules.evidenceStatus !== "AVAILABLE") {
      return "MARKET_RULE_EVIDENCE_UNAVAILABLE";
    }
    if (routeEvidence === null) {
      return "ROUTE_EVIDENCE_UNAVAILABLE";
    }
    if (
      !Number.isFinite(routeEvidence.generatedAt) ||
      routeEvidence.generatedAt <= 0
    ) {
      return "INVALID_ROUTE_EVIDENCE_TIMESTAMP";
    }
    if (routeEvidence.generatedAt > now) {
      return "ROUTE_EVIDENCE_FROM_FUTURE";
    }
    return null;
  }

  private blockedAssessment(
    common: Omit<
      HedgeInventoryPostRuleEconomicsAssessment,
      | "evidenceStatus"
      | "state"
      | "revalidatedEconomics"
      | "candidateBlockers"
      | "blockers"
      | "remainingGates"
    >,
    blocker: HedgeInventoryPostRuleEconomicsAssessmentBlocker,
  ): HedgeInventoryPostRuleEconomicsAssessment {
    return {
      ...common,
      evidenceStatus: "NO_DATA",
      state: "BLOCKED",
      revalidatedEconomics: EMPTY_REVALIDATED_ECONOMICS,
      candidateBlockers: [],
      blockers: [blocker],
      remainingGates: [],
    };
  }

  private toOriginalEconomics(
    candidate: HedgeInventoryRouteCandidate | null,
  ): HedgeInventoryPostRuleEconomicsAssessment["originalEconomics"] {
    if (candidate === null) {
      return EMPTY_ORIGINAL_ECONOMICS;
    }

    return {
      vwapPrice: candidate.vwapPrice,
      estimatedFeeQuoteValue: candidate.estimatedFeeQuoteValue,
      estimatedSlippageQuoteValue: candidate.estimatedSlippageQuoteValue,
      modeledAllInQuoteValue: candidate.modeledAllInQuoteValue,
    };
  }

  private toRevalidatedEconomics(
    candidate: HedgeInventoryRouteCandidate,
  ): HedgeInventoryPostRuleEconomicsAssessment["revalidatedEconomics"] {
    return {
      requestedQuantity: candidate.requestedQuantity,
      vwapPrice: candidate.vwapPrice,
      executableQuantity: candidate.executableQuantity,
      estimatedFeeQuoteValue: candidate.estimatedFeeQuoteValue,
      estimatedSlippageQuoteValue: candidate.estimatedSlippageQuoteValue,
      modeledAllInQuoteValue: candidate.modeledAllInQuoteValue,
    };
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    routes: HedgeInventoryRouteEconomicsSnapshot,
    marketRules: HedgeInventoryMarketRuleSnapshot,
    routeEvidence: HedgeInventoryRouteEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryPostRuleEconomicsGlobalBlocker,
  ): HedgeInventoryPostRuleEconomicsSnapshot {
    return immutableClone({
      version: "22.5",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      routeEconomicsConfigurationState: configuration.routeEconomics.state,
      marketRuleConfigurationState: configuration.marketRules.state,
      postRuleEconomicsConfigurationState: configuration.postRuleEconomics.state,
      sourceRouteGeneratedAt: routes.generatedAt,
      sourceMarketRuleGeneratedAt: marketRules.generatedAt,
      sourceRouteEvidenceGeneratedAt: routeEvidence?.generatedAt ?? null,
      summary: {
        marketRuleAssessments: 0,
        routesRequiringRevalidation: 0,
        routesRevalidated: 0,
        routesRejected: 0,
        blockedRoutes: configuration.assetAllowlist.length,
        changedQuantityRoutes: 0,
        revalidatedFeeQuoteValue: null,
        revalidatedSlippageQuoteValue: null,
        actionableRoutes: 0,
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
        "Hedge post-rule economics timestamp must be a positive finite number.",
      );
    }
  }
}

function sumNullable(
  values: readonly (number | null)[],
): number | null {
  if (values.length === 0 || values.some((value) => value === null)) {
    return null;
  }

  return round(
    values.reduce<number>(
      (total, value) => total + (value ?? 0),
      0,
    ),
  );
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

