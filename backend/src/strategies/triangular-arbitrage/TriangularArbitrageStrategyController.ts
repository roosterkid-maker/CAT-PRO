import type {
  DynamicOpportunityDiscoverySnapshot,
} from "../../discovery/models/DynamicOpportunityDiscovery";

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

const METADATA: StrategyMetadata = {
  id: TRIANGULAR_ARBITRAGE_STRATEGY_ID,
  strategyNumber: 3,
  displayName: "Triangular Arbitrage",
  version: "25.0",
  category: "TRIANGULAR_ARBITRAGE",
  description:
    "SHADOW-only three-leg spot conversion simulation with genuine depth, fee and market-rule evidence.",
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

  constructor(
    configuration: TriangularArbitrageConfigurationInput = {},
    private readonly discoverySource: TriangularArbitrageDiscoverySource =
      dynamicOpportunityDiscoveryRunnerService,
    private readonly simulationEngine =
      new TriangularArbitrageSimulationEngine(),
  ) {
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
      const simulation = this.simulationEngine.evaluate(
        snapshot,
        this.configuration,
        receivedAt,
      );

      this.latestSimulation = simulation;
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

      const signals = simulation.simulations
        .filter((result): result is TriangularArbitragePathSimulation & {
          finalOutputQuantity: number;
          netProfitQuantity: number;
          netProfitPercent: number;
          computedNetMultiplier: number;
        } =>
          result.status === "QUALIFIED" &&
          result.finalOutputQuantity !== null &&
          result.netProfitQuantity !== null &&
          result.netProfitPercent !== null &&
          result.computedNetMultiplier !== null,
        )
        .slice(0, this.configuration.maximumSignalsPerSnapshot)
        .map((result) => this.toSignal(result, snapshot.generatedAt, receivedAt));

      this.currentSignals = signals;
      this.totalSignalsObserved += signals.length;

      if (signals.length > 0) {
        this.lastSignalObservedAt = receivedAt;
      }

      for (const signal of signals) {
        for (const listener of this.listeners) {
          listener(immutableStrategySignal(signal));
        }
      }
    } catch (error: unknown) {
      this.lastError = error instanceof Error
        ? error.message
        : "Unknown triangular simulation error.";
      this.currentSignals = [];
    }
  }

  private toSignal(
    result: TriangularArbitragePathSimulation & {
      finalOutputQuantity: number;
      netProfitQuantity: number;
      netProfitPercent: number;
      computedNetMultiplier: number;
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
        netProfitQuantity: result.netProfitQuantity,
        netProfitPercent: result.netProfitPercent,
        minimumNetProfitPercent: this.configuration.minimumNetProfitPercent,
        referenceGrossMultiplier: result.referenceGrossMultiplier,
        computedNetMultiplier: result.computedNetMultiplier,
        legs: result.legs,
        feesApplied: true,
        marketRulesApplied: true,
        topOfBookDepthApplied: true,
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
