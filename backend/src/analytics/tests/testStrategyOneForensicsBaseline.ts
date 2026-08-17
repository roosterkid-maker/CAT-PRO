import assert
  from "node:assert/strict";

import {
  StrategyOneForensicsBaselineService,
} from "../services/StrategyOneForensicsBaselineService";

import type {
  StrategyOneCoverageBaselineEvidence,
  StrategyOneExternalReadinessEvidence,
  StrategyOneForensicsBaselineSources,
  StrategyOneFreshnessBaselineEvidence,
  StrategyOneOpportunityBaselineEvidence,
} from "../services/StrategyOneForensicsBaselineService";

import type {
  OpportunityForensicsFunnel,
} from "../services/OpportunityRejectionAnalyticsService";

const NOW =
  1_786_521_600_000;

function createFunnel(
  overrides: Partial<
    OpportunityForensicsFunnel
  > = {},
): OpportunityForensicsFunnel {
  return {
    allCachedQuotes:
      100,

    executionQualityEligibleQuotes:
      80,

    executionQualityFilteredQuotes:
      20,

    marketSnapshots:
      60,

    sharedMarkets:
      20,

    pairableMarkets:
      15,

    directionalExchangePairs:
      30,

    rawPositiveSpreads:
      3,

    freshPositiveSpreads:
      2,

    feePositiveSpreads:
      0,

    priceEconomicsThresholdPass:
      0,

    evaluatedPairs:
      30,

    evaluatorPassed:
      0,

    acceptedOpportunities:
      0,

    ...overrides,
  };
}

function createOpportunityEvidence(
  funnel:
    OpportunityForensicsFunnel,

  generatedAt =
    NOW,

  acceptedOpportunities =
    funnel.acceptedOpportunities,
): StrategyOneOpportunityBaselineEvidence {
  return {
    generatedAt,

    funnel,

    currentScanRejections: {
      expectedRejectedPairs:
        funnel.evaluatedPairs -
        acceptedOpportunities,

      capturedCurrentScanRecords:
        funnel.evaluatedPairs -
        acceptedOpportunities,

      complete:
        true,

      storeCapacity:
        1_000,

      byStage:
        [],

      byCode:
        [],
    },

    pairability: {
      sharedMarkets:
        funnel.sharedMarkets,

      pairableMarkets:
        funnel.pairableMarkets,

      nonPairableMarkets:
        funnel.sharedMarkets -
        funnel.pairableMarkets,

      pairabilityPercent:
        75,

      nonPairablePercent:
        25,

      sharedMarketQuotes:
        40,

      issueBreakdown:
        [],

      byExchange:
        [],

      sampleLimit:
        50,

      sampledNonPairableMarkets:
        0,

      nonPairableMarketSample:
        [],
    },

    freshness: {
      analyzedQuotes:
        80,

      freshQuotes:
        78,

      staleQuotes:
        2,

      invalidTimestampQuotes:
        0,

      futureTimestampQuotes:
        0,

      freshPercent:
        97.5,

      stalePercent:
        2.5,

      byExchange:
        [],
    },

    synchronization: {
      pairsWithValidTimestamps:
        30,

      synchronizedPairs:
        29,

      unsynchronizedPairs:
        1,

      synchronizedPercent:
        96.6667,

      unsynchronizedPercent:
        3.3333,

      skewMs: {
        minimum:
          0,

        p50:
          25,

        p90:
          75,

        p95:
          100,

        p99:
          120,

        maximum:
          125,

        average:
          40,
      },

      unsynchronizedByRoute:
        [],

      unsynchronizedByMarket:
        [],
    },

    positiveRoutes: [
      {
        market:
          "BTCUSDT",

        buyExchange:
          "binance",

        sellExchange:
          "coindcx",

        buyPrice:
          100,

        sellPrice:
          100.1,

        rawSpread:
          0.1,

        rawSpreadPercent:
          0.1,

        buyFresh:
          true,

        sellFresh:
          true,

        synchronized:
          true,

        timestampSkewMs:
          10,

        maximumPairSkewMs:
          1_000,

        buyQuoteAgeMs:
          20,

        sellQuoteAgeMs:
          30,

        buyTakerFeePercent:
          0.1,

        sellTakerFeePercent:
          0.1,

        buyFeeSource:
          "CONFIGURED",

        sellFeeSource:
          "CONFIGURED",

        feeEvidenceAvailable:
          true,

        estimatedFees:
          0.2,

        feeDragPercent:
          0.2,

        netProfit:
          -0.1,

        netProfitPercent:
          -0.1,

        feePositive:
          false,

        spreadThresholdPass:
          true,

        netProfitThresholdPass:
          false,

        economicsThresholdPass:
          false,
      },
    ],

    byExchangeRoute:
      [],

    topRawSpreadMarkets:
      [],

    evaluatedPairs:
      funnel.evaluatedPairs,

    acceptedOpportunities,

    rejectedOpportunities:
      funnel.evaluatedPairs -
      acceptedOpportunities,

    policy: {
      minimumSpreadPercent:
        0.1,

      minimumNetProfitPercent:
        0.05,

      minimumLiquidityPercent:
        50,

      maximumQuoteAgeMs:
        5_000,

      maximumCrossExchangePriceRatio:
        5,
    },

    observations: [
      "Authoritative opportunity fixture.",
    ],
  };
}

function createCoverageEvidence(
  executableQuotes =
    50,

  generatedAt =
    NOW +
    50,
): StrategyOneCoverageBaselineEvidence {
  return {
    generatedAt,

    summary: {
      cachedQuotes:
        100,

      executableQuotes,

      uniqueMarkets:
        60,

      sharedMarkets:
        20,

      pairableMarkets:
        executableQuotes >
          0
          ? 15
          : 0,

      generatedDirectionalPairs:
        executableQuotes >
          0
          ? 30
          : 0,

      registeredExchanges:
        2,

      connectedExchanges:
        2,
    },

    exchanges: [
      {
        exchange:
          "binance",

        connected:
          true,

        totalQuotes:
          50,

        executableQuotes:
          executableQuotes >
            0
            ? 25
            : 0,

        nonExecutableQuotes:
          executableQuotes >
            0
            ? 25
            : 50,

        uniqueMarkets:
          50,

        executableMarkets:
          executableQuotes >
            0
            ? 25
            : 0,

        executableCoveragePercent:
          executableQuotes >
            0
            ? 50
            : 0,
      },
      {
        exchange:
          "coindcx",

        connected:
          true,

        totalQuotes:
          50,

        executableQuotes:
          executableQuotes >
            0
            ? 25
            : 0,

        nonExecutableQuotes:
          executableQuotes >
            0
            ? 25
            : 50,

        uniqueMarkets:
          50,

        executableMarkets:
          executableQuotes >
            0
            ? 25
            : 0,

        executableCoveragePercent:
          executableQuotes >
            0
            ? 50
            : 0,
      },
    ],

    observations: [
      "Coverage fixture.",
    ],
  };
}

function createFreshnessEvidence(
  generatedAt =
    NOW +
    100,
): StrategyOneFreshnessBaselineEvidence {
  return {
    generatedAt,

    summary: {
      exchanges:
        2,

      connectedExchanges:
        2,

      totalQuotes:
        100,

      executableQuotes:
        50,

      freshExecutableQuotes:
        49,

      staleExecutableQuotes:
        1,

      freshnessCoveragePercent:
        98,

      totalEvictedSinceStart:
        0,
    },

    exchanges: [
      {
        exchange:
          "binance",

        connected:
          true,

        maximumQuoteAgeMs:
          5_000,

        maximumPairSkewMs:
          1_000,

        totalQuotes:
          50,

        executableQuotes:
          25,

        freshExecutableQuotes:
          24,

        staleExecutableQuotes:
          1,

        invalidTimestampExecutableQuotes:
          0,

        futureTimestampExecutableQuotes:
          0,

        freshnessCoveragePercent:
          96,

        averageExecutableAgeMs:
          100,

        oldestExecutableAgeMs:
          5_100,

        newestExecutableAgeMs:
          20,

        oldestExecutableMarket:
          "ETHUSDT",

        eviction: {
          scanned:
            0,

          staleDetected:
            0,

          evicted:
            0,
        },
      },
      {
        exchange:
          "coindcx",

        connected:
          true,

        maximumQuoteAgeMs:
          5_000,

        maximumPairSkewMs:
          1_000,

        totalQuotes:
          50,

        executableQuotes:
          25,

        freshExecutableQuotes:
          25,

        staleExecutableQuotes:
          0,

        invalidTimestampExecutableQuotes:
          0,

        futureTimestampExecutableQuotes:
          0,

        freshnessCoveragePercent:
          100,

        averageExecutableAgeMs:
          80,

        oldestExecutableAgeMs:
          200,

        newestExecutableAgeMs:
          10,

        oldestExecutableMarket:
          "BTCUSDT",

        eviction: {
          scanned:
            0,

          staleDetected:
            0,

          evicted:
            0,
        },
      },
    ],
  };
}

function createExternalReadinessEvidence(
  generatedAt =
    NOW +
    75,
): StrategyOneExternalReadinessEvidence {
  return {
    generatedAt,

    status:
      "NO_DATA",

    exchanges: [
      {
        exchange:
          "binance",

        adapterRegistered:
          true,

        credentialsConfigured:
          true,

        authenticationVerified:
          false,

        exchangeApiReachable:
          false,

        readOnlyVerificationFresh:
          false,

        lastVerificationError:
          "HTTP 401: invalid API key, IP, or permissions",

        reasons: [
          "Authenticated read-only exchange access has not been verified.",
        ],
      },
    ],
  };
}

function createSources(
  opportunity:
    StrategyOneOpportunityBaselineEvidence,

  coverage =
    createCoverageEvidence(),

  freshness =
    createFreshnessEvidence(),

  externalReadiness =
    createExternalReadinessEvidence(),
): {
  sources:
    StrategyOneForensicsBaselineSources;

  calls: {
    opportunity:
      number;

    coverage:
      number;

    freshness:
      number;

    externalReadiness:
      number;
  };
} {
  const calls = {
    opportunity:
      0,

    coverage:
      0,

    freshness:
      0,

    externalReadiness:
      0,
  };

  return {
    calls,

    sources: {
      getOpportunityEvidence: () => {
        calls.opportunity +=
          1;

        return opportunity;
      },

      getCoverageEvidence: () => {
        calls.coverage +=
          1;

        return coverage;
      },

      getFreshnessEvidence: () => {
        calls.freshness +=
          1;

        return freshness;
      },

      getExternalReadinessEvidence: () => {
        calls.externalReadiness +=
          1;

        return externalReadiness;
      },
    },
  };
}

function main():
  void {
  const feeConsumedFixture =
    createSources(
      createOpportunityEvidence(
        createFunnel(),
      ),
    );

  const service =
    new StrategyOneForensicsBaselineService(
      feeConsumedFixture.sources,
    );

  const report =
    service.getReport(
      NOW +
      100,
    );

  assert.equal(
    report.status,
    "RAW_EDGE_CONSUMED_BY_FEES",
  );

  assert.equal(
    report.evidenceQuality,
    "COMPLETE",
  );

  assert.equal(
    report.evidenceWindow.coherent,
    true,
  );

  assert.equal(
    report.comparison
      .historicalRuntimeValuesEmbedded,
    false,
  );

  assert.equal(
    report.blockers.some(
      (blocker) =>
        blocker.code ===
        "RAW_EDGE_CONSUMED_BY_FEES",
    ),
    true,
  );

  assert.equal(
    report.blockers.some(
      (blocker) =>
        blocker.code ===
          "AUTHENTICATED_READ_UNVERIFIED" &&
        blocker.exchange ===
          "binance",
    ),
    true,
    "Known authenticated-read failures must remain visible external blockers.",
  );

  assert.deepEqual(
    feeConsumedFixture.calls,
    {
      opportunity:
        1,

      coverage:
        1,

      freshness:
        1,

      externalReadiness:
        1,
    },
    "Each authoritative read model must be sampled once per baseline.",
  );

  assert.equal(
    Object.isFrozen(
      report,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      report.funnel,
    ),
    true,
  );

  assert.deepEqual(
    report.safety,
    {
      readOnly:
        true,

      tradingPolicyMutationAllowed:
        false,

      paperArmingAllowed:
        false,

      paperTradeAllowed:
        false,

      liveExecutionAllowed:
        false,

      capitalReservationAllowed:
        false,

      orderSubmissionAllowed:
        false,

      authenticatedOrderEndpointAllowed:
        false,
    },
  );

  const noExecutableFixture =
    createSources(
      createOpportunityEvidence(
        createFunnel({
          executionQualityEligibleQuotes:
            0,

          executionQualityFilteredQuotes:
            100,

          pairableMarkets:
            0,

          directionalExchangePairs:
            0,

          rawPositiveSpreads:
            0,

          freshPositiveSpreads:
            0,
        }),
      ),
      createCoverageEvidence(
        0,
      ),
    );

  assert.equal(
    new StrategyOneForensicsBaselineService(
      noExecutableFixture.sources,
    )
      .getReport(
        NOW +
        100,
      )
      .status,
    "NO_EXECUTABLE_QUOTES",
  );

  const acceptedFunnel =
    createFunnel({
      feePositiveSpreads:
        1,

      priceEconomicsThresholdPass:
        1,

      evaluatorPassed:
        1,

      acceptedOpportunities:
        1,
    });

  const acceptedFixture =
    createSources(
      createOpportunityEvidence(
        acceptedFunnel,
        NOW,
        1,
      ),
    );

  assert.equal(
    new StrategyOneForensicsBaselineService(
      acceptedFixture.sources,
    )
      .getReport(
        NOW +
        100,
      )
      .status,
    "ACCEPTED_OPPORTUNITIES_OBSERVED",
  );

  const incoherentFixture =
    createSources(
      createOpportunityEvidence(
        createFunnel(),
        NOW -
        10_000,
      ),
    );

  const incoherentReport =
    new StrategyOneForensicsBaselineService(
      incoherentFixture.sources,
    )
      .getReport(
        NOW +
        100,
      );

  assert.equal(
    incoherentReport
      .evidenceQuality,
    "PARTIAL",
  );

  assert.equal(
    incoherentReport
      .blockers
      .some(
        (blocker) =>
          blocker.code ===
          "INCOHERENT_EVIDENCE_WINDOW",
      ),
    true,
  );

  console.log(
    "Strategy #1 forensics baseline test passed.",
  );

  console.log(
    "No policy, PAPER, LIVE, capital, order, credential, or exchange state was mutated.",
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
