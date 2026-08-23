import {PROFIT_TIER_POLICY} from "../../../arbitrage/config/profitTiers";
import {
  strategyOnePilotEquivalentPaperEvidenceService,
  type StrategyOnePilotEquivalentPaperEvidenceReport,
  type StrategyOnePilotEquivalentRouteReport,
  type StrategyOnePilotExchange,
} from "../../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";
import {
  strategyOnePilotPreflightService,
  type StrategyOnePilotCheck,
  type StrategyOnePilotPreviewReport,
} from "./StrategyOnePilotPreflightService";

const MINIMUM_POLICY_REVIEW_SPAN_MS = 3_600_000;
const CURRENT_ROUTE_AGE_MS = 30_000;

export type StrategyOneTinyLiveAuditCategory =
  | "PROFIT"
  | "FRESHNESS_TIMING"
  | "INVENTORY_RULES"
  | "FEES_DEPTH_STRESS"
  | "VENUE_PERMISSION"
  | "HISTORICAL_EVIDENCE";

export interface StrategyOneTinyLiveOpportunityAuditReport {
  readonly schemaVersion: "126.1";
  readonly generatedAt: number;
  readonly mode: "READ_ONLY_BINANCE_BYBIT_TINY_LIVE_OPPORTUNITY_AUDIT";
  readonly state: "COLLECTING" | "READY_FOR_POLICY_REVIEW";
  readonly thresholds: {
    readonly discoveryNetProfitPercent: number;
    readonly qualificationNetProfitPercent: number;
    readonly activeTinyLiveNetProfitPercent: number;
    /** Current authoritative LIVE profit floor. */
    readonly liveNetProfitPercent: number;
    readonly dispatchReservedMaximumBookAgeMs: number;
    readonly minimumPolicyReviewSpanMs: number;
  };
  readonly observation: {
    readonly firstObservedAt: number | null;
    readonly lastObservedAt: number | null;
    /** Backward-compatible alias for wallClockSpanMs. */
    readonly spanMs: number;
    readonly wallClockSpanMs: number;
    readonly eventSpanMs: number;
    readonly idleSinceLastObservationMs: number | null;
    readonly economicsGenerations: number;
    readonly profitBands: {
      readonly discovered: number;
      readonly qualified: number;
      readonly liveEligible: number;
    };
    readonly dispatchReservedLiveEligibleGenerations: number;
  };
  readonly blockerRanking: readonly {
    readonly rank: number;
    readonly code: string;
    readonly count: number;
    readonly detail: string;
  }[];
  readonly routeRanking: readonly {
    readonly rank: number;
    readonly routeKey: string;
    readonly market: string;
    readonly buyExchange: StrategyOnePilotExchange;
    readonly sellExchange: StrategyOnePilotExchange;
    readonly current: boolean;
    readonly lastObservedAt: number;
    readonly timingReady: boolean;
    readonly economicsGenerations: number;
    readonly liveEligibleGenerations: number;
    readonly qualifiedGenerations: number;
    readonly discoveredGenerations: number;
    readonly dispatchReservedLiveEligibleGenerations: number;
    readonly latestNetProfitPercent: number | null;
    readonly bestNetProfitPercent: number | null;
    readonly p95NetProfitPercent: number | null;
    readonly p50EstimatedFeeImpactPercent: number | null;
    readonly dominantBlocker: string | null;
  }[];
  readonly currentActionTime: {
    readonly state: StrategyOnePilotPreviewReport["state"];
    readonly selectedRouteKey: string | null;
    readonly fullyPreflightableMatches: number;
    readonly categories: readonly {
      readonly category: StrategyOneTinyLiveAuditCategory;
      readonly state: "PASS" | "BLOCKED" | "NOT_EVALUATED";
      readonly reasons: readonly string[];
    }[];
    readonly blockers: readonly string[];
  };
  readonly safety: {
    readonly readOnly: true;
    readonly policyMutationAllowed: false;
    readonly automaticFundMovementAllowed: false;
    readonly capitalReserved: false;
    readonly liveSessionCreated: false;
    readonly orderSubmissionAllowed: false;
    readonly orderSubmissionPerformed: false;
  };
}

export interface StrategyOneTinyLiveOpportunityAuditDependencies {
  getEvidence(now: number): StrategyOnePilotEquivalentPaperEvidenceReport;
  getCurrentPreview(now: number): StrategyOnePilotPreviewReport;
}

const DEFAULT_DEPENDENCIES: StrategyOneTinyLiveOpportunityAuditDependencies = {
  getEvidence: (now) => strategyOnePilotEquivalentPaperEvidenceService.getReport(now),
  getCurrentPreview: (now) => strategyOnePilotPreflightService.getPreview(now),
};

export class StrategyOneTinyLiveOpportunityAuditService {
  constructor(
    private readonly dependencies: StrategyOneTinyLiveOpportunityAuditDependencies =
      DEFAULT_DEPENDENCIES,
  ) {}

  getReport(now = Date.now()): StrategyOneTinyLiveOpportunityAuditReport {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Tiny-LIVE opportunity audit time is invalid.");
    }
    const evidence = this.dependencies.getEvidence(now);
    const preview = this.dependencies.getCurrentPreview(now);
    const routes = evidence.routes.filter((route) => route.economics.observedGenerations > 0);
    const firstObservedAt = minimumNullable(routes.map((route) => route.economics.firstObservedAt));
    const lastObservedAt = maximumNullable(routes.map((route) => route.economics.lastObservedAt));
    const eventSpanMs = firstObservedAt !== null && lastObservedAt !== null
      ? Math.max(0, lastObservedAt - firstObservedAt)
      : 0;
    const wallClockSpanMs = firstObservedAt !== null
      ? Math.max(0, now - firstObservedAt)
      : 0;
    const idleSinceLastObservationMs = lastObservedAt !== null
      ? Math.max(0, now - lastObservedAt)
      : null;
    const profitBands = routes.reduce((total, route) => {
      const bands = effectiveProfitBands(route);
      return {
        discovered: total.discovered + bands.discovered,
        qualified: total.qualified + bands.qualified,
        liveEligible: total.liveEligible + bands.liveEligible,
      };
    }, {discovered: 0, qualified: 0, liveEligible: 0});
    const economicsGenerations = routes.reduce(
      (total, route) => total + route.economics.observedGenerations,
      0,
    );
    const dispatchReservedLiveEligibleGenerations = routes.reduce(
      (total, route) => total + route.economics.dispatchReservedLiveEligibleGenerations,
      0,
    );

    return freeze({
      schemaVersion: "126.1" as const,
      generatedAt: now,
      mode: "READ_ONLY_BINANCE_BYBIT_TINY_LIVE_OPPORTUNITY_AUDIT" as const,
      state: wallClockSpanMs >= MINIMUM_POLICY_REVIEW_SPAN_MS
        ? "READY_FOR_POLICY_REVIEW" as const
        : "COLLECTING" as const,
      thresholds: {
        discoveryNetProfitPercent: PROFIT_TIER_POLICY.discoveryMinimumNetProfitPercent,
        qualificationNetProfitPercent: PROFIT_TIER_POLICY.qualificationMinimumNetProfitPercent,
        activeTinyLiveNetProfitPercent: preview.minimumCurrentNetProfitPercent,
        liveNetProfitPercent: PROFIT_TIER_POLICY.liveMinimumNetProfitPercent,
        dispatchReservedMaximumBookAgeMs: evidence.dispatchReservedMaximumBookAgeMs,
        minimumPolicyReviewSpanMs: MINIMUM_POLICY_REVIEW_SPAN_MS,
      },
      observation: {
        firstObservedAt,
        lastObservedAt,
        spanMs: wallClockSpanMs,
        wallClockSpanMs,
        eventSpanMs,
        idleSinceLastObservationMs,
        economicsGenerations,
        profitBands,
        dispatchReservedLiveEligibleGenerations,
      },
      blockerRanking: blockerRanking(routes),
      routeRanking: rankRoutes(routes, now),
      currentActionTime: currentActionTime(preview),
      safety: {
        readOnly: true as const,
        policyMutationAllowed: false as const,
        automaticFundMovementAllowed: false as const,
        capitalReserved: false as const,
        liveSessionCreated: false as const,
        orderSubmissionAllowed: false as const,
        orderSubmissionPerformed: false as const,
      },
    });
  }
}

function rankRoutes(
  routes: readonly StrategyOnePilotEquivalentRouteReport[],
  now: number,
): StrategyOneTinyLiveOpportunityAuditReport["routeRanking"] {
  return routes
    .map((route) => ({
      route,
      bands: effectiveProfitBands(route),
      blocker: dominantBlocker(route),
    }))
    .sort((first, second) =>
      second.route.economics.dispatchReservedLiveEligibleGenerations -
        first.route.economics.dispatchReservedLiveEligibleGenerations ||
      second.bands.liveEligible - first.bands.liveEligible ||
      second.route.dispatchReserved.generations - first.route.dispatchReserved.generations ||
      second.route.lastUniqueGenerationAt - first.route.lastUniqueGenerationAt ||
      first.route.routeKey.localeCompare(second.route.routeKey))
    .slice(0, 20)
    .map(({route, bands, blocker}, index) => ({
      rank: index + 1,
      routeKey: route.routeKey,
      market: route.market,
      buyExchange: route.buyExchange,
      sellExchange: route.sellExchange,
      current: now - route.lastUniqueGenerationAt <= CURRENT_ROUTE_AGE_MS,
      lastObservedAt: route.lastUniqueGenerationAt,
      timingReady: route.dispatchReserved.calibration.ready,
      economicsGenerations: route.economics.observedGenerations,
      liveEligibleGenerations: bands.liveEligible,
      qualifiedGenerations: bands.qualified,
      discoveredGenerations: bands.discovered,
      dispatchReservedLiveEligibleGenerations:
        route.economics.dispatchReservedLiveEligibleGenerations,
      latestNetProfitPercent: route.economics.latestNetProfitPercent,
      bestNetProfitPercent: route.economics.bestNetProfitPercent,
      p95NetProfitPercent: route.economics.netProfitPercent.p95Percent,
      p50EstimatedFeeImpactPercent:
        route.economics.estimatedFeeImpactPercent.p50Percent,
      dominantBlocker: blocker,
    }));
}

function blockerRanking(
  routes: readonly StrategyOnePilotEquivalentRouteReport[],
): StrategyOneTinyLiveOpportunityAuditReport["blockerRanking"] {
  const counts = new Map<string, {count: number; detail: string}>();
  const add = (code: string, count: number, detail: string): void => {
    if (count <= 0) return;
    const current = counts.get(code);
    counts.set(code, {count: (current?.count ?? 0) + count, detail});
  };
  for (const route of routes) {
    add("PROFIT_BELOW_LIVE_MINIMUM",
      effectiveProfitBands(route).discovered,
      `Historical fee-adjusted observations remained below the current ${
        PROFIT_TIER_POLICY.liveMinimumNetProfitPercent.toFixed(2)
      }% LIVE floor.`);
    add("NON_EXECUTE_DECISION",
      route.economics.decisions.review + route.economics.decisions.skip,
      "The central opportunity decision did not reach EXECUTE.");
    add("DISPATCH_FRESHNESS_OR_SKEW",
      route.dispatchReserved.rejectedExecutionGradeGenerations + route.rejectedGenerations,
      "Book age, timestamp skew, fallback or non-executable evidence failed the pilot boundary.");
    add("INSUFFICIENT_LIQUIDITY", route.economics.insufficientLiquidityGenerations,
      "Two-leg executable depth was insufficient for the evaluated amount.");
  }
  return [...counts.entries()]
    .map(([code, value]) => ({code, ...value}))
    .sort((first, second) => second.count - first.count || first.code.localeCompare(second.code))
    .map((item, index) => ({rank: index + 1, ...item}));
}

function dominantBlocker(route: StrategyOnePilotEquivalentRouteReport): string | null {
  const p95NetProfitPercent = route.economics.netProfitPercent.p95Percent;
  const profitBelowCurrentMinimum = p95NetProfitPercent !== null &&
    p95NetProfitPercent < PROFIT_TIER_POLICY.liveMinimumNetProfitPercent
    ? effectiveProfitBands(route).discovered
    : 0;
  const candidates = [
    ["PROFIT_BELOW_LIVE_MINIMUM", profitBelowCurrentMinimum],
    ["NON_EXECUTE_DECISION", route.economics.decisions.review + route.economics.decisions.skip],
    ["DISPATCH_FRESHNESS_OR_SKEW",
      route.dispatchReserved.rejectedExecutionGradeGenerations + route.rejectedGenerations],
    ["INSUFFICIENT_LIQUIDITY", route.economics.insufficientLiquidityGenerations],
  ] as const;
  return [...candidates].sort((first, second) => second[1] - first[1])[0]?.[1]
    ? [...candidates].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null
    : null;
}

/**
 * V126 evidence was originally persisted with a 0.30% qualification band and
 * a 0.50% LIVE band. Once both authoritative floors converge at 0.30%, those
 * historical 0.30%-0.50% observations are LIVE-eligible under the current
 * policy. Reclassify only while reporting; the append-only evidence remains
 * untouched.
 */
function effectiveProfitBands(
  route: StrategyOnePilotEquivalentRouteReport,
): StrategyOnePilotEquivalentRouteReport["economics"]["profitBands"] {
  const bands = route.economics.profitBands;
  if (PROFIT_TIER_POLICY.liveMinimumNetProfitPercent >
      PROFIT_TIER_POLICY.qualificationMinimumNetProfitPercent) {
    return bands;
  }
  return {
    discovered: bands.discovered,
    qualified: 0,
    liveEligible: bands.qualified + bands.liveEligible,
  };
}

function currentActionTime(
  preview: StrategyOnePilotPreviewReport,
): StrategyOneTinyLiveOpportunityAuditReport["currentActionTime"] {
  const selected = preview.selected;
  const categories: StrategyOneTinyLiveAuditCategory[] = [
    "PROFIT", "FRESHNESS_TIMING", "INVENTORY_RULES", "FEES_DEPTH_STRESS",
    "VENUE_PERMISSION", "HISTORICAL_EVIDENCE",
  ];
  return {
    state: preview.state,
    selectedRouteKey: selected?.routeKey ?? null,
    fullyPreflightableMatches: preview.evidence.fullyPreflightableMatches,
    categories: categories.map((category) => {
      const checks = selected?.checks.filter((check) => categoryFor(check) === category) ?? [];
      return {
        category,
        state: checks.length === 0
          ? "NOT_EVALUATED" as const
          : checks.every((check) => check.state === "PASS")
            ? "PASS" as const
            : "BLOCKED" as const,
        reasons: checks.flatMap((check) => check.reasons.length > 0
          ? check.reasons
          : [check.message]),
      };
    }),
    blockers: preview.blockers,
  };
}

function categoryFor(check: StrategyOnePilotCheck): StrategyOneTinyLiveAuditCategory {
  if (check.key === "CURRENT_LIVE_PROFIT_THRESHOLD") return "PROFIT";
  if (check.key === "CURRENT_DISPATCH_RESERVED_FRESHNESS" ||
      check.key === "PILOT_TIMING_HEADROOM") return "FRESHNESS_TIMING";
  if (check.key === "FRESH_TWO_LEG_FUNDING_AND_RULES") return "INVENTORY_RULES";
  if (check.key === "POST_STRESS_DEPTH_AND_ECONOMICS") return "FEES_DEPTH_STRESS";
  if (check.key === "AUDITED_LIVE_VENUE_CONTRACT" ||
      check.key === "API_KEY_PERMISSION_BOUNDARY") return "VENUE_PERMISSION";
  return "HISTORICAL_EVIDENCE";
}

function minimumNullable(values: readonly (number | null)[]): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length > 0 ? Math.min(...finite) : null;
}

function maximumNullable(values: readonly (number | null)[]): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

export const strategyOneTinyLiveOpportunityAuditService =
  new StrategyOneTinyLiveOpportunityAuditService();
