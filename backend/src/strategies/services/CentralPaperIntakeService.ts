import type {CentralPaperPlanEvidence} from "./CentralPaperPlanAdmissionService";
import type {CentralStrategyAdmissionRecord, CentralStrategyAdmissionListener} from "./CentralStrategyExecutionAdmissionService";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import {centralStrategyExecutionAdmissionService} from "../bootstrap/StrategyBootstrap";
import {centralPaperRuntimeEvidenceCollector} from "./CentralPaperRuntimeEvidenceCollector";
import {centralPaperExecutionQueueService} from "./CentralPaperExecutionQueueService";

export interface CentralPaperIntakeAdmissionSource {
  subscribeToAdmissions(listener: CentralStrategyAdmissionListener): () => void;
  evaluatePaperPlan(plan: CentralStrategyExecutionPlan, evidence: CentralPaperPlanEvidence | null, now?: number): ReturnType<typeof centralStrategyExecutionAdmissionService.evaluatePaperPlan>;
}
export interface CentralPaperIntakeCollector {
  collect(plan: CentralStrategyExecutionPlan, now?: number): ReturnType<typeof centralPaperRuntimeEvidenceCollector.collect>;
}
export interface CentralPaperIntakeQueue {
  enqueue(plan: CentralStrategyExecutionPlan, admission: ReturnType<typeof centralStrategyExecutionAdmissionService.evaluatePaperPlan>, now?: number): ReturnType<typeof centralPaperExecutionQueueService.enqueue>;
}

export interface CentralPaperIntakeRecord {
  readonly version: "47.0";
  readonly id: string;
  readonly generatedAt: number;
  readonly admissionRecordId: string;
  readonly planId: string | null;
  readonly strategyId: string;
  readonly state: "IGNORED_STRATEGY_ONE" | "BLOCKED" | "QUEUED" | "DUPLICATE" | "FAILED";
  readonly paperAdmissionId: string | null;
  readonly queueRecordId: string | null;
  readonly blockers: readonly string[];
  readonly executionPerformed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export class CentralPaperIntakeService {
  private unsubscribe: (() => void) | null = null;
  private readonly records: CentralPaperIntakeRecord[] = [];
  constructor(private readonly admission: CentralPaperIntakeAdmissionSource,
    private readonly collector: CentralPaperIntakeCollector = centralPaperRuntimeEvidenceCollector,
    private readonly queue: CentralPaperIntakeQueue = centralPaperExecutionQueueService,
    private readonly maximumRecords = 1_000) {
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords <= 0) throw new Error("Central PAPER intake maximumRecords must be positive.");
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.admission.subscribeToAdmissions((record) => this.observe(record));
  }
  stop(): void { this.unsubscribe?.(); this.unsubscribe = null; }
  isRunning(): boolean { return this.unsubscribe !== null; }

  observe(record: CentralStrategyAdmissionRecord, now = record.generatedAt): CentralPaperIntakeRecord {
    let result: CentralPaperIntakeRecord;
    if (record.decision === "EXISTING_STRATEGY_ONE_ORCHESTRATOR_OWNED") {
      result = this.make(record, "IGNORED_STRATEGY_ONE", null, null, record.blockers, now);
    } else if (record.decision !== "SHADOW_SIGNAL_ADMITTED" || !record.plan) {
      result = this.make(record, "BLOCKED", null, null, record.blockers, now);
    } else {
      try {
        const runtime = this.collector.collect(record.plan, now);
        const paperAdmission = this.admission.evaluatePaperPlan(record.plan, runtime.evidence, now);
        if (paperAdmission.state !== "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE") {
          result = this.make(record, "BLOCKED", paperAdmission.id, null,
            Array.from(new Set([...runtime.blockers, ...paperAdmission.blockers])), now);
        } else {
          const queued = this.queue.enqueue(record.plan, paperAdmission, now);
          result = this.make(record, queued.duplicate ? "DUPLICATE" : "QUEUED", paperAdmission.id, queued.record.id, [], now);
        }
      } catch (error: unknown) {
        result = this.make(record, "FAILED", null, null, [error instanceof Error ? error.message : "Central PAPER intake failed."], now);
      }
    }
    this.records.push(result);
    if (this.records.length > this.maximumRecords) this.records.splice(0, this.records.length - this.maximumRecords);
    return structuredClone(result);
  }

  getDiagnostics(now = Date.now()) {
    const records = [...this.records].reverse();
    const count = (state: CentralPaperIntakeRecord["state"]) => records.filter((item) => item.state === state).length;
    return freeze({version: "47.0" as const, generatedAt: now, running: this.isRunning(), records: records.length,
      states: {ignoredStrategyOne: count("IGNORED_STRATEGY_ONE"), blocked: count("BLOCKED"), queued: count("QUEUED"), duplicate: count("DUPLICATE"), failed: count("FAILED")},
      recent: records.slice(0, 100).map((item) => structuredClone(item)), safety: {singleCentralIntake: true,
        exactAdmissionPlanLineage: true, readOnlyEvidenceBeforeQueue: true, strategyOnePathReused: true,
        executionPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private make(source: CentralStrategyAdmissionRecord, state: CentralPaperIntakeRecord["state"], paperAdmissionId: string | null,
    queueRecordId: string | null, blockers: readonly string[], now: number): CentralPaperIntakeRecord {
    return freeze({version: "47.0", id: `central-paper-intake:${source.id}`, generatedAt: now, admissionRecordId: source.id,
      planId: source.plan?.id ?? null, strategyId: source.strategyId, state, paperAdmissionId, queueRecordId,
      blockers: [...blockers], executionPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false});
  }
}

function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperIntakeService = new CentralPaperIntakeService(centralStrategyExecutionAdmissionService);

