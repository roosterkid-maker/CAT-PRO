import assert
  from "node:assert/strict";

import type {
  ExchangeFeeEvidence,
} from "../../arbitrage/models/FeeModel";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  CrossExchangeMarketMakingFillAndHedgeSimulator,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingFillAndHedgeSimulator";

import type {
  CrossExchangeMarketMakingHedgeEvidenceSource,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingFillAndHedgeSimulator";

import {
  CrossExchangeMarketMakingMakerLifecycleSimulator,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingMakerLifecycleSimulator";

import {
  CrossExchangeMarketMakingPriceEngine,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPriceEngine";

import type {
  CrossExchangeMarketMakingPricingEvidenceSource,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPriceEngine";

import {
  CrossExchangeMarketMakingStrategyController,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingStrategyController";

import type {
  CrossExchangeMarketMakingShadowAnalyticsSnapshot,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingShadowAnalyticsService";

import {
  StrategyOrchestrator,
} from "../services/StrategyOrchestrator";

import {
  StrategyReadModelService,
} from "../services/StrategyReadModelService";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

const NOW =
  1_820_000_000_000;

const MARKET =
  "BTCUSDT";

function main():
  void {
  let makerQuote =
    quote(
      "bybit",
      99,
      5,
      101,
      6,
      NOW -
        100,
    );

  let hedgeQuote =
    quote(
      "binance",
      102,
      8,
      103,
      9,
      NOW -
        120,
    );

  let makerCapability =
    capability(
      "bybit",
      NOW -
        200,
      true,
    );

  let hedgeCapability =
    capability(
      "binance",
      NOW -
        200,
      false,
    );

  /*
   * Current Bybit spot metadata can express the lower order bound only as
   * minimum notional. A null deprecated minimum-quantity field must not make
   * otherwise complete quantity-step/notional evidence invalid.
   */
  makerCapability = {
    ...makerCapability,
    quantity: {
      ...makerCapability.quantity,
      minimumQuantity:
        null,
    },
  };

  hedgeCapability = {
    ...hedgeCapability,
    quantity: {
      ...hedgeCapability.quantity,
      minimumQuantity:
        null,
    },
  };

  const priceSource:
    CrossExchangeMarketMakingPricingEvidenceSource = {
    getQuote: (
      exchange,
    ) =>
      exchange ===
        "bybit"
        ? makerQuote
        : exchange ===
            "binance"
          ? hedgeQuote
          : null,

    evaluatePairFreshness: (
      maker,
      hedge,
      now,
    ) =>
      freshnessIntegrityService
        .evaluatePair(
          maker,
          hedge,
          now,
        ),

    getFeeEvidence: (
      exchange,
    ) =>
      fee(
        exchange,
      ),

    getCachedMakerCapability: () =>
      makerCapability,
  };

  const hedgeSource:
    CrossExchangeMarketMakingHedgeEvidenceSource = {
    getCachedHedgeCapability: () =>
      hedgeCapability,
  };

  const controller =
    new CrossExchangeMarketMakingStrategyController(
      {
        enabled:
          true,
        makerExchange:
          "bybit",
        hedgeExchange:
          "binance",
        marketAllowlist: [
          MARKET,
        ],
        minimumRetainedEdgePercent:
          0.2,
        maximumCapabilityAgeMs:
          60_000,
        makerLifecycle: {
          enabled:
            true,
          quantityByMarket: {
            BTCUSDT:
              0.1,
          },
          maximumOrderAgeMs:
            10_000,
          minimumRepriceTicks:
            2,
        },
        makerFill: {
          enabled:
            true,
          minimumRestingTimeMs:
            100,
          minimumTradeThroughTicks:
            1,
          hedgeIntentTtlMs:
            500,
        },
      },
      new CrossExchangeMarketMakingPriceEngine(
        priceSource,
      ),
      new CrossExchangeMarketMakingMakerLifecycleSimulator(),
      new CrossExchangeMarketMakingFillAndHedgeSimulator(
        hedgeSource,
      ),
    );

  assert.deepEqual(
    controller
      .getConfiguration()
      .makerFill,
    {
      enabled:
        true,
      minimumRestingTimeMs:
        100,
      minimumTradeThroughTicks:
        1,
      hedgeIntentTtlMs:
        500,
      queueAwarePartialFillsEnabled:
        false,
      maximumPublicTradeAgeMs:
        null,
      state:
        "READY",
      blockers:
        [],
    },
  );

  controller.start();
  controller.refreshPricingEvidence(
    NOW,
  );

  const placedOrders =
    controller
      .getLifecycleSnapshot(
        NOW,
      )
      .orders;

  assert.equal(
    placedOrders.length,
    2,
  );

  const initialBid =
    placedOrders.find(
      (order) =>
        order.side ===
        "BID",
    );

  assert.ok(
    initialBid,
  );

  controller.refreshPricingEvidence(
    NOW +
      50,
  );

  let fillEvidence =
    controller.getFillAndHedgeSnapshot(
      NOW +
        50,
    );

  assert.equal(
    fillEvidence.fills.length,
    0,
  );

  assert.equal(
    fillEvidence.assessments.every(
      (assessment) =>
        assessment.blockers
          .includes(
            "MINIMUM_RESTING_TIME_NOT_MET",
          ) &&
        assessment.blockers
          .includes(
            "POST_PLACEMENT_QUOTE_REQUIRED",
          ),
    ),
    true,
    "Pre-placement/same quote evidence cannot simulate a maker fill.",
  );

  makerQuote = {
    ...makerQuote,
    bestAskPrice:
      initialBid.simulatedPrice,
    timestamp:
      NOW +
      100,
  };

  controller.refreshPricingEvidence(
    NOW +
      100,
  );

  fillEvidence =
    controller.getFillAndHedgeSnapshot(
      NOW +
        100,
    );

  assert.equal(
    fillEvidence.fills.length,
    0,
  );

  assert.equal(
    fillEvidence.assessments.some(
      (assessment) =>
        assessment.side ===
          "BID" &&
        assessment.blockers
          .includes(
            "TRADE_THROUGH_NOT_PROVEN",
          ) &&
        assessment.observedTradeThroughTicks ===
          0,
    ),
    true,
    "A maker-price touch must not be treated as a fill.",
  );

  const restingBid =
    controller
      .getLifecycleSnapshot(
        NOW +
          100,
      )
      .orders
      .find(
        (order) =>
          order.side ===
            "BID" &&
          order.status ===
            "ACTIVE",
      );

  assert.ok(
    restingBid,
  );

  makerQuote = {
    ...makerQuote,
    bestBidPrice:
      restingBid.simulatedPrice -
      0.02,
    bestAskPrice:
      restingBid.simulatedPrice -
      0.01,
    timestamp:
      NOW +
      200,
  };

  makerCapability = {
    ...makerCapability,
    synchronizedAt:
      NOW +
      190,
  };

  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      190,
  };

  hedgeCapability = {
    ...hedgeCapability,
    synchronizedAt:
      NOW +
      190,
  };

  controller.refreshPricingEvidence(
    NOW +
      200,
  );

  fillEvidence =
    controller.getFillAndHedgeSnapshot(
      NOW +
        200,
    );

  assert.equal(
    Object.isFrozen(
      fillEvidence,
    ),
    true,
  );

  assert.equal(
    fillEvidence.fills.length,
    1,
  );

  const bidFill =
    fillEvidence.fills[0];

  assert.ok(
    bidFill,
  );

  assert.equal(
    bidFill.orderId,
    restingBid.id,
  );

  assert.equal(
    bidFill.simulatedFillPrice,
    restingBid.simulatedPrice,
  );

  assert.equal(
    bidFill.simulatedFillQuantity,
    0.1,
  );

  assert.equal(
    bidFill.method,
    "FRESH_POST_RESTING_TOP_OF_BOOK_MOVE_THROUGH_V21_3",
  );

  assert.equal(
    bidFill.partialFillModel,
    "NOT_AVAILABLE_V21_3",
  );

  assert.equal(
    bidFill.queuePosition,
    "UNKNOWN_NOT_INFERRED",
  );

  assert.equal(
    bidFill.exchangeFill,
    false,
  );

  assert.equal(
    controller
      .getLifecycleSnapshot(
        NOW +
          200,
      )
      .orders
      .find(
        (order) =>
          order.id ===
          restingBid.id,
      )
      ?.status,
    "SIMULATED_FILLED",
  );

  assert.equal(
    fillEvidence.hedgeAssessments[0]
      ?.status,
    "READY",
  );

  assert.equal(
    fillEvidence.hedgeAssessments[0]
      ?.hedgeSide,
    "SELL",
  );

  assert.equal(
    fillEvidence.hedgeIntents.length,
    1,
  );

  const bidHedgeIntent =
    fillEvidence.hedgeIntents[0];

  assert.ok(
    bidHedgeIntent,
  );

  assert.equal(
    bidHedgeIntent.proposedMode,
    "SHADOW",
  );

  assert.equal(
    bidHedgeIntent.proposedCapital,
    null,
  );

  assert.equal(
    bidHedgeIntent.executionAuthorized,
    false,
  );

  assert.equal(
    bidHedgeIntent.automaticExecutionAllowed,
    false,
  );

  assert.equal(
    bidHedgeIntent.evidence.hedgeCapacityStatus,
    "FULL_TOP_OF_BOOK_CAPACITY_VERIFIED",
  );

  assert.equal(
    bidHedgeIntent.evidence.balanceEvidence,
    "NOT_EVALUATED_V21_3",
  );

  const intentsBeforeDuplicate =
    controller.getIntents(
      NOW +
        200,
    ).length;

  controller.refreshPricingEvidence(
    NOW +
      201,
  );

  assert.equal(
    controller.getIntents(
      NOW +
        201,
    ).length,
    intentsBeforeDuplicate,
    "A processed maker order must not generate duplicate fills or hedge intents.",
  );

  const activeAsk =
    controller
      .getLifecycleSnapshot(
        NOW +
          201,
      )
      .orders
      .find(
        (order) =>
          order.side ===
            "ASK" &&
          order.status ===
            "ACTIVE",
      );

  assert.ok(
    activeAsk,
  );

  makerQuote = {
    ...makerQuote,
    bestBidPrice:
      activeAsk.simulatedPrice +
      0.01,
    bestAskPrice:
      activeAsk.simulatedPrice +
      0.02,
    timestamp:
      NOW +
      350,
  };

  makerCapability = {
    ...makerCapability,
    synchronizedAt:
      NOW +
      340,
  };

  hedgeQuote = {
    ...hedgeQuote,
    bestAskQty:
      0.05,
    timestamp:
      NOW +
      340,
  };

  hedgeCapability = {
    ...hedgeCapability,
    synchronizedAt:
      NOW +
      340,
  };

  controller.refreshPricingEvidence(
    NOW +
      350,
  );

  fillEvidence =
    controller.getFillAndHedgeSnapshot(
      NOW +
        350,
    );

  assert.equal(
    fillEvidence.fills.length,
    2,
  );

  const askFill =
    fillEvidence.fills.find(
      (fill) =>
        fill.makerSide ===
        "ASK",
    );

  assert.ok(
    askFill,
  );

  const blockedHedge =
    fillEvidence.hedgeAssessments.find(
      (assessment) =>
        assessment.fillId ===
        askFill.id,
    );

  assert.ok(
    blockedHedge,
  );

  assert.equal(
    blockedHedge.status,
    "BLOCKED",
  );

  assert.equal(
    blockedHedge.hedgeSide,
    "BUY",
  );

  assert.equal(
    blockedHedge.blockers.includes(
      "HEDGE_TOP_OF_BOOK_QUANTITY_INSUFFICIENT",
    ),
    true,
  );

  assert.equal(
    fillEvidence.hedgeIntents.length,
    1,
    "A simulated fill with insufficient full hedge capacity must not create a hedge intent.",
  );

  const registry =
    new StrategyRegistry();

  registry.register(
    controller,
  );

  const detail =
    new StrategyReadModelService(
      registry,
      new StrategyOrchestrator(
        registry,
      ),
    ).getById(
      "cross-exchange-market-making",
      NOW +
        350,
    );

  assert.ok(
    detail,
  );

  assert.equal(
    detail.fillAndHedge.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    detail.intents.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    detail.intents.records.length,
    1,
  );

  assert.equal(
    detail.shadowAnalytics.evidenceStatus,
    "AVAILABLE",
  );

  const shadowAnalytics =
    detail.shadowAnalytics.value as unknown as
      CrossExchangeMarketMakingShadowAnalyticsSnapshot;

  assert.equal(
    shadowAnalytics.summary
      .simulatedFills,
    2,
  );

  assert.equal(
    shadowAnalytics.summary
      .hedgeReady,
    1,
  );

  assert.equal(
    shadowAnalytics.summary
      .hedgeBlocked,
    1,
  );

  assert.equal(
    shadowAnalytics.readiness
      .state,
    "COLLECTING",
  );

  assert.equal(
    shadowAnalytics.readiness
      .paperEligible,
    false,
  );

  assert.equal(
    detail.safety.intentGenerationAllowed,
    true,
  );

  assert.equal(
    detail.safety.intentExecutionAllowed,
    false,
  );

  assert.equal(
    detail.safety.orderSubmissionAllowed,
    false,
  );

  controller.stop();

  for (
    const forbiddenMethod
    of [
      "executeHedgeIntent",
      "placeHedgeOrder",
      "reserveInventory",
      "reserveCapital",
      "submitOrder",
      "execute",
    ]
  ) {
    assert.equal(
      forbiddenMethod in
        controller,
      false,
    );
  }

  console.log(
    "Cross-exchange market-making fill and hedge-intent test passed.",
  );

  console.log(
    "V21.3 used conservative SHADOW evidence only; no exchange fill, hedge execution, PAPER, LIVE, balance mutation, capital reservation, or order occurred.",
  );
}

function quote(
  exchange:
    string,

  bestBidPrice:
    number,

  bestBidQty:
    number,

  bestAskPrice:
    number,

  bestAskQty:
    number,

  timestamp:
    number,
): ExecutableQuote {
  return {
    exchange,
    market:
      MARKET,
    lastPrice:
      null,
    bestBidPrice,
    bestBidQty,
    bestAskPrice,
    bestAskQty,
    spread:
      bestAskPrice -
      bestBidPrice,
    timestamp,
    source:
      "orderBook",
    executable:
      true,
  };
}

function fee(
  exchange:
    string,
): ExchangeFeeEvidence {
  return {
    exchange,
    makerPercent:
      0.1,
    takerPercent:
      0.1,
    market:
      MARKET,
    source:
      "STATIC_CONFIG",
    synchronizedAt:
      null,
    expiresAt:
      null,
  };
}

function capability(
  exchange:
    string,

  synchronizedAt:
    number,

  supportsPostOnly:
    boolean,
): ExchangeMarketCapability {
  return {
    exchange,
    market:
      MARKET,
    baseAsset:
      "BTC",
    quoteAsset:
      "USDT",
    product:
      "spot",
    tradingEnabled:
      true,
    maintenanceMode:
      false,
    order: {
      supportedOrderTypes: [
        "market",
        "limit",
      ],
      supportedTimeInForce: [
        "GTC",
      ],
      supportsPostOnly,
      supportsClientOrderId:
        true,
      supportsOrderCancellation:
        true,
      supportsOrderStatusPolling:
        true,
    },
    price: {
      minimumPrice:
        0.01,
      maximumPrice:
        1_000_000,
      priceStep:
        0.01,
      pricePrecision:
        2,
    },
    quantity: {
      minimumQuantity:
        0.01,
      maximumQuantity:
        100,
      quantityStep:
        0.01,
      quantityPrecision:
        2,
    },
    notional: {
      minimumNotional:
        1,
      maximumNotional:
        1_000_000,
    },
    fees: {
      makerFeeRate:
        0.001,
      takerFeeRate:
        0.001,
      feeAsset:
        "USDT",
    },
    sourceUpdatedAt:
      synchronizedAt,
    synchronizedAt,
  };
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
