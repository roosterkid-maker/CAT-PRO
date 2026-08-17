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

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

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
  CrossExchangeMarketMakingPublicTradeTapeService,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";

import type {
  CrossExchangeMarketMakingPublicTrade,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";

import {
  CrossExchangeMarketMakingStrategyController,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingStrategyController";

const NOW =
  1_830_000_000_000;

const MARKET =
  "BTCUSDT";

function main():
  void {
  verifyBoundedPublicTradeTape();
  verifyQueueAwarePartialFill();

  console.log(
    "Cross-exchange market-making queue-aware partial-fill test passed.",
  );

  console.log(
    "V21.5 used bounded public trade prints and conservative FIFO SHADOW modeling only; no exchange fill, fill probability, PAPER, LIVE, balance, capital, or order action was inferred.",
  );
}

function verifyBoundedPublicTradeTape():
  void {
  const tape =
    new CrossExchangeMarketMakingPublicTradeTapeService(
      2,
    );

  tape.watch(
    "bybit",
    [
      MARKET,
    ],
  );

  assert.equal(
    tape.record(
      trade(
        "ignored",
        NOW,
        100,
        1,
        "SELL",
        "binance",
      ),
    ),
    false,
  );

  assert.equal(
    tape.record(
      trade(
        "one",
        NOW +
          1,
        100,
        1,
        "SELL",
      ),
    ),
    true,
  );

  assert.equal(
    tape.record(
      trade(
        "one",
        NOW +
          1,
        100,
        1,
        "SELL",
      ),
    ),
    false,
    "Duplicate public trades must not consume queue twice.",
  );

  tape.record(
    trade(
      "two",
      NOW +
        2,
      100,
      1,
      "SELL",
    ),
  );
  tape.record(
    trade(
      "three",
      NOW +
        3,
      100,
      1,
      "SELL",
    ),
  );

  const diagnostics =
    tape.getDiagnostics();

  assert.equal(
    diagnostics.retainedTrades,
    2,
  );
  assert.equal(
    diagnostics.evictedTrades,
    1,
  );
  assert.equal(
    diagnostics.duplicateTradesIgnored,
    1,
  );
  assert.equal(
    diagnostics.ignoredUnwatchedTrades,
    1,
  );
  assert.equal(
    diagnostics.safety.exchangeFillClaimed,
    false,
  );
}

function verifyQueueAwarePartialFill():
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
  let makerBook:
    OrderBook | null =
    null;
  let publicTrades:
    CrossExchangeMarketMakingPublicTrade[] =
    [];
  let publicTradeReaderAvailable =
    false;

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

  const fillSource:
    CrossExchangeMarketMakingHedgeEvidenceSource = {
    getCachedHedgeCapability: () =>
      hedgeCapability,
    getMakerOrderBook: () =>
      makerBook,
    getPublicTrades: (
      _exchange,
      _market,
      afterExclusive,
      throughInclusive,
    ) => {
      if (
        !publicTradeReaderAvailable
      ) {
        throw new Error(
          "Public trade tape unavailable.",
        );
      }

      return publicTrades.filter(
          (item) =>
            item.occurredAt >
              afterExclusive &&
            item.occurredAt <=
              throughInclusive,
        );
    },
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
            50,
          minimumTradeThroughTicks:
            1,
          hedgeIntentTtlMs:
            500,
          queueAwarePartialFillsEnabled:
            true,
          maximumPublicTradeAgeMs:
            1_000,
        },
      },
      new CrossExchangeMarketMakingPriceEngine(
        priceSource,
      ),
      new CrossExchangeMarketMakingMakerLifecycleSimulator(),
      new CrossExchangeMarketMakingFillAndHedgeSimulator(
        fillSource,
      ),
    );

  controller.start();
  controller.refreshPricingEvidence(
    NOW,
  );

  const bidOrder =
    controller
      .getLifecycleSnapshot(
        NOW,
      )
      .orders
      .find(
        (order) =>
          order.side ===
          "BID",
      );

  assert.ok(
    bidOrder,
  );

  makerQuote = {
    ...makerQuote,
    bestBidPrice:
      bidOrder.simulatedPrice,
    bestBidQty:
      0.2,
    bestAskPrice:
      bidOrder.simulatedPrice +
      0.01,
    timestamp:
      NOW +
      100,
  };
  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      90,
  };
  makerCapability = {
    ...makerCapability,
    synchronizedAt:
      NOW +
      90,
  };
  hedgeCapability = {
    ...hedgeCapability,
    synchronizedAt:
      NOW +
      90,
  };
  makerBook = {
    exchange:
      "bybit",
    market:
      MARKET,
    bids: [
      {
        price:
          bidOrder.simulatedPrice,
        quantity:
          0.2,
      },
    ],
    asks: [
      {
        price:
          bidOrder.simulatedPrice +
          0.01,
        quantity:
          1,
      },
    ],
    timestamp:
      NOW +
      80,
  };

  controller.refreshPricingEvidence(
    NOW +
      100,
  );

  let snapshot =
    controller.getFillAndHedgeSnapshot(
      NOW +
        100,
    );

  assert.equal(
    snapshot.fills.length,
    0,
  );
  assert.equal(
    snapshot.assessments.some(
      (assessment) =>
        assessment.orderId ===
          bidOrder.id &&
        assessment.blockers.includes(
          "PUBLIC_TRADE_TAPE_UNAVAILABLE",
        ) &&
        assessment.queueEvidence
          .initialQueueAheadQuantity ===
          0.2,
    ),
    true,
  );

  publicTradeReaderAvailable =
    true;

  controller.refreshPricingEvidence(
    NOW +
      110,
  );

  snapshot =
    controller.getFillAndHedgeSnapshot(
      NOW +
        110,
    );

  assert.equal(
    snapshot.assessments.some(
      (assessment) =>
        assessment.orderId ===
          bidOrder.id &&
        assessment.blockers.includes(
          "QUEUE_AHEAD_NOT_CONSUMED",
        ) &&
        assessment.queueEvidence
          .remainingQueueAheadQuantity ===
          0.2,
    ),
    true,
  );

  publicTrades = [
    trade(
      "partial",
      NOW +
        150,
      bidOrder.simulatedPrice,
      0.25,
      "SELL",
    ),
  ];
  makerQuote = {
    ...makerQuote,
    timestamp:
      NOW +
      200,
  };
  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      190,
  };
  makerCapability = {
    ...makerCapability,
    synchronizedAt:
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
  snapshot =
    controller.getFillAndHedgeSnapshot(
      NOW +
        200,
    );

  const partialFill =
    snapshot.fills[0];

  assert.ok(
    partialFill,
  );
  assert.equal(
    partialFill.simulatedFillQuantity,
    0.05,
  );
  assert.equal(
    partialFill.finalFillForOrder,
    false,
  );
  assert.equal(
    partialFill.partialFillModel,
    "PUBLIC_TRADE_FIFO_V21_5",
  );
  assert.equal(
    partialFill.queueEvidence
      ?.remainingQueueAheadQuantity,
    0,
  );
  assert.equal(
    partialFill.exchangeFill,
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
          bidOrder.id,
      )
      ?.status,
    "ACTIVE",
    "A partial SHADOW fill must not close the remaining simulated order.",
  );

  controller.refreshPricingEvidence(
    NOW +
      201,
  );
  assert.equal(
    controller
      .getFillAndHedgeSnapshot(
        NOW +
          201,
      )
      .fills.length,
    1,
    "The same public trade must not be consumed twice.",
  );

  publicTrades = [
    ...publicTrades,
    trade(
      "complete",
      NOW +
        250,
      bidOrder.simulatedPrice,
      0.05,
      "SELL",
    ),
  ];
  makerQuote = {
    ...makerQuote,
    timestamp:
      NOW +
      300,
  };
  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      290,
  };
  makerCapability = {
    ...makerCapability,
    synchronizedAt:
      NOW +
      290,
  };
  hedgeCapability = {
    ...hedgeCapability,
    synchronizedAt:
      NOW +
      290,
  };

  controller.refreshPricingEvidence(
    NOW +
      300,
  );
  snapshot =
    controller.getFillAndHedgeSnapshot(
      NOW +
        300,
    );

  assert.equal(
    snapshot.fills.length,
    2,
  );
  assert.equal(
    snapshot.fills[1]
      ?.simulatedFillQuantity,
    0.05,
  );
  assert.equal(
    snapshot.fills[1]
      ?.finalFillForOrder,
    true,
  );
  assert.equal(
    snapshot.hedgeIntents.length,
    2,
  );
  assert.equal(
    snapshot.safety
      .partialFillsSimulated,
    true,
  );
  assert.equal(
    snapshot.safety
      .queuePositionInferred,
    false,
  );
  assert.equal(
    snapshot.safety
      .fillProbabilityModeled,
    false,
  );
  assert.equal(
    snapshot.safety
      .paperExecutionAllowed,
    false,
  );
  assert.equal(
    snapshot.safety
      .liveExecutionAllowed,
    false,
  );
  assert.equal(
    snapshot.safety
      .orderSubmissionAllowed,
    false,
  );

  const analytics =
    controller
      .getShadowAnalyticsSnapshot(
        NOW +
          300,
      );

  assert.equal(
    analytics.summary
      .simulatedPartialFills,
    1,
  );
  assert.equal(
    analytics.summary
      .queueModeledFills,
    2,
  );
  assert.equal(
    analytics.readiness
      .paperEligible,
    false,
  );
  assert.equal(
    analytics.readiness
      .paperBlockers.includes(
        "QUEUE_AWARE_PARTIAL_FILL_EVIDENCE_REQUIRED",
      ),
    false,
  );
  assert.equal(
    analytics.readiness
      .paperBlockers.includes(
        "FILL_PROBABILITY_CALIBRATION_REQUIRED",
      ),
    true,
  );

  for (
    const forbiddenMethod
    of [
      "executeHedgeIntent",
      "placeMakerOrder",
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
}

function trade(
  id:
    string,
  occurredAt:
    number,
  price:
    number,
  quantity:
    number,
  aggressorSide:
    "BUY"
    | "SELL",
  exchange =
    "bybit",
): CrossExchangeMarketMakingPublicTrade {
  return {
    id,
    exchange,
    market:
      MARKET,
    price,
    quantity,
    occurredAt,
    aggressorSide,
    source:
      exchange ===
        "bybit"
        ? "BYBIT_PUBLIC_TRADE"
        : "BINANCE_AGG_TRADE",
  };
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
