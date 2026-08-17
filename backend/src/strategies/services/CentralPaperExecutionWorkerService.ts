import type {CentralPaperSimulationEvidence} from "./CentralMultiLegPaperSimulator";
import {centralMultiLegPaperSimulator, type CentralMultiLegPaperSimulator} from "./CentralMultiLegPaperSimulator";
import {centralPaperExecutionQueueService, type CentralPaperExecutionQueueService, type CentralPaperQueueRecord} from "./CentralPaperExecutionQueueService";
import {centralPaperSimulationJournalService, type CentralPaperSimulationJournalService} from "./CentralPaperSimulationJournalService";
import {centralPaperPositionLedgerService, type CentralPaperPositionLedgerService} from "./CentralPaperPositionLedgerService";
import {centralPaperPositionAccountingService, type CentralPaperPositionAccountingService} from "./CentralPaperPositionAccountingService";
import {centralPaperCapitalValuationService} from "./CentralPaperCapitalValuationService";
import {centralPaperSharedRecoveryBridgeService, type CentralPaperSharedRecoveryBridgeService} from "../../recovery/adapters/CentralPaperSharedRecoveryBridgeService";
import {centralPaperCapitalAllocationService, type CentralPaperCapitalAllocationService} from "./CentralPaperCapitalAllocationService";

export interface CentralPaperSimulationEvidenceProvider {
  getEvidence(record: CentralPaperQueueRecord, now: number): CentralPaperSimulationEvidence | null;
}

export interface CentralPaperPnlConversionProvider {
  convertAssetToInr(sourceAsset: string, sourceQuantity: number, contextId: string, now: number): ReturnType<typeof centralPaperCapitalValuationService.convertAssetToInr>;
}

export interface CentralPaperExecutionWorkerConfiguration {
  readonly enabled?: boolean;
  readonly workerId?: string;
  readonly leaseTtlMs?: number;
  readonly pollIntervalMs?: number;
  readonly evidenceRetryDelayMs?: number;
  readonly maximumEvidenceAttempts?: number;
}

export interface CentralPaperExecutionWorkerRun {
  readonly version: "59.0";
  readonly generatedAt: number;
  readonly state: "DISABLED" | "NO_DATA" | "WAITING_FOR_EVIDENCE" | "CAPITAL_ALLOCATION_REJECTED" | "REJECTED_NO_EVIDENCE" | "POSITION_ACCOUNTED" | "SHARED_RECOVERY_STAGED" | "RECOVERY_STAGING_FAILED" | "FAILED";
  readonly queueRecordId: string | null;
  readonly planId: string | null;
  readonly simulationResultId: string | null;
  readonly journalRecordId: string | null;
  readonly terminalEvidenceId: string | null;
  readonly reasons: readonly string[];
  readonly accountPnlMutationPerformed: boolean;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export class CentralPaperExecutionWorkerService {
  private readonly enabled: boolean;
  private readonly workerId: string;
  private readonly leaseTtlMs: number;
  private readonly pollIntervalMs: number;
  private readonly evidenceRetryDelayMs: number;
  private readonly maximumEvidenceAttempts: number;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private runs = 0;
  private completed = 0;
  private recoveryStaged = 0;
  private failed = 0;
  private evidenceDeferred = 0;
  private lastRun: CentralPaperExecutionWorkerRun | null = null;

  constructor(
    config: CentralPaperExecutionWorkerConfiguration,
    private readonly evidenceProvider: CentralPaperSimulationEvidenceProvider,
    private readonly queue: CentralPaperExecutionQueueService = centralPaperExecutionQueueService,
    private readonly simulator: CentralMultiLegPaperSimulator = centralMultiLegPaperSimulator,
    private readonly journal: CentralPaperSimulationJournalService = centralPaperSimulationJournalService,
    private readonly recoveryBridge: CentralPaperSharedRecoveryBridgeService = centralPaperSharedRecoveryBridgeService,
    private readonly positions: CentralPaperPositionLedgerService = centralPaperPositionLedgerService,
    private readonly accounting: CentralPaperPositionAccountingService = centralPaperPositionAccountingService,
    private readonly pnlConversion: CentralPaperPnlConversionProvider = centralPaperCapitalValuationService,
    private readonly capital: CentralPaperCapitalAllocationService = centralPaperCapitalAllocationService,
  ) {
    this.enabled = config.enabled ?? false;
    this.workerId = config.workerId?.trim() || "central-paper-worker";
    this.leaseTtlMs = config.leaseTtlMs ?? 5_000;
    this.pollIntervalMs = config.pollIntervalMs ?? 1_000;
    this.evidenceRetryDelayMs = config.evidenceRetryDelayMs ?? 1_000;
    this.maximumEvidenceAttempts = config.maximumEvidenceAttempts ?? 10;
    if (!Number.isSafeInteger(this.leaseTtlMs) || this.leaseTtlMs < 1_000 || this.leaseTtlMs > 30_000) throw new Error("Central PAPER worker lease TTL must be 1000-30000 ms.");
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs < 250 || this.pollIntervalMs > 60_000) throw new Error("Central PAPER worker poll interval must be 250-60000 ms.");
    if (!Number.isSafeInteger(this.evidenceRetryDelayMs) || this.evidenceRetryDelayMs < 250 || this.evidenceRetryDelayMs > 60_000) throw new Error("Central PAPER worker evidence retry delay must be 250-60000 ms.");
    if (!Number.isSafeInteger(this.maximumEvidenceAttempts) || this.maximumEvidenceAttempts < 1 || this.maximumEvidenceAttempts > 100) throw new Error("Central PAPER worker maximum evidence attempts must be 1-100.");
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => { this.runOnce(); }, this.pollIntervalMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  runOnce(now = Date.now()): CentralPaperExecutionWorkerRun {
    if (this.running) return this.finish("FAILED", null, null, null, null, null, ["Central PAPER worker is already running."], now);
    if (!this.enabled) return this.finish("DISABLED", null, null, null, null, null, ["Central PAPER worker is disabled."], now);
    this.running = true;
    this.runs += 1;
    let leased: CentralPaperQueueRecord | null = null;
    let durableExposureCaptured = false;
    try {
      this.releaseTerminalCapital(now);
      leased = this.queue.leaseNext(this.workerId, now, this.leaseTtlMs);
      if (!leased) return this.finish("NO_DATA", null, null, null, null, null, ["No eligible central PAPER plan is queued."], now);
      const allocation = this.capital.allocate(leased.plan.id, leased.plan.strategyId, leased.approvedCapitalInr, now);
      if (allocation.state !== "ACTIVE") {
        const terminal = `central-paper-capital-rejected:${leased.id}:${leased.attempts}`;
        this.queue.acknowledge(leased.id, leased.leaseId!, "REJECTED", terminal, now);
        this.failed += 1;
        return this.finish("CAPITAL_ALLOCATION_REJECTED", leased.id, leased.plan.id, null, null, terminal,
          [allocation.terminalReason ?? "Shared PAPER capital allocation was rejected."], now);
      }
      const evidence = this.evidenceProvider.getEvidence(leased, now);
      if (!evidence) {
        const retryAt = now + this.evidenceRetryDelayMs;
        if (leased.attempts < this.maximumEvidenceAttempts && retryAt < leased.plan.expiresAt) {
          this.queue.deferForEvidence(leased.id, leased.leaseId!, "Exact current simulation evidence is not yet available.", now, this.evidenceRetryDelayMs);
          this.evidenceDeferred += 1;
          return this.finish("WAITING_FOR_EVIDENCE", leased.id, leased.plan.id, null, null, null,
            [`Exact current simulation evidence is not yet available; bounded retry ${leased.attempts}/${this.maximumEvidenceAttempts} is scheduled.`], now);
        }
        const terminal = `central-paper-no-evidence:${leased.id}:${leased.attempts}`;
        this.queue.acknowledge(leased.id, leased.leaseId!, "REJECTED", terminal, now);
        this.capital.releaseByPlanId(leased.plan.id, "Plan reached its evidence-attempt or expiry boundary without a simulated fill.", now);
        this.failed += 1;
        return this.finish("REJECTED_NO_EVIDENCE", leased.id, leased.plan.id, null, null, terminal, ["Exact current simulation evidence is unavailable."], now);
      }
      const simulation = this.simulator.simulate(leased, evidence, now);
      const captured = this.journal.capture(leased, simulation, now);
      durableExposureCaptured = simulation.legs.some((item) => item.filledQuantity > 0);
      if (simulation.recoveryRequired) {
        const recovery = this.recoveryBridge.synchronize(leased, simulation, now);
        const recoveryRecord = this.journal.recordRecovery(simulation.id, recovery.intents.map((item) => item.id), recovery.rejected, now);
        this.queue.acknowledge(leased.id, leased.leaseId!, "REJECTED", recoveryRecord.id, now);
        if (recoveryRecord.state === "SHARED_RECOVERY_STAGED") {
          this.recoveryStaged += 1;
          return this.finish("SHARED_RECOVERY_STAGED", leased.id, leased.plan.id, simulation.id, recoveryRecord.id, recoveryRecord.id, ["Residual PAPER exposure was staged in shared recovery."], now);
        }
        this.failed += 1;
        return this.finish("RECOVERY_STAGING_FAILED", leased.id, leased.plan.id, simulation.id, recoveryRecord.id, recoveryRecord.id, recovery.rejections.map((item) => item.reason), now);
      }
      const position = this.positions.recordEntry(captured, now);
      let terminalEvidenceId = position.id;
      let accountPnlMutationPerformed = false;
      if (position.state === "CLOSED" && position.realizedPnlAsset && position.realizedNetPnlQuote !== null) {
        const conversion = this.pnlConversion.convertAssetToInr(position.realizedPnlAsset, Math.abs(position.realizedNetPnlQuote), position.id, now);
        if (conversion) {
          const booked = this.accounting.book(position, conversion, now);
          terminalEvidenceId = booked.id;
          accountPnlMutationPerformed = true;
        }
      }
      const accounted = this.journal.markPositionAccounted(simulation.id, terminalEvidenceId, now);
      this.queue.acknowledge(leased.id, leased.leaseId!, "COMPLETED", accounted.id, now);
      if (position.state === "CLOSED" && accountPnlMutationPerformed) {
        this.capital.releaseByPlanId(leased.plan.id, "Closed PAPER cycle was durably accounted.", now);
      }
      this.completed += 1;
      return this.finish("POSITION_ACCOUNTED", leased.id, leased.plan.id, simulation.id, accounted.id, terminalEvidenceId,
        [position.state === "CLOSED"
          ? accountPnlMutationPerformed
            ? "PAPER cycle was journaled, settled, INR-valued and durably account-posted."
            : "PAPER cycle was journaled and settled; INR conversion is unavailable, so account posting remains pending reconciliation."
          : "PAPER simulation was journaled and durably position-accounted."], now, accountPnlMutationPerformed);
    } catch (error: unknown) {
      this.failed += 1;
      const reason = error instanceof Error ? error.message : "Central PAPER worker failed.";
      if (leased?.leaseId) {
        try { this.queue.acknowledge(leased.id, leased.leaseId, "REJECTED", `central-paper-worker-failure:${leased.id}:${leased.attempts}`, now); } catch { /* exact lease may already be terminal */ }
      }
      if (leased && !durableExposureCaptured) {
        try { this.capital.releaseByPlanId(leased.plan.id, "Worker failed before any durable simulated exposure was captured.", now); } catch { /* preserve original failure */ }
      }
      return this.finish("FAILED", leased?.id ?? null, leased?.plan.id ?? null, null, null, null, [reason], now);
    } finally {
      this.running = false;
    }
  }

  getDiagnostics(now = Date.now()) {
    return freeze({version: "59.0" as const, generatedAt: now, enabled: this.enabled, running: this.running, workerId: this.workerId,
      leaseTtlMs: this.leaseTtlMs, pollIntervalMs: this.pollIntervalMs, evidenceRetryDelayMs: this.evidenceRetryDelayMs,
      maximumEvidenceAttempts: this.maximumEvidenceAttempts, serviceRunning: this.timer !== null,
      runs: this.runs, completed: this.completed, recoveryStaged: this.recoveryStaged, evidenceDeferred: this.evidenceDeferred, failed: this.failed,
      lastRun: this.lastRun ? structuredClone(this.lastRun) : null,
      capital: this.capital.getDiagnostics(now),
      safety: {singleSharedWorker: true, journalBeforeTerminalAcknowledgement: true, sharedRecoveryOnly: true,
        paperAccountMutationRequiresJournalAndInrConversion: true, transientEvidenceAbsenceIsDeferred: true,
        retriesBoundedByAttemptAndPlanExpiry: true, durableCapitalBeforeSimulation: true,
        exposureCapitalHeldUntilRecoveryOrAccounting: true, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private finish(state: CentralPaperExecutionWorkerRun["state"], queueRecordId: string | null, planId: string | null,
    simulationResultId: string | null, journalRecordId: string | null, terminalEvidenceId: string | null, reasons: readonly string[], now: number,
    accountPnlMutationPerformed = false): CentralPaperExecutionWorkerRun {
    const result = freeze({version: "59.0" as const, generatedAt: now, state, queueRecordId, planId, simulationResultId, journalRecordId,
      terminalEvidenceId, reasons: [...reasons], accountPnlMutationPerformed, liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.lastRun = result;
    return structuredClone(result);
  }

  private releaseTerminalCapital(now: number): void {
    this.queue.sweepExpired(now);
    for (const allocation of this.capital.getActive()) {
      const record = this.queue.getByPlanId(allocation.planId, now);
      if (record?.state === "REJECTED" || record?.state === "EXPIRED") {
        this.capital.releaseByPlanId(allocation.planId, `Central PAPER queue reached terminal ${record.state} without durable open exposure.`, now);
      }
    }
  }
}

function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

import {centralPaperSimulationEvidenceProvider} from "./CentralPaperSimulationEvidenceProvider";
import {strategyRuntimeOperatorConfiguration} from "../config/StrategyRuntimeOperatorConfiguration";
export const centralPaperExecutionWorkerService = new CentralPaperExecutionWorkerService({
  enabled: strategyRuntimeOperatorConfiguration.centralPaper.enabled,
}, centralPaperSimulationEvidenceProvider);
