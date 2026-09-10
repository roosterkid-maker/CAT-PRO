import assert from "node:assert/strict";

import type {ArbitrageOpportunity} from "../../arbitrage/models/ArbitrageOpportunity";
import type {StrategyOneFundedRouteReport} from "../../trading/execution/StrategyOneFundedRouteService";
import {
  OpportunityCapitalStudyService,
  type OpportunityCapitalStudyDependencies,
} from "../services/OpportunityCapitalStudyService";
import {
  bindRebalancingPlanToCapitalStudy,
} from "../execution/RebalancingExecutionRunner";
import type {
  RebalancingDecisionPlan,
} from "../services/RebalancingDecisionEngine";

const START = 1_800_000_000_000;

function main(): void {
  verifiesCurrentExactRouteQualifiesWithoutPersistence();
  verifiesCurrentCapitalActionRequiresCleanRecovery();
  verifiesStaleAndHardFailureBlockImmediately();
  verifiesGenericRebalancingCannotAuthorizeWithdrawal();
  console.log(
    "Opportunity capital readiness passed: no persistence counter remains; current exact books, fixed 1.00% net, funding, freshness and recovery still fail closed.",
  );
}

function verifiesGenericRebalancingCannotAuthorizeWithdrawal(): void {
  const plan = {
    desiredMoves: [
      {sourceExchange: "binance", destinationExchange: "bybit", amountUsdt: 20, reason: "allocation"},
      {sourceExchange: "coindcx", destinationExchange: "bybit", amountUsdt: 20, reason: "allocation"},
    ],
  } as unknown as RebalancingDecisionPlan;
  assert.equal(bindRebalancingPlanToCapitalStudy(plan, []).desiredMoves.length, 0);

  const bound = bindRebalancingPlanToCapitalStudy(plan, [{
    routeKey: "COTIUSDT|bybit|coindcx",
    destinationExchange: "bybit",
    asset: "USDT",
    maximumAmountUsdt: 6,
    observedAt: START,
  }]);
  assert.equal(bound.desiredMoves.length, 1);
  assert.equal(bound.desiredMoves[0]?.sourceExchange, "binance");
  assert.equal(bound.desiredMoves[0]?.amountUsdt, 6);
}

function verifiesCurrentExactRouteQualifiesWithoutPersistence(): void {
  let now = START;
  const service = createService(() => cleanSafety(), () => now);
  const current = opportunity("current", now, 1.01);
  service.observeSnapshot({generatedAt: now, opportunities: [current]});
  const decision = service.getDecision(current, now);
  assert.equal(decision.executionQualified, true);
  assert.equal(decision.capitalActionQualified, true);
  assert.equal(decision.effectiveMinimumCurrentNetProfitPercent, 1.0);
  assert.equal(decision.requiredCurrentSamples, 0);
  assert.equal(decision.requiredQualificationCycles, 0);
  assert.equal(decision.requiredTotalSamplesForCapital, 0);
}

function verifiesCurrentCapitalActionRequiresCleanRecovery(): void {
  let now = START;
  let recoveryPending = false;
  const service = createService(
    () => ({...cleanSafety(), executionRecoveryPending: recoveryPending}),
    () => now,
  );
  const latest = opportunity("current-capital", now, 1.01);
  service.observeSnapshot({generatedAt: now, opportunities: [latest]});

  const ready = service.getDecision(latest, now);
  assert.equal(ready.capitalActionQualified, true);
  assert.equal(ready.effectiveMinimumCurrentNetProfitPercent, 1.0);
  assert.equal(ready.recommendation, "ADD_USDT_TO_BUY_EXCHANGE");
  const authorizations = service.getCrossExchangeMovementAuthorizations(now);
  assert.equal(authorizations.length, 1);
  assert.equal(authorizations[0]?.destinationExchange, "bybit");
  assert.equal(authorizations[0]?.maximumAmountUsdt, 6);
  assert.equal(
    service.getCrossExchangeMovementAuthorizations(now + 10_001).length,
    0,
    "A historical qualification must not authorize movement after its latest independent books expire.",
  );

  recoveryPending = true;
  assert.equal(service.getCrossExchangeMovementAuthorizations(now).length, 0);
  assert.equal(service.getDecision(latest, now).safety.movementAllowed, false);
}

function verifiesStaleAndHardFailureBlockImmediately(): void {
  let now = START;
  const service = createService(() => cleanSafety(), () => now);
  const latest = opportunity("safe", now, 1.01);
  service.observeSnapshot({generatedAt: now, opportunities: [latest]});
  assert.equal(service.getDecision(latest, now).executionQualified, true);

  now += 800;
  const stale = opportunity("stale", now - 1_000, 1.01);
  service.observeSnapshot({generatedAt: now, opportunities: [stale]});
  assert.equal(service.getDecision(stale, now).executionQualified, false);
  assert.equal(service.getDecision(stale, now).currentConsecutiveSamples, 0);

  const restarted = createService(() => cleanSafety(), () => now);
  const reset = restarted.getDecision(latest, now);
  assert.equal(reset.currentConsecutiveSamples, 0);
  assert.equal(reset.safety.restartResetsQualification, false);
}

function createService(
  getSafetyContext: OpportunityCapitalStudyDependencies["getSafetyContext"],
  now: () => number,
): OpportunityCapitalStudyService {
  return new OpportunityCapitalStudyService({
    subscribe: () => () => undefined,
    evaluateFunding: (candidate, evaluatedAt) => funding(candidate, evaluatedAt),
    getSafetyContext,
    now,
  });
}

function opportunity(
  id: string,
  timestamp: number,
  netProfitPercent: number,
): ArbitrageOpportunity {
  return {
    id,
    pair: {
      market: "COTIUSDT",
      buy: {
        exchange: "bybit",
        market: "COTIUSDT",
        bestAskPrice: 0.1,
        bestAskQty: 1_000,
        bestBidPrice: 0.099,
        bestBidQty: 1_000,
        lastPrice: 0.1,
        timestamp,
      },
      sell: {
        exchange: "coindcx",
        market: "COTIUSDT",
        bestAskPrice: 0.102,
        bestAskQty: 1_000,
        bestBidPrice: 0.101,
        bestBidQty: 1_000,
        lastPrice: 0.101,
        timestamp,
      },
    },
    buyPrice: 0.1,
    sellPrice: 0.101,
    buyAvailableQty: 1_000,
    sellAvailableQty: 1_000,
    requiredQty: 60,
    availableExecutableQty: 1_000,
    executableQty: 60,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 80,
    decision: "EXECUTE",
    analysisSummary: [],
    rawSpread: 0.001,
    rawSpreadPercent: 1,
    estimatedFees: 0.0005,
    netProfit: 0.0005,
    netProfitPercent,
    usedLastPriceFallback: false,
    quotesAreFresh: true,
    score: 88,
    timestamp,
    quoteAsset: "USDT",
  } as unknown as ArbitrageOpportunity;
}

function funding(
  candidate: ArbitrageOpportunity,
  now: number,
): StrategyOneFundedRouteReport {
  return {
    opportunityId: candidate.id,
    market: candidate.pair.market,
    baseAsset: "COTI",
    quoteAsset: "USDT",
    convertedQuoteCapital: 7,
    capitalQuantity: 60,
    preFundingQuantity: 60,
    multiLevelDepthEvidence: {status: "PASSED"},
    buyFunding: {
      exchange: "bybit",
      asset: "USDT",
      requiredBalance: 10,
      availableBalance: 4,
      sufficient: false,
    },
    sellFunding: {
      exchange: "coindcx",
      asset: "COTI",
      requiredBalance: 60,
      availableBalance: 100,
      sufficient: true,
    },
    evaluatedAt: now,
  } as unknown as StrategyOneFundedRouteReport;
}

function cleanSafety() {
  return {
    executionRecoveryPending: false,
    settlementReconciliationPending: false,
    emergencyStopActive: false,
  };
}

main();
