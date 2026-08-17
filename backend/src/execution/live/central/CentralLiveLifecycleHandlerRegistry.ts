import type {CentralExecutionPattern} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {CentralLiveQueueRecord} from "./CentralLiveExecutionQueueService";

export interface CentralLiveLifecycleOutcome {
  readonly planId: string;
  readonly handlerId: string;
  readonly state: "COMPLETED" | "RECOVERY_REQUIRED" | "REJECTED";
  readonly terminalEvidenceIds: readonly string[];
  readonly recoveryIntentIds: readonly string[];
  readonly orderSubmissionPerformed: boolean;
  readonly completedAt: number;
  readonly reasons: readonly string[];
}

export interface CentralLiveLifecycleProgress {
  readonly planId: string;
  readonly handlerId: string;
  readonly state: "MONITORING";
  readonly evidenceIds: readonly string[];
  readonly orderSubmissionPerformed: boolean;
  readonly observedAt: number;
  readonly reasons: readonly string[];
}

export type CentralLiveLifecycleResumeResult = CentralLiveLifecycleOutcome | CentralLiveLifecycleProgress;

export interface CentralLiveLifecycleResumeInput {
  readonly queueRecord: CentralLiveQueueRecord;
  readonly dispatchId: string;
  readonly idempotencyKey: string;
}

export interface CentralLiveLifecycleHandler {
  readonly id: string;
  readonly pattern: CentralExecutionPattern;
  resume(input: CentralLiveLifecycleResumeInput): Promise<CentralLiveLifecycleResumeResult>;
}

export class CentralLiveLifecycleHandlerRegistry {
  private readonly byId = new Map<string, CentralLiveLifecycleHandler>();
  private readonly idByPattern = new Map<CentralExecutionPattern, string>();

  register(handler: CentralLiveLifecycleHandler): void {
    const id = handler.id.trim();
    if (!id) throw new Error("Central LIVE lifecycle handler ID is required.");
    if (this.byId.has(id)) throw new Error(`Central LIVE lifecycle handler ID is already registered: ${id}`);
    if (this.idByPattern.has(handler.pattern)) throw new Error(`Central LIVE lifecycle pattern already has an owner: ${handler.pattern}`);
    this.byId.set(id, handler);
    this.idByPattern.set(handler.pattern, id);
  }

  getExact(handlerId: string, pattern: CentralExecutionPattern): CentralLiveLifecycleHandler | null {
    const handler = this.byId.get(handlerId.trim()) ?? null;
    return handler?.pattern === pattern && this.idByPattern.get(pattern) === handler.id ? handler : null;
  }

  getDiagnostics() {
    const handlers = [...this.byId.values()].map((item) => ({id: item.id, pattern: item.pattern}));
    return freeze({version: "70.0" as const, registeredHandlers: handlers.length, handlers,
      safety: {oneOwnerPerPattern: true, exactIdAndPatternDispatch: true, implicitFallbackHandlerAllowed: false}});
  }
}

function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }
