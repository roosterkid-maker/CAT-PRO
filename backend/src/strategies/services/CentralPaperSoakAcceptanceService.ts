import type {
  StrategyId,
} from "../models/StrategyMetadata";

import {
  centralPaperExecutionQueueService,
} from "./CentralPaperExecutionQueueService";

import {
  centralPaperPositionAccountingService,
} from "./CentralPaperPositionAccountingService";

import {
  centralPaperPositionLedgerService,
} from "./CentralPaperPositionLedgerService";

import {
  centralPaperSimulationJournalService,
} from "./CentralPaperSimulationJournalService";

export interface CentralPaperSoakAcceptanceConfiguration {
  readonly minimumClosedCycles: number;
  readonly minimumConsecutivePasses: number;
  readonly maximumRejectedCycles: number;
  readonly maximumRecoveryStagingFailures: number;
}

const DEFAULT_CONFIGURATION: CentralPaperSoakAcceptanceConfiguration = {
  minimumClosedCycles: 20,
  minimumConsecutivePasses: 20,
  maximumRejectedCycles: 0,
  maximumRecoveryStagingFailures: 0,
};

interface QueueEvidence {
  readonly state: string;
  readonly updatedAt: number;
  readonly plan: {readonly strategyId: StrategyId};
}

interface JournalEvidence {
  readonly resultId: string;
  readonly strategyId: StrategyId;
  readonly state: string;
  readonly updatedAt: number;
}

interface PositionEvidence {
  readonly id: string;
  readonly resultId: string;
  readonly strategyId: StrategyId;
  readonly state: string;
  readonly updatedAt: number;
  readonly realizedPnlEvidenceStatus: string;
  readonly realizedNetPnlQuote: number | null;
}

interface AccountingEvidence {
  readonly resultId: string;
  readonly positionGroupId: string;
  readonly state: string;
  readonly appliedAt: number | null;
  readonly capturedAt: number;
  readonly netPnlInr: number;
}

export interface CentralPaperSoakAcceptancePort {
  getQueue(now: number): {readonly recent: readonly QueueEvidence[]};
  getJournal(now: number): {readonly recent: readonly JournalEvidence[]};
  getPositions(now: number): {readonly recent: readonly PositionEvidence[]};
  getAccounting(now: number): {readonly pending: number; readonly recent: readonly AccountingEvidence[]};
}

export class CentralPaperSoakAcceptanceService {
  private readonly configuration: CentralPaperSoakAcceptanceConfiguration;

  constructor(
    private readonly port: CentralPaperSoakAcceptancePort = new DefaultCentralPaperSoakAcceptancePort(),
    configuration: Partial<CentralPaperSoakAcceptanceConfiguration> = {},
  ) {
    this.configuration = {...DEFAULT_CONFIGURATION, ...configuration};
    for (const value of Object.values(this.configuration)) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Central PAPER soak thresholds must be non-negative safe integers.");
    }
    if (this.configuration.minimumClosedCycles === 0 || this.configuration.minimumConsecutivePasses === 0) {
      throw new Error("Central PAPER soak requires positive closed-cycle and streak thresholds.");
    }
  }

  getReport(now = Date.now()) {
    const queue = this.port.getQueue(now).recent;
    const journal = this.port.getJournal(now).recent;
    const positions = this.port.getPositions(now).recent;
    const accounting = this.port.getAccounting(now);
    const strategyIds = Array.from(new Set<StrategyId>([
      "cross-exchange-market-making",
      "triangular-arbitrage",
      "spot-perpetual-basis-arbitrage",
      "funding-rate-arbitrage",
      "perpetual-perpetual-arbitrage",
      "dynamic-market-making",
      "statistical-arbitrage",
    ]));

    const strategies = strategyIds.map((strategyId) => {
      const positionRecords = positions.filter((item) => item.strategyId === strategyId);
      const resultIds = new Set(positionRecords.map((item) => item.resultId));
      const posted = accounting.recent.filter((item) => resultIds.has(item.resultId) && item.state === "ACCOUNT_POSTED");
      const postedByGroup = new Map(posted.map((item) => [item.positionGroupId, item]));
      const closed = positionRecords.filter((item) =>
        item.state === "CLOSED" && item.realizedPnlEvidenceStatus === "AVAILABLE" &&
        item.realizedNetPnlQuote !== null && postedByGroup.has(item.id),
      );
      const rejected = queue.filter((item) => item.plan.strategyId === strategyId && item.state === "REJECTED");
      const recoveryFailures = journal.filter((item) => item.strategyId === strategyId && item.state === "RECOVERY_STAGING_FAILED");
      const terminal = [
        ...closed.map((item) => ({at: postedByGroup.get(item.id)!.appliedAt ?? item.updatedAt, passed: true})),
        ...rejected.map((item) => ({at: item.updatedAt, passed: false})),
        ...recoveryFailures.map((item) => ({at: item.updatedAt, passed: false})),
      ].sort((first, second) => second.at - first.at);
      let consecutivePasses = 0;
      for (const item of terminal) {
        if (!item.passed) break;
        consecutivePasses += 1;
      }
      const realizedNetPnlInr = closed.length > 0
        ? normalize(closed.reduce((sum, item) => sum + (postedByGroup.get(item.id)?.netPnlInr ?? 0), 0))
        : null;
      const blockers: string[] = [];
      if (closed.length < this.configuration.minimumClosedCycles) blockers.push(`CLOSED_PAPER_CYCLES_${closed.length}_OF_${this.configuration.minimumClosedCycles}`);
      if (consecutivePasses < this.configuration.minimumConsecutivePasses) blockers.push(`CONSECUTIVE_PASSES_${consecutivePasses}_OF_${this.configuration.minimumConsecutivePasses}`);
      if (rejected.length > this.configuration.maximumRejectedCycles) blockers.push(`REJECTED_CYCLES_${rejected.length}_ABOVE_${this.configuration.maximumRejectedCycles}`);
      if (recoveryFailures.length > this.configuration.maximumRecoveryStagingFailures) blockers.push(`RECOVERY_STAGING_FAILURES_${recoveryFailures.length}_ABOVE_${this.configuration.maximumRecoveryStagingFailures}`);
      if (accounting.pending > 0) blockers.push("GLOBAL_PAPER_ACCOUNTING_REPLAY_PENDING");
      if (closed.length === 0 || realizedNetPnlInr === null) blockers.push("REALIZED_PAPER_PNL_NO_DATA");
      return freeze({
        strategyId,
        state: blockers.length === 0 ? "SOAK_ACCEPTED" as const : closed.length === 0 ? "NO_DATA" as const : "SOAK_IN_PROGRESS" as const,
        closedCycles: closed.length,
        consecutivePasses,
        rejectedCycles: rejected.length,
        recoveryStagingFailures: recoveryFailures.length,
        realizedPnlEvidenceStatus: closed.length > 0 ? "AVAILABLE" as const : "NO_DATA" as const,
        realizedNetPnlInr,
        blockers,
      });
    });

    return freeze({
      version: "51.0" as const,
      generatedAt: now,
      thresholds: {...this.configuration},
      acceptedStrategies: strategies.filter((item) => item.state === "SOAK_ACCEPTED").length,
      strategies,
      safety: {
        realClosedCyclesOnly: true,
        modeledProfitRejected: true,
        accountingPostRequired: true,
        rejectedCycleResetsStreak: true,
        acceptanceGrantsLiveAuthority: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }
}

class DefaultCentralPaperSoakAcceptancePort implements CentralPaperSoakAcceptancePort {
  getQueue(now: number) { return centralPaperExecutionQueueService.getDiagnostics(now); }
  getJournal(now: number) { return centralPaperSimulationJournalService.getDiagnostics(now); }
  getPositions(now: number) { return centralPaperPositionLedgerService.getDiagnostics(now); }
  getAccounting(now: number) { return centralPaperPositionAccountingService.getDiagnostics(now); }
}

function normalize(value: number): number { return Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperSoakAcceptanceService = new CentralPaperSoakAcceptanceService();
