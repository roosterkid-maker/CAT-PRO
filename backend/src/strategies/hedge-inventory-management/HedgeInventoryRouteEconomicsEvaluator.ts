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
  HedgeInventoryShadowTarget,
  HedgeInventoryShadowTargetSide,
  HedgeInventoryShadowTargetSnapshot,
} from "./HedgeInventoryShadowTargetPlanner";

export type HedgeInventoryRouteFeeSource =
  | "STATIC_CONFIG"
  | "PUBLIC_API"
  | "ACCOUNT_API";

export interface HedgeInventoryRouteOrderBookLevel {
  readonly price: number;
  readonly quantity: number;
}

export interface HedgeInventoryRouteMarketEvidence {
  readonly venue: string;
  readonly market: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly orderBookTimestamp: number;
  readonly bids: readonly HedgeInventoryRouteOrderBookLevel[];
  readonly asks: readonly HedgeInventoryRouteOrderBookLevel[];
  readonly takerFeePercent: number;
  readonly feeSource: HedgeInventoryRouteFeeSource;
  readonly feeSynchronizedAt: number | null;
  readonly feeExpiresAt: number | null;
}

export interface HedgeInventoryRouteEvidenceSnapshot {
  readonly generatedAt: number;
  readonly candidates: readonly HedgeInventoryRouteMarketEvidence[];
}

export interface HedgeInventoryRouteEvidenceSource {
  getRouteEvidence(
    now?: number,
  ): HedgeInventoryRouteEvidenceSnapshot | null;
}

export type HedgeInventoryRouteCandidateBlocker =
  | "VENUE_NOT_ALLOWLISTED"
  | "INVALID_MARKET_IDENTITY"
  | "INVALID_ORDER_BOOK_TIMESTAMP"
  | "ORDER_BOOK_FROM_FUTURE"
  | "ORDER_BOOK_STALE"
  | "INVALID_ORDER_BOOK_LEVEL"
  | "ORDER_BOOK_NOT_SORTED"
  | "CROSSED_ORDER_BOOK"
  | "INVALID_FEE_EVIDENCE"
  | "FEE_EVIDENCE_FROM_FUTURE"
  | "FEE_EVIDENCE_STALE"
  | "INSUFFICIENT_EXECUTABLE_DEPTH"
  | "SLIPPAGE_LIMIT_EXCEEDED";

export type HedgeInventoryRouteTargetBlocker =
  | "TARGET_NOT_ROUTE_ELIGIBLE"
  | "NO_ROUTE_EVIDENCE_FOR_TARGET"
  | "NO_PASSING_ROUTE"
  | "MARKET_RULES_NOT_EVALUATED"
  | "BASIS_CORRELATION_RISK_NOT_EVALUATED"
  | "RISK_APPROVAL_NOT_EVALUATED"
  | "CAPITAL_NOT_RESERVED"
  | "STRATEGY_INTENT_NOT_GENERATED";

export type HedgeInventoryRouteGlobalBlocker =
  | "STRATEGY_CONFIGURATION_NOT_READY"
  | "ROUTE_ECONOMICS_CONFIGURATION_NOT_READY"
  | "HEDGE_TARGET_EVIDENCE_UNAVAILABLE"
  | "ROUTE_EVIDENCE_UNAVAILABLE"
  | "INVALID_ROUTE_EVIDENCE_TIMESTAMP"
  | "ROUTE_EVIDENCE_FROM_FUTURE";

export interface HedgeInventoryRouteCandidate {
  readonly venue: string;
  readonly market: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: Exclude<HedgeInventoryShadowTargetSide, "NONE">;
  readonly requestedQuantity: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly state: "ECONOMICS_PASS" | "REJECTED";
  readonly orderBookTimestamp: number;
  readonly orderBookAgeMs: number | null;
  readonly bestPrice: number | null;
  readonly vwapPrice: number | null;
  readonly executableQuantity: number;
  readonly unfilledQuantity: number;
  readonly grossNotionalQuoteValue: number | null;
  readonly takerFeePercent: number;
  readonly feeSource: HedgeInventoryRouteFeeSource;
  readonly feeSynchronizedAt: number | null;
  readonly feeExpiresAt: number | null;
  readonly estimatedFeeQuoteValue: number | null;
  readonly slippagePercent: number | null;
  readonly estimatedSlippageQuoteValue: number | null;
  readonly totalModeledFrictionQuoteValue: number | null;
  readonly modeledAllInQuoteValue: number | null;
  readonly blockers: readonly HedgeInventoryRouteCandidateBlocker[];
  readonly executionAuthorized: false;
}

export interface HedgeInventoryShadowRoute {
  readonly id: string;
  readonly targetId: string;
  readonly asset: string;
  readonly quoteAsset: string;
  readonly side: HedgeInventoryShadowTargetSide;
  readonly targetQuantity: number | null;
  readonly state:
    | "SHADOW_ROUTE_MODELED"
    | "NO_ROUTE"
    | "NOT_REQUIRED"
    | "BLOCKED";
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly candidates: readonly HedgeInventoryRouteCandidate[];
  readonly selectedCandidate: HedgeInventoryRouteCandidate | null;
  readonly blockers: readonly HedgeInventoryRouteTargetBlocker[];
  readonly recursionProtection: HedgeInventoryShadowTarget["recursionProtection"];
  readonly actionable: false;
  readonly intentGenerated: false;
}

export interface HedgeInventoryRouteEconomicsSnapshot {
  readonly version: "22.3";
  readonly strategyId: "hedge-inventory-management";
  readonly generatedAt: number;
  readonly evidenceStatus: StrategyEvidenceStatus;
  readonly configurationState: string;
  readonly routeEconomicsConfigurationState: string;
  readonly sourceTargetGeneratedAt: number | null;
  readonly sourceRouteEvidenceGeneratedAt: number | null;
  readonly summary: {
    readonly targetsRequiringRoute: number;
    readonly candidatesEvaluated: number;
    readonly candidatesPassingEconomics: number;
    readonly shadowRoutesSelected: number;
    readonly blockedTargets: number;
    readonly modeledFeeQuoteValue: number | null;
    readonly modeledSlippageQuoteValue: number | null;
    readonly actionableRoutes: 0;
    readonly intentsGenerated: 0;
  };
  readonly routes: readonly HedgeInventoryShadowRoute[];
  readonly blockers: readonly HedgeInventoryRouteGlobalBlocker[];
  readonly notes: readonly string[];
  readonly safety: {
    readonly shadowRouteEvidenceOnly: true;
    readonly routeSelectionIsExecutionApproval: false;
    readonly marketRulesEvaluated: false;
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

const POST_SELECTION_BLOCKERS = [
  "MARKET_RULES_NOT_EVALUATED",
  "BASIS_CORRELATION_RISK_NOT_EVALUATED",
  "RISK_APPROVAL_NOT_EVALUATED",
  "CAPITAL_NOT_RESERVED",
  "STRATEGY_INTENT_NOT_GENERATED",
] as const satisfies readonly HedgeInventoryRouteTargetBlocker[];

const NOTES = [
  "V22.3 ranks explicit allowlisted route evidence with full-depth VWAP, taker fees and slippage; selected routes remain SHADOW evidence only.",
  "STATIC_CONFIG fees are accepted as configured evidence; PUBLIC_API and ACCOUNT_API fees must carry fresh synchronization timestamps.",
  "Market rules, basis/correlation risk, risk approval, capital, intent generation, PAPER, LIVE and orders remain unresolved and blocked.",
] as const;

const SAFETY = {
  shadowRouteEvidenceOnly: true,
  routeSelectionIsExecutionApproval: false,
  marketRulesEvaluated: false,
  basisCorrelationRiskEvaluated: false,
  riskApprovalGranted: false,
  capitalReserved: false,
  hedgeIntentGenerationAllowed: false,
  recursiveHedgeAllowed: false,
  paperExecutionAllowed: false,
  liveExecutionAllowed: false,
  orderSubmissionAllowed: false,
} as const;

export class HedgeInventoryRouteEconomicsEvaluator {
  evaluate(
    configuration: HedgeInventoryManagementConfiguration,
    targets: HedgeInventoryShadowTargetSnapshot,
    routeEvidence: HedgeInventoryRouteEvidenceSnapshot | null,
    now = Date.now(),
  ): HedgeInventoryRouteEconomicsSnapshot {
    this.validateNow(now);

    if (configuration.state !== "FOUNDATION_READY") {
      return this.unavailable(
        configuration,
        targets,
        routeEvidence,
        now,
        "STRATEGY_CONFIGURATION_NOT_READY",
      );
    }

    if (configuration.routeEconomics.state !== "READY") {
      return this.unavailable(
        configuration,
        targets,
        routeEvidence,
        now,
        "ROUTE_ECONOMICS_CONFIGURATION_NOT_READY",
      );
    }

    if (targets.evidenceStatus !== "AVAILABLE") {
      return this.unavailable(
        configuration,
        targets,
        routeEvidence,
        now,
        "HEDGE_TARGET_EVIDENCE_UNAVAILABLE",
      );
    }

    if (routeEvidence === null) {
      return this.unavailable(
        configuration,
        targets,
        null,
        now,
        "ROUTE_EVIDENCE_UNAVAILABLE",
      );
    }

    if (
      !Number.isFinite(routeEvidence.generatedAt) ||
      routeEvidence.generatedAt <= 0
    ) {
      return this.unavailable(
        configuration,
        targets,
        routeEvidence,
        now,
        "INVALID_ROUTE_EVIDENCE_TIMESTAMP",
      );
    }

    if (routeEvidence.generatedAt > now) {
      return this.unavailable(
        configuration,
        targets,
        routeEvidence,
        now,
        "ROUTE_EVIDENCE_FROM_FUTURE",
      );
    }

    const routes = targets.targets.map(
      (target) => this.evaluateTarget(
        configuration,
        target,
        routeEvidence.candidates,
        now,
      ),
    );

    const selected = routes
      .map((route) => route.selectedCandidate)
      .filter(
        (candidate): candidate is HedgeInventoryRouteCandidate =>
          candidate !== null,
      );

    const candidates = routes.flatMap((route) => route.candidates);

    return immutableClone({
      version: "22.3",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: routes.length > 0 ? "AVAILABLE" : "NO_DATA",
      configurationState: configuration.state,
      routeEconomicsConfigurationState: configuration.routeEconomics.state,
      sourceTargetGeneratedAt: targets.generatedAt,
      sourceRouteEvidenceGeneratedAt: routeEvidence.generatedAt,
      summary: {
        targetsRequiringRoute: routes.filter(
          (route) => route.side !== "NONE",
        ).length,
        candidatesEvaluated: candidates.length,
        candidatesPassingEconomics: candidates.filter(
          (candidate) => candidate.state === "ECONOMICS_PASS",
        ).length,
        shadowRoutesSelected: selected.length,
        blockedTargets: routes.filter(
          (route) => route.state === "NO_ROUTE" || route.state === "BLOCKED",
        ).length,
        modeledFeeQuoteValue: selected.length > 0
          ? round(selected.reduce(
              (total, candidate) => total + candidate.estimatedFeeQuoteValue!,
              0,
            ))
          : null,
        modeledSlippageQuoteValue: selected.length > 0
          ? round(selected.reduce(
              (total, candidate) => total + candidate.estimatedSlippageQuoteValue!,
              0,
            ))
          : null,
        actionableRoutes: 0,
        intentsGenerated: 0,
      },
      routes,
      blockers: [],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  /**
   * Re-evaluates one explicit route and quantity with the same V22.3
   * full-depth, freshness, fee and slippage rules. This is a pure SHADOW
   * calculation used after market-rule quantity normalization.
   */
  evaluateExplicitCandidate(
    configuration: HedgeInventoryManagementConfiguration,
    side: Exclude<HedgeInventoryShadowTargetSide, "NONE">,
    requestedQuantity: number,
    evidence: HedgeInventoryRouteMarketEvidence,
    now = Date.now(),
  ): HedgeInventoryRouteCandidate {
    this.validateNow(now);

    if (
      configuration.state !== "FOUNDATION_READY" ||
      configuration.routeEconomics.state !== "READY"
    ) {
      throw new Error(
        "Hedge route economics must be READY before explicit candidate evaluation.",
      );
    }

    if (
      !Number.isFinite(requestedQuantity) ||
      requestedQuantity <= 0
    ) {
      throw new Error(
        "Hedge route explicit candidate quantity must be positive and finite.",
      );
    }

    return immutableClone(
      this.evaluateCandidate(
        configuration,
        side,
        requestedQuantity,
        evidence,
        now,
      ),
    );
  }

  private evaluateTarget(
    configuration: HedgeInventoryManagementConfiguration,
    target: HedgeInventoryShadowTarget,
    evidence: readonly HedgeInventoryRouteMarketEvidence[],
    now: number,
  ): HedgeInventoryShadowRoute {
    const common = {
      id: `${target.id}:route`,
      targetId: target.id,
      asset: target.asset,
      quoteAsset: target.valuationQuoteAsset,
      side: target.side,
      targetQuantity: target.modeledTargetQuantity,
      recursionProtection: target.recursionProtection,
      actionable: false as const,
      intentGenerated: false as const,
    };

    if (target.state === "NOT_REQUIRED") {
      return {
        ...common,
        state: "NOT_REQUIRED",
        evidenceStatus: "AVAILABLE",
        candidates: [],
        selectedCandidate: null,
        blockers: [],
      };
    }

    if (
      target.state !== "TARGET_MODELED" ||
      target.side === "NONE" ||
      target.modeledTargetQuantity === null ||
      !Number.isFinite(target.modeledTargetQuantity) ||
      target.modeledTargetQuantity <= 0
    ) {
      return {
        ...common,
        state: "BLOCKED",
        evidenceStatus: "NO_DATA",
        candidates: [],
        selectedCandidate: null,
        blockers: ["TARGET_NOT_ROUTE_ELIGIBLE"],
      };
    }

    const matching = evidence.filter(
      (candidate) =>
        candidate.asset === target.asset &&
        candidate.quoteAsset === target.valuationQuoteAsset,
    );

    if (matching.length === 0) {
      return {
        ...common,
        state: "NO_ROUTE",
        evidenceStatus: "NO_DATA",
        candidates: [],
        selectedCandidate: null,
        blockers: ["NO_ROUTE_EVIDENCE_FOR_TARGET"],
      };
    }

    const candidates = matching.map(
      (candidate) => this.evaluateCandidate(
        configuration,
        target.side as Exclude<HedgeInventoryShadowTargetSide, "NONE">,
        target.modeledTargetQuantity!,
        candidate,
        now,
      ),
    );

    const passing = candidates
      .filter((candidate) => candidate.state === "ECONOMICS_PASS")
      .sort((first, second) => this.compareCandidates(first, second));

    const selectedCandidate = passing[0] ?? null;

    return {
      ...common,
      state: selectedCandidate === null ? "NO_ROUTE" : "SHADOW_ROUTE_MODELED",
      evidenceStatus: selectedCandidate === null ? "NO_DATA" : "AVAILABLE",
      candidates,
      selectedCandidate,
      blockers: selectedCandidate === null
        ? ["NO_PASSING_ROUTE"]
        : POST_SELECTION_BLOCKERS,
    };
  }

  private evaluateCandidate(
    configuration: HedgeInventoryManagementConfiguration,
    side: Exclude<HedgeInventoryShadowTargetSide, "NONE">,
    requestedQuantity: number,
    evidence: HedgeInventoryRouteMarketEvidence,
    now: number,
  ): HedgeInventoryRouteCandidate {
    const blockers: HedgeInventoryRouteCandidateBlocker[] = [];
    const venueAllowed = configuration.hedgeVenueAllowlist.includes(evidence.venue);
    if (!venueAllowed) blockers.push("VENUE_NOT_ALLOWLISTED");

    if (
      typeof evidence.market !== "string" ||
      evidence.market.trim().length === 0 ||
      evidence.asset !== evidence.asset.toUpperCase() ||
      evidence.quoteAsset !== evidence.quoteAsset.toUpperCase()
    ) {
      blockers.push("INVALID_MARKET_IDENTITY");
    }

    let orderBookAgeMs: number | null = null;
    if (!Number.isFinite(evidence.orderBookTimestamp) || evidence.orderBookTimestamp <= 0) {
      blockers.push("INVALID_ORDER_BOOK_TIMESTAMP");
    } else if (evidence.orderBookTimestamp > now) {
      blockers.push("ORDER_BOOK_FROM_FUTURE");
    } else {
      orderBookAgeMs = now - evidence.orderBookTimestamp;
      if (orderBookAgeMs > configuration.routeEconomics.maximumOrderBookAgeMs!) {
        blockers.push("ORDER_BOOK_STALE");
      }
    }

    const levelsValid =
      this.levelsValid(evidence.bids) &&
      this.levelsValid(evidence.asks);
    if (!levelsValid) blockers.push("INVALID_ORDER_BOOK_LEVEL");

    const sorted =
      levelsValid &&
      this.isSorted(evidence.bids, "DESC") &&
      this.isSorted(evidence.asks, "ASC");
    if (levelsValid && !sorted) blockers.push("ORDER_BOOK_NOT_SORTED");

    const bestBid = levelsValid ? evidence.bids[0]?.price ?? null : null;
    const bestAsk = levelsValid ? evidence.asks[0]?.price ?? null : null;
    if (
      bestBid !== null &&
      bestAsk !== null &&
      bestBid >= bestAsk
    ) {
      blockers.push("CROSSED_ORDER_BOOK");
    }

    this.validateFee(configuration, evidence, now, blockers);

    const bookSide = side === "BUY" ? evidence.asks : evidence.bids;
    const fill = levelsValid && sorted
      ? this.calculateVwap(bookSide, requestedQuantity)
      : { quantity: 0, total: null, vwap: null };
    const unfilledQuantity = round(Math.max(0, requestedQuantity - fill.quantity));
    if (unfilledQuantity > 1e-10) blockers.push("INSUFFICIENT_EXECUTABLE_DEPTH");

    const bestPrice = side === "BUY" ? bestAsk : bestBid;
    const grossNotional = fill.total;
    const slippageQuoteValue =
      grossNotional !== null &&
      bestPrice !== null &&
      unfilledQuantity <= 1e-10
        ? Math.max(
            0,
            side === "BUY"
              ? grossNotional - bestPrice * requestedQuantity
              : bestPrice * requestedQuantity - grossNotional,
          )
        : null;
    const slippagePercent =
      slippageQuoteValue !== null && bestPrice !== null
        ? slippageQuoteValue / (bestPrice * requestedQuantity) * 100
        : null;

    if (
      slippagePercent !== null &&
      slippagePercent > configuration.routeEconomics.maximumSlippagePercent!
    ) {
      blockers.push("SLIPPAGE_LIMIT_EXCEEDED");
    }

    const feeEvidenceAccepted =
      !blockers.some(
        (blocker) =>
          blocker === "INVALID_FEE_EVIDENCE" ||
          blocker === "FEE_EVIDENCE_FROM_FUTURE" ||
          blocker === "FEE_EVIDENCE_STALE",
      );
    const fee = grossNotional !== null && feeEvidenceAccepted
      ? grossNotional * evidence.takerFeePercent / 100
      : null;
    const friction = fee !== null && slippageQuoteValue !== null
      ? fee + slippageQuoteValue
      : null;
    const allIn = grossNotional !== null && fee !== null
      ? side === "BUY" ? grossNotional + fee : grossNotional - fee
      : null;

    return {
      venue: evidence.venue,
      market: evidence.market,
      asset: evidence.asset,
      quoteAsset: evidence.quoteAsset,
      side,
      requestedQuantity,
      evidenceStatus: blockers.length === 0 ? "AVAILABLE" : "NO_DATA",
      state: blockers.length === 0 ? "ECONOMICS_PASS" : "REJECTED",
      orderBookTimestamp: evidence.orderBookTimestamp,
      orderBookAgeMs,
      bestPrice,
      vwapPrice: fill.vwap === null ? null : round(fill.vwap),
      executableQuantity: round(fill.quantity),
      unfilledQuantity,
      grossNotionalQuoteValue: grossNotional === null ? null : round(grossNotional),
      takerFeePercent: evidence.takerFeePercent,
      feeSource: evidence.feeSource,
      feeSynchronizedAt: evidence.feeSynchronizedAt,
      feeExpiresAt: evidence.feeExpiresAt,
      estimatedFeeQuoteValue: fee === null ? null : round(fee),
      slippagePercent: slippagePercent === null ? null : round(slippagePercent),
      estimatedSlippageQuoteValue: slippageQuoteValue === null ? null : round(slippageQuoteValue),
      totalModeledFrictionQuoteValue: friction === null ? null : round(friction),
      modeledAllInQuoteValue: allIn === null ? null : round(allIn),
      blockers: [
        ...new Set(blockers),
      ],
      executionAuthorized: false,
    };
  }

  private validateFee(
    configuration: HedgeInventoryManagementConfiguration,
    evidence: HedgeInventoryRouteMarketEvidence,
    now: number,
    blockers: HedgeInventoryRouteCandidateBlocker[],
  ): void {
    if (
      !Number.isFinite(evidence.takerFeePercent) ||
      evidence.takerFeePercent < 0 ||
      evidence.takerFeePercent >= 100 ||
      !["STATIC_CONFIG", "PUBLIC_API", "ACCOUNT_API"].includes(evidence.feeSource) ||
      (
        evidence.feeExpiresAt !== null &&
        (
          !Number.isFinite(evidence.feeExpiresAt) ||
          evidence.feeExpiresAt <= 0
        )
      )
    ) {
      blockers.push("INVALID_FEE_EVIDENCE");
      return;
    }

    if (evidence.feeExpiresAt !== null && evidence.feeExpiresAt < now) {
      blockers.push("FEE_EVIDENCE_STALE");
    }

    if (evidence.feeSource === "STATIC_CONFIG") {
      if (evidence.feeSynchronizedAt !== null) {
        if (!Number.isFinite(evidence.feeSynchronizedAt) || evidence.feeSynchronizedAt <= 0) {
          blockers.push("INVALID_FEE_EVIDENCE");
        } else if (evidence.feeSynchronizedAt > now) {
          blockers.push("FEE_EVIDENCE_FROM_FUTURE");
        }
      }
      return;
    }

    if (
      evidence.feeSynchronizedAt === null ||
      !Number.isFinite(evidence.feeSynchronizedAt) ||
      evidence.feeSynchronizedAt <= 0
    ) {
      blockers.push("INVALID_FEE_EVIDENCE");
      return;
    }

    if (evidence.feeSynchronizedAt > now) {
      blockers.push("FEE_EVIDENCE_FROM_FUTURE");
    } else if (
      now - evidence.feeSynchronizedAt >
      configuration.routeEconomics.maximumFeeAgeMs!
    ) {
      blockers.push("FEE_EVIDENCE_STALE");
    }
  }

  private levelsValid(levels: readonly HedgeInventoryRouteOrderBookLevel[]): boolean {
    return Array.isArray(levels) && levels.length > 0 && levels.every(
      (level) =>
        Number.isFinite(level.price) &&
        level.price > 0 &&
        Number.isFinite(level.quantity) &&
        level.quantity > 0,
    );
  }

  private isSorted(
    levels: readonly HedgeInventoryRouteOrderBookLevel[],
    direction: "ASC" | "DESC",
  ): boolean {
    return levels.every(
      (level, index) =>
        index === 0 ||
        (direction === "ASC"
          ? levels[index - 1]!.price <= level.price
          : levels[index - 1]!.price >= level.price),
    );
  }

  private calculateVwap(
    levels: readonly HedgeInventoryRouteOrderBookLevel[],
    requestedQuantity: number,
  ): { quantity: number; total: number | null; vwap: number | null } {
    let remaining = requestedQuantity;
    let quantity = 0;
    let total = 0;

    for (const level of levels) {
      if (remaining <= 1e-12) break;
      const consumed = Math.min(remaining, level.quantity);
      quantity += consumed;
      total += consumed * level.price;
      remaining -= consumed;
    }

    return {
      quantity,
      total: quantity > 0 ? total : null,
      vwap: quantity > 0 ? total / quantity : null,
    };
  }

  private compareCandidates(
    first: HedgeInventoryRouteCandidate,
    second: HedgeInventoryRouteCandidate,
  ): number {
    const economicComparison = first.side === "BUY"
      ? first.modeledAllInQuoteValue! - second.modeledAllInQuoteValue!
      : second.modeledAllInQuoteValue! - first.modeledAllInQuoteValue!;

    return economicComparison ||
      first.venue.localeCompare(second.venue) ||
      first.market.localeCompare(second.market);
  }

  private unavailable(
    configuration: HedgeInventoryManagementConfiguration,
    targets: HedgeInventoryShadowTargetSnapshot,
    routeEvidence: HedgeInventoryRouteEvidenceSnapshot | null,
    now: number,
    blocker: HedgeInventoryRouteGlobalBlocker,
  ): HedgeInventoryRouteEconomicsSnapshot {
    return immutableClone({
      version: "22.3",
      strategyId: HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
      generatedAt: now,
      evidenceStatus: "NO_DATA",
      configurationState: configuration.state,
      routeEconomicsConfigurationState: configuration.routeEconomics.state,
      sourceTargetGeneratedAt: targets.generatedAt,
      sourceRouteEvidenceGeneratedAt: routeEvidence?.generatedAt ?? null,
      summary: {
        targetsRequiringRoute: 0,
        candidatesEvaluated: 0,
        candidatesPassingEconomics: 0,
        shadowRoutesSelected: 0,
        blockedTargets: configuration.assetAllowlist.length,
        modeledFeeQuoteValue: null,
        modeledSlippageQuoteValue: null,
        actionableRoutes: 0,
        intentsGenerated: 0,
      },
      routes: [],
      blockers: [blocker],
      notes: NOTES,
      safety: SAFETY,
    });
  }

  private validateNow(now: number): void {
    if (!Number.isFinite(now) || now <= 0) {
      throw new Error("Hedge route-economics timestamp must be a positive finite number.");
    }
  }
}

function round(value: number, decimalPlaces = 8): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
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

