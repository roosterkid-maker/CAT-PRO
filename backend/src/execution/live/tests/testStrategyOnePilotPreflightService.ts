import assert from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import type {
  StrategyOneCapitalPlacementReport,
  StrategyOneCapitalPlacementRouteRank,
} from "../../../strategies/services/StrategyOneCapitalPlacementService";

import type {
  StrategyOneFundedRouteReport,
} from "../../../trading/execution/StrategyOneFundedRouteService";

import type {
  StrategyOnePaperStressGateReport,
} from "../../../trading/execution/AutomatedPaperTradingService";

import type {
  TinyLivePreflightReport,
  TinyLivePreflightRequest,
} from "../tiny-live/TinyLivePreflight";

import type {
  StrategyOneTimingHeadroomReview,
} from "../../../arbitrage/execution/StrategyOneTimingCalibrationService";

import {
  StrategyOnePilotPreflightService,
} from "../tiny-live/StrategyOnePilotPreflightService";

import type {
  StrategyOneApiPermissionBoundaryReport,
} from "../tiny-live/StrategyOneApiPermissionBoundaryService";

const NOW =
  1_900_000_000_000;

function main(): void {
  let opportunities:
    ArbitrageOpportunity[] = [
    opportunity(
      NOW -
        50,
    ),
  ];

  let exactOpportunity:
    ArbitrageOpportunity | null =
    opportunities[0] ??
    null;

  let placement =
    placementReport();

  let funding =
    fundedRoute();

  let stress =
    passedStress();

  let timing =
    readyTiming();

  let apiPermissionBoundary =
    readyApiPermissionBoundary();

  let stressCalls =
    0;

  let stressMinimumNetProfitPercent =
    Number.NaN;

  let coreCalls =
    0;

  let coreRequest:
    TinyLivePreflightRequest | null =
    null;

  let fundingCapitalInr =
    0;

  let fundingQuoteCapital:
    number | undefined;

  const service =
    new StrategyOnePilotPreflightService({
      getTinyLivePolicy:
        () => ({
          minimumCapitalPerLegInr:
            100,
          capitalPerLegInr:
            500,
          maximumCapitalPerLegInr:
            1_000,
          minimumNetProfitPercent:
            0.3,
          postStressMinimumNetProfitPercent:
            0.15,
          maximumPreviewOpportunityAgeMs:
            10_000,
        }),
      getOpportunities:
        () =>
          opportunities,
      getOpportunityById:
        (id) =>
          exactOpportunity?.id ===
            id
            ? exactOpportunity
            : null,
      getCapitalPlacement:
        () =>
          placement,
      getApiPermissionBoundary:
        () =>
          apiPermissionBoundary,
      evaluateFunding:
        (
          _opportunity,
          requestedCapitalInr,
          _now,
          requestedQuoteCapital,
        ) => {
          fundingCapitalInr =
            requestedCapitalInr;
          fundingQuoteCapital =
            requestedQuoteCapital;
          return funding;
        },
      reviewTiming:
        () =>
          timing,
      evaluateStress:
        (
          _opportunity,
          _quantity,
          _now,
          minimumNetProfitPercent,
        ) => {
          stressCalls +=
            1;
          stressMinimumNetProfitPercent =
            minimumNetProfitPercent;
          return stress;
        },
      runCorePreflight:
        (request) => {
          coreCalls +=
            1;
          coreRequest =
            request;
          return blockedCorePreflight();
        },
    });

  const preview =
    service.getPreview(
      NOW,
    );

  assert.equal(
    preview.state,
    "READY_FOR_OPERATOR_PREFLIGHT",
  );
  assert.equal(
    preview.evidence.currentFreshExecuteOpportunities,
    1,
  );
  assert.equal(
    preview.evidence.historicalAdapterReadyRoutes,
    1,
  );
  assert.equal(
    preview.evidence.matchedCurrentRoutes,
    1,
  );
  assert.equal(
    preview.evidence.fullyPreflightableMatches,
    1,
  );
  assert.equal(
    preview.selected?.routeKey,
    "COTIUSDT|bybit>binance",
  );
  assert.equal(
    preview.selected?.checks.every(
      (item) =>
        item.state ===
        "PASS",
    ),
    true,
  );
  assert.equal(
    preview.requestedCapitalPerLegInr,
    500,
  );
  assert.equal(
    preview.minimumTwoLegInventoryInr,
    1_000,
  );
  assert.equal(
    fundingCapitalInr,
    500,
  );
  assert.equal(
    fundingQuoteCapital,
    100,
    "Action-time funding must reuse the immutable opportunity's already-validated quote capital instead of rescanning every conversion book.",
  );
  assert.equal(
    stressCalls,
    1,
  );
  assert.equal(
    stressMinimumNetProfitPercent,
    0.15,
    "Tiny-LIVE stress must use the distinct V5 post-stress floor.",
  );
  assert.equal(
    preview.minimumCurrentNetProfitPercent,
    0.3,
    "Current fee-adjusted entry must remain on the 0.30% floor.",
  );
  assertSafety(
    preview.safety,
  );

  opportunities = [{
    ...opportunity(NOW - 50),
    id: "opportunity-review",
    decision: "REVIEW",
    score: 79,
  }];
  exactOpportunity = opportunities[0] ?? null;
  const reviewPreview = service.getPreview(NOW);
  assert.equal(
    reviewPreview.state,
    "READY_FOR_OPERATOR_PREFLIGHT",
    "A REVIEW aggregate label must not veto a route that passed every explicit Tiny-LIVE gate.",
  );
  assert.equal(reviewPreview.selected?.opportunityId, "opportunity-review");

  opportunities = [{
    ...opportunity(NOW - 50),
    id: "opportunity-skip",
    decision: "SKIP",
    score: 40,
  }];
  exactOpportunity = opportunities[0] ?? null;
  const skipPreview = service.getPreview(NOW);
  assert.equal(
    skipPreview.state,
    "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY",
    "SKIP must remain outside the Tiny-LIVE preflight boundary.",
  );

  opportunities = [opportunity(NOW - 50)];
  exactOpportunity = opportunities[0] ?? null;

  placement = {
    ...placementReport(),
    routes: placementReport().routes.map((route) => ({
      ...route,
      deployableCashPnlInr: -2_000,
      tdsWithheldInr: route.realizedPnlInr + 2_000,
    })),
  };
  const profitableButCashLocked = service.getPreview(NOW);
  assert.equal(
    profitableButCashLocked.state,
    "READY_FOR_OPERATOR_PREFLIGHT",
    "Positive realized route evidence must not be erased by separately tracked TDS cash lock.",
  );
  assert.equal(
    profitableButCashLocked.selected?.checks.find(
      (item) => item.key === "HISTORICAL_ROUTE_EVIDENCE",
    )?.state,
    "PASS",
  );

  placement = {
    ...placementReport(),
    routes: placementReport().routes.map((route) => ({
      ...route,
      realizedPnlInr: -1,
      deployableCashPnlInr: 8_000,
    })),
  };
  const historicallyUnprofitable = service.getPreview(NOW);
  assert.equal(
    historicallyUnprofitable.state,
    "WAITING_FOR_HISTORICAL_MATCH",
    "Positive immediate cash after withholding must not manufacture profitable historical evidence.",
  );

  placement = placementReport();

  funding =
    oneLotRoundedFunding();
  const lotRounded =
    service.getPreview(
      NOW,
    );
  assert.equal(
    lotRounded.state,
    "READY_FOR_OPERATOR_PREFLIGHT",
    "A mandatory quantity round-down below one shared step must remain eligible.",
  );
  assert.equal(
    lotRounded.selected?.funding.state,
    "REDUCED",
    "The funding report must truthfully retain its REDUCED state.",
  );

  funding =
    balanceReducedFunding();
  stressCalls =
    0;
  const balanceReduced =
    service.getPreview(
      NOW,
    );
  assert.equal(
    balanceReduced.state,
    "READY_FOR_OPERATOR_PREFLIGHT",
    "A safely normalized balance/depth-capped pilot above the ₹100 floor must remain eligible.",
  );
  assert.ok(
    (balanceReduced.selected?.funding.estimatedExecutableCapitalInr ?? 0) > 400 &&
      (balanceReduced.selected?.funding.estimatedExecutableCapitalInr ?? 0) < 420,
    "The COTI-like ₹410 reduced-depth regression must retain its exact executable capital.",
  );
  assert.equal(
    stressCalls,
    1,
    "Stress evaluation must rerun on the exact reduced quantity.",
  );

  funding =
    excessiveStepReductionFunding();
  const excessiveStepReduction =
    service.getPreview(
      NOW,
    );
  assert.equal(
    excessiveStepReduction.state,
    "READY_FOR_OPERATOR_PREFLIGHT",
    "A larger safe round-down must remain eligible when its exact capital stays inside the approved range.",
  );

  funding =
    belowFloorReducedFunding();
  stressCalls =
    0;
  const belowFloorReduction =
    service.getPreview(
      NOW,
    );
  assert.equal(
    belowFloorReduction.state,
    "BLOCKED_CURRENT_EVIDENCE",
    "A reduced quantity below ₹100 must remain blocked.",
  );
  assert.equal(
    stressCalls,
    0,
    "Post-stress evaluation must not run below the approved capital floor.",
  );

  funding =
    fundedRoute();
  stressCalls =
    1;

  assert.throws(
    () =>
      service.run({
        confirmationToken:
          "WRONG",
        expectedOpportunityId:
          "opportunity-current",
        now:
          NOW,
      }),
    /confirmationToken must equal/i,
  );
  assert.equal(
    coreCalls,
    0,
  );

  const run =
    service.run({
      confirmationToken:
        "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      expectedOpportunityId:
        "opportunity-current",
      now:
        NOW,
    });

  assert.equal(
    run.decision,
    "CORE_PREFLIGHT_BLOCKED",
  );
  assert.equal(
    run.approvedForActivationReview,
    false,
  );
  assert.equal(
    coreCalls,
    1,
  );

  const capturedCoreRequest =
    coreRequest as
      TinyLivePreflightRequest | null;

  assert.ok(
    capturedCoreRequest,
  );

  assert.equal(
    capturedCoreRequest.requestedCapital,
    500,
  );
  assert.equal(
    capturedCoreRequest.balanceRequirements.length,
    2,
  );
  assert.deepEqual(
    capturedCoreRequest.balanceRequirements.map(
      (item) => [
        item.exchange,
        item.asset,
        item.requiredAmount,
      ],
    ),
    [
      [
        "bybit",
        "USDT",
        500,
      ],
      [
        "binance",
        "COTI",
        50,
      ],
    ],
  );
  assertSafety(
    run.safety,
  );

  const priorOpportunities =
    opportunities;
  const priorExactOpportunity =
    exactOpportunity;
  const staleSharedSnapshot = {
    ...opportunity(
      NOW -
        499,
    ),
    id:
      "opportunity-stale-shared-snapshot",
  };
  const refreshedExactOpportunity = {
    ...opportunity(
      NOW -
        1,
    ),
    id:
      "opportunity-action-time-refresh",
    pair: {
      ...opportunity(
        NOW -
          1,
      ).pair,
      buy: {
        ...opportunity(
          NOW -
            1,
        ).pair.buy,
        timestamp:
          NOW -
            1,
      },
      sell: {
        ...opportunity(
          NOW -
            1,
        ).pair.sell,
        timestamp:
          NOW -
            60,
      },
    },
  };

  opportunities = [
    staleSharedSnapshot,
  ];
  exactOpportunity =
    refreshedExactOpportunity;

  const exactRefreshBoundRun =
    service.run({
      confirmationToken:
        "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      expectedOpportunityId:
        refreshedExactOpportunity.id,
      now:
        NOW,
    });

  assert.equal(
    exactRefreshBoundRun.preview.selected?.opportunityId,
    refreshedExactOpportunity.id,
    "Action-time preflight must bind the exact refreshed ID instead of selecting the stale shared snapshot.",
  );
  assert.equal(
    exactRefreshBoundRun.preview.selected?.checks.find(
      (item) =>
        item.key ===
        "CURRENT_DISPATCH_RESERVED_FRESHNESS",
    )?.state,
    "PASS",
    "The exact refreshed BUY/SELL timestamps must drive dispatch-reserved freshness.",
  );
  assert.equal(
    exactRefreshBoundRun.decision,
    "CORE_PREFLIGHT_BLOCKED",
    "Binding fresh public books must not bypass the independent core Tiny-LIVE gate.",
  );

  opportunities =
    priorOpportunities;
  exactOpportunity =
    priorExactOpportunity;
  coreCalls =
    1;

  apiPermissionBoundary = {
    ...readyApiPermissionBoundary(),
    state:
      "BLOCKED",
    ready:
      false,
    blockers: [
      "binance: API withdrawal permission is enabled and must be disabled.",
    ],
  };

  const permissionBlocked =
    service.getPreview(
      NOW,
    );

  assert.equal(
    permissionBlocked.state,
    "BLOCKED_CURRENT_EVIDENCE",
  );
  assert.equal(
    permissionBlocked.selected?.checks.find(
      (item) =>
        item.key ===
        "API_KEY_PERMISSION_BOUNDARY",
    )?.state,
    "BLOCKED",
  );

  apiPermissionBoundary =
    readyApiPermissionBoundary();

  funding =
    blockedFunding();
  stressCalls =
    0;

  const fundingBlocked =
    service.getPreview(
      NOW,
    );

  assert.equal(
    fundingBlocked.state,
    "BLOCKED_CURRENT_EVIDENCE",
  );
  assert.equal(
    fundingBlocked.selected?.funding.state,
    "BLOCKED",
  );
  assert.equal(
    stressCalls,
    0,
    "Stress gate must not run without exact funded quantity.",
  );

  const blockedBeforeCore =
    service.run({
      confirmationToken:
        "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY",
      expectedOpportunityId:
        "opportunity-current",
      now:
        NOW,
    });

  assert.equal(
    blockedBeforeCore.decision,
    "BLOCKED_BEFORE_CORE_PREFLIGHT",
  );
  assert.equal(
    coreCalls,
    1,
    "Core preflight must not run for a funding-blocked candidate.",
  );

  funding =
    fundedRoute();
  timing = {
    ...readyTiming(),
    state: "BLOCKED",
    residualOperationalHeadroomMs: -1,
    blockers: [
      "Execution-grade quote P99 leaves -1 ms operational headroom; at least 10 ms is required.",
    ],
  };

  const timingBlocked =
    service.getPreview(
      NOW,
    );

  assert.equal(
    timingBlocked.state,
    "BLOCKED_CURRENT_EVIDENCE",
  );
  assert.equal(
    timingBlocked.selected?.timing.state,
    "BLOCKED",
  );
  assert.match(
    timingBlocked.blockers[0] ?? "",
    /PILOT_TIMING_HEADROOM/i,
  );

  timing =
    readyTiming();
  opportunities = [
    opportunity(
      NOW -
        501,
    ),
  ];

  const dispatchFreshnessBlocked =
    service.getPreview(
      NOW,
    );

  assert.equal(
    dispatchFreshnessBlocked.state,
    "BLOCKED_CURRENT_EVIDENCE",
  );
  assert.equal(
    dispatchFreshnessBlocked.selected?.checks.find(
      (item) =>
        item.key ===
        "CURRENT_DISPATCH_RESERVED_FRESHNESS",
    )?.state,
    "BLOCKED",
    "A current book can be inside the absolute 560 ms ceiling but still lack dispatch reserve.",
  );

  opportunities = [
    opportunity(
      NOW -
        10_001,
    ),
  ];

  const stale =
    service.getPreview(
      NOW,
    );

  assert.equal(
    stale.state,
    "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY",
  );
  assert.equal(
    stale.selected,
    null,
  );

  opportunities = [
    opportunity(
      NOW -
        10,
    ),
  ];
  placement = {
    ...placement,
    routes:
      [],
    buyVenues:
      [],
    sellVenues:
      [],
  };

  const noHistoricalMatch =
    service.getPreview(
      NOW,
    );

  assert.equal(
    noHistoricalMatch.state,
    "WAITING_FOR_HISTORICAL_MATCH",
  );
  assert.equal(
    noHistoricalMatch.selected,
    null,
  );

  placement = placementReport();
  const excluded = opportunity(NOW - 10);
  opportunities = [{
    ...excluded,
    id: "excluded-non-pilot",
    pair: {
      ...excluded.pair,
      market: "BTCUSDT",
      buy: {
        ...excluded.pair.buy,
        exchange: "coindcx",
        market: "BTCUSDT",
      },
      sell: {
        ...excluded.pair.sell,
        market: "BTCUSDT",
      },
    },
  }];
  const dynamicCoinDcxRoute = service.getPreview(NOW);
  assert.equal(dynamicCoinDcxRoute.state, "WAITING_FOR_HISTORICAL_MATCH");
  assert.equal(dynamicCoinDcxRoute.evidence.currentFreshExecuteOpportunities, 1);
  assert.equal(dynamicCoinDcxRoute.evidence.excludedNonPilotCurrentOpportunities, 0);
  assert.equal(dynamicCoinDcxRoute.selected, null,
    "A dynamic CoinDCX route without credible route history must remain fail-closed.");

  console.log(
    "Strategy #1 pilot preflight service test passed.",
  );
  console.log(
    "Fresh current evidence, durable route lineage, active-policy funding, stress checks and explicit core preflight remained fail-closed without fund movement, reservation, LIVE session or order submission.",
  );
}

function readyTiming(): StrategyOneTimingHeadroomReview {
  return {
    schemaVersion: "115.0",
    generatedAt: NOW,
    routeKey: "COTIUSDT:bybit->binance",
    market: "COTIUSDT",
    buyExchange: "bybit",
    sellExchange: "binance",
    state: "READY",
    absoluteBookAgeCeilingMs: 560,
    dispatchSafetyMarginMs: 10,
    requiredOperationalHeadroomMs: 10,
    timingBasis: "TINY_LIVE_TRIGGER_BOOK_AGE",
    decisionToTinyLiveTriggerP99Ms: 5,
    downstreamPaperDecisionToExecutionStartP99Ms: 5,
    decisionToExecutionStartP99Ms: 5,
    dispatchBudgetMs: 15,
    maximumBookAgeMs: 285,
    executionGradeBuyAgeP99Ms: 100,
    executionGradeSellAgeP99Ms: 110,
    executionGradeWorstAgeP99Ms: 110,
    residualOperationalHeadroomMs: 175,
    blockers: [],
    safety: {
      reviewOnly: true,
      thresholdRelaxationAllowed: false,
      automaticProposalAllowed: false,
      automaticApprovalAllowed: false,
      liveOrderSubmissionAuthorized: false,
    },
  };
}

function readyApiPermissionBoundary(): StrategyOneApiPermissionBoundaryReport {
  return {
    version:
      "118.2",
    generatedAt:
      NOW,
    mode:
      "READ_ONLY_SIGNED_API_PERMISSION_EVIDENCE",
    state:
      "READY",
    ready:
      true,
    venues: [
      permissionVenue(
        "binance",
        null,
      ),
      permissionVenue(
        "bybit",
        1,
      ),
    ],
    blockers:
      [],
    safety: {
      signedGetOnly:
        true,
      apiKeysExposed:
        false,
      exactBoundIpsExposed:
        false,
      permissionMutationAllowed:
        false,
      transferAllowed:
        false,
      withdrawalAllowed:
        false,
      orderSubmissionAllowed:
        false,
      orderSubmissionPerformed:
        false,
    },
  };
}

function permissionVenue(
  exchange: "binance" | "bybit",
  boundIpCount: number | null,
): StrategyOneApiPermissionBoundaryReport["venues"][number] {
  return {
    exchange,
    state:
      "READY",
    checkedAt:
      NOW,
    ageMs:
      0,
    maximumAgeMs:
      180_000,
    readingEnabled:
      true,
    spotTradingEnabled:
      true,
    withdrawalsEnabled:
      false,
    internalTransferEnabled:
      false,
    ipRestricted:
      true,
    boundIpCount,
    unexpectedPermissions:
      [],
    systemManagedPermissions:
      [],
    blockers:
      [],
  };
}

function opportunity(
  timestamp:
    number,
): ArbitrageOpportunity {
  return {
    id:
      "opportunity-current",
    pair: {
      market:
        "COTIUSDT",
      buy: {
        exchange:
          "bybit",
        market:
          "COTIUSDT",
        lastPrice:
          10,
        bestBidPrice:
          9.9,
        bestBidQty:
          100,
        bestAskPrice:
          10,
        bestAskQty:
          100,
        spread:
          0.1,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
      sell: {
        exchange:
          "binance",
        market:
          "COTIUSDT",
        lastPrice:
          10.2,
        bestBidPrice:
          10.2,
        bestBidQty:
          100,
        bestAskPrice:
          10.3,
        bestAskQty:
          100,
        spread:
          0.1,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
    },
    buyPrice:
      10,
    sellPrice:
      10.2,
    buyAvailableQty:
      100,
    sellAvailableQty:
      100,
    requestedCapitalInr:
      100,
    quoteAsset:
      "USDT",
    requestedQuoteCapital:
      100,
    requiredQty:
      10,
    availableExecutableQty:
      100,
    executableQty:
      10,
    liquidityScore:
      100,
    enoughLiquidity:
      true,
    freshnessScore:
      100,
    feeScore:
      100,
    spreadScore:
      100,
    decision:
      "EXECUTE",
    analysisSummary:
      [],
    rawSpread:
      0.2,
    rawSpreadPercent:
      2,
    estimatedFees:
      0.02,
    netProfit:
      0.18,
    netProfitPercent:
      1.8,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      99,
    timestamp,
  };
}

function routeRank(): StrategyOneCapitalPlacementRouteRank {
  return {
    rank:
      2,
    routeKey:
      "COTIUSDT|bybit>binance",
    market:
      "COTIUSDT",
    baseAsset:
      "COTI",
    quoteAsset:
      "USDT",
    buyExchange:
      "bybit",
    sellExchange:
      "binance",
    uniqueSettlements:
      625,
    profitableSettlements:
      620,
    negativeSettlements:
      5,
    winRatePercent:
      99.2,
    totalCapitalInr:
      300_000,
    realizedPnlInr:
      10_000,
    deployableCashPnlInr:
      8_000,
    feesInr:
      900,
    tdsWithheldInr:
      2_000,
    averageNetReturnPercent:
      3.2,
    lastSettledAt:
      NOW -
      1_000,
    buyAdapterRegistered:
      true,
    sellAdapterRegistered:
      true,
    liveAdapterFoundationReady:
      true,
    confidence:
      "HIGH",
  };
}

function placementReport(): StrategyOneCapitalPlacementReport {
  return {
    version:
      "91.0",
    generatedAt:
      NOW,
    mode:
      "HISTORICAL_ADVISORY_ONLY",
    basis:
      "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS",
    minimumRouteSample:
      20,
    evidence: {
      storedStrategyOneSettlements:
        625,
      uniqueStrategyOneSettlements:
        625,
      credibleSettlements:
        625,
      excludedDistortedSettlements:
        0,
      duplicateIdsIgnored:
        0,
    },
    buyVenues:
      [],
    sellVenues:
      [],
    routes: [
      routeRank(),
    ],
    pilot: {
      state:
        "CANDIDATE_FOR_PREFLIGHT",
      requestedPerLegInr:
        500,
      minimumTwoLegInventoryInr:
        1_000,
      recommendedRoute:
        routeRank(),
      reasons:
        [],
      preflightRequired:
        true,
      currentOrderRulesVerified:
        false,
      currentBalancesVerified:
        false,
    },
    safety: {
      advisoryOnly:
        true,
      historicalEvidenceDoesNotAuthorizeLive:
        true,
      automaticFundMovementAllowed:
        false,
      transferInitiated:
        false,
      withdrawalInitiated:
        false,
      balanceMutated:
        false,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    },
  };
}

function fundedRoute(): StrategyOneFundedRouteReport {
  return {
    version:
      "86.0",
    evaluatedAt:
      NOW,
    opportunityId:
      "opportunity-current",
    routeKey:
      "COTIUSDT|bybit>binance",
    market:
      "COTIUSDT",
    buyExchange:
      "bybit",
    sellExchange:
      "binance",
    baseAsset:
      "COTI",
    quoteAsset:
      "USDT",
    requestedCapitalInr:
      500,
    maximumCapitalPerLegInr:
      1_000,
    convertedQuoteCapital:
      500,
    maximumConvertedQuoteCapital:
      1_000,
    capitalQuantity:
      50,
    depthQuantity:
      100,
    preFundingQuantity:
      50,
    balanceCappedQuantity:
      50,
    executableQuantity:
      50,
    estimatedExecutableCapitalInr:
      500,
    estimatedBuyRequirementInr:
      500,
    reductionPercent:
      0,
    state:
      "FUNDED",
    fundingBoundary:
      "AUTHENTICATED_LIVE_READINESS",
    buyFunding: {
      exchange:
        "bybit",
      asset:
        "USDT",
      synchronizationStatus:
        "SYNCHRONIZED",
      availableBalance:
        1_000,
      requiredBalance:
        500,
      snapshotAgeMs:
        10,
      maximumSnapshotAgeMs:
        15_000,
      sufficient:
        true,
    },
    sellFunding: {
      exchange:
        "binance",
      asset:
        "COTI",
      synchronizationStatus:
        "SYNCHRONIZED",
      availableBalance:
        100,
      requiredBalance:
        50,
      snapshotAgeMs:
        10,
      maximumSnapshotAgeMs:
        15_000,
      sufficient:
        true,
    },
    quantityNormalization:
      null,
    blockers:
      [],
    authenticatedBalancesRequired:
      true,
    isolatedPaperCapital:
      false,
    staleBalanceAllowed:
      false,
    quantityNeverIncreased:
      true,
    liveExecutionAllowed:
      false,
    orderSubmissionAllowed:
      false,
  };
}

function blockedFunding(): StrategyOneFundedRouteReport {
  const funded =
    fundedRoute();

  return {
    ...funded,
    executableQuantity:
      null,
    estimatedExecutableCapitalInr:
      null,
    state:
      "BLOCKED",
    sellFunding: {
      ...funded.sellFunding,
      availableBalance:
        0,
      sufficient:
        false,
    },
    blockers: [
      "binance COTI authenticated balance is unavailable.",
    ],
  };
}

function oneLotRoundedFunding(): StrategyOneFundedRouteReport {
  const funded =
    fundedRoute();
  const capitalQuantity =
    518.296;
  const executableQuantity =
    518;
  const reductionQuantity =
    capitalQuantity -
      executableQuantity;

  return {
    ...funded,
    capitalQuantity,
    depthQuantity:
      600,
    preFundingQuantity:
      capitalQuantity,
    balanceCappedQuantity:
      capitalQuantity,
    executableQuantity,
    estimatedExecutableCapitalInr:
      500 *
        (
          executableQuantity /
          capitalQuantity
        ),
    reductionPercent:
      (
        reductionQuantity /
        capitalQuantity
      ) *
        100,
    state:
      "REDUCED",
    quantityNormalization: {
      version:
        "81.0",
      state:
        "NORMALIZED",
      rawQuantity:
        capitalQuantity,
      normalizedQuantity:
        executableQuantity,
      commonQuantityIncrement:
        1,
      reductionQuantity,
      reductionPercent:
        (
          reductionQuantity /
          capitalQuantity
        ) *
          100,
      roundDownOnly:
        true,
      quantityNeverIncreased:
        true,
      incrementEvidenceComplete:
        true,
      paperOnlyFallbackUsed:
        false,
      liveOrderSafe:
        true,
      legs:
        [],
      blockers:
        [],
    },
  };
}

function balanceReducedFunding(): StrategyOneFundedRouteReport {
  const rounded =
    oneLotRoundedFunding();
  const balanceCappedQuantity =
    425;

  return {
    ...rounded,
    balanceCappedQuantity,
    executableQuantity:
      balanceCappedQuantity,
    estimatedExecutableCapitalInr:
      500 *
        (
          balanceCappedQuantity /
          (rounded.capitalQuantity ?? 1)
        ),
    sellFunding: {
      ...rounded.sellFunding,
      availableBalance:
        2_170,
      requiredBalance:
        balanceCappedQuantity,
      sufficient:
        true,
    },
    quantityNormalization: {
      ...rounded.quantityNormalization!,
      state:
        "UNCHANGED",
      rawQuantity:
        balanceCappedQuantity,
      normalizedQuantity:
        balanceCappedQuantity,
      reductionQuantity:
        0,
      reductionPercent:
        0,
    },
  };
}

function excessiveStepReductionFunding(): StrategyOneFundedRouteReport {
  const rounded =
    oneLotRoundedFunding();
  const executableQuantity =
    516;
  const capitalQuantity =
    rounded.capitalQuantity ??
      1;
  const reductionQuantity =
    capitalQuantity -
      executableQuantity;

  return {
    ...rounded,
    executableQuantity,
    estimatedExecutableCapitalInr:
      500 *
        (
          executableQuantity /
          capitalQuantity
        ),
    reductionPercent:
      (
        reductionQuantity /
        capitalQuantity
      ) *
        100,
    quantityNormalization: {
      ...rounded.quantityNormalization!,
      normalizedQuantity:
        executableQuantity,
      reductionQuantity,
      reductionPercent:
        (
          reductionQuantity /
          capitalQuantity
        ) *
          100,
    },
  };
}

function belowFloorReducedFunding(): StrategyOneFundedRouteReport {
  const rounded =
    oneLotRoundedFunding();
  const executableQuantity =
    50;
  const capitalQuantity =
    rounded.capitalQuantity ??
      1;

  return {
    ...rounded,
    preFundingQuantity:
      executableQuantity,
    balanceCappedQuantity:
      executableQuantity,
    executableQuantity,
    estimatedExecutableCapitalInr:
      500 *
        (
          executableQuantity /
          capitalQuantity
        ),
    reductionPercent:
      (
        1 -
        executableQuantity /
          capitalQuantity
      ) *
        100,
    quantityNormalization: {
      ...rounded.quantityNormalization!,
      state:
        "UNCHANGED",
      rawQuantity:
        executableQuantity,
      normalizedQuantity:
        executableQuantity,
      reductionQuantity:
        0,
      reductionPercent:
        0,
    },
  };
}

function passedStress(): StrategyOnePaperStressGateReport {
  return {
    status:
      "PASSED",
    evaluatedAt:
      NOW,
    sourceOpportunityAgeMs:
      50,
    buyBookTimestamp:
      NOW,
    sellBookTimestamp:
      NOW,
    timestampSkewMs:
      0,
    quantity:
      50,
    buyFillPercent:
      100,
    sellFillPercent:
      100,
    buyVwap:
      10,
    sellVwap:
      10.2,
    buyLimitPrice:
      10,
    sellLimitPrice:
      10.2,
    combinedDepthSlippagePercent:
      0,
    adverseMoveReservePercentPerLeg:
      0.02,
    tradingFees:
      0.02,
    safetyBuffer:
      0.01,
    postStressNetProfit:
      0.15,
    postStressNetProfitPercent:
      1.5,
    minimumNetProfitPercent:
      0.3,
    reasons:
      [],
    paperOnly:
      true,
    liveExecutionAllowed:
      false,
    orderSubmissionAllowed:
      false,
  };
}

function blockedCorePreflight(): TinyLivePreflightReport {
  return {
    generatedAt:
      NOW,
    version:
      "18.0",
    build:
      "15",
    mode:
      "TINY_LIVE_PREFLIGHT",
    preflightOnly:
      true,
    liveOrderSubmissionPerformed:
      false,
    capitalReserved:
      false,
    liveSessionCreated:
      false,
    approved:
      false,
    requestedCapital:
      100,
    hardCapitalRange: {
      minimum:
        100,
      maximum:
        500,
      currency:
        "INR",
    },
    market:
      "COTIUSDT",
    buyExchange:
      "bybit",
    sellExchange:
      "binance",
    gates:
      [],
    blockers: [
      "ACCOUNT_MODE_LIVE: Current trading account mode is PAPER.",
    ],
    safety: {
      automaticOrderSubmissionAllowed:
        false,
      automaticCapitalReservationAllowed:
        false,
      automaticCancelAllowed:
        false,
      automaticHedgeAllowed:
        false,
      automaticUnwindAllowed:
        false,
      preflightConfirmationRequired:
        true,
    },
    notes:
      [],
  };
}

function assertSafety(
  evidence: {
    automaticFundMovementAllowed: false;
    transferInitiated: false;
    withdrawalInitiated: false;
    balanceMutated: false;
    capitalReserved: false;
    liveSessionCreated: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
    orderSubmissionPerformed: false;
  },
): void {
  assert.equal(
    evidence.automaticFundMovementAllowed,
    false,
  );
  assert.equal(
    evidence.transferInitiated,
    false,
  );
  assert.equal(
    evidence.withdrawalInitiated,
    false,
  );
  assert.equal(
    evidence.balanceMutated,
    false,
  );
  assert.equal(
    evidence.capitalReserved,
    false,
  );
  assert.equal(
    evidence.liveSessionCreated,
    false,
  );
  assert.equal(
    evidence.liveExecutionAllowed,
    false,
  );
  assert.equal(
    evidence.orderSubmissionAllowed,
    false,
  );
  assert.equal(
    evidence.orderSubmissionPerformed,
    false,
  );
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
