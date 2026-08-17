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
  StrategyAttributionService,
} from "../services/StrategyAttributionService";

import {
  StrategyOrchestrator,
} from "../services/StrategyOrchestrator";

import {
  StrategyReadModelService,
} from "../services/StrategyReadModelService";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

import {
  CrossExchangeMarketMakingStrategyController,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingStrategyController";

import {
  CrossExchangeMarketMakingPriceEngine,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPriceEngine";

import {
  CrossExchangeMarketMakingInventoryRouteSelector,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingInventoryRouteSelector";

import type {
  CrossExchangeMarketMakingPricingEvidenceSource,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPriceEngine";

const NOW =
  1_800_000_000_000;

const MARKET =
  "BTCUSDT";

function main():
  void {
  const makerQuote =
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

  let makerFee:
    ExchangeFeeEvidence | null =
    fee(
      "bybit",
      0.1,
      0.1,
    );

  let hedgeFee:
    ExchangeFeeEvidence | null =
    fee(
      "binance",
      0.1,
      0.1,
    );

  let makerCapability =
    capability(
      NOW -
        200,
      true,
    );

  const source:
    CrossExchangeMarketMakingPricingEvidenceSource = {
    getQuote: (
      exchange,
      market,
    ) => {
      if (
        market !==
        MARKET
      ) {
        return null;
      }

      return exchange ===
        "bybit"
        ? makerQuote
        : exchange ===
            "binance"
          ? hedgeQuote
          : null;
    },

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
      exchange ===
        "bybit"
        ? makerFee
        : exchange ===
            "binance"
          ? hedgeFee
          : null,

    getCachedMakerCapability: (
      exchange,
      market,
    ) =>
      exchange ===
          "bybit" &&
        market ===
          MARKET
        ? makerCapability
        : null,
  };

  const engine =
    new CrossExchangeMarketMakingPriceEngine(
      source,
    );

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
      },
      engine,
    );

  const stopped =
    controller.refreshPricingEvidence(
      NOW,
    );

  assert.equal(
    stopped.length,
    1,
  );

  assert.equal(
    stopped[0]
      ?.results
      .every(
        (result) =>
          result.blockers
            .includes(
              "CONTROLLER_NOT_RUNNING",
            ),
      ),
    true,
    "A stopped controller must fail closed even when all market evidence is present.",
  );

  assert.equal(
    controller.getPricingSnapshots().length,
    0,
    "A stopped refresh must not publish or retain a pricing snapshot.",
  );

  let forwardedSignals =
    0;

  controller.subscribeToSignals(
    () => {
      forwardedSignals +=
        1;
    },
  );

  const attribution =
    new StrategyAttributionService(
      controller,
    );

  attribution.start();
  controller.start();

  const snapshots =
    controller.refreshPricingEvidence(
      NOW,
    );

  assert.equal(
    snapshots.length,
    1,
  );

  const snapshot =
    snapshots[0];

  assert.ok(
    snapshot,
  );

  assert.equal(
    Object.isFrozen(
      snapshot,
    ),
    true,
  );

  assert.deepEqual(
    snapshot.results.map(
      (result) =>
        result.status,
    ),
    [
      "ACCEPTED",
      "ACCEPTED",
    ],
  );

  const bid =
    snapshot.results[0]
      ?.evidence;

  const ask =
    snapshot.results[1]
      ?.evidence;

  assert.ok(
    bid,
  );

  assert.ok(
    ask,
  );

  assert.equal(
    bid.side,
    "BID",
  );

  assert.equal(
    bid.hedgeReferenceSide,
    "BID",
  );

  assert.equal(
    bid.hedgeReferencePrice,
    102,
    "A maker bid must use the executable hedge bid as its taker reference.",
  );

  assert.equal(
    bid.safeMakerPrice,
    100.99,
    "The maker bid must remain at least one verified tick below the maker ask.",
  );

  const expectedAskBoundary =
    103 *
    1.001 *
    1.002 /
    0.999;

  const expectedAskPrice =
    Number(
      (
        Math.ceil(
          expectedAskBoundary /
          0.01 -
          1e-12,
        ) *
        0.01
      ).toPrecision(
        15,
      ),
    );

  assert.equal(
    ask.hedgeReferenceSide,
    "ASK",
  );

  assert.equal(
    ask.hedgeReferencePrice,
    103,
    "A maker ask must use the executable hedge ask as its taker reference.",
  );

  assert.equal(
    ask.safeMakerPrice,
    expectedAskPrice,
  );

  assert.ok(
    bid.modeledRetainedEdgePercent >=
      0.2,
  );

  assert.ok(
    ask.modeledRetainedEdgePercent >=
      0.2,
  );

  assert.equal(
    bid.postOnlyRequired,
    true,
  );

  assert.equal(
    bid.quantitySizing,
    "NOT_EVALUATED_V21_1",
  );

  assert.equal(
    bid.fillProbability,
    "NOT_EVALUATED_V21_1",
  );

  assert.equal(
    bid.makerPlacement,
    "NOT_SIMULATED_V21_1",
  );

  assert.equal(
    bid.hedgeSlippage,
    "NOT_EVALUATED_V21_1",
  );

  const signals =
    controller.getSignals(
      NOW,
    );

  assert.equal(
    signals.length,
    2,
  );

  assert.equal(
    forwardedSignals,
    2,
  );

  assert.equal(
    signals.every(
      (signal) =>
        signal.kind ===
          "XEMM_SAFE_MAKER_PRICE" &&
        signal.source ===
          "XEMMPriceEngine" &&
        signal.executionAuthorized ===
          false &&
        signal.automaticExecutionAllowed ===
          false,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      signals[0]
        ?.evidence,
    ),
    true,
  );

  const inventorySelector =
    new CrossExchangeMarketMakingInventoryRouteSelector({
      getMarketCapability: (
        exchange,
        market,
      ) => ({
        ...capability(
          NOW,
          true,
        ),
        exchange,
        market,
      }),
      getBalance: (
        exchange,
        asset,
      ) => {
        const availableBalance =
          exchange === "bybit" && asset === "USDT"
            ? 1_000
            : exchange === "binance" && asset === "BTC"
              ? 1
              : 0;

        return {
          exchange,
          asset,
          availableBalance,
          lockedBalance: 0,
          totalBalance: availableBalance,
          synchronizedAt: NOW,
        };
      },
    });

  const inventoryGatedController =
    new CrossExchangeMarketMakingStrategyController(
      {
        enabled: true,
        makerExchange: "bybit",
        hedgeExchange: "binance",
        marketAllowlist: [MARKET],
        minimumRetainedEdgePercent: 0.2,
        maximumCapabilityAgeMs: 60_000,
        makerLifecycle: {
          enabled: true,
          quantityByMarket: {[MARKET]: 0.1},
          maximumOrderAgeMs: 30_000,
          minimumRepriceTicks: 1,
        },
      },
      engine,
      undefined,
      undefined,
      undefined,
      inventorySelector,
    );

  inventoryGatedController.start();
  inventoryGatedController.refreshPricingEvidence(NOW + 10);
  const fundedSignals = inventoryGatedController.getSignals(NOW + 10);
  assert.equal(fundedSignals.length, 1, "Only the funded XEMM direction may be published.");
  const fundedSignal = fundedSignals[0];
  assert.ok(fundedSignal && fundedSignal.kind === "XEMM_SAFE_MAKER_PRICE");
  assert.equal(fundedSignal.evidence.side, "BID");
  assert.equal(inventoryGatedController.getInventoryFeasibilitySnapshot(NOW + 10)?.summary.feasibleRoutes, 1);
  assert.equal(inventoryGatedController.getInventoryFeasibilitySnapshot(NOW + 10)?.summary.blockedRoutes, 1);
  inventoryGatedController.stop();

  assert.equal(
    attribution.resolve(
      NOW,
      "not-an-opportunity",
    ),
    null,
    "XEMM pricing signals must not be inferred into Strategy #1 opportunity attribution.",
  );

  const registry =
    new StrategyRegistry();

  registry.register(
    controller,
  );

  const readModel =
    new StrategyReadModelService(
      registry,
      new StrategyOrchestrator(
        registry,
      ),
    );

  const detail =
    readModel.getById(
      "cross-exchange-market-making",
      NOW,
    );

  assert.ok(
    detail,
  );

  assert.equal(
    detail.signals.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    detail.signals.records.length,
    2,
  );

  assert.equal(
    detail.safety.orderSubmissionAllowed,
    false,
  );

  const duplicate =
    controller.refreshPricingEvidence(
      NOW,
    );

  assert.equal(
    duplicate.length,
    1,
  );

  assert.equal(
    controller
      .getRuntimeSnapshot(
        NOW,
      )
      .duplicateSnapshotsIgnored,
    1,
  );

  makerCapability =
    capability(
      NOW -
        200,
      false,
    );

  const postOnlyRejected =
    controller.refreshPricingEvidence(
      NOW +
        1,
    );

  assert.equal(
    postOnlyRejected[0]
      ?.results
      .every(
        (result) =>
          result.status ===
            "REJECTED" &&
          result.blockers
            .includes(
              "MAKER_POST_ONLY_UNSUPPORTED",
            ),
      ),
    true,
  );

  assert.equal(
    controller.getSignals(
      NOW +
        1,
    ).length,
    0,
    "Rejected replacement evidence must clear prior safe-price signals.",
  );

  makerCapability =
    capability(
      NOW -
        200,
      true,
    );

  hedgeQuote = {
    ...hedgeQuote,
    timestamp:
      NOW -
      60_000,
  };

  const staleRejected =
    controller.refreshPricingEvidence(
      NOW +
        2,
    );

  assert.equal(
    staleRejected[0]
      ?.results
      .every(
        (result) =>
          result.blockers
            .includes(
              "QUOTES_NOT_FRESH_OR_SYNCHRONIZED",
            ),
      ),
    true,
  );

  hedgeQuote =
    quote(
      "binance",
      102,
      8,
      103,
      9,
      NOW,
    );

  makerFee =
    fee(
      "bybit",
      -0.01,
      0.1,
    );

  const rebateRejected =
    controller.refreshPricingEvidence(
      NOW +
        3,
    );

  assert.equal(
    rebateRejected[0]
      ?.results
      .every(
        (result) =>
          result.blockers
            .includes(
              "MAKER_FEE_EVIDENCE_INVALID",
            ),
      ),
    true,
    "V21.1 must reject negative maker fees because the current fee-evidence model does not verify rebates.",
  );

  makerFee =
    fee(
      "bybit",
      0.1,
      0.1,
    );

  hedgeFee =
    null;

  const missingFeeRejected =
    controller.refreshPricingEvidence(
      NOW +
        4,
    );

  assert.equal(
    missingFeeRejected[0]
      ?.results
      .every(
        (result) =>
          result.blockers
            .includes(
              "HEDGE_FEE_EVIDENCE_MISSING",
            ),
      ),
    true,
  );

  attribution.stop();
  controller.stop();

  for (
    const forbiddenMethod
    of [
      "placeMakerOrder",
      "simulateMakerOrder",
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
    "Cross-exchange market-making safe pricing test passed.",
  );

  console.log(
    "V21.1 emitted SHADOW evidence only; no quantity, placement, fill, hedge intent, PAPER, LIVE, capital, or order action occurred.",
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

  makerPercent:
    number,

  takerPercent:
    number,
): ExchangeFeeEvidence {
  return {
    exchange,
    makerPercent,
    takerPercent,
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

  supportsPostOnly:
    boolean,
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
        0.00001,
      maximumQuantity:
        100,
      quantityStep:
        0.00001,
      quantityPrecision:
        5,
    },
    notional: {
      minimumNotional:
        1,
      maximumNotional:
        null,
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
