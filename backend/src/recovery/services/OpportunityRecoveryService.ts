import {
  opportunityRejectionStore,
} from "../../arbitrage/services/OpportunityRejectionStore";

import type {
  CoinDCXOrderBookAdapter,
} from "../../exchanges/coindcx/CoinDCXOrderBookAdapter";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  marketCache,
} from "../../services/cache.service";

export type OpportunityRecoveryStatus =
  | "PENDING"
  | "RECOVERED"
  | "FAILED";

export type OpportunityRecoveryMode =
  | "ACTIVE_COIN_DCX_DEMAND"
  | "PASSIVE_STREAM_WAIT";

export type OpportunityRecoveryOlderSide =
  | "BUY"
  | "SELL"
  | "EQUAL"
  | "UNKNOWN";

export interface OpportunityRecoveryAttempt {
  key: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  triggerCode: string;

  status: OpportunityRecoveryStatus;

  recoveryMode: OpportunityRecoveryMode;

  olderSide: OpportunityRecoveryOlderSide;

  olderExchange: string | null;

  attempts: number;

  observations: number;

  startedAt: number;

  lastAttemptAt: number;

  deadlineAt: number;

  recoveredAt: number | null;

  initialTimestampSkewMs: number | null;

  lastTimestampSkewMs: number | null;

  bestTimestampSkewMs: number | null;
}

export interface OpportunityRecoveryMetrics {
  started: boolean;

  scans: number;

  recoverableRejectionsSeen: number;

  duplicateRejectionsIgnored: number;

  /*
   * Retained for compatibility with Version 12.5.
   *
   * Version 17.3 Build 5 supports Binance/Bybit
   * recovery using bounded passive stream waiting,
   * so these routes are no longer automatically
   * classified as unsupported.
   */
  unsupportedExchangePairs: number;

  cooldownSuppressed: number;

  recoveryAttempts: number;

  pairSyncRecoveriesStarted: number;

  staleQuoteRecoveriesStarted: number;

  activeDemandRecoveriesStarted: number;

  passiveStreamRecoveriesStarted: number;

  passiveObservations: number;

  demandRequests: number;

  demandAccepted: number;

  demandRejected: number;

  recovered: number;

  recoveredPairSynchronization: number;

  recoveredStaleQuote: number;

  failed: number;

  pending: number;

  activeDemandPending: number;

  passiveStreamPending: number;

  lastScanAt: number | null;

  lastRecoveredAt: number | null;

  lastFailedAt: number | null;

  recentOutcomes: OpportunityRecoveryAttempt[];
}

interface RecoveryOpenInput {
  key: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  triggerCode: string;

  olderSide: OpportunityRecoveryOlderSide;

  olderExchange: string | null;

  initialTimestampSkewMs: number | null;
}

export class OpportunityRecoveryService {
  private static readonly SCAN_INTERVAL_MS =
    500;

  /*
   * Version 17.3 Build 5
   *
   * Recovery is intentionally bounded.
   *
   * We DO NOT widen synchronization limits.
   * We simply allow naturally updating streams
   * a short period to produce a genuinely
   * synchronized pair.
   */
  private static readonly RECOVERY_WINDOW_MS =
    4_000;

  private static readonly RETRY_DELAY_MS =
    1_000;

  private static readonly MAXIMUM_ATTEMPTS =
    2;

  /*
   * Prevent repeated recovery storms for the
   * same exact route.
   */
  private static readonly MARKET_COOLDOWN_MS =
    10_000;

  /*
   * CoinDCX temporary demand lease.
   *
   * Used only when CoinDCX is actually the
   * leg that may benefit from a refresh.
   */
  private static readonly TEMPORARY_SUBSCRIPTION_TTL_MS =
    30_000;

  private static readonly REJECTION_LOOKBACK =
    250;

  private static readonly MAXIMUM_HANDLED_IDS =
    2_000;

  private static readonly MAXIMUM_RECENT_OUTCOMES =
    100;

  private timer:
    ReturnType<typeof setInterval> |
    null =
    null;

  private readonly handledRejectionIds =
    new Set<string>();

  private readonly handledRejectionOrder:
    string[] =
    [];

  /*
   * key:
   *
   * MARKET|BUY_EXCHANGE|SELL_EXCHANGE
   */
  private readonly pending =
    new Map<
      string,
      OpportunityRecoveryAttempt
    >();

  private readonly cooldownUntil =
    new Map<
      string,
      number
    >();

  private readonly recentOutcomes:
    OpportunityRecoveryAttempt[] =
    [];

  private metrics = {
    scans:
      0,

    recoverableRejectionsSeen:
      0,

    duplicateRejectionsIgnored:
      0,

    unsupportedExchangePairs:
      0,

    cooldownSuppressed:
      0,

    recoveryAttempts:
      0,

    pairSyncRecoveriesStarted:
      0,

    staleQuoteRecoveriesStarted:
      0,

    activeDemandRecoveriesStarted:
      0,

    passiveStreamRecoveriesStarted:
      0,

    passiveObservations:
      0,

    demandRequests:
      0,

    demandAccepted:
      0,

    demandRejected:
      0,

    recovered:
      0,

    recoveredPairSynchronization:
      0,

    recoveredStaleQuote:
      0,

    failed:
      0,

    lastScanAt:
      null as number | null,

    lastRecoveredAt:
      null as number | null,

    lastFailedAt:
      null as number | null,
  };

  constructor(
    private readonly coinDCXOrderBookAdapter:
      CoinDCXOrderBookAdapter,
  ) {}

  start():
    void {
    if (
      this.timer !==
      null
    ) {
      return;
    }

    /*
     * Run immediately.
     */
    this.scan();

    this.timer =
      setInterval(
        () => {
          this.scan();
        },

        OpportunityRecoveryService
          .SCAN_INTERVAL_MS,
      );

    this.timer.unref?.();

    console.log(
      "[Recovery] Opportunity recovery engine started with bounded pair-sync recovery.",
    );
  }

  stop():
    void {
    if (
      this.timer !==
      null
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }

    this.pending.clear();

    console.log(
      "[Recovery] Opportunity recovery engine stopped.",
    );
  }

  scan(
    now =
      Date.now(),
  ): void {
    this.metrics.scans +=
      1;

    this.metrics.lastScanAt =
      now;

    /*
     * Existing attempts get first chance to
     * observe fresh stream updates.
     */
    this.processPending(
      now,
    );

    /*
     * Then consume new rejection events.
     */
    this.ingestRecentRejections(
      now,
    );

    this.cleanupCooldowns(
      now,
    );
  }

  getMetrics():
    OpportunityRecoveryMetrics {
    const pendingAttempts =
      Array.from(
        this.pending.values(),
      );

    return {
      started:
        this.timer !==
        null,

      ...this.metrics,

      pending:
        this.pending.size,

      activeDemandPending:
        pendingAttempts
          .filter(
            (
              attempt,
            ) =>
              attempt.recoveryMode ===
              "ACTIVE_COIN_DCX_DEMAND",
          )
          .length,

      passiveStreamPending:
        pendingAttempts
          .filter(
            (
              attempt,
            ) =>
              attempt.recoveryMode ===
              "PASSIVE_STREAM_WAIT",
          )
          .length,

      recentOutcomes:
        structuredClone(
          this.recentOutcomes,
        ),
    };
  }

  private ingestRecentRejections(
    now:
      number,
  ): void {
    const rejections =
      opportunityRejectionStore
        .getRecent(
          OpportunityRecoveryService
            .REJECTION_LOOKBACK,
        );

    for (
      const rejection
      of rejections
    ) {
      if (
        this.handledRejectionIds
          .has(
            rejection.id,
          )
      ) {
        this.metrics
          .duplicateRejectionsIgnored +=
          1;

        continue;
      }

      this.rememberRejectionId(
        rejection.id,
      );

      const code =
        String(
          rejection.code,
        );

      if (
        !this.isRecoverableCode(
          code,
        )
      ) {
        continue;
      }

      this.metrics
        .recoverableRejectionsSeen +=
        1;

      const market =
        rejection.market
          .trim()
          .toUpperCase();

      const buyExchange =
        rejection.buyExchange
          .trim()
          .toLowerCase();

      const sellExchange =
        rejection.sellExchange
          .trim()
          .toLowerCase();

      const key =
        this.createKey(
          market,
          buyExchange,
          sellExchange,
        );

      /*
       * One active recovery per exact direction.
       */
      if (
        this.pending.has(
          key,
        )
      ) {
        continue;
      }

      const cooldown =
        this.cooldownUntil
          .get(
            key,
          ) ??
        0;

      if (
        cooldown >
        now
      ) {
        this.metrics
          .cooldownSuppressed +=
          1;

        continue;
      }

      const timestampState =
        this.resolveTimestampState(
          buyExchange,
          sellExchange,
          market,
          rejection.metadata,
        );

      this.openRecovery(
        {
          key,

          market,

          buyExchange,

          sellExchange,

          triggerCode:
            code,

          olderSide:
            timestampState
              .olderSide,

          olderExchange:
            timestampState
              .olderExchange,

          initialTimestampSkewMs:
            timestampState
              .timestampSkewMs,
        },

        now,
      );
    }
  }

  private openRecovery(
    input:
      RecoveryOpenInput,

    now:
      number,
  ): void {
    const recoveryMode =
      this.resolveRecoveryMode(
        input,
      );

    const attempt:
      OpportunityRecoveryAttempt = {
      ...input,

      status:
        "PENDING",

      recoveryMode,

      attempts:
        1,

      observations:
        0,

      startedAt:
        now,

      lastAttemptAt:
        now,

      deadlineAt:
        now +
        OpportunityRecoveryService
          .RECOVERY_WINDOW_MS,

      recoveredAt:
        null,

      initialTimestampSkewMs:
        input
          .initialTimestampSkewMs,

      lastTimestampSkewMs:
        input
          .initialTimestampSkewMs,

      bestTimestampSkewMs:
        input
          .initialTimestampSkewMs,
    };

    this.metrics.recoveryAttempts +=
      1;

    if (
      input.triggerCode ===
      "PAIR_NOT_SYNCHRONIZED"
    ) {
      this.metrics
        .pairSyncRecoveriesStarted +=
        1;
    } else {
      this.metrics
        .staleQuoteRecoveriesStarted +=
        1;
    }

    if (
      recoveryMode ===
      "ACTIVE_COIN_DCX_DEMAND"
    ) {
      this.metrics
        .activeDemandRecoveriesStarted +=
        1;

      this.ensureCoinDCXDemand(
        attempt.market,
      );
    } else {
      /*
       * Binance and Bybit already maintain
       * persistent market streams.
       *
       * Creating another socket or forcing a
       * reconnect for one market would be
       * harmful and unnecessary.
       */
      this.metrics
        .passiveStreamRecoveriesStarted +=
        1;
    }

    this.pending.set(
      attempt.key,
      attempt,
    );
  }

  private processPending(
    now:
      number,
  ): void {
    for (
      const [
        key,
        attempt,
      ]
      of Array.from(
        this.pending.entries(),
      )
    ) {
      attempt.observations +=
        1;

      this.metrics
        .passiveObservations +=
        1;

      const buyQuote =
        marketCache.get(
          attempt.buyExchange,
          attempt.market,
        );

      const sellQuote =
        marketCache.get(
          attempt.sellExchange,
          attempt.market,
        );

      /*
       * Recovery NEVER bypasses the centralized
       * freshness/synchronization policy.
       */
      if (
        buyQuote
          ?.executable &&
        sellQuote
          ?.executable
      ) {
        const pairFreshness =
          freshnessIntegrityService
            .evaluatePair(
              buyQuote,
              sellQuote,
              now,
            );

        attempt.lastTimestampSkewMs =
          pairFreshness
            .timestampSkewMs;

        if (
          pairFreshness
            .timestampSkewMs !==
          null
        ) {
          attempt.bestTimestampSkewMs =
            attempt.bestTimestampSkewMs ===
            null
              ? pairFreshness
                  .timestampSkewMs
              : Math.min(
                  attempt
                    .bestTimestampSkewMs,

                  pairFreshness
                    .timestampSkewMs,
                );
        }

        /*
         * Success means the SAME centralized
         * integrity gate now passes.
         */
        if (
          pairFreshness
            .freshAndSynchronized
        ) {
          attempt.status =
            "RECOVERED";

          attempt.recoveredAt =
            now;

          this.metrics.recovered +=
            1;

          if (
            attempt.triggerCode ===
            "PAIR_NOT_SYNCHRONIZED"
          ) {
            this.metrics
              .recoveredPairSynchronization +=
              1;
          } else {
            this.metrics
              .recoveredStaleQuote +=
              1;
          }

          this.metrics.lastRecoveredAt =
            now;

          this.finishAttempt(
            key,
            attempt,
            now,
          );

          continue;
        }
      }

      /*
       * Keep observing naturally updating streams
       * while inside the bounded recovery window.
       */
      if (
        now <
        attempt.deadlineAt
      ) {
        continue;
      }

      const canRetry =
        attempt.attempts <
          OpportunityRecoveryService
            .MAXIMUM_ATTEMPTS &&
        now -
          attempt.lastAttemptAt >=
          OpportunityRecoveryService
            .RETRY_DELAY_MS;

      if (
        canRetry
      ) {
        attempt.attempts +=
          1;

        attempt.lastAttemptAt =
          now;

        attempt.deadlineAt =
          now +
          OpportunityRecoveryService
            .RECOVERY_WINDOW_MS;

        this.metrics.recoveryAttempts +=
          1;

        /*
         * Only CoinDCX active recovery is allowed.
         *
         * Binance / Bybit keep using their existing
         * persistent streams.
         */
        if (
          attempt.recoveryMode ===
          "ACTIVE_COIN_DCX_DEMAND"
        ) {
          this.ensureCoinDCXDemand(
            attempt.market,
          );
        }

        continue;
      }

      /*
       * Exhausted.
       *
       * No threshold widening.
       * No infinite retry.
       */
      attempt.status =
        "FAILED";

      this.metrics.failed +=
        1;

      this.metrics.lastFailedAt =
        now;

      this.finishAttempt(
        key,
        attempt,
        now,
      );
    }
  }

  private resolveRecoveryMode(
    input:
      RecoveryOpenInput,
  ): OpportunityRecoveryMode {
    /*
     * Pair synchronization:
     *
     * Request CoinDCX depth only if CoinDCX is
     * actually the older side.
     *
     * If Binance or Bybit is older, simply wait
     * for its already-running persistent stream.
     */
    if (
      input.triggerCode ===
      "PAIR_NOT_SYNCHRONIZED"
    ) {
      return input.olderExchange ===
        "coindcx"
        ? "ACTIVE_COIN_DCX_DEMAND"
        : "PASSIVE_STREAM_WAIT";
    }

    /*
     * Stale quote recovery:
     *
     * Active demand only makes sense when the
     * stale/older exchange is CoinDCX.
     */
    if (
      input.olderExchange ===
      "coindcx"
    ) {
      return "ACTIVE_COIN_DCX_DEMAND";
    }

    return "PASSIVE_STREAM_WAIT";
  }

  private resolveTimestampState(
    buyExchange:
      string,

    sellExchange:
      string,

    market:
      string,

    metadata:
      Readonly<
        Record<
          string,
          unknown
        >
      >,
  ): {
    olderSide:
      OpportunityRecoveryOlderSide;

    olderExchange:
      string | null;

    timestampSkewMs:
      number | null;
  } {
    /*
     * Prefer timestamps recorded at rejection time.
     *
     * Fallback to current cache only when the
     * rejection record does not carry them.
     */
    const metadataBuyTimestamp =
      this.readFiniteNumber(
        metadata,
        "buyTimestamp",
      );

    const metadataSellTimestamp =
      this.readFiniteNumber(
        metadata,
        "sellTimestamp",
      );

    const buyTimestamp =
      metadataBuyTimestamp ??
      marketCache.get(
        buyExchange,
        market,
      )
        ?.timestamp ??
      null;

    const sellTimestamp =
      metadataSellTimestamp ??
      marketCache.get(
        sellExchange,
        market,
      )
        ?.timestamp ??
      null;

    if (
      buyTimestamp ===
        null ||
      sellTimestamp ===
        null
    ) {
      return {
        olderSide:
          "UNKNOWN",

        olderExchange:
          null,

        timestampSkewMs:
          null,
      };
    }

    const timestampSkewMs =
      Math.abs(
        buyTimestamp -
        sellTimestamp,
      );

    if (
      buyTimestamp ===
      sellTimestamp
    ) {
      return {
        olderSide:
          "EQUAL",

        olderExchange:
          null,

        timestampSkewMs,
      };
    }

    if (
      buyTimestamp <
      sellTimestamp
    ) {
      return {
        olderSide:
          "BUY",

        olderExchange:
          buyExchange,

        timestampSkewMs,
      };
    }

    return {
      olderSide:
        "SELL",

      olderExchange:
        sellExchange,

      timestampSkewMs,
    };
  }

  private ensureCoinDCXDemand(
    market:
      string,
  ): void {
    this.metrics.demandRequests +=
      1;

    const accepted =
      this.coinDCXOrderBookAdapter
        .requestTemporarySubscription(
          market,

          OpportunityRecoveryService
            .TEMPORARY_SUBSCRIPTION_TTL_MS,
        );

    if (
      accepted
    ) {
      this.metrics.demandAccepted +=
        1;
    } else {
      this.metrics.demandRejected +=
        1;
    }
  }

  private finishAttempt(
    key:
      string,

    attempt:
      OpportunityRecoveryAttempt,

    now:
      number,
  ): void {
    this.pending.delete(
      key,
    );

    this.cooldownUntil.set(
      key,

      now +
        OpportunityRecoveryService
          .MARKET_COOLDOWN_MS,
    );

    this.recentOutcomes.unshift(
      structuredClone(
        attempt,
      ),
    );

    if (
      this.recentOutcomes.length >
      OpportunityRecoveryService
        .MAXIMUM_RECENT_OUTCOMES
    ) {
      this.recentOutcomes.length =
        OpportunityRecoveryService
          .MAXIMUM_RECENT_OUTCOMES;
    }
  }

  private isRecoverableCode(
    code:
      string,
  ): boolean {
    return (
      code ===
        "STALE_BUY_QUOTE" ||
      code ===
        "STALE_SELL_QUOTE" ||
      code ===
        "STALE_BOTH_QUOTES" ||
      code ===
        "PAIR_NOT_SYNCHRONIZED"
    );
  }

  private createKey(
    market:
      string,

    buyExchange:
      string,

    sellExchange:
      string,
  ): string {
    return (
      `${market}|` +
      `${buyExchange}|` +
      `${sellExchange}`
    );
  }

  private rememberRejectionId(
    id:
      string,
  ): void {
    this.handledRejectionIds.add(
      id,
    );

    this.handledRejectionOrder.push(
      id,
    );

    while (
      this.handledRejectionOrder.length >
      OpportunityRecoveryService
        .MAXIMUM_HANDLED_IDS
    ) {
      const oldest =
        this.handledRejectionOrder
          .shift();

      if (
        oldest
      ) {
        this.handledRejectionIds.delete(
          oldest,
        );
      }
    }
  }

  private cleanupCooldowns(
    now:
      number,
  ): void {
    for (
      const [
        key,
        until,
      ]
      of this.cooldownUntil
    ) {
      if (
        until <=
        now
      ) {
        this.cooldownUntil.delete(
          key,
        );
      }
    }
  }

  private readFiniteNumber(
    metadata:
      Readonly<
        Record<
          string,
          unknown
        >
      >,

    key:
      string,
  ): number | null {
    const value =
      metadata[
        key
      ];

    return typeof value ===
      "number" &&
      Number.isFinite(
        value,
      )
      ? value
      : null;
  }
}