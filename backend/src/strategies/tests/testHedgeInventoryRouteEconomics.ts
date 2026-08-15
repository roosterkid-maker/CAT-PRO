import assert
  from "node:assert/strict";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import {
  HedgeInventoryRouteEconomicsEvaluator,
} from "../hedge-inventory-management/HedgeInventoryRouteEconomicsEvaluator";

import type {
  HedgeInventoryRouteEvidenceSnapshot,
} from "../hedge-inventory-management/HedgeInventoryRouteEconomicsEvaluator";

import type {
  HedgeInventoryShadowTarget,
  HedgeInventoryShadowTargetSnapshot,
} from "../hedge-inventory-management/HedgeInventoryShadowTargetPlanner";

const NOW =
  1_100;

function main():
  void {
  const configuration =
    createHedgeInventoryManagementConfiguration({
      enabled:
        true,
      mode:
        "SHADOW",
      valuationQuoteAsset:
        "USDT",
      assetAllowlist: [
        "BTC",
        "SOL",
      ],
      targetInventoryByAsset: {
        BTC:
          0.25,
        SOL:
          10,
      },
      maximumDeviationQuoteValue:
        100,
      exposureLimitQuoteValue:
        500,
      hedgeRatio:
        0.75,
      hedgeVenueAllowlist: [
        "binance",
        "coindcx",
      ],
      maximumExposureAgeMs:
        500,
      routeEconomics: {
        enabled:
          true,
        maximumOrderBookAgeMs:
          100,
        maximumFeeAgeMs:
          100,
        maximumSlippagePercent:
          0.5,
      },
    });

  assert.deepEqual(
    configuration.routeEconomics,
    {
      enabled:
        true,
      maximumOrderBookAgeMs:
        100,
      maximumFeeAgeMs:
        100,
      maximumSlippagePercent:
        0.5,
      state:
        "READY",
      blockers:
        [],
    },
  );

  const evaluator =
    new HedgeInventoryRouteEconomicsEvaluator();

  const snapshot =
    evaluator.evaluate(
      configuration,
      createTargetSnapshot(),
      createRouteEvidence(),
      NOW,
    );

  assert.equal(
    snapshot.version,
    "22.3",
  );

  assert.deepEqual(
    snapshot.summary,
    {
      targetsRequiringRoute:
        2,
      candidatesEvaluated:
        4,
      candidatesPassingEconomics:
        3,
      shadowRoutesSelected:
        2,
      blockedTargets:
        0,
      modeledFeeQuoteValue:
        1.800725,
      modeledSlippageQuoteValue:
        0.6625,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
  );

  const btc =
    getRoute(
      snapshot.routes,
      "BTC",
    );

  assert.equal(
    btc.state,
    "SHADOW_ROUTE_MODELED",
  );

  assert.deepEqual(
    {
      venue:
        btc.selectedCandidate?.venue,
      market:
        btc.selectedCandidate?.market,
      vwap:
        btc.selectedCandidate?.vwapPrice,
      gross:
        btc.selectedCandidate?.grossNotionalQuoteValue,
      fee:
        btc.selectedCandidate?.estimatedFeeQuoteValue,
      slippage:
        btc.selectedCandidate?.estimatedSlippageQuoteValue,
      allIn:
        btc.selectedCandidate?.modeledAllInQuoteValue,
      executionAuthorized:
        btc.selectedCandidate?.executionAuthorized,
    },
    {
      venue:
        "coindcx",
      market:
        "BTCUSDT",
      vwap:
        10002.22222222,
      gross:
        1125.25,
      fee:
        1.687875,
      slippage:
        0.3125,
      allIn:
        1123.562125,
      executionAuthorized:
        false,
    },
    "SELL must choose the highest net-proceeds full-depth route.",
  );

  assert.deepEqual(
    btc.blockers,
    [
      "MARKET_RULES_NOT_EVALUATED",
      "BASIS_CORRELATION_RISK_NOT_EVALUATED",
      "RISK_APPROVAL_NOT_EVALUATED",
      "CAPITAL_NOT_RESERVED",
      "STRATEGY_INTENT_NOT_GENERATED",
    ],
  );

  const sol =
    getRoute(
      snapshot.routes,
      "SOL",
    );

  assert.deepEqual(
    {
      selectedVenue:
        sol.selectedCandidate?.venue,
      vwap:
        sol.selectedCandidate?.vwapPrice,
      fee:
        sol.selectedCandidate?.estimatedFeeQuoteValue,
      slippage:
        sol.selectedCandidate?.estimatedSlippageQuoteValue,
      allIn:
        sol.selectedCandidate?.modeledAllInQuoteValue,
    },
    {
      selectedVenue:
        "binance",
      vwap:
        150.46666667,
      fee:
        0.11285,
      slippage:
        0.35,
      allIn:
        112.96285,
    },
    "BUY must choose the lowest all-in acquisition route.",
  );

  const stale =
    sol.candidates.find(
      (candidate) =>
        candidate.venue ===
        "coindcx",
    );

  assert.ok(stale);
  assert.equal(stale.state, "REJECTED");
  assert.deepEqual(
    stale.blockers,
    [
      "ORDER_BOOK_STALE",
      "FEE_EVIDENCE_STALE",
    ],
  );

  assert.equal(snapshot.safety.shadowRouteEvidenceOnly, true);
  assert.equal(snapshot.safety.routeSelectionIsExecutionApproval, false);
  assert.equal(snapshot.safety.hedgeIntentGenerationAllowed, false);
  assert.equal(snapshot.safety.paperExecutionAllowed, false);
  assert.equal(snapshot.safety.liveExecutionAllowed, false);
  assert.equal(snapshot.safety.orderSubmissionAllowed, false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.routes), true);
  assert.equal(Object.isFrozen(btc.selectedCandidate), true);

  const disabled =
    createHedgeInventoryManagementConfiguration({
      enabled:
        true,
      valuationQuoteAsset:
        "USDT",
      assetAllowlist: [
        "BTC",
      ],
      targetInventoryByAsset: {
        BTC:
          0.25,
      },
      maximumDeviationQuoteValue:
        100,
      exposureLimitQuoteValue:
        500,
      hedgeRatio:
        0.75,
      hedgeVenueAllowlist: [
        "binance",
      ],
      maximumExposureAgeMs:
        500,
    });

  assert.deepEqual(
    evaluator.evaluate(
      disabled,
      createTargetSnapshot(),
      createRouteEvidence(),
      NOW,
    ).blockers,
    [
      "ROUTE_ECONOMICS_CONFIGURATION_NOT_READY",
    ],
    "V22.3 route economics must remain opt-in even when the V22.2 foundation is ready.",
  );

  assert.throws(
    () => createHedgeInventoryManagementConfiguration({
      routeEconomics: {
        enabled:
          true,
        maximumSlippagePercent:
          100,
      },
    }),
    /less than 100/,
  );

  console.log(
    "Hedge inventory V22.3 route-economics tests passed.",
  );
}

function createTargetSnapshot():
  HedgeInventoryShadowTargetSnapshot {
  const targets = [
    createTarget(
      "BTC",
      "SELL",
      0.1125,
    ),
    createTarget(
      "SOL",
      "BUY",
      0.75,
    ),
  ];

  return {
    version:
      "22.2",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      1_090,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    sourceExposureGeneratedAt:
      1_090,
    sourcePortfolioGeneratedAt:
      1_000,
    sourceExpiresAt:
      1_500,
    summary: {
      configuredAssets:
        2,
      hedgeRequiredAssets:
        2,
      modeledTargets:
        2,
      notRequiredAssets:
        0,
      blockedAssets:
        0,
      totalModeledTargetQuoteValue:
        1_237.5,
      actionableTargets:
        0,
      intentsGenerated:
        0,
    },
    targets,
    blockers:
      [],
    notes:
      [],
    safety: {
      shadowTargetEvidenceOnly:
        true,
      targetIsHedgeProposal:
        false,
      targetIsStrategyIntent:
        false,
      venueSelectionAllowed:
        false,
      hedgeProposalGenerationAllowed:
        false,
      hedgeIntentGenerationAllowed:
        false,
      recursiveHedgeAllowed:
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

function createTarget(
  asset: string,
  side: "BUY" | "SELL",
  quantity: number,
): HedgeInventoryShadowTarget {
  return {
    id:
      `hedge-inventory-management:target:1000:${asset}`,
    asset,
    valuationQuoteAsset:
      "USDT",
    valuationPair:
      `${asset}USDT`,
    evidenceStatus:
      "AVAILABLE",
    state:
      "TARGET_MODELED",
    side,
    urgency:
      "NORMAL",
    sourceExposureState:
      "HEDGE_REVIEW",
    sourceDirection:
      side === "BUY" ? "DEFICIT" : "EXCESS",
    hedgeRatio:
      0.75,
    deviationQuantity:
      side === "BUY" ? -quantity / 0.75 : quantity / 0.75,
    deviationQuoteValue:
      quantity * (asset === "BTC" ? 10_000 : 150) / 0.75,
    modeledTargetQuantity:
      quantity,
    modeledTargetQuoteValue:
      quantity * (asset === "BTC" ? 10_000 : 150),
    modeledResidualDeviationQuantity:
      0,
    modeledResidualDeviationQuoteValue:
      0,
    modeledResidualState:
      "WITHIN_TARGET",
    candidateVenues: [
      "binance",
      "coindcx",
    ],
    selectedVenue:
      null,
    executionMarket:
      null,
    selectedPrice:
      null,
    executableQuantity:
      null,
    estimatedFeeQuoteValue:
      null,
    estimatedSlippageQuoteValue:
      null,
    totalEstimatedCostQuoteValue:
      null,
    executionAuthorized:
      false,
    automaticExecutionAllowed:
      false,
    blockers: [
      "HEDGE_VENUE_NOT_SELECTED",
      "EXECUTION_MARKET_NOT_VERIFIED",
      "EXECUTABLE_DEPTH_NOT_EVALUATED",
      "HEDGE_FEES_NOT_EVALUATED",
      "HEDGE_SLIPPAGE_NOT_EVALUATED",
      "BASIS_CORRELATION_RISK_NOT_EVALUATED",
      "RISK_APPROVAL_NOT_EVALUATED",
      "CAPITAL_NOT_RESERVED",
    ],
    recursionProtection: {
      sourceStrategyId:
        "hedge-inventory-management",
      parentIntentId:
        null,
      recursionDepth:
        0,
      maximumRecursionDepth:
        0,
      recursiveHedgeAllowed:
        false,
    },
  };
}

function createRouteEvidence():
  HedgeInventoryRouteEvidenceSnapshot {
  return {
    generatedAt:
      1_080,
    candidates: [
      {
        venue:
          "binance",
        market:
          "BTCUSDT",
        asset:
          "BTC",
        quoteAsset:
          "USDT",
        orderBookTimestamp:
          1_075,
        bids: [
          { price: 10_000, quantity: 0.05 },
          { price: 9_990, quantity: 0.1 },
        ],
        asks: [
          { price: 10_010, quantity: 0.2 },
        ],
        takerFeePercent:
          0.1,
        feeSource:
          "STATIC_CONFIG",
        feeSynchronizedAt:
          null,
        feeExpiresAt:
          null,
      },
      {
        venue:
          "coindcx",
        market:
          "BTCUSDT",
        asset:
          "BTC",
        quoteAsset:
          "USDT",
        orderBookTimestamp:
          1_070,
        bids: [
          { price: 10_005, quantity: 0.05 },
          { price: 10_000, quantity: 0.1 },
        ],
        asks: [
          { price: 10_010, quantity: 0.2 },
        ],
        takerFeePercent:
          0.15,
        feeSource:
          "ACCOUNT_API",
        feeSynchronizedAt:
          1_075,
        feeExpiresAt:
          1_200,
      },
      {
        venue:
          "binance",
        market:
          "SOLUSDT",
        asset:
          "SOL",
        quoteAsset:
          "USDT",
        orderBookTimestamp:
          1_075,
        bids: [
          { price: 149, quantity: 1 },
        ],
        asks: [
          { price: 150, quantity: 0.4 },
          { price: 151, quantity: 0.5 },
        ],
        takerFeePercent:
          0.1,
        feeSource:
          "PUBLIC_API",
        feeSynchronizedAt:
          1_075,
        feeExpiresAt:
          1_200,
      },
      {
        venue:
          "coindcx",
        market:
          "SOLUSDT",
        asset:
          "SOL",
        quoteAsset:
          "USDT",
        orderBookTimestamp:
          900,
        bids: [
          { price: 149, quantity: 1 },
        ],
        asks: [
          { price: 149.5, quantity: 1 },
        ],
        takerFeePercent:
          0.1,
        feeSource:
          "ACCOUNT_API",
        feeSynchronizedAt:
          900,
        feeExpiresAt:
          null,
      },
    ],
  };
}

function getRoute(
  routes: ReturnType<HedgeInventoryRouteEconomicsEvaluator["evaluate"]>["routes"],
  asset: string,
) {
  const route = routes.find((candidate) => candidate.asset === asset);
  assert.ok(route, `Expected ${asset} route.`);
  return route;
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
