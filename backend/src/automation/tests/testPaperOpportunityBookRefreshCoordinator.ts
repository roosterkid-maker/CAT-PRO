import assert from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  StrategyOneActionTimeBookRefreshResult,
} from "../../execution/live/tiny-live/StrategyOneActionTimeBookRefreshService";

import {
  PaperOpportunityBookRefreshCoordinatorService,
} from "../services/PaperOpportunityBookRefreshCoordinatorService";

const BASE_NOW =
  1_900_000_000_000;

async function main():
  Promise<void> {
  let now =
    BASE_NOW;
  let armed =
    true;
  const refreshedMarkets:
    string[] =
    [];

  const service =
    new PaperOpportunityBookRefreshCoordinatorService(
      {
        minimumGlobalRefreshIntervalMs:
          0,
        minimumRouteRefreshIntervalMs:
          0,
      },
      {
        now:
          () =>
            now,
        isPaperRuntimeArmed:
          () =>
            armed,
        refresh:
          async (
            route,
          ) => {
            refreshedMarkets.push(
              route.market,
            );

            const refreshed =
              opportunity(
                route.market,
                route.buyExchange,
                route.sellExchange,
                now,
                route.market ===
                  "MANTRAUSDT"
                  ? 1.05
                  : 0.8,
              );

            return refreshResult(
              refreshed,
              now,
            );
          },
      },
    );

  const mantra =
    opportunity(
      "MANTRAUSDT",
      "bybit",
      "binance",
      now -
        2_000,
      1.05,
    );
  const zent =
    opportunity(
      "ZENTUSDT",
      "coindcx",
      "bybit",
      now -
        2_000,
      0.5,
    );

  const first =
    await service.refreshSnapshot({
      generatedAt:
        now,
      opportunities: [
        mantra,
        zent,
      ],
    });

  assert.deepEqual(
    refreshedMarkets,
    [
      "MANTRAUSDT",
    ],
    "The first stale route may use profit only as a tie-breaker, never as a hardcoded market selector.",
  );
  assert.equal(
    first.opportunities[0]
      ?.pair.buy.timestamp,
    now,
    "The exact refreshed opportunity must enter the same PAPER scheduler cycle.",
  );
  assert.equal(
    first.opportunities[1]
      ?.pair.buy.timestamp,
    now -
      2_000,
    "One bounded refresh must not mutate an unrelated route.",
  );

  now +=
    1;

  await service.refreshSnapshot({
    generatedAt:
      now,
    opportunities: [
      mantra,
      zent,
    ],
  });

  assert.deepEqual(
    refreshedMarkets,
    [
      "MANTRAUSDT",
      "ZENTUSDT",
    ],
    "Least-recently attempted ordering must give every current stale opportunity a fair turn.",
  );

  armed =
    false;
  now +=
    1;

  await service.refreshSnapshot({
    generatedAt:
      now,
    opportunities: [
      opportunity(
        "TUTUSDT",
        "coindcx",
        "binance",
        now -
          2_000,
        4,
      ),
    ],
  });

  assert.equal(
    refreshedMarkets.length,
    2,
    "Public rescue reads must remain dormant until the operator arms automatic PAPER.",
  );
  assert.equal(
    service.getDiagnostics()
      .safety
      .orderSubmissionAllowed,
    false,
  );
  assert.equal(
    service.getDiagnostics()
      .safety
      .marketHardcodingAllowed,
    false,
  );

  console.log(
    "PAPER OPPORTUNITY BOOK REFRESH COORDINATOR TEST PASSED.",
  );
  console.log(
    "All current dynamic routes rotate through one public-read-only, rate-bounded refresh lane.",
  );
}

function opportunity(
  market:
    string,
  buyExchange:
    string,
  sellExchange:
    string,
  timestamp:
    number,
  netProfitPercent:
    number,
): ArbitrageOpportunity {
  return {
    id:
      `${market}-${timestamp}`,
    pair: {
      market,
      buy: {
        exchange:
          buyExchange,
        market,
        lastPrice:
          1,
        bestBidPrice:
          0.99,
        bestBidQty:
          1_000,
        bestAskPrice:
          1,
        bestAskQty:
          1_000,
        spread:
          0.01,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
      sell: {
        exchange:
          sellExchange,
        market,
        lastPrice:
          1.02,
        bestBidPrice:
          1.02,
        bestBidQty:
          1_000,
        bestAskPrice:
          1.03,
        bestAskQty:
          1_000,
        spread:
          0.01,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
    },
    buyPrice:
      1,
    sellPrice:
      1.02,
    buyAvailableQty:
      1_000,
    sellAvailableQty:
      1_000,
    requestedCapitalInr:
      500,
    quoteAsset:
      "USDT",
    requestedQuoteCapital:
      5,
    requiredQty:
      5,
    availableExecutableQty:
      1_000,
    executableQty:
      5,
    liquidityScore:
      100,
    enoughLiquidity:
      true,
    freshnessScore:
      100,
    feeScore:
      100,
    spreadScore:
      100,
    decision:
      "EXECUTE",
    analysisSummary:
      [],
    rawSpread:
      0.02,
    rawSpreadPercent:
      2,
    estimatedFees:
      0.01,
    netProfit:
      netProfitPercent /
      100,
    netProfitPercent,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      100,
    timestamp,
  };
}

function refreshResult(
  refreshed:
    ArbitrageOpportunity,
  now:
    number,
): StrategyOneActionTimeBookRefreshResult {
  return {
    schemaVersion:
      "149.0",
    state:
      "REFRESHED",
    route: {
      market:
        refreshed.pair.market,
      buyExchange:
        refreshed.pair.buy.exchange as "binance" | "bybit" | "coindcx",
      sellExchange:
        refreshed.pair.sell.exchange as "binance" | "bybit" | "coindcx",
    },
    startedAt:
      now,
    completedAt:
      now,
    durationMs:
      0,
    legs:
      [],
    evaluation:
      null,
    opportunity:
      refreshed,
    blocker:
      null,
    safety: {
      publicReadOnly:
        true,
      parallelReads:
        true,
      thresholdChanged:
        false,
      timestampFabricationAllowed:
        false,
      orderSubmissionAllowed:
        false,
      automaticRetryAllowed:
        false,
      transferAllowed:
        false,
      withdrawalAllowed:
        false,
    },
  };
}

void main();
