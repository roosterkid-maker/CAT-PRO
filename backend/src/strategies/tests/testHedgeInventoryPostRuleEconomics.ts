import assert
  from "node:assert/strict";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import {
  HedgeInventoryMarketRuleEvaluator,
} from "../hedge-inventory-management/HedgeInventoryMarketRuleEvaluator";

import {
  HedgeInventoryPostRuleEconomicsEvaluator,
} from "../hedge-inventory-management/HedgeInventoryPostRuleEconomicsEvaluator";

import type {
  HedgeInventoryRouteCandidate,
  HedgeInventoryRouteEconomicsSnapshot,
  HedgeInventoryRouteEvidenceSnapshot,
  HedgeInventoryShadowRoute,
} from "../hedge-inventory-management/HedgeInventoryRouteEconomicsEvaluator";

const NOW =
  1_100;

function main():
  void {
  const configuration =
    createConfiguration(
      true,
    );

  assert.equal(
    configuration.version,
    "22.18",
  );

  assert.deepEqual(
    configuration.postRuleEconomics,
    {
      enabled:
        true,
      state:
        "READY",
      blockers:
        [],
    },
  );

  const routes =
    createRouteSnapshot();

  const marketRules =
    new HedgeInventoryMarketRuleEvaluator()
      .evaluate(
        configuration,
        routes,
        {
          generatedAt:
            1_080,
          capabilities: [
            createCapability(),
          ],
        },
        NOW,
      );

  assert.equal(
    marketRules.assessments[0]
      ?.quantizedQuantity,
    0.112,
    "V22.4 must conservatively round the original quantity before V22.5 revalidation.",
  );

  const evaluator =
    new HedgeInventoryPostRuleEconomicsEvaluator();

  const snapshot =
    evaluator.evaluate(
      configuration,
      routes,
      marketRules,
      createRouteEvidence(),
      NOW,
    );

  assert.equal(
    snapshot.version,
    "22.5",
  );

  assert.deepEqual(
    snapshot.summary,
    {
      marketRuleAssessments:
        1,
      routesRequiringRevalidation:
        1,
      routesRevalidated:
        1,
      routesRejected:
        0,
      blockedRoutes:
        0,
      changedQuantityRoutes:
        1,
      revalidatedFeeQuoteValue:
        1.680375,
      revalidatedSlippageQuoteValue:
        0.31,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
  );

  const assessment =
    snapshot.assessments[0];

  assert.ok(
    assessment,
  );

  assert.deepEqual(
    {
      state:
        assessment.state,
      venue:
        assessment.venue,
      market:
        assessment.market,
      originalQuantity:
        assessment.originalTargetQuantity,
      quantizedQuantity:
        assessment.quantizedQuantity,
      changed:
        assessment.quantityChanged,
      requestedQuantity:
        assessment.revalidatedEconomics.requestedQuantity,
      executableQuantity:
        assessment.revalidatedEconomics.executableQuantity,
      vwap:
        assessment.revalidatedEconomics.vwapPrice,
      allIn:
        assessment.revalidatedEconomics.modeledAllInQuoteValue,
      blockers:
        assessment.blockers,
      candidateBlockers:
        assessment.candidateBlockers,
    },
    {
      state:
        "REVALIDATED",
      venue:
        "coindcx",
      market:
        "BTCUSDT",
      originalQuantity:
        0.1125,
      quantizedQuantity:
        0.112,
      changed:
        true,
      requestedQuantity:
        0.112,
      executableQuantity:
        0.112,
      vwap:
        10_002.23214286,
      allIn:
        1_118.569625,
      blockers:
        [],
      candidateBlockers:
        [],
    },
    "V22.5 must keep the selected venue/market and recalculate exact quantized-quantity economics.",
  );

  assert.deepEqual(
    assessment.remainingGates,
    [
      "BASIS_CORRELATION_RISK_NOT_EVALUATED",
      "RISK_APPROVAL_NOT_EVALUATED",
      "CAPITAL_NOT_RESERVED",
      "STRATEGY_INTENT_NOT_GENERATED",
    ],
    "A revalidated route must remain non-actionable behind all later safety gates.",
  );

  const thinBook =
    createRouteEvidence();

  const rejected =
    evaluator.evaluate(
      configuration,
      routes,
      marketRules,
      {
        ...thinBook,
        candidates: [
          {
            ...thinBook.candidates[0]!,
            bids: [
              {
                price:
                  10_005,
                quantity:
                  0.05,
              },
            ],
          },
        ],
      },
      NOW,
    );

  assert.equal(
    rejected.assessments[0]
      ?.state,
    "REJECTED",
  );

  assert.deepEqual(
    rejected.assessments[0]
      ?.candidateBlockers,
    [
      "INSUFFICIENT_EXECUTABLE_DEPTH",
    ],
    "Reduced depth must fail closed during revalidation.",
  );

  const missingRoute =
    evaluator.evaluate(
      configuration,
      routes,
      marketRules,
      {
        generatedAt:
          1_090,
        candidates:
          [],
      },
      NOW,
    );

  assert.deepEqual(
    missingRoute.assessments[0]
      ?.blockers,
    [
      "ROUTE_EVIDENCE_NOT_FOUND",
    ],
  );

  const disabled =
    evaluator.evaluate(
      createConfiguration(
        false,
      ),
      routes,
      marketRules,
      createRouteEvidence(),
      NOW,
    );

  assert.deepEqual(
    disabled.blockers,
    [
      "POST_RULE_ECONOMICS_CONFIGURATION_NOT_READY",
    ],
    "V22.5 revalidation must remain explicitly opt-in.",
  );

  assert.deepEqual(
    evaluator.evaluate(
      configuration,
      routes,
      marketRules,
      {
        ...createRouteEvidence(),
        generatedAt:
          NOW + 1,
      },
      NOW,
    ).blockers,
    [
      "ROUTE_EVIDENCE_FROM_FUTURE",
    ],
  );

  assert.equal(
    snapshot.safety.readOnlyRevalidationEvidence,
    true,
  );
  assert.equal(
    snapshot.safety.revalidationIsExecutionApproval,
    false,
  );
  assert.equal(
    snapshot.safety.riskApprovalGranted,
    false,
  );
  assert.equal(
    snapshot.safety.capitalReserved,
    false,
  );
  assert.equal(
    snapshot.safety.paperExecutionAllowed,
    false,
  );
  assert.equal(
    snapshot.safety.liveExecutionAllowed,
    false,
  );
  assert.equal(
    snapshot.safety.orderSubmissionAllowed,
    false,
  );
  assert.equal(
    Object.isFrozen(snapshot),
    true,
  );
  assert.equal(
    Object.isFrozen(snapshot.assessments),
    true,
  );

  console.log(
    "Hedge inventory V22.5 post-rule economics revalidation tests passed.",
  );

  console.log(
    "Exact quantized quantities were re-evaluated with SHADOW evidence only; no risk approval, intent, capital reservation, PAPER, LIVE or order action occurred.",
  );
}

function createConfiguration(
  postRuleEconomicsEnabled:
    boolean,
) {
  return createHedgeInventoryManagementConfiguration({
    enabled:
      true,
    mode:
      "SHADOW",
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
    marketRules: {
      enabled:
        true,
      maximumCapabilityAgeMs:
        100,
      maximumQuantizationLossPercent:
        1,
    },
    postRuleEconomics: {
      enabled:
        postRuleEconomicsEnabled,
    },
  });
}

function createRouteSnapshot():
  HedgeInventoryRouteEconomicsSnapshot {
  const candidate =
    createOriginalCandidate();

  const route:
    HedgeInventoryShadowRoute = {
    id:
      "hedge-inventory-management:target:1000:BTC:route",
    targetId:
      "hedge-inventory-management:target:1000:BTC",
    asset:
      "BTC",
    quoteAsset:
      "USDT",
    side:
      "SELL",
    targetQuantity:
      0.1125,
    state:
      "SHADOW_ROUTE_MODELED",
    evidenceStatus:
      "AVAILABLE",
    candidates: [
      candidate,
    ],
    selectedCandidate:
      candidate,
    blockers: [
      "MARKET_RULES_NOT_EVALUATED",
      "BASIS_CORRELATION_RISK_NOT_EVALUATED",
      "RISK_APPROVAL_NOT_EVALUATED",
      "CAPITAL_NOT_RESERVED",
      "STRATEGY_INTENT_NOT_GENERATED",
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
    actionable:
      false,
    intentGenerated:
      false,
  };

  return {
    version:
      "22.3",
    strategyId:
      "hedge-inventory-management",
    generatedAt:
      1_090,
    evidenceStatus:
      "AVAILABLE",
    configurationState:
      "FOUNDATION_READY",
    routeEconomicsConfigurationState:
      "READY",
    sourceTargetGeneratedAt:
      1_085,
    sourceRouteEvidenceGeneratedAt:
      1_080,
    summary: {
      targetsRequiringRoute:
        1,
      candidatesEvaluated:
        1,
      candidatesPassingEconomics:
        1,
      shadowRoutesSelected:
        1,
      blockedTargets:
        0,
      modeledFeeQuoteValue:
        1.687875,
      modeledSlippageQuoteValue:
        0.3125,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
    routes: [
      route,
    ],
    blockers:
      [],
    notes:
      [],
    safety: {
      shadowRouteEvidenceOnly:
        true,
      routeSelectionIsExecutionApproval:
        false,
      marketRulesEvaluated:
        false,
      basisCorrelationRiskEvaluated:
        false,
      riskApprovalGranted:
        false,
      capitalReserved:
        false,
      hedgeIntentGenerationAllowed:
        false,
      recursiveHedgeAllowed:
        false,
      paperExecutionAllowed:
        false,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    },
  };
}

function createOriginalCandidate():
  HedgeInventoryRouteCandidate {
  return {
    venue:
      "coindcx",
    market:
      "BTCUSDT",
    asset:
      "BTC",
    quoteAsset:
      "USDT",
    side:
      "SELL",
    requestedQuantity:
      0.1125,
    evidenceStatus:
      "AVAILABLE",
    state:
      "ECONOMICS_PASS",
    orderBookTimestamp:
      1_075,
    orderBookAgeMs:
      25,
    bestPrice:
      10_005,
    vwapPrice:
      10_002.22222222,
    executableQuantity:
      0.1125,
    unfilledQuantity:
      0,
    grossNotionalQuoteValue:
      1_125.25,
    takerFeePercent:
      0.15,
    feeSource:
      "ACCOUNT_API",
    feeSynchronizedAt:
      1_075,
    feeExpiresAt:
      1_200,
    estimatedFeeQuoteValue:
      1.687875,
    slippagePercent:
      0.02776506,
    estimatedSlippageQuoteValue:
      0.3125,
    totalModeledFrictionQuoteValue:
      2.000375,
    modeledAllInQuoteValue:
      1_123.562125,
    blockers:
      [],
    executionAuthorized:
      false,
  };
}

function createRouteEvidence():
  HedgeInventoryRouteEvidenceSnapshot {
  return {
    generatedAt:
      1_090,
    candidates: [
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
          1_085,
        bids: [
          {
            price:
              10_005,
            quantity:
              0.05,
          },
          {
            price:
              10_000,
            quantity:
              0.1,
          },
        ],
        asks: [
          {
            price:
              10_010,
            quantity:
              0.2,
          },
        ],
        takerFeePercent:
          0.15,
        feeSource:
          "ACCOUNT_API",
        feeSynchronizedAt:
          1_085,
        feeExpiresAt:
          1_200,
      },
    ],
  };
}

function createCapability():
  ExchangeMarketCapability {
  return {
    exchange:
      "coindcx",
    market:
      "BTCUSDT",
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
        "IOC",
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
        null,
      maximumPrice:
        null,
      priceStep:
        0.01,
      pricePrecision:
        2,
    },
    quantity: {
      minimumQuantity:
        0.001,
      maximumQuantity:
        100,
      quantityStep:
        0.001,
      quantityPrecision:
        null,
    },
    notional: {
      minimumNotional:
        10,
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
      1_070,
    synchronizedAt:
      1_075,
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
