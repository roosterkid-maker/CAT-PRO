import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

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
  HedgeInventoryRouteEconomicsSnapshot,
  HedgeInventoryShadowRoute,
} from "./HedgeInventoryRouteEconomicsEvaluator";

export interface HedgeInventoryMarketRuleEvidenceSnapshot {
  readonly generatedAt: number;
  readonly capabilities: readonly ExchangeMarketCapability[];
}

export interface HedgeInventoryMarketRuleEvidenceSource {
  getMarketRuleEvidence(
    now?: number,
  ): HedgeInventoryMarketRuleEvidenceSnapshot | null;
}

export type HedgeInventoryMarketRuleBlocker =
  | "SHADOW_ROUTE_UNAVAILABLE"
  | "CAPABILITY_NOT_FOUND"
  | "CAPABILITY_IDENTITY_MISMATCH"
  | "CAPABILITY_TIMESTAMP_INVALID"
  | "CAPABILITY_FROM_FUTURE"
  | "CAPABILITY_STALE"
  | "SPOT_MARKET_REQUIRED"
  | "TRADING_DISABLED"
  | "MAINTENANCE_MODE"
  | "MARKET_ORDER_UNSUPPORTED"
  | "INVALID_QUANTITY_RULES"
  | "QUANTITY_INCREMENT_UNAVAILABLE"
  | "QUANTIZED_QUANTITY_ZERO"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_ABOVE_MAXIMUM"
  | "NOTIONAL_BELOW_MINIMUM"
  | "NOTIONAL_ABOVE_MAXIMUM"
  | "QUANTIZATION_LOSS_EXCEEDED"
  | "INVALID_SELECTED_ROUTE_ECONOMICS";

export type HedgeInventoryMarketRuleGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "ROUTE_ECONOMICS_CONFIGURATION_NOT_READY"
  | "MARKET_RULE_CONFIGURATION_NOT_READY"
  | "HEDGE_ROUTE_EVIDENCE_UNAVAILABLE"
  | "MARKET_RULE_EVIDENCE_UNAVAILABLE"
  | "INVALID_MARKET_RULE_EVIDENCE_TIMESTAMP"
  | "MARKET_RULE_EVIDENCE_FROM_FUTURE";

export type HedgeInventoryPostMarketRuleGate =
  | "ROUTE_ECONOMICS_REVALIDATION_REQUIRED"
  | "BASIS_CORRELATION_RISK_NOT_EVALUATED"
  | "RISK_APPROVAL_NOT_EVALUATED"
  | "CAPITAL_NOT_RESERVED"
  | "STRATEGY_INTENT_NOT_GENERATED";

export interface HedgeInventoryMarketRuleAssessment {
  readonly id: string;
  readonly routeId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryShadowRoute["side"];
  readonly venue: string | null;
  readonly market: string | null;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state:
    | "RULES_PASS"
    | "RULES_REJECTED"
    | "NOT_APPLICABLE"
    | "BLOCKED";
  readonly sourceCapabilitySynchronizedAt: number | null;
  readonly capabilityAgeMs: number | null;
  readonly originalTargetQuantity: number | null;
  readonly quantizedQuantity: number | null;
  readonly quantizationLossQuantity: number | null;
  readonly quantizationLossPercent: number | null;
  readonly vwapPrice: number | null;
  readonly modeledNotionalQuoteValue: number | null;
  readonly rules: {
    readonly tradingEnabled: boolean | null;
    readonly maintenanceMode: boolean | null;
    readonly marketOrderSupported: boolean | null;
    readonly minimumQuantity: number | null;
    readonly maximumQuantity: number | null;
    readonly quantityStep: number | null;
    readonly quantityPrecision: number | null;
    readonly minimumNotional: number | null;
    readonly maximumNotional: number | null;
  };
  readonly blockers: readonly HedgeInventoryMarketRuleBlocker[];
  readonly remainingGates: readonly HedgeInventoryPostMarketRuleGate[];
  readonly executionAuthorized: false;
  readonly actionable: false;
  readonly intentGenerated: false;
}

export interface HedgeInventoryMarketRuleSnapshot {
  readonly version: "22.4";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly routeEconomicsConfigurationState: string;
  readonly marketRuleConfigurationState: string;
  readonly sourceRouteGeneratedAt: number | null;
  readonly sourceMarketRuleEvidenceGeneratedAt: number | null;
  readonly summary: {
    readonly shadowRoutesSelected: number;
    readonly capabilitiesEvaluated: number;
    readonly feasibleRoutes: number;
    readonly rejectedRoutes: number;
    readonly blockedRoutes: number;
    readonly totalOriginalQuantity: number | null;
    readonly totalQuantizedQuantity: number | null;
    readonly actionableRoutes: 0;
    readonly intentsGenerated: 0;
  };
  readonly assessments: readonly HedgeInventoryMarketRuleAssessment[];
  readonly blockers: readonly HedgeInventoryMarketRuleGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly readOnlyMarketRuleEvidence: true;
    readonly feasibilityIsExecutionApproval: false;
    readonly quantityQuantizationIsExecutionInstruction: false;
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

const BASE_REMAINING_GATES = [
  "BASIS_CORRELATION_RISK_NOT_EVALUATED",
  "RISK_APPROVAL_NOT_EVALUATED",
  "CAPITAL_NOT_RESERVED",
  "STRATEGY_INTENT_NOT_GENERATED",
] as const satisfies readonly HedgeInventoryPostMarketRuleGate[];

const EMPTY_RULES = {
  tradingEnabled: null,
  maintenanceMode: null,
  marketOrderSupported: null,
  minimumQuantity: null,
  maximumQuantity: null,
  quantityStep: null,
  quantityPrecision: null,
  minimumNotional: null,
  maximumNotional: null,
} as const;

const NOTES = [
  "V22.4 checks only the V22.3-selected SHADOW route against explicit canonical spot-market capability evidence.",
  "Quantity is conservatively rounded down to the venue increment for feasibility; the result is not an order quantity or execution instruction.",
  "Any quantity change requires route economics to be recalculated before a future proposal. Basis/correlation risk, risk approval, capital, intents, PAPER, LIVE and orders remain blocked.",
] as const;

const SAFETY = {
  readOnlyMarketRuleEvidence: true,
  feasibilityIsExecutionApproval: false,
  quantityQuantizationIsExecutionInstruction: false,
  basisCorrelationRiskEvaluated: false,
  riskApprovalGranted: false,
  capitalReserved: false,
  hedgeIntentGenerationAllowed: false,
  recursiveHedgeAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryMarketRuleEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    routes: HedgeInventoryRouteEconomicsSnapshot,
    evidence: HedgeInventoryMarketRuleEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryMarketRuleSnapshot {
    this.validateNow(now);

    if (configuration.state !== "FOUNDATION_READY") {
      return this.unavailable(
        configuration,
        routes,
        evidence,
        now,
        "STRATEGY_CONFIGURATION_NOT_READY",
      );
    }

    if (configuration.routeEconomics.state !== "READY") {
      return this.unavailable(
        configuration,
        routes,
        evidence,
        now,
        "ROUTE_ECONOMICS_CONFIGURATION_NOT_READY",
      );
    }

    if (configuration.marketRules.state !== "READY") {
      return this.unavailable(
        configuration,
        routes,
        evidence,
        now,
        "MARKET_RULE_CONFIGURATION_NOT_READY",
      );
    }

    if (routes.evidenceStatus !== "AVAILABLE") {
      return this.unavailable(
        configuration,
        routes,
        evidence,
        now,
        "HEDGE_ROUTE_EVIDENCE_UNAVAILABLE",
      );
    }

    if (evidence === null) {
      return this.unavailable(
        configuration,
        routes,
        null,
        now,
        "MARKET_RULE_EVIDENCE_UNAVAILABLE",
      );
    }

    if (
      !Number.isFinite(evidence.generatedAt) ||
      evidence.generatedAt <= 0
    ) {
      return this.unavailable(
        configuration,
        routes,
        evidence,
        now,
        "INVALID_MARKET_RULE_EVIDENCE_TIMESTAMP",
      );
    }

    if (evidence.generatedAt > now) {
      return this.unavailable(
        configuration,
        routes,
        evidence,
        now,
        "MARKET_RULE_EVIDENCE_FROM_FUTURE",
      );
    }

    const assessments = routes.routes.map(
      (route) => this.evaluateRoute(
        configuration,
        route,
        evidence.capabilities,
        now,
      ),
    );

    const selectedAssessments = assessments.filter(
      (assessment) => assessment.venue !== null,
    );
    const quantized = selectedAssessments.filter(
      (assessment) => assessment.quantizedQuantity !== null,
    );

    return immutableClone({
      version: "22.4",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: assessments.length > 0 ? "AVAILABLE" : "NO_DATA",
      configurationState: configuration.state,
      routeEconomicsConfigurationState: configuration.routeEconomics.state,
      marketRuleConfigurationState: configuration.marketRules.state,
      sourceRouteGeneratedAt: routes.generatedAt,
      sourceMarketRuleEvidenceGeneratedAt: evidence.generatedAt,
      summary: {
        shadowRoutesSelected: selectedAssessments.length,
        capabilitiesEvaluated: selectedAssessments.filter(
          (assessment) => assessment.sourceCapabilitySynchronizedAt !== null,
        ).length,
        feasibleRoutes: assessments.filter(
          (assessment) => assessment.state === "RULES_PASS",
        ).length,
        rejectedRoutes: assessments.filter(
          (assessment) => assessment.state === "RULES_REJECTED",
        ).length,
        blockedRoutes: assessments.filter(
          (assessment) => assessment.state === "BLOCKED",
        ).length,
        totalOriginalQuantity: selectedAssessments.length > 0
          ? round(selectedAssessments.reduce(
              (total, assessment) => total + (assessment.originalTargetQuantity ?? 0),
              0,
            ))
          : null,
        totalQuantizedQuantity: quantized.length > 0
          ? round(quantized.reduce(
              (total, assessment) => total + assessment.quantizedQuantity!,
              0,
            ))
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

  private evaluateRoute(
    configuration: HedgeInventoryManagementConfiguration,
    route: HedgeInventoryShadowRoute,
    capabilities: readonly ExchangeMarketCapability[],
    now: number,
  ): HedgeInventoryMarketRuleAssessment {
    const selected = route.selectedCandidate;
    const common = {
      id: `${route.id}:market-rules`,
      routeId: route.id,
      asset: route.asset,
      quoteAsset: route.quoteAsset,
      side: route.side,
      venue: selected?.venue ?? null,
      market: selected?.market ?? null,
      originalTargetQuantity: route.targetQuantity,
      vwapPrice: selected?.vwapPrice ?? null,
      executionAuthorized: false as const,
      actionable: false as const,
      intentGenerated: false as const,
    };

    if (route.state === "NOT_REQUIRED") {
      return {
        ...common,
        evidenceStatus: "AVAILABLE",
        state: "NOT_APPLICABLE",
        sourceCapabilitySynchronizedAt: null,
        capabilityAgeMs: null,
        quantizedQuantity: null,
        quantizationLossQuantity: null,
        quantizationLossPercent: null,
        modeledNotionalQuoteValue: null,
        rules: EMPTY_RULES,
        blockers: [],
        remainingGates: [],
      };
    }

    if (selected === null) {
      return {
        ...common,
        evidenceStatus: "NO_DATA",
        state: "BLOCKED",
        sourceCapabilitySynchronizedAt: null,
        capabilityAgeMs: null,
        quantizedQuantity: null,
        quantizationLossQuantity: null,
        quantizationLossPercent: null,
        modeledNotionalQuoteValue: null,
        rules: EMPTY_RULES,
        blockers: ["SHADOW_ROUTE_UNAVAILABLE"],
        remainingGates: BASE_REMAINING_GATES,
      };
    }

    const capability = capabilities.find(
      (candidate) =>
        candidate.exchange === selected.venue &&
        candidate.market === selected.market,
    ) ?? null;

    if (capability === null) {
      return {
        ...common,
        evidenceStatus: "NO_DATA",
        state: "RULES_REJECTED",
        sourceCapabilitySynchronizedAt: null,
        capabilityAgeMs: null,
        quantizedQuantity: null,
        quantizationLossQuantity: null,
        quantizationLossPercent: null,
        modeledNotionalQuoteValue: null,
        rules: EMPTY_RULES,
        blockers: ["CAPABILITY_NOT_FOUND"],
        remainingGates: BASE_REMAINING_GATES,
      };
    }

    const blockers: HedgeInventoryMarketRuleBlocker[] = [];
    const rules = {
      tradingEnabled: capability.tradingEnabled,
      maintenanceMode: capability.maintenanceMode,
      marketOrderSupported: Array.isArray(capability.order.supportedOrderTypes)
        ? capability.order.supportedOrderTypes.includes("market")
        : false,
      minimumQuantity: capability.quantity.minimumQuantity,
      maximumQuantity: capability.quantity.maximumQuantity,
      quantityStep: capability.quantity.quantityStep,
      quantityPrecision: capability.quantity.quantityPrecision,
      minimumNotional: capability.notional.minimumNotional,
      maximumNotional: capability.notional.maximumNotional,
    };

    if (
      capability.baseAsset !== route.asset ||
      capability.quoteAsset !== route.quoteAsset ||
      capability.exchange !== selected.venue ||
      capability.market !== selected.market
    ) {
      blockers.push("CAPABILITY_IDENTITY_MISMATCH");
    }

    let capabilityAgeMs: number | null = null;
    if (
      !Number.isSafeInteger(capability.synchronizedAt) ||
      capability.synchronizedAt <= 0
    ) {
      blockers.push("CAPABILITY_TIMESTAMP_INVALID");
    } else if (capability.synchronizedAt > now) {
      blockers.push("CAPABILITY_FROM_FUTURE");
    } else {
      capabilityAgeMs = now - capability.synchronizedAt;
      if (capabilityAgeMs > configuration.marketRules.maximumCapabilityAgeMs!) {
        blockers.push("CAPABILITY_STALE");
      }
    }

    if (capability.product !== "spot") blockers.push("SPOT_MARKET_REQUIRED");
    if (!capability.tradingEnabled) blockers.push("TRADING_DISABLED");
    if (capability.maintenanceMode) blockers.push("MAINTENANCE_MODE");
    if (!rules.marketOrderSupported) blockers.push("MARKET_ORDER_UNSUPPORTED");

    const quantityRulesValid = this.quantityRulesValid(capability);
    if (!quantityRulesValid) blockers.push("INVALID_QUANTITY_RULES");

    const originalQuantity = route.targetQuantity;
    const vwapPrice = selected.vwapPrice;
    if (
      originalQuantity === null ||
      !Number.isFinite(originalQuantity) ||
      originalQuantity <= 0 ||
      vwapPrice === null ||
      !Number.isFinite(vwapPrice) ||
      vwapPrice <= 0
    ) {
      blockers.push("INVALID_SELECTED_ROUTE_ECONOMICS");
    }

    let quantizedQuantity: number | null = null;
    if (
      quantityRulesValid &&
      originalQuantity !== null &&
      Number.isFinite(originalQuantity) &&
      originalQuantity > 0
    ) {
      quantizedQuantity = this.quantizeDown(
        originalQuantity,
        capability.quantity.quantityStep,
        capability.quantity.quantityPrecision,
      );

      if (quantizedQuantity === null) {
        blockers.push("QUANTITY_INCREMENT_UNAVAILABLE");
      } else if (quantizedQuantity <= 0) {
        blockers.push("QUANTIZED_QUANTITY_ZERO");
      }
    }

    const modeledNotional =
      quantizedQuantity !== null &&
      quantizedQuantity > 0 &&
      vwapPrice !== null &&
      Number.isFinite(vwapPrice) &&
      vwapPrice > 0
        ? quantizedQuantity * vwapPrice
        : null;

    if (quantizedQuantity !== null) {
      const { minimumQuantity, maximumQuantity } = capability.quantity;
      if (minimumQuantity !== null && quantizedQuantity < minimumQuantity) {
        blockers.push("QUANTITY_BELOW_MINIMUM");
      }
      if (maximumQuantity !== null && quantizedQuantity > maximumQuantity) {
        blockers.push("QUANTITY_ABOVE_MAXIMUM");
      }
    }

    if (modeledNotional !== null) {
      const { minimumNotional, maximumNotional } = capability.notional;
      if (minimumNotional !== null && modeledNotional < minimumNotional) {
        blockers.push("NOTIONAL_BELOW_MINIMUM");
      }
      if (maximumNotional !== null && modeledNotional > maximumNotional) {
        blockers.push("NOTIONAL_ABOVE_MAXIMUM");
      }
    }

    const quantizationLoss =
      quantizedQuantity !== null && originalQuantity !== null
        ? Math.max(0, originalQuantity - quantizedQuantity)
        : null;
    const quantizationLossPercent =
      quantizationLoss !== null && originalQuantity !== null && originalQuantity > 0
        ? quantizationLoss / originalQuantity * 100
        : null;

    if (
      quantizationLossPercent !== null &&
      quantizationLossPercent > configuration.marketRules.maximumQuantizationLossPercent!
    ) {
      blockers.push("QUANTIZATION_LOSS_EXCEEDED");
    }

    const uniqueBlockers = [
      ...new Set(blockers),
    ];
    const economicsRevalidationRequired =
      quantizationLoss !== null &&
      quantizationLoss > 1e-12;

    return {
      ...common,
      evidenceStatus: uniqueBlockers.length === 0 ? "AVAILABLE" : "NO_DATA",
      state: uniqueBlockers.length === 0 ? "RULES_PASS" : "RULES_REJECTED",
      sourceCapabilitySynchronizedAt: capability.synchronizedAt,
      capabilityAgeMs,
      quantizedQuantity: quantizedQuantity === null ? null : normalizeEvidenceNumber(quantizedQuantity),
      quantizationLossQuantity: quantizationLoss === null ? null : normalizeEvidenceNumber(quantizationLoss),
      quantizationLossPercent: quantizationLossPercent === null ? null : round(quantizationLossPercent),
      modeledNotionalQuoteValue: modeledNotional === null ? null : round(modeledNotional),
      rules,
      blockers: uniqueBlockers,
      remainingGates: [
        ...(economicsRevalidationRequired
          ? ["ROUTE_ECONOMICS_REVALIDATION_REQUIRED" as const]
          : []),
        ...BASE_REMAINING_GATES,
      ],
    };
  }

  private quantityRulesValid(capability: ExchangeMarketCapability): boolean {
    const values = [
      capability.quantity.minimumQuantity,
      capability.quantity.maximumQuantity,
      capability.quantity.quantityStep,
      capability.notional.minimumNotional,
      capability.notional.maximumNotional,
    ];

    if (values.some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      return false;
    }

    if (
      capability.quantity.minimumQuantity !== null &&
      capability.quantity.maximumQuantity !== null &&
      capability.quantity.maximumQuantity < capability.quantity.minimumQuantity
    ) {
      return false;
    }

    if (
      capability.notional.minimumNotional !== null &&
      capability.notional.maximumNotional !== null &&
      capability.notional.maximumNotional < capability.notional.minimumNotional
    ) {
      return false;
    }

    const precision = capability.quantity.quantityPrecision;
    if (
      precision !== null &&
      (!Number.isSafeInteger(precision) || precision < 0 || precision > 18)
    ) {
      return false;
    }

    return true;
  }

  private quantizeDown(
    quantity: number,
    step: number | null,
    precision: number | null,
  ): number | null {
    if (step !== null && Number.isFinite(step) && step > 0) {
      const units = Math.floor(quantity / step + 1e-10);
      return units * step;
    }

    if (precision !== null && Number.isSafeInteger(precision) && precision >= 0) {
      const factor = 10 ** precision;
      return Math.floor(quantity * factor + 1e-10) / factor;
    }

    return null;
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    routes: HedgeInventoryRouteEconomicsSnapshot,
    evidence: HedgeInventoryMarketRuleEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryMarketRuleGlobalBlocker,
  ): HedgeInventoryMarketRuleSnapshot {
    return immutableClone({
      version: "22.4",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      routeEconomicsConfigurationState: configuration.routeEconomics.state,
      marketRuleConfigurationState: configuration.marketRules.state,
      sourceRouteGeneratedAt: routes.generatedAt,
      sourceMarketRuleEvidenceGeneratedAt: evidence?.generatedAt ?? null,
      summary: {
        shadowRoutesSelected: 0,
        capabilitiesEvaluated: 0,
        feasibleRoutes: 0,
        rejectedRoutes: 0,
        blockedRoutes: configuration.assetAllowlist.length,
        totalOriginalQuantity: null,
        totalQuantizedQuantity: null,
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
      throw new Error("Hedge market-rule timestamp must be a positive finite number.");
    }
  }
}

function round(value: number, decimalPlaces = 8): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function normalizeEvidenceNumber(value: number): number {
  return Number(
    value.toPrecision(15),
  );
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

