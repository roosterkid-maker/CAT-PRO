import assert from "node:assert/strict";

import type {
  CandidateQualificationRecord,
} from "../../automation/models/CandidateQualification";

import {
  rankCandidatesForExecution,
  resolveModeledCandidateProfitInr,
} from "../../automation/services/ExecutionCandidateRanking";

import type {
  StrategyOneTradeFlowReport,
} from "../../strategies/services/StrategyOneTradeFlowReportService";

import {
  InventoryRebalancingScoreService,
} from "../services/InventoryRebalancingScoreService";

function candidate(
  key: string,
  buyExchange: string,
  sellExchange: string,
  netProfitPercent: number,
  qualified = true,
): CandidateQualificationRecord {
  return {
    key,
    market: "BTCUSDT",
    buyExchange,
    sellExchange,
    status: qualified ? "QUALIFIED" : "REJECTED",
    qualified,
    score: 95,
    evaluatedAt: 1_750_000_000_000,
    profitDrawdownPercent: 0,
    liquidityAssessment: {
      capitalAware: {
        simulationSuccess: true,
        fullyExecutable: true,
        fillPercent: 100,
        netProfitPercent,
        validationCapital: 100,
      },
    },
    candidate: {
      latest: {
        executableQuantity: 4,
        netProfitPercent,
        requestedCapitalInr: 100,
        quoteAsset: "USDT",
        freshnessScore: 100,
      },
      consecutiveObservations: 10,
      lastSeenAt: 1_750_000_000_000,
    },
  } as unknown as CandidateQualificationRecord;
}

function report(): StrategyOneTradeFlowReport {
  const window = {
    summary: {
      settlements: 20,
    },
    inventoryFlows: [
      {
        exchange: "binance",
        asset: "BTC",
        netQuantity: 10,
      },
      {
        exchange: "bybit",
        asset: "BTC",
        netQuantity: -10,
      },
    ],
  };

  return {
    windows: {
      TODAY: window,
      "14D": window,
    },
  } as unknown as StrategyOneTradeFlowReport;
}

function main(): void {
  const service = new InventoryRebalancingScoreService();
  const historicalDirection = candidate(
    "forward",
    "binance",
    "bybit",
    0.42,
  );
  const reverseDirection = candidate(
    "reverse",
    "bybit",
    "binance",
    0.39,
  );
  const reverseScore = service.evaluate(reverseDirection, report());
  const forwardScore = service.evaluate(historicalDirection, report());

  assert.equal(reverseScore.state, "NATURAL_REBALANCE");
  assert.equal(reverseScore.rebalanceBonusBps, 2);
  assert.equal(reverseScore.imbalanceBefore, 20);
  assert.equal(reverseScore.imbalanceAfter, 12);
  assert.equal(reverseScore.safety.rankOnly, true);
  assert.equal(reverseScore.safety.actualProfitAdjusted, false);
  assert.equal(forwardScore.state, "NEUTRAL");
  assert.equal(forwardScore.rebalanceBonusBps, 0);

  const bonusResolver = service.createBonusResolver(report());
  const ranked = rankCandidatesForExecution(
    [historicalDirection, reverseDirection],
    undefined,
    bonusResolver,
  );
  assert.equal(ranked[0].key, "forward");

  const strongerReverse = {
    ...reverseDirection,
    candidate: {
      ...reverseDirection.candidate,
      latest: {
        ...reverseDirection.candidate.latest,
        executableQuantity: 10,
      },
    },
  };
  const reranked = rankCandidatesForExecution(
    [historicalDirection, strongerReverse],
    undefined,
    service.createBonusResolver(report()),
  );
  assert.equal(reranked[0].key, "reverse");
  assert.equal(resolveModeledCandidateProfitInr(strongerReverse), 0.39);

  const rejected = candidate(
    "rejected-reverse",
    "bybit",
    "binance",
    -0.1,
    false,
  );
  const rejectedScore = service.evaluate(rejected, report());
  assert.equal(rejectedScore.state, "INELIGIBLE");
  assert.equal(rejectedScore.rebalanceBonusBps, 0);

  console.log("Inventory rebalancing score and rank-only bonus tests passed.");
}

main();
