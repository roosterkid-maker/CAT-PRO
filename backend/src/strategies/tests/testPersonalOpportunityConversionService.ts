import assert from "node:assert/strict";

import type {ArbitrageOpportunity} from "../../arbitrage/models/ArbitrageOpportunity";
import type {OpportunityPipelineBottleneckReport} from "../../automation/models/OpportunityPipelineBottleneck";
import type {AutomatedPaperExecutionControllerDiagnostics} from "../../automation/models/AutomatedPaperExecutionController";
import type {CandidateQualificationDiagnostics, CandidateQualificationRecord} from "../../automation/models/CandidateQualification";
import type {ExecutionCandidateQueueDiagnostics} from "../../automation/models/ExecutionCandidateQueue";
import type {PostGuardProfitValidationReport} from "../../trading/services/PostGuardProfitValidationLedgerService";
import type {UnifiedAutomatedExecutionDiagnostics} from "../../workflows/cross-exchange-arbitrage/models/UnifiedAutomatedExecution";
import {
  PersonalOpportunityConversionService,
  type PersonalOpportunityConversionInput,
} from "../services/PersonalOpportunityConversionService";

const NOW = 1_900_000_000_000;

function main(): void {
  verifyCurrentEngineBottleneck();
  verifyQualificationBottleneck();
  verifySuccessfulConversionTrace();
  verifyKeyNamespacesAndQuarantineArbitration();
  verifyDependencyReadIsSingleAndNonExecuting();

  console.log("PERSONAL OPPORTUNITY CONVERSION TEST PASSED.");
  console.log("Current scan, persistence, qualification, central queue, PAPER and post-guard evidence were composed read-only without threshold, LIVE or order authority.");
}

function verifyCurrentEngineBottleneck(): void {
  const input = createInput();
  input.diagnostics!.diagnostics.engine.evaluated = 100;
  input.diagnostics!.diagnostics.engine.spreadRejected = 60;
  input.diagnostics!.diagnostics.evaluator.buyFeeMissing = 20;
  input.diagnostics!.acceptedOpportunities = 0;
  input.bottleneck.summary.evaluatedPairs = 100;
  const report = new PersonalOpportunityConversionService({getInput: () => input}).getReport(NOW);

  assert.equal(report.version, "84.1");
  assert.equal(report.profile, "PERSONAL_SELF_USE");
  assert.equal(report.status, "ENGINE_FILTERING");
  assert.equal(report.primaryBottleneck?.code, "SPREAD_BELOW_MINIMUM");
  assert.equal(report.primaryBottleneck?.percentOfEvaluatedPairs, 60);
  assert.equal(report.stages.find((stage) => stage.key === "ENGINE_ACCEPTANCE")?.status, "BLOCKED");
  assert.equal(report.policy.thresholdMutationAllowed, false);
  assert.equal(report.safety.paperExecutionTriggeredByRead, false);
  assert.equal(report.safety.liveExecutionAllowed, false);
  assert.equal(report.safety.orderSubmissionAllowed, false);
}

function verifyQualificationBottleneck(): void {
  const input = createInput();
  input.opportunities = [createOpportunity()];
  input.diagnostics!.acceptedOpportunities = 1;
  input.diagnostics!.profitTiers.qualified = 1;
  input.diagnostics!.diagnostics.engine.accepted = 1;
  input.bottleneck.summary.acceptedOpportunities = 1;
  input.bottleneck.summary.activeCandidates = 1;
  input.bottleneck.qualification.failedChecks = [{check: "liquidity", count: 1}];
  input.qualification = createQualificationDiagnostics(false);
  const report = new PersonalOpportunityConversionService({getInput: () => input}).getReport(NOW);

  assert.equal(report.status, "QUALIFICATION_BLOCKED");
  assert.equal(report.primaryBottleneck?.code, "LIQUIDITY");
  assert.equal(report.currentCandidates[0]?.qualificationStatus, "REJECTED");
  assert.ok(report.currentCandidates[0]?.failedChecks.includes("liquidity"));
  assert.equal(report.currentCandidates[0]?.currentStage, "PERSISTENCE_MONITOR");
}

function verifySuccessfulConversionTrace(): void {
  const input = createInput();
  const opportunity = createOpportunity();
  const qualification = createQualification(true);
  input.opportunities = [opportunity];
  input.diagnostics!.acceptedOpportunities = 1;
  input.diagnostics!.profitTiers.qualified = 1;
  input.diagnostics!.diagnostics.engine.accepted = 1;
  input.bottleneck.summary.acceptedOpportunities = 1;
  input.bottleneck.summary.activeCandidates = 1;
  input.bottleneck.summary.qualifiedCandidates = 1;
  input.bottleneck.summary.readyQueueItems = 1;
  input.qualification = createQualificationDiagnostics(true);
  input.queue = createQueue(qualification);
  input.controller.recentCycles = [createControllerCycle("EXECUTED")];
  input.controller.lastCycle = input.controller.recentCycles[0]!;
  input.orchestrator.lastCycle = createOrchestratorCycle();
  input.profitValidation = createProfitValidation(1);
  const report = new PersonalOpportunityConversionService({getInput: () => input}).getReport(NOW);

  assert.equal(report.status, "COLLECTING_POST_GUARD");
  assert.equal(report.primaryBottleneck, null);
  assert.equal(report.snapshot.executeDecisions, 1);
  assert.equal(report.recentPaper.executed, 1);
  assert.equal(report.postGuard.taggedSettlements, 1);
  assert.equal(report.currentCandidates[0]?.currentStage, "CENTRAL_QUEUE");
  assert.equal(report.currentCandidates[0]?.queueStatus, "READY");
  assert.equal(report.currentCandidates[0]?.paperAdmissionAllowed, true);
  assert.equal(report.currentCandidates[0]?.candidateKey, "BTCUSDT|coindcx|binance");
  assert.equal(report.currentCandidates[0]?.profitRouteKey, "BTCUSDT|coindcx>binance");
  assert.equal(report.currentCandidates[0]?.economicEvidence, "FULL_DEPTH_VALIDATION");
  assert.equal(report.currentCandidates[0]?.modeledCapitalInr, 100);
  assert.equal(report.currentCandidates[0]?.modeledNetProfitInr, 0.8);
  assert.equal(report.currentCandidates[0]?.selectableForPaper, true);
  assert.equal(report.arbitration.paperWinnerCandidateKey, "BTCUSDT|coindcx|binance");
  assert.equal(report.stages.find((stage) => stage.key === "POST_GUARD_SETTLEMENT")?.status, "PASSED");
}

function verifyKeyNamespacesAndQuarantineArbitration(): void {
  const input = createInput();
  const qualification = createQualification(true);
  input.opportunities = [createOpportunity()];
  input.diagnostics!.acceptedOpportunities = 1;
  input.diagnostics!.profitTiers.qualified = 1;
  input.diagnostics!.diagnostics.engine.accepted = 1;
  input.bottleneck.summary.acceptedOpportunities = 1;
  input.bottleneck.summary.activeCandidates = 1;
  input.bottleneck.summary.qualifiedCandidates = 1;
  input.bottleneck.summary.readyQueueItems = 1;
  input.qualification = createQualificationDiagnostics(true);
  input.queue = createQueue(qualification);
  input.profitValidation = createProfitValidation(10);
  const route = input.profitValidation.routes[0]!;
  route.state = "QUARANTINED";
  route.paperAdmissionAllowed = false;
  route.quarantineUntil = NOW + 60_000;
  route.metrics.expectancyPerTrade = -0.25;
  route.metrics.averageNetReturnPercent = -0.25;
  input.profitValidation.quarantinedRoutes = 1;

  const report = new PersonalOpportunityConversionService({getInput: () => input}).getReport(NOW);
  const candidate = report.currentCandidates[0]!;

  assert.equal(candidate.qualificationStatus, "QUALIFIED");
  assert.equal(candidate.queueStatus, "READY");
  assert.equal(candidate.routeProfitState, "QUARANTINED");
  assert.equal(candidate.paperAdmissionAllowed, false);
  assert.equal(candidate.selectableForPaper, false);
  assert.equal(candidate.routeSampleTrades, 10);
  assert.equal(candidate.routeExpectancyInr, -0.25);
  assert.equal(report.arbitration.currentEligible, 0);
  assert.equal(report.arbitration.admissionBlocked, 1);
  assert.equal(report.arbitration.paperWinnerCandidateKey, null);
}

function verifyDependencyReadIsSingleAndNonExecuting(): void {
  let reads = 0;
  const service = new PersonalOpportunityConversionService({
    getInput: () => {
      reads += 1;
      return createInput();
    },
  });
  const report = service.getReport(NOW);
  assert.equal(reads, 1);
  assert.equal(report.safety.readOnlyDiagnostics, true);
  assert.equal(report.safety.realEvidenceOnly, true);
}

function createInput(): PersonalOpportunityConversionInput {
  return {
    opportunities: [],
    diagnostics: {
      scanStartedAt: NOW - 50,
      generatedAt: NOW,
      cachedQuotes: 500,
      executionQualityEligibleQuotes: 400,
      executionQualityFilteredQuotes: 10,
      bybitObservedMarkets: 200,
      bybitExecutionEligibleMarkets: 180,
      marketSnapshots: 300,
      exchangePairs: 100,
      acceptedOpportunities: 0,
      profitPolicy: {
        discoveryMinimumNetProfitPercent: 0.05,
        qualificationMinimumNetProfitPercent: 0.2,
        liveMinimumNetProfitPercent: 0.5,
      },
      profitTiers: {discovered: 0, qualified: 0, liveEligible: 0},
      diagnostics: {
        engine: {
          evaluated: 100,
          evaluatorRejected: 0,
          invalidMarketData: 0,
          spreadRejected: 0,
          netProfitRejected: 0,
          quantityRejected: 0,
          liquidityRejected: 0,
          freshnessRejected: 0,
          feeRejected: 0,
          spreadAnalysisRejected: 0,
          quoteIntegrityRejected: 0,
          accepted: 0,
        },
        evaluator: {
          evaluated: 100,
          staleBuyQuote: 0,
          staleSellQuote: 0,
          staleBothQuotes: 0,
          pairSynchronizationRejected: 0,
          priceResolutionFailed: 0,
          buyFeeMissing: 0,
          sellFeeMissing: 0,
          invalidBuyPrice: 0,
          invalidSellPrice: 0,
          accepted: 100,
        },
      },
    },
    bottleneck: createBottleneck(),
    qualification: createQualificationDiagnostics(false, false),
    queue: createQueue(),
    controller: createController(),
    orchestrator: createOrchestrator(),
    profitValidation: createProfitValidation(0),
  };
}

function createBottleneck(): OpportunityPipelineBottleneckReport {
  return {
    generatedAt: NOW,
    version: "17.3",
    build: "1",
    mode: "DIAGNOSTIC_ONLY",
    tradingPolicyMutationAllowed: false,
    liveExecutionAllowed: false,
    status: "ENGINE_REJECTING",
    primaryBottleneck: "SPREAD",
    primaryBottleneckPercent: 60,
    summary: {
      cachedQuotes: 500,
      executableQuotes: 400,
      sharedMarkets: 100,
      pairableMarkets: 50,
      directionalPairs: 100,
      evaluatedPairs: 100,
      acceptedOpportunities: 0,
      activeCandidates: 0,
      qualifiedCandidates: 0,
      readyQueueItems: 0,
      shadowDispatches: 0,
      completedShadowOutcomes: 0,
    },
    stages: [],
    engine: {
      rejectionSampleSize: 100,
      primaryRejectionStage: "SPREAD",
      primaryRejectionPercent: 60,
      rejectionStages: [],
      rejectionCodes: [],
      closestToExecution: [],
    },
    qualification: {observing: 0, qualified: 0, rejected: 0, expired: 0, failedChecks: []},
    shadow: {
      totalDispatched: 0,
      revalidationFailed: 0,
      duplicatesSuppressed: 0,
      trackedDispatches: 0,
      tracking: 0,
      success: 0,
      failed: 0,
      dataUnavailable: 0,
      completed: 0,
      readinessLevel: "READY_FOR_PAPER",
      readinessScore: 100,
    },
    observations: [],
  };
}

function createOpportunity(): ArbitrageOpportunity {
  return {
    id: "conversion-opportunity",
    pair: {
      market: "BTCUSDT",
      buy: {exchange: "coindcx", market: "BTCUSDT", lastPrice: 100, bestBidPrice: 99.9, bestBidQty: 10, bestAskPrice: 100, bestAskQty: 10, spread: 0.1, timestamp: NOW, source: "orderBook", executable: true},
      sell: {exchange: "binance", market: "BTCUSDT", lastPrice: 101, bestBidPrice: 101, bestBidQty: 10, bestAskPrice: 101.1, bestAskQty: 10, spread: 0.1, timestamp: NOW, source: "orderBook", executable: true},
    },
    buyPrice: 100,
    sellPrice: 101,
    buyAvailableQty: 10,
    sellAvailableQty: 10,
    requiredQty: 1,
    availableExecutableQty: 10,
    executableQty: 1,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 100,
    decision: "EXECUTE",
    analysisSummary: ["Fixture is executable."],
    rawSpread: 1,
    rawSpreadPercent: 1,
    estimatedFees: 0.2,
    netProfit: 0.8,
    netProfitPercent: 0.8,
    usedLastPriceFallback: false,
    quotesAreFresh: true,
    score: 95,
    timestamp: NOW,
  };
}

function createQualification(qualified: boolean): CandidateQualificationRecord {
  const opportunity = createOpportunity();
  const passedCheck = {passed: true, currentValue: 1, requiredValue: 1, reason: "Passed."};
  const liquidityCheck = qualified ? passedCheck : {passed: false, currentValue: 20, requiredValue: 70, reason: "Liquidity failed."};
  return {
    key: "BTCUSDT|coindcx|binance",
    market: "BTCUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
    status: qualified ? "QUALIFIED" : "REJECTED",
    qualified,
    score: qualified ? 100 : 85,
    evaluatedAt: NOW,
    profitDrawdownPercent: 0,
    liquidityAssessment: {
      legacyLiquidityScore: opportunity.liquidityScore,
      legacyMinimumLiquidityScore: 70,
      legacyPassed: qualified,
      capitalAware: {
        enabled: true,
        validationCapital: 100,
        attempted: true,
        simulationSuccess: qualified,
        fullyExecutable: qualified,
        fillPercent: qualified ? 100 : 20,
        executableCapital: qualified ? 100 : 20,
        netProfit: qualified ? 0.8 : null,
        netProfitPercent: qualified ? 0.8 : null,
        totalSlippagePercent: qualified ? 0.02 : null,
        confidenceScore: qualified ? 100 : null,
        recommendation: qualified ? "EXECUTE" : null,
        minimumRequiredNetProfitPercent: 0.2,
        requireExecuteRecommendation: true,
        passed: qualified,
        failureReason: qualified ? null : "Insufficient depth.",
      },
      passed: qualified,
      source: qualified ? "CAPITAL_AWARE_SIMULATION" : "NONE",
    },
    checks: {
      active: passedCheck,
      consecutiveObservations: passedCheck,
      persistence: passedCheck,
      netProfit: passedCheck,
      liquidity: liquidityCheck,
      freshness: passedCheck,
      profitStability: passedCheck,
    },
    reasons: qualified ? ["Qualified."] : ["Liquidity failed."],
    candidate: {
      strategyAttribution: {attributionStatus: "ATTRIBUTED", strategyId: "cross-exchange-arbitrage", signalId: "conversion-signal", intentId: null},
      key: "BTCUSDT|coindcx|binance",
      market: "BTCUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      status: "ACTIVE",
      latestOpportunityId: opportunity.id,
      firstSeenAt: NOW - 10_000,
      lastSeenAt: NOW,
      disappearedAt: null,
      lifetimeMs: 10_000,
      totalObservations: 5,
      consecutiveObservations: 5,
      missedSnapshots: 0,
      reappearances: 0,
      latest: {
        buyPrice: opportunity.buyPrice,
        sellPrice: opportunity.sellPrice,
        executableQuantity: opportunity.executableQty,
        netProfit: opportunity.netProfit,
        netProfitPercent: opportunity.netProfitPercent,
        estimatedFees: opportunity.estimatedFees,
        rawSpread: opportunity.rawSpread,
        rawSpreadPercent: opportunity.rawSpreadPercent,
        liquidityScore: opportunity.liquidityScore,
        freshnessScore: opportunity.freshnessScore,
        opportunityTimestamp: NOW,
        buyQuoteTimestamp: NOW,
        sellQuoteTimestamp: NOW,
        quotesAreFresh: true,
        usedLastPriceFallback: false,
      },
      best: {netProfit: opportunity.netProfit, netProfitPercent: opportunity.netProfitPercent, observedAt: NOW, opportunityId: opportunity.id},
    },
  };
}

function createQualificationDiagnostics(qualified: boolean, includeRecord = true): CandidateQualificationDiagnostics {
  const qualifications = includeRecord ? [createQualification(qualified)] : [];
  return {
    generatedAt: NOW,
    executionAllowed: false,
    config: {
      minimumConsecutiveObservations: 3,
      minimumPersistenceMs: 5_000,
      fastLaneMinimumPostStressNetProfitPercent: 0.5,
      fastLaneMinimumConsecutiveDistinctBookObservations: 2,
      fastLaneMinimumPersistenceMs: 0,
      minimumNetProfitPercent: 0.2,
      minimumLiquidityScore: 70,
      minimumFreshnessScore: 80,
      maximumProfitDrawdownPercent: 35,
      capitalAwareLiquidityEnabled: true,
      capitalAwareLiquidityValidationCapital: 100,
      capitalAwareLiquidityMinimumNetProfitPercent: 0.2,
      capitalAwareLiquidityRequireExecuteRecommendation: true,
    },
    totalCandidates: qualifications.length,
    observing: 0,
    qualified: qualified && includeRecord ? 1 : 0,
    rejected: !qualified && includeRecord ? 1 : 0,
    expired: 0,
    legacyLiquidityPasses: qualified && includeRecord ? 1 : 0,
    capitalAwareLiquidityPasses: qualified && includeRecord ? 1 : 0,
    liquidityRejected: !qualified && includeRecord ? 1 : 0,
    qualifications,
  };
}

function createQueue(qualification?: CandidateQualificationRecord): ExecutionCandidateQueueDiagnostics {
  return {
    generatedAt: NOW,
    executionAllowed: false,
    config: {ttlMs: 10_000, maximumQueueSize: 100},
    totalItemsCreated: qualification ? 1 : 0,
    activeItems: qualification ? 1 : 0,
    ready: qualification ? 1 : 0,
    expired: 0,
    cancelled: 0,
    removed: 0,
    consumed: 0,
    duplicateEnqueueAttemptsPrevented: 0,
    totalRenewals: 0,
    highestPriority: qualification ? 100 : null,
    averageReadyAgeMs: qualification ? 1_000 : 0,
    oldestReadyAgeMs: qualification ? 1_000 : 0,
    items: qualification ? [{
      strategyAttribution: qualification.candidate.strategyAttribution,
      id: "queue-item",
      candidateKey: qualification.key,
      market: qualification.market,
      buyExchange: qualification.buyExchange,
      sellExchange: qualification.sellExchange,
      status: "READY",
      priorityScore: 100,
      qualificationScore: qualification.score,
      netProfitPercent: qualification.candidate.latest.netProfitPercent,
      liquidityScore: qualification.candidate.latest.liquidityScore,
      freshnessScore: qualification.candidate.latest.freshnessScore,
      persistenceMs: 10_000,
      consecutiveObservations: 5,
      enqueuedAt: NOW - 1_000,
      updatedAt: NOW - 1_000,
      expiresAt: NOW + 9_000,
      consumedAt: null,
      cancelledAt: null,
      removedAt: null,
      expiredAt: null,
      renewals: 0,
      reason: "Ready.",
      qualification,
    }] : [],
  };
}

function createController(): AutomatedPaperExecutionControllerDiagnostics {
  return {
    generatedAt: NOW,
    mode: "PAPER",
    automaticEvaluationEnabled: true,
    paperExecutionArmed: true,
    paperExecutionAllowed: true,
    liveExecutionAllowed: false,
    armingAuthority: "PERSISTED_DASHBOARD_CONTROL",
    confirmationVariable: null,
    config: {maximumCapitalPerTrade: 1_000, minimumNetProfitPercent: 0.2, maximumSnapshotAgeMs: 5_000, routeCooldownMs: 1_000, maximumHistory: 100},
    runningCycle: false,
    totalCycles: 0,
    blockedReadiness: 0,
    blockedNotArmed: 0,
    accountBlocked: 0,
    noCandidate: 0,
    executionAttempts: 0,
    executed: 0,
    executionRejected: 0,
    attemptedCandidateGenerations: 0,
    lastCycleAt: null,
    lastExecutionAt: null,
    lastCycle: null,
    recentCycles: [],
  };
}

function createControllerCycle(status: "EXECUTED" | "EXECUTION_REJECTED") {
  const qualification = createQualification(true);
  return {
    cycleId: 1,
    status,
    startedAt: NOW - 100,
    completedAt: NOW - 50,
    durationMs: 50,
    readinessScore: 100,
    readinessLevel: "READY_FOR_PAPER",
    paperExecutionArmed: true,
    requestedCapital: 100,
    candidate: {
      strategyAttribution: qualification.candidate.strategyAttribution,
      candidateKey: qualification.key,
      candidateGeneration: "generation-1",
      opportunityId: "conversion-opportunity",
      market: "BTCUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      qualificationScore: 100,
      netProfitPercent: 0.8,
      liquidityScore: 100,
      freshnessScore: 100,
      consecutiveObservations: 5,
      persistenceMs: 10_000,
    },
    result: null,
    reasons: status === "EXECUTED" ? ["PAPER execution completed."] : ["PAPER gate rejected the candidate."],
  };
}

function createOrchestrator(): UnifiedAutomatedExecutionDiagnostics {
  return {
    generatedAt: NOW,
    strategyId: "cross-exchange-arbitrage",
    mode: "PAPER",
    runningCycle: false,
    totalCycles: 0,
    shadowCycles: 0,
    paperCycles: 0,
    disabledCycles: 0,
    liveBlockedCycles: 0,
    ownershipRejections: 0,
    duplicateRejections: 0,
    completedGenerationClaims: 0,
    activeRouteLocks: [],
    lastCycle: null,
    liveExecutionAllowed: false,
    liveOrderSubmissionAllowed: false,
  };
}

function createOrchestratorCycle() {
  return {
    cycleId: 1,
    startedAt: NOW - 100,
    completedAt: NOW - 50,
    durationMs: 50,
    mode: "PAPER" as const,
    status: "DISPATCHED" as const,
    strategyId: "cross-exchange-arbitrage" as const,
    readyCandidates: 1,
    ownedCandidates: 1,
    routeLocksAcquired: 1,
    ownershipRejections: [],
    duplicateRejections: [],
    shadow: null,
    paper: null,
    liveExecutionAllowed: false as const,
    liveOrderSubmissionAllowed: false as const,
    exchangeOrdersSubmitted: 0 as const,
    reasons: ["Central PAPER owner dispatched candidate."],
  };
}

function createProfitValidation(trades: number): PostGuardProfitValidationReport {
  const metrics = {
    trades,
    wins: trades,
    losses: 0,
    breakEven: 0,
    winRatePercent: trades > 0 ? 100 : null,
    netPnl: trades,
    expectancyPerTrade: trades > 0 ? 1 : null,
    profitFactor: null,
    profitFactorState: trades > 0 ? "NO_LOSSES" as const : "NO_DATA" as const,
    maximumDrawdown: 0,
    totalCapital: trades * 100,
    totalFees: trades * 0.2,
    feeDragPercent: trades > 0 ? 0.2 : null,
    averageNetReturnPercent: trades > 0 ? 1 : null,
    averageAdverseSlippagePercent: trades > 0 ? 0.02 : null,
  };
  return {
    version: "83.0",
    generatedAt: NOW,
    strategyId: "cross-exchange-arbitrage",
    cohort: "CROSS_VENUE_PRICE_CREDIBILITY_V1+STRATEGY_ONE_PAPER_STRESS_V1",
    cohortStartedAt: trades > 0 ? NOW - 50 : null,
    latestTradeAt: trades > 0 ? NOW - 50 : null,
    validationStatus: trades > 0 ? "COLLECTING" : "NO_DATA",
    expectancyDecision: trades > 0 ? "INSUFFICIENT_SAMPLE" : "NO_DATA",
    minimumValidationTrades: 50,
    targetValidationTrades: 100,
    remainingMinimumTrades: Math.max(0, 50 - trades),
    remainingTargetTrades: Math.max(0, 100 - trades),
    readyForVpsPaperReview: false,
    overall: metrics,
    routes: trades > 0 ? [{
      routeKey: "BTCUSDT|coindcx>binance",
      market: "BTCUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      state: "COLLECTING",
      paperAdmissionAllowed: true,
      quarantineUntil: null,
      latestClosedAt: NOW - 50,
      metrics,
    }] : [],
    markets: trades > 0 ? [{market: "BTCUSDT", metrics}] : [],
    quarantinedRoutes: 0,
    safety: {
      taggedSettlementsOnly: true,
      historicalTradesExcluded: true,
      minimumRouteSample: 10,
      routeQuarantineMs: 30 * 60 * 1_000,
      paperAdmissionMayBeBlocked: true,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  };
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
