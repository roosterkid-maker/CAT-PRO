import assert
  from "node:assert/strict";

import type {
  PortfolioAssetPosition,
  PortfolioSnapshot,
} from "../../portfolio/models/PortfolioSnapshot";

import {
  HedgeInventoryManagementStrategyController,
} from "../hedge-inventory-management/HedgeInventoryManagementStrategyController";

import type {
  HedgeInventoryExposureSnapshotSource,
} from "../hedge-inventory-management/HedgeInventoryExposureEvaluator";

import {
  StrategyOrchestrator,
} from "../services/StrategyOrchestrator";

import {
  StrategyReadModelService,
} from "../services/StrategyReadModelService";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

class TestExposureSource
implements HedgeInventoryExposureSnapshotSource {
  constructor(
    private snapshot:
      PortfolioSnapshot | null,
  ) {}

  setSnapshot(
    snapshot:
      PortfolioSnapshot | null,
  ):
    void {
    this.snapshot =
      snapshot;
  }

  getPortfolioSnapshot():
    PortfolioSnapshot | null {
    return this.snapshot;
  }
}

const CONFIGURATION = {
  enabled:
    true,
  mode:
    "SHADOW" as const,
  valuationQuoteAsset:
    "USDT",
  assetAllowlist: [
    "BTC",
    "ETH",
    "SOL",
    "XRP",
  ],
  targetInventoryByAsset: {
    BTC:
      0.25,
    ETH:
      2,
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
} as const;

function main():
  void {
  const source =
    new TestExposureSource(
      createPortfolioSnapshot(
        1_000,
        [
          createAsset({
            exchange:
              "binance",
            asset:
              "BTC",
            totalBalance:
              0.2,
            priceUsdt:
              10_000,
            synchronizedAt:
              950,
          }),
          createAsset({
            exchange:
              "coindcx",
            asset:
              "BTC",
            totalBalance:
              0.2,
            priceUsdt:
              10_000,
            synchronizedAt:
              960,
          }),
          createAsset({
            exchange:
              "binance",
            asset:
              "ETH",
            totalBalance:
              1.75,
            priceUsdt:
              200,
            synchronizedAt:
              970,
          }),
          createAsset({
            exchange:
              "binance",
            asset:
              "SOL",
            totalBalance:
              9,
            priceUsdt:
              150,
            synchronizedAt:
              980,
          }),
        ],
      ),
    );

  const controller =
    new HedgeInventoryManagementStrategyController(
      CONFIGURATION,
      source,
    );

  controller.start();

  const exposure =
    controller.refreshExposureEvidence(
      1_100,
    );

  assert.equal(
    exposure.version,
    "22.1",
  );

  assert.equal(
    exposure.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    exposure.source,
    "PortfolioSnapshot",
  );

  assert.equal(
    exposure.sourceAgeMs,
    100,
  );

  assert.deepEqual(
    exposure.summary,
    {
      configuredAssets:
        4,
      assessedAssets:
        3,
      withinTargetAssets:
        1,
      hedgeReviewAssets:
        1,
      exposureLimitBreachedAssets:
        1,
      unavailableAssets:
        1,
      grossDeviationQuoteValue:
        1_700,
      hedgeActionableAssets:
        0,
    },
  );

  const btc =
    getAssessment(
      exposure,
      "BTC",
    );

  assert.deepEqual(
    {
      evidenceStatus:
        btc.evidenceStatus,
      actualQuantity:
        btc.actualQuantity,
      targetQuantity:
        btc.targetQuantity,
      deviationQuantity:
        btc.deviationQuantity,
      direction:
        btc.direction,
      deviationQuoteValue:
        btc.deviationQuoteValue,
      state:
        btc.state,
      urgency:
        btc.hedgeUrgency,
      exchanges:
        btc.observedExchanges,
    },
    {
      evidenceStatus:
        "AVAILABLE",
      actualQuantity:
        0.4,
      targetQuantity:
        0.25,
      deviationQuantity:
        0.15,
      direction:
        "EXCESS",
      deviationQuoteValue:
        1_500,
      state:
        "EXPOSURE_LIMIT_BREACHED",
      urgency:
        "URGENT",
      exchanges: [
        "binance",
        "coindcx",
      ],
    },
  );

  const eth =
    getAssessment(
      exposure,
      "ETH",
    );

  assert.deepEqual(
    {
      direction:
        eth.direction,
      deviationQuoteValue:
        eth.deviationQuoteValue,
      state:
        eth.state,
      urgency:
        eth.hedgeUrgency,
    },
    {
      direction:
        "DEFICIT",
      deviationQuoteValue:
        50,
      state:
        "WITHIN_TARGET",
      urgency:
        "NONE",
    },
  );

  const sol =
    getAssessment(
      exposure,
      "SOL",
    );

  assert.deepEqual(
    {
      direction:
        sol.direction,
      deviationQuoteValue:
        sol.deviationQuoteValue,
      state:
        sol.state,
      urgency:
        sol.hedgeUrgency,
    },
    {
      direction:
        "DEFICIT",
      deviationQuoteValue:
        150,
      state:
        "HEDGE_REVIEW",
      urgency:
        "NORMAL",
    },
  );

  const xrp =
    getAssessment(
      exposure,
      "XRP",
    );

  assert.deepEqual(
    {
      evidenceStatus:
        xrp.evidenceStatus,
      actualQuantity:
        xrp.actualQuantity,
      state:
        xrp.state,
      urgency:
        xrp.hedgeUrgency,
      blockers:
        xrp.blockers,
    },
    {
      evidenceStatus:
        "NO_DATA",
      actualQuantity:
        null,
      state:
        "NO_DATA",
      urgency:
        "UNKNOWN",
      blockers: [
        "ASSET_BALANCE_NOT_REPORTED",
      ],
    },
    "An absent balance must remain NO_DATA; V22.1 must not infer zero inventory.",
  );

  assert.equal(
    exposure.safety
      .classificationIsExecutionInstruction,
    false,
  );

  assert.equal(
    exposure.safety
      .hedgeProposalGenerated,
    false,
  );

  assert.equal(
    exposure.safety
      .hedgeIntentGenerated,
    false,
  );

  assert.equal(
    exposure.safety
      .orderSubmissionAllowed,
    false,
  );

  assert.equal(
    Object.isFrozen(
      exposure,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      exposure.assessments,
    ),
    true,
  );

  controller.refreshExposureEvidence(
    1_150,
  );

  const runtime =
    controller.getRuntimeSnapshot(
      1_150,
    );

  assert.deepEqual(
    {
      processedSnapshots:
        runtime.processedSnapshots,
      duplicateSnapshotsIgnored:
        runtime.duplicateSnapshotsIgnored,
      totalSignalsObserved:
        runtime.totalSignalsObserved,
      currentSignalCount:
        runtime.currentSignalCount,
      lastSnapshotGeneratedAt:
        runtime.lastSnapshotGeneratedAt,
      lastSnapshotAssessmentCount:
        runtime.lastSnapshotOpportunityCount,
      snapshotEvidence:
        runtime.evidence.snapshot,
      signalEvidence:
        runtime.evidence.signals,
    },
    {
      processedSnapshots:
        1,
      duplicateSnapshotsIgnored:
        1,
      totalSignalsObserved:
        0,
      currentSignalCount:
        0,
      lastSnapshotGeneratedAt:
        1_000,
      lastSnapshotAssessmentCount:
        3,
      snapshotEvidence:
        "AVAILABLE",
      signalEvidence:
        "NO_DATA",
    },
  );

  assert.deepEqual(
    controller.getSignals(),
    [],
    "Exposure classifications must not become executable StrategySignals.",
  );

  const stale =
    controller.getExposureSnapshot(
      1_501,
    );

  assert.equal(
    stale.evidenceStatus,
    "NO_DATA",
  );

  assert.deepEqual(
    stale.blockers,
    [
      "PORTFOLIO_EVIDENCE_STALE",
    ],
  );

  source.setSnapshot(
    createPortfolioSnapshot(
      2_000,
      [],
    ),
  );

  const futureDated =
    controller.refreshExposureEvidence(
      1_900,
    );

  assert.equal(
    futureDated.evidenceStatus,
    "NO_DATA",
  );

  assert.deepEqual(
    futureDated.blockers,
    [
      "PORTFOLIO_EVIDENCE_FUTURE_DATED",
    ],
  );

  source.setSnapshot(
    createPortfolioSnapshot(
      3_000,
      [
        createAsset({
          exchange:
            "binance",
          asset:
            "BTC",
          totalBalance:
            0.25,
          priceUsdt:
            10_000,
          synchronizedAt:
            2_000,
        }),
      ],
    ),
  );

  const staleBalance =
    controller.refreshExposureEvidence(
      3_100,
    );

  assert.deepEqual(
    getAssessment(
      staleBalance,
      "BTC",
    ).blockers,
    [
      "BALANCE_EVIDENCE_STALE",
      "VALUATION_EVIDENCE_STALE",
    ],
  );

  const mismatchedSource =
    new TestExposureSource({
      ...createPortfolioSnapshot(
        4_000,
        [],
      ),
      baseCurrency:
        "INR" as "USDT",
    });

  const mismatched =
    new HedgeInventoryManagementStrategyController(
      CONFIGURATION,
      mismatchedSource,
    );

  mismatched.start();

  assert.deepEqual(
    mismatched.refreshExposureEvidence(
      4_100,
    ).blockers,
    [
      "VALUATION_QUOTE_ASSET_MISMATCH",
    ],
  );

  const registry =
    new StrategyRegistry();

  registry.register(
    controller,
  );

  const orchestrator =
    new StrategyOrchestrator(
      registry,
    );

  const readModel =
    new StrategyReadModelService(
      registry,
      orchestrator,
    );

  source.setSnapshot(
    createPortfolioSnapshot(
      5_000,
      [
        createAsset({
          exchange:
            "binance",
          asset:
            "BTC",
          totalBalance:
            0.25,
          priceUsdt:
            10_000,
          synchronizedAt:
            4_950,
        }),
      ],
    ),
  );

  controller.refreshExposureEvidence(
    5_100,
  );

  const detail =
    readModel.getById(
      "hedge-inventory-management",
      5_100,
    );

  assert.ok(
    detail,
  );

  assert.equal(
    detail.exposure.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    detail.hedgeTargets.evidenceStatus,
    "AVAILABLE",
  );

  assert.equal(
    (
      detail.hedgeTargets.value as ReturnType<
        HedgeInventoryManagementStrategyController["getHedgeTargetSnapshot"]
      >
    ).summary.actionableTargets,
    0,
  );

  assert.equal(
    detail.signals.records.length,
    0,
  );

  assert.equal(
    detail.intents.evidenceStatus,
    "NO_DATA",
  );

  assert.equal(
    detail.safety.intentGenerationAllowed,
    true,
  );

  controller.stop();
  mismatched.stop();

  console.log(
    "Hedge / inventory-management V22.1 exposure-assessment test passed.",
  );

  console.log(
    "Fresh portfolio evidence was classified read-only; missing/stale/future/mismatched evidence failed closed and no signal, intent, hedge, balance, capital, PAPER, LIVE or order action occurred.",
  );
}

function getAssessment(
  snapshot:
    ReturnType<
      HedgeInventoryManagementStrategyController["getExposureSnapshot"]
    >,
  asset:
    string,
) {
  const assessment =
    snapshot.assessments.find(
      (candidate) =>
        candidate.asset ===
        asset,
    );

  assert.ok(
    assessment,
    `Expected ${asset} assessment.`,
  );

  return assessment;
}

function createAsset(
  input: {
    exchange: string;
    asset: string;
    totalBalance: number;
    priceUsdt: number;
    synchronizedAt: number;
  },
): PortfolioAssetPosition {
  const totalValueUsdt =
    input.totalBalance *
    input.priceUsdt;

  return {
    exchange:
      input.exchange,
    asset:
      input.asset,
    availableBalance:
      input.totalBalance,
    lockedBalance:
      0,
    totalBalance:
      input.totalBalance,
    priceUsdt:
      input.priceUsdt,
    availableValueUsdt:
      totalValueUsdt,
    lockedValueUsdt:
      0,
    totalValueUsdt,
    valuationMarket:
      `${input.asset}USDT`,
    valuationSource:
      "BEST_BID",
    valuationTimestamp:
      input.synchronizedAt,
    valuationAgeMs:
      0,
    synchronizedAt:
      input.synchronizedAt,
    balanceAgeMs:
      0,
  };
}

function createPortfolioSnapshot(
  generatedAt:
    number,
  assets:
    readonly PortfolioAssetPosition[],
): PortfolioSnapshot {
  const byExchange =
    new Map<
      string,
      PortfolioAssetPosition[]
    >();

  for (
    const asset
    of assets
  ) {
    const current =
      byExchange.get(
        asset.exchange,
      ) ??
      [];

    current.push(
      asset,
    );

    byExchange.set(
      asset.exchange,
      current,
    );
  }

  const exchanges =
    [
      ...byExchange.entries(),
    ].map(
      ([exchange, positions]) => {
        const totalEquityUsdt =
          positions.reduce(
            (
              total,
              position,
            ) =>
              total +
              position.totalValueUsdt!,
            0,
          );

        return {
          exchange,
          assets:
            positions,
          assetCount:
            positions.length,
          valuedAssetCount:
            positions.length,
          unvaluedAssetCount:
            0,
          totalEquityUsdt,
          availableEquityUsdt:
            totalEquityUsdt,
          lockedEquityUsdt:
            0,
          directUsdtAvailable:
            0,
          directUsdtLocked:
            0,
          directUsdtTotal:
            0,
          oldestBalanceAgeMs:
            0,
          newestBalanceAgeMs:
            0,
          lastSynchronizedAt:
            Math.max(
              ...positions.map(
                (position) =>
                  position.synchronizedAt,
              ),
            ),
        };
      },
    );

  const totalEquityUsdt =
    assets.reduce(
      (
        total,
        asset,
      ) =>
        total +
        asset.totalValueUsdt!,
      0,
    );

  return {
    baseCurrency:
      "USDT",
    generatedAt,
    capital: {
      mode:
        "PAPER",
      accountInitialCapital:
        0,
      accountCurrentCapital:
        0,
      accountAvailableCapital:
        0,
      accountReservedCapital:
        0,
      synchronizedExchangeEquityUsdt:
        totalEquityUsdt,
      synchronizedExchangeAvailableEquityUsdt:
        totalEquityUsdt,
      synchronizedExchangeLockedEquityUsdt:
        0,
      liquidUsdt:
        0,
      tradableCapitalUsdt:
        0,
    },
    exchanges,
    totals: {
      exchanges:
        exchanges.length,
      assets:
        assets.length,
      valuedAssets:
        assets.length,
      unvaluedAssets:
        0,
      totalEquityUsdt,
      availableEquityUsdt:
        totalEquityUsdt,
      lockedEquityUsdt:
        0,
      liquidUsdt:
        0,
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
