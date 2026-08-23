import assert from "node:assert/strict";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  StrategyOneCapitalPlacementService,
} from "../services/StrategyOneCapitalPlacementService";

const NOW =
  1_900_000_000_000;

function main(): void {
  const service =
    new StrategyOneCapitalPlacementService({
      getLiveAdapterExchanges:
        () => [
          "coindcx",
          "binance",
          "bybit",
          "coinswitch",
        ],
      getTinyLiveCapitalPerLegInr:
        () =>
          500,
    });

  const primaryRoute =
    Array.from(
      {
        length:
          25,
      },
      (
        _,
        index,
      ) =>
        createTrade({
          id:
            `primary-${index}`,
          market:
            "BTCUSDT",
          buyExchange:
            "coindcx",
          sellExchange:
            "binance",
          buyPrice:
            100,
          sellPrice:
            102,
          actualProfit:
            1,
          closedAt:
            NOW -
            index,
        }),
    );

  const unsupportedRoute =
    Array.from(
      {
        length:
          5,
      },
      (
        _,
        index,
      ) =>
        createTrade({
          id:
            `unsupported-${index}`,
          market:
            "ETHINR",
          buyExchange:
            "unocoin",
          sellExchange:
            "coindcx",
          buyPrice:
            100,
          sellPrice:
            103,
          actualProfit:
            2,
          closedAt:
            NOW -
            100 -
            index,
        }),
    );

  const distorted =
    createTrade({
      id:
        "distorted",
      market:
        "DOGEINR",
      buyExchange:
        "coindcx",
      sellExchange:
        "coinswitch",
      buyPrice:
        100,
      sellPrice:
        140,
      actualProfit:
        40,
      closedAt:
        NOW -
        200,
    });

  const report =
    service.getReport(
      [
        ...primaryRoute,
        ...unsupportedRoute,
        distorted,
        primaryRoute[
          0
        ]!,
      ],
      NOW,
    );

  assert.equal(
    report.version,
    "91.0",
  );
  assert.equal(
    report.mode,
    "HISTORICAL_ADVISORY_ONLY",
  );
  assert.equal(
    report.evidence.storedStrategyOneSettlements,
    32,
  );
  assert.equal(
    report.evidence.uniqueStrategyOneSettlements,
    31,
  );
  assert.equal(
    report.evidence.credibleSettlements,
    30,
  );
  assert.equal(
    report.evidence.excludedDistortedSettlements,
    1,
  );
  assert.equal(
    report.evidence.duplicateIdsIgnored,
    1,
  );

  assert.equal(
    report.routes[
      0
    ]?.routeKey,
    "BTCUSDT|coindcx>binance",
  );
  assert.equal(
    report.routes[
      0
    ]?.uniqueSettlements,
    25,
  );
  assert.equal(
    report.routes[
      0
    ]?.confidence,
    "MEDIUM",
  );
  assert.equal(
    report.routes[
      0
    ]?.liveAdapterFoundationReady,
    true,
  );
  assert.equal(
    report.routes[
      1
    ]?.liveAdapterFoundationReady,
    false,
  );

  assert.equal(
    report.buyVenues[
      0
    ]?.exchange,
    "coindcx",
  );
  assert.equal(
    report.buyVenues[
      0
    ]?.settlementSharePercent,
    83.33,
  );
  assert.equal(
    report.sellVenues[
      0
    ]?.exchange,
    "binance",
  );

  assert.equal(
    report.pilot.state,
    "CANDIDATE_FOR_PREFLIGHT",
  );
  assert.equal(
    report.pilot.requestedPerLegInr,
    500,
  );
  assert.equal(
    report.pilot.minimumTwoLegInventoryInr,
    1_000,
  );
  assert.equal(
    report.pilot.recommendedRoute?.routeKey,
    "BTCUSDT|coindcx>binance",
  );
  assert.equal(
    report.pilot.currentOrderRulesVerified,
    false,
  );
  assert.equal(
    report.pilot.currentBalancesVerified,
    false,
  );
  assert.equal(
    report.safety.automaticFundMovementAllowed,
    false,
  );
  assert.equal(
    report.safety.liveExecutionAllowed,
    false,
  );
  assert.equal(
    report.safety.orderSubmissionAllowed,
    false,
  );

  const revisionCached =
    service.getReport(
      [
        ...primaryRoute,
        ...unsupportedRoute,
        distorted,
        primaryRoute[
          0
        ]!,
      ],
      NOW +
        1,
      31,
    );
  const sameRevisionDifferentWrapper =
    service.getReport(
      [
        ...primaryRoute,
        ...unsupportedRoute,
        distorted,
        primaryRoute[
          0
        ]!,
      ],
      NOW +
        2,
      31,
    );

  assert.strictEqual(
    sameRevisionDifferentWrapper.routes,
    revisionCached.routes,
    "The same settled revision must reuse capital-ranking arrays even when a caller rebuilds its array wrapper.",
  );
  assert.equal(
    sameRevisionDifferentWrapper.generatedAt,
    NOW +
      2,
  );

  const nextRevision =
    service.getReport(
      [
        ...primaryRoute,
      ],
      NOW +
        3,
      32,
    );

  assert.notStrictEqual(
    nextRevision.routes,
    revisionCached.routes,
    "A new settled revision must invalidate the ranking immediately.",
  );

  console.log(
    "Strategy #1 capital-placement report test passed.",
  );
  console.log(
    "Unique credible settlements ranked BUY/SELL venues and adapter-ready routes without moving funds or authorizing LIVE/orders.",
  );
}

function createTrade(
  input: {
    id: string;
    market: string;
    buyExchange: string;
    sellExchange: string;
    buyPrice: number;
    sellPrice: number;
    actualProfit: number;
    closedAt: number;
  },
): PaperTrade {
  return {
    strategyAttribution: {
      attributionStatus:
        "ATTRIBUTED",
      strategyId:
        "cross-exchange-arbitrage",
      signalId:
        `signal-${input.id}`,
      intentId:
        null,
    },
    id:
      input.id,
    market:
      input.market,
    buyExchange:
      input.buyExchange,
    sellExchange:
      input.sellExchange,
    capital:
      100,
    quantity:
      1,
    buyPrice:
      input.buyPrice,
    sellPrice:
      input.sellPrice,
    estimatedFees:
      0.2,
    expectedProfit:
      input.actualProfit,
    expectedProfitPercent:
      input.actualProfit,
    status:
      "closed",
    openedAt:
      input.closedAt -
      1_000,
    closedAt:
      input.closedAt,
    currentPrice:
      input.sellPrice,
    currentProfit:
      input.actualProfit,
    currentProfitPercent:
      input.actualProfit,
    highestProfit:
      input.actualProfit,
    lowestProfit:
      input.actualProfit,
    lastUpdatedAt:
      input.closedAt,
    actualSellPrice:
      input.sellPrice,
    actualProfit:
      input.actualProfit,
    actualProfitPercent:
      input.actualProfit,
    tdsWithheld:
      0.1,
    deployableCashProfit:
      input.actualProfit -
      0.1,
    failureReason:
      null,
  };
}

main();
