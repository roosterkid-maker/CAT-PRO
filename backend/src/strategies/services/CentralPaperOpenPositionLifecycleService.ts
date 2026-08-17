import type {
  CentralPaperAssetConversionEvidence,
} from "./CentralPaperCapitalValuationService";

import {
  centralPaperCapitalValuationService,
} from "./CentralPaperCapitalValuationService";

import type {
  CentralPaperExitEvaluation,
} from "./CentralPaperExitEvidenceProvider";

import {
  centralPaperExitEvidenceProvider,
} from "./CentralPaperExitEvidenceProvider";

import type {
  CentralPaperPositionAccountingRecord,
} from "./CentralPaperPositionAccountingService";

import {
  centralPaperPositionAccountingService,
} from "./CentralPaperPositionAccountingService";

import type {
  CentralPaperPositionCloseEvidence,
  CentralPaperPositionGroup,
} from "./CentralPaperPositionLedgerService";

import {
  centralPaperPositionLedgerService,
} from "./CentralPaperPositionLedgerService";

import type {
  CentralPaperSimulationJournalRecord,
} from "./CentralPaperSimulationJournalService";

import {
  centralPaperSimulationJournalService,
} from "./CentralPaperSimulationJournalService";

import {
  centralPaperCapitalAllocationService,
} from "./CentralPaperCapitalAllocationService";

export interface CentralPaperOpenPositionLifecycleConfiguration {
  readonly enabled?: boolean;
  readonly pollIntervalMs?: number;
}

export interface CentralPaperPositionLifecyclePort {
  getOpenGroups(): readonly CentralPaperPositionGroup[];
  getClosedGroups(): readonly CentralPaperPositionGroup[];
  getJournal(resultId: string): CentralPaperSimulationJournalRecord | null;
  evaluate(group: CentralPaperPositionGroup, journal: CentralPaperSimulationJournalRecord, now: number): CentralPaperExitEvaluation;
  close(groupId: string, evidence: CentralPaperPositionCloseEvidence, now: number): CentralPaperPositionGroup;
  convert(group: CentralPaperPositionGroup, now: number): CentralPaperAssetConversionEvidence | null;
  getAccounting(groupId: string): CentralPaperPositionAccountingRecord | null;
  book(group: CentralPaperPositionGroup, conversion: CentralPaperAssetConversionEvidence, now: number): CentralPaperPositionAccountingRecord;
  releaseCapital(planId: string, reason: string, now: number): void;
}

interface LifecycleOutcome {
  readonly groupId: string | null;
  readonly state: string;
  readonly reason: string;
}

export class CentralPaperOpenPositionLifecycleService {
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private scans = 0;
  private closed = 0;
  private accounted = 0;
  private reconciled = 0;
  private blocked = 0;
  private capitalReleased = 0;
  private lastRun: ReturnType<CentralPaperOpenPositionLifecycleService["runOnce"]> | null = null;

  constructor(
    configuration: CentralPaperOpenPositionLifecycleConfiguration = {},
    private readonly port: CentralPaperPositionLifecyclePort = new DefaultCentralPaperPositionLifecyclePort(),
  ) {
    this.enabled = configuration.enabled ?? false;
    this.pollIntervalMs = configuration.pollIntervalMs ?? 2_000;
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs < 500 || this.pollIntervalMs > 60_000) {
      throw new Error("Central PAPER position lifecycle poll interval must be 500-60000 ms.");
    }
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => {
      try { this.runOnce(); }
      catch (error: unknown) { console.error("[CentralPaperPositionLifecycle] Scan failed:", error instanceof Error ? error.message : "Unknown lifecycle failure."); }
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  runOnce(now = Date.now()) {
    if (!this.enabled) return this.finish("DISABLED", 0, 0, 0, 0, 0, [{groupId: null, state: "DISABLED", reason: "Central PAPER position lifecycle is disabled."}], now);
    if (this.running) return this.finish("BLOCKED", 0, 0, 0, 0, 0, [{groupId: null, state: "BLOCKED", reason: "Central PAPER position lifecycle is already running."}], now);
    this.running = true;
    this.scans += 1;
    let closed = 0; let accounted = 0; let reconciled = 0; let blocked = 0; let capitalReleased = 0;
    const outcomes: LifecycleOutcome[] = [];
    try {
      for (const group of this.port.getClosedGroups()) {
        const existing = this.port.getAccounting(group.id);
        if (existing?.state === "ACCOUNT_POSTED") {
          this.port.releaseCapital(group.planId, "Closed PAPER position accounting is already posted.", now); capitalReleased += 1; continue;
        }
        try {
          const conversion = this.port.convert(group, now);
          if (!conversion) {
            blocked += 1; outcomes.push({groupId: group.id, state: "CLOSED_UNACCOUNTED", reason: "Fresh INR P&L conversion evidence is unavailable."}); continue;
          }
          this.port.book(group, conversion, now);
          this.port.releaseCapital(group.planId, "Closed PAPER position was reconciled and account-posted.", now); capitalReleased += 1;
          accounted += 1; reconciled += 1;
          outcomes.push({groupId: group.id, state: "RECONCILED_ACCOUNT_POSTED", reason: "Durable closed position was replayed into PAPER account accounting."});
        } catch (error: unknown) {
          blocked += 1; outcomes.push(failure(group.id, "CLOSED_RECONCILIATION_FAILED", error));
        }
      }

      for (const group of this.port.getOpenGroups()) {
        try {
          const journal = this.port.getJournal(group.resultId);
          if (!journal) { blocked += 1; outcomes.push({groupId: group.id, state: "BLOCKED", reason: "Simulation journal lineage is missing."}); continue; }
          const evaluation = this.port.evaluate(group, journal, now);
          if (!evaluation.closeEvidence) {
            if (evaluation.state === "BLOCKED") blocked += 1;
            outcomes.push({groupId: group.id, state: evaluation.state, reason: evaluation.blockers.join("|") || "Strategy exit condition is not met."});
            continue;
          }
          const settled = this.port.close(group.id, evaluation.closeEvidence, now);
          closed += 1;
          if (!settled.realizedPnlAsset || settled.realizedNetPnlQuote === null) {
            blocked += 1; outcomes.push({groupId: group.id, state: "BLOCKED", reason: "Closed group P&L asset evidence is missing."}); continue;
          }
          const conversion = this.port.convert(settled, now);
          if (!conversion) {
            blocked += 1; outcomes.push({groupId: group.id, state: "CLOSED_UNACCOUNTED", reason: "Fresh INR P&L conversion evidence is unavailable; reconciliation will retry."}); continue;
          }
          this.port.book(settled, conversion, now);
          this.port.releaseCapital(group.planId, "PAPER position exit was settled and account-posted.", now); capitalReleased += 1;
          accounted += 1;
          outcomes.push({groupId: group.id, state: "CLOSED_ACCOUNTED", reason: "Strategy exit, fee/funding lineage, INR valuation and account posting completed."});
        } catch (error: unknown) {
          blocked += 1; outcomes.push(failure(group.id, "POSITION_LIFECYCLE_FAILED", error));
        }
      }
      this.closed += closed; this.accounted += accounted; this.reconciled += reconciled; this.blocked += blocked; this.capitalReleased += capitalReleased;
      return this.finish(outcomes.length === 0 ? "NO_DATA" : blocked > 0 ? "PARTIAL" : "COMPLETED", closed, accounted, reconciled, blocked, capitalReleased, outcomes, now);
    } finally { this.running = false; }
  }

  getDiagnostics(now = Date.now()) {
    return freeze({version: "61.0" as const, generatedAt: now, enabled: this.enabled, serviceRunning: this.timer !== null,
      running: this.running, pollIntervalMs: this.pollIntervalMs, scans: this.scans, closed: this.closed, accounted: this.accounted,
      reconciled: this.reconciled, blocked: this.blocked, capitalReleased: this.capitalReleased, lastRun: this.lastRun ? structuredClone(this.lastRun) : null,
      safety: {strategySemanticExitRequired: true, fullDepthRequired: true, explicitCloseFeesRequired: true,
        fundingBoundaryFailClosed: true, closedUnaccountedReconciliation: true, perGroupFaultIsolation: true,
        inrConversionRequiredBeforeAccountPost: true, capitalHeldUntilAccountPost: true, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private finish(state: "DISABLED" | "BLOCKED" | "NO_DATA" | "PARTIAL" | "COMPLETED", closed: number, accounted: number,
    reconciled: number, blocked: number, capitalReleased: number, outcomes: readonly LifecycleOutcome[], now: number) {
    const result = freeze({version: "61.0" as const, generatedAt: now, state, closed, accounted, reconciled, blocked, capitalReleased,
      outcomes: outcomes.map((item) => ({...item})), liveExecutionAllowed: false as const, orderSubmissionAllowed: false as const});
    this.lastRun = result;
    return structuredClone(result);
  }
}

class DefaultCentralPaperPositionLifecyclePort implements CentralPaperPositionLifecyclePort {
  getOpenGroups() { return centralPaperPositionLedgerService.getOpenGroups(); }
  getClosedGroups() { return centralPaperPositionLedgerService.getClosedGroups(); }
  getJournal(resultId: string) { return centralPaperSimulationJournalService.get(resultId); }
  evaluate(group: CentralPaperPositionGroup, journal: CentralPaperSimulationJournalRecord, now: number) {
    return centralPaperExitEvidenceProvider.evaluate(group, journal.simulation.settlementPolicy, now);
  }
  close(groupId: string, evidence: CentralPaperPositionCloseEvidence, now: number) { return centralPaperPositionLedgerService.close(groupId, evidence, now); }
  convert(group: CentralPaperPositionGroup, now: number) {
    if (!group.realizedPnlAsset || group.realizedNetPnlQuote === null) return null;
    return centralPaperCapitalValuationService.convertAssetToInr(group.realizedPnlAsset, Math.abs(group.realizedNetPnlQuote), group.id, now);
  }
  getAccounting(groupId: string) { return centralPaperPositionAccountingService.get(groupId); }
  book(group: CentralPaperPositionGroup, conversion: CentralPaperAssetConversionEvidence, now: number) {
    return centralPaperPositionAccountingService.book(group, conversion, now);
  }
  releaseCapital(planId: string, reason: string, now: number) { centralPaperCapitalAllocationService.releaseByPlanId(planId, reason, now); }
}

function failure(groupId: string, state: string, error: unknown): LifecycleOutcome {
  return {groupId, state, reason: error instanceof Error ? error.message : "Unknown central PAPER lifecycle failure."};
}
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

import {strategyRuntimeOperatorConfiguration} from "../config/StrategyRuntimeOperatorConfiguration";

export const centralPaperOpenPositionLifecycleService = new CentralPaperOpenPositionLifecycleService({
  enabled: strategyRuntimeOperatorConfiguration.centralPaper.enabled,
});
