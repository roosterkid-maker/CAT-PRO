import assert from "node:assert/strict";

import {
  StrategyOneDynamicExecutionDecisionManager,
  type StrategyOneDynamicCandidate,
} from "../dynamic/StrategyOneDynamicExecutionDecisionManager";

import {
  StrategyOneCanonicalLivePreflightService,
} from "../dynamic/StrategyOneCanonicalLivePreflightService";

const NOW =
  1_787_616_000_000;

function main(): void {
  const manager =
    new StrategyOneDynamicExecutionDecisionManager();

  const executable =
    manager.evaluate(
      candidate(),
    );

  assert.equal(
    executable.decision,
    "EXECUTE_NOW",
  );
  assert.equal(
    executable.recommendedQuantity,
    0.05,
  );
  assert.ok(
    (
      executable.economics
        ?.economicNetProfitPercent ??
      0
    ) >= 0.30,
  );
  assert.equal(
    executable.liveOrderAuthorityGranted,
    false,
  );

  assertDecision(
    manager,
    {
      buyExchange:
        "coinswitch",
    },
    "ROUTE_UNAVAILABLE",
    "ROUTE_OUTSIDE_CORE_EXCHANGE_UNIVERSE",
  );

  assertDecision(
    manager,
    {
      buyExchange:
        "coindcx",
      sellExchange:
        "bybit",
      buyVenueReady:
        false,
    },
    "ROUTE_UNAVAILABLE",
    "BUY_VENUE_NOT_ORDER_READY",
  );

  assert.equal(
    manager.evaluate(
      candidate({
        buyExchange:
          "binance",
        sellExchange:
          "bybit",
      }),
    ).decision,
    "EXECUTE_NOW",
    "CoinDCX failure must not block a Binance-to-Bybit route.",
  );

  assertDecision(
    manager,
    {
      buyVenueReady:
        false,
    },
    "ROUTE_UNAVAILABLE",
    "BUY_VENUE_NOT_ORDER_READY",
  );

  assert.equal(
    manager.evaluate(
      candidate({
        buyExchange:
          "bybit",
        sellExchange:
          "coindcx",
      }),
    ).decision,
    "EXECUTE_NOW",
    "A Binance failure is route-local; Bybit-to-CoinDCX remains independently evaluable.",
  );

  assert.equal(
    manager.evaluate(
      candidate({
        buyExchange:
          "binance",
        sellExchange:
          "coindcx",
      }),
    ).decision,
    "EXECUTE_NOW",
    "A Bybit failure is route-local; Binance-to-CoinDCX remains independently evaluable.",
  );

  assertDecision(
    manager,
    {
      buyBookTimestamp:
        NOW -
        251,
    },
    "WAIT",
    "BUY_BOOK_STALE",
  );

  assertDecision(
    manager,
    {
      sellBookTimestamp:
        NOW -
        251,
    },
    "WAIT",
    "SELL_BOOK_STALE",
  );

  assertDecision(
    manager,
    {
      buyBookTimestamp:
        NOW -
        10,
      sellBookTimestamp:
        NOW -
        300,
      maximumBookAgeMs:
        500,
    },
    "WAIT",
    "CROSS_EXCHANGE_TIMESTAMP_SKEW_EXCEEDED",
  );

  assertDecision(
    manager,
    {
      buyBestBid:
        100.1,
      buyBestAsk:
        100,
    },
    "WAIT",
    "INVALID_OR_CROSSED_ORDER_BOOK",
  );

  const reduced =
    manager.evaluate(
      candidate({
        buyDepthQuantity:
          0.03,
      }),
    );

  assert.equal(
    reduced.decision,
    "REDUCE_QUANTITY",
  );
  assert.equal(
    reduced.recommendedQuantity,
    0.03,
  );
  assert.equal(
    reduced.economics?.executable,
    true,
  );

  assertDecision(
    manager,
    {
      buyAvailableQuoteBalance:
        0.01,
    },
    "REBALANCE_REQUIRED",
    "PREFUNDED_BALANCES_OR_DEPTH_LEAVE_NO_EXECUTABLE_QUANTITY",
  );

  assertDecision(
    manager,
    {
      sellAvailableBaseInventory:
        0,
    },
    "REBALANCE_REQUIRED",
    "PREFUNDED_BALANCES_OR_DEPTH_LEAVE_NO_EXECUTABLE_QUANTITY",
  );

  assertDecision(
    manager,
    {
      buyMinimumNotional:
        10,
    },
    "SKIP",
    "EXCHANGE_MINIMUM_NOTIONAL_NOT_MET",
  );

  assertDecision(
    manager,
    {
      buyVwap:
        100.05,
    },
    "SKIP",
    "PRICE_OR_QUANTITY_INCREMENT_NOT_MET",
  );

  const stepReduced =
    manager.evaluate(
      candidate({
        requestedQuantity:
          0.0505,
        requestedQuoteCapital:
          5.05,
      }),
    );
  assert.equal(
    stepReduced.decision,
    "REDUCE_QUANTITY",
  );
  assert.equal(
    stepReduced.recommendedQuantity,
    0.05,
  );

  assertDecision(
    manager,
    {
      sellVwap:
        100.4,
      sellBestBid:
        100.4,
      sellBestAsk:
        100.5,
    },
    "SKIP",
    "NO_EXECUTABLE_OPPORTUNITY",
  );

  assertDecision(
    manager,
    {
      requestedCapitalInr:
        501,
    },
    "SKIP",
    "INVALID_OR_ABOVE_CAPITAL_LIMIT",
  );

  assertDecision(
    manager,
    {
      activeAttempts:
        1,
    },
    "WAIT",
    "MAXIMUM_CONCURRENT_ATTEMPTS_REACHED",
  );

  assertDecision(
    manager,
    {
      attemptsToday:
        1,
    },
    "WAIT",
    "DAILY_ATTEMPT_CAP_REACHED",
  );

  assertDecision(
    manager,
    {
      emergencyStop:
        true,
    },
    "EMERGENCY_STOP",
    "EMERGENCY_STOP_ACTIVE",
  );

  const coinDcxEconomics =
    manager.evaluate(
      candidate({
        sellExchange:
          "coindcx",
        tdsWithholdingPercent:
          1,
      }),
    ).economics;

  assert.ok(
    coinDcxEconomics,
  );
  assert.ok(
    coinDcxEconomics.tdsWithheld >
      0,
  );
  assert.equal(
    rounded(
      coinDcxEconomics.deployableCashProfit,
    ),
    rounded(
      coinDcxEconomics.economicNetProfit -
      coinDcxEconomics.tdsWithheld,
    ),
    "TDS must affect deployable cash once without being double-counted as permanent economic loss.",
  );

  const preflight =
    new StrategyOneCanonicalLivePreflightService();

  const noRuntime =
    preflight.run({
      candidate:
        candidate(),
      liveRuntimeEnabled:
        false,
      accountModeLive:
        true,
      personalStrategyOneBotEnabled:
        true,
      operatorPreflightConfirmed:
        true,
    });

  assert.equal(
    noRuntime.dynamicRecommendation.decision,
    "EXECUTE_NOW",
  );
  assert.equal(
    noRuntime.approvedForOneTimeArm,
    false,
    "A Dynamic Manager recommendation must never override canonical preflight.",
  );
  assert.equal(
    noRuntime.authorityGranted,
    false,
  );
  assert.equal(
    noRuntime.orderSubmitted,
    false,
  );

  const complete =
    preflight.run({
      candidate:
        candidate(),
      liveRuntimeEnabled:
        true,
      accountModeLive:
        true,
      personalStrategyOneBotEnabled:
        true,
      operatorPreflightConfirmed:
        true,
    });

  assert.equal(
    complete.approvedForOneTimeArm,
    true,
  );
  assert.equal(
    complete.authorityGranted,
    false,
  );

  console.log(
    "Controlled Strategy #1 route-local decision and canonical preflight tests passed; no adapter or external exchange order endpoint was called.",
  );
}

function candidate(
  overrides:
    Partial<StrategyOneDynamicCandidate> = {},
): StrategyOneDynamicCandidate {
  return {
    opportunityId:
      "controlled-live-fixture",
    market:
      "BTCUSDT",
    buyExchange:
      "binance",
    sellExchange:
      "bybit",
    requestedCapitalInr:
      500,
    requestedQuoteCapital:
      5,
    requestedQuantity:
      0.05,
    buyBestBid:
      99.9,
    buyBestAsk:
      100,
    sellBestBid:
      101,
    sellBestAsk:
      101.1,
    buyVwap:
      100,
    sellVwap:
      101,
    buyDepthQuantity:
      1,
    sellDepthQuantity:
      1,
    buyBookTimestamp:
      NOW -
      10,
    sellBookTimestamp:
      NOW -
      10,
    now:
      NOW,
    maximumBookAgeMs:
      250,
    maximumTimestampSkewMs:
      250,
    buyAvailableQuoteBalance:
      10,
    sellAvailableBaseInventory:
      1,
    buyMinimumNotional:
      1,
    sellMinimumNotional:
      1,
    buyPriceTickSize:
      0.1,
    sellPriceTickSize:
      0.1,
    quantityStepSize:
      0.001,
    buyFeePercent:
      0.1,
    sellFeePercent:
      0.1,
    buySlippagePercent:
      0.02,
    sellSlippagePercent:
      0.02,
    safetyBufferPercent:
      0.05,
    minimumNetProfitPercent:
      0.30,
    buyVenueReady:
      true,
    sellVenueReady:
      true,
    routeReady:
      true,
    exchangeRulesFresh:
      true,
    spotPermissionsVerified:
      true,
    orderContractsReady:
      true,
    recoveryHealthy:
      true,
    emergencyStop:
      false,
    activeAttempts:
      0,
    attemptsToday:
      0,
    dailyAttemptCap:
      1,
    todayLossInr:
      0,
    dailyLossLimitInr:
      100,
    recentRouteFailure:
      false,
    ...overrides,
  };
}

function assertDecision(
  manager:
    StrategyOneDynamicExecutionDecisionManager,
  overrides:
    Partial<StrategyOneDynamicCandidate>,
  decision:
    ReturnType<StrategyOneDynamicExecutionDecisionManager["evaluate"]>["decision"],
  blocker:
    string,
): void {
  const report =
    manager.evaluate(
      candidate(
        overrides,
      ),
    );

  assert.equal(
    report.decision,
    decision,
  );
  assert.equal(
    report.blockers.includes(
      blocker,
    ),
    true,
    `${blocker} was not reported: ${report.blockers.join(", ")}`,
  );
}

function rounded(
  value: number,
): number {
  return Number(
    value.toFixed(
      12,
    ),
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error,
  );
  process.exitCode =
    1;
}
