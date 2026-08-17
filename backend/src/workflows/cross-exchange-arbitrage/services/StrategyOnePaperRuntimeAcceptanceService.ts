import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  paperExecutionJournalService,
} from "../../../trading/services/PaperExecutionJournalService";

import {
  paperTradingService,
} from "../../../trading/services/PaperTradingService";

import {
  paperVenueInventoryLedgerService,
} from "../../../trading/services/PaperVenueInventoryLedgerService";

import type {
  PaperExecutionJournalRecord,
  PaperVenueInventoryCheckpoint,
} from "../../../trading/models/PaperExecutionJournal";

import type {
  PaperTrade,
} from "../../../trading/models/PaperTrade";

import type {
  StrategyOnePaperAcceptanceGate,
  StrategyOnePaperAcceptanceRecord,
  StrategyOnePaperRuntimeAcceptanceReport,
} from "../models/StrategyOnePaperRuntimeAcceptance";

import type {
  UnifiedAutomatedExecutionCycleResult,
} from "../models/UnifiedAutomatedExecution";

import {
  evaluateExecutedPriceCredibility,
} from "../../../trading/analysis/CrossVenuePriceCredibilityService";

const STRATEGY_ID =
  "cross-exchange-arbitrage" as const;

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "paper",
    "strategy-one-runtime-acceptance.jsonl",
  );

export interface StrategyOnePaperRuntimeAcceptanceConfig {
  minimumConsecutivePasses: number;

  maximumRecords: number;
}

export interface StrategyOnePaperRuntimeAcceptanceDependencies {
  journal(
    planId: string,
  ): PaperExecutionJournalRecord | null;

  inventory(
    planId: string,
  ): PaperVenueInventoryCheckpoint | null;

  paperTrade(
    planId: string,
  ): PaperTrade | null;

  accountingTransactionApplied(
    transactionId: string,
  ): boolean;
}

const DEFAULT_CONFIG:
  StrategyOnePaperRuntimeAcceptanceConfig = {
  minimumConsecutivePasses:
    20,

  maximumRecords:
    1_000,
};

const DEFAULT_DEPENDENCIES:
  StrategyOnePaperRuntimeAcceptanceDependencies = {
  journal:
    (
      planId,
    ) =>
      paperExecutionJournalService
        .get(
          planId,
        ),

  inventory:
    (
      planId,
    ) =>
      paperVenueInventoryLedgerService
        .getCheckpoint(
          planId,
        ),

  paperTrade:
    (
      planId,
    ) =>
      paperTradingService
        .getTrade(
          planId,
        ) ??
      null,

  accountingTransactionApplied:
    (
      transactionId,
    ) =>
      tradingAccountService
        .hasAppliedAccountingTransaction(
          transactionId,
        ),
};

/**
 * Reconciles the actual unified Strategy #1 PAPER handoff against durable
 * downstream evidence. It observes completed orchestrator output only and
 * has no execution, order, capital, recovery, or LIVE authority.
 */
export class StrategyOnePaperRuntimeAcceptanceService {
  private readonly store:
    JsonlSnapshotStore<
      StrategyOnePaperAcceptanceRecord
    >;

  private readonly records =
    new Map<
      string,
      StrategyOnePaperAcceptanceRecord
    >();

  private readonly config:
    StrategyOnePaperRuntimeAcceptanceConfig;

  private readonly dependencies:
    StrategyOnePaperRuntimeAcceptanceDependencies;

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,

    config:
      Partial<StrategyOnePaperRuntimeAcceptanceConfig> = {},

    dependencies:
      Partial<StrategyOnePaperRuntimeAcceptanceDependencies> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };

    this.validateConfig();

    this.store =
      new JsonlSnapshotStore<
        StrategyOnePaperAcceptanceRecord
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            StrategyOnePaperAcceptanceRecord =>
            this.isValidRecord(
              value,
            ),
      });

    this.restore();
  }

  capture(
    cycle:
      UnifiedAutomatedExecutionCycleResult,
  ): StrategyOnePaperAcceptanceRecord[] {
    if (
      cycle.mode !==
        "PAPER" ||
      !cycle.paper
    ) {
      return [];
    }

    const captured:
      StrategyOnePaperAcceptanceRecord[] =
      [];

    for (
      const execution
      of cycle.paper.executions
    ) {
      const controller =
        execution.result;

      /*
       * A scheduler/controller NO_CANDIDATE result is an observation, not a
       * PAPER execution attempt. Persisting it as REJECTED_SAFE makes normal
       * route cooldown and generation deduplication reset the acceptance
       * streak between every genuine trade. Only actual controller attempts
       * belong in execution-lifecycle acceptance evidence.
       */
      if (
        controller.status !== "EXECUTED" &&
        controller.status !== "EXECUTION_REJECTED"
      ) {
        continue;
      }

      const result =
        controller.result;

      const planId =
        typeof result?.planId ===
          "string" &&
        result.planId.trim()
          ? result.planId
          : null;

      const attribution =
        controller.candidate
          ?.strategyAttribution ??
        result
          ?.strategyAttribution ??
        null;

      const strategyAttributed =
        attribution
          ?.attributionStatus ===
          "ATTRIBUTED" &&
        attribution.strategyId ===
          STRATEGY_ID &&
        attribution.signalId
          .trim()
          .length >
          0;

      const seed:
        StrategyOnePaperAcceptanceRecord = {
        schemaVersion:
          1,

        recordId:
          `${cycle.paper.id}:${controller.cycleId}:${execution.candidateKey}`,

        capturedAt:
          Date.now(),

        unifiedCycleId:
          cycle.cycleId,

        paperBatchId:
          cycle.paper.id,

        paperBatchNumber:
          cycle.paper.batchNumber,

        controllerCycleId:
          controller.cycleId,

        candidateKey:
          execution.candidateKey,

        candidateGeneration:
          controller.candidate
            ?.candidateGeneration ??
          null,

        planId,

        strategyAttributed,

        unifiedPaperOwned:
          cycle.strategyId ===
            STRATEGY_ID &&
          cycle.ownedCandidates >
            0,

        controllerStatus:
          controller.status,

        controllerDecisionReasons:
          controller.reasons
            .map(
              (
                reason,
              ) =>
                this.sanitizeEvidenceReason(
                  reason,
                ),
            )
            .filter(
              Boolean,
            )
            .slice(
              0,
              12,
            ),

        resultSuccessful:
          result?.successful ===
          true,

        executionCompletedEvidence:
          result?.mode ===
            "PAPER" &&
          result.status ===
            "COMPLETED" &&
          result.successful ===
            true &&
          result
            .strategyAttribution
            .attributionStatus ===
            "ATTRIBUTED" &&
          result
            .strategyAttribution
            .strategyId ===
            STRATEGY_ID,

        status:
          "EVIDENCE_INCOMPLETE",

        recoveryExecuted:
          false,

        gates:
          [],

        reasons:
          [],

        liveExecutionAllowed:
          false,

        liveOrderSubmissionAllowed:
          false,

        exchangeOrdersSubmitted:
          0,
      };

      const evaluated =
        this.evaluate(
          seed,
        );

      const existing =
        this.records.get(
          evaluated.recordId,
        );

      if (
        existing &&
        this.evidenceEquivalent(
          existing,
          evaluated,
        )
      ) {
        captured.push(
          structuredClone(
            existing,
          ),
        );

        continue;
      }

      this.persist(
        evaluated,
      );

      captured.push(
        structuredClone(
          evaluated,
        ),
      );
    }

    return captured;
  }

  reconcile(): number {
    let updated =
      0;

    for (
      const existing
      of [
        ...this.records
          .values(),
      ]
    ) {
      const evaluated =
        this.evaluate(
          existing,
        );

      if (
        this.evidenceEquivalent(
          existing,
          evaluated,
        )
      ) {
        continue;
      }

      this.persist(
        evaluated,
      );

      updated +=
        1;
    }

    return updated;
  }

  getReport():
    StrategyOnePaperRuntimeAcceptanceReport {
    this.reconcile();

    const foundation =
      this.store
        .getDiagnostics();

    const records =
      Array.from(
        this.records.values(),
      )
        .filter(
          (record) =>
            record.controllerStatus === "EXECUTED" ||
            record.controllerStatus === "EXECUTION_REJECTED",
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.capturedAt -
            second.capturedAt,
        );

    let consecutivePasses =
      0;

    let safeRejectionsExcluded =
      0;

    let latestReset:
      StrategyOnePaperAcceptanceRecord | null =
      null;

    const latestSafeRejection =
      [
        ...records,
      ]
        .reverse()
        .find(
          (
            record,
          ) =>
            record.status ===
            "REJECTED_SAFE",
        ) ??
      null;

    for (
      const record
      of [
        ...records,
      ].reverse()
    ) {
      /*
       * A safe pre-execution rejection proves fail-closed isolation, but it
       * does not provide a completed lifecycle result and therefore neither
       * advances nor resets the completed-cycle pass streak. Only incomplete
       * downstream evidence invalidates the streak.
       */
      if (
        record.status ===
          "REJECTED_SAFE" ||
        record.status ===
          "EXCLUDED_UNCREDIBLE"
      ) {
        if (
          record.status ===
          "REJECTED_SAFE"
        ) {
          safeRejectionsExcluded +=
            1;
        }

        continue;
      }

      if (
        record.status !==
        "PASSED"
      ) {
        latestReset =
          record;

        break;
      }

      consecutivePasses +=
        1;
    }

    const readyForPaperSoakReview =
      consecutivePasses >=
        this.config
          .minimumConsecutivePasses &&
      records.every(
        (
          record,
        ) =>
          record.status !==
          "EVIDENCE_INCOMPLETE",
      );

    const blockers:
      string[] = [];

    if (
      records.length ===
      0
    ) {
      blockers.push(
        "No unified Strategy #1 PAPER execution attempt has been captured.",
      );
    }

    const incomplete =
      records.filter(
        (
          record,
        ) =>
          record.status ===
          "EVIDENCE_INCOMPLETE",
      );

    if (
      incomplete.length >
      0
    ) {
      blockers.push(
        `${incomplete.length} PAPER attempt(s) have incomplete downstream evidence.`,
      );
    }

    if (
      consecutivePasses <
      this.config
        .minimumConsecutivePasses
    ) {
      blockers.push(
        `Consecutive reconciled PAPER passes=${consecutivePasses}/${this.config.minimumConsecutivePasses}.`,
      );
    }

    return {
      generatedAt:
        Date.now(),

      strategyId:
        STRATEGY_ID,

      evidenceStatus:
        records.length >
          0
          ? "AVAILABLE"
          : "NO_DATA",

      totalAttempts:
        records.length,

      passed:
        records.filter(
          (
            record,
          ) =>
            record.status ===
            "PASSED",
        ).length,

      rejectedSafe:
        records.filter(
          (
            record,
          ) =>
            record.status ===
            "REJECTED_SAFE",
        ).length,

      credibilityExcluded:
        records.filter(
          (
            record,
          ) =>
            record.status ===
            "EXCLUDED_UNCREDIBLE",
        ).length,

      evidenceIncomplete:
        incomplete.length,

      recoveredPasses:
        records.filter(
          (
            record,
          ) =>
            record.status ===
              "PASSED" &&
            record.recoveryExecuted,
        ).length,

      consecutivePasses,

      minimumConsecutivePasses:
        this.config
          .minimumConsecutivePasses,

      remainingConsecutivePasses:
        Math.max(
          0,
          this.config
            .minimumConsecutivePasses -
          consecutivePasses,
        ),

      streakEvidence: {
        safeRejectionsExcluded,

        latestResetAt:
          latestReset
            ?.capturedAt ??
          null,

        latestResetStatus:
          latestReset
            ?.status ??
          null,

        latestResetCandidateKey:
          latestReset
            ?.candidateKey ??
          null,

        latestResetReasons:
          latestReset
            ? this.getDecisionReasons(
                latestReset,
              )
            : [],

        latestSafeRejectionAt:
          latestSafeRejection
            ?.capturedAt ??
          null,

        latestSafeRejectionCandidateKey:
          latestSafeRejection
            ?.candidateKey ??
          null,

        latestSafeRejectionReasons:
          latestSafeRejection
            ? this.getDecisionReasons(
                latestSafeRejection,
              )
            : [],
      },

      soakStatus:
        readyForPaperSoakReview
          ? "PASSED"
          : records.length >
              0
            ? "COLLECTING"
            : "NOT_STARTED",

      readyForPaperSoakReview,

      persistence: {
        filePath:
          foundation.filePath,

        restored:
          this.restored,

        restoredAt:
          this.restoredAt,

        writes:
          foundation.writes,

        writeFailures:
          foundation.writeFailures,

        malformedRecordsIgnored:
          foundation
            .malformedRecordsIgnored,

        lastError:
          foundation.lastError,
      },

      records:
        records.map(
          (
            record,
          ) =>
            structuredClone(
              record,
            ),
        ),

      blockers,

      liveExecutionAllowed:
        false,

      liveOrderSubmissionAllowed:
        false,
    };
  }

  /**
   * Lightweight control-plane truth for latency-sensitive BOT reads. Full
   * acceptance reports intentionally reconcile and clone every durable
   * record; the personal dashboard needs only the already captured/reconciled
   * counters and must not make the trading event loop pay that cost.
   */
  getSummary(): Pick<
    StrategyOnePaperRuntimeAcceptanceReport,
    | "passed"
    | "rejectedSafe"
    | "evidenceIncomplete"
    | "consecutivePasses"
    | "minimumConsecutivePasses"
    | "soakStatus"
  > {
    let passed = 0;
    let rejectedSafe = 0;
    let evidenceIncomplete = 0;
    let consecutivePasses = 0;

    const records = Array.from(
      this.records.values(),
    ).filter(
      (record) =>
        record.controllerStatus === "EXECUTED" ||
        record.controllerStatus === "EXECUTION_REJECTED",
    ).sort(
      (first, second) =>
        first.capturedAt - second.capturedAt,
    );

    for (const record of records) {
      if (record.status === "PASSED") passed += 1;
      else if (record.status === "REJECTED_SAFE") rejectedSafe += 1;
      else if (record.status === "EVIDENCE_INCOMPLETE") evidenceIncomplete += 1;
    }

    for (let index = records.length - 1; index >= 0; index -= 1) {
      const status = records[index].status;
      if (status === "REJECTED_SAFE" || status === "EXCLUDED_UNCREDIBLE") continue;
      if (status !== "PASSED") break;
      consecutivePasses += 1;
    }

    const minimumConsecutivePasses =
      this.config.minimumConsecutivePasses;
    const soakStatus =
      consecutivePasses >= minimumConsecutivePasses &&
      evidenceIncomplete === 0
        ? "PASSED" as const
        : records.length > 0
          ? "COLLECTING" as const
          : "NOT_STARTED" as const;

    return {
      passed,
      rejectedSafe,
      evidenceIncomplete,
      consecutivePasses,
      minimumConsecutivePasses,
      soakStatus,
    };
  }

  clear(): void {
    this.store.clear();

    this.records.clear();

    this.restored =
      false;

    this.restoredAt =
      null;
  }

  private evaluate(
    seed:
      StrategyOnePaperAcceptanceRecord,
  ): StrategyOnePaperAcceptanceRecord {
    const journal =
      seed.planId
        ? this.dependencies
            .journal(
              seed.planId,
            )
        : null;

    const inventory =
      seed.planId
        ? this.dependencies
            .inventory(
              seed.planId,
            )
        : null;

    const paperTrade =
      seed.planId
        ? this.dependencies
            .paperTrade(
              seed.planId,
            )
        : null;

    const transactionId =
      seed.planId
        ? `paper-settlement:${seed.planId}`
        : null;

    const accountingApplied =
      transactionId
        ? this.dependencies
            .accountingTransactionApplied(
              transactionId,
            )
        : false;

    const completed =
      seed.controllerStatus ===
        "EXECUTED" &&
      seed.resultSuccessful &&
      seed.executionCompletedEvidence;

    const rejected =
      seed.controllerStatus !==
        "EXECUTED" ||
      (
        seed.planId !==
          null &&
        !seed.resultSuccessful
      );

    const journalCorrect =
      completed
        ? journal?.state ===
          "ACCOUNTED"
        : seed.planId ===
            null
          ? true
          : journal?.state ===
            "FAILED_NOT_ACCOUNTED";

    const paperTradeCorrect =
      completed
        ? paperTrade?.status ===
            "closed" &&
          typeof paperTrade
            .actualProfit ===
            "number"
        : paperTrade ===
          null;

    const executedPriceCredibility =
      completed &&
      paperTrade
        ? evaluateExecutedPriceCredibility(
            paperTrade.buyPrice,
            paperTrade.actualSellPrice ??
              paperTrade.sellPrice,
          )
        : null;

    const priceCredible =
      !completed ||
      executedPriceCredibility
        ?.credible ===
        true;

    const inventoryCorrect =
      completed
        ? inventory !==
          null
        : inventory ===
          null;

    const accountingCorrect =
      completed
        ? accountingApplied
        : !accountingApplied;

    const settlementReconciled =
      completed &&
      journal?.lineage
        .settlementStatus ===
        "SETTLED" &&
      journal.lineage
        .finalRecoveryRequired ===
        false;

    const liveIsolated =
      seed.liveExecutionAllowed ===
        false &&
      seed.liveOrderSubmissionAllowed ===
        false &&
      seed.exchangeOrdersSubmitted ===
        0 &&
      (
        !journal ||
        (
          journal.lineage
            .liveOrderSubmissionAllowed ===
            false &&
          journal.lineage
            .exchangeOrdersSubmitted ===
            0
        )
      );

    const gates:
      StrategyOnePaperAcceptanceGate[] = [
      this.gate(
        "STRATEGY_ATTRIBUTED",
        seed.strategyAttributed,
        `Exact Strategy #1 attribution=${String(
          seed.strategyAttributed,
        )}.`,
      ),
      this.gate(
        "UNIFIED_PAPER_OWNERSHIP",
        seed.unifiedPaperOwned,
        `Unified PAPER ownership=${String(
          seed.unifiedPaperOwned,
        )}.`,
      ),
      this.gate(
        "CONTROLLER_EXECUTED",
        seed.controllerStatus ===
          "EXECUTED",
        `Controller status=${seed.controllerStatus}.`,
      ),
      this.gate(
        "EXECUTION_COMPLETED",
        seed.executionCompletedEvidence,
        `Completed attributed PAPER result=${String(
          seed.executionCompletedEvidence,
        )}.`,
      ),
      this.gate(
        "SETTLEMENT_RECONCILED",
        settlementReconciled,
        journal
          ? `Settlement=${journal.lineage.settlementStatus}; recoveryPending=${String(
              journal.lineage
                .finalRecoveryRequired,
            )}.`
          : "Settlement journal evidence is unavailable.",
      ),
      this.gate(
        "JOURNAL_TERMINAL",
        journalCorrect,
        seed.planId
          ? `Journal state=${journal?.state ?? "NO_DATA"}.`
          : "No execution plan was created; no journal entry is expected.",
      ),
      this.gate(
        "PAPER_TRADE_CLOSED",
        paperTradeCorrect,
        completed
          ? `Closed PaperTrade=${String(
              paperTradeCorrect,
            )}.`
          : `Rejected attempt created PaperTrade=${String(
              paperTrade !==
                null,
            )}.`,
      ),
      this.gate(
        "PRICE_CREDIBLE",
        priceCredible,
        completed
          ? `Settled fill price ratio=${executedPriceCredibility?.priceRatio?.toFixed(
              4,
            ) ?? "NO_DATA"}x; maximum=${executedPriceCredibility?.maximumPriceRatio.toFixed(
              4,
            ) ?? "NO_DATA"}x.`
          : "No completed fill requires settled-price credibility evidence.",
      ),
      this.gate(
        "VENUE_INVENTORY_CHECKPOINTED",
        inventoryCorrect,
        completed
          ? `Venue checkpoint=${inventory?.checkpointId ?? "NO_DATA"}.`
          : `Rejected attempt created venue checkpoint=${String(
              inventory !==
                null,
            )}.`,
      ),
      this.gate(
        "ACCOUNTING_TRANSACTION_CORRECT",
        accountingCorrect,
        completed
          ? `Idempotent account transaction applied=${String(
              accountingApplied,
            )}.`
          : `Rejected attempt applied account transaction=${String(
              accountingApplied,
            )}.`,
      ),
      this.gate(
        "LIVE_ISOLATED",
        liveIsolated,
        `LIVE/order isolation=${String(
          liveIsolated,
        )}.`,
      ),
    ];

    const allPassed =
      gates.every(
        (
          gate,
        ) =>
          gate.passed,
      );

    const onlyPriceCredibilityFailed =
      completed &&
      !priceCredible &&
      gates
        .filter(
          (
            gate,
          ) =>
            gate.key !==
            "PRICE_CREDIBLE",
        )
        .every(
          (
            gate,
          ) =>
            gate.passed,
        );

    const rejectionSafetyPassed =
      rejected &&
      journalCorrect &&
      paperTradeCorrect &&
      inventoryCorrect &&
      accountingCorrect &&
      liveIsolated;

    const status:
      StrategyOnePaperAcceptanceRecord["status"] =
      completed &&
      allPassed
        ? "PASSED"
        : onlyPriceCredibilityFailed
          ? "EXCLUDED_UNCREDIBLE"
        : rejectionSafetyPassed
          ? "REJECTED_SAFE"
          : "EVIDENCE_INCOMPLETE";

    return {
      ...seed,

      capturedAt:
        seed.capturedAt,

      status,

      recoveryExecuted:
        journal?.lineage
          .automaticPaperRecoveryExecuted ??
        false,

      gates,

      reasons:
        status ===
          "PASSED"
          ? [
              "Unified Strategy #1 PAPER attempt reconciled through terminal accounting evidence.",
            ]
          : status ===
              "EXCLUDED_UNCREDIBLE"
            ? [
                "Completed PAPER accounting evidence was preserved but excluded from soak because the settled cross-venue price ratio was not credible.",
              ]
            : status ===
                "REJECTED_SAFE"
            ? [
                "PAPER attempt was rejected without trade, inventory, P&L, or LIVE leakage.",
              ]
            : gates
                .filter(
                  (
                    gate,
                  ) =>
                    !gate.passed,
                )
                .map(
                  (
                    gate,
                  ) =>
                    `${gate.key}: ${gate.evidence}`,
                ),
    };
  }

  private gate(
    key:
      StrategyOnePaperAcceptanceGate["key"],

    passed:
      boolean,

    evidence:
      string,
  ): StrategyOnePaperAcceptanceGate {
    return {
      key,
      passed,
      evidence,
    };
  }

  private getDecisionReasons(
    record:
      StrategyOnePaperAcceptanceRecord,
  ): string[] {
    const exact =
      record.controllerDecisionReasons
        ?.map(
          (
            reason,
          ) =>
            this.sanitizeEvidenceReason(
              reason,
            ),
        )
        .filter(
          Boolean,
        ) ??
      [];

    return exact.length >
      0
      ? exact
      : record.reasons.map(
          (
            reason,
          ) =>
            this.sanitizeEvidenceReason(
              reason,
            ),
        );
  }

  private sanitizeEvidenceReason(
    reason:
      string,
  ): string {
    return reason
      .replace(
        /[A-Za-z0-9+/=_-]{24,}/g,
        "[REDACTED]",
      )
      .trim()
      .slice(
        0,
        500,
      );
  }

  private restore(): void {
    const records =
      this.store
        .readAll();

    for (
      const record
      of records
    ) {
      this.records.set(
        record.recordId,
        structuredClone(
          record,
        ),
      );
    }

    if (
      records.length >
      0
    ) {
      this.restored =
        true;

      this.restoredAt =
        Date.now();
    }

    this.trim();
  }

  private persist(
    record:
      StrategyOnePaperAcceptanceRecord,
  ): void {
    this.store.append(
      record,
    );

    this.records.set(
      record.recordId,
      structuredClone(
        record,
      ),
    );

    this.trim();
  }

  private trim(): void {
    while (
      this.records.size >
      this.config
        .maximumRecords
    ) {
      const oldest =
        this.records
          .keys()
          .next()
          .value;

      if (
        typeof oldest !==
        "string"
      ) {
        break;
      }

      this.records.delete(
        oldest,
      );
    }
  }

  private evidenceEquivalent(
    first:
      StrategyOnePaperAcceptanceRecord,

    second:
      StrategyOnePaperAcceptanceRecord,
  ): boolean {
    const omitTimestamp = (
      record:
        StrategyOnePaperAcceptanceRecord,
    ) => ({
      ...record,
      capturedAt:
        0,
    });

    return JSON.stringify(
      omitTimestamp(
        first,
      ),
    ) ===
      JSON.stringify(
        omitTimestamp(
          second,
        ),
      );
  }

  private isValidRecord(
    value:
      unknown,
  ): value is
    StrategyOnePaperAcceptanceRecord {
    return (
      this.isRecord(
        value,
      ) &&
      value.schemaVersion ===
        1 &&
      typeof value.recordId ===
        "string" &&
      typeof value.capturedAt ===
        "number" &&
      Number.isFinite(
        value.capturedAt,
      ) &&
      typeof value.unifiedCycleId ===
        "number" &&
      typeof value.paperBatchId ===
        "string" &&
      typeof value.controllerCycleId ===
        "number" &&
      typeof value.candidateKey ===
        "string" &&
      (
        value.planId ===
          null ||
        typeof value.planId ===
          "string"
      ) &&
      typeof value.strategyAttributed ===
        "boolean" &&
      typeof value.unifiedPaperOwned ===
        "boolean" &&
      typeof value.controllerStatus ===
        "string" &&
      typeof value.resultSuccessful ===
        "boolean" &&
      typeof value.executionCompletedEvidence ===
        "boolean" &&
      [
        "PASSED",
        "REJECTED_SAFE",
        "EXCLUDED_UNCREDIBLE",
        "EVIDENCE_INCOMPLETE",
      ].includes(
        String(
          value.status,
        ),
      ) &&
      typeof value.recoveryExecuted ===
        "boolean" &&
      Array.isArray(
        value.gates,
      ) &&
      Array.isArray(
        value.reasons,
      ) &&
      value.liveExecutionAllowed ===
        false &&
      value.liveOrderSubmissionAllowed ===
        false &&
      value.exchangeOrdersSubmitted ===
        0
    );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<string, unknown> {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }

  private validateConfig(): void {
    if (
      !Number.isSafeInteger(
        this.config
          .minimumConsecutivePasses,
      ) ||
      this.config
        .minimumConsecutivePasses <
        1
    ) {
      throw new Error(
        "minimumConsecutivePasses must be a positive safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        this.config
          .maximumRecords,
      ) ||
      this.config
        .maximumRecords <
        this.config
          .minimumConsecutivePasses
    ) {
      throw new Error(
        "maximumRecords must be a safe integer at least as large as minimumConsecutivePasses.",
      );
    }
  }
}

export const strategyOnePaperRuntimeAcceptanceService =
  new StrategyOnePaperRuntimeAcceptanceService();
