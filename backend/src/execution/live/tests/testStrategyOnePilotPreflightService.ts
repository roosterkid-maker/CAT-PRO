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

import {
  StrategyOnePilotPreflightService,
} from "../tiny-live/StrategyOnePilotPreflightService";

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

  let placement =
    placementReport();

  let funding =
    fundedRoute();

  let stress =
    passedStress();

  let stressCalls =
    0;

  let coreCalls =
    0;

  let coreRequest:
    TinyLivePreflightRequest | null =
    null;

  const service =
    new StrategyOnePilotPreflightService({
      getOpportunities:
        () =>
          opportunities,
      getCapitalPlacement:
        () =>
          placement,
      evaluateFunding:
        () =>
          funding,
      evaluateStress:
        () => {
          stressCalls +=
            1;
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
    "COTIUSDT|coindcx>binance",
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
    100,
  );
  assert.equal(
    preview.minimumTwoLegInventoryInr,
    200,
  );
  assert.equal(
    stressCalls,
    1,
  );
  assertSafety(
    preview.safety,
  );

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
    100,
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
        "coindcx",
        "USDT",
        100,
      ],
      [
        "binance",
        "COTI",
        10,
      ],
    ],
  );
  assertSafety(
    run.safety,
  );

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

  console.log(
    "Strategy #1 pilot preflight service test passed.",
  );
  console.log(
    "Fresh current evidence, durable route lineage, exact ₹100 funding, stress checks and explicit core preflight remained fail-closed without fund movement, reservation, LIVE session or order submission.",
  );
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
          "coindcx",
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
      "COTIUSDT|coindcx>binance",
    market:
      "COTIUSDT",
    baseAsset:
      "COTI",
    quoteAsset:
      "USDT",
    buyExchange:
      "coindcx",
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
        100,
      minimumTwoLegInventoryInr:
        200,
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
      "COTIUSDT|coindcx>binance",
    market:
      "COTIUSDT",
    buyExchange:
      "coindcx",
    sellExchange:
      "binance",
    baseAsset:
      "COTI",
    quoteAsset:
      "USDT",
    requestedCapitalInr:
      100,
    convertedQuoteCapital:
      100,
    capitalQuantity:
      10,
    depthQuantity:
      100,
    preFundingQuantity:
      10,
    balanceCappedQuantity:
      10,
    executableQuantity:
      10,
    estimatedExecutableCapitalInr:
      100,
    reductionPercent:
      0,
    state:
      "FUNDED",
    fundingBoundary:
      "AUTHENTICATED_LIVE_READINESS",
    buyFunding: {
      exchange:
        "coindcx",
      asset:
        "USDT",
      synchronizationStatus:
        "SYNCHRONIZED",
      availableBalance:
        1_000,
      requiredBalance:
        100,
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
        10,
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
      10,
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
      "coindcx",
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
