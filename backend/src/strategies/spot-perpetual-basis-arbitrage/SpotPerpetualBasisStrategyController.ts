import type {
  DerivativeMarketDataSnapshot,
} from "../../derivatives/models/DerivativeMarketEvidence";

import {
  derivativeMarketDataService,
  type DerivativeMarketDataSnapshotListener,
} from "../../derivatives/services/DerivativeMarketDataService";

import type {
  StrategyController,
  StrategySignalListener,
} from "../contracts/StrategyController";

import {
  SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
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
  SpotPerpetualBasisStrategySignal,
  StrategySignal,
} from "../models/StrategySignal";

import {
  createSpotPerpetualBasisConfiguration,
} from "./SpotPerpetualBasisConfiguration";

import type {
  SpotPerpetualBasisConfiguration,
  SpotPerpetualBasisConfigurationInput,
} from "./SpotPerpetualBasisConfiguration";

import {
  SpotPerpetualBasisEconomicsEngine,
} from "./SpotPerpetualBasisEconomicsEngine";

import type {
  SpotPerpetualBasisEconomicsSnapshot,
} from "./SpotPerpetualBasisEconomicsEngine";

export interface SpotPerpetualBasisMarketSource {
  getSnapshot(now?: number): DerivativeMarketDataSnapshot;
  subscribe(listener: DerivativeMarketDataSnapshotListener): () => void;
}

const METADATA: StrategyMetadata = {
  id: SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
  strategyNumber: 4,
  displayName: "Spot-Perpetual Basis Arbitrage",
  version: "27.0",
  category: "SPOT_PERPETUAL_BASIS_ARBITRAGE",
  description:
    "SHADOW-only cash-and-carry spot/perpetual economics with genuine full-depth VWAP, funding, fees and market rules.",
  controllerMode: "SHADOW_ONLY",
  signalSource: "DerivativeMarketData",
  legacyHistoryAttribution: "UNATTRIBUTED_LEGACY",
  capabilities: {
    signalAdaptation: true,
    intentGeneration: false,
    automaticExecution: false,
    paperExecution: false,
    liveExecution: false,
  },
};

export class SpotPerpetualBasisStrategyController
implements StrategyController {
  private readonly configuration: SpotPerpetualBasisConfiguration;
  private readonly listeners = new Set<StrategySignalListener>();
  private currentSignals: readonly SpotPerpetualBasisStrategySignal[] = [];
  private latestEconomics: SpotPerpetualBasisEconomicsSnapshot | null = null;
  private unsubscribeMarketData: (() => void) | null = null;
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
    input: SpotPerpetualBasisConfigurationInput = {},
    private readonly marketSource: SpotPerpetualBasisMarketSource = derivativeMarketDataService,
    private readonly economicsEngine = new SpotPerpetualBasisEconomicsEngine(),
  ) {
    this.configuration = createSpotPerpetualBasisConfiguration(input);
  }

  getMetadata(): StrategyMetadata {
    return structuredClone(METADATA);
  }

  getConfiguration(): SpotPerpetualBasisConfiguration {
    return this.configuration;
  }

  start(): void {
    if (this.running || this.configuration.state !== "SHADOW_READY") {
      return;
    }

    this.running = true;
    this.startCount += 1;
    this.lastStartedAt = Date.now();
    this.unsubscribeMarketData = this.marketSource.subscribe((snapshot) => {
      this.acceptSnapshot(snapshot);
    });

    const latest = this.marketSource.getSnapshot();
    if (latest.summary.markets > 0) {
      this.acceptSnapshot(latest);
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.unsubscribeMarketData?.();
    this.unsubscribeMarketData = null;
    this.currentSignals = [];
    this.running = false;
    this.stopCount += 1;
    this.lastStoppedAt = Date.now();
  }

  isRunning(): boolean {
    return this.running;
  }

  getEconomicsSnapshot(): SpotPerpetualBasisEconomicsSnapshot | null {
    return this.latestEconomics ? immutableClone(this.latestEconomics) : null;
  }

  getDiagnosticEvidence(): unknown {
    return this.getEconomicsSnapshot();
  }

  getRuntimeSnapshot(now = Date.now()): StrategyRuntimeSnapshot {
    const signals = this.getSignals(now);
    return {
      strategyId: SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
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
        snapshot: this.latestEconomics ? "AVAILABLE" : "NO_DATA",
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

  private acceptSnapshot(snapshot: DerivativeMarketDataSnapshot): void {
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
      const economics = this.economicsEngine.evaluate(
        snapshot,
        this.configuration,
        receivedAt,
      );
      const signals = economics.assessments
        .filter((assessment) =>
          assessment.status === "QUALIFIED" && assessment.evidence !== null,
        )
        .slice(0, this.configuration.maximumSignalsPerSnapshot)
        .map((assessment) => immutableStrategySignal({
          id: `${SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID}:${assessment.id}`,
          strategyId: SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
          kind: "SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY",
          evidenceStatus: "AVAILABLE",
          source: "DerivativeMarketData",
          sourceSnapshotGeneratedAt: snapshot.generatedAt,
          generatedAt: receivedAt,
          observedAt: receivedAt,
          expiresAt: receivedAt + this.configuration.signalTtlMs,
          executionAuthorized: false,
          automaticExecutionAllowed: false,
          evidence: assessment.evidence!,
        }) as SpotPerpetualBasisStrategySignal);

      this.latestEconomics = economics;
      this.currentSignals = signals;
      this.processedSnapshots += 1;
      this.totalSignalsObserved += signals.length;
      this.lastSnapshotGeneratedAt = snapshot.generatedAt;
      this.lastSnapshotReceivedAt = receivedAt;
      this.lastSnapshotOpportunityCount = economics.qualifiedRoutes;
      this.lastError = null;

      if (signals.length > 0) {
        this.lastSignalObservedAt = receivedAt;
      }

      for (const signal of signals) {
        for (const listener of this.listeners) {
          listener(immutableStrategySignal(signal));
        }
      }
    } catch (error: unknown) {
      this.currentSignals = [];
      this.lastError = error instanceof Error
        ? error.message
        : "Unknown spot-perpetual basis error.";
    }
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
