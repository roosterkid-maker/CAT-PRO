import {
  coinDCXSubscriptionAuditService,
} from "./CoinDCXSubscriptionAuditService";

import {
  exchangeManager,
} from "../../exchanges/core/ExchangeManager";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

export type OrderBookWatchdogState =
  | "WARMING_UP"
  | "HEALTHY"
  | "DEGRADED"
  | "RECOVERING"
  | "NO_DATA";

export interface ExchangeOrderBookWatchdogReport {
  exchange: string;

  connected: boolean;

  observedMarkets: number;

  freshBooks: number;

  staleOrMissingBooks: number;

  stalePercent: number;

  consecutiveDegradedCycles: number;

  recoveryEligible: boolean;

  recoveryMode:
    | "FULL_ADAPTER_RECONNECT"
    | "TARGETED_RESUBSCRIBE"
    | "EXISTING_AUDITED_RETRY"
    | "OBSERVE_ONLY";

  recoveryAttempts: number;

  lastRecoveryAt: number | null;

  cooldownRemainingMs: number;

  candidateMarkets: string[];
}

export interface OrderBookSubscriptionWatchdogReport {
  generatedAt: number;

  mode: "SAFETY_RECOVERY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  running: boolean;

  state: OrderBookWatchdogState;

  startedAt: number | null;

  warmupRemainingMs: number;

  intervalMs: number;

  totalRuns: number;

  totalRecoveries: number;

  exchanges: ExchangeOrderBookWatchdogReport[];

  observations: string[];
}

interface MutableExchangeState {
  consecutiveDegradedCycles: number;

  recoveryAttempts: number;

  lastRecoveryAt: number | null;
}

export class OrderBookSubscriptionWatchdogService {
  private static readonly INTERVAL_MS =
    5_000;

  private static readonly WARMUP_MS =
    20_000;

  private static readonly REQUIRED_DEGRADED_CYCLES =
    3;

  /*
   * Prevent repeated recovery loops against
   * genuinely quiet markets or transient exchange
   * conditions.
   */
  private static readonly RECOVERY_COOLDOWN_MS =
    300_000;

  /*
   * Binance currently uses a multi-worker pool.
   *
   * Because the existing adapter does not expose
   * per-symbol targeted re-subscription, a Binance
   * recovery reconnects the complete market-data
   * adapter.
   *
   * Therefore the evidence threshold is deliberately
   * much stronger than a single stale market.
   */
  private static readonly BINANCE_MINIMUM_STALE_MARKETS =
    20;

  private static readonly BINANCE_MINIMUM_STALE_PERCENT =
    5;

  /*
   * Bybit supports public subscribe/unsubscribe,
   * therefore recovery can remain targeted.
   */
  private static readonly BYBIT_MAXIMUM_TARGETED_RECOVERIES_PER_RUN =
    5;

  private timer:
    NodeJS.Timeout |
    null =
    null;

  private startedAt:
    number |
    null =
    null;

  private totalRuns =
    0;

  private totalRecoveries =
    0;

  private recoveryInProgress =
    false;

  private readonly exchangeState =
    new Map<
      string,
      MutableExchangeState
    >();

  /*
   * Important:
   *
   * V19.13 may safely evict an already-stale book.
   * Once removed, the original book timestamp is no
   * longer available.
   *
   * This map preserves "how long has the book been
   * missing" evidence independently of MarketCache.
   *
   * Therefore a fresh ticker update cannot conceal
   * a missing/dead order-book subscription.
   */
  private readonly missingBookSince =
    new Map<
      string,
      number
    >();

  start(): void {
    if (
      this.timer
    ) {
      return;
    }

    this.startedAt =
      Date.now();

    this.timer =
      setInterval(
        () => {
          void this.run();
        },
        OrderBookSubscriptionWatchdogService
          .INTERVAL_MS,
      );

    this.timer.unref?.();

    console.log(
      `[OrderBookWatchdog] Started (${OrderBookSubscriptionWatchdogService.INTERVAL_MS}ms interval, ${OrderBookSubscriptionWatchdogService.WARMUP_MS}ms warmup).`,
    );
  }

  stop(): void {
    if (
      this.timer
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }

    this.startedAt =
      null;

    this.recoveryInProgress =
      false;

    console.log(
      "[OrderBookWatchdog] Stopped.",
    );
  }

  async run(
    now =
      Date.now(),
  ): Promise<void> {
    this.totalRuns +=
      1;

    if (
      !this.startedAt ||
      now -
        this.startedAt <
        OrderBookSubscriptionWatchdogService
          .WARMUP_MS ||
      this.recoveryInProgress
    ) {
      return;
    }

    const reports =
      this.buildExchangeReports(
        now,
      );

    this.updateDegradedCycles(
      reports,
    );

    const binance =
      reports.find(
        (
          report,
        ) =>
          report.exchange ===
          "binance",
      );

    const bybit =
      reports.find(
        (
          report,
        ) =>
          report.exchange ===
          "bybit",
      );

    if (
      binance &&
      this.shouldRecoverBinance(
        binance,
        now,
      )
    ) {
      await this.recoverBinance(
        now,
      );

      return;
    }

    if (
      bybit &&
      this.shouldRecoverBybit(
        bybit,
        now,
      )
    ) {
      await this.recoverBybit(
        bybit,
        now,
      );
    }
  }

  getReport(
    now =
      Date.now(),
  ): OrderBookSubscriptionWatchdogReport {
    const reports =
      this.buildExchangeReports(
        now,
      );

    const warmupRemainingMs =
      this.startedAt
        ? Math.max(
            0,
            OrderBookSubscriptionWatchdogService
              .WARMUP_MS -
              (
                now -
                this.startedAt
              ),
          )
        : 0;

    const state =
      this.resolveOverallState(
        reports,
        warmupRemainingMs,
      );

    return {
      generatedAt:
        now,

      mode:
        "SAFETY_RECOVERY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      running:
        this.timer !==
        null,

      state,

      startedAt:
        this.startedAt,

      warmupRemainingMs,

      intervalMs:
        OrderBookSubscriptionWatchdogService
          .INTERVAL_MS,

      totalRuns:
        this.totalRuns,

      totalRecoveries:
        this.totalRecoveries,

      exchanges:
        reports,

      observations: [
        "The watchdog never widens freshness thresholds and never manufactures timestamps.",

        "Binance recovery is a full market-data adapter reconnect and requires sustained, material stale-book evidence.",

        "Bybit recovery uses capped targeted unsubscribe/resubscribe for stale previously-observed markets.",

        "CoinDCX continues to use its existing subscription audit/retry lifecycle; this watchdog does not duplicate that mechanism.",

        "A stale or missing order book remains non-executable until genuine exchange data is received again.",
      ],
    };
  }

  private buildExchangeReports(
    now:
      number,
  ): ExchangeOrderBookWatchdogReport[] {
    return [
      this.buildGenericExchangeReport(
        "binance",
        "FULL_ADAPTER_RECONNECT",
        now,
      ),

      this.buildGenericExchangeReport(
        "bybit",
        "TARGETED_RESUBSCRIBE",
        now,
      ),

      this.buildCoinDCXReport(
        now,
      ),
    ];
  }

  private buildGenericExchangeReport(
    exchange:
      "binance" |
      "bybit",

    recoveryMode:
      ExchangeOrderBookWatchdogReport["recoveryMode"],

    now:
      number,
  ): ExchangeOrderBookWatchdogReport {
    const adapter =
      exchangeManager.get(
        this.toAdapterName(
          exchange,
        ),
      );

    /*
     * Observed universe =
     *
     * markets ever published to MarketCache
     * plus currently available OrderBookService books.
     *
     * This avoids inventing subscription coverage.
     */
    const observedMarkets =
      new Set<string>();

    for (
      const quote
      of marketCache.getByExchange(
        exchange,
      )
    ) {
      observedMarkets.add(
        quote.market
          .trim()
          .toUpperCase(),
      );
    }

    for (
      const book
      of orderBookService.getAll()
    ) {
      if (
        book.exchange
          .trim()
          .toLowerCase() ===
        exchange
      ) {
        observedMarkets.add(
          book.market
            .trim()
            .toUpperCase(),
        );
      }
    }

    let freshBooks =
      0;

    const candidateMarkets:
      string[] =
      [];

    const maximumAgeMs =
      freshnessIntegrityService
        .getMaximumQuoteAgeMs(
          exchange,
        );

    /*
     * Recovery requires a much stronger signal than
     * the execution freshness rejection itself.
     *
     * Example:
     *
     * Binance execution limit = 4s
     * automatic recovery silence = 20s
     *
     * Bybit execution limit = 6s
     * automatic recovery silence = 30s
     */
    const recoverySilenceMs =
      maximumAgeMs *
      5;

    for (
      const market
      of observedMarkets
    ) {
      const book =
        orderBookService.get(
          exchange,
          market,
        );

      const missingKey =
        `${exchange}:${market}`;

      if (
        book &&
        Number.isFinite(
          book.timestamp,
        ) &&
        now -
          book.timestamp >=
          0 &&
        now -
          book.timestamp <=
          maximumAgeMs
      ) {
        freshBooks +=
          1;

        this.missingBookSince.delete(
          missingKey,
        );

        continue;
      }

      /*
       * Book still exists but is stale.
       *
       * Use the actual order-book timestamp.
       * Never substitute the MarketCache ticker time.
       */
      if (
        book &&
        Number.isFinite(
          book.timestamp,
        ) &&
        book.timestamp >
          0
      ) {
        if (
          now -
            book.timestamp >=
          recoverySilenceMs
        ) {
          candidateMarkets.push(
            market,
          );
        }

        continue;
      }

      /*
       * V19.13 may already have removed the stale book.
       *
       * Track the continuous missing-book duration.
       * A continuously updating ticker cannot reset this.
       */
      const firstMissingAt =
        this.missingBookSince.get(
          missingKey,
        ) ??
        now;

      this.missingBookSince.set(
        missingKey,
        firstMissingAt,
      );

      if (
        now -
          firstMissingAt >=
        recoverySilenceMs
      ) {
        candidateMarkets.push(
          market,
        );
      }
    }

    const staleOrMissingBooks =
      Math.max(
        0,
        observedMarkets.size -
          freshBooks,
      );

    const stalePercent =
      observedMarkets.size >
        0
        ? Number(
            (
              staleOrMissingBooks /
              observedMarkets.size *
              100
            ).toFixed(
              2,
            ),
          )
        : 0;

    const mutableState =
      this.getMutableState(
        exchange,
      );

    const cooldownRemainingMs =
      mutableState.lastRecoveryAt
        ? Math.max(
            0,
            OrderBookSubscriptionWatchdogService
              .RECOVERY_COOLDOWN_MS -
              (
                now -
                mutableState.lastRecoveryAt
              ),
          )
        : 0;

    return {
      exchange,

      connected:
        adapter?.isConnected() ??
        false,

      observedMarkets:
        observedMarkets.size,

      freshBooks,

      staleOrMissingBooks,

      stalePercent,

      consecutiveDegradedCycles:
        mutableState
          .consecutiveDegradedCycles,

      recoveryEligible:
        candidateMarkets.length >
          0 &&
        cooldownRemainingMs ===
          0,

      recoveryMode,

      recoveryAttempts:
        mutableState
          .recoveryAttempts,

      lastRecoveryAt:
        mutableState
          .lastRecoveryAt,

      cooldownRemainingMs,

      candidateMarkets:
        candidateMarkets.slice(
          0,
          50,
        ),
    };
  }

  private buildCoinDCXReport(
    now:
      number,
  ): ExchangeOrderBookWatchdogReport {
    /*
     * ExchangeManager contains the ordinary CoinDCX
     * market-data adapter.
     *
     * Actual CoinDCX depth health comes from the
     * existing CoinDCXSubscriptionAuditService.
     */
    const adapter =
      exchangeManager.get(
        "CoinDCX",
      );

    const audit =
      coinDCXSubscriptionAuditService
        .getReport(
          now,
        );

    const currentRecords =
      audit.records.filter(
        (
          record,
        ) =>
          record.state !==
            "FAILED" &&
          record.state !==
            "PERSISTENTLY_SILENT",
      );

    const maximumAgeMs =
      freshnessIntegrityService
        .getMaximumQuoteAgeMs(
          "coindcx",
        );

    const isFreshBook =
      (
        market:
          string,
      ): boolean => {
        const book =
          orderBookService.get(
            "coindcx",
            market,
          );

        return Boolean(
          book &&
          Number.isFinite(
            book.timestamp,
          ) &&
          now -
            book.timestamp >=
            0 &&
          now -
            book.timestamp <=
            maximumAgeMs,
        );
      };

    /*
     * Audit ACTIVE means the socket is delivering structurally useful events;
     * it does not by itself prove that an executable, fresh order book exists.
     * Keep operational diagnostics tied to the actual published book.
     */
    const freshBooks =
      currentRecords.filter(
        (
          record,
        ) =>
          isFreshBook(
            record.market,
          ),
      ).length;

    const staleOrMissingBooks =
      currentRecords.filter(
        (
          record,
        ) =>
          !isFreshBook(
            record.market,
          ),
      ).length;

    const observedMarkets =
      currentRecords.length;

    const stalePercent =
      observedMarkets >
        0
        ? Number(
            (
              staleOrMissingBooks /
              observedMarkets *
              100
            ).toFixed(
              2,
            ),
          )
        : 0;

    const mutableState =
      this.getMutableState(
        "coindcx",
      );

    return {
      exchange:
        "coindcx",

      connected:
        adapter?.isConnected() ??
        false,

      observedMarkets:
        observedMarkets,

      freshBooks,

      staleOrMissingBooks,

      stalePercent,

      consecutiveDegradedCycles:
        mutableState
          .consecutiveDegradedCycles,

      /*
       * Deliberately false.
       *
       * CoinDCXOrderBookAdapter already owns audited
       * leave/join retry logic.
       */
      recoveryEligible:
        false,

      recoveryMode:
        "EXISTING_AUDITED_RETRY",

      recoveryAttempts:
        audit.summary.totalRetries,

      lastRecoveryAt:
        null,

      cooldownRemainingMs:
        0,

      candidateMarkets:
        currentRecords
          .filter(
            (
              record,
            ) =>
              !isFreshBook(
                record.market,
              ),
          )
          .map(
            (
              record,
            ) =>
              record.market,
          )
          .slice(
            0,
            50,
          ),
    };
  }

  private updateDegradedCycles(
    reports:
      ExchangeOrderBookWatchdogReport[],
  ): void {
    for (
      const report
      of reports
    ) {
      const state =
        this.getMutableState(
          report.exchange,
        );

      if (
        report.exchange ===
        "coindcx"
      ) {
        state.consecutiveDegradedCycles =
          report.staleOrMissingBooks >
            0
            ? state.consecutiveDegradedCycles +
              1
            : 0;

        continue;
      }

      state.consecutiveDegradedCycles =
        report.candidateMarkets.length >
          0
          ? state.consecutiveDegradedCycles +
            1
          : 0;
    }
  }

  private shouldRecoverBinance(
    report:
      ExchangeOrderBookWatchdogReport,

    now:
      number,
  ): boolean {
    if (
      !report.connected ||
      report.candidateMarkets.length <
        OrderBookSubscriptionWatchdogService
          .BINANCE_MINIMUM_STALE_MARKETS ||
      report.stalePercent <
        OrderBookSubscriptionWatchdogService
          .BINANCE_MINIMUM_STALE_PERCENT
    ) {
      return false;
    }

    return this.recoveryWindowOpen(
      "binance",
      now,
    );
  }

  private shouldRecoverBybit(
    report:
      ExchangeOrderBookWatchdogReport,

    now:
      number,
  ): boolean {
    if (
      !report.connected ||
      report.candidateMarkets.length ===
        0
    ) {
      return false;
    }

    return this.recoveryWindowOpen(
      "bybit",
      now,
    );
  }

  private recoveryWindowOpen(
    exchange:
      string,

    now:
      number,
  ): boolean {
    const state =
      this.getMutableState(
        exchange,
      );

    if (
      state.consecutiveDegradedCycles <
      OrderBookSubscriptionWatchdogService
        .REQUIRED_DEGRADED_CYCLES
    ) {
      return false;
    }

    if (
      state.lastRecoveryAt &&
      now -
        state.lastRecoveryAt <
        OrderBookSubscriptionWatchdogService
          .RECOVERY_COOLDOWN_MS
    ) {
      return false;
    }

    return true;
  }

  private async recoverBinance(
    now:
      number,
  ): Promise<void> {
    const adapter =
      exchangeManager.get(
        "Binance",
      );

    if (
      !adapter
    ) {
      return;
    }

    this.recoveryInProgress =
      true;

    try {
      console.warn(
        "[OrderBookWatchdog] Sustained Binance order-book degradation detected. Reconnecting Binance market-data pool.",
      );

      /*
       * Current Binance adapter assigns all subscriptions
       * when its connection pool starts.
       *
       * Full adapter reconnect therefore guarantees new
       * workers + new SUBSCRIBE requests without adding a
       * second parallel subscription system.
       */
      await adapter.disconnect();

      await this.sleep(
        1_000,
      );

      await adapter.connect();

      this.recordRecovery(
        "binance",
        now,
      );
    } catch (
      error:
        unknown
    ) {
      console.error(
        "[OrderBookWatchdog] Binance recovery failed:",
        error,
      );
    } finally {
      this.recoveryInProgress =
        false;
    }
  }

  private async recoverBybit(
    report:
      ExchangeOrderBookWatchdogReport,

    now:
      number,
  ): Promise<void> {
    const adapter =
      exchangeManager.get(
        "Bybit",
      );

    if (
      !adapter
    ) {
      return;
    }

    const markets =
      report.candidateMarkets.slice(
        0,
        OrderBookSubscriptionWatchdogService
          .BYBIT_MAXIMUM_TARGETED_RECOVERIES_PER_RUN,
      );

    if (
      markets.length ===
      0
    ) {
      return;
    }

    this.recoveryInProgress =
      true;

    try {
      console.warn(
        `[OrderBookWatchdog] Targeted Bybit resubscribe: ${markets.join(", ")}`,
      );

      /*
       * BybitAdapter already has safe public
       * unsubscribe()/subscribe() contracts.
       *
       * Reuse them rather than creating another socket.
       */
      await adapter.unsubscribe(
        markets,
      );

      await this.sleep(
        250,
      );

      await adapter.subscribe(
        markets,
      );

      this.recordRecovery(
        "bybit",
        now,
      );
    } catch (
      error:
        unknown
    ) {
      console.error(
        "[OrderBookWatchdog] Bybit targeted recovery failed:",
        error,
      );
    } finally {
      this.recoveryInProgress =
        false;
    }
  }

  private recordRecovery(
    exchange:
      string,

    now:
      number,
  ): void {
    const state =
      this.getMutableState(
        exchange,
      );

    state.recoveryAttempts +=
      1;

    state.lastRecoveryAt =
      now;

    state.consecutiveDegradedCycles =
      0;

    this.totalRecoveries +=
      1;
  }

  private getMutableState(
    exchange:
      string,
  ): MutableExchangeState {
    const normalized =
      exchange
        .trim()
        .toLowerCase();

    const existing =
      this.exchangeState.get(
        normalized,
      );

    if (
      existing
    ) {
      return existing;
    }

    const created:
      MutableExchangeState = {
      consecutiveDegradedCycles:
        0,

      recoveryAttempts:
        0,

      lastRecoveryAt:
        null,
    };

    this.exchangeState.set(
      normalized,
      created,
    );

    return created;
  }

  private resolveOverallState(
    reports:
      ExchangeOrderBookWatchdogReport[],

    warmupRemainingMs:
      number,
  ): OrderBookWatchdogState {
    if (
      warmupRemainingMs >
      0
    ) {
      return "WARMING_UP";
    }

    if (
      this.recoveryInProgress
    ) {
      return "RECOVERING";
    }

    const observed =
      reports.reduce(
        (
          total,
          report,
        ) =>
          total +
          report.observedMarkets,
        0,
      );

    if (
      observed ===
      0
    ) {
      return "NO_DATA";
    }

    return reports.some(
      (
        report,
      ) =>
        report.staleOrMissingBooks >
        0,
    )
      ? "DEGRADED"
      : "HEALTHY";
  }

  private toAdapterName(
    exchange:
      "binance" |
      "bybit",
  ): string {
    return exchange ===
      "binance"
      ? "Binance"
      : "Bybit";
  }

  private sleep(
    milliseconds:
      number,
  ): Promise<void> {
    return new Promise(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
}

export const orderBookSubscriptionWatchdogService =
  new OrderBookSubscriptionWatchdogService();
