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
  CrossExchangeMarketMakingMakerLifecycleSimulator,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingMakerLifecycleSimulator";

import type {
  CrossExchangeMarketMakingLifecycleSnapshot,
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
  1_810_000_000_000;

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
      NOW -
        200,
    );

  const source:
    CrossExchangeMarketMakingPricingEvidenceSource = {
    getQuote: (
      exchange,
      market,
    ) =>
      market !==
        MARKET
        ? null
        : exchange ===
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
            BTC_USDT:
              0.1,
          },
          maximumOrderAgeMs:
            1_000,
          minimumRepriceTicks:
            2,
        },
      },
      new CrossExchangeMarketMakingPriceEngine(
        source,
      ),
      new CrossExchangeMarketMakingMakerLifecycleSimulator({
        maximumRetainedOrders:
          50,
        maximumEventsPerOrder:
          10,
      }),
    );

  assert.deepEqual(
    controller
      .getConfiguration()
      .makerLifecycle,
    {
      enabled:
        true,
      quantityByMarket: {
        BTCUSDT:
          0.1,
      },
      maximumOrderAgeMs:
        1_000,
      minimumRepriceTicks:
        2,
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

  const placed =
    controller.getLifecycleSnapshot(
      NOW,
    );

  assert.equal(
    Object.isFrozen(
      placed,
    ),
    true,
  );

  assert.equal(
    placed.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    placed.activeOrderCount,
    2,
  );

  assert.deepEqual(
    placed.evaluations.map(
      (evaluation) =>
        evaluation.action,
    ),
    [
      "PLACED",
      "PLACED",
    ],
  );

  assert.equal(
    placed.orders.every(
      (order) =>
        order.mode ===
          "SHADOW" &&
        order.status ===
          "ACTIVE" &&
        order.simulatedQuantity ===
          0.1 &&
        order.simulatedNotional ===
          Number(
            (
              order.simulatedPrice *
              0.1
            ).toPrecision(
              15,
            ),
          ) &&
        order.events[0]
          ?.type ===
          "PLACED" &&
        order.safety.makerFillSimulated ===
          false &&
        order.safety.hedgeIntentGenerated ===
          false &&
        order.safety.cancelReplaceLatencyEvaluated ===
          false &&
        order.safety.capitalReserved ===
          false &&
        order.safety.exchangeOrderSubmitted ===
          false,
    ),
    true,
  );

  const initiallyPlacedOrderIds =
    placed.orders.map(
      (order) =>
        order.id,
    );

  hedgeQuote = {
    ...hedgeQuote,
    bestAskPrice:
      103.008,
    timestamp:
      NOW +
      90,
  };

  controller.refreshPricingEvidence(
    NOW +
      100,
  );

  const thresholdSafety =
    controller.getLifecycleSnapshot(
      NOW +
        100,
    );

  assert.deepEqual(
    thresholdSafety.evaluations.map(
      (evaluation) =>
        evaluation.action,
    ),
    [
      "MONITORED",
      "REPRICED",
    ],
    "An adverse one-tick ASK boundary change must bypass the configured two-tick reprice threshold.",
  );

  assert.equal(
    thresholdSafety.orders.some(
      (order) =>
        order.side ===
          "BID" &&
        order.status ===
          "ACTIVE" &&
        order.monitorCount ===
          1,
    ),
    true,
  );

  assert.equal(
    thresholdSafety.orders.some(
      (order) =>
        order.side ===
          "ASK" &&
        order.status ===
          "ACTIVE" &&
        order.events[0]
          ?.reason ===
          "SAFE_PRICE_BECAME_UNSAFE" &&
        initiallyPlacedOrderIds.includes(
          order.previousOrderId ??
            "",
        ),
    ),
    true,
  );

  const activeOrderIdsBeforeBroadReprice =
    thresholdSafety.orders
      .filter(
        (order) =>
          order.status ===
          "ACTIVE",
      )
      .map(
        (order) =>
          order.id,
      );

  hedgeQuote =
    quote(
      "binance",
      100.5,
      8,
      104,
      9,
      NOW +
        150,
    );

  controller.refreshPricingEvidence(
    NOW +
      200,
  );

  const repriced =
    controller.getLifecycleSnapshot(
      NOW +
        200,
    );

  assert.equal(
    repriced.activeOrderCount,
    2,
  );

  assert.equal(
    repriced.cancelledOrderCount,
    3,
  );

  assert.deepEqual(
    repriced.evaluations.map(
      (evaluation) =>
        evaluation.action,
    ),
    [
      "REPRICED",
      "REPRICED",
    ],
  );

  const replacementOrders =
    repriced.orders.filter(
      (order) =>
        order.status ===
        "ACTIVE",
    );

  assert.equal(
    replacementOrders.every(
      (order) =>
        order.revision >=
          1 &&
        activeOrderIdsBeforeBroadReprice.includes(
          order.previousOrderId ??
            "",
        ) &&
        order.events[0]
          ?.type ===
          "REPRICED",
    ),
    true,
    "Repricing must retain explicit cancel-then-replace lineage.",
  );

  assert.equal(
    repriced.orders
      .filter(
        (order) =>
          activeOrderIdsBeforeBroadReprice.includes(
            order.id,
          ),
      )
      .every(
        (order) =>
          order.status ===
            "CANCELLED" &&
          order.cancellationReason ===
            "REPRICE_REQUIRED" &&
          order.events.some(
            (event) =>
              event.type ===
              "CANCELLED",
          ),
      ),
    true,
  );

  makerCapability = {
    ...makerCapability,
    order: {
      ...makerCapability.order,
      supportsPostOnly:
        false,
    },
    synchronizedAt:
      NOW +
      250,
  };

  controller.refreshPricingEvidence(
    NOW +
      300,
  );

  const rejected =
    controller.getLifecycleSnapshot(
      NOW +
        300,
    );

  assert.equal(
    rejected.activeOrderCount,
    0,
  );

  assert.equal(
    rejected.evaluations.every(
      (evaluation) =>
        evaluation.action ===
          "CANCELLED" &&
        evaluation.pricingBlockers
          .includes(
            "MAKER_POST_ONLY_UNSUPPORTED",
          ) &&
        evaluation.lifecycleBlockers
          .includes(
            "SAFE_PRICE_EVIDENCE_REJECTED",
          ),
    ),
    true,
    "Loss of safe-price evidence must cancel every active SHADOW maker order.",
  );

  makerCapability =
    capability(
      NOW +
        350,
    );

  makerQuote = {
    ...makerQuote,
    timestamp:
      NOW +
      350,
  };

  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      360,
  };

  controller.refreshPricingEvidence(
    NOW +
      400,
  );

  assert.equal(
    controller
      .getLifecycleSnapshot(
        NOW +
          400,
      )
      .activeOrderCount,
    2,
  );

  makerQuote = {
    ...makerQuote,
    timestamp:
      NOW +
      1_390,
  };

  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      1_390,
  };

  makerCapability =
    capability(
      NOW +
        1_390,
    );

  controller.refreshPricingEvidence(
    NOW +
      1_400,
  );

  const agedOut =
    controller.getLifecycleSnapshot(
      NOW +
        1_400,
    );

  assert.equal(
    agedOut.activeOrderCount,
    0,
  );

  assert.equal(
    agedOut.evaluations.every(
      (evaluation) =>
        evaluation.action ===
        "CANCELLED",
    ),
    true,
  );

  assert.equal(
    agedOut.orders
      .slice(-2)
      .every(
        (order) =>
          order.cancellationReason ===
          "MAXIMUM_ORDER_AGE_EXCEEDED",
      ),
    true,
  );

  makerQuote = {
    ...makerQuote,
    timestamp:
      NOW +
      1_490,
  };

  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      1_490,
  };

  makerCapability =
    capability(
      NOW +
        1_490,
    );

  controller.refreshPricingEvidence(
    NOW +
      1_500,
  );

  makerCapability = {
    ...capability(
      NOW +
        1_590,
    ),
    quantity: {
      ...makerCapability.quantity,
      minimumQuantity:
        1,
    },
  };

  makerQuote = {
    ...makerQuote,
    timestamp:
      NOW +
      1_590,
  };

  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      1_590,
  };

  controller.refreshPricingEvidence(
    NOW +
      1_600,
  );

  const rulesRejected =
    controller.getLifecycleSnapshot(
      NOW +
        1_600,
    );

  assert.equal(
    rulesRejected.activeOrderCount,
    0,
  );

  assert.equal(
    rulesRejected.evaluations.every(
      (evaluation) =>
        evaluation.lifecycleBlockers
          .includes(
            "SHADOW_QUANTITY_OUTSIDE_RULES",
          ),
    ),
    true,
  );

  makerCapability =
    {
      ...capability(
        NOW +
          1_690,
      ),
      quantity: {
        ...capability(
          NOW +
            1_690,
        ).quantity,
        minimumQuantity:
          null,
      },
    };

  makerQuote = {
    ...makerQuote,
    timestamp:
      NOW +
      1_690,
  };

  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW +
      1_690,
  };

  controller.refreshPricingEvidence(
    NOW +
      1_700,
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
        1_700,
    );

  assert.ok(
    detail,
  );

  assert.equal(
    detail.lifecycle.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    (
      detail.lifecycle.value as
        CrossExchangeMarketMakingLifecycleSnapshot
    ).activeOrderCount,
    2,
    "The generic strategy API read model must expose immutable lifecycle evidence.",
  );

  controller.stop();

  const stopped =
    controller.getLifecycleSnapshot(
      Math.max(
        Date.now(),
        NOW +
          1_700,
      ),
    );

  assert.equal(
    stopped.activeOrderCount,
    0,
  );

  assert.equal(
    stopped.evaluations.every(
      (evaluation) =>
        evaluation.action ===
          "CANCELLED",
    ),
    true,
  );

  assert.equal(
    stopped.orders
      .slice(-2)
      .every(
        (order) =>
          order.cancellationReason ===
          "CONTROLLER_STOPPED",
      ),
    true,
  );

  for (
    const forbiddenMethod
    of [
      "simulateMakerFill",
      "createHedgeIntent",
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
    "Cross-exchange market-making lifecycle simulation test passed.",
  );

  console.log(
    "V21.2 simulated price/quantity lifecycle evidence only; no fill, hedge intent, PAPER, LIVE, capital reservation, or exchange order occurred.",
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
  synchronizedAt:
    number,
): ExchangeMarketCapability {
  return {
    exchange:
      "bybit",
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
      supportsPostOnly:
        true,
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
