import type {CentralStrategyAdmissionRecord, CentralStrategyAdmissionListener} from "../services/CentralStrategyExecutionAdmissionService";
import type {TriangularArbitrageConfiguration} from "./TriangularArbitrageConfiguration";
import type {TriangularArbitragePathSimulation} from "./TriangularArbitrageSimulationEngine";
import type {AclaCapitalLoopManager, AclaCycleLegRecord} from "./AclaCapitalLoopManager";

export interface AclaAdmissionSource {
  subscribeToAdmissions(listener: CentralStrategyAdmissionListener): () => void;
}

export interface AclaQualifiedSimulationSource {
  getConfiguration(): TriangularArbitrageConfiguration;
  getQualifiedSimulationBySignalId(signalId: string): TriangularArbitragePathSimulation | null;
  refreshQualifiedSimulationBySignalId?(signalId: string, now?: number): TriangularArbitragePathSimulation | null;
}

interface AclaLifecycleOutcome {
  readonly admissionId: string;
  readonly signalId: string;
  readonly pathId: string | null;
  readonly state: "COMPLETED" | "REJECTED" | "FAILED";
  readonly reason: string;
  readonly cycleId: string | null;
  readonly generatedAt: number;
  readonly executionMode: "SHADOW";
  readonly accountMutationPerformed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export class AclaShadowLifecycleService {
  private unsubscribe: (() => void) | null = null;
  private readonly outcomes: AclaLifecycleOutcome[] = [];
  private readonly recentCycleTimes: number[] = [];
  private readonly lastRouteAt = new Map<string, number>();
  private admissionsObserved = 0;
  private admitted = 0;
  private completed = 0;
  private rejected = 0;
  private failed = 0;
  private restartReconciliations = 0;
  private lastError: string | null = null;

  constructor(
    private readonly admissions: AclaAdmissionSource,
    private readonly simulations: AclaQualifiedSimulationSource,
    private readonly capital: AclaCapitalLoopManager,
    private readonly maximumOutcomes = 500,
  ) {
    if (!Number.isSafeInteger(maximumOutcomes) || maximumOutcomes < 10) throw new Error("ACLA lifecycle outcome capacity must be at least 10.");
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.admissions.subscribeToAdmissions((record) => this.accept(record));
    this.reconcileRestartedCycle();
  }
  stop(): void { this.unsubscribe?.(); this.unsubscribe = null; }
  isRunning(): boolean { return this.unsubscribe !== null; }

  getReport(now = Date.now()) {
    this.prune(now);
    const blockers = new Map<string, number>();
    for (const outcome of this.outcomes.filter((item) => item.state !== "COMPLETED")) blockers.set(outcome.reason, (blockers.get(outcome.reason) ?? 0) + 1);
    return freeze({version: "180.0" as const, generatedAt: now, running: this.isRunning(), admissionsObserved: this.admissionsObserved,
      admitted: this.admitted, completed: this.completed, rejected: this.rejected, failed: this.failed,
      restartReconciliations: this.restartReconciliations,
      cyclesInRollingHour: this.recentCycleTimes.length, lastError: this.lastError,
      dominantBlockers: [...blockers.entries()].map(([code, count]) => ({code, count})).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)).slice(0, 10),
      recentOutcomes: [...this.outcomes].reverse().slice(0, 50).map(clone),
      safety: {centralAdmissionRequired: true, lastLookBeforeReservation: true, lastLookBeforeFirstLeg: true,
        freshDepthRequalificationAtBothLastLooks: true, sequentialLegs: true,
        exposedRecoveryOwnedByCapitalLoop: true, simulatedOnly: true,
        accountMutationPerformed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private reconcileRestartedCycle(): void {
    const now = Date.now();
    try {
      const reconciled = this.capital.reconcileRestoredThreeLegShadowCycle(now);
      if (!reconciled) return;
      this.restartReconciliations += 1;
      this.completed += 1;
      this.recentCycleTimes.push(now);
      this.lastRouteAt.set(`${reconciled.exchange}:${reconciled.pathId}`, now);
      this.outcomes.push(freeze({
        admissionId: `restart:${reconciled.id}`,
        signalId: reconciled.signalId,
        pathId: reconciled.pathId,
        state: "COMPLETED" as const,
        reason: "RESTART_RECONCILED_PERSISTED_THREE_LEG_SHADOW_CYCLE_CONSERVATIVELY",
        cycleId: reconciled.id,
        generatedAt: now,
        executionMode: "SHADOW" as const,
        accountMutationPerformed: false as const,
        liveExecutionAllowed: false as const,
        orderSubmissionAllowed: false as const,
      }));
      this.lastError = null;
    } catch (error: unknown) {
      this.failed += 1;
      this.lastError = error instanceof Error
        ? `RESTART_RECONCILIATION_FAILED:${error.message}`
        : "RESTART_RECONCILIATION_FAILED:UNKNOWN";
    }
  }

  private accept(record: CentralStrategyAdmissionRecord): void {
    if (record.strategyId !== "triangular-arbitrage") return;
    this.admissionsObserved += 1;
    const now = Date.now();
    if (record.decision !== "SHADOW_SIGNAL_ADMITTED" || !record.plan) {
      this.record(record, null, "REJECTED", `CENTRAL_${record.decision}`, null, now); return;
    }
    this.admitted += 1;
    const admittedSimulation = this.simulations.getQualifiedSimulationBySignalId(record.signalId);
    if (!admittedSimulation || admittedSimulation.status !== "QUALIFIED") {
      this.record(record, null, "REJECTED", "QUALIFIED_SIMULATION_NOT_FOUND", null, now); return;
    }
    const configuration = this.simulations.getConfiguration();
    this.prune(now);
    if (this.recentCycleTimes.length >= configuration.maximumCyclesPerHour) {
      this.record(record, admittedSimulation.pathId, "REJECTED", "MAXIMUM_CYCLES_PER_HOUR_REACHED", null, now); return;
    }
    const routeKey = `${admittedSimulation.exchange}:${admittedSimulation.pathId}`;
    const previous = this.lastRouteAt.get(routeKey);
    if (previous !== undefined && now - previous < configuration.routeCooldownMs) {
      this.record(record, admittedSimulation.pathId, "REJECTED", "ROUTE_COOLDOWN_ACTIVE", null, now); return;
    }
    const simulation = this.simulations.refreshQualifiedSimulationBySignalId?.(record.signalId, now) ?? admittedSimulation;
    const firstLastLook = this.lastLook(simulation, configuration, now);
    if (firstLastLook !== null) {
      this.record(record, simulation.pathId, "REJECTED", firstLastLook, null, now); return;
    }
    const cycleId = `acla-cycle:${record.signalId}`;
    try {
      const valuation = simulation.startAssetInrValue;
      if (valuation === null || simulation.tdsCapitalLockInr === null || !record.plan) throw new Error("VALUATION_OR_PLAN_EVIDENCE_MISSING");
      this.capital.reserveCycle({cycleId, signalId: record.signalId, planId: record.plan.id, pathId: simulation.pathId,
        exchange: simulation.exchange, startAsset: simulation.startAsset, initialQuantity: simulation.initialInputQuantity,
        reservedCapitalInr: simulation.initialInputQuantity * valuation, tdsCapitalLockInr: simulation.tdsCapitalLockInr}, now);
      const secondSimulation = this.simulations.refreshQualifiedSimulationBySignalId?.(record.signalId, Date.now()) ?? simulation;
      const secondLastLook = this.lastLook(secondSimulation, configuration, Date.now());
      if (secondLastLook !== null) {
        this.capital.abortPreTrade(cycleId, `SECOND_LAST_LOOK_${secondLastLook}`, Date.now());
        this.record(record, simulation.pathId, "REJECTED", `SECOND_LAST_LOOK_${secondLastLook}`, cycleId, Date.now()); return;
      }
      for (let index = 0; index < secondSimulation.legs.length; index += 1) {
        const source = secondSimulation.legs[index];
        const sequence = (index + 1) as 1 | 2 | 3;
        if (!source) throw new Error(`LEG_${sequence}_EVIDENCE_MISSING`);
        this.capital.beginLeg(cycleId, sequence, Date.now());
        const leg: AclaCycleLegRecord = {sequence, market: source.market, fromAsset: source.fromAsset,
          toAsset: source.toAsset, inputQuantity: source.tradedInputQuantity, outputAfterFee: source.outputAfterFee,
          feeAmount: source.feeAmount, averageFillPrice: source.averageFillPrice, simulated: true, exchangeOrderId: null};
        this.capital.recordFilledLeg(cycleId, leg, Date.now());
      }
      if (secondSimulation.finalOutputQuantity === null) throw new Error("FINAL_START_ASSET_BALANCE_MISSING");
      const startDustInr = secondSimulation.legs[0]?.roundingDustInputQuantity
        ? secondSimulation.legs[0].roundingDustInputQuantity * valuation : 0;
      const dustByAsset = Object.fromEntries(secondSimulation.legs
        .filter((leg) => leg.roundingDustInputQuantity > 0)
        .map((leg) => [leg.fromAsset, leg.roundingDustInputQuantity]));
      this.capital.settleCycle(cycleId, secondSimulation.finalOutputQuantity, valuation, startDustInr, Date.now(), dustByAsset);
      this.recentCycleTimes.push(now); this.lastRouteAt.set(routeKey, now); this.completed += 1; this.lastError = null;
      this.record(record, simulation.pathId, "COMPLETED", "CLOSED_LOOP_SHADOW_RECONCILED", cycleId, Date.now());
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "UNKNOWN_ACLA_LIFECYCLE_ERROR";
      const cycle = this.capital.getCycle(cycleId);
      if (cycle?.state === "PRE_FLIGHT") {
        try { this.capital.abortPreTrade(cycleId, reason, Date.now()); } catch { /* retained for explicit recovery inspection */ }
      }
      this.failed += 1; this.lastError = reason;
      this.record(record, simulation.pathId, "FAILED", reason, cycleId, Date.now());
    }
  }

  private lastLook(simulation: TriangularArbitragePathSimulation, configuration: TriangularArbitrageConfiguration, now: number): string | null {
    if (simulation.status !== "QUALIFIED" || simulation.stressNetProfitPercent === null || simulation.stressNetProfitPercent <= 0) return "STRESS_NET_NOT_POSITIVE";
    if (simulation.stressNetProfitPercent < configuration.minimumNetProfitPercent) return "MINIMUM_NET_PROFIT_NOT_MET";
    if (simulation.absoluteNetProfitInr === null || simulation.absoluteNetProfitInr < configuration.minimumAbsoluteNetProfitInr) return "MINIMUM_ABSOLUTE_PROFIT_NOT_MET";
    if (simulation.maximumBookSkewMs === null || simulation.maximumBookSkewMs > configuration.maximumBookTimestampSkewMs) return "BOOK_TIMESTAMP_SKEW_EXCEEDED";
    if (simulation.legs.length !== 3 || simulation.legs.some((leg) => leg.orderBookTimestamp > now || now - leg.orderBookTimestamp > configuration.maximumOrderBookAgeMs)) return "ORDER_BOOK_STALE";
    return null;
  }

  private record(record: CentralStrategyAdmissionRecord, pathId: string | null, state: AclaLifecycleOutcome["state"], reason: string,
    cycleId: string | null, now: number): void {
    if (state === "REJECTED") this.rejected += 1;
    this.outcomes.push(freeze({admissionId: record.id, signalId: record.signalId, pathId, state, reason, cycleId,
      generatedAt: now, executionMode: "SHADOW" as const, accountMutationPerformed: false as const,
      liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const}));
    if (this.outcomes.length > this.maximumOutcomes) this.outcomes.splice(0, this.outcomes.length - this.maximumOutcomes);
  }
  private prune(now: number): void { while (this.recentCycleTimes.length > 0 && now - (this.recentCycleTimes[0] ?? now) >= 3_600_000) this.recentCycleTimes.shift(); }
}

function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
