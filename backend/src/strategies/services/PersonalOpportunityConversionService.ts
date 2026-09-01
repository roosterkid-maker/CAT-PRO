import type {ArbitrageOpportunity} from "../../arbitrage/models/ArbitrageOpportunity";
import type {OpportunityPipelineDiagnostics} from "../../arbitrage/services/OpportunityService";
import {opportunityService} from "../../arbitrage/services/OpportunityService";
import type {AutomatedPaperExecutionControllerDiagnostics} from "../../automation/models/AutomatedPaperExecutionController";
import type {CandidateQualificationDiagnostics} from "../../automation/models/CandidateQualification";
import type {ExecutionCandidateQueueDiagnostics} from "../../automation/models/ExecutionCandidateQueue";
import {automatedPaperExecutionControllerService} from "../../automation/services/AutomatedPaperExecutionControllerService";
import {candidateQualificationService} from "../../automation/services/CandidateQualificationService";
import {executionCandidateQueueService} from "../../automation/services/ExecutionCandidateQueueService";
import type {OpportunityPipelineBottleneckReport} from "../../automation/models/OpportunityPipelineBottleneck";
import {opportunityPipelineBottleneckService} from "../../automation/services/OpportunityPipelineBottleneckService";
import type {PostGuardProfitValidationReport, PostGuardRouteState} from "../../trading/services/PostGuardProfitValidationLedgerService";
import {postGuardProfitValidationLedgerService} from "../../trading/services/PostGuardProfitValidationLedgerService";
import type {UnifiedAutomatedExecutionDiagnostics} from "../../workflows/cross-exchange-arbitrage/models/UnifiedAutomatedExecution";
import {unifiedAutomatedExecutionOrchestratorService} from "../../workflows/cross-exchange-arbitrage/services/UnifiedAutomatedExecutionOrchestratorService";

const RECENT_EXECUTION_WINDOW_MS = 5 * 60 * 1_000;

export type PersonalOpportunityConversionStatus =
  | "NO_MARKET_DATA"
  | "ENGINE_FILTERING"
  | "PERSISTENCE_WAIT"
  | "QUALIFICATION_BLOCKED"
  | "QUEUE_WAIT"
  | "PAPER_REJECTED"
  | "READY_FOR_PAPER"
  | "COLLECTING_POST_GUARD";

export type PersonalOpportunityConversionStageStatus =
  | "PASSED"
  | "WAITING"
  | "BLOCKED"
  | "NOT_REACHED";

export type PersonalOpportunityConversionStageKey =
  | "EXECUTABLE_MARKET_DATA"
  | "PAIR_EVALUATION"
  | "ENGINE_ACCEPTANCE"
  | "PROFIT_QUALIFICATION"
  | "PERSISTENCE_MONITOR"
  | "CANDIDATE_QUALIFICATION"
  | "CENTRAL_QUEUE"
  | "PAPER_ATTEMPT"
  | "POST_GUARD_SETTLEMENT";

export interface PersonalOpportunityConversionStage {
  key: PersonalOpportunityConversionStageKey;
  label: string;
  status: PersonalOpportunityConversionStageStatus;
  count: number;
  scope: "CURRENT_SCAN" | "CURRENT_STATE" | "RECENT_5_MIN" | "DURABLE_COHORT";
  reason: string;
}

export interface PersonalOpportunityConversionBlocker {
  stage: "EXECUTION_QUALITY" | "EVALUATOR" | "ENGINE" | "PERSISTENCE" | "QUALIFICATION" | "QUEUE" | "PAPER";
  code: string;
  label: string;
  count: number;
  percentOfEvaluatedPairs: number | null;
  reason: string;
  operatorAction: string;
}

export interface PersonalOpportunityCandidateConversion {
  opportunityId: string;
  candidateKey: string;
  profitRouteKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  decision: ArbitrageOpportunity["decision"];
  netProfit: number;
  netProfitPercent: number;
  executableQuantity: number;
  score: number;
  modeledCapitalInr: number | null;
  modeledNetProfitInr: number | null;
  economicEvidence: "FULL_DEPTH_VALIDATION" | "CURRENT_OPPORTUNITY" | "UNAVAILABLE";
  queuePriorityScore: number | null;
  paperSelectionState: "SELECTABLE" | "NOT_AUTHORIZED";
  consecutiveObservations: number;
  persistenceMs: number;
  currentStage: PersonalOpportunityConversionStageKey;
  qualificationStatus: "NOT_OBSERVED" | "OBSERVING" | "QUALIFIED" | "REJECTED" | "EXPIRED";
  queueStatus: "READY" | "EXPIRED" | "CANCELLED" | "REMOVED" | "CONSUMED" | null;
  routeProfitState: PostGuardRouteState | "NO_SAMPLE";
  routeSampleTrades: number;
  routeExpectancyInr: number | null;
  routeAverageNetReturnPercent: number | null;
  paperAdmissionAllowed: boolean;
  selectableForPaper: boolean;
  failedChecks: readonly string[];
  failedCheckDetails: ReadonlyArray<{
    check: string;
    reason: string;
    currentValue: number | string | boolean;
    requiredValue: number | string | boolean;
  }>;
  reason: string;
}

export interface PersonalOpportunityConversionReport {
  version: "84.1";
  generatedAt: number;
  strategyId: "cross-exchange-arbitrage";
  profile: "PERSONAL_SELF_USE";
  status: PersonalOpportunityConversionStatus;
  primaryBottleneck: PersonalOpportunityConversionBlocker | null;
  nextAction: string;
  snapshot: {
    scanStartedAt: number | null;
    cachedQuotes: number;
    executableQuotes: number;
    evaluatedPairs: number;
    engineAccepted: number;
    profitQualified: number;
    currentOpportunities: number;
    executeDecisions: number;
    activeCandidates: number;
    qualifiedCandidates: number;
    readyQueueItems: number;
  };
  stages: readonly PersonalOpportunityConversionStage[];
  engineRejections: readonly PersonalOpportunityConversionBlocker[];
  qualificationFailures: readonly {
    check: string;
    count: number;
    reason: string;
  }[];
  arbitration: {
    basis: "FULL_DEPTH_MODELED_INR_PROFIT_THEN_NET_RETURN";
    currentEligible: number;
    paperReady: number;
    admissionBlocked: number;
    currentLeaderOpportunityId: string | null;
    currentLeaderCandidateKey: string | null;
    currentLeaderModeledCapitalInr: number | null;
    currentLeaderModeledNetProfitInr: number | null;
    paperWinnerCandidateKey: string | null;
    routeHistoryUsedAsTieBreakOnly: true;
  };
  currentCandidates: readonly PersonalOpportunityCandidateConversion[];
  recentPaper: {
    windowMs: number;
    cycles: number;
    attempts: number;
    executed: number;
    rejected: number;
    latestStatus: string | null;
    latestAt: number | null;
    latestReasons: readonly string[];
    orchestratorMode: UnifiedAutomatedExecutionDiagnostics["mode"];
    orchestratorStatus: string | null;
    orchestratorReasons: readonly string[];
  };
  postGuard: {
    taggedSettlements: number;
    targetSettlements: number;
    validationStatus: PostGuardProfitValidationReport["validationStatus"];
    latestTradeAt: number | null;
    quarantinedRoutes: number;
  };
  policy: {
    discoveryMinimumNetProfitPercent: number | null;
    qualificationMinimumNetProfitPercent: number | null;
    liveMinimumNetProfitPercent: number | null;
    thresholdMutationAllowed: false;
  };
  safety: {
    readOnlyDiagnostics: true;
    realEvidenceOnly: true;
    fakeOpportunityAllowed: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface PersonalOpportunityConversionInput {
  opportunities: readonly ArbitrageOpportunity[];
  diagnostics: OpportunityPipelineDiagnostics | null;
  bottleneck: OpportunityPipelineBottleneckReport;
  qualification: CandidateQualificationDiagnostics;
  queue: ExecutionCandidateQueueDiagnostics;
  controller: AutomatedPaperExecutionControllerDiagnostics;
  orchestrator: UnifiedAutomatedExecutionDiagnostics;
  profitValidation: PostGuardProfitValidationReport;
}

export interface PersonalOpportunityConversionDependencies {
  getInput(now: number): PersonalOpportunityConversionInput;
}

const DEFAULT_DEPENDENCIES: PersonalOpportunityConversionDependencies = {
  getInput: (now) => ({
    opportunities: opportunityService.getLastOpportunities(),
    diagnostics: opportunityService.getLastDiagnostics(),
    bottleneck: opportunityPipelineBottleneckService.getReport(),
    qualification: candidateQualificationService.getDiagnostics(),
    queue: executionCandidateQueueService.getDiagnostics(now),
    controller: automatedPaperExecutionControllerService.getDiagnostics(),
    orchestrator: unifiedAutomatedExecutionOrchestratorService.getDiagnostics(),
    profitValidation: postGuardProfitValidationLedgerService.getReport(now),
  }),
};

/**
 * Read-only Strategy #1 conversion truth. Existing services remain the owners
 * of scanning, qualification, queueing and PAPER execution.
 */
export class PersonalOpportunityConversionService {
  private readonly dependencies: PersonalOpportunityConversionDependencies;

  constructor(dependencies: Partial<PersonalOpportunityConversionDependencies> = {}) {
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
  }

  getReport(now = Date.now()): PersonalOpportunityConversionReport {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Personal opportunity conversion timestamp must be a positive safe integer.");
    }

    return this.analyze(this.dependencies.getInput(now), now);
  }

  analyze(input: PersonalOpportunityConversionInput, now: number): PersonalOpportunityConversionReport {
    const diagnostics = input.diagnostics;
    const evaluatedPairs = diagnostics?.diagnostics.engine.evaluated ?? input.bottleneck.summary.evaluatedPairs;
    const executableQuotes = diagnostics?.executionQualityEligibleQuotes ?? input.bottleneck.summary.executableQuotes;
    const engineAccepted = diagnostics?.acceptedOpportunities ?? input.bottleneck.summary.acceptedOpportunities;
    const profitQualified = diagnostics?.profitTiers.qualified ?? 0;
    const activeCandidates = input.bottleneck.summary.activeCandidates;
    const qualifiedCandidates = input.qualification.qualified;
    const readyQueueItems = input.queue.ready;
    const recentCycles = input.controller.recentCycles.filter((cycle) =>
      cycle.completedAt >= now - RECENT_EXECUTION_WINDOW_MS && cycle.completedAt <= now + 1_000);
    const recentAttempts = recentCycles.filter((cycle) =>
      cycle.status === "EXECUTED" || cycle.status === "EXECUTION_REJECTED");
    const recentExecuted = recentAttempts.filter((cycle) => cycle.status === "EXECUTED").length;
    const recentRejected = recentAttempts.filter((cycle) => cycle.status === "EXECUTION_REJECTED").length;
    const latestCycle = input.controller.lastCycle;
    const engineRejections = this.engineRejections(diagnostics, input.bottleneck, evaluatedPairs);
    const qualificationFailures = input.bottleneck.qualification.failedChecks.map((failure) => ({
      ...failure,
      reason: qualificationFailureReason(failure.check),
    }));
    const status = this.resolveStatus({
      executableQuotes,
      evaluatedPairs,
      engineAccepted,
      activeCandidates,
      qualifiedCandidates,
      readyQueueItems,
      recentRejected,
      recentExecuted,
      taggedSettlements: input.profitValidation.overall.trades,
    });
    const primaryBottleneck = this.resolvePrimaryBottleneck(status, engineRejections, qualificationFailures, input);
    const convertedCandidates = input.opportunities
      .map((opportunity) => this.toCandidate(opportunity, input))
      .sort(compareCandidateEconomics);
    const currentCandidates = convertedCandidates.slice(0, 12);
    const currentLeader = convertedCandidates.find((candidate) =>
      candidate.paperAdmissionAllowed && candidate.modeledNetProfitInr !== null) ?? null;
    const paperWinner = convertedCandidates.find((candidate) => candidate.selectableForPaper) ?? null;
    const stages = this.buildStages({
      diagnostics,
      executableQuotes,
      evaluatedPairs,
      engineAccepted,
      profitQualified,
      activeCandidates,
      qualifiedCandidates,
      readyQueueItems,
      recentAttempts: recentAttempts.length,
      taggedSettlements: input.profitValidation.overall.trades,
    });

    return deepFreeze({
      version: "84.1" as const,
      generatedAt: now,
      strategyId: "cross-exchange-arbitrage" as const,
      profile: "PERSONAL_SELF_USE" as const,
      status,
      primaryBottleneck,
      nextAction: nextAction(status, primaryBottleneck),
      snapshot: {
        scanStartedAt: diagnostics?.scanStartedAt ?? null,
        cachedQuotes: diagnostics?.cachedQuotes ?? input.bottleneck.summary.cachedQuotes,
        executableQuotes,
        evaluatedPairs,
        engineAccepted,
        profitQualified,
        currentOpportunities: input.opportunities.length,
        executeDecisions: input.opportunities.filter((opportunity) => opportunity.decision === "EXECUTE").length,
        activeCandidates,
        qualifiedCandidates,
        readyQueueItems,
      },
      stages,
      engineRejections,
      qualificationFailures,
      arbitration: {
        basis: "FULL_DEPTH_MODELED_INR_PROFIT_THEN_NET_RETURN" as const,
        currentEligible: convertedCandidates.filter((candidate) => candidate.paperAdmissionAllowed).length,
        paperReady: convertedCandidates.filter((candidate) => candidate.selectableForPaper).length,
        admissionBlocked: convertedCandidates.filter((candidate) => !candidate.paperAdmissionAllowed).length,
        currentLeaderOpportunityId: currentLeader?.opportunityId ?? null,
        currentLeaderCandidateKey: currentLeader?.candidateKey ?? null,
        currentLeaderModeledCapitalInr: currentLeader?.modeledCapitalInr ?? null,
        currentLeaderModeledNetProfitInr: currentLeader?.modeledNetProfitInr ?? null,
        paperWinnerCandidateKey: paperWinner?.candidateKey ?? null,
        routeHistoryUsedAsTieBreakOnly: true as const,
      },
      currentCandidates,
      recentPaper: {
        windowMs: RECENT_EXECUTION_WINDOW_MS,
        cycles: recentCycles.length,
        attempts: recentAttempts.length,
        executed: recentExecuted,
        rejected: recentRejected,
        latestStatus: latestCycle?.status ?? null,
        latestAt: latestCycle?.completedAt ?? null,
        latestReasons: latestCycle ? [...latestCycle.reasons] : [],
        orchestratorMode: input.orchestrator.mode,
        orchestratorStatus: input.orchestrator.lastCycle?.status ?? null,
        orchestratorReasons: input.orchestrator.lastCycle ? [...input.orchestrator.lastCycle.reasons] : [],
      },
      postGuard: {
        taggedSettlements: input.profitValidation.overall.trades,
        targetSettlements: input.profitValidation.targetValidationTrades,
        validationStatus: input.profitValidation.validationStatus,
        latestTradeAt: input.profitValidation.latestTradeAt,
        quarantinedRoutes: input.profitValidation.quarantinedRoutes,
      },
      policy: {
        discoveryMinimumNetProfitPercent: diagnostics?.profitPolicy.discoveryMinimumNetProfitPercent ?? null,
        qualificationMinimumNetProfitPercent: diagnostics?.profitPolicy.qualificationMinimumNetProfitPercent ?? null,
        liveMinimumNetProfitPercent: diagnostics?.profitPolicy.liveMinimumNetProfitPercent ?? null,
        thresholdMutationAllowed: false as const,
      },
      safety: {
        readOnlyDiagnostics: true as const,
        realEvidenceOnly: true as const,
        fakeOpportunityAllowed: false as const,
        paperExecutionTriggeredByRead: false as const,
        liveExecutionAllowed: false as const,
        orderSubmissionAllowed: false as const,
      },
    });
  }

  private buildStages(input: {
    diagnostics: OpportunityPipelineDiagnostics | null;
    executableQuotes: number;
    evaluatedPairs: number;
    engineAccepted: number;
    profitQualified: number;
    activeCandidates: number;
    qualifiedCandidates: number;
    readyQueueItems: number;
    recentAttempts: number;
    taggedSettlements: number;
  }): PersonalOpportunityConversionStage[] {
    const marketPassed = input.executableQuotes > 0;
    const evaluated = input.evaluatedPairs > 0;
    const accepted = input.engineAccepted > 0;
    const persistent = input.activeCandidates > 0;
    const qualified = input.qualifiedCandidates > 0;
    const queued = input.readyQueueItems > 0;

    return [
      stage("EXECUTABLE_MARKET_DATA", "Executable quotes", marketPassed ? "PASSED" : "BLOCKED", input.executableQuotes, "CURRENT_SCAN",
        marketPassed ? `${input.executableQuotes} execution-quality quotes entered the current scan.` : "No execution-quality quote is available."),
      stage("PAIR_EVALUATION", "Pairs evaluated", evaluated ? "PASSED" : marketPassed ? "WAITING" : "NOT_REACHED", input.evaluatedPairs, "CURRENT_SCAN",
        evaluated ? `${input.evaluatedPairs} directional pairs were evaluated.` : "Pair evaluation has no current evidence."),
      stage("ENGINE_ACCEPTANCE", "Engine accepted", accepted ? "PASSED" : evaluated ? "BLOCKED" : "NOT_REACHED", input.engineAccepted, "CURRENT_SCAN",
        accepted ? `${input.engineAccepted} net-positive opportunities passed the engine.` : "No pair passed all current engine economics and integrity gates."),
      stage("PROFIT_QUALIFICATION", "Profit-qualified", input.profitQualified > 0 ? "PASSED" : accepted ? "WAITING" : "NOT_REACHED", input.profitQualified, "CURRENT_SCAN",
        input.profitQualified > 0 ? `${input.profitQualified} opportunities meet the qualification profit tier.` : "No current accepted opportunity meets the qualification profit tier."),
      stage("PERSISTENCE_MONITOR", "Persistent candidates", persistent ? "PASSED" : accepted ? "WAITING" : "NOT_REACHED", input.activeCandidates, "CURRENT_STATE",
        persistent ? `${input.activeCandidates} candidates remain active across authoritative snapshots.` : "Accepted routes must survive consecutive observations before qualification."),
      stage("CANDIDATE_QUALIFICATION", "Qualified candidates", qualified ? "PASSED" : persistent ? "BLOCKED" : "NOT_REACHED", input.qualifiedCandidates, "CURRENT_STATE",
        qualified ? `${input.qualifiedCandidates} candidates passed persistence, profit, depth and freshness checks.` : "No active candidate currently passes every qualification check."),
      stage("CENTRAL_QUEUE", "Central queue", queued ? "PASSED" : qualified ? "WAITING" : "NOT_REACHED", input.readyQueueItems, "CURRENT_STATE",
        queued ? `${input.readyQueueItems} Strategy #1 candidates are READY for central ownership.` : "No qualified candidate is waiting in the central queue."),
      stage("PAPER_ATTEMPT", "PAPER attempts", input.recentAttempts > 0 ? "PASSED" : queued ? "WAITING" : "NOT_REACHED", input.recentAttempts, "RECENT_5_MIN",
        input.recentAttempts > 0 ? `${input.recentAttempts} PAPER attempts occurred in the last five minutes.` : "No qualified candidate reached PAPER execution in the last five minutes."),
      stage("POST_GUARD_SETTLEMENT", "Tagged settlements", input.taggedSettlements > 0 ? "PASSED" : input.recentAttempts > 0 ? "WAITING" : "NOT_REACHED", input.taggedSettlements, "DURABLE_COHORT",
        input.taggedSettlements > 0 ? `${input.taggedSettlements} restart-safe V1 settlements are in the profit cohort.` : "The durable post-guard profit cohort is waiting for its first completed settlement."),
    ];
  }

  private engineRejections(
    diagnostics: OpportunityPipelineDiagnostics | null,
    bottleneck: OpportunityPipelineBottleneckReport,
    evaluatedPairs: number,
  ): PersonalOpportunityConversionBlocker[] {
    if (!diagnostics) {
      return bottleneck.engine.rejectionCodes.slice(0, 8).map((item) => blocker(
        "ENGINE", item.code, humanize(item.code), item.count, item.percent,
        `Recent rejection evidence reports ${item.code}.`,
        "Inspect the affected market evidence; do not weaken profit or safety policy without validated data.",
      ));
    }

    const engine = diagnostics.diagnostics.engine;
    const evaluator = diagnostics.diagnostics.evaluator;
    const candidates: Array<Omit<PersonalOpportunityConversionBlocker, "percentOfEvaluatedPairs">> = [
      rejection("EXECUTION_QUALITY", "EXECUTION_QUALITY_FILTERED", diagnostics.executionQualityFilteredQuotes,
        "Quotes excluded by venue execution-quality policy.", "Restore stable full-depth evidence on the affected venue/market."),
      rejection("EVALUATOR", "STALE_BUY_QUOTE", evaluator.staleBuyQuote,
        "Buy-side quote exceeded its exchange-specific freshness limit.", "Restore a fresh buy-side order book; do not widen freshness limits."),
      rejection("EVALUATOR", "STALE_SELL_QUOTE", evaluator.staleSellQuote,
        "Sell-side quote exceeded its exchange-specific freshness limit.", "Restore a fresh sell-side order book; do not widen freshness limits."),
      rejection("EVALUATOR", "STALE_BOTH_QUOTES", evaluator.staleBothQuotes,
        "Both route quotes were stale.", "Restore synchronized fresh order books on both venues."),
      rejection("EVALUATOR", "PAIR_NOT_SYNCHRONIZED", evaluator.pairSynchronizationRejected,
        "Buy and sell quotes were individually fresh but not time-synchronized.", "Fix venue stream timing/skew; do not compare asynchronous books."),
      rejection("EVALUATOR", "PRICE_RESOLUTION_FAILED", evaluator.priceResolutionFailed,
        "Executable bid/ask prices could not be resolved.", "Restore complete two-sided executable depth."),
      rejection("EVALUATOR", "BUY_FEE_MISSING", evaluator.buyFeeMissing,
        "Authoritative buy-side fee evidence is missing.", "Complete the buy venue fee schedule; never assume a zero fee."),
      rejection("EVALUATOR", "SELL_FEE_MISSING", evaluator.sellFeeMissing,
        "Authoritative sell-side fee evidence is missing.", "Complete the sell venue fee schedule; never assume a zero fee."),
      rejection("EVALUATOR", "INVALID_BUY_PRICE", evaluator.invalidBuyPrice,
        "Buy price is invalid or non-positive.", "Repair the source order-book normalization."),
      rejection("EVALUATOR", "INVALID_SELL_PRICE", evaluator.invalidSellPrice,
        "Sell price is invalid or non-positive.", "Repair the source order-book normalization."),
      rejection("ENGINE", "INVALID_MARKET_DATA", engine.invalidMarketData,
        "Market data failed engine validation.", "Inspect normalized quote integrity for the affected route."),
      rejection("ENGINE", "SPREAD_BELOW_MINIMUM", engine.spreadRejected,
        "Gross spread is below the configured discovery floor.", "Wait for a real wider spread; do not lower the floor from a diagnostic read."),
      rejection("ENGINE", "NET_PROFIT_BELOW_MINIMUM", engine.netProfitRejected,
        "Net profit after explicit costs is below policy.", "Wait for stronger economics or improve verified fee/depth inputs."),
      rejection("ENGINE", "INVALID_EXECUTABLE_QUANTITY", engine.quantityRejected,
        "No positive executable quantity survived both books.", "Restore quantity-bearing depth on both venues."),
      rejection("ENGINE", "LIQUIDITY_REJECTED", engine.liquidityRejected,
        "Available depth cannot support the reference capital safely.", "Allow a deeper route to appear; capital sizing stays bounded."),
      rejection("ENGINE", "FRESHNESS_REJECTED", engine.freshnessRejected,
        "Execution analysis rejected quote freshness.", "Repair the stale market-data source."),
      rejection("ENGINE", "FEE_REJECTED", engine.feeRejected,
        "Execution analysis rejected incomplete or invalid fees.", "Restore authoritative fee evidence."),
      rejection("ENGINE", "SPREAD_ANALYSIS_REJECTED", engine.spreadAnalysisRejected,
        "Post-cost spread analysis failed.", "Inspect explicit fees, slippage and book depth for the route."),
      rejection("ENGINE", "QUOTE_INTEGRITY_REJECTED", engine.quoteIntegrityRejected,
        "Quote integrity checks rejected a crossed or inconsistent book.", "Recover the affected full-depth book before reuse."),
    ];

    return candidates
      .filter((item) => item.count > 0)
      .map((item) => ({
        ...item,
        percentOfEvaluatedPairs: evaluatedPairs > 0 ? round(item.count / evaluatedPairs * 100, 2) : null,
      }))
      .sort((first, second) => second.count - first.count || first.code.localeCompare(second.code))
      .slice(0, 8);
  }

  private resolveStatus(input: {
    executableQuotes: number;
    evaluatedPairs: number;
    engineAccepted: number;
    activeCandidates: number;
    qualifiedCandidates: number;
    readyQueueItems: number;
    recentRejected: number;
    recentExecuted: number;
    taggedSettlements: number;
  }): PersonalOpportunityConversionStatus {
    if (input.executableQuotes === 0 || input.evaluatedPairs === 0) return "NO_MARKET_DATA";
    if (input.engineAccepted === 0) return "ENGINE_FILTERING";
    if (input.activeCandidates === 0) return "PERSISTENCE_WAIT";
    if (input.qualifiedCandidates === 0) return "QUALIFICATION_BLOCKED";
    if (input.readyQueueItems === 0 && input.recentExecuted === 0 && input.recentRejected === 0) return "QUEUE_WAIT";
    if (input.recentRejected > 0 && input.recentExecuted === 0) return "PAPER_REJECTED";
    if (input.recentExecuted > 0 || input.taggedSettlements > 0) return "COLLECTING_POST_GUARD";
    return "READY_FOR_PAPER";
  }

  private resolvePrimaryBottleneck(
    status: PersonalOpportunityConversionStatus,
    engineRejections: readonly PersonalOpportunityConversionBlocker[],
    qualificationFailures: readonly {check: string; count: number; reason: string}[],
    input: PersonalOpportunityConversionInput,
  ): PersonalOpportunityConversionBlocker | null {
    if (status === "ENGINE_FILTERING" || status === "NO_MARKET_DATA") return engineRejections[0] ?? null;
    if (status === "PERSISTENCE_WAIT") return blocker("PERSISTENCE", "INSUFFICIENT_CONSECUTIVE_EVIDENCE", "Persistence evidence", 0, null,
      "Current accepted opportunities have not survived enough authoritative snapshots.", "Keep real market data running; the candidate must persist naturally.");
    if (status === "QUALIFICATION_BLOCKED") {
      const failure = qualificationFailures[0];
      return failure ? blocker("QUALIFICATION", failure.check.toUpperCase(), humanize(failure.check), failure.count, null,
        failure.reason, "Repair the named evidence owner; do not lower qualification thresholds automatically.") : null;
    }
    if (status === "QUEUE_WAIT") return blocker("QUEUE", "NO_READY_CANDIDATE", "Central queue empty", 0, null,
      "No currently qualified Strategy #1 candidate is READY in the central queue.", "Wait for exact attributed qualification and queue handoff evidence.");
    if (status === "PAPER_REJECTED") {
      const latest = input.controller.lastCycle;
      return blocker("PAPER", latest?.status ?? "EXECUTION_REJECTED", "PAPER execution rejected", 1, null,
        latest?.reasons[0] ?? "The latest PAPER attempt failed an authoritative gate.", "Resolve the exact reported gate; LIVE and order submission remain disabled.");
    }
    return null;
  }

  private toCandidate(
    opportunity: ArbitrageOpportunity,
    input: PersonalOpportunityConversionInput,
  ): PersonalOpportunityCandidateConversion {
    /*
     * Monitor/qualification/queue and post-guard profitability intentionally
     * use different stable key namespaces. Keep both explicit: collapsing
     * these formats made real qualified candidates appear NOT_OBSERVED in the
     * personal BOT conversion panel.
     */
    const candidateKey = monitorCandidateKey(
      opportunity.pair.market,
      opportunity.pair.buy.exchange,
      opportunity.pair.sell.exchange,
    );
    const profitRouteKey = postGuardRouteKey(
      opportunity.pair.market,
      opportunity.pair.buy.exchange,
      opportunity.pair.sell.exchange,
    );
    const qualification = input.qualification.qualifications.find((item) => item.key === candidateKey) ?? null;
    const queueItem = input.queue.items.find((item) => item.candidateKey === candidateKey) ?? null;
    const profitRoute = input.profitValidation.routes.find((item) => item.routeKey === profitRouteKey) ?? null;
    const economics = resolveModeledEconomics(opportunity, qualification);
    const failedCheckDetails = qualification
      ? Object.entries(qualification.checks)
        .filter(([, check]) => !check.passed)
        .map(([check, evidence]) => ({
          check,
          reason: evidence.reason,
          currentValue: evidence.currentValue,
          requiredValue: evidence.requiredValue,
        }))
      : [];
    const failedChecks = failedCheckDetails.map((failure) => failure.check);
    const waitingOnPersistence = qualification?.status === "OBSERVING" || (
      failedChecks.length > 0 &&
      failedChecks.every((check) => ["active", "consecutiveObservations", "persistence"].includes(check))
    );
    const selectableForPaper =
      opportunity.decision === "EXECUTE" &&
      qualification?.qualified === true &&
      queueItem?.status === "READY" &&
      (profitRoute?.paperAdmissionAllowed ?? true);
    const currentStage: PersonalOpportunityConversionStageKey = queueItem?.status === "READY"
      ? "CENTRAL_QUEUE"
      : qualification?.qualified
        ? "CANDIDATE_QUALIFICATION"
        : qualification
          ? waitingOnPersistence
            ? "PERSISTENCE_MONITOR"
            : "CANDIDATE_QUALIFICATION"
          : opportunity.decision === "EXECUTE"
            ? "PROFIT_QUALIFICATION"
            : "ENGINE_ACCEPTANCE";
    const reason = profitRoute && !profitRoute.paperAdmissionAllowed
      ? `Exact route is ${profitRoute.state} after ${profitRoute.metrics.trades} tagged settlements.`
      : queueItem?.status === "READY"
        ? "Candidate is READY for the central Strategy #1 execution owner."
        : qualification?.qualified
          ? "Candidate passed qualification and is awaiting/has completed queue handoff."
          : failedCheckDetails.length > 0
            ? failedCheckDetails
              .map((failure) => `${failure.check}: ${failure.reason}`)
              .join(" | ")
            : qualification?.reasons[0]
            ?? opportunity.analysisSummary[0]
            ?? "Accepted engine opportunity is awaiting persistence evidence.";

    return {
      opportunityId: opportunity.id,
      candidateKey,
      profitRouteKey,
      market: opportunity.pair.market,
      buyExchange: opportunity.pair.buy.exchange,
      sellExchange: opportunity.pair.sell.exchange,
      decision: opportunity.decision,
      netProfit: opportunity.netProfit,
      netProfitPercent: opportunity.netProfitPercent,
      executableQuantity: opportunity.executableQty,
      score: opportunity.score,
      modeledCapitalInr: economics.capitalInr,
      modeledNetProfitInr: economics.netProfitInr,
      economicEvidence: economics.source,
      queuePriorityScore: queueItem?.priorityScore ?? null,
      paperSelectionState: selectableForPaper ? "SELECTABLE" : "NOT_AUTHORIZED",
      consecutiveObservations: qualification?.candidate.consecutiveObservations ?? 0,
      persistenceMs: qualification?.candidate.lifetimeMs ?? 0,
      currentStage,
      qualificationStatus: qualification?.status ?? "NOT_OBSERVED",
      queueStatus: queueItem?.status ?? null,
      routeProfitState: profitRoute?.state ?? "NO_SAMPLE",
      routeSampleTrades: profitRoute?.metrics.trades ?? 0,
      routeExpectancyInr: profitRoute?.metrics.expectancyPerTrade ?? null,
      routeAverageNetReturnPercent: profitRoute?.metrics.averageNetReturnPercent ?? null,
      paperAdmissionAllowed: profitRoute?.paperAdmissionAllowed ?? true,
      selectableForPaper,
      failedChecks,
      failedCheckDetails,
      reason,
    };
  }
}

function stage(
  key: PersonalOpportunityConversionStageKey,
  label: string,
  status: PersonalOpportunityConversionStageStatus,
  count: number,
  scope: PersonalOpportunityConversionStage["scope"],
  reason: string,
): PersonalOpportunityConversionStage {
  return {key, label, status, count, scope, reason};
}

function rejection(
  stageName: PersonalOpportunityConversionBlocker["stage"],
  code: string,
  count: number,
  reason: string,
  operatorAction: string,
): Omit<PersonalOpportunityConversionBlocker, "percentOfEvaluatedPairs"> {
  return {stage: stageName, code, label: humanize(code), count, reason, operatorAction};
}

function blocker(
  stageName: PersonalOpportunityConversionBlocker["stage"],
  code: string,
  label: string,
  count: number,
  percentOfEvaluatedPairs: number | null,
  reason: string,
  operatorAction: string,
): PersonalOpportunityConversionBlocker {
  return {stage: stageName, code, label, count, percentOfEvaluatedPairs, reason, operatorAction};
}

function monitorCandidateKey(market: string, buyExchange: string, sellExchange: string): string {
  return `${market.trim().toUpperCase()}|${buyExchange.trim().toLowerCase()}|${sellExchange.trim().toLowerCase()}`;
}

function postGuardRouteKey(market: string, buyExchange: string, sellExchange: string): string {
  return `${market.trim().toUpperCase()}|${buyExchange.trim().toLowerCase()}>${sellExchange.trim().toLowerCase()}`;
}

function resolveModeledEconomics(
  opportunity: ArbitrageOpportunity,
  qualification: CandidateQualificationDiagnostics["qualifications"][number] | null,
): {
  capitalInr: number | null;
  netProfitInr: number | null;
  source: PersonalOpportunityCandidateConversion["economicEvidence"];
} {
  const capitalAware = qualification?.liquidityAssessment.capitalAware;
  if (
    capitalAware?.simulationSuccess === true &&
    capitalAware.fullyExecutable &&
    capitalAware.fillPercent !== null &&
    capitalAware.fillPercent >= 100 &&
    capitalAware.netProfitPercent !== null &&
    Number.isFinite(capitalAware.netProfitPercent) &&
    Number.isFinite(capitalAware.validationCapital) &&
    capitalAware.validationCapital > 0
  ) {
    return {
      capitalInr: round(capitalAware.validationCapital, 2),
      netProfitInr: round(capitalAware.validationCapital * capitalAware.netProfitPercent / 100, 6),
      source: "FULL_DEPTH_VALIDATION",
    };
  }

  const capitalInr = opportunity.executableCapitalInr ?? opportunity.requestedCapitalInr ?? null;
  if (
    capitalInr !== null &&
    Number.isFinite(capitalInr) &&
    capitalInr > 0 &&
    Number.isFinite(opportunity.netProfitPercent)
  ) {
    return {
      capitalInr: round(capitalInr, 2),
      netProfitInr: round(capitalInr * opportunity.netProfitPercent / 100, 6),
      source: "CURRENT_OPPORTUNITY",
    };
  }

  return {capitalInr: null, netProfitInr: null, source: "UNAVAILABLE"};
}

function compareCandidateEconomics(
  first: PersonalOpportunityCandidateConversion,
  second: PersonalOpportunityCandidateConversion,
): number {
  if (first.paperAdmissionAllowed !== second.paperAdmissionAllowed) {
    return first.paperAdmissionAllowed ? -1 : 1;
  }

  const decisionDifference = decisionRank(first.decision) - decisionRank(second.decision);
  if (decisionDifference !== 0) return decisionDifference;

  const firstProfit = first.modeledNetProfitInr ?? Number.NEGATIVE_INFINITY;
  const secondProfit = second.modeledNetProfitInr ?? Number.NEGATIVE_INFINITY;
  if (firstProfit !== secondProfit) return secondProfit - firstProfit;

  if (first.netProfitPercent !== second.netProfitPercent) {
    return second.netProfitPercent - first.netProfitPercent;
  }

  const firstHistory = first.routeAverageNetReturnPercent ?? Number.NEGATIVE_INFINITY;
  const secondHistory = second.routeAverageNetReturnPercent ?? Number.NEGATIVE_INFINITY;
  if (firstHistory !== secondHistory) return secondHistory - firstHistory;

  return second.score - first.score || first.candidateKey.localeCompare(second.candidateKey);
}

function qualificationFailureReason(check: string): string {
  const reasons: Record<string, string> = {
    active: "Candidate is no longer active in the latest authoritative snapshot.",
    consecutiveObservations: "Candidate has not survived the required number of consecutive observations.",
    persistence: "Candidate has not persisted for the required duration.",
    netProfit: "Latest net profit is below the qualification floor.",
    liquidity: "Verified full-depth liquidity cannot support the bounded validation capital.",
    freshness: "Candidate freshness score is below the required level.",
    profitStability: "Candidate profit drawdown exceeds the permitted stability range.",
  };
  return reasons[check] ?? `Qualification check ${check} did not pass.`;
}

function nextAction(
  status: PersonalOpportunityConversionStatus,
  primary: PersonalOpportunityConversionBlocker | null,
): string {
  if (status === "COLLECTING_POST_GUARD") return "Keep the personal PAPER bot running and collect only V1-tagged settlements for expectancy validation.";
  if (status === "READY_FOR_PAPER") return "The current Strategy #1 lane is ready; the central owner will attempt the next qualified PAPER candidate automatically.";
  return primary?.operatorAction ?? "Keep real market data running and wait for the next authoritative pipeline snapshot.";
}

function decisionRank(decision: ArbitrageOpportunity["decision"]): number {
  return decision === "EXECUTE" ? 0 : decision === "REVIEW" ? 1 : 2;
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const personalOpportunityConversionService = new PersonalOpportunityConversionService();
