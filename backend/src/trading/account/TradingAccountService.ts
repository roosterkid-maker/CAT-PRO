import {
  MAXIMUM_DAILY_PAPER_ATTEMPT_LIMIT,
  defaultTradingAccount,
  toPaperAccountingDateKey,
  type TradingAccount,
} from "./TradingAccount";

import {
  tradingAccountLedgerService,
  type TradingAccountLedgerOperation,
} from "./TradingAccountLedgerService";

export interface TradingAccountCheckResult {
  approved: boolean;

  reasons: string[];
}

export interface ExchangeBalanceSnapshot {
  exchange: string;

  asset: string;

  availableBalance: number;

  lockedBalance: number;

  totalBalance: number;

  synchronizedAt: number;
}

export interface ExchangeBalanceCheckRequest {
  exchange: string;

  asset: string;

  requiredAmount: number;

  maximumAgeMs?: number;
}

export interface ExchangeBalanceCheckResult {
  approved: boolean;

  exchange: string;

  asset: string;

  requiredAmount: number;

  availableAmount: number;

  snapshotAgeMs: number | null;

  reasons: string[];
}

const DEFAULT_MAXIMUM_BALANCE_AGE_MS =
  15_000;

export class TradingAccountService {
  /*
   * VERSION 18 BUILD 7
   *
   * Restore trading-account state from the
   * append-only ledger when available.
   *
   * Exchange balance snapshots are NOT
   * restored because they must be fresh.
   */
  private account:
    TradingAccount;

  private dailyMetricsDateKey =
    this.toLocalDateKey(
      Date.now(),
    );

  private readonly exchangeBalances =
    new Map<
      string,
      ExchangeBalanceSnapshot
    >();

  /*
   * Settlement accounting is synchronous in
   * the current architecture.
   *
   * The persistent settlement wrapper can
   * provide a deterministic transaction ID
   * around the existing settlement engine.
   */
  private activeAccountingTransactionId:
    string | null =
    null;

  constructor(
    private readonly ledger =
      tradingAccountLedgerService,
  ) {
    this.account =
      this.normalizeAccount(
        this.ledger
          .getRestoredAccount() ??
        defaultTradingAccount,
        0,
      );
  }

  getAccount():
    TradingAccount {
    this.ensureCurrentDailyMetrics();

    return structuredClone(
      this.account,
    );
  }

  updateAccount(
    account:
      TradingAccount,
  ): void {
    this.commitAccountMutation(
      "UPDATE_ACCOUNT",

      this.normalizeAccount(
        account,
        this.account
          .paperTdsReceivable ??
          0,
      ),
    );
  }

  evaluateTrade(
    requestedCapital:
      number,
  ): TradingAccountCheckResult {
    this.ensureCurrentDailyMetrics();

    const reasons:
      string[] = [];

    if (
      !Number.isFinite(
        requestedCapital,
      ) ||
      requestedCapital <=
        0
    ) {
      reasons.push(
        "Requested capital must be a positive number.",
      );
    }

    if (
      !this.account.enabled
    ) {
      reasons.push(
        "Trading account is disabled.",
      );
    }

    if (
      this.account
        .emergencyStop
    ) {
      reasons.push(
        "Emergency stop is active.",
      );
    }

    if (
      requestedCapital >
      this.account
        .availableCapital
    ) {
      reasons.push(
        "Insufficient available capital.",
      );
    }

    if (
      requestedCapital >
      this.account
        .limits
        .maximumCapitalPerTrade
    ) {
      reasons.push(
        "Maximum capital per trade exceeded.",
      );
    }

    if (
      this.account
        .todayLoss >=
      this.account
        .limits
        .maximumDailyLoss
    ) {
      reasons.push(
        "Daily loss limit reached.",
      );
    }

    if (
      this.account
        .openTrades >=
      this.account
        .limits
        .maximumOpenTrades
    ) {
      reasons.push(
        "Maximum open trades reached.",
      );
    }

    if (
      this.account
        .tradesToday >=
      this.account
        .limits
        .maximumDailyTrades
    ) {
      reasons.push(
        "Maximum daily trades reached.",
      );
    }

    return {
      approved:
        reasons.length ===
        0,

      reasons,
    };
  }

  updateExchangeBalance(
    snapshot:
      ExchangeBalanceSnapshot,
  ): void {
    const normalizedSnapshot =
      this.normalizeBalanceSnapshot(
        snapshot,
      );

    this.exchangeBalances.set(
      this.createBalanceKey(
        normalizedSnapshot.exchange,
        normalizedSnapshot.asset,
      ),

      normalizedSnapshot,
    );
  }

  updateExchangeBalances(
    snapshots:
      readonly ExchangeBalanceSnapshot[],
  ): void {
    for (
      const snapshot
      of snapshots
    ) {
      this.updateExchangeBalance(
        snapshot,
      );
    }
  }

  getExchangeBalance(
    exchange:
      string,

    asset:
      string,
  ): ExchangeBalanceSnapshot | null {
    const key =
      this.createBalanceKey(
        exchange,
        asset,
      );

    const snapshot =
      this.exchangeBalances.get(
        key,
      );

    return snapshot
      ? structuredClone(
          snapshot,
        )
      : null;
  }

  getExchangeBalances(
    exchange?:
      string,
  ): ExchangeBalanceSnapshot[] {
    const normalizedExchange =
      exchange
        ?.trim()
        .toLowerCase() ??
      null;

    return [
      ...this.exchangeBalances
        .values(),
    ]
      .filter(
        (
          snapshot,
        ) =>
          normalizedExchange ===
            null ||
          snapshot.exchange ===
            normalizedExchange,
      )
      .sort(
        (
          first,
          second,
        ) => {
          const exchangeComparison =
            first.exchange.localeCompare(
              second.exchange,
            );

          if (
            exchangeComparison !==
            0
          ) {
            return exchangeComparison;
          }

          return first.asset.localeCompare(
            second.asset,
          );
        },
      )
      .map(
        (
          snapshot,
        ) =>
          structuredClone(
            snapshot,
          ),
      );
  }

  evaluateExchangeBalance(
    request:
      ExchangeBalanceCheckRequest,
  ): ExchangeBalanceCheckResult {
    const exchange =
      request.exchange
        .trim()
        .toLowerCase();

    const asset =
      request.asset
        .trim()
        .toUpperCase();

    const requiredAmount =
      request.requiredAmount;

    const maximumAgeMs =
      request.maximumAgeMs ??
      DEFAULT_MAXIMUM_BALANCE_AGE_MS;

    const reasons:
      string[] = [];

    if (
      !exchange
    ) {
      reasons.push(
        "Exchange is required for balance validation.",
      );
    }

    if (
      !asset
    ) {
      reasons.push(
        "Asset is required for balance validation.",
      );
    }

    if (
      !Number.isFinite(
        requiredAmount,
      ) ||
      requiredAmount <=
        0
    ) {
      reasons.push(
        "Required balance amount must be positive.",
      );
    }

    if (
      !Number.isFinite(
        maximumAgeMs,
      ) ||
      maximumAgeMs <=
        0
    ) {
      reasons.push(
        "Maximum balance age must be positive.",
      );
    }

    if (
      reasons.length >
      0
    ) {
      return {
        approved:
          false,

        exchange,

        asset,

        requiredAmount,

        availableAmount:
          0,

        snapshotAgeMs:
          null,

        reasons,
      };
    }

    const snapshot =
      this.getExchangeBalance(
        exchange,
        asset,
      );

    if (
      !snapshot
    ) {
      return {
        approved:
          false,

        exchange,

        asset,

        requiredAmount,

        availableAmount:
          0,

        snapshotAgeMs:
          null,

        reasons: [
          "Exchange balance has not been synchronized.",
        ],
      };
    }

    const snapshotAgeMs =
      Math.max(
        0,

        Date.now() -
          snapshot.synchronizedAt,
      );

    if (
      snapshotAgeMs >
      maximumAgeMs
    ) {
      reasons.push(
        `Exchange balance snapshot is stale (${snapshotAgeMs} ms old).`,
      );
    }

    if (
      snapshot.availableBalance <
      requiredAmount
    ) {
      reasons.push(
        `Insufficient ${asset} balance on ${exchange}.`,
      );
    }

    return {
      approved:
        reasons.length ===
        0,

      exchange,

      asset,

      requiredAmount,

      availableAmount:
        snapshot.availableBalance,

      snapshotAgeMs,

      reasons,
    };
  }

  removeExchangeBalances(
    exchange:
      string,
  ): void {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    if (
      !normalizedExchange
    ) {
      return;
    }

    for (
      const [
        key,
        snapshot,
      ]
      of this.exchangeBalances
    ) {
      if (
        snapshot.exchange ===
        normalizedExchange
      ) {
        this.exchangeBalances.delete(
          key,
        );
      }
    }
  }

  clearExchangeBalances():
    void {
    this.exchangeBalances.clear();
  }

  reserveCapital(
    amount:
      number,
    transactionId:
      string | null =
        null,
  ): boolean {
    this.ensureCurrentDailyMetrics();

    const normalizedTransactionId =
      transactionId?.trim() ||
      null;

    if (
      normalizedTransactionId &&
      this.ledger
        .hasAppliedTransaction(
          normalizedTransactionId,
        )
    ) {
      return true;
    }

    if (
      !Number.isFinite(
        amount,
      ) ||
      amount <=
        0 ||
      amount >
        this.account
          .availableCapital
    ) {
      return false;
    }

    const next =
      structuredClone(
        this.account,
      );

    next.availableCapital -=
      amount;

    next.openTrades +=
      1;

    next.tradesToday +=
      1;

    try {
      this.commitAccountMutation(
        "RESERVE_CAPITAL",
        next,
        {
          amount,
          transactionId:
            normalizedTransactionId,
        },
      );

      return true;
    } catch {
      return false;
    }
  }

  releaseCapital(
    amount:
      number,
    transactionId:
      string | null =
        null,
  ): void {
    const normalizedTransactionId =
      transactionId?.trim() ||
      null;

    if (
      normalizedTransactionId &&
      this.ledger
        .hasAppliedTransaction(
          normalizedTransactionId,
        )
    ) {
      return;
    }

    const next =
      structuredClone(
        this.account,
      );

    if (
      Number.isFinite(
        amount,
      ) &&
      amount >
        0
    ) {
      next.availableCapital =
        Math.min(
          next.currentCapital,

          next.availableCapital +
            amount,
        );
    }

    next.openTrades =
      Math.max(
        0,

        next.openTrades -
          1,
      );

    this.commitAccountMutation(
      "RELEASE_CAPITAL",
      next,
      {
        amount:
          Number.isFinite(
            amount,
          )
            ? amount
            : null,
        transactionId:
          normalizedTransactionId,
      },
    );
  }

  recordProfit(
    profit:
      number,
  ): void {
    this.ensureCurrentDailyMetrics();

    if (
      !Number.isFinite(
        profit,
      )
    ) {
      throw new Error(
        "Profit must be a finite number.",
      );
    }

    const transactionId =
      this.activeAccountingTransactionId;

    /*
     * VERSION 18 BUILD 7
     *
     * Idempotent accounting.
     *
     * If this settlement transaction was
     * already committed to the persistent
     * account ledger, do NOT apply PnL again.
     */
    if (
      transactionId &&
      this.ledger
        .hasAppliedTransaction(
          transactionId,
        )
    ) {
      return;
    }

    const next =
      structuredClone(
        this.account,
      );

    if (
      profit >=
      0
    ) {
      next.todayProfit +=
        profit;
    } else {
      next.todayLoss +=
        Math.abs(
          profit,
        );
    }

    next.currentCapital +=
      profit;

    next.availableCapital +=
      profit;

    next.currentCapital =
      Math.max(
        0,
        next.currentCapital,
      );

    next.availableCapital =
      Math.max(
        0,

        Math.min(
          next.currentCapital,
          next.availableCapital,
        ),
      );

    this.commitAccountMutation(
      "RECORD_PROFIT",
      next,
      {
        amount:
          profit,

        transactionId,
      },
    );
  }

  /**
   * Narrow, journal-first mode transition owned exclusively by a bounded
   * Strategy #1 Tiny-LIVE account lease. It cannot change capital, limits,
   * balances or emergency-stop state, and it refuses to cross modes while an
   * account position is open.
   */
  transitionModeForTinyLiveLease(
    mode:
      "PAPER" | "LIVE",
    leaseIdValue:
      string,
  ): TradingAccount {
    const leaseId =
      leaseIdValue
        .trim();

    if (
      !/^tiny-live-account-lease-[a-f0-9]{32}$/u.test(
        leaseId,
      )
    ) {
      throw new Error(
        "A valid bounded Tiny-LIVE account lease ID is required.",
      );
    }

    if (
      this.account.mode ===
        mode
    ) {
      return this.getAccount();
    }

    const expectedCurrentMode =
      mode ===
        "LIVE"
        ? "PAPER"
        : "LIVE";

    if (
      this.account.mode !==
        expectedCurrentMode
    ) {
      throw new Error(
        `Tiny-LIVE account lease cannot transition ${this.account.mode} to ${mode}.`,
      );
    }

    if (
      this.account.openTrades !==
        0
    ) {
      throw new Error(
        "Tiny-LIVE account mode cannot change while account positions are open.",
      );
    }

    const next =
      structuredClone(
        this.account,
      );

    next.mode =
      mode;

    this.commitAccountMutation(
      "UPDATE_ACCOUNT",
      next,
      {
        transactionId:
          `${leaseId}:${mode}`,
      },
    );

    return this.getAccount();
  }

  /**
   * Atomically books economic PAPER P&L and its recoverable TDS cash lock
   * under the same restart-safe settlement transaction.
   *
   * TDS remains part of economic equity as a receivable, but cannot be
   * reused as available trading cash until a future independently verified
   * tax-credit/refund workflow exists.
   */
  recordPaperSettlementEconomics(
    netProfit:
      number,

    tdsWithheld:
      number,
  ): void {
    this.ensureCurrentDailyMetrics();

    if (
      !Number.isFinite(
        netProfit,
      )
    ) {
      throw new Error(
        "PAPER settlement net profit must be finite.",
      );
    }

    if (
      !Number.isFinite(
        tdsWithheld,
      ) ||
      tdsWithheld <
        0
    ) {
      throw new Error(
        "PAPER settlement TDS must be a non-negative finite number.",
      );
    }

    const transactionId =
      this.activeAccountingTransactionId;

    if (
      transactionId &&
      this.ledger
        .hasAppliedTransaction(
          transactionId,
        )
    ) {
      return;
    }

    const next =
      structuredClone(
        this.account,
      );

    if (
      netProfit >=
      0
    ) {
      next.todayProfit +=
        netProfit;
    } else {
      next.todayLoss +=
        Math.abs(
          netProfit,
        );
    }

    next.currentCapital +=
      netProfit;

    next.paperTdsReceivable =
      (
        next.paperTdsReceivable ??
        0
      ) +
      tdsWithheld;

    next.availableCapital +=
      netProfit -
      tdsWithheld;

    next.currentCapital =
      Math.max(
        0,
        next.currentCapital,
      );

    next.availableCapital =
      Math.max(
        0,
        Math.min(
          next.currentCapital,
          next.availableCapital,
        ),
      );

    this.commitAccountMutation(
      "RECORD_SETTLEMENT_ECONOMICS",
      next,
      {
        amount:
          netProfit,
        tdsWithheld,
        transactionId,
      },
    );
  }

  /**
   * One-way migration for settlements persisted before the account ledger
   * carried TDS receivables. It only adds a missing lock; it never invents
   * a refund or releases capital.
   */
  reconcilePaperTdsReceivable(
    totalWithheld:
      number,
  ): TradingAccount {
    if (
      !Number.isFinite(
        totalWithheld,
      ) ||
      totalWithheld <
        0
    ) {
      throw new Error(
        "PAPER TDS reconciliation total must be a non-negative finite number.",
      );
    }

    const current =
      this.account
        .paperTdsReceivable ??
      0;

    if (
      totalWithheld <=
      current +
        1e-9
    ) {
      return this.getAccount();
    }

    const additionalLock =
      totalWithheld -
      current;

    const next =
      structuredClone(
        this.account,
      );

    next.paperTdsReceivable =
      totalWithheld;

    next.availableCapital =
      Math.max(
        0,
        next.availableCapital -
          additionalLock,
      );

    this.commitAccountMutation(
      "RECONCILE_PAPER_TDS",
      next,
      {
        amount:
          0,
        tdsWithheld:
          additionalLock,
      },
    );

    return this.getAccount();
  }

  /*
   * VERSION 18 BUILD 7
   *
   * Current settlement engine is synchronous,
   * so a scoped transaction ID can safely be
   * exposed to recordProfit().
   *
   * This does NOT submit orders.
   */
  runWithAccountingTransaction<T>(
    transactionId:
      string,

    operation:
      () => T,
  ): T {
    const normalized =
      transactionId.trim();

    if (
      !normalized
    ) {
      throw new Error(
        "Accounting transaction ID is required.",
      );
    }

    const previous =
      this.activeAccountingTransactionId;

    if (
      previous &&
      previous !==
        normalized
    ) {
      throw new Error(
        `Nested accounting transaction conflict: ${previous}.`,
      );
    }

    this.activeAccountingTransactionId =
      normalized;

    try {
      return operation();
    } finally {
      this.activeAccountingTransactionId =
        previous;
    }
  }

  hasAppliedAccountingTransaction(
    transactionId:
      string,
  ): boolean {
    return this.ledger
      .hasAppliedTransaction(
        transactionId,
      );
  }

  enableEmergencyStop():
    void {
    if (
      this.account
        .emergencyStop
    ) {
      return;
    }

    const next =
      structuredClone(
        this.account,
      );

    next.emergencyStop =
      true;

    this.commitAccountMutation(
      "EMERGENCY_STOP_ENABLED",
      next,
    );
  }

  disableEmergencyStop():
    void {
    if (
      !this.account
        .emergencyStop
    ) {
      return;
    }

    const next =
      structuredClone(
        this.account,
      );

    next.emergencyStop =
      false;

    this.commitAccountMutation(
      "EMERGENCY_STOP_DISABLED",
      next,
    );
  }

  getLatestEmergencyStopTransition() {
    return this.ledger
      .getLatestEmergencyStopTransition();
  }

  resetDailyMetrics():
    void {
    const next =
      structuredClone(
        this.account,
      );

    next.todayProfit =
      0;

    next.todayLoss =
      0;

    next.tradesToday =
      0;

    this.commitAccountMutation(
      "RESET_DAILY_METRICS",
      next,
    );

    this.dailyMetricsDateKey =
      this.toLocalDateKey(
        Date.now(),
      );
  }

  resetAccount():
    void {
    this.commitAccountMutation(
      "RESET_ACCOUNT",

      structuredClone(
        defaultTradingAccount,
      ),
    );

    /*
     * Fresh exchange state must always be
     * synchronized again after account reset.
     */
    this.clearExchangeBalances();

    this.dailyMetricsDateKey =
      this.toLocalDateKey(
        Date.now(),
      );
  }

  updateMaximumDailyTrades(
    maximumDailyTrades:
      number,
  ): TradingAccount {
    this.ensureCurrentDailyMetrics();

    if (
      this.account.mode !==
        "PAPER"
    ) {
      throw new Error(
        "Daily PAPER attempt limit can only be changed for a PAPER account.",
      );
    }

    if (
      !Number.isSafeInteger(
        maximumDailyTrades,
      ) ||
      maximumDailyTrades <
        1 ||
      maximumDailyTrades >
        MAXIMUM_DAILY_PAPER_ATTEMPT_LIMIT
    ) {
      throw new Error(
        `Daily PAPER attempt limit must be a whole number from 1 to ${MAXIMUM_DAILY_PAPER_ATTEMPT_LIMIT}.`,
      );
    }

    if (
      this.account.limits
        .maximumDailyTrades ===
        maximumDailyTrades
    ) {
      return this.getAccount();
    }

    const next =
      structuredClone(
        this.account,
      );

    next.limits.maximumDailyTrades =
      maximumDailyTrades;

    this.commitAccountMutation(
      "UPDATE_ACCOUNT",
      next,
    );

    return this.getAccount();
  }

  resetPaperTradingData(
    now =
      Date.now(),
  ): TradingAccount {
    if (
      this.account.mode !==
        "PAPER"
    ) {
      throw new Error(
        "PAPER trading data can only be reset for a PAPER account.",
      );
    }

    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "PAPER trading data reset timestamp must be positive.",
      );
    }

    const next =
      structuredClone(
        this.account,
      );

    next.currentCapital =
      next.initialCapital;

    next.availableCapital =
      next.initialCapital;

    next.paperTdsReceivable =
      0;

    next.todayProfit =
      0;

    next.todayLoss =
      0;

    next.openTrades =
      0;

    next.tradesToday =
      0;

    this.ledger
      .replaceHistoryWithAccount(
        next,
        now,
      );

    this.account =
      next;

    this.activeAccountingTransactionId =
      null;

    this.dailyMetricsDateKey =
      this.toLocalDateKey(
        now,
      );

    return this.getAccount();
  }

  private ensureCurrentDailyMetrics():
    void {
    const currentDateKey =
      this.toLocalDateKey(
        Date.now(),
      );

    if (
      currentDateKey ===
        this.dailyMetricsDateKey
    ) {
      return;
    }

    const next =
      structuredClone(
        this.account,
      );

    next.todayProfit =
      0;

    next.todayLoss =
      0;

    next.tradesToday =
      0;

    this.commitAccountMutation(
      "RESET_DAILY_METRICS",
      next,
    );

    this.dailyMetricsDateKey =
      currentDateKey;
  }

  private toLocalDateKey(
    timestamp:
      number,
  ): string {
    return toPaperAccountingDateKey(
      timestamp,
    );
  }

  private commitAccountMutation(
    operation:
      TradingAccountLedgerOperation,

    next:
      TradingAccount,

    options: {
      amount?:
        number | null;

      transactionId?:
        string | null;

      tdsWithheld?:
        number | null;
    } = {},
  ): void {
    const before =
      structuredClone(
        this.account,
      );

    /*
     * Persist first.
     *
     * New in-memory state becomes visible only
     * after durable ledger append succeeds.
     */
    this.ledger
      .recordMutation(
        operation,
        before,
        next,
        options,
      );

    this.account =
      structuredClone(
        next,
      );
  }

  private normalizeAccount(
    account:
      TradingAccount,

    missingTdsReceivable:
      number,
  ): TradingAccount {
    const supplied =
      account.paperTdsReceivable;

    if (
      supplied !==
        undefined &&
      (
        !Number.isFinite(
          supplied,
        ) ||
        supplied <
          0
      )
    ) {
      throw new Error(
        "PAPER TDS receivable must be a non-negative finite number.",
      );
    }

    return {
      ...structuredClone(
        account,
      ),
      paperTdsReceivable:
        supplied ??
        missingTdsReceivable,
    };
  }

  private normalizeBalanceSnapshot(
    snapshot:
      ExchangeBalanceSnapshot,
  ): ExchangeBalanceSnapshot {
    const exchange =
      snapshot.exchange
        .trim()
        .toLowerCase();

    const asset =
      snapshot.asset
        .trim()
        .toUpperCase();

    if (
      !exchange
    ) {
      throw new Error(
        "Exchange balance snapshot requires an exchange.",
      );
    }

    if (
      !asset
    ) {
      throw new Error(
        "Exchange balance snapshot requires an asset.",
      );
    }

    const numericValues = [
      snapshot.availableBalance,
      snapshot.lockedBalance,
      snapshot.totalBalance,
    ];

    if (
      numericValues.some(
        (
          value,
        ) =>
          !Number.isFinite(
            value,
          ) ||
          value <
            0,
      )
    ) {
      throw new Error(
        "Exchange balance values must be finite and non-negative.",
      );
    }

    if (
      !Number.isSafeInteger(
        snapshot.synchronizedAt,
      ) ||
      snapshot.synchronizedAt <=
        0 ||
      snapshot.synchronizedAt >
        Date.now()
    ) {
      throw new Error(
        "Exchange balance synchronization timestamp is invalid.",
      );
    }

    const calculatedTotal =
      snapshot.availableBalance +
      snapshot.lockedBalance;

    if (
      Math.abs(
        calculatedTotal -
          snapshot.totalBalance,
      ) >
      1e-8
    ) {
      throw new Error(
        "Exchange balance total must equal available plus locked balance.",
      );
    }

    return {
      exchange,

      asset,

      availableBalance:
        snapshot.availableBalance,

      lockedBalance:
        snapshot.lockedBalance,

      totalBalance:
        snapshot.totalBalance,

      synchronizedAt:
        snapshot.synchronizedAt,
    };
  }

  private createBalanceKey(
    exchange:
      string,

    asset:
      string,
  ): string {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    const normalizedAsset =
      asset
        .trim()
        .toUpperCase();

    return `${normalizedExchange}:${normalizedAsset}`;
  }
}

export const tradingAccountService =
  new TradingAccountService();
