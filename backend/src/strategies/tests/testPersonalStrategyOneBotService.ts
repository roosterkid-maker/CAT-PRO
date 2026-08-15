import assert from "node:assert/strict";
import type {ArbitrageOpportunity} from "../../arbitrage/models/ArbitrageOpportunity";
import type {AutomatedPaperExecutionControllerDiagnostics} from "../../automation/models/AutomatedPaperExecutionController";
import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {TradingAccountCapitalReservationAttempt} from "../../trading/account/TradingAccountLedgerService";
import type {DailyExecutionReservationSessionEvidence} from "../../execution/live/coordinator/LiveExecutionSessionEvidenceService";
import type {PaperTrade} from "../../trading/models/PaperTrade";
import type {
  StrategyOneFundedRouteReport,
  StrategyOneFundingBoundary,
} from "../../trading/execution/StrategyOneFundedRouteService";
import {PostGuardProfitValidationLedgerService} from "../../trading/services/PostGuardProfitValidationLedgerService";
import type {StrategyOnePaperRuntimeAcceptanceReport} from "../../workflows/cross-exchange-arbitrage/models/StrategyOnePaperRuntimeAcceptance";
import type {UnifiedAutomatedExecutionDiagnostics} from "../../workflows/cross-exchange-arbitrage/models/UnifiedAutomatedExecution";
import {PersonalStrategyOneBotService} from "../services/PersonalStrategyOneBotService";

const NOW = 1_900_000_000_000;

function main(): void {
  let opportunities: ArbitrageOpportunity[] = [];
  let account = createAccount(100);
  let acceptance = createAcceptance("PASSED");
  let trades: PaperTrade[] = [];
  let fundingBlocked = false;
  const accountReservationAttempts: TradingAccountCapitalReservationAttempt[] = [
    {attemptId: "linked-completed", attemptNumber: 97, reservedAt: NOW - 2_000, amount: 100,
      accountMode: "PAPER", releasedAt: NOW - 1_000, capitalReleaseStatus: "RELEASE_CONFIRMED"},
    {attemptId: "linked-failed", attemptNumber: 98, reservedAt: NOW - 600, amount: 200,
      accountMode: "PAPER", releasedAt: NOW - 500, capitalReleaseStatus: "RELEASE_CONFIRMED"},
    {attemptId: "ledger-only", attemptNumber: 99, reservedAt: NOW - 300, amount: 300,
      accountMode: "PAPER", releasedAt: NOW - 250, capitalReleaseStatus: "RELEASE_CONFIRMED"},
  ];
  const reservationSessions: DailyExecutionReservationSessionEvidence[] = [
    {sessionId: "completed-session", planId: "completed-plan", market: "BTCUSDT",
      buyExchange: "coindcx", sellExchange: "binance", capital: 100, status: "COMPLETED",
      dryRun: false, createdAt: NOW - 2_000, completedAt: NOW - 1_000, failureReason: null},
    {sessionId: "failed-session", planId: "failed-plan", market: "ETHUSDT",
      buyExchange: "coindcx", sellExchange: "bybit", capital: 200, status: "FAILED",
      dryRun: false, createdAt: NOW - 600, completedAt: NOW - 500, failureReason: "Fixture rejection."},
  ];
  const profitValidation = new PostGuardProfitValidationLedgerService({getTrades: () => trades});
  const paperController = createPaperController();
  const orchestrator = createOrchestrator();
  const service = new PersonalStrategyOneBotService({
    getOpportunities: () => opportunities,
    getAccount: () => account,
    getAcceptance: () => acceptance,
    getPaperController: () => paperController,
    getOrchestrator: () => orchestrator,
    getControl: () => ({version: "82.0", enabled: true, updatedAt: NOW, source: "DASHBOARD",
      mode: "PAPER_ONLY", liveExecutionAllowed: false, orderSubmissionAllowed: false}),
    getTrades: () => trades,
    getProfitValidation: (now) => profitValidation.getReport(now),
    getDailyReservationEvidence: (now) => ({generatedAt: now, dryRunReservations: 2,
      paperReservations: 0, failedDryRunReservations: 1, failedPaperReservations: 0}),
    getDailyAccountReservationAttempts: () => accountReservationAttempts,
    getDailyReservationSessions: () => reservationSessions,
    evaluateFunding: (opportunity, requestedCapitalInr, now, fundingBoundary) =>
      createFunding(
        opportunity,
        requestedCapitalInr,
        now,
        fundingBoundary,
        fundingBlocked && fundingBoundary === "AUTHENTICATED_LIVE_READINESS",
      ),
  });

  const limited = service.getReport(NOW);
  assert.equal(limited.version, "90.0");
  assert.equal(limited.profile, "PERSONAL_STRATEGY_ONE");
  assert.equal(limited.state, "DAILY_LIMIT_REACHED");
  assert.equal(limited.paper.remainingDailyTrades, 0);
  assert.ok(limited.blockers.includes("AUTHORITATIVE_DAILY_TRADE_LIMIT_REACHED"));

  account = createAccount(99);
  const waiting = service.getReport(NOW + 1);
  assert.equal(waiting.state, "WAITING_FOR_OPPORTUNITY");
  assert.equal(waiting.paper.remainingDailyTrades, 1);

  opportunities = [createOpportunity("REVIEW")];
  assert.equal(service.getReport(NOW + 2).state, "OBSERVING_OPPORTUNITY");

  opportunities = [createOpportunity("EXECUTE")];
  const ready = service.getReport(NOW + 3);
  assert.equal(ready.state, "READY_TO_EXECUTE_PAPER");
  assert.equal(ready.opportunity.executable, 1);
  assert.equal(ready.opportunity.fundedExecutable, 1);
  assert.equal(ready.funding.fundedRoutes, 1);
  assert.equal(ready.paperCapacity.executableRoutes, 1);
  assert.equal(ready.paperCapacity.authenticatedBalancesRequired, false);
  assert.equal(ready.paperCapacity.liveBalancesMutated, false);
  assert.equal(ready.opportunity.accepted[0]?.funding?.state, "FUNDED");
  assert.equal(ready.opportunity.accepted[0]?.funding?.fundingBoundary, "ISOLATED_PAPER");
  assert.equal(ready.opportunity.top[0]?.buyExchange, "coindcx");
  assert.equal(ready.paper.automationArmed, true);
  assert.equal(ready.safety.paperExecutionTriggeredByRead, false);
  assert.equal(ready.safety.liveExecutionAllowed, false);
  assert.equal(ready.control.effectivePaperExecutionEnabled, true);
  assert.equal(ready.performance.storedExecutions, 0);
  assert.equal(ready.conversion.profile, "PERSONAL_SELF_USE");
  assert.equal(ready.conversion.safety.liveExecutionAllowed, false);
  assert.equal(ready.hotPath.codeSideOnly, true);
  assert.equal(ready.hotPath.state, "COLLECTING");
  assert.equal(
    ready.hotPath.targets.marketUpdateToDecisionP95Ms,
    25,
  );
  assert.equal(
    ready.hotPath.targets.marketUpdateToDecisionP99Ms,
    40,
  );
  assert.equal(
    ready.hotPath.targets.decisionToExecutionCompleteP99Ms,
    40,
  );
  assert.equal(
    ready.hotPath.gates.candidateSnapshotDrops,
    "COLLECTING",
  );
  assert.equal(ready.hotPath.automation.droppedCandidateSnapshots, 0);
  assert.equal(ready.inventoryPlan.recommendationStatus, "READY");
  assert.equal(ready.inventoryPlan.recommendedRoute?.market, "BTCUSDT");
  assert.equal(ready.inventoryPlan.recommendedRoute?.modeledNetProfitInr, 1.8);
  assert.equal(ready.inventoryPlan.recommendedRoute?.requirements[0].deficitAmount, 0);
  assert.equal(ready.inventoryPlan.safety.advisoryOnly, true);
  assert.equal(ready.inventoryPlan.safety.transferInitiated, false);
  assert.equal(ready.inventoryPlan.safety.withdrawalInitiated, false);

  fundingBlocked = true;
  const inventoryRequired = service.getReport(NOW + 4);
  assert.equal(inventoryRequired.state, "READY_TO_EXECUTE_PAPER");
  assert.equal(inventoryRequired.opportunity.fundedExecutable, 1);
  assert.equal(inventoryRequired.funding.blockedRoutes, 1);
  assert.equal(inventoryRequired.paperCapacity.executableRoutes, 1);
  assert.equal(inventoryRequired.inventoryPlan.recommendationStatus, "FUNDING_REQUIRED");
  assert.equal(inventoryRequired.inventoryPlan.recommendedRoute?.fullySpecified, true);
  assert.equal(inventoryRequired.inventoryPlan.recommendedRoute?.requirements[0].evidence, "SYNCHRONIZED_ASSET_OMITTED");
  assert.equal(inventoryRequired.inventoryPlan.recommendedRoute?.requirements[0].deficitAmount, 100);
  assert.equal(inventoryRequired.inventoryPlan.recommendedRoute?.requirements[1].deficitAmount, 1);
  assert.equal(inventoryRequired.inventoryPlan.safety.balanceMutated, false);
  assert.equal(inventoryRequired.inventoryPlan.safety.orderSubmissionAllowed, false);
  fundingBlocked = false;

  trades = [
    createTrade(
      "credible",
      100,
      102,
      1.8,
      true,
    ),
    createTrade(
      "distorted",
      100,
      140,
      39.8,
    ),
  ];

  const crediblePerformance =
    service.getReport(
      NOW +
        5,
    );

  assert.equal(
    crediblePerformance
      .performance
      .storedExecutions,
    2,
  );
  assert.equal(
    crediblePerformance
      .performance
      .successfulExecutions,
    1,
  );
  assert.equal(
    crediblePerformance
      .performance
      .excludedUncredibleExecutions,
    1,
  );
  assert.equal(
    crediblePerformance
      .performance
      .realizedPnl,
    1.8,
  );
  assert.equal(
    crediblePerformance
      .performance
      .successfulCurrentClockHour,
    1,
  );
  assert.equal(
    crediblePerformance
      .performance
      .hourlyClockBasis,
    "ASIA_KOLKATA",
  );
  assert.equal(
    crediblePerformance
      .performance
      .hourlyTimeZone,
    "Asia/Kolkata",
  );
  assert.equal(
    crediblePerformance
      .performance
      .hourlySuccessfulTrades
      .length,
    24,
  );
  assert.equal(
    crediblePerformance
      .performance
      .hourlySuccessfulTrades
      .filter((bucket) => bucket.current)
      .length,
    1,
  );
  assert.equal(
    crediblePerformance
      .performance
      .hourlySuccessfulTrades
      .reduce((total, bucket) => total + bucket.successfulTrades, 0),
    crediblePerformance.performance.successfulToday,
  );
  assert.equal(
    crediblePerformance
      .performance
      .hourlySuccessfulTrades
      .reduce((total, bucket) => total + bucket.realizedPnl, 0),
    crediblePerformance.performance.realizedPnlToday,
  );
  assert.equal(
    crediblePerformance
      .performance
      .hourlySuccessfulTrades
      .find((bucket) => bucket.current)
      ?.realizedPnl,
    1.8,
  );
  assert.equal(
    crediblePerformance
      .performance
      .currentClockHourLabel,
    "23:00 - 00:00",
  );
  assert.equal(
    crediblePerformance
      .recentExecutions[0]
      ?.id,
    "credible",
  );
  assert.equal(crediblePerformance.excludedExecutions.length, 1);
  assert.equal(crediblePerformance.excludedExecutions[0]?.id, "distorted");
  assert.equal(crediblePerformance.excludedExecutions[0]?.failureCode, "PRICE_RATIO_EXCEEDED");
  assert.equal(crediblePerformance.excludedExecutions[0]?.priceRatio, 1.4);
  assert.equal(crediblePerformance.excludedExecutions[0]?.maximumCrediblePriceRatio, 1.05);
  assert.equal(crediblePerformance.excludedExecutions[0]?.excludedFromPnl, true);
  assert.match(crediblePerformance.excludedExecutions[0]?.reason ?? "", /1\.4000x.*1\.0500x/);
  assert.equal(crediblePerformance.paper.dailyActivity.reservationAttempts, 99);
  assert.equal(crediblePerformance.paper.dailyActivity.settledPaperExecutions, 2);
  assert.equal(crediblePerformance.paper.dailyActivity.dryRunReservations, 2);
  assert.equal(crediblePerformance.paper.dailyActivity.otherUnlinkedOrNonSettledReservations, 95);
  assert.equal(crediblePerformance.paper.dailyActivity.otherAttemptDetails.length, 2);
  assert.equal(crediblePerformance.paper.dailyActivity.otherAttemptDetails[0]?.attemptId, "ledger-only");
  assert.equal(crediblePerformance.paper.dailyActivity.otherAttemptDetails[0]?.sessionLinkStatus, "NO_DURABLE_SESSION_LINK");
  assert.equal(crediblePerformance.paper.dailyActivity.otherAttemptDetails[0]?.capitalReleaseStatus, "RELEASE_CONFIRMED");
  assert.equal(crediblePerformance.paper.dailyActivity.otherAttemptDetails[1]?.sessionId, "failed-session");
  assert.equal(crediblePerformance.paper.dailyActivity.otherAttemptDetails[1]?.market, "ETHUSDT");
  assert.equal(crediblePerformance.paper.dailyActivity.otherAttemptDetailCoverage.complete, false);
  assert.equal(crediblePerformance.paper.dailyActivity.equationBalanced, true);
  assert.equal(crediblePerformance.profitValidation.overall.trades, 1);
  assert.equal(crediblePerformance.profitValidation.overall.netPnl, 1.8);
  assert.equal(crediblePerformance.profitValidation.safety.liveExecutionAllowed, false);

  acceptance = createAcceptance("COLLECTING");
  assert.equal(service.getReport(NOW + 6).state, "COLLECTING_PAPER_SOAK");

  account = {...createAccount(0), emergencyStop: true};
  assert.equal(service.getReport(NOW + 7).state, "BLOCKED");

  console.log("PERSONAL STRATEGY #1 BOT SERVICE TEST PASSED.");
  console.log("One truthful PAPER control plane classified opportunity, soak, risk budget and execution ownership without triggering a trade or LIVE action.");
}

function createFunding(
  opportunity: ArbitrageOpportunity,
  requestedCapitalInr: number,
  now: number,
  fundingBoundary: StrategyOneFundingBoundary,
  blocked = false,
): StrategyOneFundedRouteReport {
  const quantity = Math.min(opportunity.executableQty, requestedCapitalInr / opportunity.buyPrice);
  return {
    version: "86.0",
    evaluatedAt: now,
    opportunityId: opportunity.id,
    routeKey: `${opportunity.pair.market}|${opportunity.pair.buy.exchange}>${opportunity.pair.sell.exchange}`,
    market: opportunity.pair.market,
    buyExchange: opportunity.pair.buy.exchange,
    sellExchange: opportunity.pair.sell.exchange,
    baseAsset: "BTC",
    quoteAsset: "USDT",
    requestedCapitalInr,
    convertedQuoteCapital: requestedCapitalInr,
    capitalQuantity: requestedCapitalInr / opportunity.buyPrice,
    depthQuantity: opportunity.executableQty,
    preFundingQuantity: quantity,
    balanceCappedQuantity: blocked ? null : quantity,
    executableQuantity: blocked ? null : quantity,
    estimatedExecutableCapitalInr: blocked ? null : requestedCapitalInr,
    reductionPercent: blocked ? null : 0,
    state: blocked ? "BLOCKED" : "FUNDED",
    fundingBoundary,
    buyFunding: {
      exchange: opportunity.pair.buy.exchange,
      asset: "USDT",
      synchronizationStatus: fundingBoundary === "ISOLATED_PAPER"
        ? "NOT_REQUIRED_PAPER"
        : "SYNCHRONIZED",
      availableBalance: fundingBoundary === "ISOLATED_PAPER" || blocked ? null : 10_000,
      requiredBalance: quantity * opportunity.buyPrice,
      snapshotAgeMs: 0,
      maximumSnapshotAgeMs: fundingBoundary === "ISOLATED_PAPER" ? 0 : 15_000,
      sufficient: !blocked,
    },
    sellFunding: {
      exchange: opportunity.pair.sell.exchange,
      asset: "BTC",
      synchronizationStatus: fundingBoundary === "ISOLATED_PAPER"
        ? "NOT_REQUIRED_PAPER"
        : "SYNCHRONIZED",
      availableBalance: fundingBoundary === "ISOLATED_PAPER" || blocked ? null : 100,
      requiredBalance: quantity,
      snapshotAgeMs: 0,
      maximumSnapshotAgeMs: fundingBoundary === "ISOLATED_PAPER" ? 0 : 15_000,
      sufficient: !blocked,
    },
    quantityNormalization: null,
    blockers: blocked ? ["Authenticated route inventory is insufficient."] : [],
    authenticatedBalancesRequired: fundingBoundary === "AUTHENTICATED_LIVE_READINESS",
    isolatedPaperCapital: fundingBoundary === "ISOLATED_PAPER",
    staleBalanceAllowed: false,
    quantityNeverIncreased: true,
    liveExecutionAllowed: false,
    orderSubmissionAllowed: false,
  };
}

function createOpportunity(decision: ArbitrageOpportunity["decision"]): ArbitrageOpportunity {
  return {
    id: `personal-${decision.toLowerCase()}`,
    pair: {
      market: "BTCUSDT",
      buy: {exchange: "coindcx", market: "BTCUSDT", lastPrice: 100, bestBidPrice: 99, bestBidQty: 2,
        bestAskPrice: 100, bestAskQty: 2, spread: 1, timestamp: NOW, source: "orderBook", executable: true},
      sell: {exchange: "binance", market: "BTCUSDT", lastPrice: 102, bestBidPrice: 102, bestBidQty: 2,
        bestAskPrice: 103, bestAskQty: 2, spread: 1, timestamp: NOW, source: "orderBook", executable: true},
    },
    buyPrice: 100, sellPrice: 102, buyAvailableQty: 2, sellAvailableQty: 2, requiredQty: 1,
    availableExecutableQty: 1, executableQty: 1, liquidityScore: 100, enoughLiquidity: true,
    freshnessScore: 100, feeScore: 100, spreadScore: 100, decision, analysisSummary: [], rawSpread: 2,
    rawSpreadPercent: 2, estimatedFees: 0.2, netProfit: 1.8, netProfitPercent: 1.8,
    usedLastPriceFallback: false, quotesAreFresh: true, score: 95, timestamp: NOW,
  };
}

function createAccount(tradesToday: number): TradingAccount {
  return {id: "default", name: "CAT PRO", mode: "PAPER", enabled: true, emergencyStop: false,
    limits: {maximumCapitalPerTrade: 1_000, maximumDailyLoss: 500, maximumOpenTrades: 5, maximumDailyTrades: 100},
    initialCapital: 10_000, currentCapital: 10_100, availableCapital: 10_100, todayProfit: 100,
    todayLoss: 0, openTrades: 0, tradesToday};
}

function createTrade(
  id: string,
  buyPrice: number,
  sellPrice: number,
  actualProfit: number,
  tagged = false,
): PaperTrade {
  return {
    strategyAttribution: {
      attributionStatus: "ATTRIBUTED",
      strategyId: "cross-exchange-arbitrage",
      signalId: `signal-${id}`,
      intentId: `intent-${id}`,
    },
    priceCredibility: tagged ? {
      schemaVersion: 1,
      guard: "CROSS_VENUE_PRICE_CREDIBILITY_V1",
      outcome: "PASSED",
      evaluatedAt: NOW - 1_500,
      market: "BTCUSDT",
      buyExchange: "coindcx",
      sellExchange: "binance",
      freshVenueCount: 3,
      freshVenues: ["coindcx", "binance", "bybit"],
      candidatePriceRatio: 1.02,
      currentPriceRatio: 1.02,
      medianMidPrice: 101,
      buyDeviationFromMedianPercent: 0.99,
      sellDeviationFromMedianPercent: 0.99,
      maximumPriceRatio: 1.05,
      maximumCandidatePriceDriftPercent: 1,
      maximumConsensusDeviationPercent: 3,
      reasons: ["Fixture passed credibility."],
    } : null,
    paperExecutionStress: tagged ? {
      schemaVersion: 1,
      guard: "STRATEGY_ONE_PAPER_STRESS_V1",
      outcome: "PASSED",
      evaluatedAt: NOW - 1_250,
      sourceOpportunityAgeMs: 25,
      buyBookTimestamp: NOW - 1_300,
      sellBookTimestamp: NOW - 1_298,
      timestampSkewMs: 2,
      quantity: 1,
      buyFillPercent: 100,
      sellFillPercent: 100,
      buyVwap: buyPrice,
      sellVwap: sellPrice,
      buyLimitPrice: buyPrice * 1.001,
      sellLimitPrice: sellPrice * 0.999,
      combinedDepthSlippagePercent: 0,
      adverseMoveReservePercentPerLeg: 0.05,
      tradingFees: 0.2,
      safetyBuffer: 0.1,
      postStressNetProfit: actualProfit,
      postStressNetProfitPercent: actualProfit,
      minimumNetProfitPercent: 0.3,
      reasons: ["Fixture passed final stress."],
      paperOnly: true,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    } : null,
    executionQuality: tagged ? {
      schemaVersion: 1,
      buyRequestedPrice: buyPrice,
      buyAverageFillPrice: buyPrice,
      sellRequestedPrice: sellPrice,
      sellAverageFillPrice: sellPrice,
      buyAdverseSlippagePercent: 0,
      sellAdverseSlippagePercent: 0,
      combinedAdverseSlippagePercent: 0,
    } : null,
    id,
    market: "BTCUSDT",
    buyExchange: "coindcx",
    sellExchange: "binance",
    capital: 100,
    quantity: 1,
    buyPrice,
    sellPrice,
    estimatedFees: 0.2,
    expectedProfit: actualProfit,
    expectedProfitPercent: actualProfit,
    status: "closed",
    openedAt: NOW - 2_000,
    closedAt: NOW - 1_000,
    currentPrice: sellPrice,
    currentProfit: actualProfit,
    currentProfitPercent: actualProfit,
    highestProfit: actualProfit,
    lowestProfit: actualProfit,
    lastUpdatedAt: NOW - 1_000,
    actualSellPrice: sellPrice,
    actualProfit,
    actualProfitPercent: actualProfit,
    failureReason: null,
  };
}

function createAcceptance(soakStatus: StrategyOnePaperRuntimeAcceptanceReport["soakStatus"]): StrategyOnePaperRuntimeAcceptanceReport {
  return {generatedAt: NOW, strategyId: "cross-exchange-arbitrage", evidenceStatus: "AVAILABLE",
    totalAttempts: 30, passed: 25, rejectedSafe: 5, credibilityExcluded: 0, evidenceIncomplete: 0, recoveredPasses: 0,
    consecutivePasses: soakStatus === "PASSED" ? 25 : 10, minimumConsecutivePasses: 20,
    remainingConsecutivePasses: soakStatus === "PASSED" ? 0 : 10,
    streakEvidence: {safeRejectionsExcluded: 5, latestResetAt: null, latestResetStatus: null,
      latestResetCandidateKey: null, latestResetReasons: [], latestSafeRejectionAt: null,
      latestSafeRejectionCandidateKey: null, latestSafeRejectionReasons: []},
    soakStatus, readyForPaperSoakReview: soakStatus === "PASSED",
    persistence: {filePath: "fixture.jsonl", restored: true, restoredAt: NOW, writes: 0, writeFailures: 0,
      malformedRecordsIgnored: 0, lastError: null}, records: [], blockers: [], liveExecutionAllowed: false,
    liveOrderSubmissionAllowed: false};
}

function createPaperController(): AutomatedPaperExecutionControllerDiagnostics {
  return {generatedAt: NOW, mode: "PAPER", automaticEvaluationEnabled: true, paperExecutionArmed: true,
    paperExecutionAllowed: true, liveExecutionAllowed: false,
    confirmationVariable: "AUTOMATED_PAPER_TRADING_CONFIRMATION",
    config: {maximumCapitalPerTrade: 1_000, minimumNetProfitPercent: 0.1, maximumSnapshotAgeMs: 5_000,
      routeCooldownMs: 1_000, maximumHistory: 100}, runningCycle: false, totalCycles: 10,
    blockedReadiness: 0, blockedNotArmed: 0, accountBlocked: 0, noCandidate: 4, executionAttempts: 6,
    executed: 6, executionRejected: 0, attemptedCandidateGenerations: 6, lastCycleAt: NOW,
    lastExecutionAt: NOW, lastCycle: null, recentCycles: []};
}

function createOrchestrator(): UnifiedAutomatedExecutionDiagnostics {
  return {generatedAt: NOW, strategyId: "cross-exchange-arbitrage", mode: "PAPER", runningCycle: false,
    totalCycles: 10, shadowCycles: 0, paperCycles: 10, disabledCycles: 0, liveBlockedCycles: 0,
    ownershipRejections: 0, duplicateRejections: 0, completedGenerationClaims: 6, activeRouteLocks: [],
    lastCycle: {cycleId: 10, startedAt: NOW - 10, completedAt: NOW, durationMs: 10, mode: "PAPER",
      status: "NO_OWNED_CANDIDATE", strategyId: "cross-exchange-arbitrage", readyCandidates: 0,
      ownedCandidates: 0, routeLocksAcquired: 0, ownershipRejections: [], duplicateRejections: [],
      shadow: null, paper: null, liveExecutionAllowed: false, liveOrderSubmissionAllowed: false,
      exchangeOrdersSubmitted: 0, reasons: ["Waiting for a qualified candidate."]},
    liveExecutionAllowed: false, liveOrderSubmissionAllowed: false};
}

try { main(); } catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
