import type {
  StrategyController,
  StrategySignalListener,
} from "../contracts/StrategyController";

import {
  CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
} from "../models/StrategyMetadata";

import type {
  StrategyMetadata,
} from "../models/StrategyMetadata";

import type {
  StrategyRuntimeSnapshot,
} from "../models/StrategyRuntimeSnapshot";

import {
  immutableStrategySignal,
} from "../models/StrategySignal";

import type {
  CrossExchangeMarketMakingStrategySignal,
  StrategySignal,
} from "../models/StrategySignal";

import {
  createCrossExchangeMarketMakingConfiguration,
} from "./CrossExchangeMarketMakingConfiguration";

import type {
  CrossExchangeMarketMakingConfiguration,
  CrossExchangeMarketMakingConfigurationInput,
} from "./CrossExchangeMarketMakingConfiguration";

import {
  CrossExchangeMarketMakingPriceEngine,
} from "./CrossExchangeMarketMakingPriceEngine";

import type {
  CrossExchangeMarketMakingPricingSnapshot,
} from "./CrossExchangeMarketMakingPriceEngine";

import {
  CrossExchangeMarketMakingMakerLifecycleSimulator,
} from "./CrossExchangeMarketMakingMakerLifecycleSimulator";

import type {
  CrossExchangeMarketMakingLifecycleSnapshot,
} from "./CrossExchangeMarketMakingMakerLifecycleSimulator";

import {
  CrossExchangeMarketMakingFillAndHedgeSimulator,
} from "./CrossExchangeMarketMakingFillAndHedgeSimulator";

import type {
  CrossExchangeMarketMakingFillAndHedgeSnapshot,
} from "./CrossExchangeMarketMakingFillAndHedgeSimulator";

import type {
  StrategyIntent,
} from "../models/StrategyIntent";

import {
  CrossExchangeMarketMakingShadowAnalyticsService,
} from "./CrossExchangeMarketMakingShadowAnalyticsService";

import type {
  CrossExchangeMarketMakingShadowAnalyticsSnapshot,
} from "./CrossExchangeMarketMakingShadowAnalyticsService";

import type {
  CrossExchangeMarketMakingInventoryRouteSelector,
  CrossExchangeMarketMakingInventoryRoutingSnapshot,
} from "./CrossExchangeMarketMakingInventoryRouteSelector";

import type {
  CrossExchangeMarketMakingVenueRouteSelector,
  CrossExchangeMarketMakingVenueRoutingReport,
} from "./CrossExchangeMarketMakingVenueRouteSelector";

import {
  crossExchangeMarketMakingPublicTradeTapeService,
} from "./CrossExchangeMarketMakingPublicTradeTapeService";

const METADATA:
  StrategyMetadata = {
  id:
    CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,

  strategyNumber:
    2,

  displayName:
    "Cross-Exchange Market Making",

  version:
    "21.7",

  category:
    "CROSS_EXCHANGE_MARKET_MAKING",

  description:
    "SHADOW-only multi-venue XEMM pricing, funded route failover, lifecycle, public-trade FIFO partial-fill simulation, hedge evidence and fail-closed readiness.",

  controllerMode:
    "SHADOW_ONLY",

  signalSource:
    "XEMMPriceEngine",

  legacyHistoryAttribution:
    "UNATTRIBUTED_LEGACY",

  capabilities: {
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
};

/**
 * V21.7 owns read-only multi-venue XEMM pricing, operator-approved funded
 * route failover, inventory-aware direction selection,
 * maker lifecycle, conservative public
 * trade FIFO partial-fill simulation, non-executable hedge intents and
 * fail-closed SHADOW readiness. Its optional account dependency can only read
 * synchronized balance snapshots; it has no balance mutation, transfer, order
 * adapter, capital, execution, PAPER or LIVE capability.
 */
export class CrossExchangeMarketMakingStrategyController
implements StrategyController {
  private static readonly DEFAULT_PRICING_REFRESH_INTERVAL_MS =
    1_000;

  private static readonly MINIMUM_PRICING_REFRESH_INTERVAL_MS =
    250;

  private static readonly MAXIMUM_PRICING_REFRESH_INTERVAL_MS =
    10_000;

  private readonly configuration:
    CrossExchangeMarketMakingConfiguration;

  private readonly listeners =
    new Set<
      StrategySignalListener
    >();

  private currentSignals:
    readonly CrossExchangeMarketMakingStrategySignal[] =
    [];

  private pricingRefreshTimer:
    NodeJS.Timeout | null =
    null;

  private scheduledRefreshes =
    0;

  private schedulerFailures =
    0;

  private lastPricingSnapshots:
    readonly CrossExchangeMarketMakingPricingSnapshot[] =
    [];

  private running =
    false;

  private startCount =
    0;

  private stopCount =
    0;

  private processedSnapshots =
    0;

  private duplicateSnapshotsIgnored =
    0;

  private totalSignalsObserved =
    0;

  private lastStartedAt:
    number | null =
    null;

  private lastStoppedAt:
    number | null =
    null;

  private lastSnapshotGeneratedAt:
    number | null =
    null;

  private lastSnapshotReceivedAt:
    number | null =
    null;

  private lastSnapshotOpportunityCount:
    number | null =
    null;

  private lastSignalObservedAt:
    number | null =
    null;

  private lastError:
    string | null =
    null;

  constructor(
    configuration:
      CrossExchangeMarketMakingConfigurationInput = {},

    private readonly priceEngine:
      CrossExchangeMarketMakingPriceEngine =
        new CrossExchangeMarketMakingPriceEngine(),

    private readonly lifecycleSimulator:
      CrossExchangeMarketMakingMakerLifecycleSimulator =
        new CrossExchangeMarketMakingMakerLifecycleSimulator(),

    private readonly fillAndHedgeSimulator:
      CrossExchangeMarketMakingFillAndHedgeSimulator =
        new CrossExchangeMarketMakingFillAndHedgeSimulator(),

    private readonly shadowAnalyticsService:
      CrossExchangeMarketMakingShadowAnalyticsService =
        new CrossExchangeMarketMakingShadowAnalyticsService(),

    private readonly inventoryRouteSelector:
      CrossExchangeMarketMakingInventoryRouteSelector | null =
        null,

    private readonly venueRouteSelector:
      CrossExchangeMarketMakingVenueRouteSelector | null =
        null,
  ) {
    this.configuration =
      createCrossExchangeMarketMakingConfiguration(
        configuration,
      );

    if (
      this.configuration.enabled &&
      this.configuration
        .makerFill
        .queueAwarePartialFillsEnabled
    ) {
      for (const makerExchange of new Set(this.configuration.venuePairs.map((pair) => pair.makerExchange))) {
        crossExchangeMarketMakingPublicTradeTapeService.watch(
          makerExchange,
          this.configuration.marketAllowlist,
        );
      }
    }
  }

  getMetadata():
    StrategyMetadata {
    return structuredClone(
      METADATA,
    );
  }

  getConfiguration():
    CrossExchangeMarketMakingConfiguration {
    return this.configuration;
  }

  getDiagnosticEvidence():
    unknown {
    return this.getPricingSnapshots();
  }

  start():
    void {
    if (
      this.running ||
      this.configuration
        .state !==
        "FOUNDATION_READY"
    ) {
      return;
    }

    this.running =
      true;

    this.startCount +=
      1;

    this.lastStartedAt =
      Date.now();

    this.startPricingScheduler();
  }

  stop():
    void {
    if (
      !this.running
    ) {
      return;
    }

    const stoppedAt =
      Math.max(
        Date.now(),
        this.lastSnapshotGeneratedAt ??
          0,
      );

    this.lifecycleSimulator
      .cancelAll(
        "CONTROLLER_STOPPED",
        stoppedAt,
        this.configuration,
      );

    this.stopPricingScheduler();

    this.running =
      false;

    this.stopCount +=
      1;

    this.lastStoppedAt =
      stoppedAt;
  }

  isRunning():
    boolean {
    return this.running;
  }

  /** Read-only pricing refresh. It cannot submit PAPER or LIVE work. */
  refreshPricingEvidence(
    now =
      Date.now(),
  ): readonly CrossExchangeMarketMakingPricingSnapshot[] {
    if (
      !Number.isFinite(
        now,
      ) ||
      now <=
        0
    ) {
      this.lastError =
        "XEMM pricing evidence timestamp must be a positive finite number.";

      return [];
    }

    const snapshots =
      this.configuration
        .venuePairs
        .flatMap(
          (pair) => {
            const routeConfiguration: CrossExchangeMarketMakingConfiguration = {
              ...this.configuration,
              makerExchange: pair.makerExchange,
              hedgeExchange: pair.hedgeExchange,
            };

            return this.configuration.marketAllowlist.map((market) =>
              this.priceEngine.evaluate(routeConfiguration, market, this.running, now));
          },
        );

    if (
      !this.running
    ) {
      return immutableClone(
        snapshots,
      );
    }

    if (
      this.lastSnapshotGeneratedAt ===
      now
    ) {
      this.duplicateSnapshotsIgnored +=
        1;

      return immutableClone(
        this.lastPricingSnapshots,
      );
    }

    const inventoryErrors: string[] = [];

    const selectedRoute =
      this.venueRouteSelector
        ?.select(
          snapshots,
          this.configuration,
          now,
        ) ??
      null;

    const signals = selectedRoute
      ? selectedRoute.selected
        ? [this.toSignal(selectedRoute.selected.evidence, selectedRoute.selected.expiresAt, now)]
        : []
      : snapshots
        .flatMap(
          (snapshot) =>
            snapshot.results
              .filter(
                (
                  result,
                ): result is typeof result & {
                  evidence: NonNullable<typeof result.evidence>;
                  expiresAt: number;
                } =>
                  result.status ===
                    "ACCEPTED" &&
                  result.evidence !==
                    null &&
                  result.expiresAt !==
                    null,
              )
              .flatMap(
                (result) => {
                  if (
                    this.inventoryRouteSelector
                  ) {
                    try {
                      const assessment =
                        this.inventoryRouteSelector
                          .evaluate(
                            result.evidence,
                            now,
                          );

                      if (
                        assessment.state !==
                          "FEASIBLE"
                      ) {
                        return [];
                      }
                    } catch (
                      error:
                        unknown
                    ) {
                      inventoryErrors.push(
                        error instanceof Error
                          ? error.message
                          : "Unknown XEMM inventory route evaluation error.",
                      );

                      return [];
                    }
                  }

                  return [
                    this.toSignal(
                      result.evidence,
                      result.expiresAt,
                      now,
                    ),
                  ];
                },
              ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.id.localeCompare(
              second.id,
            ),
        );

    this.lastPricingSnapshots =
      immutableClone(
        snapshots,
      );

    this.currentSignals =
      signals;

    this.processedSnapshots +=
      1;

    this.totalSignalsObserved +=
      signals.length;

    this.lastSnapshotGeneratedAt =
      now;

    this.lastSnapshotReceivedAt =
      now;

    this.lastSnapshotOpportunityCount =
      signals.length;

    this.lastSignalObservedAt =
      signals.length >
        0
        ? now
        : this.lastSignalObservedAt;

    this.lastError =
      inventoryErrors[0] ??
      null;

    const lifecycleBeforeRefresh =
      this.lifecycleSimulator
        .getSnapshot(
          this.configuration,
          this.running,
          now,
        );

    const fillAndHedge =
      this.fillAndHedgeSimulator
        .observe(
          lifecycleBeforeRefresh,
          snapshots,
          this.configuration,
          this.running,
          now,
        );

    for (
      const orderId
      of fillAndHedge
        .newlyFilledOrderIds
    ) {
      this.lifecycleSimulator
        .markSimulatedFilled(
          orderId,
          now,
        );
    }

    const lifecycle =
      this.lifecycleSimulator
      .observe(
        snapshots,
        this.configuration,
        this.running,
        now,
      );

    this.shadowAnalyticsService
      .observe(
        snapshots,
        lifecycle,
        fillAndHedge,
        this.configuration,
        now,
      );

    for (
      const signal
      of signals
    ) {
      for (
        const listener
        of this.listeners
      ) {
        try {
          listener(
            immutableStrategySignal(
              signal,
            ),
          );
        } catch (
          error:
            unknown
        ) {
          console.error(
            "[CrossExchangeMarketMakingStrategyController] Read-only signal listener failed:",
            error instanceof Error
              ? error.message
              : "Unknown XEMM signal listener error.",
          );
        }
      }
    }

    return immutableClone(
      this.lastPricingSnapshots,
    );
  }

  getPricingSnapshots():
    readonly CrossExchangeMarketMakingPricingSnapshot[] {
    return immutableClone(
      this.lastPricingSnapshots,
    );
  }

  getInventoryFeasibilitySnapshot(
    now =
      Date.now(),
  ): CrossExchangeMarketMakingInventoryRoutingSnapshot | null {
    return this.inventoryRouteSelector
      ?.getSnapshot(
        now,
      ) ??
      null;
  }

  getVenueRoutingSnapshot(): CrossExchangeMarketMakingVenueRoutingReport | null {
    return this.venueRouteSelector
      ?.getSnapshot() ??
      null;
  }

  getSchedulerDiagnostics(): {
    running: boolean;
    intervalMs: number;
    scheduledRefreshes: number;
    failures: number;
  } {
    return {
      running:
        this.pricingRefreshTimer !==
        null,
      intervalMs:
        this.resolvePricingRefreshIntervalMs(),
      scheduledRefreshes:
        this.scheduledRefreshes,
      failures:
        this.schedulerFailures,
    };
  }

  getLifecycleSnapshot(
    now =
      Date.now(),
  ): CrossExchangeMarketMakingLifecycleSnapshot {
    return this.lifecycleSimulator
      .getSnapshot(
        this.configuration,
        this.running,
        now,
      );
  }

  getFillAndHedgeSnapshot(
    now =
      Date.now(),
  ): CrossExchangeMarketMakingFillAndHedgeSnapshot {
    return this.fillAndHedgeSimulator
      .getSnapshot(
        this.configuration,
        this.running,
        now,
      );
  }

  getIntents(
    now =
      Date.now(),
  ): readonly StrategyIntent[] {
    return this.fillAndHedgeSimulator
      .getIntents(
        now,
      );
  }

  getShadowAnalyticsSnapshot(
    now =
      Date.now(),
  ): CrossExchangeMarketMakingShadowAnalyticsSnapshot {
    return this.shadowAnalyticsService
      .getSnapshot(
        this.configuration,
        now,
      );
  }

  getRuntimeSnapshot(
    now =
      Date.now(),
  ):
    StrategyRuntimeSnapshot {
    const snapshotAvailable =
      this.lastSnapshotGeneratedAt !==
        null &&
      now >=
        this.lastSnapshotGeneratedAt &&
      now -
        this.lastSnapshotGeneratedAt <=
        this.configuration
          .maximumCapabilityAgeMs;

    const signals =
      this.getSignals(
        now,
      );

    return {
      strategyId:
        CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,

      generatedAt:
        now,

      running:
        this.running,

      startCount:
        this.startCount,

      stopCount:
        this.stopCount,

      lastStartedAt:
        this.lastStartedAt,

      lastStoppedAt:
        this.lastStoppedAt,

      processedSnapshots:
        this.processedSnapshots,

      duplicateSnapshotsIgnored:
        this.duplicateSnapshotsIgnored,

      totalSignalsObserved:
        this.totalSignalsObserved,

      currentSignalCount:
        signals.length,

      lastSnapshotGeneratedAt:
        this.lastSnapshotGeneratedAt,

      lastSnapshotReceivedAt:
        this.lastSnapshotReceivedAt,

      lastSnapshotOpportunityCount:
        this.lastSnapshotOpportunityCount,

      lastSignalObservedAt:
        this.lastSignalObservedAt,

      lastError:
        this.lastError,

      evidence: {
        snapshot:
          snapshotAvailable
            ? "AVAILABLE"
            : "NO_DATA",

        signals:
          signals.length >
            0
            ? "AVAILABLE"
            : "NO_DATA",

        performance:
          this.getShadowAnalyticsSnapshot(
            now,
          ).evidenceStatus,
      },

      legacyHistoryAttribution:
        "UNATTRIBUTED_LEGACY",

      safety: {
        readOnly:
          true,

        signalExecutionAllowed:
          false,

        intentExecutionAllowed:
          false,

        automaticExecutionAllowed:
          false,
      },
    };
  }

  getSignals(
    now =
      Date.now(),
  ):
    readonly StrategySignal[] {
    return this.currentSignals
      .filter(
        (signal) =>
          signal.expiresAt >=
          now,
      )
      .map(
        (signal) =>
          immutableStrategySignal(
            signal,
          ),
      );
  }

  subscribeToSignals(
    listener:
      StrategySignalListener,
  ):
    () => void {
    this.listeners.add(
      listener,
    );

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }

  private startPricingScheduler():
    void {
    if (
      this.pricingRefreshTimer
    ) {
      return;
    }

    this.pricingRefreshTimer =
      setInterval(
        () => {
          if (!this.running) {
            return;
          }

          try {
            this.refreshPricingEvidence();

            this.scheduledRefreshes +=
              1;
          } catch (
            error:
              unknown
          ) {
            this.schedulerFailures +=
              1;

            this.lastError =
              error instanceof Error
                ? error.message
                : "Unknown XEMM scheduled refresh failure.";
          }
        },
        this.resolvePricingRefreshIntervalMs(),
      );

    this.pricingRefreshTimer.unref?.();
  }

  private stopPricingScheduler():
    void {
    if (!this.pricingRefreshTimer) {
      return;
    }

    clearInterval(
      this.pricingRefreshTimer,
    );

    this.pricingRefreshTimer =
      null;
  }

  private resolvePricingRefreshIntervalMs():
    number {
    const rawValue =
      process.env.CAT_PRO_XEMM_REFRESH_MS;

    const parsed =
      rawValue ===
        undefined
        ? CrossExchangeMarketMakingStrategyController
            .DEFAULT_PRICING_REFRESH_INTERVAL_MS
        : Number(
            rawValue,
          );

    if (
      !Number.isSafeInteger(
        parsed,
      ) ||
      parsed <
        CrossExchangeMarketMakingStrategyController
          .MINIMUM_PRICING_REFRESH_INTERVAL_MS
    ) {
      return CrossExchangeMarketMakingStrategyController
        .DEFAULT_PRICING_REFRESH_INTERVAL_MS;
    }

    return Math.min(
      parsed,
      CrossExchangeMarketMakingStrategyController
        .MAXIMUM_PRICING_REFRESH_INTERVAL_MS,
    );
  }

  private toSignal(
    evidence:
      CrossExchangeMarketMakingStrategySignal["evidence"],

    expiresAt:
      number,

    observedAt:
      number,
  ): CrossExchangeMarketMakingStrategySignal {
    return immutableStrategySignal({
      id: [
        CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
        observedAt,
        evidence.market,
        evidence.makerExchange,
        evidence.hedgeExchange,
        evidence.side,
      ].join(
        ":",
      ),

      strategyId:
        CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,

      kind:
        "XEMM_SAFE_MAKER_PRICE",

      evidenceStatus:
        "AVAILABLE",

      source:
        "XEMMPriceEngine",

      generatedAt:
        observedAt,

      observedAt,

      expiresAt,

      executionAuthorized:
        false,

      automaticExecutionAllowed:
        false,

      evidence,
    }) as CrossExchangeMarketMakingStrategySignal;
  }
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}
