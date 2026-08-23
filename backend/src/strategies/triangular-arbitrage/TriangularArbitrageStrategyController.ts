import type {
  DynamicOpportunityDiscoverySnapshot,
  TriangularDiscoveryPath,
} from "../../discovery/models/DynamicOpportunityDiscovery";

import type {ExecutableQuote} from "../../core/models/ExecutableQuote";
import {
  marketCache,
  type MarketCacheExecutableUpdate,
  type MarketCacheExecutableUpdateListener,
} from "../../services/cache.service";

import {
  dynamicOpportunityDiscoveryRunnerService,
  type DynamicOpportunityDiscoverySnapshotListener,
} from "../../discovery/services/DynamicOpportunityDiscoveryRunnerService";

import type {
  StrategyController,
  StrategySignalListener,
} from "../contracts/StrategyController";

import {
  TRIANGULAR_ARBITRAGE_STRATEGY_ID,
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
  StrategySignal,
  TriangularArbitrageStrategySignal,
} from "../models/StrategySignal";

import {
  createTriangularArbitrageConfiguration,
} from "./TriangularArbitrageConfiguration";

import type {
  TriangularArbitrageConfiguration,
  TriangularArbitrageConfigurationInput,
} from "./TriangularArbitrageConfiguration";

import {
  TriangularArbitrageSimulationEngine,
} from "./TriangularArbitrageSimulationEngine";

import type {
  TriangularArbitragePathSimulation,
  TriangularArbitrageSimulationSnapshot,
} from "./TriangularArbitrageSimulationEngine";

export interface TriangularArbitrageDiscoverySource {
  getLatestSnapshot(): DynamicOpportunityDiscoverySnapshot | null;

  subscribe(listener: DynamicOpportunityDiscoverySnapshotListener): () => void;
}

export interface TriangularArbitrageMarketEventSource {
  get(exchange: string, market: string): ExecutableQuote | undefined;
  subscribeToExecutableUpdates(listener: MarketCacheExecutableUpdateListener): () => void;
}

/*
 * Strategy #3 is SHADOW-only. It shares the Node.js event loop with the
 * latency-sensitive Strategy #1 scanner, so a broad market fleet must not
 * turn every book tick into a new three-leg simulation batch. A quarter-second
 * coalescing window keeps affected-route observation responsive while giving
 * the execution owner deterministic priority.
 */
const DEFAULT_AFFECTED_ROUTE_REFRESH_INTERVAL_MS = 250;

const METADATA: StrategyMetadata = {
  id: TRIANGULAR_ARBITRAGE_STRATEGY_ID,
  strategyNumber: 3,
  displayName: "Adaptive Closed-Loop Triangular Arbitrage",
  version: "180.0",
  category: "TRIANGULAR_ARBITRAGE",
  description:
    "ACLA SHADOW three-leg spot conversion with affected-route wakeups, full-depth VWAP, stressed economics and a dedicated restart-safe capital loop.",
  controllerMode: "SHADOW_ONLY",
  signalSource: "DynamicOpportunityDiscovery",
  legacyHistoryAttribution: "UNATTRIBUTED_LEGACY",
  capabilities: {
    signalAdaptation: true,
    intentGeneration: false,
    automaticExecution: false,
    paperExecution: false,
    liveExecution: false,
  },
};

export class TriangularArbitrageStrategyController
implements StrategyController {
  private readonly configuration: TriangularArbitrageConfiguration;

  private readonly listeners = new Set<StrategySignalListener>();

  private currentSignals: readonly TriangularArbitrageStrategySignal[] = [];

  private latestSimulation: TriangularArbitrageSimulationSnapshot | null = null;

  private lastEconomicallyEvaluableSimulation: TriangularArbitrageSimulationSnapshot | null = null;

  private unsubscribeDiscovery: (() => void) | null = null;

  private unsubscribeMarketEvents: (() => void) | null = null;

  private readonly pathsById = new Map<string, TriangularDiscoveryPath>();

  private readonly pathIdsByMarket = new Map<string, Set<string>>();

  private readonly simulationBySignalId = new Map<string, TriangularArbitragePathSimulation>();

  private readonly pendingAffectedPathIds = new Set<string>();

  private affectedRefreshTimer: NodeJS.Timeout | null = null;

  private affectedRefreshRuns = 0;

  private coalescedMarketUpdates = 0;

  private running = false;
  private startCount = 0;
  private stopCount = 0;
  private processedSnapshots = 0;
  private duplicateSnapshotsIgnored = 0;
  private totalSignalsObserved = 0;
  private lastStartedAt: number | null = null;
  private lastStoppedAt: number | null = null;
  private lastSnapshotGeneratedAt: number | null = null;
  private lastSnapshotReceivedAt: number | null = null;
  private lastSnapshotOpportunityCount: number | null = null;
  private lastSignalObservedAt: number | null = null;
  private lastError: string | null = null;

  private affectedRouteWakeups = 0;

  private affectedPathsEvaluated = 0;

  private affectedPathsFastScreened = 0;

  private fullSnapshotPathsEvaluated = 0;

  private lastEvaluationDurationMs: number | null = null;

  constructor(
    configuration: TriangularArbitrageConfigurationInput = {},
    private readonly discoverySource: TriangularArbitrageDiscoverySource =
      dynamicOpportunityDiscoveryRunnerService,
    private readonly simulationEngine =
      new TriangularArbitrageSimulationEngine(),
    private readonly marketEventSource: TriangularArbitrageMarketEventSource = marketCache,
    private readonly affectedRouteRefreshIntervalMs = DEFAULT_AFFECTED_ROUTE_REFRESH_INTERVAL_MS,
  ) {
    if (!Number.isSafeInteger(affectedRouteRefreshIntervalMs) || affectedRouteRefreshIntervalMs < 20) {
      throw new Error("ACLA affected-route refresh interval must be an integer of at least 20 ms.");
    }
    this.configuration =
      createTriangularArbitrageConfiguration(configuration);
  }

  getMetadata(): StrategyMetadata {
    return structuredClone(METADATA);
  }

  getConfiguration(): TriangularArbitrageConfiguration {
    return this.configuration;
  }

  getDiagnosticEvidence(): unknown {
    return this.getSimulationSnapshot();
  }

  start(): void {
    if (this.running || this.configuration.state !== "SHADOW_READY") {
      return;
    }

    this.running = true;
    this.startCount += 1;
    this.lastStartedAt = Date.now();

    this.unsubscribeDiscovery = this.discoverySource.subscribe((snapshot) => {
      this.acceptSnapshot(snapshot);
    });

    this.unsubscribeMarketEvents = this.marketEventSource.subscribeToExecutableUpdates((update) => {
      this.acceptMarketUpdate(update);
    });

    const latest = this.discoverySource.getLatestSnapshot();

    if (latest) {
      this.acceptSnapshot(latest);
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.unsubscribeDiscovery?.();
    this.unsubscribeDiscovery = null;
    this.unsubscribeMarketEvents?.();
    this.unsubscribeMarketEvents = null;
    if (this.affectedRefreshTimer) clearTimeout(this.affectedRefreshTimer);
    this.affectedRefreshTimer = null;
    this.pendingAffectedPathIds.clear();
    this.running = false;
    this.stopCount += 1;
    this.lastStoppedAt = Date.now();
    this.currentSignals = [];
  }

  isRunning(): boolean {
    return this.running;
  }

  getSimulationSnapshot(): TriangularArbitrageSimulationSnapshot | null {
    return this.latestSimulation
      ? immutableClone(this.latestSimulation)
      : null;
  }

  getLastEconomicallyEvaluableSimulationSnapshot(): TriangularArbitrageSimulationSnapshot | null {
    return this.lastEconomicallyEvaluableSimulation
      ? immutableClone(this.lastEconomicallyEvaluableSimulation)
      : null;
  }

  getQualifiedSimulationBySignalId(signalId: string): TriangularArbitragePathSimulation | null {
    const value = this.simulationBySignalId.get(signalId);
    return value ? immutableClone(value) : null;
  }

  refreshQualifiedSimulationBySignalId(signalId: string, now = Date.now()): TriangularArbitragePathSimulation | null {
    const prior = this.simulationBySignalId.get(signalId);
    if (!prior) return null;
    const indexed = this.pathsById.get(prior.pathId);
    const latest = this.discoverySource.getLatestSnapshot();
    if (!indexed || !latest) return null;
    const refreshed = this.refreshPath(indexed);
    if (!refreshed) return null;
    const sourceGeneratedAt = Math.max(...refreshed.legs.map((leg) => leg.timestamp));
    const result = this.simulationEngine.evaluate({
      ...latest,
      generatedAt: sourceGeneratedAt,
      summary: {...latest.summary, triangularPaths: 1},
      triangularPaths: [refreshed],
    }, this.configuration, now).simulations[0];
    return result ? immutableClone(result) : null;
  }

  getRuntimeSnapshot(now = Date.now()): StrategyRuntimeSnapshot {
    const signals = this.getSignals(now);

    return {
      strategyId: TRIANGULAR_ARBITRAGE_STRATEGY_ID,
      generatedAt: now,
      running: this.running,
      startCount: this.startCount,
      stopCount: this.stopCount,
      lastStartedAt: this.lastStartedAt,
      lastStoppedAt: this.lastStoppedAt,
      processedSnapshots: this.processedSnapshots,
      duplicateSnapshotsIgnored: this.duplicateSnapshotsIgnored,
      totalSignalsObserved: this.totalSignalsObserved,
      currentSignalCount: signals.length,
      lastSnapshotGeneratedAt: this.lastSnapshotGeneratedAt,
      lastSnapshotReceivedAt: this.lastSnapshotReceivedAt,
      lastSnapshotOpportunityCount: this.lastSnapshotOpportunityCount,
      lastSignalObservedAt: this.lastSignalObservedAt,
      lastError: this.lastError,
      evidence: {
        snapshot: this.latestSimulation ? "AVAILABLE" : "NO_DATA",
        signals: signals.length > 0 ? "AVAILABLE" : "NO_DATA",
        performance: "NOT_REPORTED",
      },
      legacyHistoryAttribution: "UNATTRIBUTED_LEGACY",
      safety: {
        readOnly: true,
        signalExecutionAllowed: false,
        intentExecutionAllowed: false,
        automaticExecutionAllowed: false,
      },
    };
  }

  getPerformanceSnapshot() {
    return immutableClone({
      affectedRouteWakeups: this.affectedRouteWakeups,
      affectedPathsEvaluated: this.affectedPathsEvaluated,
      affectedPathsFastScreened: this.affectedPathsFastScreened,
      fullSnapshotPathsEvaluated: this.fullSnapshotPathsEvaluated,
      lastEvaluationDurationMs: this.lastEvaluationDurationMs,
      affectedRefreshIntervalMs: this.affectedRouteRefreshIntervalMs,
      affectedRefreshRuns: this.affectedRefreshRuns,
      coalescedMarketUpdates: this.coalescedMarketUpdates,
      dependencyMarkets: this.pathIdsByMarket.size,
      indexedPaths: this.pathsById.size,
      pendingAffectedPaths: this.pendingAffectedPathIds.size,
    });
  }

  getSignals(now = Date.now()): readonly StrategySignal[] {
    return this.currentSignals
      .filter((signal) => signal.expiresAt >= now)
      .map((signal) => immutableStrategySignal(signal));
  }

  subscribeToSignals(listener: StrategySignalListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private acceptSnapshot(snapshot: DynamicOpportunityDiscoverySnapshot): void {
    if (!this.running) {
      return;
    }

    if (
      this.lastSnapshotGeneratedAt !== null &&
      snapshot.generatedAt <= this.lastSnapshotGeneratedAt
    ) {
      this.duplicateSnapshotsIgnored += 1;
      return;
    }

    const receivedAt = Math.max(Date.now(), snapshot.generatedAt);

    try {
      this.rebuildDependencyIndex(snapshot.triangularPaths);
      const simulation = this.simulationEngine.evaluate(
        snapshot,
        this.configuration,
        receivedAt,
      );

      this.latestSimulation = simulation;
      this.fullSnapshotPathsEvaluated += simulation.evaluatedPaths;
      this.lastEvaluationDurationMs = simulation.evaluationDurationMs;
      if (simulation.simulations.some((item) =>
        item.netProfitPercent !== null && Number.isFinite(item.netProfitPercent),
      )) {
        this.lastEconomicallyEvaluableSimulation = simulation;
      }
      this.lastSnapshotGeneratedAt = snapshot.generatedAt;
      this.lastSnapshotReceivedAt = receivedAt;
      this.lastSnapshotOpportunityCount = snapshot.triangularPaths.length;
      this.processedSnapshots += 1;
      this.lastError = null;

      this.publishQualifiedSignals(simulation.simulations, snapshot.generatedAt, receivedAt, true);
    } catch (error: unknown) {
      this.lastError = error instanceof Error
        ? error.message
        : "Unknown triangular simulation error.";
      this.currentSignals = [];
    }
  }

  private rebuildDependencyIndex(paths: readonly TriangularDiscoveryPath[]): void {
    this.pathsById.clear();
    this.pathIdsByMarket.clear();
    for (const path of paths) {
      this.pathsById.set(path.id, immutableClone(path));
      for (const leg of path.legs) {
        const key = this.marketKey(path.exchange, leg.market);
        const ids = this.pathIdsByMarket.get(key) ?? new Set<string>();
        ids.add(path.id);
        this.pathIdsByMarket.set(key, ids);
      }
    }
  }

  private acceptMarketUpdate(update: MarketCacheExecutableUpdate): void {
    if (!this.running || update.kind === "CLEARED") return;
    const ids = this.pathIdsByMarket.get(this.marketKey(update.exchange, update.market));
    if (!ids || ids.size === 0) return;
    this.affectedRouteWakeups += 1;
    for (const id of ids) this.pendingAffectedPathIds.add(id);
    if (this.affectedRefreshTimer) {
      this.coalescedMarketUpdates += 1;
      return;
    }
    this.affectedRefreshTimer = setTimeout(() => {
      this.affectedRefreshTimer = null;
      this.refreshAffectedPaths();
    }, this.affectedRouteRefreshIntervalMs);
    this.affectedRefreshTimer.unref?.();
  }

  private refreshAffectedPaths(): void {
    if (!this.running || this.pendingAffectedPathIds.size === 0) return;
    this.affectedRefreshRuns += 1;
    const ids = [...this.pendingAffectedPathIds];
    this.pendingAffectedPathIds.clear();
    const refreshedPaths = ids.map((id) => this.pathsById.get(id)).filter((value): value is TriangularDiscoveryPath => Boolean(value))
      .map((path) => this.refreshPath(path)).filter((value): value is TriangularDiscoveryPath => Boolean(value));
    const paths = refreshedPaths.filter((path) => this.isFastLaneEligible(path));
    this.affectedPathsFastScreened += refreshedPaths.length - paths.length;
    if (paths.length === 0) {
      this.currentSignals = this.currentSignals.filter((signal) => !ids.some((id) => signal.evidence.pathId === id));
      return;
    }
    const now = Date.now();
    const sourceGeneratedAt = Math.max(...paths.flatMap((path) => path.legs.map((leg) => leg.timestamp)));
    const latest = this.discoverySource.getLatestSnapshot();
    if (!latest) return;
    try {
      const simulation = this.simulationEngine.evaluate({
        ...latest,
        generatedAt: sourceGeneratedAt,
        summary: {...latest.summary, triangularPaths: paths.length},
        triangularPaths: paths,
      }, this.configuration, now);
      this.affectedPathsEvaluated += simulation.evaluatedPaths;
      this.lastEvaluationDurationMs = simulation.evaluationDurationMs;
      const merged = new Map((this.latestSimulation?.simulations ?? []).map((item) => [item.pathId, item]));
      for (const item of simulation.simulations) merged.set(item.pathId, item);
      const mergedValues = [...merged.values()];
      this.latestSimulation = immutableClone({...simulation,
        evaluatedPaths: mergedValues.length,
        qualifiedPaths: mergedValues.filter((item) => item.status === "QUALIFIED").length,
        blockedPaths: mergedValues.filter((item) => item.status === "BLOCKED").length,
        simulations: mergedValues});
      if (simulation.simulations.some((item) => item.netProfitPercent !== null && Number.isFinite(item.netProfitPercent))) {
        this.lastEconomicallyEvaluableSimulation = this.latestSimulation;
      }
      this.lastSnapshotGeneratedAt = Math.max(this.lastSnapshotGeneratedAt ?? 0, sourceGeneratedAt);
      this.lastSnapshotReceivedAt = now;
      this.processedSnapshots += 1;
      this.lastError = null;
      this.publishQualifiedSignals(simulation.simulations, sourceGeneratedAt, now, false, ids);
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.message : "Unknown ACLA affected-route simulation error.";
    }
  }

  private refreshPath(path: TriangularDiscoveryPath): TriangularDiscoveryPath | null {
    const legs = path.legs.map((leg) => {
      const quote = this.marketEventSource.get(path.exchange, leg.market);
      if (!quote?.executable || quote.bestBidPrice === null || quote.bestBidQty === null ||
          quote.bestAskPrice === null || quote.bestAskQty === null) return null;
      return {...leg,
        referenceRate: leg.action === "SELL_BASE" ? quote.bestBidPrice : 1 / quote.bestAskPrice,
        maximumInputQuantity: leg.action === "SELL_BASE" ? quote.bestBidQty : quote.bestAskPrice * quote.bestAskQty,
        timestamp: quote.timestamp};
    });
    if (legs.some((leg) => leg === null)) return null;
    const exactLegs = legs as [NonNullable<(typeof legs)[0]>, NonNullable<(typeof legs)[1]>, NonNullable<(typeof legs)[2]>];
    return {...path, legs: exactLegs,
      referenceGrossMultiplier: exactLegs.reduce((value, leg) => value * leg.referenceRate, 1)};
  }

  private isFastLaneEligible(path: TriangularDiscoveryPath): boolean {
    const allowedExchange = this.configuration.allowedExchanges.length === 0 ||
      this.configuration.allowedExchanges.includes(path.exchange.trim().toLowerCase());
    const allowedStart = this.configuration.allowedStartingAssets.includes(path.startAsset.trim().toUpperCase());
    const grossProfitPercent = (path.referenceGrossMultiplier - 1) * 100;
    return allowedExchange && allowedStart && Number.isFinite(grossProfitPercent) &&
      grossProfitPercent >= this.configuration.fastScreenMinimumGrossProfitPercent;
  }

  private publishQualifiedSignals(
    simulations: readonly TriangularArbitragePathSimulation[], sourceSnapshotGeneratedAt: number, observedAt: number,
    replace: boolean, affectedPathIds: readonly string[] = [],
  ): void {
    const qualified = simulations.filter((result): result is TriangularArbitragePathSimulation & {
      finalOutputQuantity: number; expectedNetProfitQuantity: number; expectedNetProfitPercent: number;
      netProfitQuantity: number; netProfitPercent: number; stressNetProfitQuantity: number;
      stressNetProfitPercent: number; absoluteNetProfitInr: number; tdsCapitalLockInr: number;
      computedNetMultiplier: number; maximumBookSkewMs: number;
    } => result.status === "QUALIFIED" && result.finalOutputQuantity !== null &&
      result.expectedNetProfitQuantity !== null && result.expectedNetProfitPercent !== null &&
      result.netProfitQuantity !== null && result.netProfitPercent !== null &&
      result.stressNetProfitQuantity !== null && result.stressNetProfitPercent !== null &&
      result.absoluteNetProfitInr !== null && result.tdsCapitalLockInr !== null &&
      result.computedNetMultiplier !== null && result.maximumBookSkewMs !== null)
      .slice(0, this.configuration.maximumSignalsPerSnapshot);
    const signals = qualified.map((result) => this.toSignal(result, sourceSnapshotGeneratedAt, observedAt));
    this.currentSignals = replace ? signals : [
      ...this.currentSignals.filter((signal) => !affectedPathIds.includes(signal.evidence.pathId) && signal.expiresAt >= observedAt),
      ...signals,
    ];
    for (let index = 0; index < signals.length; index += 1) {
      const signal = signals[index];
      const simulation = qualified[index];
      if (!signal || !simulation) continue;
      this.simulationBySignalId.set(signal.id, immutableClone(simulation));
      this.totalSignalsObserved += 1;
      this.lastSignalObservedAt = observedAt;
      for (const listener of this.listeners) listener(immutableStrategySignal(signal));
    }
    if (this.simulationBySignalId.size > 2_000) {
      for (const id of [...this.simulationBySignalId.keys()].slice(0, this.simulationBySignalId.size - 1_000)) this.simulationBySignalId.delete(id);
    }
  }

  private marketKey(exchange: string, market: string): string {
    return `${exchange.trim().toLowerCase()}:${market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  }

  private toSignal(
    result: TriangularArbitragePathSimulation & {
      finalOutputQuantity: number;
      expectedNetProfitQuantity: number;
      expectedNetProfitPercent: number;
      netProfitQuantity: number;
      netProfitPercent: number;
      stressNetProfitQuantity: number;
      stressNetProfitPercent: number;
      absoluteNetProfitInr: number;
      tdsCapitalLockInr: number;
      computedNetMultiplier: number;
      maximumBookSkewMs: number;
    },
    sourceSnapshotGeneratedAt: number,
    observedAt: number,
  ): TriangularArbitrageStrategySignal {
    return immutableStrategySignal({
      id: [
        TRIANGULAR_ARBITRAGE_STRATEGY_ID,
        result.pathId,
        sourceSnapshotGeneratedAt,
      ].join(":"),
      strategyId: TRIANGULAR_ARBITRAGE_STRATEGY_ID,
      kind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH",
      evidenceStatus: "AVAILABLE",
      source: "DynamicOpportunityDiscovery",
      sourceSnapshotGeneratedAt,
      generatedAt: observedAt,
      observedAt,
      expiresAt: observedAt + this.configuration.signalTtlMs,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
      evidence: {
        pathId: result.pathId,
        exchange: result.exchange,
        startAsset: result.startAsset,
        assets: result.assets,
        initialInputQuantity: result.initialInputQuantity,
        finalOutputQuantity: result.finalOutputQuantity,
        expectedNetProfitQuantity: result.expectedNetProfitQuantity,
        expectedNetProfitPercent: result.expectedNetProfitPercent,
        netProfitQuantity: result.netProfitQuantity,
        netProfitPercent: result.netProfitPercent,
        stressNetProfitQuantity: result.stressNetProfitQuantity,
        stressNetProfitPercent: result.stressNetProfitPercent,
        absoluteNetProfitInr: result.absoluteNetProfitInr,
        tdsCapitalLockInr: result.tdsCapitalLockInr,
        reserveDragPercent: result.reserveDragPercent,
        maximumBookSkewMs: result.maximumBookSkewMs,
        minimumNetProfitPercent: this.configuration.minimumNetProfitPercent,
        referenceGrossMultiplier: result.referenceGrossMultiplier,
        computedNetMultiplier: result.computedNetMultiplier,
        legs: result.legs,
        feesApplied: true,
        marketRulesApplied: true,
        topOfBookDepthApplied: true,
        fullDepthVwapApplied: true,
        stressTestApplied: true,
        tdsTreatedAsCapitalLock: true,
        lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
        capitalOwner: "ACLA_STRATEGY_SCOPED_SUBLEDGER",
      },
    }) as TriangularArbitrageStrategySignal;
  }
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}
