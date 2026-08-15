import type {OrderBook} from "../../orderbook/models/OrderBook";
import {orderBookService} from "../../orderbook/services/OrderBookService";
import type {StrategyController, StrategySignalListener} from "../contracts/StrategyController";
import {DYNAMIC_MARKET_MAKING_STRATEGY_ID} from "../models/StrategyMetadata";
import type {StrategyMetadata} from "../models/StrategyMetadata";
import type {StrategyRuntimeSnapshot} from "../models/StrategyRuntimeSnapshot";
import {immutableStrategySignal} from "../models/StrategySignal";
import type {DynamicMarketMakingStrategySignal, StrategySignal} from "../models/StrategySignal";
import {createDynamicMarketMakingConfiguration} from "./DynamicMarketMakingConfiguration";
import type {DynamicMarketMakingConfiguration, DynamicMarketMakingConfigurationInput} from "./DynamicMarketMakingConfiguration";
import {DynamicMarketMakingEngine} from "./DynamicMarketMakingEngine";
import type {DynamicMarketMakingSnapshot} from "./DynamicMarketMakingEngine";

export interface DynamicMarketMakingBookSource { getAll(): OrderBook[]; }

const METADATA: StrategyMetadata = {
  id: DYNAMIC_MARKET_MAKING_STRATEGY_ID, strategyNumber: 7, displayName: "Dynamic Market Making",
  version: "30.0", category: "DYNAMIC_MARKET_MAKING",
  description: "Inventory-aware adaptive passive quote plans derived from authenticated balances, bounded volatility, depth imbalance, explicit fees and market rules.",
  controllerMode: "SHADOW_ONLY", signalSource: "OrderBookService", legacyHistoryAttribution: "UNATTRIBUTED_LEGACY",
  capabilities: {signalAdaptation: true, intentGeneration: false, automaticExecution: false, paperExecution: false, liveExecution: false},
};

export class DynamicMarketMakingStrategyController implements StrategyController {
  private readonly configuration: DynamicMarketMakingConfiguration;
  private readonly listeners = new Set<StrategySignalListener>();
  private currentSignals: readonly DynamicMarketMakingStrategySignal[] = [];
  private latestSnapshot: DynamicMarketMakingSnapshot | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false; private startCount = 0; private stopCount = 0; private processedSnapshots = 0;
  private totalSignalsObserved = 0; private lastStartedAt: number | null = null; private lastStoppedAt: number | null = null;
  private lastSnapshotGeneratedAt: number | null = null; private lastSnapshotReceivedAt: number | null = null;
  private lastSnapshotOpportunityCount: number | null = null; private lastSignalObservedAt: number | null = null;
  private lastError: string | null = null;

  constructor(
    input: DynamicMarketMakingConfigurationInput = {},
    private readonly bookSource: DynamicMarketMakingBookSource = orderBookService,
    private readonly engine = new DynamicMarketMakingEngine(),
  ) { this.configuration = createDynamicMarketMakingConfiguration(input); }

  getMetadata(): StrategyMetadata { return structuredClone(METADATA); }
  getConfiguration(): DynamicMarketMakingConfiguration { return this.configuration; }
  start(): void {
    if (this.running || this.configuration.state !== "SHADOW_READY") return;
    this.running = true; this.startCount += 1; this.lastStartedAt = Date.now(); this.runOnce();
    this.timer = setInterval(() => this.runOnce(), this.configuration.refreshIntervalMs); this.timer.unref?.();
  }
  stop(): void {
    if (!this.running) return;
    if (this.timer) clearInterval(this.timer); this.timer = null; this.currentSignals = []; this.running = false;
    this.stopCount += 1; this.lastStoppedAt = Date.now();
  }
  isRunning(): boolean { return this.running; }
  getDynamicSnapshot(): DynamicMarketMakingSnapshot | null { return this.latestSnapshot ? immutableClone(this.latestSnapshot) : null; }
  getDiagnosticEvidence(): unknown { return this.getDynamicSnapshot(); }
  runOnce(now = Date.now()): void {
    if (!this.running) return;
    try {
      const snapshot = this.engine.evaluate(this.bookSource.getAll(), this.configuration, now);
      const signals = snapshot.assessments.filter((item) => item.status === "QUALIFIED" && item.evidence !== null)
        .slice(0, this.configuration.maximumSignalsPerSnapshot)
        .map((item) => immutableStrategySignal({
          id: `${DYNAMIC_MARKET_MAKING_STRATEGY_ID}:${item.id}`, strategyId: DYNAMIC_MARKET_MAKING_STRATEGY_ID,
          kind: "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN", evidenceStatus: "AVAILABLE", source: "OrderBookService",
          sourceSnapshotGeneratedAt: snapshot.generatedAt, generatedAt: now, observedAt: now,
          expiresAt: now + this.configuration.signalTtlMs, executionAuthorized: false,
          automaticExecutionAllowed: false, evidence: item.evidence!,
        }) as DynamicMarketMakingStrategySignal);
      this.latestSnapshot = snapshot; this.currentSignals = signals; this.processedSnapshots += 1;
      this.totalSignalsObserved += signals.length; this.lastSnapshotGeneratedAt = snapshot.generatedAt;
      this.lastSnapshotReceivedAt = now; this.lastSnapshotOpportunityCount = snapshot.qualifiedMarkets; this.lastError = null;
      if (signals.length > 0) this.lastSignalObservedAt = now;
      for (const signal of signals) for (const listener of this.listeners) listener(immutableStrategySignal(signal));
    } catch (error: unknown) {
      this.currentSignals = []; this.lastError = error instanceof Error ? error.message : "Unknown dynamic market-making error.";
    }
  }
  getRuntimeSnapshot(now = Date.now()): StrategyRuntimeSnapshot {
    const signals = this.getSignals(now);
    return {strategyId: DYNAMIC_MARKET_MAKING_STRATEGY_ID, generatedAt: now, running: this.running,
      startCount: this.startCount, stopCount: this.stopCount, lastStartedAt: this.lastStartedAt,
      lastStoppedAt: this.lastStoppedAt, processedSnapshots: this.processedSnapshots, duplicateSnapshotsIgnored: 0,
      totalSignalsObserved: this.totalSignalsObserved, currentSignalCount: signals.length,
      lastSnapshotGeneratedAt: this.lastSnapshotGeneratedAt, lastSnapshotReceivedAt: this.lastSnapshotReceivedAt,
      lastSnapshotOpportunityCount: this.lastSnapshotOpportunityCount, lastSignalObservedAt: this.lastSignalObservedAt,
      lastError: this.lastError, evidence: {snapshot: this.latestSnapshot ? "AVAILABLE" : "NO_DATA",
        signals: signals.length > 0 ? "AVAILABLE" : "NO_DATA", performance: "NOT_REPORTED"},
      legacyHistoryAttribution: "UNATTRIBUTED_LEGACY",
      safety: {readOnly: true, signalExecutionAllowed: false, intentExecutionAllowed: false, automaticExecutionAllowed: false}};
  }
  getSignals(now = Date.now()): readonly StrategySignal[] { return this.currentSignals.filter((signal) => signal.expiresAt >= now).map((signal) => immutableStrategySignal(signal)); }
  subscribeToSignals(listener: StrategySignalListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

function immutableClone<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }
