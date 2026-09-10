import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import type {
  LiveOnlyRuntimePolicy,
} from "../../../config/LiveOnlyRuntimePolicy";

import type {
  StrategyOneLiveOnlyPreflightReport,
} from "../live-only/StrategyOneLiveOnlyPreflightService";

import {
  StrategyOneLiveOnlyIntelligenceService,
} from "../live-only/StrategyOneLiveOnlyIntelligenceService";

function assertCondition(
  condition:
    boolean,
  message:
    string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const NOW =
  1_800_000_000_000;

const policy:
  LiveOnlyRuntimePolicy = {
  enabled:
    true,
  minimumCapitalPerLegInr:
    600,
  preferredCapitalPerLegInr:
    600,
  maximumCapitalPerLegInr:
    1_000,
  minimumCurrentNetProfitPercent:
    1.0,
  minimumPostStressNetProfitPercent:
    0.7,
  maximumStatutoryCashWithholdingPercentPerAttempt:
    2.1,
  maximumOpportunityAgeMs:
    600,
  routeCooldownMs:
    5_000,
  maximumConcurrentTrades:
    1,
  automaticFundMovementEnabled:
    true,
};

async function main():
  Promise<void> {
  const service =
    new StrategyOneLiveOnlyIntelligenceService();
  let preflightEvaluations =
    0;
  const report =
    service.build({
      opportunities: [
        opportunity({
          id:
            "eligible",
          market:
            "ABCUSDT",
          buyExchange:
            "binance",
          sellExchange:
            "bybit",
        }),
        opportunity({
          id:
            "analytical",
          market:
            "SKYINR",
          buyExchange:
            "unocoin",
          sellExchange:
            "zebpay",
        }),
      ],
      policy,
      runtime: {
        running:
          true,
      },
      capitalManager: {
        enabled:
          true,
      },
      capitalStudy: capitalStudyReport(),
      recentAttempts:
        [],
      exchangeFoundations:
        [],
      evaluatePreflight:
        (
          current,
        ) => {
          preflightEvaluations +=
            1;
          return blockedPreflight(
            current,
          );
        },
      now:
        NOW,
    });

  assertCondition(
    preflightEvaluations ===
      1,
    "Only routes inside the audited LIVE venue pool may run the exact preflight.",
  );

  const eligible =
    report.opportunities.find(
      (item) =>
        item.opportunityId ===
        "eligible",
    );
  const analytical =
    report.opportunities.find(
      (item) =>
        item.opportunityId ===
        "analytical",
    );

  assertCondition(
    eligible?.status ===
      "BLOCKED" &&
      eligible.buy.requiredBalance ===
        10 &&
      eligible.buy.availableBalance ===
        7 &&
      eligible.buy.shortfall ===
        3 &&
      eligible.whatWouldMakeExecutable.some(
        (item) =>
          item.includes(
            "3 additional USDT",
          ),
      ) &&
      eligible.policyChecks.some(
        (item) =>
          item.key ===
            "buy-funding" &&
          item.state ===
            "BLOCKED",
      ),
    "The report must expose exact required, available and shortfall balance evidence with a blocked gate.",
  );

  assertCondition(
    analytical?.status ===
      "ANALYTICAL_ONLY" &&
      analytical.policyChecks[0]
        ?.state ===
        "BLOCKED",
    "An exchange outside the audited pool must remain visible without running an execution preflight.",
  );

  assertCondition(
    report.safety.readOnly &&
      !report.safety.externalRequestPerformed &&
      !report.safety.transferInitiated &&
      !report.safety.orderSubmissionAllowed &&
      report.policyReference.some(
        (item) =>
          item.key ===
          "minimum-stress-net",
      ),
    "The intelligence report must be read-only and publish the central policy reference.",
  );

  console.log(
    "STRATEGY ONE LIVE-ONLY INTELLIGENCE SERVICE TEST PASSED.",
  );
  console.log(
    "No external request, balance mutation, fund movement or order was performed.",
  );
}

function opportunity(input: {
  readonly id: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}): ArbitrageOpportunity {
  return {
    id:
      input.id,
    pair: {
      market:
        input.market,
      buy: {
        exchange:
          input.buyExchange,
        market:
          input.market,
        lastPrice:
          9.5,
        bestBidPrice:
          9.4,
        bestBidQty:
          100,
        bestAskPrice:
          9.5,
        bestAskQty:
          100,
        spread:
          0.1,
        timestamp:
          NOW - 100,
        source:
          "orderBook",
        executable:
          true,
      },
      sell: {
        exchange:
          input.sellExchange,
        market:
          input.market,
        lastPrice:
          10,
        bestBidPrice:
          10,
        bestBidQty:
          100,
        bestAskPrice:
          10.1,
        bestAskQty:
          100,
        spread:
          0.1,
        timestamp:
          NOW - 90,
        source:
          "orderBook",
        executable:
          true,
      },
    },
    buyPrice:
      9.5,
    sellPrice:
      10,
    buyAvailableQty:
      100,
    sellAvailableQty:
      100,
    quoteAsset:
      input.market.endsWith(
        "USDT",
      )
        ? "USDT"
        : "INR",
    requiredQty:
      10,
    availableExecutableQty:
      10,
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
      0.5,
    rawSpreadPercent:
      5,
    estimatedFees:
      0.01,
    netProfit:
      0.49,
    netProfitPercent:
      0.5,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      92,
    timestamp:
      NOW - 100,
  };
}

function blockedPreflight(
  current:
    ArbitrageOpportunity,
): StrategyOneLiveOnlyPreflightReport {
  return {
    schemaVersion:
      "1.0",
    evaluatedAt:
      NOW,
    opportunityId:
      current.id,
    market:
      current.pair.market,
    buyExchange:
      current.pair.buy.exchange,
    sellExchange:
      current.pair.sell.exchange,
    approved:
      false,
    requestedCapitalPerLegInr:
      600,
    maximumCapitalPerLegInr:
      1_000,
    opportunityAgeMs:
      100,
    buyQuoteAgeMs:
      100,
    sellQuoteAgeMs:
      90,
    quoteSkewMs:
      10,
    capitalStudy: capitalStudyDecision(current),
    permissionBoundary: {
      ready:
        true,
      blockers:
        [],
    },
    funding: {
      executableQuantity:
        10,
      estimatedExecutableCapitalInr:
        600,
      estimatedBuyRequirementInr:
        600,
      buyFunding: {
        exchange:
          "binance",
        asset:
          "USDT",
        requiredBalance:
          10,
        availableBalance:
          7,
        synchronizationStatus:
          "SYNCHRONIZED",
        snapshotAgeMs:
          1_000,
        maximumSnapshotAgeMs:
          15_000,
        sufficient:
          false,
      },
      sellFunding: {
        exchange:
          "bybit",
        asset:
          "ABC",
        requiredBalance:
          10,
        availableBalance:
          12,
        synchronizationStatus:
          "SYNCHRONIZED",
        snapshotAgeMs:
          1_000,
        maximumSnapshotAgeMs:
          15_000,
        sufficient:
          true,
      },
      multiLevelDepthEvidence:
        null,
    },
    stress:
      null,
    core:
      null,
    blockers: [
      "FUNDING: Binance USDT balance is insufficient.",
    ],
    safety: {
      paperHistoryRequired:
        false,
      exactCurrentBooksRequired:
        true,
      authenticatedBalancesRequired:
        true,
      fullDepthRequired:
        true,
      finalLastLookRequired:
        true,
      authorityGranted:
        false,
      orderSubmitted:
        false,
    },
  } as unknown as StrategyOneLiveOnlyPreflightReport;
}

function capitalStudyDecision(current: ArbitrageOpportunity) {
  return {
    routeKey: `${current.pair.market}|${current.pair.buy.exchange}|${current.pair.sell.exchange}`,
    market: current.pair.market,
    buyExchange: current.pair.buy.exchange,
    sellExchange: current.pair.sell.exchange,
    opportunityId: current.id,
    status: "CURRENT_ROUTE_READY" as const,
    executionQualified: true,
    capitalActionQualified: true,
    currentConsecutiveSamples: 0,
    requiredCurrentSamples: 0 as const,
    completedQualificationCycles: 0,
    requiredQualificationCycles: 0 as const,
    totalIndependentSamples: 1,
    requiredTotalSamplesForCapital: 0 as const,
    effectiveMinimumCurrentNetProfitPercent: 1.0,
    baselineMinimumCurrentNetProfitPercent: 1.0 as const,
    hardMinimumCurrentNetProfitPercent: 0.7 as const,
    latestNetProfitPercent: current.netProfitPercent,
    latestObservedAt: NOW,
    latestEvidenceAgeMs: 0,
    recommendation: "WAIT_FOR_MORE_EVIDENCE" as const,
    recommendationDetail: "Test study evidence.",
    funding: null,
    blockers: [],
    safety: {
      studyOnly: true as const,
      restartResetsQualification: false as const,
      hardGatesAutoRelaxed: false as const,
      recoveryClean: true,
      movementAllowed: true,
      orderSubmissionAllowed: false as const,
    },
  };
}

function capitalStudyReport() {
  return {
    schemaVersion: "1.0" as const,
    generatedAt: NOW,
    running: true,
    trackedRoutes: 0,
    executionStudyReadyRoutes: 0,
    capitalStudyReadyRoutes: 0,
    policy: {
      independentSamplesPerExecutionDecision: 0 as const,
      qualificationCyclesForCapitalAction: 0 as const,
      independentSamplesForCapitalAction: 0 as const,
      minimumSampleSpacingMs: 750 as const,
      adaptiveCurrentNetLadderPercent: [1.0] as const,
      postStressNetHardFloorPercent: 0.7,
      maximumBookAgeMs: 600,
      maximumBookSkewMs: 600,
    },
    routes: [],
  };
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "[Strategy One LIVE-only Intelligence Test]",
      error instanceof Error
        ? error.message
        : error,
    );
    process.exitCode =
      1;
  },
);
