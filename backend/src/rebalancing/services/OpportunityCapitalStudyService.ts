import type {ArbitrageOpportunity} from "../../arbitrage/models/ArbitrageOpportunity";
import {
  isStrategyOneTinyLiveDynamicRoute,
} from "../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";
import {
  STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
  STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS,
} from "../../arbitrage/execution/StrategyOneLiveTimingPolicy";
import {
  opportunityService,
  type OpportunitySnapshot,
} from "../../arbitrage/services/OpportunityService";
import {getLiveOnlyRuntimePolicy} from "../../config/LiveOnlyRuntimePolicy";
import {
  strategyOneFundedRouteService,
  type StrategyOneFundedRouteReport,
} from "../../trading/execution/StrategyOneFundedRouteService";
import {tradingAccountService} from "../../trading/account/TradingAccountService";
import {
  capitalManagerSafetyContextService,
  type CapitalManagerSafetyContext,
} from "./CapitalManagerSafetyContextService";

export const CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES = 5;
export const CAPITAL_STUDY_REQUIRED_QUALIFICATION_CYCLES = 5;
export const CAPITAL_STUDY_REQUIRED_TOTAL_SAMPLES =
  CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES *
  CAPITAL_STUDY_REQUIRED_QUALIFICATION_CYCLES;
export const CAPITAL_STUDY_MINIMUM_SAMPLE_SPACING_MS = 750;
export const CAPITAL_STUDY_BASELINE_NET_PERCENT = 1.50;
export const CAPITAL_STUDY_INTERMEDIATE_NET_PERCENT = 1.40;
export const CAPITAL_STUDY_HARD_NET_FLOOR_PERCENT = 1.30;

const MAXIMUM_TRACKED_ROUTES = 64;
const MAXIMUM_CURRENT_ROUTE_AGE_MS = 2_000;
const RESET_QUALIFICATION_AFTER_MS = 5 * 60_000;

export type OpportunityCapitalStudyStatus =
  | "STUDYING"
  | "EXECUTION_STUDY_READY"
  | "CAPITAL_STUDY_READY";

export type OpportunityCapitalRecommendation =
  | "WAIT_FOR_MORE_EVIDENCE"
  | "READY_FOR_EXACT_PREFLIGHT"
  | "FUNDED"
  | "ADD_USDT_TO_BUY_EXCHANGE"
  | "ADD_BASE_TO_SELL_EXCHANGE"
  | "RESTORE_BOTH_LEGS"
  | "WAIT_FOR_FRESH_BALANCES";

export interface OpportunityCapitalFundingStudy {
  readonly buyExchange: string;
  readonly buyAsset: string | null;
  readonly buyRequired: number | null;
  readonly buyAvailable: number | null;
  readonly buyShortfall: number | null;
  readonly buySufficient: boolean;
  readonly sellExchange: string;
  readonly sellAsset: string | null;
  readonly sellRequired: number | null;
  readonly sellAvailable: number | null;
  readonly sellShortfall: number | null;
  readonly sellSufficient: boolean;
}

export interface OpportunityCapitalStudyDecision {
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly opportunityId: string;
  readonly status: OpportunityCapitalStudyStatus;
  readonly executionQualified: boolean;
  readonly capitalActionQualified: boolean;
  readonly currentConsecutiveSamples: number;
  readonly requiredCurrentSamples: 5;
  readonly completedQualificationCycles: number;
  readonly requiredQualificationCycles: 5;
  readonly totalIndependentSamples: number;
  readonly requiredTotalSamplesForCapital: 25;
  readonly effectiveMinimumCurrentNetProfitPercent: number;
  readonly baselineMinimumCurrentNetProfitPercent: 1.5;
  readonly hardMinimumCurrentNetProfitPercent: 1.3;
  readonly latestNetProfitPercent: number;
  readonly latestObservedAt: number;
  readonly latestEvidenceAgeMs: number;
  readonly recommendation: OpportunityCapitalRecommendation;
  readonly recommendationDetail: string;
  readonly funding: OpportunityCapitalFundingStudy | null;
  readonly blockers: readonly string[];
  readonly safety: {
    readonly studyOnly: true;
    readonly restartResetsQualification: true;
    readonly hardGatesAutoRelaxed: false;
    readonly recoveryClean: boolean;
    readonly movementAllowed: boolean;
    readonly orderSubmissionAllowed: false;
  };
}

export interface OpportunityCapitalStudyReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly running: boolean;
  readonly trackedRoutes: number;
  readonly executionStudyReadyRoutes: number;
  readonly capitalStudyReadyRoutes: number;
  readonly policy: {
    readonly independentSamplesPerExecutionDecision: 5;
    readonly qualificationCyclesForCapitalAction: 5;
    readonly independentSamplesForCapitalAction: 25;
    readonly minimumSampleSpacingMs: 750;
    readonly adaptiveCurrentNetLadderPercent: readonly [1.5, 1.4, 1.3];
    readonly postStressNetHardFloorPercent: number;
    readonly maximumBookAgeMs: number;
    readonly maximumBookSkewMs: number;
  };
  readonly routes: readonly OpportunityCapitalStudyDecision[];
}

export interface OpportunityCapitalMovementAuthorization {
  readonly routeKey: string;
  readonly destinationExchange: string;
  readonly asset: "USDT";
  readonly maximumAmountUsdt: number;
  readonly observedAt: number;
}

interface RouteState {
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  opportunityId: string;
  latestNetProfitPercent: number;
  latestObservedAt: number;
  lastIndependentSampleAt: number;
  lastSampleIdentity: string | null;
  currentConsecutiveSamples: number;
  samplesInQualificationCycle: number;
  completedQualificationCycles: number;
  totalIndependentSamples: number;
  recentSafeNetProfitPercents: number[];
  latestSampleBlockers: string[];
  funding: OpportunityCapitalFundingStudy | null;
}

export interface OpportunityCapitalStudyDependencies {
  readonly subscribe: (
    listener: (snapshot: OpportunitySnapshot) => void,
  ) => () => void;
  readonly evaluateFunding: (
    opportunity: ArbitrageOpportunity,
    now: number,
  ) => StrategyOneFundedRouteReport;
  readonly getSafetyContext: (now: number) => CapitalManagerSafetyContext;
  readonly now: () => number;
}

const DEFAULT_DEPENDENCIES: OpportunityCapitalStudyDependencies = {
  subscribe: (listener) =>
    opportunityService.subscribeToOpportunitySnapshots(listener),
  evaluateFunding: (opportunity, now) => {
    const policy = getLiveOnlyRuntimePolicy();
    return strategyOneFundedRouteService.evaluate({
      opportunity,
      requestedCapitalInr: policy.preferredCapitalPerLegInr,
      maximumCapitalPerLegInr: policy.maximumCapitalPerLegInr,
      allowMinimumOrderRoundUpWithinHardCap: true,
      enforceRequestedCapitalFloorWithinHardCap: true,
      fundingBoundary: "AUTHENTICATED_LIVE_READINESS",
      now,
    });
  },
  getSafetyContext: (now) =>
    capitalManagerSafetyContextService.getContext(
      tradingAccountService.getAccount(),
      now,
    ),
  now: Date.now,
};

/**
 * Continuously studies each exact BUY/SELL route without exchange I/O. It can
 * lower only the route's first current-net admission gate, never a safety,
 * depth, balance, recovery, capital-cap or post-stress gate.
 */
export class OpportunityCapitalStudyService {
  private readonly routes = new Map<string, RouteState>();
  private unsubscribe: (() => void) | null = null;
  private running = false;

  constructor(
    private readonly dependencies: OpportunityCapitalStudyDependencies =
      DEFAULT_DEPENDENCIES,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribe = this.dependencies.subscribe((snapshot) => {
      this.observeSnapshot(snapshot);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.running = false;
  }

  observeSnapshot(snapshot: OpportunitySnapshot): void {
    const now = snapshot.generatedAt;
    if (!Number.isSafeInteger(now) || now <= 0) return;

    const present = new Set<string>();
    for (const opportunity of snapshot.opportunities) {
      if (!this.isAuditedRoute(opportunity)) continue;
      const routeKey = this.routeKey(opportunity);
      present.add(routeKey);
      const state = this.getOrCreateState(opportunity, now);
      this.observeOpportunity(state, opportunity, now);
    }

    for (const state of this.routes.values()) {
      if (
        !present.has(state.routeKey) &&
        now - state.latestObservedAt > MAXIMUM_CURRENT_ROUTE_AGE_MS
      ) {
        state.currentConsecutiveSamples = 0;
        state.samplesInQualificationCycle = 0;
        state.recentSafeNetProfitPercents = [];
        state.latestSampleBlockers = [
          "The exact route is absent from the current opportunity snapshot.",
        ];
      }
      if (now - state.latestObservedAt > RESET_QUALIFICATION_AFTER_MS) {
        state.completedQualificationCycles = 0;
        state.totalIndependentSamples = 0;
      }
    }
    this.enforceBound();
  }

  getDecision(
    opportunity: ArbitrageOpportunity,
    now = this.dependencies.now(),
  ): OpportunityCapitalStudyDecision {
    const state = this.routes.get(this.routeKey(opportunity));
    if (!state) {
      return this.emptyDecision(opportunity, now);
    }
    return this.buildDecision(state, opportunity, now);
  }

  getReport(now = this.dependencies.now()): OpportunityCapitalStudyReport {
    const safety = this.safeContext(now);
    const routes = [...this.routes.values()]
      .map((state) => this.buildDecision(state, null, now, safety))
      .sort((first, second) =>
        Number(second.capitalActionQualified) -
          Number(first.capitalActionQualified) ||
        Number(second.executionQualified) - Number(first.executionQualified) ||
        second.latestObservedAt - first.latestObservedAt,
      );
    return Object.freeze({
      schemaVersion: "1.0" as const,
      generatedAt: now,
      running: this.running,
      trackedRoutes: routes.length,
      executionStudyReadyRoutes: routes.filter((route) => route.executionQualified).length,
      capitalStudyReadyRoutes: routes.filter((route) => route.capitalActionQualified).length,
      policy: Object.freeze({
        independentSamplesPerExecutionDecision: 5 as const,
        qualificationCyclesForCapitalAction: 5 as const,
        independentSamplesForCapitalAction: 25 as const,
        minimumSampleSpacingMs: 750 as const,
        adaptiveCurrentNetLadderPercent: Object.freeze([1.5, 1.4, 1.3] as const),
        postStressNetHardFloorPercent:
          getLiveOnlyRuntimePolicy().minimumPostStressNetProfitPercent,
        maximumBookAgeMs:
          STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS,
        maximumBookSkewMs: STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS,
      }),
      routes: Object.freeze(routes),
    });
  }

  getCrossExchangeMovementAuthorizations(
    now = this.dependencies.now(),
  ): readonly OpportunityCapitalMovementAuthorization[] {
    const safety = this.safeContext(now);
    if (!this.movementAllowed(safety)) return Object.freeze([]);

    return Object.freeze(
      [...this.routes.values()]
        .map((state) => this.buildDecision(state, null, now, safety))
        .filter((decision) =>
          decision.capitalActionQualified &&
          decision.funding?.buyAsset === "USDT" &&
          decision.funding.buySufficient === false &&
          decision.funding.sellSufficient === true &&
          decision.funding.buyShortfall !== null &&
          decision.funding.buyShortfall > 0 &&
          (decision.buyExchange === "bybit" || decision.buyExchange === "coindcx"),
        )
        .map((decision) => ({
          routeKey: decision.routeKey,
          destinationExchange: decision.buyExchange,
          asset: "USDT" as const,
          maximumAmountUsdt: decision.funding!.buyShortfall!,
          observedAt: decision.latestObservedAt,
        })),
    );
  }

  private observeOpportunity(
    state: RouteState,
    opportunity: ArbitrageOpportunity,
    now: number,
  ): void {
    state.opportunityId = opportunity.id;
    state.latestNetProfitPercent = opportunity.netProfitPercent;
    state.latestObservedAt = now;
    const currentMarketBlockers = this.marketEvidenceBlockers(opportunity, now);
    if (currentMarketBlockers.length > 0) {
      state.latestSampleBlockers = [...new Set(currentMarketBlockers)];
      state.currentConsecutiveSamples = 0;
      state.samplesInQualificationCycle = 0;
      state.recentSafeNetProfitPercents = [];
    }
    const identity = `${opportunity.pair.buy.timestamp}|${opportunity.pair.sell.timestamp}`;
    if (
      identity === state.lastSampleIdentity ||
      now - state.lastIndependentSampleAt < CAPITAL_STUDY_MINIMUM_SAMPLE_SPACING_MS
    ) {
      return;
    }

    state.lastSampleIdentity = identity;
    state.lastIndependentSampleAt = now;
    let funding: StrategyOneFundedRouteReport | null = null;
    const blockers = [...currentMarketBlockers];
    try {
      funding = this.dependencies.evaluateFunding(opportunity, now);
      state.funding = this.toFundingStudy(funding);
      if (!funding.baseAsset || !funding.quoteAsset) {
        blockers.push("Base or quote funding asset is unresolved.");
      }
      if (funding.multiLevelDepthEvidence?.status !== "PASSED") {
        blockers.push("Fresh multi-level shared depth did not pass.");
      }
      if (
        funding.convertedQuoteCapital === null ||
        funding.capitalQuantity === null ||
        funding.preFundingQuantity === null ||
        funding.preFundingQuantity <= 0
      ) {
        blockers.push("Exact ₹600–₹1,000 capital sizing is unavailable.");
      }
    } catch (error: unknown) {
      blockers.push(
        `Cached funding study failed closed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    state.totalIndependentSamples += 1;
    state.latestSampleBlockers = [...new Set(blockers)];
    if (state.latestSampleBlockers.length > 0) {
      state.currentConsecutiveSamples = 0;
      state.samplesInQualificationCycle = 0;
      state.recentSafeNetProfitPercents = [];
      return;
    }

    state.currentConsecutiveSamples = Math.min(
      CAPITAL_STUDY_REQUIRED_TOTAL_SAMPLES,
      state.currentConsecutiveSamples + 1,
    );
    state.samplesInQualificationCycle += 1;
    state.recentSafeNetProfitPercents.push(opportunity.netProfitPercent);
    state.recentSafeNetProfitPercents = state.recentSafeNetProfitPercents.slice(
      -CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES,
    );
    if (state.samplesInQualificationCycle >= CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES) {
      state.completedQualificationCycles = Math.min(
        CAPITAL_STUDY_REQUIRED_QUALIFICATION_CYCLES,
        state.completedQualificationCycles + 1,
      );
      state.samplesInQualificationCycle = 0;
    }
  }

  private buildDecision(
    state: RouteState,
    opportunity: ArbitrageOpportunity | null,
    now: number,
    suppliedSafety?: CapitalManagerSafetyContext,
  ): OpportunityCapitalStudyDecision {
    const safety = suppliedSafety ?? this.safeContext(now);
    const evidenceAgeMs = Math.max(0, now - state.lastIndependentSampleAt);
    const threshold = this.effectiveThreshold(state);
    const currentBlockers = opportunity
      ? this.marketEvidenceBlockers(opportunity, now, threshold)
      : state.latestSampleBlockers;
    const executionQualified =
      state.currentConsecutiveSamples >= CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES &&
      state.recentSafeNetProfitPercents.length >= CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES &&
      evidenceAgeMs >= 0 && evidenceAgeMs <= MAXIMUM_CURRENT_ROUTE_AGE_MS &&
      currentBlockers.length === 0;
    const capitalActionQualified =
      executionQualified &&
      state.completedQualificationCycles >= CAPITAL_STUDY_REQUIRED_QUALIFICATION_CYCLES;
    const recommendation = this.recommend(
      state.funding,
      executionQualified,
      capitalActionQualified,
    );
    const recoveryClean =
      !safety.executionRecoveryPending &&
      !safety.settlementReconciliationPending &&
      !safety.emergencyStopActive;
    const blockers = [...new Set([
      ...state.latestSampleBlockers,
      ...currentBlockers,
      ...(executionQualified
        ? []
        : [`Need ${Math.max(
            0,
            CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES - state.currentConsecutiveSamples,
          )} more consecutive independent safe sample(s).`]),
      ...(capitalActionQualified
        ? []
        : [`Capital action needs ${Math.max(
            0,
            CAPITAL_STUDY_REQUIRED_QUALIFICATION_CYCLES -
              state.completedQualificationCycles,
          )} more five-sample qualification cycle(s).`]),
      ...(recoveryClean ? [] : ["Recovery, settlement or emergency-stop safety blocks capital movement."]),
    ])];
    const status: OpportunityCapitalStudyStatus = capitalActionQualified
      ? "CAPITAL_STUDY_READY"
      : executionQualified
        ? "EXECUTION_STUDY_READY"
        : "STUDYING";

    return Object.freeze({
      routeKey: state.routeKey,
      market: state.market,
      buyExchange: state.buyExchange,
      sellExchange: state.sellExchange,
      opportunityId: opportunity?.id ?? state.opportunityId,
      status,
      executionQualified,
      capitalActionQualified,
      currentConsecutiveSamples: Math.min(
        CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES,
        state.currentConsecutiveSamples,
      ),
      requiredCurrentSamples: 5 as const,
      completedQualificationCycles: state.completedQualificationCycles,
      requiredQualificationCycles: 5 as const,
      totalIndependentSamples: state.totalIndependentSamples,
      requiredTotalSamplesForCapital: 25 as const,
      effectiveMinimumCurrentNetProfitPercent: threshold,
      baselineMinimumCurrentNetProfitPercent: 1.5 as const,
      hardMinimumCurrentNetProfitPercent: 1.3 as const,
      latestNetProfitPercent: opportunity?.netProfitPercent ?? state.latestNetProfitPercent,
      latestObservedAt: state.latestObservedAt,
      latestEvidenceAgeMs: evidenceAgeMs,
      recommendation: recommendation.action,
      recommendationDetail: recommendation.detail,
      funding: state.funding ? Object.freeze({...state.funding}) : null,
      blockers: Object.freeze(blockers),
      safety: Object.freeze({
        studyOnly: true as const,
        restartResetsQualification: true as const,
        hardGatesAutoRelaxed: false as const,
        recoveryClean,
        movementAllowed: recoveryClean && capitalActionQualified,
        orderSubmissionAllowed: false as const,
      }),
    });
  }

  private emptyDecision(
    opportunity: ArbitrageOpportunity,
    now: number,
  ): OpportunityCapitalStudyDecision {
    const state = this.getOrCreateState(opportunity, now);
    state.latestSampleBlockers = ["This exact route has no independent study sample yet."];
    return this.buildDecision(state, opportunity, now);
  }

  private marketEvidenceBlockers(
    opportunity: ArbitrageOpportunity,
    now: number,
    threshold = CAPITAL_STUDY_HARD_NET_FLOOR_PERCENT,
  ): string[] {
    const blockers: string[] = [];
    const buyAge = now - opportunity.pair.buy.timestamp;
    const sellAge = now - opportunity.pair.sell.timestamp;
    const skew = Math.abs(
      opportunity.pair.buy.timestamp - opportunity.pair.sell.timestamp,
    );
    if (opportunity.decision !== "EXECUTE") {
      blockers.push(`Opportunity-engine decision is ${opportunity.decision}, not EXECUTE.`);
    }
    if (!opportunity.quotesAreFresh || opportunity.usedLastPriceFallback) {
      blockers.push("Quotes must be fresh executable books without fallback prices.");
    }
    if (!opportunity.enoughLiquidity || opportunity.score < 65) {
      blockers.push("Liquidity or central execution-quality score is below the hard requirement.");
    }
    if (
      !Number.isFinite(opportunity.netProfitPercent) ||
      opportunity.netProfitPercent < threshold
    ) {
      blockers.push(`Current fee-adjusted net must be at least ${threshold.toFixed(2)}%.`);
    }
    if (
      !Number.isFinite(opportunity.buyPrice) || opportunity.buyPrice <= 0 ||
      !Number.isFinite(opportunity.sellPrice) || opportunity.sellPrice <= 0 ||
      !Number.isFinite(opportunity.executableQty) || opportunity.executableQty <= 0
    ) {
      blockers.push("Executable prices and quantity must be finite and positive.");
    }
    if (
      !Number.isSafeInteger(buyAge) || buyAge < 0 ||
      buyAge > STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS ||
      !Number.isSafeInteger(sellAge) || sellAge < 0 ||
      sellAge > STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS
    ) {
      blockers.push(
        `Both books must be 0-${STRATEGY_ONE_LIVE_DISPATCH_RESERVED_MAXIMUM_BOOK_AGE_MS} ms old.`,
      );
    }
    if (!Number.isSafeInteger(skew) || skew > STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS) {
      blockers.push(`BUY/SELL book skew must be at most ${STRATEGY_ONE_LIVE_MAXIMUM_BOOK_SKEW_MS} ms.`);
    }
    return blockers;
  }

  private effectiveThreshold(state: RouteState): number {
    if (state.recentSafeNetProfitPercents.length < CAPITAL_STUDY_REQUIRED_CURRENT_SAMPLES) {
      return CAPITAL_STUDY_BASELINE_NET_PERCENT;
    }
    const minimum = Math.min(...state.recentSafeNetProfitPercents);
    if (minimum >= CAPITAL_STUDY_BASELINE_NET_PERCENT) {
      return CAPITAL_STUDY_BASELINE_NET_PERCENT;
    }
    if (minimum >= CAPITAL_STUDY_INTERMEDIATE_NET_PERCENT) {
      return CAPITAL_STUDY_INTERMEDIATE_NET_PERCENT;
    }
    return CAPITAL_STUDY_HARD_NET_FLOOR_PERCENT;
  }

  private toFundingStudy(report: StrategyOneFundedRouteReport): OpportunityCapitalFundingStudy {
    const buyShortfall = shortfall(report.buyFunding.requiredBalance, report.buyFunding.availableBalance);
    const sellShortfall = shortfall(report.sellFunding.requiredBalance, report.sellFunding.availableBalance);
    return {
      buyExchange: report.buyFunding.exchange,
      buyAsset: report.buyFunding.asset,
      buyRequired: report.buyFunding.requiredBalance,
      buyAvailable: report.buyFunding.availableBalance,
      buyShortfall,
      buySufficient: report.buyFunding.sufficient,
      sellExchange: report.sellFunding.exchange,
      sellAsset: report.sellFunding.asset,
      sellRequired: report.sellFunding.requiredBalance,
      sellAvailable: report.sellFunding.availableBalance,
      sellShortfall,
      sellSufficient: report.sellFunding.sufficient,
    };
  }

  private recommend(
    funding: OpportunityCapitalFundingStudy | null,
    executionQualified: boolean,
    capitalActionQualified: boolean,
  ): {action: OpportunityCapitalRecommendation; detail: string} {
    if (!executionQualified) {
      return {
        action: "WAIT_FOR_MORE_EVIDENCE",
        detail: "Keep observing this exact route; no old snapshot can execute or move capital.",
      };
    }
    if (!funding || funding.buyAvailable === null || funding.sellAvailable === null) {
      return {
        action: "WAIT_FOR_FRESH_BALANCES",
        detail: "Fresh authenticated BUY quote balance and SELL base inventory are required.",
      };
    }
    if (funding.buySufficient && funding.sellSufficient) {
      return capitalActionQualified
        ? {action: "FUNDED", detail: "Both exact legs are funded; wait for a new full preflight and final last-look."}
        : {action: "READY_FOR_EXACT_PREFLIGHT", detail: "Execution study passed and both legs are funded; capital movement is unnecessary."};
    }
    if (!funding.buySufficient && !funding.sellSufficient) {
      return {
        action: "RESTORE_BOTH_LEGS",
        detail: "BUY venue needs quote currency and SELL venue needs base inventory. Prefer a profitable reverse route; never synthesize an unaudited conversion.",
      };
    }
    if (!funding.buySufficient) {
      return {
        action: "ADD_USDT_TO_BUY_EXCHANGE",
        detail: "After five qualification cycles, only a bounded whitelisted USDT move may cover this exact BUY shortfall.",
      };
    }
    return {
      action: "ADD_BASE_TO_SELL_EXCHANGE",
      detail: "SELL base inventory is short. Prefer a profitable reverse route; automatic base conversion/withdrawal remains blocked until audited.",
    };
  }

  private getOrCreateState(opportunity: ArbitrageOpportunity, now: number): RouteState {
    const routeKey = this.routeKey(opportunity);
    const existing = this.routes.get(routeKey);
    if (existing) return existing;
    const state: RouteState = {
      routeKey,
      market: opportunity.pair.market.trim().toUpperCase(),
      buyExchange: opportunity.pair.buy.exchange.trim().toLowerCase(),
      sellExchange: opportunity.pair.sell.exchange.trim().toLowerCase(),
      opportunityId: opportunity.id,
      latestNetProfitPercent: opportunity.netProfitPercent,
      latestObservedAt: now,
      lastIndependentSampleAt: 0,
      lastSampleIdentity: null,
      currentConsecutiveSamples: 0,
      samplesInQualificationCycle: 0,
      completedQualificationCycles: 0,
      totalIndependentSamples: 0,
      recentSafeNetProfitPercents: [],
      latestSampleBlockers: [],
      funding: null,
    };
    this.routes.set(routeKey, state);
    return state;
  }

  private routeKey(opportunity: ArbitrageOpportunity): string {
    return [
      opportunity.pair.market.trim().toUpperCase(),
      opportunity.pair.buy.exchange.trim().toLowerCase(),
      opportunity.pair.sell.exchange.trim().toLowerCase(),
    ].join("|");
  }

  private isAuditedRoute(opportunity: ArbitrageOpportunity): boolean {
    return isStrategyOneTinyLiveDynamicRoute({
      market: opportunity.pair.market,
      buyExchange: opportunity.pair.buy.exchange,
      sellExchange: opportunity.pair.sell.exchange,
    });
  }

  private safeContext(now: number): CapitalManagerSafetyContext {
    try {
      return this.dependencies.getSafetyContext(now);
    } catch {
      return {
        executionRecoveryPending: true,
        settlementReconciliationPending: true,
        emergencyStopActive: true,
      };
    }
  }

  private movementAllowed(context: CapitalManagerSafetyContext): boolean {
    return !context.executionRecoveryPending &&
      !context.settlementReconciliationPending &&
      !context.emergencyStopActive;
  }

  private enforceBound(): void {
    while (this.routes.size > MAXIMUM_TRACKED_ROUTES) {
      const oldest = [...this.routes.values()]
        .sort((first, second) => first.latestObservedAt - second.latestObservedAt)[0];
      if (!oldest) return;
      this.routes.delete(oldest.routeKey);
    }
  }
}

function shortfall(required: number | null, available: number | null): number | null {
  return required !== null && available !== null
    ? Math.max(0, required - available)
    : null;
}

export const opportunityCapitalStudyService =
  new OpportunityCapitalStudyService();
