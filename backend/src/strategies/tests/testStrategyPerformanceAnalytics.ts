import assert
  from "node:assert/strict";

import type {
  ShadowTradeOutcomeRecord,
} from "../../automation/models/ShadowTradeOutcome";

import {
  StrategyAttributionAnalyticsService,
} from "../../analytics/services/StrategyAttributionAnalyticsService";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import type {
  StrategyAttribution,
} from "../models/StrategyAttribution";

const STRATEGY_ID =
  "cross-exchange-arbitrage";

function attributed(
  signalId: string,
): StrategyAttribution {
  return {
    attributionStatus:
      "ATTRIBUTED",
    strategyId:
      STRATEGY_ID,
    signalId,
    intentId:
      null,
  };
}

const legacy:
  StrategyAttribution = {
  attributionStatus:
    "UNATTRIBUTED_LEGACY",
  strategyId:
    null,
  signalId:
    null,
  intentId:
    null,
};

function shadow(
  id: string,
  status:
    ShadowTradeOutcomeRecord["status"],
  strategyAttribution:
    StrategyAttribution,
  observedProfit:
    number | null,
): ShadowTradeOutcomeRecord {
  return {
    strategyAttribution,
    id,
    shadowDispatchId:
      `dispatch-${id}`,
    candidateGeneration:
      `generation-${id}`,
    candidateKey:
      "BTC-USDT|binance|coindcx",
    market:
      "BTC-USDT",
    buyExchange:
      "binance",
    sellExchange:
      "coindcx",
    status,
    dispatchedAt:
      1_000,
    trackingStartedAt:
      1_000,
    deadlineAt:
      2_000,
    completedAt:
      status === "TRACKING"
        ? null
        : 1_500,
    executableQuantity:
      1,
    predicted: {
      buyPrice:
        100,
      sellPrice:
        102,
      netProfitPerUnit:
        1,
      netProfitPercent:
        1,
      expectedTotalNetProfit:
        1,
    },
    samples:
      [],
    totalSamples:
      1,
    freshSamples:
      1,
    executableSamples:
      1,
    profitableSamples:
      observedProfit !==
        null &&
      observedProfit >
        0
        ? 1
        : 0,
    bestObservedNetProfit:
      observedProfit,
    worstObservedNetProfit:
      observedProfit,
    averageObservedNetProfit:
      observedProfit,
    finalReason:
      null,
  };
}

function paper(
  id: string,
  strategyAttribution:
    StrategyAttribution,
  actualProfit:
    number,
): PaperTrade {
  return {
    strategyAttribution,
    id,
    market:
      "BTC-USDT",
    buyExchange:
      "binance",
    sellExchange:
      "coindcx",
    capital:
      100,
    quantity:
      1,
    buyPrice:
      100,
    sellPrice:
      102,
    estimatedFees:
      1,
    expectedProfit:
      actualProfit,
    expectedProfitPercent:
      actualProfit,
    status:
      "closed",
    openedAt:
      1_000,
    closedAt:
      1_500,
    currentPrice:
      102,
    currentProfit:
      actualProfit,
    currentProfitPercent:
      actualProfit,
    highestProfit:
      Math.max(
        0,
        actualProfit,
      ),
    lowestProfit:
      Math.min(
        0,
        actualProfit,
      ),
    lastUpdatedAt:
      1_500,
    actualSellPrice:
      102,
    actualProfit,
    actualProfitPercent:
      actualProfit,
    failureReason:
      null,
  };
}

function main(): void {
  const archived = [
    shadow(
      "strategy-success",
      "FAILED",
      attributed(
        "signal-success",
      ),
      -1,
    ),
    shadow(
      "legacy-success",
      "SUCCESS",
      legacy,
      999,
    ),
  ];

  const runtime = [
    shadow(
      "strategy-success",
      "SUCCESS",
      attributed(
        "signal-success",
      ),
      0.8,
    ),
    shadow(
      "strategy-failed",
      "FAILED",
      attributed(
        "signal-failed",
      ),
      -0.2,
    ),
  ];

  const trades = [
    paper(
      "strategy-win",
      attributed(
        "signal-paper-win",
      ),
      2,
    ),
    paper(
      "strategy-loss",
      attributed(
        "signal-paper-loss",
      ),
      -0.5,
    ),
    paper(
      "legacy-win",
      legacy,
      10_000,
    ),
  ];

  const service =
    new StrategyAttributionAnalyticsService({
      archivedShadowOutcomes:
        () =>
          archived,
      runtimeShadowOutcomes:
        () =>
          runtime,
      paperTrades:
        () =>
          trades,
    });

  const performance =
    service.getPerformance(
      STRATEGY_ID,
      5_000,
    );

  assert.equal(
    performance.evidenceStatus,
    "AVAILABLE",
  );
  assert.equal(
    performance.shadow
      .totalRecords,
    2,
    "Runtime evidence must replace the same archived outcome ID without double counting.",
  );
  assert.equal(
    performance.shadow
      .successfulOutcomes,
    1,
  );
  assert.equal(
    performance.shadow
      .failedOutcomes,
    1,
  );
  assert.equal(
    performance.shadow
      .successRatePercent,
    50,
  );
  assert.equal(
    performance.paper
      .totalTrades,
    2,
    "Legacy PAPER history must not be attributed to Strategy #1.",
  );
  assert.equal(
    performance.paper
      .netProfit,
    1.5,
  );
  assert.equal(
    performance.paper
      .winRatePercent,
    50,
  );

  const noData =
    service.getPerformance(
      "unregistered-strategy",
      5_000,
    );

  assert.equal(
    noData.evidenceStatus,
    "NO_DATA",
  );
  assert.equal(
    noData.shadow
      .totalRecords,
    null,
  );
  assert.equal(
    noData.shadow
      .successRatePercent,
    null,
    "Missing Shadow evidence must not be represented as measured 0% performance.",
  );
  assert.equal(
    noData.paper
      .netProfit,
    null,
    "Missing PAPER evidence must not be represented as zero profit.",
  );

  console.log(
    "Strategy performance analytics deterministic test passed.",
  );
  console.log(
    "Only explicitly attributed evidence was measured; legacy/global evidence remained excluded and missing performance remained NO_DATA/null.",
  );
}

main();
