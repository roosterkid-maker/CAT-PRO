import type {
  StrategyOneExecutionTimingReport,
  StrategyOneRouteTimingReport,
} from "../../arbitrage/execution/StrategyOneExecutionTimingEvidenceService";
import {
  strategyOneExecutionTimingEvidenceService,
} from "../../arbitrage/execution/StrategyOneExecutionTimingEvidenceService";
import type {
  StrategyOneTwoLegSessionRecord,
} from "../../execution/live/arbitrage/StrategyOneTwoLegLiveExecutionService";
import {
  strategyOneTwoLegLiveExecutionService,
} from "../../execution/live/arbitrage/StrategyOneTwoLegLiveExecutionService";
import type {
  ExecutionSettlementRecord,
} from "../../execution/live/settlement/ExecutionSettlementRecord";
import {
  persistentExecutionSettlementService,
} from "../../execution/live/settlement/PersistentExecutionSettlementService";
import type {
  StrategyOneTinyLiveOpportunityAuditReport,
} from "../../execution/live/tiny-live/StrategyOneTinyLiveOpportunityAuditService";
import {
  strategyOneTinyLiveOpportunityAuditService,
} from "../../execution/live/tiny-live/StrategyOneTinyLiveOpportunityAuditService";

const HOUR_MS = 60 * 60 * 1_000;
const DEFAULT_CACHE_TTL_MS = 5_000;
const MINIMUM_RECOMMENDATION_SAMPLE = 10;

export type AgentSakhondraState =
  | "NO_LIVE_ATTEMPTS"
  | "LIVE_EVIDENCE_COLLECTING"
  | "LIVE_EVIDENCE_AVAILABLE"
  | "ATTENTION_REQUIRED";

export interface AgentSakhondraRecommendation {
  readonly id: string;
  readonly priority: "P0" | "P1" | "P2";
  readonly area: "EXECUTION" | "PROFIT" | "TIMING" | "DATA" | "INVENTORY";
  readonly title: string;
  readonly finding: string;
  readonly observed: string;
  readonly target: string;
  readonly action: string;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
  readonly evidenceSamples: number;
  readonly requiresHumanApproval: true;
}

export interface AgentSakhondraRouteReport {
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly candidateGenerations: number;
  readonly liveEligibleGenerations: number;
  readonly attempts: number;
  readonly completedTwoLeg: number;
  readonly settled: number;
  readonly unsuccessful: number;
  readonly realizedNetProfit: number | null;
  readonly averageRoiPercent: number | null;
  readonly p95CandidateNetPercent: number | null;
  readonly buyBookAgeP99Ms: number | null;
  readonly sellBookAgeP99Ms: number | null;
  readonly decisionToStartP99Ms: number | null;
  readonly operationalHeadroomMs: number | null;
  readonly dominantBlocker: string | null;
}

export interface AgentSakhondraReport {
  readonly schemaVersion: "1.0";
  readonly generatedAt: number;
  readonly agent: {
    readonly id: "AGENT_SAKHONDRA";
    readonly name: "AGENT SAKHONDRA";
    readonly mode: "LIVE_INTELLIGENCE_ONLY";
    readonly state: AgentSakhondraState;
    readonly summary: string;
  };
  readonly evidenceBoundary: {
    readonly opportunityEvidence: "GENUINE_MARKET_LIVE_CANDIDATES_NOT_EXECUTIONS";
    readonly executionEvidence: "STRATEGY_ONE_TWO_LEG_LIVE_JOURNAL_ONLY";
    readonly settlementEvidence: "LIVE_SESSION_LINKED_SETTLEMENTS_ONLY";
    readonly paperExecutionsIncluded: false;
    readonly syntheticExecutionsIncluded: false;
  };
  readonly window: {
    readonly liveJournalFirstAt: number | null;
    readonly liveJournalLastAt: number | null;
    readonly retainedLiveSessions: number;
    readonly rollingHourStartsAt: number;
  };
  readonly conversion: {
    readonly candidateGenerations: number;
    readonly qualifiedCandidateGenerations: number;
    readonly dispatchReadyCandidateGenerations: number;
    readonly currentFullyPreflightableRoutes: number;
    readonly liveAttempts: number;
    readonly liveAttemptsLastHour: number;
    readonly completedTwoLeg: number;
    readonly completedTwoLegLastHour: number;
    readonly settledLiveTrades: number;
    readonly unsuccessfulLiveAttempts: number;
    readonly possibleExposureOrRecovery: number;
    readonly attemptToSettlementPercent: number | null;
    readonly completedToSettlementPercent: number | null;
  };
  readonly economics: {
    readonly settledSamples: number;
    readonly profitableSettlements: number;
    readonly lossSettlements: number;
    readonly realizedNetProfit: number | null;
    readonly totalFees: number | null;
    readonly averageRoiPercent: number | null;
    readonly minimumRoiPercent: number | null;
    readonly maximumRoiPercent: number | null;
    readonly evidenceAvailable: boolean;
  };
  readonly timing: {
    readonly maximumBookAgeMs: number;
    readonly routesWithEvidence: number;
    readonly routesWithLiveDispatches: number;
    readonly worstBookAgeP99Ms: number | null;
    readonly decisionToStartP99Ms: number | null;
    readonly operationalHeadroomMs: number | null;
    readonly requiredHeadroomMs: 5;
  };
  readonly unsuccessfulReasons: readonly {
    readonly rank: number;
    readonly reason: string;
    readonly count: number;
    readonly source: "LIVE_SESSION" | "LIVE_SETTLEMENT" | "CANDIDATE_GATE";
  }[];
  readonly routes: readonly AgentSakhondraRouteReport[];
  readonly recommendations: readonly AgentSakhondraRecommendation[];
  readonly codexPrompt: string;
  readonly safety: {
    readonly readOnly: true;
    readonly canSubmitOrders: false;
    readonly canChangePolicy: false;
    readonly canArmLive: false;
    readonly canMoveFunds: false;
    readonly recommendationsRequireHumanReview: true;
    readonly profitIsNotGuaranteed: true;
  };
}

export interface AgentSakhondraDependencies {
  readonly getOpportunityAudit: (now: number) => StrategyOneTinyLiveOpportunityAuditReport;
  readonly getTimingReport: (now: number) => StrategyOneExecutionTimingReport;
  readonly listLiveSessions: () => readonly StrategyOneTwoLegSessionRecord[];
  readonly getSettlement: (sessionId: string) => ExecutionSettlementRecord | null;
}

interface MutableRoute {
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  candidateGenerations: number;
  liveEligibleGenerations: number;
  attempts: number;
  completedTwoLeg: number;
  settled: number;
  unsuccessful: number;
  realizedNetProfit: number;
  roiValues: number[];
  p95CandidateNetPercent: number | null;
  timing: StrategyOneRouteTimingReport | null;
  dominantBlocker: string | null;
}

const DEFAULT_DEPENDENCIES: AgentSakhondraDependencies = {
  getOpportunityAudit: (now) => strategyOneTinyLiveOpportunityAuditService.getReport(now),
  getTimingReport: (now) => strategyOneExecutionTimingEvidenceService.getReport(now),
  listLiveSessions: () => strategyOneTwoLegLiveExecutionService.listSessions(),
  getSettlement: (sessionId) => persistentExecutionSettlementService.getSettlement(sessionId),
};

/**
 * AGENT SAKHONDRA is a bounded read model, not an execution agent. It joins
 * genuine market-candidate evidence to the dedicated Strategy #1 LIVE journal
 * and only those settlements whose session IDs exist in that journal.
 */
export class AgentSakhondraService {
  private cached: {readonly expiresAt: number; readonly report: AgentSakhondraReport} | null = null;

  constructor(
    private readonly dependencies: AgentSakhondraDependencies = DEFAULT_DEPENDENCIES,
    private readonly cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  ) {}

  getReport(now = Date.now()): AgentSakhondraReport {
    validateNow(now);
    if (this.cacheTtlMs > 0 && this.cached && this.cached.expiresAt > now) {
      return this.cached.report;
    }

    const audit = this.dependencies.getOpportunityAudit(now);
    const timing = this.dependencies.getTimingReport(now);
    const sessions = [...this.dependencies.listLiveSessions()];
    const settlements = sessions
      .map((session) => this.dependencies.getSettlement(session.sessionId))
      .filter((settlement): settlement is ExecutionSettlementRecord => settlement !== null);
    const report = buildReport(now, audit, timing, sessions, settlements);

    if (this.cacheTtlMs > 0) {
      this.cached = {expiresAt: now + this.cacheTtlMs, report};
    }
    return report;
  }
}

function buildReport(
  now: number,
  audit: StrategyOneTinyLiveOpportunityAuditReport,
  timing: StrategyOneExecutionTimingReport,
  sessions: readonly StrategyOneTwoLegSessionRecord[],
  settlements: readonly ExecutionSettlementRecord[],
): AgentSakhondraReport {
  const rollingHourStartsAt = now - HOUR_MS;
  const completed = sessions.filter((session) => session.state === "COMPLETED");
  const unsettledFailureStates = new Set(["FAILED", "RECOVERY_REQUIRED", "POSSIBLE_EXPOSURE"]);
  const unsuccessfulSessions = sessions.filter((session) => unsettledFailureStates.has(session.state));
  const settled = settlements.filter((record) => record.status === "SETTLED");
  const failedSettlements = settlements.filter((record) => record.status === "BLOCKED" || record.status === "FAILED");
  const unsuccessfulLiveAttempts = new Set([
    ...unsuccessfulSessions.map((session) => session.sessionId),
    ...failedSettlements.map((record) => record.sessionId),
  ]).size;
  const exposure = sessions.filter((session) =>
    session.state === "RECOVERY_REQUIRED" || session.state === "POSSIBLE_EXPOSURE").length;
  const roiValues = settled.map((record) => record.roiPercent).filter(Number.isFinite);
  const realizedNetProfit = sum(settled.map((record) => record.netProfit));
  const totalFees = sum(settled.map((record) => record.totalFees));
  const timingSummary = summarizeTiming(timing, audit.thresholds.dispatchReservedMaximumBookAgeMs);
  const routeReports = buildRoutes(audit, timing, sessions, settlements);
  const unsuccessfulReasons = rankReasons(audit, sessions, failedSettlements);
  const state = determineState(sessions, unsuccessfulLiveAttempts, exposure, settled.length);
  const conversion = {
    candidateGenerations: audit.observation.economicsGenerations,
    qualifiedCandidateGenerations: audit.observation.profitBands.qualified + audit.observation.profitBands.liveEligible,
    dispatchReadyCandidateGenerations: audit.observation.dispatchReservedLiveEligibleGenerations,
    currentFullyPreflightableRoutes: audit.currentActionTime.fullyPreflightableMatches,
    liveAttempts: sessions.length,
    liveAttemptsLastHour: sessions.filter((session) => session.preparedAt >= rollingHourStartsAt).length,
    completedTwoLeg: completed.length,
    completedTwoLegLastHour: completed.filter((session) => session.updatedAt >= rollingHourStartsAt).length,
    settledLiveTrades: settled.length,
    unsuccessfulLiveAttempts,
    possibleExposureOrRecovery: exposure,
    attemptToSettlementPercent: percent(settled.length, sessions.length),
    completedToSettlementPercent: percent(settled.length, completed.length),
  };
  const economics = {
    settledSamples: settled.length,
    profitableSettlements: settled.filter((record) => record.netProfit > 0).length,
    lossSettlements: settled.filter((record) => record.netProfit < 0).length,
    realizedNetProfit: settled.length > 0 ? round(realizedNetProfit, 8) : null,
    totalFees: settled.length > 0 ? round(totalFees, 8) : null,
    averageRoiPercent: average(roiValues),
    minimumRoiPercent: roiValues.length > 0 ? round(Math.min(...roiValues), 6) : null,
    maximumRoiPercent: roiValues.length > 0 ? round(Math.max(...roiValues), 6) : null,
    evidenceAvailable: settled.length > 0,
  };
  const recommendations = buildRecommendations({
    audit,
    conversion,
    economics,
    timing: timingSummary,
    unsuccessfulReasons,
  });
  const reportWithoutPrompt = {
    schemaVersion: "1.0" as const,
    generatedAt: now,
    agent: {
      id: "AGENT_SAKHONDRA" as const,
      name: "AGENT SAKHONDRA" as const,
      mode: "LIVE_INTELLIGENCE_ONLY" as const,
      state,
      summary: summaryFor(state, sessions.length, settled.length, unsuccessfulLiveAttempts),
    },
    evidenceBoundary: {
      opportunityEvidence: "GENUINE_MARKET_LIVE_CANDIDATES_NOT_EXECUTIONS" as const,
      executionEvidence: "STRATEGY_ONE_TWO_LEG_LIVE_JOURNAL_ONLY" as const,
      settlementEvidence: "LIVE_SESSION_LINKED_SETTLEMENTS_ONLY" as const,
      paperExecutionsIncluded: false as const,
      syntheticExecutionsIncluded: false as const,
    },
    window: {
      liveJournalFirstAt: minimum(sessions.map((session) => session.preparedAt)),
      liveJournalLastAt: maximum(sessions.map((session) => session.updatedAt)),
      retainedLiveSessions: sessions.length,
      rollingHourStartsAt,
    },
    conversion,
    economics,
    timing: timingSummary,
    unsuccessfulReasons,
    routes: routeReports,
    recommendations,
    safety: {
      readOnly: true as const,
      canSubmitOrders: false as const,
      canChangePolicy: false as const,
      canArmLive: false as const,
      canMoveFunds: false as const,
      recommendationsRequireHumanReview: true as const,
      profitIsNotGuaranteed: true as const,
    },
  };

  return deepFreeze({
    ...reportWithoutPrompt,
    codexPrompt: createCodexPrompt(reportWithoutPrompt),
  });
}

function summarizeTiming(
  timing: StrategyOneExecutionTimingReport,
  maximumBookAgeMs: number,
): AgentSakhondraReport["timing"] {
  const liveRoutes = timing.routes.filter((route) => route.liveDispatches > 0);
  const worstBookAgeP99Ms = maximum(liveRoutes.flatMap((route) => [
    route.metrics.buyQuoteAgeMs.p99Ms,
    route.metrics.sellQuoteAgeMs.p99Ms,
  ]).filter(isNumber));
  const decisionToStartP99Ms = maximum(liveRoutes
    .map((route) => route.metrics.decisionToExecutionStartMs.p99Ms)
    .filter(isNumber));
  const operationalHeadroomMs = worstBookAgeP99Ms !== null && decisionToStartP99Ms !== null
    ? round(maximumBookAgeMs - worstBookAgeP99Ms - decisionToStartP99Ms, 2)
    : null;
  return {
    maximumBookAgeMs,
    routesWithEvidence: liveRoutes.length,
    routesWithLiveDispatches: liveRoutes.length,
    worstBookAgeP99Ms,
    decisionToStartP99Ms,
    operationalHeadroomMs,
    requiredHeadroomMs: 5,
  };
}

function buildRoutes(
  audit: StrategyOneTinyLiveOpportunityAuditReport,
  timing: StrategyOneExecutionTimingReport,
  sessions: readonly StrategyOneTwoLegSessionRecord[],
  settlements: readonly ExecutionSettlementRecord[],
): readonly AgentSakhondraRouteReport[] {
  const routes = new Map<string, MutableRoute>();
  const ensure = (market: string, buyExchange: string, sellExchange: string): MutableRoute => {
    const routeKey = key(market, buyExchange, sellExchange);
    const existing = routes.get(routeKey);
    if (existing) return existing;
    const created: MutableRoute = {
      routeKey,
      market: market.toUpperCase(),
      buyExchange: buyExchange.toUpperCase(),
      sellExchange: sellExchange.toUpperCase(),
      candidateGenerations: 0,
      liveEligibleGenerations: 0,
      attempts: 0,
      completedTwoLeg: 0,
      settled: 0,
      unsuccessful: 0,
      realizedNetProfit: 0,
      roiValues: [],
      p95CandidateNetPercent: null,
      timing: null,
      dominantBlocker: null,
    };
    routes.set(routeKey, created);
    return created;
  };
  for (const route of audit.routeRanking) {
    const current = ensure(route.market, route.buyExchange, route.sellExchange);
    current.candidateGenerations = route.economicsGenerations;
    current.liveEligibleGenerations = route.liveEligibleGenerations;
    current.p95CandidateNetPercent = route.p95NetProfitPercent;
    current.dominantBlocker = route.dominantBlocker;
  }
  for (const route of timing.routes) {
    if (route.liveDispatches > 0) {
      ensure(route.market, route.buyExchange, route.sellExchange).timing = route;
    }
  }
  const unsuccessfulSessionIds = new Set(sessions
    .filter((session) => session.state === "FAILED" || session.state === "RECOVERY_REQUIRED" || session.state === "POSSIBLE_EXPOSURE")
    .map((session) => session.sessionId));
  for (const session of sessions) {
    const current = ensure(session.buyRequest.market, session.buyRequest.exchange, session.sellRequest.exchange);
    current.attempts += 1;
    if (session.state === "COMPLETED") current.completedTwoLeg += 1;
    if (session.state === "FAILED" || session.state === "RECOVERY_REQUIRED" || session.state === "POSSIBLE_EXPOSURE") {
      current.unsuccessful += 1;
    }
  }
  for (const settlement of settlements) {
    const current = ensure(settlement.market, settlement.buyExchange, settlement.sellExchange);
    if (settlement.status === "SETTLED") {
      current.settled += 1;
      current.realizedNetProfit += settlement.netProfit;
      if (Number.isFinite(settlement.roiPercent)) current.roiValues.push(settlement.roiPercent);
    } else if ((settlement.status === "BLOCKED" || settlement.status === "FAILED") &&
      !unsuccessfulSessionIds.has(settlement.sessionId)) {
      current.unsuccessful += 1;
    }
  }
  return [...routes.values()]
    .map((route) => {
      const buyBookAgeP99Ms = route.timing?.metrics.buyQuoteAgeMs.p99Ms ?? null;
      const sellBookAgeP99Ms = route.timing?.metrics.sellQuoteAgeMs.p99Ms ?? null;
      const decisionToStartP99Ms = route.timing?.metrics.decisionToExecutionStartMs.p99Ms ?? null;
      const worstAge = maximum([buyBookAgeP99Ms, sellBookAgeP99Ms].filter(isNumber));
      const headroom = worstAge !== null && decisionToStartP99Ms !== null
        ? round(audit.thresholds.dispatchReservedMaximumBookAgeMs - worstAge - decisionToStartP99Ms, 2)
        : null;
      return {
        routeKey: route.routeKey,
        market: route.market,
        buyExchange: route.buyExchange,
        sellExchange: route.sellExchange,
        candidateGenerations: route.candidateGenerations,
        liveEligibleGenerations: route.liveEligibleGenerations,
        attempts: route.attempts,
        completedTwoLeg: route.completedTwoLeg,
        settled: route.settled,
        unsuccessful: route.unsuccessful,
        realizedNetProfit: route.settled > 0 ? round(route.realizedNetProfit, 8) : null,
        averageRoiPercent: average(route.roiValues),
        p95CandidateNetPercent: route.p95CandidateNetPercent,
        buyBookAgeP99Ms,
        sellBookAgeP99Ms,
        decisionToStartP99Ms,
        operationalHeadroomMs: headroom,
        dominantBlocker: route.dominantBlocker,
      };
    })
    .sort((first, second) =>
      second.settled - first.settled ||
      second.attempts - first.attempts ||
      second.liveEligibleGenerations - first.liveEligibleGenerations ||
      first.routeKey.localeCompare(second.routeKey))
    .slice(0, 24);
}

function rankReasons(
  audit: StrategyOneTinyLiveOpportunityAuditReport,
  sessions: readonly StrategyOneTwoLegSessionRecord[],
  failedSettlements: readonly ExecutionSettlementRecord[],
): AgentSakhondraReport["unsuccessfulReasons"] {
  const counts = new Map<string, {count: number; source: "LIVE_SESSION" | "LIVE_SETTLEMENT" | "CANDIDATE_GATE"}>();
  const add = (reason: string, count: number, source: "LIVE_SESSION" | "LIVE_SETTLEMENT" | "CANDIDATE_GATE") => {
    const normalized = reason.trim();
    if (!normalized || count <= 0) return;
    const current = counts.get(normalized);
    counts.set(normalized, {count: (current?.count ?? 0) + count, source: current?.source ?? source});
  };
  for (const session of sessions) {
    if (session.state !== "COMPLETED") {
      for (const reason of session.reasons) add(reason, 1, "LIVE_SESSION");
      for (const reason of session.buyResponse?.reasons ?? []) add(`BUY: ${reason}`, 1, "LIVE_SESSION");
      for (const reason of session.sellResponse?.reasons ?? []) add(`SELL: ${reason}`, 1, "LIVE_SESSION");
    }
  }
  for (const settlement of failedSettlements) for (const reason of settlement.reasons) add(reason, 1, "LIVE_SETTLEMENT");
  for (const blocker of audit.blockerRanking) add(blocker.code, blocker.count, "CANDIDATE_GATE");
  for (const blocker of audit.currentActionTime.blockers) add(blocker, 1, "CANDIDATE_GATE");
  return [...counts.entries()]
    .map(([reason, value]) => ({reason, ...value}))
    .sort((first, second) => second.count - first.count || first.reason.localeCompare(second.reason))
    .slice(0, 12)
    .map((item, index) => ({rank: index + 1, ...item}));
}

function buildRecommendations(input: {
  readonly audit: StrategyOneTinyLiveOpportunityAuditReport;
  readonly conversion: AgentSakhondraReport["conversion"];
  readonly economics: AgentSakhondraReport["economics"];
  readonly timing: AgentSakhondraReport["timing"];
  readonly unsuccessfulReasons: AgentSakhondraReport["unsuccessfulReasons"];
}): readonly AgentSakhondraRecommendation[] {
  const recommendations: AgentSakhondraRecommendation[] = [];
  const topReason = input.unsuccessfulReasons[0];
  if (input.conversion.liveAttempts === 0) {
    recommendations.push(recommendation(
      "LIVE-ATTEMPT-TRACE", "P0", "EXECUTION", "Trace the first genuine LIVE attempt boundary",
      `${input.conversion.dispatchReadyCandidateGenerations.toLocaleString("en-IN")} dispatch-ready candidate generations exist, but no durable two-leg LIVE attempt exists.`,
      `attempts=${input.conversion.liveAttempts}; current preflightable=${input.conversion.currentFullyPreflightableRoutes}`,
      "At least 1 independently preflighted, operator-authorized pilot attempt",
      `Inspect the current gate and top candidate blocker${topReason ? ` (${topReason.reason})` : ""}; do not lower the 0.30% net floor or bypass inventory/freshness checks.`,
      topReason && topReason.count >= MINIMUM_RECOMMENDATION_SAMPLE ? "HIGH" : "MEDIUM",
      topReason?.count ?? input.conversion.dispatchReadyCandidateGenerations,
    ));
  }
  if (input.timing.operationalHeadroomMs !== null && input.timing.operationalHeadroomMs < input.timing.requiredHeadroomMs) {
    recommendations.push(recommendation(
      "TIMING-HEADROOM", "P0", "TIMING", "Recover execution timing headroom",
      "Measured P99 quote age plus decision-to-start latency exceeds the safe dispatch budget.",
      `${input.timing.operationalHeadroomMs.toFixed(2)} ms headroom`,
      `>= ${input.timing.requiredHeadroomMs} ms headroom`,
      "Profile only the decision-to-dispatch path, remove duplicate synchronous reads, and re-measure P99 before any policy review.",
      "HIGH",
      input.timing.routesWithEvidence,
    ));
  }
  if (input.conversion.unsuccessfulLiveAttempts > 0 && topReason) {
    recommendations.push(recommendation(
      "LIVE-FAILURE-ROOT", "P0", "EXECUTION", "Close the dominant LIVE failure cause",
      `The most frequent recorded reason is ${topReason.reason}.`,
      `${topReason.count} observations; ${input.conversion.unsuccessfulLiveAttempts} unsuccessful attempts`,
      "0 unresolved exposure and a rising settled/attempt ratio",
      "Reproduce this exact failure with exchange I/O mocked, add a deterministic regression test, then deploy only the verified fix.",
      topReason.source === "CANDIDATE_GATE" ? "MEDIUM" : "HIGH",
      topReason.count,
    ));
  }
  if (input.economics.lossSettlements > 0 || (input.economics.realizedNetProfit ?? 0) < 0) {
    recommendations.push(recommendation(
      "REALIZED-LOSS", "P0", "PROFIT", "Stop scaling until realized LIVE economics recover",
      "At least one linked LIVE settlement is loss-making after recorded fees/slippage.",
      `losses=${input.economics.lossSettlements}; net=${input.economics.realizedNetProfit ?? "NO_DATA"}`,
      "Positive net settlement after all recorded costs, with no unresolved exposure",
      "Compare decision net versus realized net by route; fix fee, slippage, quantity or fill assumptions before increasing capital.",
      "HIGH",
      input.economics.settledSamples,
    ));
  }
  if (input.economics.settledSamples > 0 && input.economics.lossSettlements === 0) {
    recommendations.push(recommendation(
      "LIVE-SAMPLE-DEPTH", "P1", "DATA", "Increase evidence depth without increasing capital",
      "Some settled LIVE evidence exists, but small samples cannot prove sustainable profitability.",
      `${input.economics.settledSamples} settled; avg ROI=${input.economics.averageRoiPercent ?? "NO_DATA"}%`,
      `>= ${MINIMUM_RECOMMENDATION_SAMPLE} independent settled samples per promoted route`,
      "Keep the same per-leg cap and collect independent route/time-regime samples before any capital increase.",
      input.economics.settledSamples >= MINIMUM_RECOMMENDATION_SAMPLE ? "HIGH" : "MEDIUM",
      input.economics.settledSamples,
    ));
  }
  if (recommendations.length === 0) {
    recommendations.push(recommendation(
      "OBSERVE", "P2", "DATA", "Continue bounded LIVE-candidate observation",
      "No linked LIVE settlement or actionable timing failure is currently available.",
      `candidates=${input.audit.observation.economicsGenerations}; live attempts=${input.conversion.liveAttempts}`,
      "Fresh, linked attempt and settlement evidence",
      "Keep data collection running and review again after a genuine attempted session; make no threshold change from absence of evidence.",
      "LOW",
      input.audit.observation.economicsGenerations,
    ));
  }
  return recommendations.slice(0, 6);
}

function recommendation(
  id: string,
  priority: AgentSakhondraRecommendation["priority"],
  area: AgentSakhondraRecommendation["area"],
  title: string,
  finding: string,
  observed: string,
  target: string,
  action: string,
  confidence: AgentSakhondraRecommendation["confidence"],
  evidenceSamples: number,
): AgentSakhondraRecommendation {
  return {id, priority, area, title, finding, observed, target, action, confidence, evidenceSamples, requiresHumanApproval: true};
}

function createCodexPrompt(report: Omit<AgentSakhondraReport, "codexPrompt">): string {
  const recommendationLines = report.recommendations.map((item, index) =>
    `${index + 1}. [${item.priority}/${item.area}] ${item.title}\n` +
    `   Observed: ${item.observed}\n   Target: ${item.target}\n   Requested investigation: ${item.action}`);
  const reasonLines = report.unsuccessfulReasons.slice(0, 6)
    .map((item) => `- ${item.reason}: ${item.count} (${item.source})`);
  return [
    "CAT PRO — AGENT SAKHONDRA EVIDENCE-BOUND IMPROVEMENT REQUEST",
    `Generated: ${new Date(report.generatedAt).toISOString()}`,
    "",
    "Objective: improve genuine LIVE execution conversion and realized net profitability without weakening fail-closed safety.",
    "Evidence boundary: opportunity counts are genuine market LIVE-candidate observations, not executions. Attempts and outcomes below come only from the Strategy #1 two-leg LIVE journal; PAPER and synthetic executions are excluded.",
    "",
    "Current numbers:",
    `- Candidate generations: ${report.conversion.candidateGenerations}`,
    `- Dispatch-ready candidates: ${report.conversion.dispatchReadyCandidateGenerations}`,
    `- LIVE attempts / settled / unsuccessful: ${report.conversion.liveAttempts} / ${report.conversion.settledLiveTrades} / ${report.conversion.unsuccessfulLiveAttempts}`,
    `- Completed in rolling hour: ${report.conversion.completedTwoLegLastHour}`,
    `- Realized LIVE net P&L: ${report.economics.realizedNetProfit ?? "NO_DATA"}`,
    `- Fees: ${report.economics.totalFees ?? "NO_DATA"}; average ROI: ${report.economics.averageRoiPercent ?? "NO_DATA"}%`,
    `- Book-age budget: ${report.timing.maximumBookAgeMs} ms; worst book-age P99: ${report.timing.worstBookAgeP99Ms ?? "NO_DATA"} ms`,
    `- Decision-to-start P99: ${report.timing.decisionToStartP99Ms ?? "NO_DATA"} ms; operational headroom: ${report.timing.operationalHeadroomMs ?? "NO_DATA"} ms`,
    "",
    "Dominant reasons:",
    ...(reasonLines.length > 0 ? reasonLines : ["- No recorded reason evidence yet."]),
    "",
    "Prioritized work:",
    ...recommendationLines,
    "",
    "Required Codex method:",
    "1. Trace each claim to existing authoritative code and durable evidence before editing.",
    "2. Do not fabricate fills, relax the 0.30% net-profit floor, bypass book-age/skew/inventory/fee checks, or infer profit from PAPER.",
    "3. Implement only evidence-supported, minimal changes with deterministic regressions and before/after P50/P95/P99 measurements.",
    "4. Do not change trading mode, LIVE authority, API permissions, balances, transfers, withdrawals, arms/leases or submit an order.",
    "5. Present policy changes as explicit human-review proposals; never auto-apply them.",
    "6. Report exact files changed, tests, measured effect and remaining uncertainty. LIVE profit is not guaranteed.",
  ].join("\n");
}

function determineState(
  sessions: readonly StrategyOneTwoLegSessionRecord[],
  unsuccessful: number,
  exposure: number,
  settled: number,
): AgentSakhondraState {
  if (exposure > 0 || unsuccessful > 0) return "ATTENTION_REQUIRED";
  if (settled > 0) return "LIVE_EVIDENCE_AVAILABLE";
  if (sessions.length > 0) return "LIVE_EVIDENCE_COLLECTING";
  return "NO_LIVE_ATTEMPTS";
}

function summaryFor(state: AgentSakhondraState, attempts: number, settled: number, unsuccessful: number): string {
  if (state === "NO_LIVE_ATTEMPTS") return "Genuine LIVE candidates are observed, but no durable LIVE attempt exists yet.";
  if (state === "ATTENTION_REQUIRED") return `${unsuccessful} unsuccessful or unsafe LIVE outcome(s) require review before scaling.`;
  if (state === "LIVE_EVIDENCE_AVAILABLE") return `${settled}/${attempts} retained LIVE attempts have linked settled evidence.`;
  return `${attempts} LIVE attempt(s) are recorded; settlement evidence is still collecting.`;
}

function key(market: string, buyExchange: string, sellExchange: string): string {
  return `${market.trim().toUpperCase()}|${buyExchange.trim().toUpperCase()}|${sellExchange.trim().toUpperCase()}`;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round((numerator / denominator) * 100, 2) : null;
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? round(sum(values) / values.length, 6) : null;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function minimum(values: readonly number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null;
}

function maximum(values: readonly number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function validateNow(now: number): void {
  if (!Number.isFinite(now) || now <= 0) throw new Error("AGENT SAKHONDRA requires a valid timestamp.");
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const agentSakhondraService = new AgentSakhondraService();
