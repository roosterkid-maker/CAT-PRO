import type {CentralLiveDispatchJournalRecord} from "./CentralLiveExecutionOutcomeJournalService";
import {CentralLiveExecutionOutcomeJournalService} from "./CentralLiveExecutionOutcomeJournalService";
import {CentralLiveLifecycleHandlerRegistry, type CentralLiveLifecycleOutcome} from "./CentralLiveLifecycleHandlerRegistry";
import {CentralLiveExecutionQueueService, type CentralLiveQueueRecord} from "./CentralLiveExecutionQueueService";

export interface CentralLiveExecutionDispatcherConfiguration {
  readonly enabled?: boolean;
  readonly workerId?: string;
  readonly leaseTtlMs?: number;
}

export interface CentralLiveExecutionDispatcherRun {
  readonly version: "70.0";
  readonly generatedAt: number;
  readonly state: "DISABLED" | "NO_DATA" | "MONITORING" | "COMPLETED" | "RECOVERY_REQUIRED" | "REJECTED" | "RECONCILIATION_REQUIRED";
  readonly queueRecordId: string | null;
  readonly dispatchJournalId: string | null;
  readonly handlerId: string | null;
  readonly orderSubmissionPerformed: boolean;
  readonly reasons: readonly string[];
}

export class CentralLiveExecutionDispatcherService {
  private readonly enabled: boolean;
  private readonly workerId: string;
  private readonly leaseTtlMs: number;
  private running = false;

  constructor(
    configuration: CentralLiveExecutionDispatcherConfiguration,
    private readonly queue: CentralLiveExecutionQueueService,
    private readonly journal: CentralLiveExecutionOutcomeJournalService,
    private readonly handlers: CentralLiveLifecycleHandlerRegistry,
  ) {
    this.enabled = configuration.enabled ?? false;
    this.workerId = configuration.workerId?.trim() || "central-live-dispatcher";
    this.leaseTtlMs = configuration.leaseTtlMs ?? 5_000;
    if (!Number.isSafeInteger(this.leaseTtlMs) || this.leaseTtlMs < 1_000 || this.leaseTtlMs > 10_000) throw new Error("Central LIVE dispatcher lease TTL must be 1000-10000 ms.");
  }

  async runOnce(now = Date.now()): Promise<CentralLiveExecutionDispatcherRun> {
    if (!this.enabled) return this.result("DISABLED", null, null, null, false, ["Central LIVE dispatcher is disabled."], now);
    if (this.running) return this.result("RECONCILIATION_REQUIRED", null, null, null, false, ["Central LIVE dispatcher is already running."], now);
    this.running = true;
    try {
      const dispatching = this.queue.getDispatching(now)[0] ?? null;
      if (dispatching) {
        const dispatch = dispatching.dispatchJournalId ? this.journal.get(dispatching.dispatchJournalId) : null;
        if (!dispatch) return this.result("RECONCILIATION_REQUIRED", dispatching.id, dispatching.dispatchJournalId,
          dispatching.lifecycleHandlerId, dispatching.orderSubmissionPerformed, ["In-flight queue record is missing its durable outcome journal."], now);
        return this.resume(dispatching, dispatch, now);
      }

      const pending = this.journal.getPending()[0] ?? null;
      if (pending) {
        const record = this.queue.getById(pending.queueRecordId, now);
        if (!record) return this.result("RECONCILIATION_REQUIRED", pending.queueRecordId, pending.id, pending.handlerId, false,
          ["Pending dispatch journal is missing its durable queue record."], now);
        const dispatchRecord = record.state === "DISPATCHING" ? record
          : record.state === "LEASED" && record.leaseId
            ? this.queue.beginDispatch(record.id, record.leaseId, pending.id, now, pending.startedAt)
            : null;
        if (!dispatchRecord) return this.result("RECONCILIATION_REQUIRED", record.id, pending.id, pending.handlerId,
          record.orderSubmissionPerformed, [`Pending dispatch cannot resume from queue state ${record.state}.`], now);
        return this.resume(dispatchRecord, pending, now);
      }

      const leased = this.queue.leaseNext(this.workerId, now, this.leaseTtlMs);
      if (!leased?.leaseId) return this.result("NO_DATA", null, null, null, false, ["No eligible central LIVE plan is queued."], now);
      const started = this.journal.begin(leased, now).record;
      const dispatchRecord = this.queue.beginDispatch(leased.id, leased.leaseId, started.id, now, started.startedAt);
      return this.resume(dispatchRecord, started, now);
    } finally {
      this.running = false;
    }
  }

  getDiagnostics(now = Date.now()) {
    return freeze({version: "70.0" as const, generatedAt: now, enabled: this.enabled, running: this.running, workerId: this.workerId,
      leaseTtlMs: this.leaseTtlMs, queue: this.queue.getDiagnostics(now), journal: this.journal.getDiagnostics(now), handlers: this.handlers.getDiagnostics(),
      safety: {journalStartedBeforeHandler: true, idempotencyKeyRequired: true, pendingDispatchResumedBeforeNewWork: true,
        inFlightDispatchNeverBlindlyExpired: true, defaultEnabled: false}});
  }

  private async resume(queueRecord: CentralLiveQueueRecord, dispatch: CentralLiveDispatchJournalRecord, now: number): Promise<CentralLiveExecutionDispatcherRun> {
    if (dispatch.state === "TERMINAL" && dispatch.outcome) return this.finalize(queueRecord, dispatch, dispatch.outcome, now);
    const handler = this.handlers.getExact(dispatch.handlerId, queueRecord.plan.pattern);
    if (!handler) {
      const outcome: CentralLiveLifecycleOutcome = {planId: queueRecord.plan.id, handlerId: dispatch.handlerId, state: "REJECTED",
        terminalEvidenceIds: [], recoveryIntentIds: [], orderSubmissionPerformed: false, completedAt: now,
        reasons: ["Exact central LIVE lifecycle handler is not registered."]};
      const terminal = this.journal.complete(dispatch.id, outcome, now);
      return this.finalize(queueRecord, terminal, outcome, now);
    }
    try {
      const outcome = await handler.resume({queueRecord, dispatchId: dispatch.id, idempotencyKey: dispatch.idempotencyKey});
      if (outcome.state === "MONITORING") {
        this.journal.recordProgress(dispatch.id, outcome, Math.max(now, outcome.observedAt));
        this.queue.recordDispatchProgress(queueRecord.id, dispatch.id, outcome.orderSubmissionPerformed,
          Math.max(now, outcome.observedAt));
        return this.result("MONITORING", queueRecord.id, dispatch.id, dispatch.handlerId,
          outcome.orderSubmissionPerformed, outcome.reasons, Math.max(now, outcome.observedAt));
      }
      const terminal = this.journal.complete(dispatch.id, outcome, Math.max(now, outcome.completedAt));
      return this.finalize(queueRecord, terminal, outcome, Math.max(now, outcome.completedAt));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "Central LIVE lifecycle handler resume failed.";
      return this.result("RECONCILIATION_REQUIRED", queueRecord.id, dispatch.id, dispatch.handlerId,
        queueRecord.orderSubmissionPerformed, [reason, "Dispatch remains durably STARTED and must resume with the same idempotency key."], now);
    }
  }

  private finalize(queueRecord: CentralLiveQueueRecord, dispatch: CentralLiveDispatchJournalRecord, outcome: CentralLiveLifecycleOutcome, now: number): CentralLiveExecutionDispatcherRun {
    const queueOutcome = outcome.state === "COMPLETED" ? "COMPLETED" as const : "REJECTED" as const;
    if (queueRecord.state === "DISPATCHING") this.queue.acknowledgeDispatch(queueRecord.id, dispatch.id, queueOutcome, dispatch.id, outcome.orderSubmissionPerformed, now);
    const state = outcome.state === "COMPLETED" ? "COMPLETED" as const : outcome.state === "RECOVERY_REQUIRED" ? "RECOVERY_REQUIRED" as const : "REJECTED" as const;
    return this.result(state, queueRecord.id, dispatch.id, dispatch.handlerId, outcome.orderSubmissionPerformed, outcome.reasons, now);
  }

  private result(state: CentralLiveExecutionDispatcherRun["state"], queueRecordId: string | null, dispatchJournalId: string | null,
    handlerId: string | null, orderSubmissionPerformed: boolean, reasons: readonly string[], now: number): CentralLiveExecutionDispatcherRun {
    return freeze({version: "70.0" as const, generatedAt: now, state, queueRecordId, dispatchJournalId, handlerId,
      orderSubmissionPerformed, reasons: [...reasons]});
  }
}

function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
