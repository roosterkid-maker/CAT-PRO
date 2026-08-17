import assert
  from "node:assert/strict";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  StrategyOneTradeFlowReportService,
} from "../services/StrategyOneTradeFlowReportService";

const NOW =
  Date.UTC(
    2030,
    0,
    15,
    6,
    30,
  );

const DAY_MS =
  24 * 60 * 60 * 1_000;

function main(): void {
  let revision =
    7;
  let reads =
    0;

  const firstBtc =
    createTrade({
      id:
        "today-btc-1",
      market:
        "BTCUSDT",
      buyExchange:
        "coindcx",
      sellExchange:
        "binance",
      quantity:
        0.01,
      capital:
        1_000,
      actualProfit:
        10,
      closedAt:
        NOW -
        1_000,
    });

  const trades:
    PaperTrade[] = [
    firstBtc,
    firstBtc,
    createTrade({
      id:
        "today-btc-2",
      market:
        "BTC-USDT",
      buyExchange:
        "coindcx",
      sellExchange:
        "bybit",
      quantity:
        0.02,
      capital:
        2_000,
      actualProfit:
        -5,
      closedAt:
        NOW -
        2_000,
    }),
    createTrade({
      id:
        "today-eth",
      market:
        "ETHINR",
      buyExchange:
        "binance",
      sellExchange:
        "coindcx",
      quantity:
        0.5,
      capital:
        1_500,
      actualProfit:
        5,
      closedAt:
        NOW -
        3_000,
    }),
    createTrade({
      id:
        "distorted",
      market:
        "DOGEINR",
      buyExchange:
        "coinswitch",
      sellExchange:
        "unocoin",
      quantity:
        100,
      capital:
        1_000,
      actualProfit:
        400,
      buyPrice:
        100,
      sellPrice:
        140,
      closedAt:
        NOW -
        4_000,
    }),
    createTrade({
      id:
        "seven-day",
      market:
        "BTCUSDT",
      buyExchange:
        "bybit",
      sellExchange:
        "coindcx",
      quantity:
        0.03,
      capital:
        3_000,
      actualProfit:
        20,
      closedAt:
        NOW -
        3 * DAY_MS,
    }),
    createTrade({
      id:
        "fourteen-day",
      market:
        "SOLINR",
      buyExchange:
        "unocoin",
      sellExchange:
        "coinswitch",
      quantity:
        2,
      capital:
        2_500,
      actualProfit:
        15,
      closedAt:
        NOW -
        10 * DAY_MS,
    }),
    createTrade({
      id:
        "lifetime",
      market:
        "XRPINR",
      buyExchange:
        "coinswitch",
      sellExchange:
        "binance",
      quantity:
        10,
      capital:
        2_000,
      actualProfit:
        8,
      closedAt:
        NOW -
        30 * DAY_MS,
    }),
    createTrade({
      id:
        "other-strategy",
      market:
        "BTCUSDT",
      buyExchange:
        "coindcx",
      sellExchange:
        "binance",
      quantity:
        1,
      capital:
        50_000,
      actualProfit:
        1_000,
      closedAt:
        NOW -
        5_000,
      strategyId:
        "triangular-arbitrage",
    }),
  ];

  const service =
    new StrategyOneTradeFlowReportService({
      getTrades: () => {
        reads +=
          1;

        return trades;
      },
      getSettledRevision:
        () =>
          revision,
    });

  const report =
    service.getReport(
      NOW,
    );

  assert.equal(
    report.version,
    "117.0",
  );
  assert.equal(
    report.mode,
    "PAPER_ANALYTICS_ONLY",
  );
  assert.equal(
    report.timezone,
    "Asia/Kolkata",
  );
  assert.equal(
    report.evidence.storedTrades,
    9,
  );
  assert.equal(
    report.evidence.storedStrategyOneSettlements,
    8,
  );
  assert.equal(
    report.evidence.uniqueStrategyOneSettlements,
    7,
  );
  assert.equal(
    report.evidence.credibleSettlements,
    6,
  );
  assert.equal(
    report.evidence.excludedDistortedSettlements,
    1,
  );
  assert.equal(
    report.evidence.duplicateIdsIgnored,
    1,
  );

  const today =
    report.windows.TODAY;

  assert.equal(
    today.summary.settlements,
    3,
  );
  assert.equal(
    today.summary.capitalTurnoverInr,
    4_500,
  );
  assert.equal(
    today.summary.realizedPnlInr,
    10,
  );
  assert.equal(
    today.summary.winRatePercent,
    66.67,
  );
  assert.equal(
    today.markets[0]?.market,
    "BTCUSDT",
  );
  assert.equal(
    today.markets[0]?.settlements,
    2,
  );
  assert.equal(
    today.markets[0]?.leadingBuyExchange,
    "coindcx",
  );
  assert.equal(
    today.buyExchanges[0]?.exchange,
    "coindcx",
  );
  assert.equal(
    today.buyExchanges[0]?.settlements,
    2,
  );
  assert.equal(
    today.sellExchanges[0]?.exchange,
    "bybit",
  );
  assert.equal(
    today.routes[0]?.routeKey,
    "BTCUSDT|coindcx>bybit",
  );

  const coindcxBtcFlow =
    today.inventoryFlows.find(
      (
        flow,
      ) =>
        flow.exchange ===
          "coindcx" &&
        flow.asset ===
          "BTC",
    );

  assert.equal(
    coindcxBtcFlow?.boughtQuantity,
    0.03,
  );
  assert.equal(
    coindcxBtcFlow?.soldQuantity,
    0,
  );
  assert.equal(
    coindcxBtcFlow?.direction,
    "ACCUMULATING",
  );

  assert.equal(
    report.windows["7D"].summary.settlements,
    4,
  );
  assert.equal(
    report.windows["14D"].summary.settlements,
    5,
  );
  assert.equal(
    report.windows.LIFETIME.summary.settlements,
    6,
  );

  const cached =
    service.getReport(
      NOW +
      60_000,
    );

  assert.strictEqual(
    cached,
    report,
    "Unchanged terminal evidence within the same IST day must reuse the immutable report.",
  );
  assert.equal(
    reads,
    1,
  );

  revision +=
    1;

  const rebuilt =
    service.getReport(
      NOW +
      120_000,
    );

  assert.notStrictEqual(
    rebuilt,
    report,
  );
  assert.equal(
    reads,
    2,
  );
  assert.equal(
    rebuilt.safety.orderSubmissionAllowed,
    false,
  );
  assert.equal(
    rebuilt.safety.transferInitiated,
    false,
  );
  assert.equal(
    Object.isFrozen(
      rebuilt.windows.TODAY.inventoryFlows,
    ),
    true,
  );

  console.log(
    "V117 Strategy #1 trade-flow report test passed.",
  );
  console.log(
    "Credible closed PAPER settlements were revision-cached and ranked by market, route, BUY/SELL venue and asset inventory flow without any balance, transfer, LIVE or order mutation.",
  );
}

function createTrade(
  input: {
    id: string;
    market: string;
    buyExchange: string;
    sellExchange: string;
    quantity: number;
    capital: number;
    actualProfit: number;
    closedAt: number;
    buyPrice?: number;
    sellPrice?: number;
    strategyId?:
      "cross-exchange-arbitrage" |
      "triangular-arbitrage";
  },
): PaperTrade {
  const buyPrice =
    input.buyPrice ??
    100;
  const sellPrice =
    input.sellPrice ??
    101;

  return {
    strategyAttribution: {
      attributionStatus:
        "ATTRIBUTED",
      strategyId:
        input.strategyId ??
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
      input.capital,
    quantity:
      input.quantity,
    buyPrice,
    sellPrice,
    estimatedFees:
      1,
    expectedProfit:
      input.actualProfit,
    expectedProfitPercent:
      input.actualProfit /
      input.capital *
      100,
    status:
      "closed",
    openedAt:
      input.closedAt -
      500,
    closedAt:
      input.closedAt,
    currentPrice:
      sellPrice,
    currentProfit:
      input.actualProfit,
    currentProfitPercent:
      input.actualProfit /
      input.capital *
      100,
    highestProfit:
      input.actualProfit,
    lowestProfit:
      input.actualProfit,
    lastUpdatedAt:
      input.closedAt,
    actualSellPrice:
      sellPrice,
    actualProfit:
      input.actualProfit,
    actualProfitPercent:
      input.actualProfit /
      input.capital *
      100,
    deployableCashProfit:
      input.actualProfit -
      0.25,
    tdsWithheld:
      0.25,
    failureReason:
      null,
  };
}

main();
