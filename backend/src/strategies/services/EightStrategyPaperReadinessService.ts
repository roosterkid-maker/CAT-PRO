import {
  centralPaperExecutionQueueService,
  centralStrategyExecutionAdmissionService,
  crossExchangeMarketMakingStrategyController,
  strategyReadModelService,
} from "../bootstrap/StrategyBootstrap";

import {
  strategyOnePaperRuntimeAcceptanceService,
} from "../../workflows/cross-exchange-arbitrage/services/StrategyOnePaperRuntimeAcceptanceService";

import {
  ACTUAL_STRATEGY_CATALOG,
  ACTUAL_STRATEGY_IDS,
  getActualStrategy,
  type ActualStrategyId,
} from "../config/ActualStrategyCatalog";

import {
  centralPaperIntakeService,
} from "./CentralPaperIntakeService";

import {
  centralPaperLifecycleReadModelService,
} from "./CentralPaperLifecycleReadModelService";

import {
  centralPaperLifecycleTraceService,
} from "./CentralPaperLifecycleTraceService";

import {
  centralPaperSoakAcceptanceService,
} from "./CentralPaperSoakAcceptanceService";

import {
  derivativeAccountEvidenceService,
} from "../../derivatives/services/DerivativeAccountEvidenceService";

import {
  exchangeBalanceSynchronizationRunner,
} from "../../trading/services/ExchangeBalanceSynchronizationRunner";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

const DERIVATIVE_ONLY_BLOCKERS = new Set([
  "AUTHENTICATED_DERIVATIVE_ACCOUNT_EVIDENCE_INCOMPLETE",
  "EXPLICIT_DERIVATIVE_FEE_EVIDENCE_INCOMPLETE",
]);

const EXPECTED_NON_ACTIONABLE_INTAKE_BLOCKERS = new Set([
  "SIGNAL_ID_ALREADY_OBSERVED",
  "ECONOMIC_ROUTE_ALREADY_OWNED",
]);

export type EightStrategyPaperGateState = "PASSED" | "WAITING" | "BLOCKED" | "NOT_APPLICABLE";
export type EightStrategyPaperOperationalState =
  | "BLOCKED"
  | "READY_FOR_SIGNAL"
  | "READY_FOR_ADMISSION"
  | "PAPER_ACTIVE"
  | "SOAK_IN_PROGRESS"
  | "SOAK_ACCEPTED";
export type EightStrategyPaperClosureOwner =
  | "OPERATOR"
  | "EXCHANGE_CREDENTIALS"
  | "MARKET_EVIDENCE"
  | "STRATEGY_RUNTIME"
  | "CENTRAL_PAPER"
  | "SOAK_EVIDENCE"
  | "NONE";
export type EightStrategyPaperConvergencePriority = "P0" | "P1" | "P2" | "P3";
export type EightStrategyPaperConvergencePhase =
  | "CONTROL_PLANE"
  | "EVIDENCE_PREREQUISITE"
  | "SIGNAL_QUALIFICATION"
  | "PAPER_LIFECYCLE"
  | "SOAK_ACCEPTANCE"
  | "MAINTENANCE";
export type EightStrategyPaperConvergenceState =
  | "ACTION_REQUIRED"
  | "WAITING_FOR_EVIDENCE"
  | "IN_PROGRESS"
  | "COMPLETE";
export type EightStrategyRemediationClass =
  | "CODE_FIXED"
  | "EXTERNAL_ACTION_REQUIRED"
  | "MARKET_WAIT"
  | "PAPER_EVIDENCE_WAIT"
  | "VERIFIED_HEALTHY";

interface StrategyEvidence {
  readonly strategyId: string;
  readonly strategyNumber: number;
  readonly displayName: string;
  readonly running: boolean;
  readonly currentSignals: number;
  readonly totalSignalsObserved: number;
  readonly lastSignalObservedAt: number | null;
  readonly lastError: string | null;
  readonly signalBlockers: readonly string[];
}

interface CentralPaperEvidence {
  readonly state: string;
  readonly operator: {
    readonly centralPaperEnabled: boolean;
    readonly confirmationPresent: boolean;
    readonly allowedStrategies: readonly string[];
  };
  readonly pipeline: {
    readonly admission: {readonly running: boolean; readonly observed: number; readonly plansCompiled: number};
    readonly intake: {readonly running: boolean; readonly observed: number; readonly blocked: number; readonly queued: number; readonly duplicate: number; readonly failed: number};
    readonly queue: {readonly records: number; readonly queued: number; readonly leased: number; readonly completed: number; readonly rejected: number; readonly expired: number};
    readonly worker: {readonly enabled: boolean; readonly serviceRunning: boolean; readonly running: boolean};
    readonly journal: {readonly records: number; readonly recoveryStagingFailed: number};
    readonly positions: {readonly groups: number; readonly openGroups: number; readonly closedGroups: number};
    readonly accounting: {readonly records: number; readonly pending: number; readonly posted: number};
    readonly capital: {readonly pendingReserve: number; readonly pendingRelease: number; readonly active: number};
    readonly recovery: {readonly enabled: boolean; readonly serviceRunning: boolean; readonly running: boolean};
  };
  readonly blockers: readonly string[];
}

interface SoakEvidence {
  readonly strategyId: string;
  readonly state: "SOAK_ACCEPTED" | "SOAK_IN_PROGRESS" | "NO_DATA";
  readonly closedCycles: number;
  readonly consecutivePasses: number;
  readonly rejectedCycles: number;
  readonly recoveryStagingFailures: number;
  readonly realizedPnlEvidenceStatus: "AVAILABLE" | "NO_DATA";
  readonly realizedNetPnlInr: number | null;
  readonly blockers: readonly string[];
}

interface StrategyOneEvidence {
  readonly totalAttempts: number;
  readonly passed: number;
  readonly rejectedSafe?: number;
  readonly consecutivePasses: number;
  readonly minimumConsecutivePasses: number;
  readonly readyForPaperSoakReview: boolean;
  readonly blockers: readonly string[];
  readonly persistence: {readonly writeFailures: number; readonly lastError: string | null};
  readonly streakEvidence?: {
    readonly safeRejectionsExcluded: number;
    readonly latestResetAt: number | null;
    readonly latestResetStatus: string | null;
    readonly latestResetCandidateKey: string | null;
    readonly latestResetReasons: readonly string[];
    readonly latestSafeRejectionAt: number | null;
    readonly latestSafeRejectionCandidateKey: string | null;
    readonly latestSafeRejectionReasons: readonly string[];
  };
}

interface AdmissionEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly decision: string;
  readonly blockers: readonly string[];
  readonly plan: unknown | null;
}

interface IntakeEvidence {
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly planId: string | null;
  readonly state: string;
  readonly blockers: readonly string[];
}

interface QueueEvidence {
  readonly strategyId: string;
  readonly state: string;
  readonly updatedAt: number;
}

export interface EightStrategyPaperReadinessPort {
  getStrategies(now: number): readonly StrategyEvidence[];
  getCentralPaper(now: number): CentralPaperEvidence;
  getCentralSoak(now: number): {readonly thresholds: {readonly minimumClosedCycles: number; readonly minimumConsecutivePasses: number}; readonly strategies: readonly SoakEvidence[]};
  getStrategyOne(): StrategyOneEvidence;
  getAdmissions(now: number): readonly AdmissionEvidence[];
  getIntake(now: number): readonly IntakeEvidence[];
  getQueue(now: number): readonly QueueEvidence[];
  getCentralLifecycleTrace?(now: number): ReturnType<typeof centralPaperLifecycleTraceService.getReport>;
  getXemmInventoryRouting?(now: number): ReturnType<typeof crossExchangeMarketMakingStrategyController.getInventoryFeasibilitySnapshot>;
  getXemmVenueRouting?(): ReturnType<typeof crossExchangeMarketMakingStrategyController.getVenueRoutingSnapshot>;
  getDerivativeAccount?(now: number): ReturnType<typeof derivativeAccountEvidenceService.getSnapshot>;
  getBalanceSynchronization?(): ReturnType<typeof exchangeBalanceSynchronizationRunner.getStatus>;
  getExchangeBalances?(): ReturnType<typeof tradingAccountService.getExchangeBalances>;
  getTradingAccount?(): ReturnType<typeof tradingAccountService.getAccount>;
}

export interface EightStrategyPaperReadinessConfiguration {
  readonly recentEvidenceWindowMs: number;
}

const DEFAULT_CONFIGURATION: EightStrategyPaperReadinessConfiguration = {
  recentEvidenceWindowMs: 60_000,
};

export class EightStrategyPaperReadinessService {
  private readonly configuration: EightStrategyPaperReadinessConfiguration;

  constructor(
    private readonly port: EightStrategyPaperReadinessPort = new DefaultEightStrategyPaperReadinessPort(),
    configuration: Partial<EightStrategyPaperReadinessConfiguration> = {},
  ) {
    this.configuration = {...DEFAULT_CONFIGURATION, ...configuration};
    if (!Number.isSafeInteger(this.configuration.recentEvidenceWindowMs) || this.configuration.recentEvidenceWindowMs <= 0) {
      throw new Error("Eight-strategy PAPER readiness recent-evidence window must be a positive integer.");
    }
  }

  getReport(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Eight-strategy PAPER readiness timestamp must be positive.");
    const registered = this.port.getStrategies(now);
    const central = this.port.getCentralPaper(now);
    const centralSoak = this.port.getCentralSoak(now);
    const strategyOne = this.port.getStrategyOne();
    const admissions = this.port.getAdmissions(now);
    const intake = this.port.getIntake(now);
    const queue = this.port.getQueue(now);
    const lifecycleTrace = this.port.getCentralLifecycleTrace?.(now) ?? null;
    const inventoryRouting = this.port.getXemmInventoryRouting?.(now) ?? null;
    const venueRouting = this.port.getXemmVenueRouting?.() ?? null;

    const strategies = ACTUAL_STRATEGY_IDS.map((strategyId) => this.buildStrategy({
      strategyId, now, registered, central, centralSoak, strategyOne, admissions, intake, queue,
    }));
    const ownerCounts = new Map<EightStrategyPaperClosureOwner, number>();
    for (const strategy of strategies) for (const action of strategy.nextActions) {
      ownerCounts.set(action.owner, (ownerCounts.get(action.owner) ?? 0) + 1);
    }
    const centralStrategies = strategies.filter((item) => item.paperPath === "CENTRAL_MULTI_STRATEGY");
    const convergence = buildEightStrategyPaperConvergence(strategies);
    const acceptanceFlow = buildEightStrategyPaperAcceptanceFlow(strategies);
    const remediation = buildEightStrategyBlockerRemediation({
      now,
      strategies,
      strategyOne,
      derivativeAccount: this.port.getDerivativeAccount?.(now) ?? null,
      balanceSynchronization: this.port.getBalanceSynchronization?.() ?? null,
      exchangeBalances: this.port.getExchangeBalances?.() ?? [],
      tradingAccount: this.port.getTradingAccount?.() ?? null,
    });

    return freeze({
      version: "79.0" as const,
      generatedAt: now,
      mode: "EIGHT_STRATEGY_PAPER_ACCEPTANCE_CONVERGENCE" as const,
      decision: strategies.every((item) => item.operationalState === "SOAK_ACCEPTED")
        ? "ALL_SOAK_ACCEPTED" as const
        : strategies.some((item) => item.operationalState === "BLOCKED")
          ? "ACTION_REQUIRED" as const
          : "COLLECTING_PAPER_EVIDENCE" as const,
      summary: {
        targetStrategies: ACTUAL_STRATEGY_CATALOG.length,
        registered: strategies.filter((item) => item.controller.registered).length,
        running: strategies.filter((item) => item.controller.running).length,
        operationallyUnblocked: strategies.filter((item) => item.operationalState !== "BLOCKED").length,
        blocked: strategies.filter((item) => item.operationalState === "BLOCKED").length,
        readyForSignal: strategies.filter((item) => item.operationalState === "READY_FOR_SIGNAL").length,
        paperActive: strategies.filter((item) => item.operationalState === "PAPER_ACTIVE").length,
        soakInProgress: strategies.filter((item) => item.operationalState === "SOAK_IN_PROGRESS").length,
        soakAccepted: strategies.filter((item) => item.operationalState === "SOAK_ACCEPTED").length,
      },
      centralPipeline: {
        state: central.state,
        operatorEnabled: central.operator.centralPaperEnabled,
        confirmationPresent: central.operator.confirmationPresent,
        allowedStrategies: central.operator.allowedStrategies.length,
        targetCentralStrategies: centralStrategies.length,
        admissionRunning: central.pipeline.admission.running,
        intakeRunning: central.pipeline.intake.running,
        workerReady: central.pipeline.worker.enabled && central.pipeline.worker.serviceRunning,
        activeQueue: central.pipeline.queue.queued + central.pipeline.queue.leased,
        openPositions: central.pipeline.positions.openGroups,
        accountingPending: central.pipeline.accounting.pending,
        capitalReconciliationPending: central.pipeline.capital.pendingReserve + central.pipeline.capital.pendingRelease,
        blockers: [...central.blockers],
      },
      blockerOwnership: [...ownerCounts.entries()].map(([owner, actions]) => ({owner, actions}))
        .sort((first, second) => second.actions - first.actions || first.owner.localeCompare(second.owner)),
      convergence,
      acceptanceFlow,
      remediation,
      inventoryRouting,
      venueRouting,
      lifecycleTrace,
      strategies,
      safety: {
        readOnlyAggregation: true,
        realSignalsOnly: true,
        actualAdmissionIntakeAndQueueEvidenceOnly: true,
        realClosedAccountedCyclesOnly: true,
        blockersNeverAutoClosed: true,
        duplicatedActionsCollapsedOnly: true,
        workstreamsAdvisoryOnly: true,
        priorityNeverGrantsExecution: true,
        operatorConfigurationMutated: false,
        paperExecutionTriggered: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
        orderSubmissionPerformed: false,
      },
    });
  }

  private buildStrategy(context: {
    readonly strategyId: ActualStrategyId;
    readonly now: number;
    readonly registered: readonly StrategyEvidence[];
    readonly central: CentralPaperEvidence;
    readonly centralSoak: {readonly thresholds: {readonly minimumClosedCycles: number; readonly minimumConsecutivePasses: number}; readonly strategies: readonly SoakEvidence[]};
    readonly strategyOne: StrategyOneEvidence;
    readonly admissions: readonly AdmissionEvidence[];
    readonly intake: readonly IntakeEvidence[];
    readonly queue: readonly QueueEvidence[];
  }) {
    const {strategyId, now, central, centralSoak, strategyOne} = context;
    const registration = context.registered.find((item) => item.strategyId === strategyId) ?? null;
    const catalogEntry = getActualStrategy(strategyId);
    if (!catalogEntry) throw new Error(`Unknown CAT PRO strategy: ${strategyId}`);
    const paperPath = catalogEntry.paperPath;
    const strategyAdmissions = context.admissions.filter((item) => item.strategyId === strategyId);
    const strategyIntake = context.intake.filter((item) => item.strategyId === strategyId);
    const admission = newest(strategyAdmissions);
    const latestActionableAdmission = newest(strategyAdmissions.filter((item) => item.plan !== null));
    const latestIntake = newest(strategyIntake);
    const latestActionableIntake = newest(strategyIntake.filter((item) => item.planId !== null));
    const queueRecords = context.queue.filter((item) => item.strategyId === strategyId);
    const latestQueue = newest(queueRecords);
    const admissionCurrent = Boolean(latestActionableAdmission &&
      now - latestActionableAdmission.generatedAt <= this.configuration.recentEvidenceWindowMs);
    const intakeCurrent = Boolean(latestIntake && now - latestIntake.generatedAt <= this.configuration.recentEvidenceWindowMs);
    const actionableIntakeCurrent = Boolean(latestActionableIntake &&
      now - latestActionableIntake.generatedAt <= this.configuration.recentEvidenceWindowMs);
    const actionableIntakeBlockers = latestActionableIntake?.blockers.filter((blocker) =>
      !EXPECTED_NON_ACTIONABLE_INTAKE_BLOCKERS.has(blocker)) ?? [];
    const centralSoakItem = centralSoak.strategies.find((item) => item.strategyId === strategyId) ?? null;
    const soak = strategyId === "cross-exchange-arbitrage"
      ? {state: strategyOne.readyForPaperSoakReview ? "SOAK_ACCEPTED" as const
          : strategyOne.totalAttempts > 0 ? "SOAK_IN_PROGRESS" as const : "NO_DATA" as const,
        closedCycles: strategyOne.passed, consecutivePasses: strategyOne.consecutivePasses,
        minimumClosedCycles: strategyOne.minimumConsecutivePasses,
        minimumConsecutivePasses: strategyOne.minimumConsecutivePasses,
        rejectedCycles: 0, recoveryStagingFailures: 0,
        realizedPnlEvidenceStatus: strategyOne.passed > 0 ? "AVAILABLE" as const : "NO_DATA" as const,
        realizedNetPnlInr: null, blockers: [...strategyOne.blockers]}
      : {state: centralSoakItem?.state ?? "NO_DATA" as const,
        closedCycles: centralSoakItem?.closedCycles ?? 0,
        consecutivePasses: centralSoakItem?.consecutivePasses ?? 0,
        minimumClosedCycles: centralSoak.thresholds.minimumClosedCycles,
        minimumConsecutivePasses: centralSoak.thresholds.minimumConsecutivePasses,
        rejectedCycles: centralSoakItem?.rejectedCycles ?? 0,
        recoveryStagingFailures: centralSoakItem?.recoveryStagingFailures ?? 0,
        realizedPnlEvidenceStatus: centralSoakItem?.realizedPnlEvidenceStatus ?? "NO_DATA" as const,
        realizedNetPnlInr: centralSoakItem?.realizedNetPnlInr ?? null,
        blockers: [...(centralSoakItem?.blockers ?? ["PAPER_SOAK_EVIDENCE_NO_DATA"])]};

    const runtimeBlockers: string[] = [];
    const deferredPrerequisites: string[] = [];
    if (!registration) runtimeBlockers.push("STRATEGY_CONTROLLER_NOT_REGISTERED");
    else if (!registration.running) runtimeBlockers.push("STRATEGY_CONTROLLER_NOT_RUNNING");
    if (registration?.lastError) runtimeBlockers.push(`STRATEGY_RUNTIME_ERROR:${registration.lastError}`);
    if (paperPath === "EXISTING_STRATEGY_ONE") {
      if (strategyOne.persistence.writeFailures > 0 || strategyOne.persistence.lastError) {
        runtimeBlockers.push("STRATEGY_ONE_PAPER_ACCEPTANCE_PERSISTENCE_UNHEALTHY");
      }
    } else {
      if (!central.operator.centralPaperEnabled) runtimeBlockers.push("CENTRAL_PAPER_OPERATOR_OPT_IN_NOT_PRESENT");
      if (!central.operator.confirmationPresent) runtimeBlockers.push("CENTRAL_PAPER_OPERATOR_CONFIRMATION_NOT_PRESENT");
      if (!central.operator.allowedStrategies.includes(strategyId)) runtimeBlockers.push("STRATEGY_NOT_ALLOWED_IN_CENTRAL_PAPER");
      if (!central.pipeline.admission.running) runtimeBlockers.push("CENTRAL_ADMISSION_SERVICE_NOT_RUNNING");
      if (!central.pipeline.intake.running) runtimeBlockers.push("CENTRAL_PAPER_INTAKE_NOT_RUNNING");
      if (central.operator.centralPaperEnabled && (!central.pipeline.worker.enabled || !central.pipeline.worker.serviceRunning)) {
        runtimeBlockers.push("CENTRAL_PAPER_WORKER_NOT_RUNNING");
      }
      runtimeBlockers.push(...central.blockers.filter((blocker) =>
        !DERIVATIVE_ONLY_BLOCKERS.has(blocker)));
      if (catalogEntry.requiresAuthenticatedDerivativeEvidence) {
        deferredPrerequisites.push(...central.blockers.filter((blocker) =>
          DERIVATIVE_ONLY_BLOCKERS.has(blocker)));
      }
      if (actionableIntakeCurrent && (latestActionableIntake?.state === "FAILED" ||
          (latestActionableIntake?.state === "BLOCKED" && actionableIntakeBlockers.length > 0))) {
        runtimeBlockers.push(...(actionableIntakeBlockers.length > 0 ? actionableIntakeBlockers.map((item) => `INTAKE:${item}`)
          : [`CENTRAL_PAPER_INTAKE_${latestActionableIntake.state}`]));
      }
    }
    const uniqueRuntimeBlockers = [...new Set(runtimeBlockers)];

    const controllerGate = gate(!registration || !registration.running ? "BLOCKED" : "PASSED",
      registration ? registration.running ? "Registered controller is observing." : "Registered controller is stopped." : "Controller is not registered.",
      registration ? 1 : 0);
    const signalGate = gate((registration?.currentSignals ?? 0) > 0 ? "PASSED" : "WAITING",
      (registration?.currentSignals ?? 0) > 0 ? `${registration!.currentSignals} current immutable signal(s).`
        : `${registration?.totalSignalsObserved ?? 0} signals observed; waiting for a current qualified signal.`,
      registration?.currentSignals ?? 0);
    const operatorGate = paperPath === "EXISTING_STRATEGY_ONE"
      ? gate("NOT_APPLICABLE", "Strategy #1 retains its existing PAPER orchestrator.", 1)
      : gate(central.operator.centralPaperEnabled && central.operator.confirmationPresent &&
          central.operator.allowedStrategies.includes(strategyId) ? "PASSED" : "BLOCKED",
        central.operator.allowedStrategies.includes(strategyId)
          ? "Central PAPER opt-in and allow-list evidence are present." : "Strategy is absent from the central PAPER allow-list.",
        Number(central.operator.allowedStrategies.includes(strategyId)));
    const admissionGate = paperPath === "EXISTING_STRATEGY_ONE"
      ? gate("NOT_APPLICABLE", "Strategy #1 admission remains owned by its existing orchestrator.", context.admissions.filter((item) => item.strategyId === strategyId).length)
      : gate(!central.pipeline.admission.running ? "BLOCKED"
          : admissionCurrent && latestActionableAdmission?.decision === "SHADOW_SIGNAL_ADMITTED" ? "PASSED" : "WAITING",
        admissionCurrent ? `Latest plan-bearing decision: ${latestActionableAdmission!.decision}.`
          : "No current plan-bearing admission record; waiting for a qualified signal.",
        context.admissions.filter((item) => item.strategyId === strategyId).length);
    const intakeGate = paperPath === "EXISTING_STRATEGY_ONE"
      ? gate(strategyOne.totalAttempts > 0 ? "PASSED" : "WAITING",
        `${strategyOne.totalAttempts} actual Strategy #1 PAPER attempt(s) observed.`, strategyOne.totalAttempts)
      : gate(!central.pipeline.intake.running ? "BLOCKED"
          : actionableIntakeCurrent && (latestActionableIntake?.state === "FAILED" ||
              (latestActionableIntake?.state === "BLOCKED" && actionableIntakeBlockers.length > 0)) ? "BLOCKED"
            : actionableIntakeCurrent ? "PASSED"
              : intakeCurrent ? "PASSED" : "WAITING",
        actionableIntakeCurrent ? `Latest plan-bearing intake: ${latestActionableIntake!.state}.`
          : intakeCurrent ? `Latest intake is non-actionable: ${latestIntake!.state}.`
            : "No current intake record; no PAPER eligibility is inferred.",
        context.intake.filter((item) => item.strategyId === strategyId).length);
    const activeQueue = queueRecords.filter((item) => item.state === "QUEUED" || item.state === "LEASED").length;
    const completedQueue = queueRecords.filter((item) => item.state === "COMPLETED").length;
    const queueGate = paperPath === "EXISTING_STRATEGY_ONE"
      ? gate("NOT_APPLICABLE", "Strategy #1 uses its existing durable PAPER journal.", strategyOne.totalAttempts)
      : gate(activeQueue + completedQueue > 0 ? "PASSED" : "WAITING",
        `${activeQueue} active and ${completedQueue} completed central queue record(s).`, queueRecords.length);
    const soakGate = gate(soak.state === "SOAK_ACCEPTED" ? "PASSED" : soak.state === "SOAK_IN_PROGRESS" ? "WAITING" : "WAITING",
      `${soak.closedCycles}/${soak.minimumClosedCycles} closed cycles; ${soak.consecutivePasses}/${soak.minimumConsecutivePasses} consecutive passes.`,
      soak.closedCycles);

    const operationalState: EightStrategyPaperOperationalState = uniqueRuntimeBlockers.length > 0
      ? "BLOCKED" : soak.state === "SOAK_ACCEPTED"
        ? "SOAK_ACCEPTED" : activeQueue > 0
          ? "PAPER_ACTIVE" : soak.closedCycles > 0 || (paperPath === "EXISTING_STRATEGY_ONE" && strategyOne.totalAttempts > 0)
            ? "SOAK_IN_PROGRESS" : (registration?.currentSignals ?? 0) > 0
              ? "READY_FOR_ADMISSION" : "READY_FOR_SIGNAL";
    const nextActions = this.nextActions(operationalState, uniqueRuntimeBlockers, soak,
      registration?.signalBlockers ?? [], registration?.currentSignals ?? 0);
    const operationalGates = [controllerGate, operatorGate, admissionGate, intakeGate]
      .filter((item) => item.state !== "NOT_APPLICABLE");

    return freeze({
      strategyId,
      strategyNumber: registration?.strategyNumber ?? catalogEntry.strategyNumber,
      displayName: registration?.displayName ?? strategyId,
      paperPath,
      operationalState,
      operationalGatesPassed: operationalGates.filter((item) => item.state === "PASSED").length,
      operationalGatesTotal: operationalGates.length,
      controller: {registered: registration !== null, running: registration?.running ?? false,
        lastError: registration?.lastError ?? null},
      signalEvidence: {current: registration?.currentSignals ?? 0,
        observed: registration?.totalSignalsObserved ?? 0,
        lastObservedAt: registration?.lastSignalObservedAt ?? null,
        topBlockers: [...(registration?.signalBlockers ?? [])]},
      stages: {controller: controllerGate, signal: signalGate, operator: operatorGate,
        admission: admissionGate, runtimeEvidence: intakeGate, queue: queueGate, soak: soakGate},
      lineage: {admissions: context.admissions.filter((item) => item.strategyId === strategyId).length,
        latestAdmissionDecision: admission?.decision ?? null,
        intakeRecords: context.intake.filter((item) => item.strategyId === strategyId).length,
        latestIntakeState: latestIntake?.state ?? null,
        queueRecords: queueRecords.length, activeQueue, completedQueue,
        latestQueueState: latestQueue?.state ?? null},
      soak,
      runtimeBlockers: uniqueRuntimeBlockers,
      deferredPrerequisites: [...new Set(deferredPrerequisites)],
      nextActions,
      paperExecutionTriggeredByRead: false as const,
      liveExecutionAllowed: false as const,
      orderSubmissionAllowed: false as const,
    });
  }

  private nextActions(
    state: EightStrategyPaperOperationalState,
    runtimeBlockers: readonly string[],
    soak: {readonly closedCycles: number; readonly minimumClosedCycles: number; readonly consecutivePasses: number; readonly minimumConsecutivePasses: number},
    signalBlockers: readonly string[],
    currentSignals: number,
  ) {
    const actions = runtimeBlockers.map((blocker) => actionForBlocker(blocker));
    if (actions.length === 0) {
      if (state === "PAPER_ACTIVE") actions.push(action("COMPLETE_ACTIVE_PAPER_LIFECYCLE", "Complete and reconcile the active PAPER lifecycle.", "CENTRAL_PAPER"));
      else if (state === "READY_FOR_ADMISSION") actions.push(action("OBSERVE_CURRENT_SIGNAL_ADMISSION", "Observe the current signal through exact admission and intake lineage.", "CENTRAL_PAPER"));
      else if (state !== "SOAK_ACCEPTED" && currentSignals > 0) actions.push(action("OBSERVE_CURRENT_SIGNAL_PAPER_HANDOFF",
        `Observe ${currentSignals} current qualified signal(s) through the owned PAPER lifecycle.`, "CENTRAL_PAPER"));
      else if (state !== "SOAK_ACCEPTED") actions.push(action("WAIT_FOR_QUALIFIED_SIGNAL", signalBlockers[0]
        ? `Wait for strategy evidence to clear: ${signalBlockers[0]}` : "Wait for a current strategy-qualified market signal.", "MARKET_EVIDENCE"));
      else actions.push(action("MAINTAIN_ACCEPTED_PAPER_SOAK", "Maintain accepted PAPER evidence without granting LIVE authority.", "SOAK_EVIDENCE"));
    }
    const closedRemaining = Math.max(0, soak.minimumClosedCycles - soak.closedCycles);
    const streakRemaining = Math.max(0, soak.minimumConsecutivePasses - soak.consecutivePasses);
    if (closedRemaining > 0) actions.push(action("COLLECT_REAL_CLOSED_PAPER_CYCLES",
      `Collect ${closedRemaining} additional closed, accounting-posted PAPER cycle(s).`, "SOAK_EVIDENCE"));
    if (streakRemaining > 0) actions.push(action("BUILD_CONSECUTIVE_PAPER_PASS_STREAK",
      `Build ${streakRemaining} additional consecutive reconciled PAPER pass(es).`, "SOAK_EVIDENCE"));
    return uniqueActions(actions).slice(0, 5);
  }
}

export interface EightStrategyConvergenceStrategyEvidence {
  readonly strategyId: string;
  readonly strategyNumber: number;
  readonly displayName: string;
  readonly operationalState: EightStrategyPaperOperationalState;
  readonly controller: {readonly running: boolean};
  readonly signalEvidence: {readonly current: number};
  readonly stages: {
    readonly operator: {readonly state: EightStrategyPaperGateState};
  };
  readonly lineage: {readonly queueRecords: number};
  readonly soak: {readonly state: "SOAK_ACCEPTED" | "SOAK_IN_PROGRESS" | "NO_DATA"; readonly closedCycles: number};
  readonly nextActions: readonly {
    readonly code: string;
    readonly detail: string;
    readonly owner: EightStrategyPaperClosureOwner;
    readonly automaticallyPerformed: false;
  }[];
}

interface EightStrategyRemediationStrategyEvidence {
  readonly strategyId: string;
  readonly strategyNumber: number;
  readonly displayName: string;
  readonly operationalState: EightStrategyPaperOperationalState;
  readonly signalEvidence: {
    readonly current: number;
    readonly topBlockers: readonly string[];
  };
  readonly deferredPrerequisites: readonly string[];
}

export function buildEightStrategyBlockerRemediation(input: {
  readonly now: number;
  readonly strategies: readonly EightStrategyRemediationStrategyEvidence[];
  readonly strategyOne: StrategyOneEvidence;
  readonly derivativeAccount: ReturnType<typeof derivativeAccountEvidenceService.getSnapshot> | null;
  readonly balanceSynchronization: ReturnType<typeof exchangeBalanceSynchronizationRunner.getStatus> | null;
  readonly exchangeBalances: ReturnType<typeof tradingAccountService.getExchangeBalances>;
  readonly tradingAccount: ReturnType<typeof tradingAccountService.getAccount> | null;
}) {
  const derivativeProviders =
    input.derivativeAccount
      ?.providers.map(
        (
          provider,
        ) => {
          const evidence =
            input.derivativeAccount
              ?.evidence.find(
                (
                  item,
                ) =>
                  item.exchange ===
                  provider.exchange,
              ) ??
            null;

          const errorCategory =
            derivativeProviderErrorCategory(
              provider.lastError,
              provider.configured,
            );

          const marginState =
            !evidence
              ? "NO_DATA" as const
              : evidence.availableMargin >
                  0
                ? "AVAILABLE" as const
                : "ZERO" as const;

          const resolutionClass:
            EightStrategyRemediationClass =
            provider.state ===
                "READY" &&
              marginState ===
                "AVAILABLE"
              ? "VERIFIED_HEALTHY"
              : "EXTERNAL_ACTION_REQUIRED";

          const summary =
            errorCategory ===
              "API_KEY_IP_OR_PERMISSION_REJECTED"
              ? "Exchange rejected the signed read. Verify API-key validity, IP allow-list and read/futures permissions in the exchange account."
              : errorCategory ===
                  "NOT_CONFIGURED"
                ? "Authenticated read credentials are not configured for this provider."
                : provider.state ===
                    "READY" &&
                  marginState ===
                    "ZERO"
                  ? "Signed account and position reads are healthy, but no available derivative margin is evidenced."
                  : provider.state ===
                      "READY"
                    ? "Signed account and position reads have current positive margin evidence."
                    : "Current authenticated derivative account evidence is unavailable.";

          return {
            exchange:
              provider.exchange,
            configured:
              provider.configured,
            providerState:
              provider.state,
            authenticatedReadVerified:
              evidence
                ?.authenticatedReadVerified ??
              false,
            positionReadVerified:
              evidence
                ?.positionReadVerified ??
              false,
            positionMarkets:
              provider.positionMarkets,
            marginState,
            availableMargin:
              evidence
                ?.availableMargin ??
              null,
            availableMarginUnit:
              evidence
                ?.availableMarginUnit ??
              null,
            errorCategory,
            resolutionClass,
            summary,
            credentialValuesExposed:
              false as const,
          };
        },
      ) ??
    [];

  const spotBalanceProviders =
    input.balanceSynchronization
      ?.lastReport
      ?.results.map(
        (
          result,
        ) => {
          const balances =
            input.exchangeBalances.filter(
              (
                balance,
              ) =>
                balance.exchange ===
                result.exchange,
            );

          const positiveAssets =
            balances.filter(
              (
                balance,
              ) =>
                balance.availableBalance >
                0,
            ).length;

          const errorCategory =
            balanceProviderErrorCategory(
              result.status,
              result.reasons,
              result.synchronizedBalances,
            );

          const resolutionClass:
            EightStrategyRemediationClass =
            result.status ===
                "SYNCHRONIZED" &&
              result.synchronizedBalances >
                0
              ? "VERIFIED_HEALTHY"
              : "EXTERNAL_ACTION_REQUIRED";

          return {
            exchange:
              result.exchange,
            synchronizationState:
              result.status,
            synchronizedBalances:
              result.synchronizedBalances,
            positiveAssets,
            errorCategory,
            resolutionClass,
            summary:
              result.status ===
                "SYNCHRONIZED" &&
              result.synchronizedBalances >
                0
                ? `Authenticated balance synchronization is healthy; ${positiveAssets}/${result.synchronizedBalances} reported asset(s) have positive available balance.`
                : errorCategory ===
                    "API_KEY_IP_OR_PERMISSION_REJECTED"
                  ? "Exchange rejected the signed balance read. Verify API-key validity, IP allow-list and read permissions."
                  : errorCategory ===
                      "ZERO_TRANSFERABLE_BALANCES"
                    ? "Signed balance read succeeded, but the account returned no transferable asset balances."
                    : "Authenticated balance synchronization is unavailable.",
            credentialValuesExposed:
              false as const,
          };
        },
      ) ??
    [];

  const maximumDailyTrades =
    input.tradingAccount
      ?.limits
      .maximumDailyTrades ??
    null;

  const tradesToday =
    input.tradingAccount
      ?.tradesToday ??
    null;

  const dailyRiskExhausted =
    maximumDailyTrades !==
      null &&
    tradesToday !==
      null &&
    tradesToday >=
      maximumDailyTrades;

  const dailyRiskEvidenceAvailable =
    maximumDailyTrades !==
      null &&
    tradesToday !==
      null;

  const safeRejectionsExcluded =
    input.strategyOne
      .streakEvidence
      ?.safeRejectionsExcluded ??
    0;

  const strategyOneResolutionClass:
    EightStrategyRemediationClass =
    input.strategyOne
      .readyForPaperSoakReview
      ? "VERIFIED_HEALTHY"
      : "PAPER_EVIDENCE_WAIT";

  const marketWaits =
    input.strategies
      .filter(
        (
          strategy,
        ) =>
          strategy.signalEvidence.current ===
            0 &&
          strategy.operationalState !==
            "SOAK_ACCEPTED",
      )
      .map(
        (
          strategy,
        ) => ({
          strategyId:
            strategy.strategyId,
          strategyNumber:
            strategy.strategyNumber,
          displayName:
            strategy.displayName,
          resolutionClass:
            "MARKET_WAIT" as const,
          blockers:
            strategy.signalEvidence
              .topBlockers.slice(
                0,
                5,
              ),
          summary:
            "Controller is running; no current strategy-qualified signal is inferred.",
        }),
      );

  const classified = [
    "CODE_FIXED" as const,
    "CODE_FIXED" as const,
    "CODE_FIXED" as const,
    strategyOneResolutionClass,
    !dailyRiskEvidenceAvailable ||
      dailyRiskExhausted
      ? "PAPER_EVIDENCE_WAIT" as const
      : "VERIFIED_HEALTHY" as const,
    ...derivativeProviders.map(
      (
        item,
      ) =>
        item.resolutionClass,
    ),
    ...spotBalanceProviders.map(
      (
        item,
      ) =>
        item.resolutionClass,
    ),
    ...marketWaits.map(
      (
        item,
      ) =>
        item.resolutionClass,
    ),
  ];

  const classes: readonly EightStrategyRemediationClass[] = [
    "CODE_FIXED",
    "EXTERNAL_ACTION_REQUIRED",
    "MARKET_WAIT",
    "PAPER_EVIDENCE_WAIT",
    "VERIFIED_HEALTHY",
  ];

  return freeze({
    generatedAt:
      input.now,
    decision:
      classified.includes(
        "EXTERNAL_ACTION_REQUIRED",
      )
        ? "EXTERNAL_ACTION_REQUIRED" as const
        : classified.includes(
              "PAPER_EVIDENCE_WAIT",
            ) ||
            classified.includes(
              "MARKET_WAIT",
            )
          ? "EVIDENCE_COLLECTION_ACTIVE" as const
          : "CLEAR" as const,
    classificationCounts:
      classes.map(
        (
          resolutionClass,
        ) => ({
          resolutionClass,
          count:
            classified.filter(
              (
                item,
              ) =>
                item ===
                resolutionClass,
            ).length,
        }),
      ),
    correctedCodeDefects: [
      {
        code:
          "SAFE_REJECTION_STREAK_RESET",
        resolutionClass:
          "CODE_FIXED" as const,
        summary:
          "Safe pre-execution rejections no longer erase completed, reconciled Strategy #1 PAPER passes.",
      },
      {
        code:
          "DIVERGENT_DAILY_RISK_LIMIT",
        resolutionClass:
          "CODE_FIXED" as const,
        summary:
          "RiskEngine now consumes the authoritative trading-account daily limits instead of a conflicting hard-coded 50-trade ceiling.",
      },
      {
        code:
          "GLOBAL_DERIVATIVE_PRECONDITION_OVERBLOCK",
        resolutionClass:
          "CODE_FIXED" as const,
        summary:
          "Generic derivative readiness is deferred until a qualified plan identifies exact venue and margin requirements; plan-bearing intake still fails closed.",
      },
    ],
    strategyOneSoak: {
      resolutionClass:
        strategyOneResolutionClass,
      totalPasses:
        input.strategyOne
          .passed,
      consecutiveCompletedPasses:
        input.strategyOne
          .consecutivePasses,
      minimumConsecutivePasses:
        input.strategyOne
          .minimumConsecutivePasses,
      safeRejections:
        input.strategyOne
          .rejectedSafe ??
        0,
      safeRejectionsExcludedFromStreak:
        safeRejectionsExcluded,
      latestIncompleteResetAt:
        input.strategyOne
          .streakEvidence
          ?.latestResetAt ??
        null,
      latestIncompleteResetReasons: [
        ...(input.strategyOne
          .streakEvidence
          ?.latestResetReasons ??
        []),
      ],
      latestSafeRejectionAt:
        input.strategyOne
          .streakEvidence
          ?.latestSafeRejectionAt ??
        null,
      latestSafeRejectionReasons: [
        ...(input.strategyOne
          .streakEvidence
          ?.latestSafeRejectionReasons ??
        []),
      ],
      summary:
        input.strategyOne
          .readyForPaperSoakReview
          ? `${input.strategyOne.consecutivePasses}/${input.strategyOne.minimumConsecutivePasses} completed reconciled passes satisfy Strategy #1 soak acceptance.`
          : `${input.strategyOne.consecutivePasses}/${input.strategyOne.minimumConsecutivePasses} completed reconciled passes are available; collection remains active.`,
    },
    dailyRiskBudget: {
      resolutionClass:
        !dailyRiskEvidenceAvailable ||
          dailyRiskExhausted
          ? "PAPER_EVIDENCE_WAIT" as const
          : "VERIFIED_HEALTHY" as const,
      source:
        "TRADING_ACCOUNT_LIMITS" as const,
      tradesToday,
      maximumDailyTrades,
      remainingTrades:
        maximumDailyTrades ===
            null ||
          tradesToday ===
            null
          ? null
          : Math.max(
              0,
              maximumDailyTrades -
                tradesToday,
            ),
      exhausted:
        dailyRiskExhausted,
      summary:
        maximumDailyTrades ===
            null ||
          tradesToday ===
            null
          ? "Authoritative daily risk budget evidence is unavailable."
          : dailyRiskExhausted
            ? `Daily PAPER activity reached the authoritative account limit (${tradesToday}/${maximumDailyTrades}); wait for the natural daily reset or explicitly review policy.`
            : `Daily PAPER activity is within the authoritative account limit (${tradesToday}/${maximumDailyTrades}).`,
    },
    derivativeProviders,
    spotBalanceProviders,
    deferredDerivativePrerequisites:
      input.strategies
        .filter(
          (
            strategy,
          ) =>
            strategy.deferredPrerequisites.length >
            0,
        )
        .map(
          (
            strategy,
          ) => ({
            strategyId:
              strategy.strategyId,
            strategyNumber:
              strategy.strategyNumber,
            blockers: [
              ...strategy.deferredPrerequisites,
            ],
            activation:
              "QUALIFIED_PLAN_OR_PLAN_BEARING_INTAKE" as const,
          }),
        ),
    marketWaits,
    safety: {
      readOnlyClassification:
        true as const,
      credentialValuesExposed:
        false as const,
      blockersAutoClosed:
        false as const,
      accountPolicyMutated:
        false as const,
      fundsMutated:
        false as const,
      paperExecutionTriggered:
        false as const,
      liveExecutionAllowed:
        false as const,
      orderSubmissionAllowed:
        false as const,
    },
  });
}

function derivativeProviderErrorCategory(
  lastError:
    string | null,
  configured:
    boolean,
): string | null {
  if (!configured) return "NOT_CONFIGURED";
  const normalized = lastError?.toLowerCase() ?? "";
  if (normalized.includes("-2015") || normalized.includes("invalid api-key") || normalized.includes("status=401") || normalized.includes("http 401")) {
    return "API_KEY_IP_OR_PERMISSION_REJECTED";
  }
  if (normalized.includes("timestamp") || normalized.includes("recvwindow")) return "REQUEST_TIME_REJECTED";
  return normalized ? "AUTHENTICATED_READ_FAILED" : null;
}

function balanceProviderErrorCategory(
  state:
    string,
  reasons:
    readonly string[],
  synchronizedBalances:
    number,
): string | null {
  const normalized = reasons.join(" ").toLowerCase();
  if (state === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  if (normalized.includes("-2015") || normalized.includes("invalid api-key") || normalized.includes("status=401") || normalized.includes("http 401")) {
    return "API_KEY_IP_OR_PERMISSION_REJECTED";
  }
  if (state === "SYNCHRONIZED" && synchronizedBalances === 0) return "ZERO_TRANSFERABLE_BALANCES";
  return state === "FAILED" ? "AUTHENTICATED_READ_FAILED" : null;
}

export function buildEightStrategyPaperConvergence(strategies: readonly EightStrategyConvergenceStrategyEvidence[]) {
  const raw = strategies.flatMap((strategy) => strategy.nextActions.map((action, actionIndex) => ({
    strategy,
    action,
    actionIndex,
  })));
  const grouped = new Map<string, typeof raw>();
  for (const item of raw) {
    const key = `${item.action.code}:${item.action.owner}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  const workstreams = [...grouped.values()].map((items) => {
    const first = items[0]!;
    const affected = uniqueBy(items.map(({strategy}) => ({strategyId: strategy.strategyId,
      strategyNumber: strategy.strategyNumber, displayName: strategy.displayName,
      operationalState: strategy.operationalState})), (item) => item.strategyId)
      .sort((left, right) => left.strategyNumber - right.strategyNumber);
    const readyNow = uniqueBy(items.filter((item) => item.actionIndex === 0).map(({strategy}) => strategy.strategyId),
      (item) => item);
    const phase = convergencePhase(first.action.code, first.action.owner);
    const priority = convergencePriority(phase);
    return {
      rank: 0,
      code: first.action.code,
      owner: first.action.owner,
      priority,
      phase,
      state: convergenceState(first.action.code, items.map((item) => item.strategy)),
      affectedStrategies: affected,
      affectedCount: affected.length,
      readyNowStrategies: readyNow.length,
      deferredStrategies: Math.max(0, affected.length - readyNow.length),
      evidenceDetails: uniqueBy(items.map((item) => item.action.detail), (item) => item).slice(0, 8),
      automaticallyPerformed: false as const,
    };
  }).sort((left, right) => priorityOrder(left.priority) - priorityOrder(right.priority) ||
    Number(right.readyNowStrategies > 0) - Number(left.readyNowStrategies > 0) ||
    right.readyNowStrategies - left.readyNowStrategies || right.affectedCount - left.affectedCount ||
    left.code.localeCompare(right.code)).map((item, index) => ({...item, rank: index + 1}));

  return freeze({
    rawActions: raw.length,
    uniqueWorkstreams: workstreams.length,
    duplicatedActionsCollapsed: Math.max(0, raw.length - workstreams.length),
    actionableNow: workstreams.filter((item) => item.readyNowStrategies > 0 && item.state !== "COMPLETE").length,
    deferred: workstreams.filter((item) => item.readyNowStrategies === 0 && item.state !== "COMPLETE").length,
    completed: workstreams.filter((item) => item.state === "COMPLETE").length,
    firstActionableCode: workstreams.find((item) => item.readyNowStrategies > 0 && item.state !== "COMPLETE")?.code ?? null,
    workstreams,
  });
}

export function buildEightStrategyPaperAcceptanceFlow(strategies: readonly EightStrategyConvergenceStrategyEvidence[]) {
  const total = strategies.length;
  const central = strategies.filter((item) => item.strategyNumber !== 1);
  const definitions = [
    {id: "CONTROLLERS", label: "Controllers observing", passed: strategies.filter((item) => item.controller.running).length,
      total, detail: "All registered strategy controllers must be running."},
    {id: "PAPER_CONTROL", label: "PAPER control plane", passed: central.filter((item) => item.stages.operator.state === "PASSED").length,
      total: central.length, detail: "Strategies #2-#8 require explicit operator confirmation and allow-list evidence."},
    {id: "SIGNAL_QUALIFICATION", label: "Current qualified signal", passed: strategies.filter((item) => item.signalEvidence.current > 0).length,
      total, detail: "Only current immutable strategy signals count; market waits are not implementation failures."},
    {id: "PAPER_LIFECYCLE", label: "PAPER lifecycle evidence", passed: strategies.filter((item) =>
      item.lineage.queueRecords > 0 || item.soak.closedCycles > 0).length,
      total, detail: "Actual queue or closed-cycle lineage is required."},
    {id: "SOAK_ACCEPTANCE", label: "Closed-cycle soak accepted", passed: strategies.filter((item) => item.soak.state === "SOAK_ACCEPTED").length,
      total, detail: "Only real closed, accounting-posted and consecutively reconciled cycles count."},
  ] as const;
  const stages = definitions.map((item) => ({...item,
    state: item.passed === item.total ? "PASSED" as const : item.passed > 0 ? "IN_PROGRESS" as const : "WAITING" as const}));
  return freeze({
    completedStages: stages.filter((item) => item.state === "PASSED").length,
    totalStages: stages.length,
    currentStage: stages.find((item) => item.state !== "PASSED")?.id ?? "COMPLETE",
    stages,
  });
}

function convergencePhase(code: string, owner: EightStrategyPaperClosureOwner): EightStrategyPaperConvergencePhase {
  if (code === "MAINTAIN_ACCEPTED_PAPER_SOAK") return "MAINTENANCE";
  if (code === "COLLECT_REAL_CLOSED_PAPER_CYCLES" || code === "BUILD_CONSECUTIVE_PAPER_PASS_STREAK") return "SOAK_ACCEPTANCE";
  if (code === "WAIT_FOR_QUALIFIED_SIGNAL") return "SIGNAL_QUALIFICATION";
  if (code.includes("PAPER_HANDOFF") || code.includes("ADMISSION") || code.includes("ACTIVE_PAPER_LIFECYCLE")) return "PAPER_LIFECYCLE";
  if (owner === "STRATEGY_RUNTIME" || code.includes("OPERATOR_CONFIGURATION") || code.includes("WORKER")) return "CONTROL_PLANE";
  return "EVIDENCE_PREREQUISITE";
}

function convergencePriority(phase: EightStrategyPaperConvergencePhase): EightStrategyPaperConvergencePriority {
  if (phase === "CONTROL_PLANE") return "P0";
  if (phase === "EVIDENCE_PREREQUISITE") return "P1";
  if (phase === "SIGNAL_QUALIFICATION" || phase === "PAPER_LIFECYCLE") return "P2";
  return "P3";
}

function convergenceState(
  code: string,
  strategies: readonly EightStrategyConvergenceStrategyEvidence[],
): EightStrategyPaperConvergenceState {
  if (code === "MAINTAIN_ACCEPTED_PAPER_SOAK") return "COMPLETE";
  if (code === "WAIT_FOR_QUALIFIED_SIGNAL") return "WAITING_FOR_EVIDENCE";
  if (code === "COLLECT_REAL_CLOSED_PAPER_CYCLES" || code === "BUILD_CONSECUTIVE_PAPER_PASS_STREAK") {
    return strategies.some((item) => item.soak.closedCycles > 0) ? "IN_PROGRESS" : "WAITING_FOR_EVIDENCE";
  }
  if (code.includes("OBSERVE_") || code.includes("COMPLETE_ACTIVE")) return "IN_PROGRESS";
  return "ACTION_REQUIRED";
}

function priorityOrder(priority: EightStrategyPaperConvergencePriority): number {
  return {P0: 0, P1: 1, P2: 2, P3: 3}[priority];
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => { const identity = key(value); if (seen.has(identity)) return false;
    seen.add(identity); return true; });
}

class DefaultEightStrategyPaperReadinessPort implements EightStrategyPaperReadinessPort {
  getStrategies(now: number): readonly StrategyEvidence[] {
    return strategyReadModelService.getAll(now).strategies.map((item) => {
      const blockerDiagnostics =
        strategyReadModelService.getBlockerDiagnosticsById(
          item.metadata.id,
          now,
        );
      return {strategyId: item.metadata.id, strategyNumber: item.metadata.strategyNumber,
        displayName: item.metadata.displayName, running: item.runtime.running,
        currentSignals: item.runtime.currentSignalCount, totalSignalsObserved: item.runtime.totalSignalsObserved,
        lastSignalObservedAt: item.runtime.lastSignalObservedAt, lastError: item.runtime.lastError,
        signalBlockers: blockerDiagnostics?.blockers.slice(0, 5).map((blocker) => blocker.code) ?? []};
    });
  }
  getCentralPaper(now: number) { return centralPaperLifecycleReadModelService.getSnapshot(now); }
  getCentralSoak(now: number) { return centralPaperSoakAcceptanceService.getReport(now); }
  getStrategyOne() { return strategyOnePaperRuntimeAcceptanceService.getReport(); }
  getAdmissions(now: number) { return centralStrategyExecutionAdmissionService.getDiagnostics(now).recent; }
  getIntake(now: number) { return centralPaperIntakeService.getDiagnostics(now).recent; }
  getQueue(now: number): readonly QueueEvidence[] {
    return centralPaperExecutionQueueService.getDiagnostics(now).recent.map((item) => ({
      strategyId: item.plan.strategyId, state: item.state, updatedAt: item.updatedAt,
    }));
  }
  getCentralLifecycleTrace(now: number) { return centralPaperLifecycleTraceService.getReport(now); }
  getXemmInventoryRouting(now: number) { return crossExchangeMarketMakingStrategyController.getInventoryFeasibilitySnapshot(now); }
  getXemmVenueRouting() { return crossExchangeMarketMakingStrategyController.getVenueRoutingSnapshot(); }
  getDerivativeAccount(now: number) { return derivativeAccountEvidenceService.getSnapshot(now); }
  getBalanceSynchronization() { return exchangeBalanceSynchronizationRunner.getStatus(); }
  getExchangeBalances() { return tradingAccountService.getExchangeBalances(); }
  getTradingAccount() { return tradingAccountService.getAccount(); }
}

function gate(state: EightStrategyPaperGateState, detail: string, evidenceCount: number) {
  return freeze({state, detail, evidenceCount});
}

function actionForBlocker(blocker: string) {
  if (blocker.includes("AUTHENTICATED_DERIVATIVE")) return action("RESTORE_AUTHENTICATED_DERIVATIVE_READS",
    `Restore current authenticated derivative account evidence: ${blocker}`, "EXCHANGE_CREDENTIALS");
  if (blocker.includes("BALANCE_UNVERIFIED") || blocker.includes("BALANCE_INSUFFICIENT") ||
      blocker.includes("Available exchange balance")) return action("RESTORE_REQUIRED_EXCHANGE_BALANCE_EVIDENCE",
    `Restore fresh, sufficient exchange-asset balance evidence: ${blocker}`, "EXCHANGE_CREDENTIALS");
  if (blocker.includes("Daily trade limit") || blocker.includes("Maximum daily trades")) {
    return action("WAIT_FOR_DAILY_RISK_BUDGET", `Allow the daily risk budget to reset naturally or review its explicit policy: ${blocker}`, "OPERATOR");
  }
  if (blocker.includes("FEE_EVIDENCE")) return action("RESTORE_EXPLICIT_FEE_EVIDENCE",
    `Restore explicit exchange fee evidence: ${blocker}`, "MARKET_EVIDENCE");
  if (blocker.includes("OPERATOR") || blocker.includes("ALLOWED")) return action("REVIEW_CENTRAL_PAPER_OPERATOR_CONFIGURATION",
    `Review explicit central PAPER operator configuration: ${blocker}`, "OPERATOR");
  if (blocker.includes("CONTROLLER") || blocker.includes("STRATEGY_RUNTIME")) return action("RESTORE_STRATEGY_CONTROLLER",
    `Restore the strategy controller and current evidence: ${blocker}`, "STRATEGY_RUNTIME");
  return action("CLOSE_CENTRAL_PAPER_RUNTIME_BLOCKER", `Close with authoritative evidence: ${blocker}`, "CENTRAL_PAPER");
}

function action(code: string, detail: string, owner: EightStrategyPaperClosureOwner) {
  return freeze({code, detail, owner, automaticallyPerformed: false as const});
}

function uniqueActions<T extends {readonly code: string; readonly detail: string; readonly owner: EightStrategyPaperClosureOwner}>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((item) => { const key = `${item.code}:${item.detail}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function newest<T extends {readonly generatedAt?: number; readonly updatedAt?: number}>(values: readonly T[]): T | null {
  return [...values].sort((first, second) => (second.generatedAt ?? second.updatedAt ?? 0) -
    (first.generatedAt ?? first.updatedAt ?? 0))[0] ?? null;
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

export const eightStrategyPaperReadinessService = new EightStrategyPaperReadinessService();
