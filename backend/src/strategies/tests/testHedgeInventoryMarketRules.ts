import assert
  from "node:assert/strict";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  HedgeInventoryMarketRuleEvaluator,
} from "../hedge-inventory-management/HedgeInventoryMarketRuleEvaluator";

import {
  createHedgeInventoryManagementConfiguration,
} from "../hedge-inventory-management/HedgeInventoryManagementConfiguration";

import type {
  HedgeInventoryRouteCandidate,
  HedgeInventoryRouteEconomicsSnapshot,
  HedgeInventoryShadowRoute,
} from "../hedge-inventory-management/HedgeInventoryRouteEconomicsEvaluator";

const NOW =
  1_100;

function main():
  void {
  const configuration =
    createConfiguration();

  assert.equal(
    configuration.version,
    "22.18",
  );

  assert.deepEqual(
    configuration.marketRules,
    {
      enabled:
        true,
      maximumCapabilityAgeMs:
        100,
      maximumQuantizationLossPercent:
        1,
      state:
        "READY",
      blockers:
        [],
    },
  );

  const evaluator =
    new HedgeInventoryMarketRuleEvaluator();

  const routes =
    createRouteSnapshot();

  const capabilities = [
    createCapability({
      exchange:
        "coindcx",
      market:
        "BTCUSDT",
      baseAsset:
        "BTC",
      quantityStep:
        0.001,
      minimumNotional:
        10,
    }),
    createCapability({
      exchange:
        "binance",
      market:
        "SOLUSDT",
      baseAsset:
        "SOL",
      quantityStep:
        0.01,
      minimumNotional:
        200,
    }),
  ];

  const snapshot =
    evaluator.evaluate(
      configuration,
      routes,
      {
        generatedAt:
          1_080,
        capabilities,
      },
      NOW,
    );

  assert.equal(snapshot.version, "22.4");
  assert.equal(snapshot.evidenceStatus, "AVAILABLE");
  assert.deepEqual(
    snapshot.summary,
    {
      shadowRoutesSelected:
        2,
      capabilitiesEvaluated:
        2,
      feasibleRoutes:
        1,
      rejectedRoutes:
        1,
      blockedRoutes:
        1,
      totalOriginalQuantity:
        0.8625,
      totalQuantizedQuantity:
        0.862,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
  );

  const btc =
    getAssessment(
      snapshot.assessments,
      "BTC",
    );

  assert.deepEqual(
    {
      state:
        btc.state,
      venue:
        btc.venue,
      original:
        btc.originalTargetQuantity,
      quantized:
        btc.quantizedQuantity,
      loss:
        btc.quantizationLossQuantity,
      lossPercent:
        btc.quantizationLossPercent,
      notional:
        btc.modeledNotionalQuoteValue,
      blockers:
        btc.blockers,
    },
    {
      state:
        "RULES_PASS",
      venue:
        "coindcx",
      original:
        0.1125,
      quantized:
        0.112,
      loss:
        0.0005,
      lossPercent:
        0.44444444,
      notional:
        1120.24888889,
      blockers:
        [],
    },
  );

  assert.deepEqual(
    btc.remainingGates,
    [
      "ROUTE_ECONOMICS_REVALIDATION_REQUIRED",
      "BASIS_CORRELATION_RISK_NOT_EVALUATED",
      "RISK_APPROVAL_NOT_EVALUATED",
      "CAPITAL_NOT_RESERVED",
      "STRATEGY_INTENT_NOT_GENERATED",
    ],
    "Rounding feasibility must not silently reuse the original route economics.",
  );

  const sol =
    getAssessment(
      snapshot.assessments,
      "SOL",
    );

  assert.equal(sol.state, "RULES_REJECTED");
  assert.deepEqual(
    sol.blockers,
    [
      "NOTIONAL_BELOW_MINIMUM",
    ],
  );

  const xrp =
    getAssessment(
      snapshot.assessments,
      "XRP",
    );

  assert.equal(xrp.state, "BLOCKED");
  assert.deepEqual(xrp.blockers, ["SHADOW_ROUTE_UNAVAILABLE"]);

  assert.equal(snapshot.safety.readOnlyMarketRuleEvidence, true);
  assert.equal(snapshot.safety.feasibilityIsExecutionApproval, false);
  assert.equal(snapshot.safety.quantityQuantizationIsExecutionInstruction, false);
  assert.equal(snapshot.safety.riskApprovalGranted, false);
  assert.equal(snapshot.safety.capitalReserved, false);
  assert.equal(snapshot.safety.hedgeIntentGenerationAllowed, false);
  assert.equal(snapshot.safety.paperExecutionAllowed, false);
  assert.equal(snapshot.safety.liveExecutionAllowed, false);
  assert.equal(snapshot.safety.orderSubmissionAllowed, false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.assessments), true);
  assert.equal(Object.isFrozen(btc.rules), true);

  const stale =
    evaluator.evaluate(
      configuration,
      singleRouteSnapshot(routes, "BTC"),
      {
        generatedAt:
          1_080,
        capabilities: [
          {
            ...capabilities[0]!,
            synchronizedAt:
              900,
          },
        ],
      },
      NOW,
    );

  assert.deepEqual(
    stale.assessments[0]?.blockers,
    [
      "CAPABILITY_STALE",
    ],
  );

  const disabledMarketRules =
    createHedgeInventoryManagementConfiguration({
      ...createConfigurationInput(),
      marketRules: {
        enabled:
          false,
      },
    });

  assert.deepEqual(
    evaluator.evaluate(
      disabledMarketRules,
      routes,
      {
        generatedAt:
          1_080,
        capabilities,
      },
      NOW,
    ).blockers,
    [
      "MARKET_RULE_CONFIGURATION_NOT_READY",
    ],
  );

  assert.deepEqual(
    evaluator.evaluate(
      configuration,
      routes,
      {
        generatedAt:
          NOW + 1,
        capabilities,
      },
      NOW,
    ).blockers,
    [
      "MARKET_RULE_EVIDENCE_FROM_FUTURE",
    ],
  );

  assert.throws(
    () => createHedgeInventoryManagementConfiguration({
      marketRules: {
        enabled:
          true,
        maximumQuantizationLossPercent:
          100,
      },
    }),
    /less than 100/,
  );

  console.log(
    "Hedge inventory V22.4 market-rule feasibility tests passed.",
  );
}

function createConfiguration() {
  return createHedgeInventoryManagementConfiguration(
    createConfigurationInput(),
  );
}

function createConfigurationInput() {
  return {
    enabled:
      true,
    mode:
      "SHADOW" as const,
    valuationQuoteAsset:
      "USDT",
    assetAllowlist: [
      "BTC",
      "SOL",
      "XRP",
    ],
    targetInventoryByAsset: {
      BTC:
        0.25,
      SOL:
        10,
      XRP:
        100,
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
    marketRules: {
      enabled:
        true,
      maximumCapabilityAgeMs:
        100,
      maximumQuantizationLossPercent:
        1,
    },
  };
}

function createRouteSnapshot():
  HedgeInventoryRouteEconomicsSnapshot {
  const btcCandidate =
    createCandidate(
      "coindcx",
      "BTCUSDT",
      "BTC",
      "SELL",
      0.1125,
      10_002.22222222,
    );

  const solCandidate =
    createCandidate(
      "binance",
      "SOLUSDT",
      "SOL",
      "BUY",
      0.75,
      150.46666667,
    );

  const routes: HedgeInventoryShadowRoute[] = [
    createRoute("BTC", "SELL", 0.1125, btcCandidate),
    createRoute("SOL", "BUY", 0.75, solCandidate),
    createRoute("XRP", "SELL", 10, null),
  ];

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
        3,
      candidatesEvaluated:
        2,
      candidatesPassingEconomics:
        2,
      shadowRoutesSelected:
        2,
      blockedTargets:
        1,
      modeledFeeQuoteValue:
        1.8,
      modeledSlippageQuoteValue:
        0.66,
      actionableRoutes:
        0,
      intentsGenerated:
        0,
    },
    routes,
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

function createRoute(
  asset: string,
  side: "BUY" | "SELL",
  quantity: number,
  selectedCandidate: HedgeInventoryRouteCandidate | null,
): HedgeInventoryShadowRoute {
  const routeId =
    `hedge-inventory-management:target:1000:${asset}:route`;

  return {
    id:
      routeId,
    targetId:
      routeId.replace(":route", ""),
    asset,
    quoteAsset:
      "USDT",
    side,
    targetQuantity:
      quantity,
    state:
      selectedCandidate ? "SHADOW_ROUTE_MODELED" : "NO_ROUTE",
    evidenceStatus:
      selectedCandidate ? "AVAILABLE" : "NO_DATA",
    candidates:
      selectedCandidate ? [selectedCandidate] : [],
    selectedCandidate,
    blockers:
      selectedCandidate
        ? [
            "MARKET_RULES_NOT_EVALUATED",
            "BASIS_CORRELATION_RISK_NOT_EVALUATED",
            "RISK_APPROVAL_NOT_EVALUATED",
            "CAPITAL_NOT_RESERVED",
            "STRATEGY_INTENT_NOT_GENERATED",
          ]
        : [
            "NO_PASSING_ROUTE",
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
}

function createCandidate(
  venue: string,
  market: string,
  asset: string,
  side: "BUY" | "SELL",
  quantity: number,
  vwapPrice: number,
): HedgeInventoryRouteCandidate {
  const gross =
    quantity * vwapPrice;

  return {
    venue,
    market,
    asset,
    quoteAsset:
      "USDT",
    side,
    requestedQuantity:
      quantity,
    evidenceStatus:
      "AVAILABLE",
    state:
      "ECONOMICS_PASS",
    orderBookTimestamp:
      1_075,
    orderBookAgeMs:
      25,
    bestPrice:
      vwapPrice,
    vwapPrice,
    executableQuantity:
      quantity,
    unfilledQuantity:
      0,
    grossNotionalQuoteValue:
      gross,
    takerFeePercent:
      0.1,
    feeSource:
      "PUBLIC_API",
    feeSynchronizedAt:
      1_075,
    feeExpiresAt:
      1_200,
    estimatedFeeQuoteValue:
      gross * 0.001,
    slippagePercent:
      0,
    estimatedSlippageQuoteValue:
      0,
    totalModeledFrictionQuoteValue:
      gross * 0.001,
    modeledAllInQuoteValue:
      side === "BUY"
        ? gross * 1.001
        : gross * 0.999,
    blockers:
      [],
    executionAuthorized:
      false,
  };
}

function createCapability(
  input: {
    exchange: string;
    market: string;
    baseAsset: string;
    quantityStep: number;
    minimumNotional: number;
  },
): ExchangeMarketCapability {
  return {
    exchange:
      input.exchange,
    market:
      input.market,
    baseAsset:
      input.baseAsset,
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
        input.quantityStep,
      maximumQuantity:
        100,
      quantityStep:
        input.quantityStep,
      quantityPrecision:
        null,
    },
    notional: {
      minimumNotional:
        input.minimumNotional,
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

function singleRouteSnapshot(
  snapshot: HedgeInventoryRouteEconomicsSnapshot,
  asset: string,
): HedgeInventoryRouteEconomicsSnapshot {
  return {
    ...snapshot,
    routes:
      snapshot.routes.filter((route) => route.asset === asset),
  };
}

function getAssessment(
  assessments: ReturnType<HedgeInventoryMarketRuleEvaluator["evaluate"]>["assessments"],
  asset: string,
) {
  const assessment = assessments.find((candidate) => candidate.asset === asset);
  assert.ok(assessment, `Expected ${asset} market-rule assessment.`);
  return assessment;
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
