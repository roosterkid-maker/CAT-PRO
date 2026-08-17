import type {DerivativeMarketDataSnapshot} from "../../derivatives/models/DerivativeMarketEvidence";
import {derivativeMarketDataService, type DerivativeMarketDataSnapshotListener} from "../../derivatives/services/DerivativeMarketDataService";
import type {StrategyController, StrategySignalListener} from "../contracts/StrategyController";
import {STATISTICAL_ARBITRAGE_STRATEGY_ID} from "../models/StrategyMetadata";
import type {StrategyMetadata} from "../models/StrategyMetadata";
import type {StrategyRuntimeSnapshot} from "../models/StrategyRuntimeSnapshot";
import {immutableStrategySignal} from "../models/StrategySignal";
import type {StatisticalArbitrageStrategySignal, StrategySignal} from "../models/StrategySignal";
import {createStatisticalArbitrageConfiguration} from "./StatisticalArbitrageConfiguration";
import type {StatisticalArbitrageConfiguration, StatisticalArbitrageConfigurationInput, StatisticalArbitragePair} from "./StatisticalArbitrageConfiguration";
import {StatisticalArbitrageEngine} from "./StatisticalArbitrageEngine";
import type {StatisticalArbitrageSnapshot} from "./StatisticalArbitrageEngine";
import {statisticalHistoricalDataService} from "./StatisticalHistoricalDataService";
import {statisticalPairDiscoveryService, type StatisticalPairDiscoverySnapshot} from "./StatisticalPairDiscoveryService";

export interface StatisticalArbitrageMarketSource {
  getSnapshot(now?: number): DerivativeMarketDataSnapshot;
  subscribe(listener: DerivativeMarketDataSnapshotListener): () => void;
}

const METADATA: StrategyMetadata = {
  id: STATISTICAL_ARBITRAGE_STRATEGY_ID, strategyNumber: 8, displayName: "Statistical Arbitrage",
  version: "35.0", category: "STATISTICAL_ARBITRAGE",
  description: "SHADOW-only derivative pair dislocation evidence gated by persistent walk-forward promotion, regime stability, full depth and explicit costs.",
  controllerMode: "SHADOW_ONLY", signalSource: "DerivativeMarketData", legacyHistoryAttribution: "UNATTRIBUTED_LEGACY",
  capabilities: {signalAdaptation: true, intentGeneration: false, automaticExecution: false, paperExecution: false, liveExecution: false},
};

export interface StatisticalPairDiscoverySource {
  evaluate(snapshot: DerivativeMarketDataSnapshot, requiredPairs?: readonly StatisticalArbitragePair[], now?: number): StatisticalPairDiscoverySnapshot;
  getSnapshot(): StatisticalPairDiscoverySnapshot | null;
}

export class StatisticalArbitrageStrategyController implements StrategyController {
  private readonly configuration: StatisticalArbitrageConfiguration;
  private readonly listeners = new Set<StrategySignalListener>();
  private currentSignals: readonly StatisticalArbitrageStrategySignal[] = [];
  private latestStatisticalSnapshot: StatisticalArbitrageSnapshot | null = null;
  private unsubscribeMarketData: (() => void) | null = null;
  private running = false; private startCount = 0; private stopCount = 0; private processedSnapshots = 0;
  private duplicateSnapshotsIgnored = 0; private totalSignalsObserved = 0; private lastStartedAt: number | null = null;
  private lastStoppedAt: number | null = null; private lastSnapshotGeneratedAt: number | null = null;
  private lastSnapshotReceivedAt: number | null = null; private lastSnapshotOpportunityCount: number | null = null;
  private lastSignalObservedAt: number | null = null; private lastError: string | null = null;
  private totalPromotionFilteredSignals = 0;

  constructor(
    input: StatisticalArbitrageConfigurationInput = {},
    private readonly marketSource: StatisticalArbitrageMarketSource = derivativeMarketDataService,
    private readonly engine = new StatisticalArbitrageEngine({}, statisticalHistoricalDataService),
    private readonly discovery: StatisticalPairDiscoverySource = statisticalPairDiscoveryService,
  ) { this.configuration = createStatisticalArbitrageConfiguration(input); }

  getMetadata(): StrategyMetadata { return structuredClone(METADATA); }
  getConfiguration(): StatisticalArbitrageConfiguration { return this.configuration; }
  start(): void {
    if (this.running || this.configuration.state !== "SHADOW_READY") return;
    this.running = true; this.startCount += 1; this.lastStartedAt = Date.now();
    this.unsubscribeMarketData = this.marketSource.subscribe((snapshot) => this.acceptSnapshot(snapshot));
    const latest = this.marketSource.getSnapshot(); if (latest.summary.markets > 0) this.acceptSnapshot(latest);
  }
  stop(): void {
    if (!this.running) return; this.unsubscribeMarketData?.(); this.unsubscribeMarketData = null;
    this.currentSignals = []; this.running = false; this.stopCount += 1; this.lastStoppedAt = Date.now();
  }
  isRunning(): boolean { return this.running; }
  getStatisticalSnapshot(): StatisticalArbitrageSnapshot | null { return this.latestStatisticalSnapshot ? immutableClone(this.latestStatisticalSnapshot) : null; }
  getDiagnosticEvidence(): unknown { return immutableClone({statistical: this.latestStatisticalSnapshot,
    pairDiscovery: this.discovery.getSnapshot(), signalPromotionGate: {
      totalFiltered: this.totalPromotionFilteredSignals, confirmedPromotionRequired: true,
      demotionBlocksSignalsImmediately: true,
    }}); }
  getRuntimeSnapshot(now = Date.now()): StrategyRuntimeSnapshot {
    const signals = this.getSignals(now);
    return {strategyId: STATISTICAL_ARBITRAGE_STRATEGY_ID, generatedAt: now, running: this.running,
      startCount: this.startCount, stopCount: this.stopCount, lastStartedAt: this.lastStartedAt,
      lastStoppedAt: this.lastStoppedAt, processedSnapshots: this.processedSnapshots,
      duplicateSnapshotsIgnored: this.duplicateSnapshotsIgnored, totalSignalsObserved: this.totalSignalsObserved,
      currentSignalCount: signals.length, lastSnapshotGeneratedAt: this.lastSnapshotGeneratedAt,
      lastSnapshotReceivedAt: this.lastSnapshotReceivedAt, lastSnapshotOpportunityCount: this.lastSnapshotOpportunityCount,
      lastSignalObservedAt: this.lastSignalObservedAt, lastError: this.lastError,
      evidence: {snapshot: this.latestStatisticalSnapshot ? "AVAILABLE" : "NO_DATA", signals: signals.length > 0 ? "AVAILABLE" : "NO_DATA", performance: "NOT_REPORTED"},
      legacyHistoryAttribution: "UNATTRIBUTED_LEGACY",
      safety: {readOnly: true, signalExecutionAllowed: false, intentExecutionAllowed: false, automaticExecutionAllowed: false}};
  }
  getSignals(now = Date.now()): readonly StrategySignal[] { return this.currentSignals.filter((signal) => signal.expiresAt >= now).map((signal) => immutableStrategySignal(signal)); }
  subscribeToSignals(listener: StrategySignalListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  private acceptSnapshot(snapshot: DerivativeMarketDataSnapshot): void {
    if (!this.running) return;
    if (this.lastSnapshotGeneratedAt !== null && snapshot.generatedAt <= this.lastSnapshotGeneratedAt) { this.duplicateSnapshotsIgnored += 1; return; }
    const receivedAt = Math.max(Date.now(), snapshot.generatedAt);
    try {
      const discovery = this.discovery.evaluate(snapshot, this.configuration.pairs, receivedAt);
      const statistical = this.engine.evaluate(snapshot, {...this.configuration, pairs: discovery.selectedPairs}, receivedAt);
      const signalEligiblePairIds = new Set(discovery.signalEligiblePairs.map((pair) => pair.pairId));
      const qualified = statistical.assessments.filter((item) => item.status === "QUALIFIED" && item.evidence !== null);
      this.totalPromotionFilteredSignals += qualified.filter((item) => !signalEligiblePairIds.has(item.pairId)).length;
      const signals = qualified.filter((item) => signalEligiblePairIds.has(item.pairId))
        .slice(0, this.configuration.maximumSignalsPerSnapshot).map((item) => immutableStrategySignal({
          id: `${STATISTICAL_ARBITRAGE_STRATEGY_ID}:${item.id}`, strategyId: STATISTICAL_ARBITRAGE_STRATEGY_ID,
          kind: "STATISTICAL_ARBITRAGE_SHADOW_PAIR", evidenceStatus: "AVAILABLE", source: "DerivativeMarketData",
          sourceSnapshotGeneratedAt: snapshot.generatedAt, generatedAt: receivedAt, observedAt: receivedAt,
          expiresAt: receivedAt + this.configuration.signalTtlMs, executionAuthorized: false,
          automaticExecutionAllowed: false, evidence: item.evidence!,
        }) as StatisticalArbitrageStrategySignal);
      this.latestStatisticalSnapshot = statistical; this.currentSignals = signals; this.processedSnapshots += 1;
      this.totalSignalsObserved += signals.length; this.lastSnapshotGeneratedAt = snapshot.generatedAt;
      this.lastSnapshotReceivedAt = receivedAt; this.lastSnapshotOpportunityCount = signals.length;
      this.lastError = null; if (signals.length > 0) this.lastSignalObservedAt = receivedAt;
      for (const signal of signals) for (const listener of this.listeners) listener(immutableStrategySignal(signal));
    } catch (error: unknown) { this.currentSignals = []; this.lastError = error instanceof Error ? error.message : "Unknown statistical-arbitrage error."; }
  }
}

function immutableClone<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }
