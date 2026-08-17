import assert
  from "node:assert/strict";

import {
  CrossExchangeArbitrageStrategyController,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import type {
  CrossExchangeOpportunitySnapshotSource,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import {
  CrossExchangeMarketMakingStrategyController,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingStrategyController";

import type {
  CrossExchangeMarketMakingConfigurationInput,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingLifecycleSnapshot,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingMakerLifecycleSimulator";

import type {
  CrossExchangeMarketMakingShadowAnalyticsSnapshot,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingShadowAnalyticsService";

import {
  StrategyOrchestrator,
} from "../services/StrategyOrchestrator";

import {
  StrategyReadModelService,
} from "../services/StrategyReadModelService";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

const EMPTY_OPPORTUNITY_SOURCE:
  CrossExchangeOpportunitySnapshotSource = {
  getLastOpportunitySnapshot: () =>
    null,

  subscribeToOpportunitySnapshots: () =>
    () => {},
};

function main():
  void {
  const controller =
    new CrossExchangeMarketMakingStrategyController();

  const metadata =
    controller.getMetadata();

  assert.equal(
    metadata.id,
    "cross-exchange-market-making",
  );

  assert.equal(
    metadata.strategyNumber,
    2,
  );

  assert.equal(
    metadata.version,
    "21.7",
  );

  assert.equal(
    metadata.category,
    "CROSS_EXCHANGE_MARKET_MAKING",
  );

  assert.equal(
    metadata.controllerMode,
    "SHADOW_ONLY",
  );

  assert.equal(
    metadata.signalSource,
    "XEMMPriceEngine",
  );

  assert.deepEqual(
    metadata.capabilities,
    {
      signalAdaptation:
        true,

      intentGeneration:
        true,

      automaticExecution:
        false,

      paperExecution:
        false,

      liveExecution:
        false,
    },
  );

  const defaultConfiguration =
    controller.getConfiguration();

  assert.equal(
    defaultConfiguration.enabled,
    false,
  );

  assert.equal(
    defaultConfiguration.mode,
    "SHADOW",
  );

  assert.equal(
    defaultConfiguration.state,
    "DISABLED",
  );

  assert.equal(
    defaultConfiguration.makerExchange,
    null,
  );

  assert.equal(
    defaultConfiguration.hedgeExchange,
    null,
  );

  assert.deepEqual(
    defaultConfiguration.venuePairs,
    [],
  );

  assert.deepEqual(
    defaultConfiguration.marketAllowlist,
    [],
    "V21.5 must not infer a market universe.",
  );

  assert.deepEqual(
    defaultConfiguration.blockers,
    [
      "STRATEGY_DISABLED",
      "MAKER_EXCHANGE_REQUIRED",
      "HEDGE_EXCHANGE_REQUIRED",
      "MARKET_ALLOWLIST_REQUIRED",
      "MINIMUM_RETAINED_EDGE_REQUIRED",
    ],
  );

  assert.equal(
    Object.isFrozen(
      defaultConfiguration,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      defaultConfiguration
        .marketAllowlist,
    ),
    true,
  );

  assert.equal(
    Object.values(
      defaultConfiguration.safety,
    ).every(
      (value) =>
        value ===
        false ||
        value ===
        true,
    ),
    true,
  );

  assert.deepEqual(
    defaultConfiguration.safety,
    {
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
  );

  assert.deepEqual(
    defaultConfiguration.makerLifecycle,
    {
      enabled:
        false,
      quantityByMarket:
        {},
      maximumOrderAgeMs:
        null,
      minimumRepriceTicks:
        null,
      state:
        "DISABLED",
      blockers: [
        "LIFECYCLE_SIMULATION_DISABLED",
        "STRATEGY_CONFIGURATION_NOT_READY",
        "MAXIMUM_ORDER_AGE_REQUIRED",
        "MINIMUM_REPRICE_TICKS_REQUIRED",
      ],
    },
  );

  assert.deepEqual(
    defaultConfiguration.makerFill,
    {
      enabled:
        false,
      minimumRestingTimeMs:
        null,
      minimumTradeThroughTicks:
        null,
      hedgeIntentTtlMs:
        null,
      queueAwarePartialFillsEnabled:
        false,
      maximumPublicTradeAgeMs:
        null,
      state:
        "DISABLED",
      blockers: [
        "FILL_SIMULATION_DISABLED",
        "MAKER_LIFECYCLE_NOT_READY",
        "MINIMUM_RESTING_TIME_REQUIRED",
        "MINIMUM_TRADE_THROUGH_TICKS_REQUIRED",
        "HEDGE_INTENT_TTL_REQUIRED",
      ],
    },
  );

  let forwardedSignals =
    0;

  const unsubscribe =
    controller.subscribeToSignals(
      () => {
        forwardedSignals +=
          1;
      },
    );

  controller.start();
  controller.start();

  const disabledRuntime =
    controller.getRuntimeSnapshot(
      1_000,
    );

  assert.equal(
    disabledRuntime.running,
    false,
    "The default DISABLED configuration must not enter the observing lifecycle.",
  );

  assert.equal(
    disabledRuntime.startCount,
    0,
  );

  assert.equal(
    disabledRuntime.currentSignalCount,
    0,
  );

  assert.equal(
    disabledRuntime.totalSignalsObserved,
    0,
  );

  assert.equal(
    disabledRuntime.evidence.snapshot,
    "NO_DATA",
  );

  assert.equal(
    disabledRuntime.evidence.signals,
    "NO_DATA",
  );

  assert.equal(
    disabledRuntime.evidence.performance,
    "NO_DATA",
  );

  assert.deepEqual(
    controller.getSignals(),
    [],
  );

  assert.equal(
    forwardedSignals,
    0,
    "Default-disabled V21.5 must not manufacture XEMM signals.",
  );

  controller.stop();
  controller.stop();
  unsubscribe();

  assert.equal(
    controller
      .getRuntimeSnapshot(
        2_000,
      )
      .stopCount,
    0,
    "A disabled controller has no active lifecycle to stop.",
  );

  const configured =
    new CrossExchangeMarketMakingStrategyController({
      enabled:
        true,

      mode:
        "SHADOW",

      makerExchange:
        " CoinDCX ",

      hedgeExchange:
        " Binance ",

      marketAllowlist: [
        "eth-usdt",
        "BTC_USDT",
        "ETHUSDT",
      ],

      minimumRetainedEdgePercent:
        0.2,
    });

  assert.deepEqual(
    configured.getConfiguration(),
    {
      version:
        "21.5",

      strategyId:
        "cross-exchange-market-making",

      enabled:
        true,

      mode:
        "SHADOW",

      makerExchange:
        "coindcx",

      hedgeExchange:
        "binance",

      venuePairs: [{
        key: "coindcx>binance",
        priority: 0,
        makerExchange: "coindcx",
        hedgeExchange: "binance",
      }],

      routeStability: {
        minimumConsecutivePasses: 3,
        minimumDwellMs: 2_000,
        failoverCooldownMs: 5_000,
      },

      marketAllowlist: [
        "BTCUSDT",
        "ETHUSDT",
      ],

      minimumRetainedEdgePercent:
        0.2,

      maximumCapabilityAgeMs:
        300_000,

      makerLifecycle: {
        enabled:
          false,
        quantityByMarket:
          {},
        maximumOrderAgeMs:
          null,
        minimumRepriceTicks:
          null,
        state:
          "DISABLED",
        blockers: [
          "LIFECYCLE_SIMULATION_DISABLED",
          "SHADOW_ORDER_QUANTITY_REQUIRED",
          "MAXIMUM_ORDER_AGE_REQUIRED",
          "MINIMUM_REPRICE_TICKS_REQUIRED",
        ],
      },

      makerFill: {
        enabled:
          false,
        minimumRestingTimeMs:
          null,
        minimumTradeThroughTicks:
          null,
        hedgeIntentTtlMs:
          null,
        queueAwarePartialFillsEnabled:
          false,
        maximumPublicTradeAgeMs:
          null,
        state:
          "DISABLED",
        blockers: [
          "FILL_SIMULATION_DISABLED",
          "MAKER_LIFECYCLE_NOT_READY",
          "MINIMUM_RESTING_TIME_REQUIRED",
          "MINIMUM_TRADE_THROUGH_TICKS_REQUIRED",
          "HEDGE_INTENT_TTL_REQUIRED",
        ],
      },

      state:
        "FOUNDATION_READY",

      blockers:
        [],

      safety:
        defaultConfiguration.safety,
    },
  );

  configured.start();
  configured.start();

  assert.equal(
    configured.isRunning(),
    true,
  );

  assert.deepEqual(
    configured.getSchedulerDiagnostics(),
    {
      running:
        true,
      intervalMs:
        1_000,
      scheduledRefreshes:
        0,
      failures:
        0,
    },
    "Enabled XEMM must own a bounded read-only pricing scheduler.",
  );

  assert.equal(
    configured
      .getRuntimeSnapshot(
        2_500,
      )
      .startCount,
    1,
    "Enabled XEMM controller start must be idempotent.",
  );

  configured.stop();
  configured.stop();

  assert.equal(
    configured
      .getSchedulerDiagnostics()
      .running,
    false,
    "XEMM scheduler must stop with its controller.",
  );

  assert.equal(
    configured
      .getRuntimeSnapshot(
        2_600,
      )
      .stopCount,
    1,
    "Enabled XEMM controller stop must be idempotent.",
  );

  assert.throws(
    () => {
      new CrossExchangeMarketMakingStrategyController({
        mode:
          "PAPER",
      } as unknown as CrossExchangeMarketMakingConfigurationInput);
    },
    /SHADOW-only/,
    "PAPER mode must fail closed.",
  );

  assert.throws(
    () => {
      new CrossExchangeMarketMakingStrategyController({
        enabled:
          true,

        makerExchange:
          "binance",

        hedgeExchange:
          "BINANCE",

        marketAllowlist: [
          "BTCUSDT",
        ],
      });
    },
    /must be different/,
    "Maker and hedge venues must be independent.",
  );

  const incomplete =
    new CrossExchangeMarketMakingStrategyController({
      enabled:
        true,

      makerExchange:
        "coindcx",
    });

  incomplete.start();

  assert.equal(
    incomplete.isRunning(),
    false,
    "An enabled but incomplete XEMM configuration must remain stopped.",
  );

  assert.equal(
    incomplete
      .getConfiguration()
      .state,
    "INCOMPLETE",
  );

  assert.throws(
    () => {
      new CrossExchangeMarketMakingStrategyController({
        marketAllowlist: [
          "---",
        ],
      });
    },
    /Invalid XEMM market identifier/,
  );

  assert.throws(
    () => {
      new CrossExchangeMarketMakingStrategyController({
        minimumRetainedEdgePercent:
          -0.01,
      });
    },
    /finite non-negative/,
  );

  assert.throws(
    () => {
      new CrossExchangeMarketMakingStrategyController({
        maximumCapabilityAgeMs:
          0,
      });
    },
    /positive safe integer/,
  );

  assert.throws(
    () => {
      new CrossExchangeMarketMakingStrategyController({
        enabled:
          true,
        makerExchange:
          "bybit",
        hedgeExchange:
          "binance",
        marketAllowlist: [
          "BTCUSDT",
        ],
        minimumRetainedEdgePercent:
          0.2,
        makerLifecycle: {
          quantityByMarket: {
            ETHUSDT:
              0.01,
          },
        },
      });
    },
    /not allowlisted/,
  );

  const registry =
    new StrategyRegistry();

  registry.register(
    configured,
  );

  registry.register(
    new CrossExchangeArbitrageStrategyController(
      {},
      EMPTY_OPPORTUNITY_SOURCE,
    ),
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

  assert.deepEqual(
    readModel
      .getAll(
        3_000,
      )
      .strategies
      .map(
        (strategy) =>
          strategy.metadata.id,
      ),
    [
      "cross-exchange-arbitrage",
      "cross-exchange-market-making",
    ],
    "Strategy #2 must be registered after Strategy #1.",
  );

  const detail =
    readModel.getById(
      "cross-exchange-market-making",
      3_000,
    );

  assert.ok(
    detail,
  );

  assert.equal(
    detail.configuration
      .evidenceStatus,
    "AVAILABLE",
  );

  assert.deepEqual(
    detail.configuration.value,
    configured.getConfiguration(),
  );

  assert.equal(
    detail.lifecycle.evidenceStatus,
    "NO_DATA",
  );

  assert.deepEqual(
    {
      configurationState:
        (
          detail.lifecycle.value as unknown as
            CrossExchangeMarketMakingLifecycleSnapshot
        ).configurationState,
      activeOrderCount:
        (
          detail.lifecycle.value as unknown as
            CrossExchangeMarketMakingLifecycleSnapshot
        ).activeOrderCount,
    },
    {
      configurationState:
        "DISABLED",
      activeOrderCount:
        0,
    },
  );

  assert.equal(
    detail.signals.evidenceStatus,
    "NO_DATA",
  );

  assert.equal(
    detail.intents.evidenceStatus,
    "NO_DATA",
  );

  assert.equal(
    detail.fillAndHedge.evidenceStatus,
    "NO_DATA",
  );

  assert.equal(
    detail.shadowAnalytics.evidenceStatus,
    "NO_DATA",
  );

  assert.equal(
    (
      detail.shadowAnalytics.value as unknown as
        CrossExchangeMarketMakingShadowAnalyticsSnapshot
    ).readiness
      .paperEligible,
    false,
  );

  assert.equal(
    detail.safety
      .paperExecutionAllowed,
    false,
  );

  assert.equal(
    detail.safety
      .liveExecutionAllowed,
    false,
  );

  for (
    const forbiddenMethod
    of [
      "calculateMakerPrice",
      "placeMakerOrder",
      "simulateMakerOrder",
      "simulateMakerFill",
      "createHedgeIntent",
      "reserveCapital",
      "submitOrder",
      "execute",
    ]
  ) {
    assert.equal(
      forbiddenMethod in
        configured,
      false,
      `V21.5 controller must not expose ${forbiddenMethod}.`,
    );
  }

  console.log(
    "Cross-exchange market-making foundation test passed.",
  );

  console.log(
    "Strategy #2 remained SHADOW-only; the default-disabled foundation produced no price, signal, intent, simulation, PAPER, LIVE, capital, or order action.",
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
