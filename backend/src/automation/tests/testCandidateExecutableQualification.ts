import assert from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  MonitoredOpportunityCandidate,
} from "../models/OpportunityMonitor";

import {
  CandidateQualificationService,
} from "../services/CandidateQualificationService";

import {
  OpportunityMonitorService,
} from "../services/OpportunityMonitorService";

import type {
  ExecutionResult,
} from "../../execution/models/ExecutionResult";

import type {
  StrategyOneFundedRouteReport,
} from "../../trading/execution/StrategyOneFundedRouteService";

import type {
  StrategyOnePaperStressGateReport,
} from "../../trading/execution/AutomatedPaperTradingService";

const NOW =
  1_900_000_000_000;

function main(): void {
  const exactOpportunity =
    opportunity();

  let observedSimulationCapital =
    0;

  let fundedState:
    StrategyOneFundedRouteReport["state"] =
    "BLOCKED";

  let liveOrderSafe =
    false;

  let stressStatus:
    StrategyOnePaperStressGateReport["status"] =
    "BLOCKED";

  const service =
    new CandidateQualificationService(
      {
        minimumConsecutiveObservations:
          1,
        minimumPersistenceMs:
          0,
        minimumNetProfitPercent:
          0.3,
        minimumLiquidityScore:
          70,
        minimumFreshnessScore:
          0,
        maximumProfitDrawdownPercent:
          100,
      },
      {
        simulateExecution:
          (request) => {
            observedSimulationCapital =
              request.capital;

            return successfulSimulation();
          },
        getOpportunityById:
          () =>
            exactOpportunity,
        evaluateFundedRoute:
          () =>
            fundedReport(
              fundedState,
              liveOrderSafe,
            ),
        evaluateStress:
          () =>
            stressReport(
              stressStatus,
            ),
      },
    );

  const legacyHigh =
    candidate();

  const ruleBlocked =
    service.evaluate(
      legacyHigh,
      NOW,
    );

  assert.equal(
    observedSimulationCapital,
    5,
    "₹500 must convert through the candidate's INR/quote evidence before depth simulation.",
  );
  assert.equal(
    ruleBlocked.status,
    "REJECTED",
    "A high legacy liquidity score must not bypass exchange order-rule validation.",
  );
  assert.equal(
    ruleBlocked.liquidityAssessment.legacyPassed,
    true,
  );
  assert.equal(
    ruleBlocked.liquidityAssessment.capitalAware.passed,
    false,
  );

  fundedState =
    "FUNDED";
  liveOrderSafe =
    true;

  const stressBlocked =
    service.evaluate(
      legacyHigh,
      NOW,
    );

  assert.equal(
    stressBlocked.status,
    "REJECTED",
    "A fee-positive depth result must not qualify when post-stress net economics fail.",
  );
  assert.equal(
    stressBlocked.liquidityAssessment.capitalAware.stressStatus,
    "BLOCKED",
  );

  stressStatus =
    "PASSED";

  const qualified =
    service.evaluate(
      legacyHigh,
      NOW,
    );

  assert.equal(
    qualified.status,
    "QUALIFIED",
  );
  assert.equal(
    qualified.liquidityAssessment.source,
    "CAPITAL_AWARE_SIMULATION",
  );
  assert.equal(
    qualified.liquidityAssessment.capitalAware.liveOrderSafe,
    true,
  );
  assert.equal(
    qualified.liquidityAssessment.capitalAware.postStressNetProfitPercent,
    0.6,
  );
  assert.equal(
    qualified.liquidityAssessment.capitalAware.netProfitPercent,
    0.6,
    "Execution ranking must receive the conservative post-stress net, not the headline top-of-book net.",
  );

  let hftPostStressNetProfitPercent =
    0.6;

  const hftService =
    new CandidateQualificationService(
      {},
      {
        simulateExecution:
          () =>
            successfulSimulation(),
        getOpportunityById:
          () =>
            exactOpportunity,
        evaluateFundedRoute:
          () =>
            fundedReport(
              "FUNDED",
              true,
            ),
        evaluateStress:
          () =>
            stressReport(
              "PASSED",
              hftPostStressNetProfitPercent,
            ),
      },
    );

  const fastLaneCandidate =
    candidate();

  fastLaneCandidate.firstSeenAt =
    NOW -
    100;
  fastLaneCandidate.lifetimeMs =
    100;
  fastLaneCandidate.totalObservations =
    2;
  fastLaneCandidate.consecutiveObservations =
    2;
  fastLaneCandidate.consecutiveDistinctBookObservations =
    2;

  const fastLaneQualified =
    hftService.evaluate(
      fastLaneCandidate,
      NOW,
    );

  assert.equal(
    fastLaneQualified.status,
    "QUALIFIED",
    "A >=0.30% post-stress route backed by two distinct fresh book generations must use the zero-dwell HFT PAPER fast lane.",
  );
  assert.equal(
    fastLaneQualified.checks.consecutiveObservations.requiredValue,
    2,
  );
  assert.equal(
    fastLaneQualified.checks.persistence.requiredValue,
    0,
  );

  hftPostStressNetProfitPercent =
    0.4;

  const convergedFloorQualified =
    hftService.evaluate(
      fastLaneCandidate,
      NOW,
    );

  assert.equal(
    convergedFloorQualified.status,
    "QUALIFIED",
    "A 0.40% post-stress route must use the fast lane after the authoritative LIVE floor converges at 0.30%.",
  );
  assert.equal(
    convergedFloorQualified.checks.consecutiveObservations.requiredValue,
    2,
  );
  assert.equal(
    convergedFloorQualified.checks.persistence.requiredValue,
    0,
  );

  hftPostStressNetProfitPercent =
    0.6;
  fastLaneCandidate.consecutiveDistinctBookObservations =
    1;

  assert.equal(
    hftService.evaluate(
      fastLaneCandidate,
      NOW,
    ).status,
    "OBSERVING",
    "Repeated evaluation of one unchanged book generation must not unlock the HFT PAPER fast lane.",
  );

  const monitor =
    new OpportunityMonitorService();

  const firstBook =
    opportunity();

  monitor.observeSnapshot(
    [
      firstBook,
    ],
    NOW,
  );

  const unchangedBook =
    structuredClone(
      firstBook,
    );

  unchangedBook.id =
    "opportunity-unchanged-book";
  unchangedBook.timestamp =
    NOW +
    1;

  monitor.observeSnapshot(
    [
      unchangedBook,
    ],
    NOW +
    1,
  );

  assert.equal(
    monitor.getActiveCandidates()[0]
      ?.consecutiveDistinctBookObservations,
    1,
    "A rescanned snapshot with unchanged venue timestamps must not manufacture a new HFT book observation.",
  );

  const changedBook =
    structuredClone(
      unchangedBook,
    );

  changedBook.id =
    "opportunity-new-book";
  changedBook.timestamp =
    NOW +
    2;
  changedBook.pair.buy.timestamp =
    NOW +
    2;

  monitor.observeSnapshot(
    [
      changedBook,
    ],
    NOW +
    2,
  );

  assert.equal(
    monitor.getActiveCandidates()[0]
      ?.consecutiveDistinctBookObservations,
    2,
    "A genuine venue book-timestamp change must advance HFT PAPER evidence exactly once.",
  );

  const rollingCandidate =
    candidate();

  rollingCandidate.latest.netProfitPercent =
    1.05;
  rollingCandidate.best.netProfitPercent =
    4.2;
  rollingCandidate.recentNetProfitObservations = [
    {
      netProfitPercent:
        4.2,
      observedAt:
        NOW -
        2,
      opportunityId:
        "rolling-spike",
      buyQuoteTimestamp:
        NOW -
        2,
      sellQuoteTimestamp:
        NOW -
        2,
    },
    {
      netProfitPercent:
        1.2,
      observedAt:
        NOW -
        1,
      opportunityId:
        "rolling-plateau-1",
      buyQuoteTimestamp:
        NOW -
        1,
      sellQuoteTimestamp:
        NOW -
        1,
    },
    {
      netProfitPercent:
        1.05,
      observedAt:
        NOW,
      opportunityId:
        "rolling-plateau-2",
      buyQuoteTimestamp:
        NOW,
      sellQuoteTimestamp:
        NOW,
    },
  ];

  const rollingQualified =
    hftService.evaluate(
      rollingCandidate,
      NOW,
    );

  assert.equal(
    rollingQualified.checks.profitStability.passed,
    true,
    "One transient profit spike must not permanently reject a later stable synchronized plateau.",
  );
  assert.equal(
    rollingQualified.profitDrawdownPercent,
    12.5,
    "Rolling stability must use the bounded upper-quartile reference once three distinct generations exist.",
  );

  const explicitLegacyMode =
    new CandidateQualificationService(
      {
        minimumConsecutiveObservations:
          1,
        minimumPersistenceMs:
          0,
        minimumNetProfitPercent:
          0.3,
        minimumLiquidityScore:
          70,
        minimumFreshnessScore:
          0,
        maximumProfitDrawdownPercent:
          100,
        capitalAwareLiquidityEnabled:
          false,
      },
    );

  assert.equal(
    explicitLegacyMode.evaluate(
      legacyHigh,
      NOW,
    ).status,
    "QUALIFIED",
    "Explicitly disabled capital-aware mode remains available for isolated deterministic fixtures.",
  );

  console.log(
    "CANDIDATE EXECUTABLE QUALIFICATION TEST PASSED.",
  );
  console.log(
    "Legacy score bypass, INR/quote sizing, exchange rules and post-stress economics are fail-closed.",
  );
}

function candidate(): MonitoredOpportunityCandidate {
  return {
    strategyAttribution: {
      attributionStatus:
        "ATTRIBUTED",
      strategyId:
        "cross-exchange-arbitrage",
      signalId:
        "signal-executable-qualification",
      intentId:
        null,
    },
    key:
      "COTIUSDT|coindcx|binance",
    market:
      "COTIUSDT",
    buyExchange:
      "coindcx",
    sellExchange:
      "binance",
    status:
      "ACTIVE",
    latestOpportunityId:
      "opportunity-executable-qualification",
    firstSeenAt:
      NOW -
      10_000,
    lastSeenAt:
      NOW,
    disappearedAt:
      null,
    lifetimeMs:
      10_000,
    totalObservations:
      5,
    consecutiveObservations:
      5,
    missedSnapshots:
      0,
    reappearances:
      0,
    latest: {
      buyPrice:
        1,
      sellPrice:
        1.02,
      executableQuantity:
        100,
      netProfit:
        0.01,
      netProfitPercent:
        1,
      estimatedFees:
        0.01,
      rawSpread:
        0.02,
      rawSpreadPercent:
        2,
      liquidityScore:
        100,
      freshnessScore:
        100,
      requestedCapitalInr:
        1_000,
      quoteAsset:
        "USDT",
      requestedQuoteCapital:
        10,
      opportunityTimestamp:
        NOW,
      buyQuoteTimestamp:
        NOW,
      sellQuoteTimestamp:
        NOW,
      quotesAreFresh:
        true,
      usedLastPriceFallback:
        false,
    },
    best: {
      netProfit:
        0.01,
      netProfitPercent:
        1,
      observedAt:
        NOW,
      opportunityId:
        "opportunity-executable-qualification",
    },
  };
}

function opportunity(): ArbitrageOpportunity {
  return {
    id:
      "opportunity-executable-qualification",
    pair: {
      market:
        "COTIUSDT",
      buy: {
        exchange:
          "coindcx",
        market:
          "COTIUSDT",
        lastPrice:
          1,
        bestBidPrice:
          0.99,
        bestBidQty:
          100,
        bestAskPrice:
          1,
        bestAskQty:
          100,
        spread:
          0.01,
        timestamp:
          NOW,
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
          1.02,
        bestBidPrice:
          1.02,
        bestBidQty:
          100,
        bestAskPrice:
          1.03,
        bestAskQty:
          100,
        spread:
          0.01,
        timestamp:
          NOW,
        source:
          "orderBook",
        executable:
          true,
      },
    },
    buyPrice:
      1,
    sellPrice:
      1.02,
    buyAvailableQty:
      100,
    sellAvailableQty:
      100,
    requestedCapitalInr:
      1_000,
    quoteAsset:
      "USDT",
    requestedQuoteCapital:
      10,
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
      0.02,
    rawSpreadPercent:
      2,
    estimatedFees:
      0.01,
    netProfit:
      0.01,
    netProfitPercent:
      1,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      100,
    timestamp:
      NOW,
  };
}

function successfulSimulation(): ExecutionResult {
  return {
    success:
      true,
    validation: {
      valid:
        true,
      reasons:
        [],
    },
    simulation: {
      depth: {
        requestedQuantity:
          5,
        executableQuantity:
          5,
        executableCapital:
          5,
        averagePrice:
          1,
        remainingQuantity:
          0,
        fillPercent:
          100,
        fullyExecutable:
          true,
        consumedLevels:
          1,
      },
      buyVWAP: {
        requestedQuantity:
          5,
        filledQuantity:
          5,
        unfilledQuantity:
          0,
        averagePrice:
          1,
        totalCost:
          5,
        fillPercent:
          100,
        partialFill:
          false,
      },
      sellVWAP: {
        requestedQuantity:
          5,
        filledQuantity:
          5,
        unfilledQuantity:
          0,
        averagePrice:
          1.02,
        totalCost:
          5.1,
        fillPercent:
          100,
        partialFill:
          false,
      },
      buySlippage: {
        idealPrice:
          1,
        averageFillPrice:
          1,
        priceDifference:
          0,
        slippagePercent:
          0,
        slippageCost:
          0,
      },
      sellSlippage: {
        idealPrice:
          1.02,
        averageFillPrice:
          1.02,
        priceDifference:
          0,
        slippagePercent:
          0,
        slippageCost:
          0,
      },
      profit: {
        capital:
          5,
        quantity:
          5,
        breakdown: {
          grossSpreadProfit:
            0.1,
          buyFees:
            0.005,
          sellFees:
            0.0051,
          networkFees:
            0,
          transferCost:
            0,
          slippageCost:
            0,
          taxes:
            0,
          netProfit:
            0.0899,
        },
        profitPercent:
          1.798,
        profitable:
          true,
      },
      confidence: {
        score:
          100,
        recommendation:
          "EXECUTE",
        reasons:
          [],
      },
      decision: {
        recommendation:
          "EXECUTE",
        confidence:
          100,
        reasons:
          [],
      },
      simulatedAt:
        NOW,
    },
    failureReason:
      null,
    executionTimeMs:
      0.1,
  };
}

function fundedReport(
  state:
    StrategyOneFundedRouteReport["state"],
  orderSafe:
    boolean,
): StrategyOneFundedRouteReport {
  return {
    state,
    executableQuantity:
      state ===
        "BLOCKED"
        ? null
        : 5,
    quantityNormalization:
      state ===
        "BLOCKED"
        ? null
        : {
            liveOrderSafe:
              orderSafe,
          },
    blockers:
      state ===
        "BLOCKED"
        ? [
            "Minimum notional is not satisfied.",
          ]
        : [],
  } as unknown as StrategyOneFundedRouteReport;
}

function stressReport(
  status:
    StrategyOnePaperStressGateReport["status"],

  postStressNetProfitPercent =
    0.6,
): StrategyOnePaperStressGateReport {
  return {
    status,
    postStressNetProfit:
      status ===
        "PASSED"
        ? 0.03
        : -0.01,
    postStressNetProfitPercent:
      status ===
        "PASSED"
        ? postStressNetProfitPercent
        : -0.2,
    reasons:
      status ===
        "PASSED"
        ? [
            "Post-stress net passed.",
          ]
        : [
            "Post-stress net is below the minimum.",
          ],
  } as unknown as StrategyOnePaperStressGateReport;
}

main();
