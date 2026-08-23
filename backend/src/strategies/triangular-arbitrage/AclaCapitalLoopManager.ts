import {resolve} from "node:path";
import {JsonlSnapshotStore} from "../../core/persistence/JsonlSnapshotStore";
import type {AclaCapitalPoolConfiguration} from "./TriangularArbitrageConfiguration";

export type AclaCycleState =
  | "DETECTED" | "QUALIFIED" | "RESERVED" | "PRE_FLIGHT"
  | "LEG_1_PENDING" | "LEG_1_FILLED" | "LEG_2_PENDING" | "LEG_2_FILLED"
  | "LEG_3_PENDING" | "LEG_3_FILLED" | "RECONCILING" | "COMPLETED"
  | "LEG_1_FAILED" | "LEG_2_FAILED" | "LEG_3_FAILED" | "PARTIALLY_FILLED"
  | "EXPOSED" | "RECOVERY_PLANNED" | "RECOVERY_EXECUTING" | "RECOVERED"
  | "MANUAL_INTERVENTION_REQUIRED" | "ABORTED_PRE_TRADE";

export interface AclaCycleTransition {
  readonly state: AclaCycleState;
  readonly at: number;
  readonly reason: string;
}

export interface AclaCycleLegRecord {
  readonly sequence: 1 | 2 | 3;
  readonly market: string;
  readonly fromAsset: string;
  readonly toAsset: string;
  readonly inputQuantity: number;
  readonly outputAfterFee: number;
  readonly feeAmount: number;
  readonly averageFillPrice: number;
  readonly simulated: true;
  readonly exchangeOrderId: null;
}

export interface AclaCycleRecord {
  readonly version: "180.0";
  readonly id: string;
  readonly signalId: string;
  readonly planId: string;
  readonly pathId: string;
  readonly exchange: string;
  readonly startAsset: string;
  readonly initialQuantity: number;
  readonly reservedCapitalInr: number;
  readonly tdsCapitalLockInr: number;
  readonly state: AclaCycleState;
  readonly transitions: readonly AclaCycleTransition[];
  readonly legs: readonly AclaCycleLegRecord[];
  readonly finalQuantity: number | null;
  readonly realizedPnlAsset: number | null;
  readonly realizedPnlInr: number | null;
  readonly dustInr: number;
  readonly recoveryReason: string | null;
  readonly recoveryAttempts: number;
  readonly exposedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly closedAt: number | null;
  readonly executionMode: "SHADOW";
  readonly accountMutationPerformed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface AclaCapitalPoolState {
  readonly version: "180.0";
  readonly poolId: "acla-strategy-3-capital-pool";
  readonly totalAllocationInr: number;
  readonly activeCycleCapitalInr: number;
  readonly activeFreeInr: number;
  readonly reservedInr: number;
  readonly inFlightInr: number;
  readonly recoveryReserveInr: number;
  readonly recoveryReserveInUseInr: number;
  readonly feeTdsDustReserveInr: number;
  readonly tdsLockedInr: number;
  readonly dustLedgerInr: number;
  readonly dustByAsset: Readonly<Record<string, number>>;
  readonly realizedPnlInr: number;
  readonly reinvestedProfitInr: number;
  readonly sweepableProfitInr: number;
  readonly sweptProfitInr: number;
  readonly tdsCreditReleasedInr: number;
  readonly completedCycles: number;
  readonly failedCycles: number;
  readonly recoveredCycles: number;
  readonly consecutiveFailedCycles: number;
  readonly dailyLossInr: number;
  readonly dailyLossDateKey: string;
  readonly circuitBreakerState: "OPEN" | "TRIPPED";
  readonly circuitBreakerReason: string | null;
  readonly openCycleId: string | null;
  readonly updatedAt: number;
}

interface AclaCapitalSnapshot {
  readonly version: "180.0";
  readonly savedAt: number;
  readonly configuration: AclaCapitalPoolConfiguration;
  readonly pool: AclaCapitalPoolState;
  readonly cycles: readonly AclaCycleRecord[];
}

export class AclaCapitalLoopManager {
  private readonly store: JsonlSnapshotStore<AclaCapitalSnapshot>;
  private pool: AclaCapitalPoolState;
  private readonly cycles = new Map<string, AclaCycleRecord>();
  private restoredAt: number | null = null;

  constructor(
    private readonly configuration: AclaCapitalPoolConfiguration,
    persistenceFilePath = resolve(process.cwd(), "logs", "shadow", "acla-capital-loop.jsonl"),
    private readonly maximumCycles = 2_000,
  ) {
    if (!Number.isSafeInteger(maximumCycles) || maximumCycles < 10) throw new Error("ACLA capital-loop history capacity must be at least 10.");
    this.store = new JsonlSnapshotStore({filePath: persistenceFilePath, isPayload: isSnapshot});
    this.pool = this.initialPool(Date.now());
    this.restore();
  }

  reserveCycle(input: {
    cycleId: string; signalId: string; planId: string; pathId: string; exchange: string;
    startAsset: string; initialQuantity: number; reservedCapitalInr: number; tdsCapitalLockInr: number;
  }, now = Date.now()): AclaCycleRecord {
    validateTime(now);
    this.rollDailyLoss(now);
    const existing = this.cycles.get(input.cycleId);
    if (existing) {
      if (existing.signalId !== input.signalId || existing.planId !== input.planId ||
          Math.abs(existing.reservedCapitalInr - input.reservedCapitalInr) > 1e-8) throw new Error("ACLA cycle ID collision contains different ownership.");
      return clone(existing);
    }
    if (this.pool.openCycleId !== null) throw new Error("ACLA_MAXIMUM_OPEN_CYCLES_REACHED");
    if (this.pool.circuitBreakerState === "TRIPPED") throw new Error(`ACLA_CIRCUIT_BREAKER_TRIPPED:${this.pool.circuitBreakerReason ?? "UNKNOWN"}`);
    if (this.pool.activeCycleCapitalInr < this.configuration.minimumCapitalProtectionInr) throw new Error("ACLA_CAPITAL_PROTECTION_THRESHOLD_REACHED");
    if (!positive(input.reservedCapitalInr) || input.reservedCapitalInr > this.pool.activeFreeInr + 1e-8) throw new Error("ACLA_ACTIVE_CAPITAL_INSUFFICIENT");
    if (!Number.isFinite(input.tdsCapitalLockInr) || input.tdsCapitalLockInr < 0 ||
        input.tdsCapitalLockInr > this.availableFeeReserveInr() + 1e-8) throw new Error("ACLA_TDS_CAPITAL_RESERVE_INSUFFICIENT");
    if (![input.cycleId, input.signalId, input.planId, input.pathId, input.exchange, input.startAsset].every((value) => value.trim())) {
      throw new Error("ACLA cycle ownership fields are required.");
    }
    const transitions: AclaCycleTransition[] = [
      {state: "DETECTED", at: now, reason: "Qualified signal reached the central strategy admission pipeline."},
      {state: "QUALIFIED", at: now, reason: "Full-depth, fee, rule, age, stress and absolute-profit gates passed."},
      {state: "RESERVED", at: now, reason: "Strategy-scoped SHADOW capital reserved atomically."},
      {state: "PRE_FLIGHT", at: now, reason: "Last-look pre-flight required before the first simulated leg."},
    ];
    const record = freeze({version: "180.0" as const, id: input.cycleId, signalId: input.signalId,
      planId: input.planId, pathId: input.pathId, exchange: input.exchange, startAsset: input.startAsset,
      initialQuantity: input.initialQuantity, reservedCapitalInr: input.reservedCapitalInr,
      tdsCapitalLockInr: input.tdsCapitalLockInr, state: "PRE_FLIGHT" as const, transitions,
      legs: [] as readonly AclaCycleLegRecord[], finalQuantity: null, realizedPnlAsset: null,
      realizedPnlInr: null, dustInr: 0, recoveryReason: null, recoveryAttempts: 0,
      exposedAt: null, createdAt: now, updatedAt: now,
      closedAt: null, executionMode: "SHADOW" as const, accountMutationPerformed: false as const,
      liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.cycles.set(record.id, record);
    this.pool = freeze({...clone(this.pool), activeFreeInr: money(this.pool.activeFreeInr - input.reservedCapitalInr),
      reservedInr: money(this.pool.reservedInr + input.reservedCapitalInr),
      tdsLockedInr: money(this.pool.tdsLockedInr + input.tdsCapitalLockInr), openCycleId: record.id, updatedAt: now});
    this.commit(now);
    return clone(record);
  }

  beginLeg(cycleId: string, sequence: 1 | 2 | 3, now = Date.now()): AclaCycleRecord {
    const current = this.requireOpen(cycleId); validateTime(now);
    const expected = sequence === 1 ? "PRE_FLIGHT" : sequence === 2 ? "LEG_1_FILLED" : "LEG_2_FILLED";
    if (current.state !== expected) throw new Error(`ACLA leg ${sequence} cannot start from ${current.state}.`);
    if (sequence === 1) this.pool = freeze({...clone(this.pool), reservedInr: money(this.pool.reservedInr - current.reservedCapitalInr),
      inFlightInr: money(this.pool.inFlightInr + current.reservedCapitalInr), updatedAt: now});
    return this.transition(current, `LEG_${sequence}_PENDING` as AclaCycleState, now, `Shadow leg ${sequence} entered sequential execution.`);
  }

  recordFilledLeg(cycleId: string, leg: AclaCycleLegRecord, now = Date.now()): AclaCycleRecord {
    const current = this.requireOpen(cycleId); validateTime(now);
    if (current.state !== `LEG_${leg.sequence}_PENDING`) throw new Error(`ACLA leg ${leg.sequence} fill is out of sequence.`);
    if (current.legs.some((item) => item.sequence === leg.sequence)) return clone(current);
    if (![leg.inputQuantity, leg.outputAfterFee, leg.averageFillPrice].every(positive) || !Number.isFinite(leg.feeAmount) || leg.feeAmount < 0) {
      throw new Error("ACLA shadow fill evidence is invalid.");
    }
    const updated = freeze({...clone(current), state: `LEG_${leg.sequence}_FILLED` as AclaCycleState,
      transitions: [...current.transitions, {state: `LEG_${leg.sequence}_FILLED` as AclaCycleState, at: now,
        reason: `Sequential SHADOW leg ${leg.sequence} fully reconciled from genuine book evidence.`}],
      legs: [...current.legs, freeze(clone(leg))], updatedAt: now});
    this.cycles.set(cycleId, updated); this.commit(now); return clone(updated);
  }

  settleCycle(
    cycleId: string,
    finalQuantity: number,
    assetInrValue: number,
    dustInr = 0,
    now = Date.now(),
    dustByAsset: Readonly<Record<string, number>> = {},
  ): AclaCycleRecord {
    let current = this.requireOpen(cycleId); validateTime(now);
    this.rollDailyLoss(now);
    if (current.state !== "LEG_3_FILLED" || current.legs.length !== 3) throw new Error("ACLA settlement requires three sequential filled SHADOW legs.");
    if (!positive(finalQuantity) || !positive(assetInrValue) || !Number.isFinite(dustInr) || dustInr < 0) throw new Error("ACLA settlement evidence is invalid.");
    current = this.transition(current, "RECONCILING", now, "Final start-asset balance and all fee/dust evidence are being reconciled.", false);
    const realizedAsset = finalQuantity - current.initialQuantity;
    const realizedInr = money(realizedAsset * assetInrValue - dustInr);
    const reinvestment = realizedInr > 0 ? this.reinvestment(realizedInr) : realizedInr;
    const sweepable = realizedInr > 0 ? realizedInr - reinvestment : 0;
    const returnedPrincipal = Math.max(0, current.reservedCapitalInr + Math.min(0, realizedInr));
    const loss = Math.max(0, -realizedInr);
    const lossControls = this.lossControlPatch(loss, realizedInr < 0, now);
    this.pool = freeze({...clone(this.pool),
      activeCycleCapitalInr: money(this.pool.activeCycleCapitalInr + reinvestment),
      activeFreeInr: money(this.pool.activeFreeInr + returnedPrincipal + Math.max(0, reinvestment)),
      inFlightInr: money(this.pool.inFlightInr - current.reservedCapitalInr),
      dustLedgerInr: money(this.pool.dustLedgerInr + dustInr),
      dustByAsset: mergeDust(this.pool.dustByAsset, dustByAsset),
      realizedPnlInr: money(this.pool.realizedPnlInr + realizedInr),
      reinvestedProfitInr: money(this.pool.reinvestedProfitInr + Math.max(0, reinvestment)),
      sweepableProfitInr: money(this.pool.sweepableProfitInr + sweepable), completedCycles: this.pool.completedCycles + 1,
      ...lossControls, openCycleId: null, updatedAt: now});
    const completed = freeze({...clone(current), state: "COMPLETED" as const,
      transitions: [...current.transitions, {state: "COMPLETED" as const, at: now,
        reason: "Closed-loop SHADOW cycle returned to its start asset and accounting reconciled."}],
      finalQuantity, realizedPnlAsset: realizedAsset, realizedPnlInr: realizedInr, dustInr, updatedAt: now, closedAt: now});
    this.cycles.set(cycleId, completed); this.commit(now); return clone(completed);
  }

  abortPreTrade(cycleId: string, reason: string, now = Date.now()): AclaCycleRecord {
    const current = this.requireOpen(cycleId); validateTime(now);
    if (current.state !== "PRE_FLIGHT" && current.state !== "RESERVED") throw new Error("Only an unexposed ACLA cycle can abort pre-trade.");
    this.releaseOpenCapital(current, now, false);
    const aborted = freeze({...clone(current), state: "ABORTED_PRE_TRADE" as const,
      transitions: [...current.transitions, {state: "ABORTED_PRE_TRADE" as const, at: now, reason: requiredReason(reason)}],
      recoveryReason: requiredReason(reason), updatedAt: now, closedAt: now});
    this.cycles.set(cycleId, aborted); this.commit(now); return clone(aborted);
  }

  markExposed(cycleId: string, failedLeg: 1 | 2 | 3, reason: string, now = Date.now()): AclaCycleRecord {
    let current = this.requireOpen(cycleId); validateTime(now);
    const pending = `LEG_${failedLeg}_PENDING` as AclaCycleState;
    if (current.state !== pending) throw new Error("ACLA failure evidence does not match the pending leg.");
    current = this.transition(current, `LEG_${failedLeg}_FAILED` as AclaCycleState, now, requiredReason(reason), false);
    current = this.transition(current, current.legs.length > 0 ? "PARTIALLY_FILLED" : "ABORTED_PRE_TRADE", now,
      current.legs.length > 0 ? "A prior leg filled; remaining inventory is exposed." : "No leg filled; the cycle is safely unexposed.", false);
    if (current.state === "ABORTED_PRE_TRADE") {
      this.releaseOpenCapital(current, now, true);
      const closed = freeze({...clone(current), closedAt: now}); this.cycles.set(cycleId, closed); this.commit(now); return clone(closed);
    }
    this.pool = freeze({...clone(this.pool), recoveryReserveInUseInr: this.pool.recoveryReserveInr, updatedAt: now});
    const exposed = this.transition(current, "EXPOSED", now, "Profit threshold is suspended; exposure-reduction policy now owns the cycle.", false);
    const updated = freeze({...clone(exposed), exposedAt: now});
    this.cycles.set(cycleId, updated); this.commit(now); return clone(updated);
  }

  planRecovery(cycleId: string, reason: string, now = Date.now()): AclaCycleRecord {
    const current = this.requireOpen(cycleId); validateTime(now);
    if (current.state !== "EXPOSED") throw new Error("Only exposed ACLA inventory can enter recovery planning.");
    return this.transition(current, "RECOVERY_PLANNED", now, requiredReason(reason));
  }

  beginRecovery(cycleId: string, now = Date.now()): AclaCycleRecord {
    const current = this.requireOpen(cycleId); validateTime(now);
    if (current.state !== "RECOVERY_PLANNED") throw new Error("ACLA recovery must be explicitly planned first.");
    if (current.recoveryAttempts >= this.configuration.maximumRecoveryAttempts) throw new Error("ACLA_MAXIMUM_RECOVERY_ATTEMPTS_REACHED");
    if (current.exposedAt !== null && now - current.exposedAt > this.configuration.maximumUnconvertedDurationMs) {
      throw new Error("ACLA_MAXIMUM_UNCONVERTED_DURATION_EXCEEDED");
    }
    const incremented = freeze({...clone(current), recoveryAttempts: current.recoveryAttempts + 1, updatedAt: now});
    this.cycles.set(cycleId, incremented);
    return this.transition(incremented, "RECOVERY_EXECUTING", now, "Bounded direct-or-two-leg return-to-start recovery simulation began.");
  }

  completeRecovery(cycleId: string, recoveredCapitalInr: number, reason: string, now = Date.now()): AclaCycleRecord {
    const current = this.requireOpen(cycleId); validateTime(now);
    this.rollDailyLoss(now);
    if (current.state !== "RECOVERY_EXECUTING" || !Number.isFinite(recoveredCapitalInr) || recoveredCapitalInr < 0) {
      throw new Error("ACLA recovery completion evidence is invalid.");
    }
    const pnl = money(recoveredCapitalInr - current.reservedCapitalInr);
    const loss = Math.max(0, -pnl);
    const lossControls = this.lossControlPatch(loss, true, now, loss > this.configuration.maximumRecoveryLossInr
      ? "MAXIMUM_RECOVERY_LOSS_EXCEEDED" : null);
    this.pool = freeze({...clone(this.pool), activeCycleCapitalInr: money(this.pool.activeCycleCapitalInr + Math.min(0, pnl)),
      activeFreeInr: money(this.pool.activeFreeInr + recoveredCapitalInr), inFlightInr: money(this.pool.inFlightInr - current.reservedCapitalInr),
      recoveryReserveInUseInr: 0, realizedPnlInr: money(this.pool.realizedPnlInr + pnl),
      failedCycles: this.pool.failedCycles + 1, recoveredCycles: this.pool.recoveredCycles + 1,
      ...lossControls, openCycleId: null, updatedAt: now});
    const recovered = freeze({...clone(current), state: "RECOVERED" as const,
      transitions: [...current.transitions, {state: "RECOVERED" as const, at: now, reason: requiredReason(reason)}],
      realizedPnlInr: pnl, recoveryReason: requiredReason(reason), updatedAt: now, closedAt: now});
    this.cycles.set(cycleId, recovered); this.commit(now); return clone(recovered);
  }

  releaseTdsCredit(amountInr: number, reference: string, now = Date.now()): AclaCapitalPoolState {
    validateTime(now);
    if (!positive(amountInr) || amountInr > this.pool.tdsLockedInr + 1e-8) throw new Error("ACLA_TDS_CREDIT_RELEASE_INVALID");
    requiredReason(reference);
    this.pool = freeze({...clone(this.pool), tdsLockedInr: money(this.pool.tdsLockedInr - amountInr),
      tdsCreditReleasedInr: money(this.pool.tdsCreditReleasedInr + amountInr), updatedAt: now});
    this.commit(now); return clone(this.pool);
  }

  sweepProfit(amountInr: number, reference: string, now = Date.now()): AclaCapitalPoolState {
    validateTime(now);
    if (!positive(amountInr) || amountInr > this.pool.sweepableProfitInr + 1e-8 ||
        this.pool.sweepableProfitInr < this.configuration.profitSweepThresholdInr) throw new Error("ACLA_PROFIT_SWEEP_NOT_AVAILABLE");
    requiredReason(reference);
    this.pool = freeze({...clone(this.pool), sweepableProfitInr: money(this.pool.sweepableProfitInr - amountInr),
      sweptProfitInr: money(this.pool.sweptProfitInr + amountInr), updatedAt: now});
    this.commit(now); return clone(this.pool);
  }

  getCycle(cycleId: string): AclaCycleRecord | null { const item = this.cycles.get(cycleId); return item ? clone(item) : null; }
  getReport(now = Date.now()) {
    validateTime(now); const values = [...this.cycles.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return freeze({version: "180.0" as const, generatedAt: now, restoredAt: this.restoredAt, pool: clone(this.pool),
      openCycle: this.pool.openCycleId ? clone(this.cycles.get(this.pool.openCycleId) ?? null) : null,
      recentCycles: values.slice(0, 50).map(clone), persistence: this.store.getDiagnostics(),
      invariant: this.invariant(), configuration: clone(this.configuration),
      safety: {strategyScopedSubledger: true, sharedCentralPaperAllocationRequiredBeforePaper: true,
        globalCapitalMutationPerformed: false, maximumOpenCycles: 1, noLeverage: true, noBorrowing: true,
        shadowOnly: true, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  clearForTests(): void { this.store.clear(); this.cycles.clear(); this.pool = this.initialPool(Date.now()); this.restoredAt = null; }

  private transition(current: AclaCycleRecord, state: AclaCycleState, now: number, reason: string, persist = true): AclaCycleRecord {
    const updated = freeze({...clone(current), state, transitions: [...current.transitions, {state, at: now, reason}], updatedAt: now});
    this.cycles.set(current.id, updated); if (persist) this.commit(now); return clone(updated);
  }
  private releaseOpenCapital(current: AclaCycleRecord, now: number, failed: boolean): void {
    const fromInFlight = this.pool.inFlightInr >= current.reservedCapitalInr;
    this.pool = freeze({...clone(this.pool), activeFreeInr: money(this.pool.activeFreeInr + current.reservedCapitalInr),
      reservedInr: fromInFlight ? this.pool.reservedInr : money(this.pool.reservedInr - current.reservedCapitalInr),
      inFlightInr: fromInFlight ? money(this.pool.inFlightInr - current.reservedCapitalInr) : this.pool.inFlightInr,
      tdsLockedInr: money(this.pool.tdsLockedInr - current.tdsCapitalLockInr), failedCycles: this.pool.failedCycles + (failed ? 1 : 0),
      openCycleId: null, updatedAt: now});
  }
  private requireOpen(id: string): AclaCycleRecord {
    const item = this.cycles.get(id); if (!item || this.pool.openCycleId !== id || item.closedAt !== null) throw new Error(`ACLA open cycle not found: ${id}`); return item;
  }
  private reinvestment(profit: number): number {
    if (this.configuration.compoundingMode === "FIXED") return 0;
    if (this.configuration.compoundingMode === "COMPOUND") return profit;
    return money(profit * this.configuration.hybridReinvestmentPercent / 100);
  }
  private availableFeeReserveInr(): number { return money(this.pool.feeTdsDustReserveInr - this.pool.tdsLockedInr - this.pool.dustLedgerInr); }
  private rollDailyLoss(now: number): void {
    const key = accountingDateKey(now);
    if (this.pool.dailyLossDateKey === key) return;
    this.pool = freeze({...clone(this.pool), dailyLossDateKey: key, dailyLossInr: 0,
      circuitBreakerState: this.pool.circuitBreakerReason === "DAILY_LOSS_LIMIT_REACHED" ? "OPEN" : this.pool.circuitBreakerState,
      circuitBreakerReason: this.pool.circuitBreakerReason === "DAILY_LOSS_LIMIT_REACHED" ? null : this.pool.circuitBreakerReason,
      updatedAt: now});
  }
  private lossControlPatch(lossInr: number, failed: boolean, now: number, forcedReason: string | null = null) {
    const consecutiveFailedCycles = failed ? this.pool.consecutiveFailedCycles + 1 : 0;
    const dailyLossInr = money(this.pool.dailyLossInr + lossInr);
    const projectedCapital = money(this.pool.activeCycleCapitalInr - lossInr);
    let reason = forcedReason;
    if (lossInr > this.configuration.maximumCycleLossInr) reason ??= "MAXIMUM_CYCLE_LOSS_EXCEEDED";
    if (dailyLossInr >= this.configuration.dailyLossLimitInr) reason ??= "DAILY_LOSS_LIMIT_REACHED";
    if (consecutiveFailedCycles >= this.configuration.maximumConsecutiveFailedCycles) reason ??= "CONSECUTIVE_FAILURE_LIMIT_REACHED";
    if (projectedCapital < this.configuration.minimumCapitalProtectionInr) reason ??= "CAPITAL_PROTECTION_THRESHOLD_REACHED";
    return {consecutiveFailedCycles, dailyLossInr, dailyLossDateKey: accountingDateKey(now),
      circuitBreakerState: reason ? "TRIPPED" as const : this.pool.circuitBreakerState,
      circuitBreakerReason: reason ?? this.pool.circuitBreakerReason};
  }
  private invariant() {
    const activeDifference = money(this.pool.activeCycleCapitalInr - this.pool.activeFreeInr - this.pool.reservedInr - this.pool.inFlightInr);
    const bucketsConfigured = money(this.configuration.activeCycleCapitalInr + this.configuration.recoveryReserveInr + this.configuration.feeTdsDustReserveInr);
    return freeze({activeDifferenceInr: activeDifference, activeBalanced: Math.abs(activeDifference) <= 1e-6,
      configuredBucketsInr: bucketsConfigured, configuredTotalInr: this.configuration.totalAllocationInr,
      configuredBalanced: Math.abs(bucketsConfigured - this.configuration.totalAllocationInr) <= 1e-6,
      openCycleConsistent: (this.pool.openCycleId === null) === (this.pool.reservedInr === 0 && this.pool.inFlightInr === 0),
      feeReserveNonNegative: this.availableFeeReserveInr() >= -1e-6,
      recoveryReserveProtected: this.pool.recoveryReserveInUseInr >= 0 && this.pool.recoveryReserveInUseInr <= this.pool.recoveryReserveInr});
  }
  private commit(now: number): void {
    const invariant = this.invariant();
    if (!invariant.activeBalanced || !invariant.configuredBalanced || !invariant.openCycleConsistent || !invariant.feeReserveNonNegative || !invariant.recoveryReserveProtected) {
      throw new Error(`ACLA_CAPITAL_INVARIANT_FAILED:${JSON.stringify(invariant)}`);
    }
    const values = [...this.cycles.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const retained = values.length <= this.maximumCycles ? values : [
      ...values.filter((item) => item.closedAt === null),
      ...values.filter((item) => item.closedAt !== null).slice(-(this.maximumCycles - values.filter((item) => item.closedAt === null).length)),
    ];
    this.cycles.clear(); for (const item of retained) this.cycles.set(item.id, item);
    this.store.replaceAllAtomically([{version: "180.0", savedAt: now, configuration: clone(this.configuration), pool: clone(this.pool), cycles: retained.map(clone)}]);
  }
  private restore(): void {
    const snapshot = this.store.readLatest();
    if (snapshot) {
      if (JSON.stringify(snapshot.configuration) !== JSON.stringify(this.configuration)) throw new Error("ACLA persisted capital configuration does not match runtime configuration.");
      this.pool = freeze(clone(snapshot.pool)); for (const item of snapshot.cycles) this.cycles.set(item.id, freeze(clone(item)));
    }
    this.restoredAt = Date.now();
    const invariant = this.invariant();
    if (!invariant.activeBalanced || !invariant.configuredBalanced || !invariant.openCycleConsistent || !invariant.feeReserveNonNegative || !invariant.recoveryReserveProtected) {
      throw new Error("ACLA persisted capital invariant is invalid.");
    }
  }
  private initialPool(now: number): AclaCapitalPoolState {
    return freeze({version: "180.0", poolId: "acla-strategy-3-capital-pool", totalAllocationInr: this.configuration.totalAllocationInr,
      activeCycleCapitalInr: this.configuration.activeCycleCapitalInr, activeFreeInr: this.configuration.activeCycleCapitalInr,
      reservedInr: 0, inFlightInr: 0, recoveryReserveInr: this.configuration.recoveryReserveInr,
      recoveryReserveInUseInr: 0, feeTdsDustReserveInr: this.configuration.feeTdsDustReserveInr,
      tdsLockedInr: 0, dustLedgerInr: 0, dustByAsset: {}, realizedPnlInr: 0,
      reinvestedProfitInr: 0, sweepableProfitInr: 0, sweptProfitInr: 0, tdsCreditReleasedInr: 0,
      completedCycles: 0, failedCycles: 0, recoveredCycles: 0, consecutiveFailedCycles: 0,
      dailyLossInr: 0, dailyLossDateKey: accountingDateKey(now), circuitBreakerState: "OPEN",
      circuitBreakerReason: null, openCycleId: null, updatedAt: now});
  }
}

function isSnapshot(value: unknown): value is AclaCapitalSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<AclaCapitalSnapshot>;
  return item.version === "180.0" && Number.isSafeInteger(item.savedAt) && typeof item.configuration === "object" &&
    typeof item.pool === "object" && item.pool !== null && item.pool.version === "180.0" && Array.isArray(item.cycles) &&
    item.cycles.every((cycle) => typeof cycle === "object" && cycle !== null && cycle.version === "180.0" &&
      cycle.accountMutationPerformed === false && cycle.liveExecutionAllowed === false && cycle.orderSubmissionAllowed === false);
}
function requiredReason(value: string): string { const result = value.trim(); if (!result) throw new Error("ACLA lifecycle reason is required."); return result; }
function validateTime(now: number): void { if (!Number.isSafeInteger(now) || now <= 0) throw new Error("ACLA timestamp must be a positive integer."); }
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function money(value: number): number { return Math.abs(value) <= 1e-8 ? 0 : Number(value.toFixed(8)); }
function accountingDateKey(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"}).format(now);
}
function mergeDust(current: Readonly<Record<string, number>>, incoming: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const result: Record<string, number> = {...current};
  for (const [asset, quantity] of Object.entries(incoming)) {
    const normalized = asset.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized || !Number.isFinite(quantity) || quantity < 0) throw new Error("ACLA_DUST_EVIDENCE_INVALID");
    result[normalized] = money((result[normalized] ?? 0) + quantity);
  }
  return freeze(result);
}
function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
