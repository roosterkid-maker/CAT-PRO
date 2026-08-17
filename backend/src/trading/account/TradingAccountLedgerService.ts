import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import type {
  TradingAccount,
} from "./TradingAccount";

import {
  toPaperAccountingDateKey,
} from "./TradingAccount";

export type TradingAccountLedgerOperation =
  | "UPDATE_ACCOUNT"
  | "RESERVE_CAPITAL"
  | "RELEASE_CAPITAL"
  | "RECORD_PROFIT"
  | "EMERGENCY_STOP_ENABLED"
  | "EMERGENCY_STOP_DISABLED"
  | "RESET_DAILY_METRICS"
  | "RESET_ACCOUNT";

interface TradingAccountLedgerEntry {
  schemaVersion: 1;

  entryId: string;

  timestamp: number;

  operation:
    TradingAccountLedgerOperation;

  transactionId:
    string | null;

  amount:
    number | null;

  before:
    TradingAccount;

  after:
    TradingAccount;
}

export interface TradingAccountLedgerDiagnostics {
  persistenceFilePath: string;

  restored: boolean;

  restoredAt: number | null;

  entries: number;

  appliedTransactions: number;

  latestEntryAt: number | null;

  writes: number;

  writeFailures: number;

  lastError: string | null;

  exchangeBalancesRestored: false;

  foundation: {
    linesRead: number;

    validRecordsRead: number;

    legacyRecordsRead: number;

    malformedRecordsIgnored: number;

    lastSequence: number;
  };
}

export interface TradingAccountCapitalReservationAttempt {
  readonly attemptId: string;

  readonly attemptNumber: number;

  readonly reservedAt: number;

  readonly amount: number;

  readonly accountMode: TradingAccount["mode"];

  readonly releasedAt: number | null;

  readonly capitalReleaseStatus:
    | "RELEASE_CONFIRMED"
    | "STILL_RESERVED";
}

const DEFAULT_LEDGER_FILE =
  resolve(
    process.cwd(),
    "logs",
    "accounting",
    "trading-account-ledger.jsonl",
  );

export class TradingAccountLedgerService {
  private readonly store:
    JsonlSnapshotStore<
      TradingAccountLedgerEntry
    >;

  private readonly entries:
    TradingAccountLedgerEntry[] =
    [];

  private readonly appliedTransactions =
    new Set<string>();

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private latestAccount:
    TradingAccount | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_LEDGER_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<
        TradingAccountLedgerEntry
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            TradingAccountLedgerEntry =>
            this.isValidEntry(
              value,
            ),
      });

    this.restore();
  }

  recordMutation(
    operation:
      TradingAccountLedgerOperation,

    before:
      TradingAccount,

    after:
      TradingAccount,

    options: {
      transactionId?:
        string | null;

      amount?:
        number | null;
    } = {},
  ): void {
    const transactionId =
      options.transactionId
        ?.trim() ||
      null;

    if (
      transactionId &&
      this.appliedTransactions.has(
        transactionId,
      )
    ) {
      throw new Error(
        `Trading account transaction ${transactionId} has already been applied.`,
      );
    }

    const timestamp =
      Date.now();

    const entry:
      TradingAccountLedgerEntry = {
      schemaVersion:
        1,

      entryId:
        `${timestamp}-${Math.random()
          .toString(36)
          .slice(2, 12)}`,

      timestamp,

      operation,

      transactionId,

      amount:
        options.amount ??
        null,

      before:
        structuredClone(
          before,
        ),

      after:
        structuredClone(
          after,
        ),
    };

    /*
     * Persist BEFORE exposing the new account
     * snapshot to TradingAccountService.
     *
     * If append fails, caller keeps the previous
     * in-memory account state.
     */
    this.store.append(
      entry,
    );

    this.absorb(
      entry,
    );
  }

  hasAppliedTransaction(
    transactionId:
      string,
  ): boolean {
    const normalized =
      transactionId.trim();

    return (
      normalized.length >
        0 &&
      this.appliedTransactions.has(
        normalized,
      )
    );
  }

  getRestoredAccount():
    TradingAccount | null {
    if (
      !this.latestAccount
    ) {
      return null;
    }

    const restored =
      structuredClone(
        this.latestAccount,
      );

    /*
     * Daily counters are derived state. Replaying
     * the last snapshot verbatim can carry the
     * previous day's trades and P&L into today's
     * risk limits. Rebuild the counters from only
     * the current local calendar day's deltas while
     * leaving the append-only history untouched.
     */
    const todayKey =
      this.toLocalDateKey(
        Date.now(),
      );

    let todayProfit =
      0;

    let todayLoss =
      0;

    let tradesToday =
      0;

    for (
      const entry
      of this.entries
    ) {
      if (
        this.toLocalDateKey(
          entry.timestamp,
        ) !== todayKey
      ) {
        continue;
      }

      if (
        entry.operation ===
          "RESET_DAILY_METRICS" ||
        entry.operation ===
          "RESET_ACCOUNT"
      ) {
        todayProfit =
          entry.after.todayProfit;

        todayLoss =
          entry.after.todayLoss;

        tradesToday =
          entry.after.tradesToday;

        continue;
      }

      todayProfit +=
        entry.after.todayProfit -
        entry.before.todayProfit;

      todayLoss +=
        entry.after.todayLoss -
        entry.before.todayLoss;

      tradesToday +=
        entry.after.tradesToday -
        entry.before.tradesToday;
    }

    restored.todayProfit =
      Math.max(
        0,
        todayProfit,
      );

    restored.todayLoss =
      Math.max(
        0,
        todayLoss,
      );

    restored.tradesToday =
      Math.max(
        0,
        Math.trunc(
          tradesToday,
        ),
      );

    return restored;
  }

  /**
   * Read-only current-local-day capital reservation ledger.
   *
   * Older account entries do not carry an execution/session id, so releases
   * are paired FIFO by their exact reserved amount. This exposes only facts
   * already present in the append-only ledger and never mutates the account.
   */
  getDailyCapitalReservationAttempts(
    now = Date.now(),
  ): readonly TradingAccountCapitalReservationAttempt[] {
    if (
      !Number.isSafeInteger(now) ||
      now <= 0
    ) {
      throw new Error(
        "Daily capital reservation attempts require a positive safe timestamp.",
      );
    }

    const dateKey =
      this.toLocalDateKey(now);
    const attempts: Array<
      TradingAccountCapitalReservationAttempt & {
        releasedAt: number | null;
        capitalReleaseStatus: "RELEASE_CONFIRMED" | "STILL_RESERVED";
      }
    > = [];
    const unreleasedAttemptIndexesByAmount =
      new Map<
        number,
        {
          indexes: number[];
          cursor: number;
        }
      >();

    for (const entry of this.entries) {
      if (
        this.toLocalDateKey(entry.timestamp) !== dateKey ||
        entry.amount === null ||
        !Number.isFinite(entry.amount) ||
        entry.amount <= 0
      ) {
        continue;
      }

      if (entry.operation === "RESERVE_CAPITAL") {
        attempts.push({
          attemptId: entry.entryId,
          attemptNumber: Math.max(0, Math.trunc(entry.after.tradesToday)),
          reservedAt: entry.timestamp,
          amount: entry.amount,
          accountMode: entry.after.mode,
          releasedAt: null,
          capitalReleaseStatus: "STILL_RESERVED",
        });

        const attemptIndex =
          attempts.length - 1;
        const amountQueue =
          unreleasedAttemptIndexesByAmount.get(
            entry.amount,
          );

        if (amountQueue) {
          amountQueue.indexes.push(
            attemptIndex,
          );
        } else {
          unreleasedAttemptIndexesByAmount.set(
            entry.amount,
            {
              indexes: [attemptIndex],
              cursor: 0,
            },
          );
        }

        continue;
      }

      if (entry.operation !== "RELEASE_CAPITAL") {
        continue;
      }

      const amountQueue =
        unreleasedAttemptIndexesByAmount.get(
          entry.amount,
        );
      let matchingAttemptIndex:
        number | undefined;

      if (amountQueue) {
        while (
          amountQueue.cursor <
          amountQueue.indexes.length
        ) {
          const candidateIndex =
            amountQueue.indexes[
              amountQueue.cursor
            ];
          const candidate =
            attempts[candidateIndex];

          if (candidate.releasedAt !== null) {
            amountQueue.cursor += 1;
            continue;
          }

          if (
            candidate.reservedAt <=
            entry.timestamp
          ) {
            matchingAttemptIndex =
              candidateIndex;
          }

          break;
        }
      }

      /*
       * Historical ledgers can contain sub-nanounit floating-point drift.
       * Preserve the legacy tolerance for that rare case; normal exact
       * amounts use the O(1) FIFO queue above instead of rescanning the
       * complete day's attempt history for every release.
       */
      if (matchingAttemptIndex === undefined) {
        matchingAttemptIndex =
          attempts.findIndex((attempt) =>
            attempt.releasedAt === null &&
            Math.abs(attempt.amount - entry.amount!) <= 1e-9 &&
            attempt.reservedAt <= entry.timestamp);
      }

      const matchingAttempt =
        matchingAttemptIndex >= 0
          ? attempts[matchingAttemptIndex]
          : undefined;

      if (matchingAttempt) {
        matchingAttempt.releasedAt = entry.timestamp;
        matchingAttempt.capitalReleaseStatus = "RELEASE_CONFIRMED";

        if (
          amountQueue &&
          amountQueue.indexes[
            amountQueue.cursor
          ] === matchingAttemptIndex
        ) {
          amountQueue.cursor += 1;
        }
      }
    }

    return attempts.map((attempt) => ({...attempt}));
  }

  /**
   * Replace PAPER accounting history with one clean baseline snapshot.
   * This is only called by the explicit confirmed PAPER-data reset flow.
   */
  replaceHistoryWithAccount(
    account:
      TradingAccount,

    now =
      Date.now(),
  ): void {
    if (
      account.mode !==
        "PAPER" ||
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "Trading-account history reset requires a PAPER account and positive timestamp.",
      );
    }

    const baseline =
      structuredClone(
        account,
      );

    const entry:
      TradingAccountLedgerEntry = {
      schemaVersion:
        1,

      entryId:
        `paper-reset-${now}`,

      timestamp:
        now,

      operation:
        "RESET_ACCOUNT",

      transactionId:
        null,

      amount:
        null,

      before:
        structuredClone(
          baseline,
        ),

      after:
        structuredClone(
          baseline,
        ),
    };

    this.store.replaceAll([
      entry,
    ]);

    this.entries.splice(
      0,
      this.entries.length,
    );

    this.appliedTransactions
      .clear();

    this.latestAccount =
      null;

    this.absorb(
      entry,
    );

    this.restored =
      false;

    this.restoredAt =
      null;
  }

  private toLocalDateKey(
    timestamp:
      number,
  ): string {
    return toPaperAccountingDateKey(
      timestamp,
    );
  }

  getDiagnostics():
    TradingAccountLedgerDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    return {
      persistenceFilePath:
        foundation.filePath,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      entries:
        this.entries.length,

      appliedTransactions:
        this.appliedTransactions
          .size,

      latestEntryAt:
        this.entries[
          this.entries.length -
          1
        ]?.timestamp ??
        null,

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      lastError:
        foundation.lastError,

      /*
       * Exchange balances are intentionally not
       * restored because exchange truth must be
       * synchronized freshly after restart.
       */
      exchangeBalancesRestored:
        false,

      foundation: {
        linesRead:
          foundation.linesRead,

        validRecordsRead:
          foundation.validRecordsRead,

        legacyRecordsRead:
          foundation.legacyRecordsRead,

        malformedRecordsIgnored:
          foundation
            .malformedRecordsIgnored,

        lastSequence:
          foundation.lastSequence,
      },
    };
  }

  private restore():
    void {
    const entries =
      this.store
        .readAll()
        .sort(
          (
            first,
            second,
          ) =>
            first.timestamp -
            second.timestamp,
        );

    for (
      const entry
      of entries
    ) {
      this.absorb(
        entry,
      );
    }

    if (
      entries.length >
      0
    ) {
      this.restored =
        true;

      this.restoredAt =
        Date.now();
    }
  }

  private absorb(
    entry:
      TradingAccountLedgerEntry,
  ): void {
    /*
     * If historical data somehow contains the
     * same deterministic transaction more than
     * once, never reconstruct account state from
     * it twice.
     */
    if (
      entry.transactionId &&
      this.appliedTransactions.has(
        entry.transactionId,
      )
    ) {
      return;
    }

    this.entries.push(
      structuredClone(
        entry,
      ),
    );

    if (
      entry.transactionId
    ) {
      this.appliedTransactions.add(
        entry.transactionId,
      );
    }

    this.latestAccount =
      structuredClone(
        entry.after,
      );
  }

  private isValidEntry(
    value:
      unknown,
  ): value is
    TradingAccountLedgerEntry {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      typeof value.entryId !==
        "string" ||
      typeof value.timestamp !==
        "number" ||
      !Number.isFinite(
        value.timestamp,
      ) ||
      typeof value.operation !==
        "string" ||
      !this.isTradingAccount(
        value.before,
      ) ||
      !this.isTradingAccount(
        value.after,
      )
    ) {
      return false;
    }

    const allowedOperations:
      TradingAccountLedgerOperation[] = [
        "UPDATE_ACCOUNT",
        "RESERVE_CAPITAL",
        "RELEASE_CAPITAL",
        "RECORD_PROFIT",
        "EMERGENCY_STOP_ENABLED",
        "EMERGENCY_STOP_DISABLED",
        "RESET_DAILY_METRICS",
        "RESET_ACCOUNT",
      ];

    if (
      !allowedOperations.includes(
        value.operation as
          TradingAccountLedgerOperation,
      )
    ) {
      return false;
    }

    if (
      value.transactionId !==
        null &&
      typeof value.transactionId !==
        "string"
    ) {
      return false;
    }

    if (
      value.amount !==
        null &&
      (
        typeof value.amount !==
          "number" ||
        !Number.isFinite(
          value.amount,
        )
      )
    ) {
      return false;
    }

    return true;
  }

  /*
   * IMPORTANT FIX:
   *
   * Parameter is unknown, not
   * Record<string, unknown>.
   *
   * This makes TradingAccount a valid type
   * predicate target and fixes TS2677.
   */
  private isTradingAccount(
    value:
      unknown,
  ): value is
    TradingAccount {
    if (
      !this.isRecord(
        value,
      )
    ) {
      return false;
    }

    return (
      typeof value.id ===
        "string" &&
      typeof value.name ===
        "string" &&
      (
        value.mode ===
          "PAPER" ||
        value.mode ===
          "LIVE"
      ) &&
      typeof value.enabled ===
        "boolean" &&
      typeof value.emergencyStop ===
        "boolean" &&
      this.isRecord(
        value.limits,
      ) &&
      typeof value.initialCapital ===
        "number" &&
      Number.isFinite(
        value.initialCapital,
      ) &&
      typeof value.currentCapital ===
        "number" &&
      Number.isFinite(
        value.currentCapital,
      ) &&
      typeof value.availableCapital ===
        "number" &&
      Number.isFinite(
        value.availableCapital,
      ) &&
      typeof value.todayProfit ===
        "number" &&
      Number.isFinite(
        value.todayProfit,
      ) &&
      typeof value.todayLoss ===
        "number" &&
      Number.isFinite(
        value.todayLoss,
      ) &&
      typeof value.openTrades ===
        "number" &&
      Number.isFinite(
        value.openTrades,
      ) &&
      typeof value.tradesToday ===
        "number" &&
      Number.isFinite(
        value.tradesToday,
      )
    );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<
      string,
      unknown
    > {
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
}

export const tradingAccountLedgerService =
  new TradingAccountLedgerService();
