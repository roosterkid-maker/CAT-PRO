import {
  derivativeAccountEvidenceService,
} from "../../derivatives/services/DerivativeAccountEvidenceService";

import {
  derivativeFeeEvidenceService,
} from "../../derivatives/services/DerivativeFeeEvidenceService";

import {
  derivativeFundingSettlementEvidenceService,
} from "../../derivatives/services/DerivativeFundingSettlementEvidenceService";

import {
  centralStrategyExecutionAdmissionService,
  centralPaperExecutionQueueService,
  strategyRuntimeOperatorConfiguration,
} from "../bootstrap/StrategyBootstrap";

import {
  centralPaperExecutionWorkerService,
} from "./CentralPaperExecutionWorkerService";

import {
  centralPaperIntakeService,
} from "./CentralPaperIntakeService";

import {
  centralPaperPositionAccountingService,
} from "./CentralPaperPositionAccountingService";

import {
  centralPaperPositionLedgerService,
} from "./CentralPaperPositionLedgerService";

import {
  centralPaperOpenPositionLifecycleService,
} from "./CentralPaperOpenPositionLifecycleService";

import {
  centralPaperSimulationJournalService,
} from "./CentralPaperSimulationJournalService";

import {
  centralPaperCapitalAllocationService,
} from "./CentralPaperCapitalAllocationService";

import {
  centralPaperRecoveryLifecycleService,
} from "../../recovery/services/CentralPaperRecoveryLifecycleService";

const DERIVATIVE_STRATEGIES = new Set([
  "spot-perpetual-basis-arbitrage",
  "funding-rate-arbitrage",
  "perpetual-perpetual-arbitrage",
  "statistical-arbitrage",
]);

export interface CentralPaperLifecyclePort {
  getOperatorConfiguration(): {
    readonly centralPaper: {readonly enabled: boolean; readonly confirmationPresent: boolean; readonly allowedStrategies: readonly string[]};
    readonly blockers: readonly string[];
  };
  getAdmission(now: number): {readonly running: boolean; readonly records: number; readonly canonicalPlansCompiled: number};
  getIntake(now: number): {readonly running: boolean; readonly records: number; readonly states: {readonly blocked: number; readonly queued: number; readonly duplicate: number; readonly failed: number}};
  getQueue(now: number): {readonly records: number; readonly states: {readonly queued: number; readonly leased: number; readonly completed: number; readonly rejected: number; readonly expired: number}};
  getWorker(now: number): {readonly enabled: boolean; readonly serviceRunning: boolean; readonly running: boolean; readonly runs: number; readonly completed: number; readonly recoveryStaged: number; readonly failed: number};
  getJournal(now: number): {readonly records: number; readonly states: {readonly readyForPositionAccounting: number; readonly pendingSharedRecovery: number; readonly sharedRecoveryStaged: number; readonly recoveryStagingFailed: number; readonly recoveryCompleted?: number; readonly positionAccounted: number}};
  getPositions(now: number): {readonly groups: number; readonly openGroups: number; readonly cycleCapturedGroups: number; readonly closedGroups: number; readonly realizedPnlEvidenceStatus: "AVAILABLE" | "NO_DATA"; readonly realizedNetPnlQuote: number | null};
  getAccounting(now: number): {readonly records: number; readonly pending: number; readonly posted: number; readonly totalPostedPnlInr: number};
  getPositionLifecycle(now: number): {readonly enabled: boolean; readonly serviceRunning: boolean; readonly running: boolean; readonly scans: number; readonly closed: number; readonly accounted: number; readonly reconciled: number; readonly blocked: number};
  getCapital(now: number): {readonly records: number; readonly activeAmountInr: number; readonly states: {readonly pendingReserve: number; readonly active: number; readonly pendingRelease: number; readonly released: number; readonly rejected: number}};
  getRecovery(now: number): {readonly enabled: boolean; readonly serviceRunning: boolean; readonly running: boolean; readonly scans: number; readonly completed: number; readonly accounted: number; readonly blocked: number};
  getDerivativeAccount(now: number): {readonly providers: readonly {readonly exchange: string; readonly state: string; readonly configured: boolean; readonly lastError: string | null}[]};
  getDerivativeFees(now: number): {readonly configuredExchanges: number; readonly missingExchanges: readonly string[]};
  getDerivativeFunding(now: number): {readonly summary: {readonly evidence: number; readonly exactExchangeMarkPrices: number; readonly boundedMarkPriceProxies: number; readonly readyProviders: number}; readonly providers: readonly {readonly exchange: string; readonly state: string; readonly lastError: string | null}[]};
}

export class CentralPaperLifecycleReadModelService {
  constructor(private readonly port: CentralPaperLifecyclePort = new DefaultCentralPaperLifecyclePort()) {}

  getSnapshot(now = Date.now()) {
    const operator = this.port.getOperatorConfiguration();
    const admission = this.port.getAdmission(now);
    const intake = this.port.getIntake(now);
    const queue = this.port.getQueue(now);
    const worker = this.port.getWorker(now);
    const journal = this.port.getJournal(now);
    const positions = this.port.getPositions(now);
    const accounting = this.port.getAccounting(now);
    const positionLifecycle = this.port.getPositionLifecycle(now);
    const capital = this.port.getCapital(now);
    const recovery = this.port.getRecovery(now);
    const derivativeAccount = this.port.getDerivativeAccount(now);
    const derivativeFees = this.port.getDerivativeFees(now);
    const derivativeFunding = this.port.getDerivativeFunding(now);
    const derivativeStrategies = operator.centralPaper.allowedStrategies.filter((id) => DERIVATIVE_STRATEGIES.has(id));
    const blockers = [...operator.blockers];

    if (!operator.centralPaper.enabled) blockers.push("CENTRAL_PAPER_OPERATOR_OPT_IN_NOT_PRESENT");
    if (!admission.running) blockers.push("CENTRAL_ADMISSION_SERVICE_NOT_RUNNING");
    if (!intake.running) blockers.push("CENTRAL_PAPER_INTAKE_NOT_RUNNING");
    if (operator.centralPaper.enabled && (!worker.enabled || !worker.serviceRunning)) blockers.push("CENTRAL_PAPER_WORKER_NOT_RUNNING");
    if (intake.states.failed > 0) blockers.push("CENTRAL_PAPER_INTAKE_FAILURES_PRESENT");
    if (journal.states.recoveryStagingFailed > 0) blockers.push("SHARED_RECOVERY_STAGING_FAILURES_PRESENT");
    if (operator.centralPaper.enabled && journal.states.sharedRecoveryStaged > 0 && (!recovery.enabled || !recovery.serviceRunning)) blockers.push("CENTRAL_PAPER_RECOVERY_LIFECYCLE_NOT_RUNNING");
    if (accounting.pending > 0) blockers.push("PAPER_ACCOUNTING_REPLAY_PENDING");
    if (capital.states.pendingReserve + capital.states.pendingRelease > 0) blockers.push("CENTRAL_PAPER_CAPITAL_RECONCILIATION_PENDING");
    if (operator.centralPaper.enabled && positions.openGroups > 0 && (!positionLifecycle.enabled || !positionLifecycle.serviceRunning)) {
      blockers.push("CENTRAL_PAPER_POSITION_LIFECYCLE_NOT_RUNNING");
    }

    if (derivativeStrategies.length > 0) {
      const readyProviders = derivativeAccount.providers.filter((item) => item.state === "READY").length;
      if (readyProviders < 2) blockers.push("AUTHENTICATED_DERIVATIVE_ACCOUNT_EVIDENCE_INCOMPLETE");
      if (derivativeFees.configuredExchanges < 2) blockers.push("EXPLICIT_DERIVATIVE_FEE_EVIDENCE_INCOMPLETE");
    }

    const active = queue.states.queued + queue.states.leased + positions.openGroups +
      journal.states.pendingSharedRecovery + journal.states.sharedRecoveryStaged +
      capital.states.pendingReserve + capital.states.active + capital.states.pendingRelease > 0;
    const state = !operator.centralPaper.enabled
      ? "DISABLED"
      : blockers.length > 0
        ? "BLOCKED"
        : active
          ? "ACTIVE"
          : "OBSERVING";

    return freeze({
      version: "62.0" as const,
      generatedAt: now,
      state,
      evidenceStatus: "AVAILABLE" as const,
      operator: {
        centralPaperEnabled: operator.centralPaper.enabled,
        confirmationPresent: operator.centralPaper.confirmationPresent,
        allowedStrategies: [...operator.centralPaper.allowedStrategies],
      },
      pipeline: {
        admission: {running: admission.running, observed: admission.records, plansCompiled: admission.canonicalPlansCompiled},
        intake: {running: intake.running, ...intake.states, observed: intake.records},
        queue: {...queue.states, records: queue.records},
        worker: {...worker},
        journal: {...journal.states, records: journal.records},
        positions: {...positions},
        positionLifecycle: {...positionLifecycle},
        accounting: {...accounting},
        capital: {...capital.states, records: capital.records, activeAmountInr: capital.activeAmountInr},
        recovery: {...recovery},
      },
      derivativeEvidence: {
        requiredByStrategies: derivativeStrategies,
        authenticatedProvidersReady: derivativeAccount.providers.filter((item) => item.state === "READY").length,
        authenticatedProviders: derivativeAccount.providers.map((item) => ({...item})),
        feeProvidersConfigured: derivativeFees.configuredExchanges,
        missingFeeProviders: [...derivativeFees.missingExchanges],
        settledFundingEvidence: derivativeFunding.summary.evidence,
        exactFundingMarkPrices: derivativeFunding.summary.exactExchangeMarkPrices,
        proxyFundingMarkPrices: derivativeFunding.summary.boundedMarkPriceProxies,
        fundingProvidersReady: derivativeFunding.summary.readyProviders,
        fundingProviders: derivativeFunding.providers.map((item) => ({...item})),
      },
      blockers: Array.from(new Set(blockers)),
      safety: {
        oneCentralAdmission: true,
        oneDurableQueue: true,
        journalBeforeAccounting: true,
        closedUnaccountedReconciliation: true,
        durableCapitalAllocation: true,
        sharedRecoveryOnly: true,
        executablePaperRecovery: true,
        evidenceIsNotProfitClaim: true,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }
}

class DefaultCentralPaperLifecyclePort implements CentralPaperLifecyclePort {
  getOperatorConfiguration() { return strategyRuntimeOperatorConfiguration; }
  getAdmission(now: number) { return centralStrategyExecutionAdmissionService.getDiagnostics(now); }
  getIntake(now: number) { return centralPaperIntakeService.getDiagnostics(now); }
  getQueue(now: number) { return centralPaperExecutionQueueService.getDiagnostics(now); }
  getWorker(now: number) { return centralPaperExecutionWorkerService.getDiagnostics(now); }
  getJournal(now: number) { return centralPaperSimulationJournalService.getDiagnostics(now); }
  getPositions(now: number) { return centralPaperPositionLedgerService.getDiagnostics(now); }
  getPositionLifecycle(now: number) { return centralPaperOpenPositionLifecycleService.getDiagnostics(now); }
  getAccounting(now: number) { return centralPaperPositionAccountingService.getDiagnostics(now); }
  getCapital(now: number) { return centralPaperCapitalAllocationService.getDiagnostics(now); }
  getRecovery(now: number) { return centralPaperRecoveryLifecycleService.getDiagnostics(now); }
  getDerivativeAccount(now: number) { return derivativeAccountEvidenceService.getSnapshot(now); }
  getDerivativeFees(now: number) { return derivativeFeeEvidenceService.getSnapshot(now); }
  getDerivativeFunding(now: number) { return derivativeFundingSettlementEvidenceService.getSnapshot(now); }
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

export const centralPaperLifecycleReadModelService = new CentralPaperLifecycleReadModelService();
