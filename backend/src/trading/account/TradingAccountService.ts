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

  constructor() {
    this.account =
      tradingAccountLedgerService
        .getRestoredAccount() ??
      structuredClone(
        defaultTradingAccount,
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

      structuredClone(
        account,
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
      tradingAccountLedgerService
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
      tradingAccountLedgerService
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
      tradingAccountLedgerService
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
    return tradingAccountLedgerService
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

    next.todayProfit =
      0;

    next.todayLoss =
      0;

    next.openTrades =
      0;

    next.tradesToday =
      0;

    tradingAccountLedgerService
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
    tradingAccountLedgerService
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
