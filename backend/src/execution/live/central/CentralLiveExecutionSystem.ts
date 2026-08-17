import type {CentralExecutionPattern, CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {StrategyId} from "../../../strategies/models/StrategyMetadata";
import {centralLiveProductionLifecycleComposition, type CentralLiveProductionLifecycleComposition} from "../production/CentralLiveProductionLifecyclePorts";
import {CentralLiveExecutionAdmissionJournalService} from "./CentralLiveExecutionAdmissionJournalService";
import {CentralLiveExecutionAdmissionService, type CentralLiveAdmissionEvidence,
  type CentralLiveAdmissionConfiguration} from "./CentralLiveExecutionAdmissionService";
import {CentralLiveExecutionDispatcherService} from "./CentralLiveExecutionDispatcherService";
import {CentralLiveExecutionOutcomeJournalService} from "./CentralLiveExecutionOutcomeJournalService";
import {CentralLiveExecutionQueueService} from "./CentralLiveExecutionQueueService";

const CENTRAL_STRATEGIES: readonly StrategyId[] = ["cross-exchange-market-making", "triangular-arbitrage",
  "spot-perpetual-basis-arbitrage", "funding-rate-arbitrage", "perpetual-perpetual-arbitrage",
  "dynamic-market-making", "statistical-arbitrage"];
const CENTRAL_PATTERNS: readonly CentralExecutionPattern[] = ["PASSIVE_MAKER_THEN_HEDGE", "SEQUENTIAL_THREE_LEG",
  "TWO_SIDED_PASSIVE_MAKER", "PARALLEL_TWO_LEG", "PARALLEL_STATISTICAL_PAIR"];

export interface CentralLiveExecutionSystemConfiguration {
  readonly compileTimeGateEnabled?: boolean;
  readonly dispatcherEnabled?: boolean;
  readonly allowedStrategies?: readonly StrategyId[];
  readonly registeredPatterns?: readonly CentralExecutionPattern[];
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumActionAgeMs?: number;
  readonly maximumCapitalPerPlanInr?: number;
  readonly workerId?: string;
  readonly leaseTtlMs?: number;
}
export interface CentralLiveExecutionSystemDependencies {
  readonly admissionJournal: CentralLiveExecutionAdmissionJournalService;
  readonly queue: CentralLiveExecutionQueueService;
  readonly outcomeJournal: CentralLiveExecutionOutcomeJournalService;
  readonly production: CentralLiveProductionLifecycleComposition;
}

/** One explicit admission -> journal -> queue -> dispatcher composition. */
export class CentralLiveExecutionSystem {
  private readonly admission: CentralLiveExecutionAdmissionService;
  private readonly dispatcher: CentralLiveExecutionDispatcherService;
  private readonly admissionJournal: CentralLiveExecutionAdmissionJournalService;
  private readonly queue: CentralLiveExecutionQueueService;
  private readonly outcomeJournal: CentralLiveExecutionOutcomeJournalService;
  private readonly production: CentralLiveProductionLifecycleComposition;
  private readonly compileTimeGateEnabled: boolean;
  private readonly dispatcherEnabled: boolean;

  constructor(configuration: CentralLiveExecutionSystemConfiguration = {}, dependencies?: CentralLiveExecutionSystemDependencies) {
    this.compileTimeGateEnabled = configuration.compileTimeGateEnabled ?? false;
    this.dispatcherEnabled = configuration.dispatcherEnabled ?? false;
    this.production = dependencies?.production ?? centralLiveProductionLifecycleComposition;
    this.admissionJournal = dependencies?.admissionJournal ?? new CentralLiveExecutionAdmissionJournalService();
    this.queue = dependencies?.queue ?? new CentralLiveExecutionQueueService();
    this.outcomeJournal = dependencies?.outcomeJournal ?? new CentralLiveExecutionOutcomeJournalService();
    const admissionConfiguration: CentralLiveAdmissionConfiguration = {
      compileTimeGateEnabled: this.compileTimeGateEnabled,
      allowedStrategies: configuration.allowedStrategies ?? CENTRAL_STRATEGIES,
      registeredPatterns: configuration.registeredPatterns ?? CENTRAL_PATTERNS,
      ...(configuration.maximumEvidenceAgeMs === undefined ? {} : {maximumEvidenceAgeMs: configuration.maximumEvidenceAgeMs}),
      ...(configuration.maximumActionAgeMs === undefined ? {} : {maximumActionAgeMs: configuration.maximumActionAgeMs}),
      ...(configuration.maximumCapitalPerPlanInr === undefined ? {} : {maximumCapitalPerPlanInr: configuration.maximumCapitalPerPlanInr}),
    };
    this.admission = new CentralLiveExecutionAdmissionService(admissionConfiguration);
    this.dispatcher = new CentralLiveExecutionDispatcherService({enabled: this.dispatcherEnabled,
      ...(configuration.workerId === undefined ? {} : {workerId: configuration.workerId}),
      ...(configuration.leaseTtlMs === undefined ? {} : {leaseTtlMs: configuration.leaseTtlMs})},
    this.queue, this.outcomeJournal, this.production.registry);
  }

  inspect(plan: CentralStrategyExecutionPlan, evidence: CentralLiveAdmissionEvidence | null, now = Date.now()) {
    return this.admission.evaluate(plan, evidence, now);
  }

  intake(plan: CentralStrategyExecutionPlan, evidence: CentralLiveAdmissionEvidence | null, now = Date.now()) {
    const admission = this.admission.evaluate(plan, evidence, now);
    const journal = this.admissionJournal.capture(plan, admission, now);
    if (!admission.handoffEligible) return freeze({version: "82.0" as const, generatedAt: now,
      state: "BLOCKED" as const, admission, admissionJournalId: journal.id, queueRecord: null,
      executionStarted: false as const, orderSubmissionPerformed: false as const});
    const queued = this.queue.enqueue(plan, journal, now);
    return freeze({version: "82.0" as const, generatedAt: now, state: queued.duplicate ? "DUPLICATE" as const : "QUEUED" as const,
      admission, admissionJournalId: journal.id, queueRecord: queued.record,
      executionStarted: false as const, orderSubmissionPerformed: false as const});
  }

  async runOnce(now = Date.now()) { return this.dispatcher.runOnce(now); }

  getDiagnostics(now = Date.now()) {
    const production = this.production.getDiagnostics(); const dispatcher = this.dispatcher.getDiagnostics(now);
    return freeze({version: "82.0" as const, generatedAt: now, compileTimeGateEnabled: this.compileTimeGateEnabled,
      dispatcherEnabled: this.dispatcherEnabled, production, admissionJournal: this.admissionJournal.getDiagnostics(now),
      queue: this.queue.getDiagnostics(now), outcomeJournal: this.outcomeJournal.getDiagnostics(now), dispatcher,
      fullyWired: production.fullyWired && production.registeredCentralPatterns === CENTRAL_PATTERNS.length,
      safety: {defaultCompileTimeGateEnabled: false, defaultDispatcherEnabled: false,
        blockedAdmissionJournaledBeforeQueue: true, eligibleAdmissionJournalRequiredBeforeQueue: true,
        dispatchJournalRequiredBeforeHandler: true, stableCrashResumeIdempotency: true,
        productionOrderGatewayDefaultDisabled: production.safety.productionOrderGatewayDefaultDisabled,
        liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const}});
  }
}

function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralLiveExecutionSystem = new CentralLiveExecutionSystem();
