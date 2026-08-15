import assert
  from "node:assert/strict";

import type {
  CrossExchangeMarketMakingConfiguration,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingFillAndHedgeSnapshot,
  CrossExchangeMarketMakingHedgeAssessment,
  CrossExchangeMarketMakingSimulatedFill,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingFillAndHedgeSimulator";

import type {
  CrossExchangeMarketMakingLifecycleSnapshot,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingMakerLifecycleSimulator";

import type {
  CrossExchangeMarketMakingPricingSnapshot,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPriceEngine";

import {
  CrossExchangeMarketMakingShadowAnalyticsService,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingShadowAnalyticsService";

import type {
  CrossExchangeMarketMakingHedgeStrategyIntent,
} from "../models/StrategyIntent";

const NOW =
  1_830_000_000_000;

const CONFIGURATION = {
  version:
    "21.5",
  strategyId:
    "cross-exchange-market-making",
  enabled:
    true,
  mode:
    "SHADOW",
  makerExchange:
    "bybit",
  hedgeExchange:
    "binance",
  venuePairs: [{
    key: "bybit>binance",
    priority: 0,
    makerExchange: "bybit",
    hedgeExchange: "binance",
  }],
  routeStability: {
    minimumConsecutivePasses: 3,
    minimumDwellMs: 2_000,
    failoverCooldownMs: 5_000,
  },
  marketAllowlist: [
    "BTCUSDT",
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
    state:
      "READY",
    blockers:
      [],
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
    queueAwarePartialFillsEnabled:
      false,
    maximumPublicTradeAgeMs:
      null,
    state:
      "READY",
    blockers:
      [],
  },
  state:
    "FOUNDATION_READY",
  blockers:
    [],
  safety: {
    shadowEvidenceOnly:
      true,
    makerPriceCalculationAllowed:
      true,
    makerOrderSimulationAllowed:
      true,
    makerFillSimulationAllowed:
      true,
    queueAwarePartialFillSimulationAllowed:
      true,
    hedgeIntentGenerationAllowed:
      true,
    operatorApprovedVenuePairsOnly:
      true,
    paperExecutionAllowed:
      false,
    liveExecutionAllowed:
      false,
    capitalReservationAllowed:
      false,
    orderSubmissionAllowed:
      false,
  },
} as const satisfies CrossExchangeMarketMakingConfiguration;

function main():
  void {
  const service =
    new CrossExchangeMarketMakingShadowAnalyticsService({
      minimumPricingEvaluationsPerRoute:
        4,
      minimumSimulatedFillsPerRoute:
        2,
      minimumHedgeReadyRatePercent:
        100,
    });

  const empty =
    service.getSnapshot(
      CONFIGURATION,
      NOW,
    );

  assert.equal(
    empty.evidenceStatus,
    "NO_DATA",
  );

  assert.equal(
    empty.readiness.state,
    "NO_DATA",
  );

  assert.equal(
    empty.routes.length,
    1,
  );

  const first =
    service.observe(
      [
        pricing(
          NOW,
          0.792,
        ),
      ],
      lifecycle(
        NOW,
      ),
      fillAndHedge(
        [
          fill(
            "fill-bid",
            "order-bid",
            "BID",
            100,
            NOW,
          ),
          fill(
            "fill-ask",
            "order-ask",
            "ASK",
            103,
            NOW,
          ),
        ],
        [
          hedge(
            "fill-bid",
            "SELL",
            102,
            "READY",
          ),
          hedge(
            "fill-ask",
            "BUY",
            101,
            "READY",
          ),
        ],
        [
          intent(
            "fill-bid",
            "order-bid",
            "BID",
            "SELL",
            100,
            102,
            NOW,
          ),
          intent(
            "fill-ask",
            "order-ask",
            "ASK",
            "BUY",
            103,
            101,
            NOW,
          ),
        ],
        NOW,
      ),
      CONFIGURATION,
      NOW,
    );

  const route =
    first.routes[0];

  assert.ok(
    route,
  );

  assert.equal(
    Object.isFrozen(
      first,
    ),
    true,
  );

  assert.equal(
    route.pricing.evaluations,
    2,
  );

  assert.equal(
    route.pricing.acceptedBid,
    1,
  );

  assert.equal(
    route.pricing.acceptedAsk,
    1,
  );

  assert.equal(
    route.lifecycle.placed,
    2,
  );

  assert.equal(
    route.fills.simulatedFullFills,
    2,
  );

  assert.equal(
    route.hedges.ready,
    2,
  );

  assert.equal(
    route.economics
      .modeledHedgedFills,
    2,
  );

  assert.equal(
    route.economics
      .classification,
    "MODELED_SHADOW_ECONOMICS_NOT_REALIZED_PNL",
  );

  assert.ok(
    (
      route.economics
        .modeledRetainedQuoteValue ??
      0
    ) >
      0,
  );

  assert.equal(
    first.readiness.state,
    "COLLECTING",
    "The first snapshot has too few pricing evaluations for readiness.",
  );

  const second =
    service.observe(
      [
        pricing(
          NOW +
            100,
          0.8,
        ),
      ],
      lifecycle(
        NOW,
      ),
      fillAndHedge(
        [
          fill(
            "fill-bid",
            "order-bid",
            "BID",
            100,
            NOW,
          ),
          fill(
            "fill-ask",
            "order-ask",
            "ASK",
            103,
            NOW,
          ),
        ],
        [
          hedge(
            "fill-bid",
            "SELL",
            102,
            "READY",
          ),
          hedge(
            "fill-ask",
            "BUY",
            101,
            "READY",
          ),
        ],
        [],
        NOW +
          100,
      ),
      CONFIGURATION,
      NOW +
        100,
    );

  assert.equal(
    second.summary
      .pricingEvaluations,
    4,
  );

  assert.equal(
    second.summary
      .simulatedFills,
    2,
    "Cumulative fill evidence must not be counted twice.",
  );

  assert.equal(
    second.readiness.state,
    "SHADOW_EVIDENCE_SUFFICIENT",
  );

  assert.equal(
    second.readiness
      .shadowEvidenceSufficient,
    true,
  );

  assert.equal(
    second.readiness
      .paperEligible,
    false,
  );

  assert.equal(
    second.readiness
      .liveEligible,
    false,
  );

  assert.deepEqual(
    second.readiness
      .paperBlockers,
    [
      "QUEUE_AWARE_PARTIAL_FILL_EVIDENCE_REQUIRED",
      "REAL_MAKER_FILL_EVIDENCE_REQUIRED",
      "FILL_PROBABILITY_CALIBRATION_REQUIRED",
      "HEDGE_BALANCE_EVIDENCE_REQUIRED",
      "HEDGE_DEPTH_AND_SLIPPAGE_EVIDENCE_REQUIRED",
      "HEDGE_FAILURE_RECOVERY_EVIDENCE_REQUIRED",
      "PAPER_EXECUTION_NOT_AUTHORIZED_V21_5",
    ],
  );

  const third =
    service.observe(
      [
        pricing(
          NOW +
            200,
          0.81,
        ),
      ],
      lifecycle(
        NOW,
      ),
      fillAndHedge(
        [
          fill(
            "fill-bid",
            "order-bid",
            "BID",
            100,
            NOW,
          ),
          fill(
            "fill-ask",
            "order-ask",
            "ASK",
            103,
            NOW,
          ),
          fill(
            "fill-blocked",
            "order-blocked",
            "BID",
            100,
            NOW +
              200,
          ),
        ],
        [
          hedge(
            "fill-bid",
            "SELL",
            102,
            "READY",
          ),
          hedge(
            "fill-ask",
            "BUY",
            101,
            "READY",
          ),
          hedge(
            "fill-blocked",
            "SELL",
            102,
            "BLOCKED",
          ),
        ],
        [],
        NOW +
          200,
      ),
      CONFIGURATION,
      NOW +
        200,
    );

  assert.equal(
    third.routes[0]
      ?.hedges.readyRatePercent,
    66.666666666667,
  );

  assert.equal(
    third.readiness.state,
    "COLLECTING",
    "A later blocked hedge must revoke the analytics milestone fail-closed.",
  );

  assert.equal(
    third.routes[0]
      ?.hedges.blockers[0]
      ?.key,
    "HEDGE_TOP_OF_BOOK_QUANTITY_INSUFFICIENT",
  );

  assert.equal(
    third.safety
      .modeledEconomicsAreRealizedPnl,
    false,
  );

  assert.equal(
    third.safety
      .paperExecutionAllowed,
    false,
  );

  assert.equal(
    third.safety
      .orderSubmissionAllowed,
    false,
  );

  console.log(
    "Cross-exchange market-making SHADOW analytics test passed.",
  );

  console.log(
    "V21.5 readiness remained evidence-only; modeled economics were not realized P&L and no PAPER, LIVE, capital, balance, recovery, or order action occurred.",
  );
}

function pricing(
  generatedAt:
    number,
  modeledRetainedEdgePercent:
    number,
): CrossExchangeMarketMakingPricingSnapshot {
  const evidence = (
    side:
      "BID"
      | "ASK",
  ) => ({
    market:
      "BTCUSDT",
    side,
    makerExchange:
      "bybit",
    hedgeExchange:
      "binance",
    makerBestBidPrice:
      99,
    makerBestBidQuantity:
      5,
    makerBestAskPrice:
      104,
    makerBestAskQuantity:
      5,
    hedgeReferenceSide:
      side ===
        "BID"
        ? "BID" as const
        : "ASK" as const,
    hedgeReferencePrice:
      side ===
        "BID"
        ? 102
        : 101,
    hedgeReferenceQuantity:
      5,
    economicBoundaryPrice:
      side ===
        "BID"
        ? 101.5
        : 101.5,
    passiveBoundaryPrice:
      side ===
        "BID"
        ? 103.99
        : 99.01,
    safeMakerPrice:
      side ===
        "BID"
        ? 100
        : 103,
    priceStep:
      0.01,
    minimumRetainedEdgePercent:
      0.2,
    modeledRetainedEdgePercent,
    makerFee: {
      percent:
        0.1,
      source:
        "STATIC_CONFIG" as const,
      market:
        "BTCUSDT",
      synchronizedAt:
        null,
      expiresAt:
        null,
    },
    hedgeTakerFee: {
      percent:
        0.1,
      source:
        "STATIC_CONFIG" as const,
      market:
        "BTCUSDT",
      synchronizedAt:
        null,
      expiresAt:
        null,
    },
    makerQuoteTimestamp:
      generatedAt,
    hedgeQuoteTimestamp:
      generatedAt,
    makerQuoteAgeMs:
      0,
    hedgeQuoteAgeMs:
      0,
    timestampSkewMs:
      0,
    maximumPairSkewMs:
      1_000,
    makerCapabilitySynchronizedAt:
      generatedAt,
    maximumCapabilityAgeMs:
      60_000,
    postOnlyRequired:
      true as const,
    configuredMakerQuantity:
      null,
    pricingModel:
      "ONE_BASE_UNIT_QUOTE_VALUE_PERCENT_V21_1" as const,
    quantitySizing:
      "NOT_EVALUATED_V21_1" as const,
    queuePosition:
      "NOT_EVALUATED_V21_1" as const,
    fillProbability:
      "NOT_EVALUATED_V21_1" as const,
    makerPlacement:
      "NOT_SIMULATED_V21_1" as const,
    hedgeSlippage:
      "NOT_EVALUATED_V21_1" as const,
  });

  return {
    version:
      "21.5",
    strategyId:
      "cross-exchange-market-making",
    generatedAt,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    controllerRunning:
      true,
    market:
      "BTCUSDT",
    makerExchange:
      "bybit",
    hedgeExchange:
      "binance",
    inputs: {
      makerQuote:
        null,
      hedgeQuote:
        null,
      freshness:
        null,
      makerFee:
        null,
      hedgeFee:
        null,
      makerCapability:
        null,
    },
    results: [
      {
        side:
          "BID",
        status:
          "ACCEPTED",
        blockers:
          [],
        expiresAt:
          generatedAt +
          1_000,
        evidence:
          evidence(
            "BID",
          ),
      },
      {
        side:
          "ASK",
        status:
          "ACCEPTED",
        blockers:
          [],
        expiresAt:
          generatedAt +
          1_000,
        evidence:
          evidence(
            "ASK",
          ),
      },
    ],
    safety: {
      shadowEvidenceOnly:
        true,
      postOnlyRequired:
        true,
      quantitySizingEvaluated:
        false,
      placementSimulated:
        false,
      fillSimulated:
        false,
      hedgeIntentGenerated:
        false,
      executionAuthorized:
        false,
      orderSubmissionAllowed:
        false,
    },
  };
}

function lifecycle(
  generatedAt:
    number,
): CrossExchangeMarketMakingLifecycleSnapshot {
  const event = (
    id:
      string,
    orderId:
      string,
  ) => ({
    id,
    orderId,
    type:
      "PLACED" as const,
    reason:
      "INITIAL_SAFE_PRICE" as const,
    occurredAt:
      generatedAt,
    previousOrderId:
      null,
    fromPrice:
      null,
    toPrice:
      100,
    pricingBlockers:
      [],
    lifecycleBlockers:
      [],
    exchangeAcknowledgement:
      "NOT_APPLICABLE_SHADOW" as const,
  });

  const order = (
    id:
      string,
    side:
      "BID"
      | "ASK",
  ) => ({
    id,
    strategyId:
      "cross-exchange-market-making" as const,
    mode:
      "SHADOW" as const,
    market:
      "BTCUSDT",
    side,
    makerExchange:
      "bybit",
    hedgeExchange:
      "binance",
    status:
      "SIMULATED_FILLED" as const,
    simulatedPrice:
      side ===
        "BID"
        ? 100
        : 103,
    simulatedQuantity:
      0.1,
    simulatedNotional:
      side ===
        "BID"
        ? 10
        : 10.3,
    priceStep:
      0.01,
    revision:
      1,
    previousOrderId:
      null,
    placedAt:
      generatedAt,
    revisionStartedAt:
      generatedAt,
    lastEvaluatedAt:
      generatedAt,
    cancelledAt:
      null,
    cancellationReason:
      null,
    sourcePriceGeneratedAt:
      generatedAt,
    sourceSignalId:
      `signal-${side}`,
    sourcePriceExpiresAt:
      generatedAt +
      1_000,
    monitorCount:
      0,
    events: [
      event(
        `event-${side}`,
        id,
      ),
    ],
    safety: {
      nonFillShadowLifecycle:
        true as const,
      makerFillSimulated:
        false as const,
      hedgeIntentGenerated:
        false as const,
      hedgeCapacityEvaluated:
        false as const,
      queuePositionEvaluated:
        false as const,
      fillProbabilityEvaluated:
        false as const,
      cancelReplaceLatencyEvaluated:
        false as const,
      inventoryReserved:
        false as const,
      capitalReserved:
        false as const,
      exchangeOrderSubmitted:
        false as const,
      executionAuthorized:
        false as const,
    },
  });

  const orders = [
    order(
      "order-bid",
      "BID",
    ),
    order(
      "order-ask",
      "ASK",
    ),
  ];

  return {
    version:
      "21.5",
    strategyId:
      "cross-exchange-market-making",
    generatedAt,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "READY",
    controllerRunning:
      true,
    activeOrderCount:
      0,
    cancelledOrderCount:
      0,
    retainedOrderCount:
      2,
    totalOrdersObserved:
      2,
    totalEventsObserved:
      2,
    evaluations:
      [],
    orders,
    safety: {
      shadowSimulationOnly:
        true,
      userConfiguredQuantityRequired:
        true,
      verifiedMarketRulesRequired:
        true,
      cancelThenReplaceModel:
        true,
      fillsEvaluated:
        false,
      hedgeIntentsAllowed:
        false,
      paperExecutionAllowed:
        false,
      liveExecutionAllowed:
        false,
      capitalReservationAllowed:
        false,
      orderSubmissionAllowed:
        false,
    },
  };
}

function fillAndHedge(
  fills:
    readonly CrossExchangeMarketMakingSimulatedFill[],
  hedgeAssessments:
    readonly CrossExchangeMarketMakingHedgeAssessment[],
  hedgeIntents:
    readonly CrossExchangeMarketMakingHedgeStrategyIntent[],
  generatedAt:
    number,
): CrossExchangeMarketMakingFillAndHedgeSnapshot {
  return {
    version:
      "21.5",
    strategyId:
      "cross-exchange-market-making",
    generatedAt,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "READY",
    controllerRunning:
      true,
    assessments:
      [],
    fills,
    hedgeAssessments,
    hedgeIntents,
    newlyFilledOrderIds:
      [],
    safety: {
      shadowOnly:
        true,
      touchIsFill:
        false,
      postPlacementEvidenceRequired:
        true,
      tradeThroughRequired:
        true,
      partialFillsSimulated:
        false,
      queuePositionInferred:
        false,
      queuePositionModeledConservatively:
        false,
      publicTradeEvidenceRequiredForQueueModel:
        true,
      fillProbabilityModeled:
        false,
      hedgeBalanceChecked:
        false,
      hedgeExecutionAllowed:
        false,
      paperExecutionAllowed:
        false,
      liveExecutionAllowed:
        false,
      capitalReservationAllowed:
        false,
      orderSubmissionAllowed:
        false,
    },
  };
}

function fill(
  id:
    string,
  orderId:
    string,
  makerSide:
    "BID"
    | "ASK",
  simulatedFillPrice:
    number,
  simulatedAt:
    number,
): CrossExchangeMarketMakingSimulatedFill {
  return {
    id,
    strategyId:
      "cross-exchange-market-making",
    orderId,
    sourceSignalId:
      `signal-${id}`,
    market:
      "BTCUSDT",
    makerExchange:
      "bybit",
    hedgeExchange:
      "binance",
    makerSide,
    simulatedFillPrice,
    simulatedFillQuantity:
      0.1,
    simulatedFillNotional:
      simulatedFillPrice *
      0.1,
    simulatedAt,
    proofQuoteTimestamp:
      simulatedAt,
    proofTopOfBookPrice:
      makerSide ===
        "BID"
        ? simulatedFillPrice -
          0.01
        : simulatedFillPrice +
          0.01,
    requiredTradeThroughTicks:
      1,
    observedTradeThroughTicks:
      1,
    method:
      "FRESH_POST_RESTING_TOP_OF_BOOK_MOVE_THROUGH_V21_3",
    quantityModel:
      "FULL_CONFIGURED_QUANTITY_OR_NO_FILL",
    partialFillModel:
      "NOT_AVAILABLE_V21_3",
    queuePosition:
      "UNKNOWN_NOT_INFERRED",
    fillProbability:
      "NOT_MODELED",
    finalFillForOrder:
      true,
    queueEvidence:
      null,
    exchangeFill:
      false,
    executionAuthorized:
      false,
  };
}

function hedge(
  fillId:
    string,
  hedgeSide:
    "BUY"
    | "SELL",
  hedgeReferencePrice:
    number,
  status:
    "READY"
    | "BLOCKED",
): CrossExchangeMarketMakingHedgeAssessment {
  return {
    fillId,
    evaluatedAt:
      NOW,
    status,
    hedgeExchange:
      "binance",
    hedgeSide,
    hedgeReferencePrice,
    hedgeReferenceQuantity:
      status ===
        "READY"
        ? 1
        : 0.05,
    requiredQuantity:
      0.1,
    blockers:
      status ===
        "READY"
        ? []
        : [
            "HEDGE_TOP_OF_BOOK_QUANTITY_INSUFFICIENT",
          ],
    balanceEvidence:
      "NOT_EVALUATED_V21_3",
    executionAuthorized:
      false,
  };
}

function intent(
  simulatedFillId:
    string,
  makerOrderId:
    string,
  makerSide:
    "BID"
    | "ASK",
  hedgeSide:
    "BUY"
    | "SELL",
  simulatedMakerFillPrice:
    number,
  hedgeReferencePrice:
    number,
  createdAt:
    number,
): CrossExchangeMarketMakingHedgeStrategyIntent {
  return {
    id:
      `intent-${simulatedFillId}`,
    strategyId:
      "cross-exchange-market-making",
    signalId:
      `signal-${simulatedFillId}`,
    kind:
      "PROPOSED_STRATEGY_ACTION",
    proposedMode:
      "SHADOW",
    proposalType:
      "XEMM_HEDGE_AFTER_SIMULATED_MAKER_FILL",
    proposedCapital:
      null,
    createdAt,
    expiresAt:
      createdAt +
      500,
    status:
      "PROPOSED",
    executionAuthorized:
      false,
    automaticExecutionAllowed:
      false,
    evidence: {
      type:
        "XEMM_HEDGE_AFTER_SIMULATED_MAKER_FILL",
      simulatedFillId,
      makerOrderId,
      market:
        "BTCUSDT",
      makerExchange:
        "bybit",
      makerSide,
      simulatedMakerFillPrice,
      simulatedQuantity:
        0.1,
      hedgeExchange:
        "binance",
      hedgeSide,
      hedgeReferencePrice,
      hedgeReferenceQuantity:
        1,
      hedgeTakerFeePercent:
        0.1,
      hedgeTakerFeeSource:
        "STATIC_CONFIG",
      hedgeCapacityStatus:
        "FULL_TOP_OF_BOOK_CAPACITY_VERIFIED",
      balanceEvidence:
        "NOT_EVALUATED_V21_3",
      hedgeSlippageBeyondTop:
        "NOT_EVALUATED_V21_3",
      recoveryExecution:
        "NOT_AUTHORIZED_V21_3",
    },
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
