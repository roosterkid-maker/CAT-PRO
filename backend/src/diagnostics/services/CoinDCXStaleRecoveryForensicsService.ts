import type {
  CoinDCXSubscriptionAuditRecord,
  CoinDCXSubscriptionAuditReport,
} from "./CoinDCXSubscriptionAuditService";

import {
  coinDCXSubscriptionAuditService,
} from "./CoinDCXSubscriptionAuditService";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

/*
 * ============================================================
 * CAT PRO V20.9 BUILD 4C
 * COINDCX PERSISTENT STALE RECOVERY FORENSICS
 * ============================================================
 *
 * READ ONLY.
 *
 * This service does NOT:
 *
 * - reconnect CoinDCX
 * - resubscribe a market
 * - release persistent-silent quarantine
 * - change recovery thresholds
 * - change stale thresholds
 * - change execution eligibility
 * - mutate MarketCache
 * - mutate OrderBookService
 * - arm PAPER
 * - enable LIVE
 * - submit orders
 *
 * It explains why CoinDCX order-book subscriptions are being
 * classified as stale / failed / persistently silent.
 */

export type CoinDCXRecoveryFailureClass =
  | "NEVER_RECEIVED_DATA"
  | "STALE_AFTER_GENUINE_DATA"
  | "CURRENTLY_STALE_RECOVERABLE"
  | "RETRYING_INITIAL_JOIN"
  | "FAILED_INITIAL_JOIN"
  | "HEALTHY_ACTIVE"
  | "OTHER";

export interface CoinDCXRecoveryFailureDistributionItem {
  key:
    CoinDCXRecoveryFailureClass;

  count:
    number;

  percent:
    number;
}

export interface CoinDCXRecoveryAttemptDistributionItem {
  attempts:
    string;

  count:
    number;

  percent:
    number;
}

export interface CoinDCXPersistentSilentMarketDiagnostic {
  market:
    string;

  state:
    string;

  firstDataAt:
    number | null;

  lastDataAt:
    number | null;

  ageSinceLastDataMs:
    number | null;

  retryCount:
    number;

  staleRecoveryAttempts:
    number;

  totalStaleRecoveries:
    number;

  lastStaleRecoveryAt:
    number | null;

  snapshotCount:
    number;

  updateCount:
    number;

  cachedTickerPresent:
    boolean;

  executableQuotePresent:
    boolean;

  orderBookPresent:
    boolean;

  sharedWithBinance:
    boolean;

  sharedWithBybit:
    boolean;

  sharedWithAnyExternalExchange:
    boolean;
}

export interface CoinDCXStaleAgeBucket {
  key:
    | "LT_30_SECONDS"
    | "30_TO_59_SECONDS"
    | "1_TO_4_MINUTES"
    | "5_TO_14_MINUTES"
    | "15_TO_59_MINUTES"
    | "GE_60_MINUTES"
    | "NO_LAST_DATA";

  count:
    number;

  percent:
    number;
}

export interface CoinDCXStaleRecoveryForensicsReport {
  generatedAt:
    number;

  version:
    "20.9";

  build:
    "4C";

  mode:
    "DIAGNOSTIC_ONLY";

  mutationAllowed:
    false;

  liveExecutionAllowed:
    false;

  summary: {
    auditedSubscriptions:
      number;

    active:
      number;

    retrying:
      number;

    failed:
      number;

    stale:
      number;

    persistentlySilent:
      number;

    neverReceivedData:
      number;

    receivedData:
      number;

    totalRetries:
      number;

    totalStaleRecoveries:
      number;

    persistentSilentPercent:
      number;

    persistentSilentWithPriorData:
      number;

    persistentSilentNeverReceivedData:
      number;

    failedInitialSubscriptions:
      number;

    currentCoinDCXQuotes:
      number;

    currentCoinDCXExecutableQuotes:
      number;

    currentCoinDCXOrderBooks:
      number;

    persistentSilentSharedWithBinance:
      number;

    persistentSilentSharedWithBybit:
      number;

    persistentSilentSharedWithAnyExternalExchange:
      number;

    persistentSilentWithCachedTicker:
      number;

    persistentSilentWithExecutableQuote:
      number;

    persistentSilentWithOrderBook:
      number;

    averageTotalStaleRecoveriesPerPersistentSilentMarket:
      number | null;

    maximumTotalStaleRecoveriesOnPersistentSilentMarket:
      number | null;
  };

  failureClasses:
    CoinDCXRecoveryFailureDistributionItem[];

  recoveryAttemptDistribution:
    CoinDCXRecoveryAttemptDistributionItem[];

  persistentSilentAgeBuckets:
    CoinDCXStaleAgeBucket[];

  persistentSilentMarkets:
    CoinDCXPersistentSilentMarketDiagnostic[];

  observations:
    string[];
}

export class CoinDCXStaleRecoveryForensicsService {
  generate(
    now =
      Date.now(),

    marketLimit =
      100,
  ): CoinDCXStaleRecoveryForensicsReport {
    const audit =
      coinDCXSubscriptionAuditService
        .getReport(
          now,
        );

    const coinDCXQuotes =
      marketCache
        .getByExchange(
          "coindcx",
        );

    const executableCoinDCXQuotes =
      marketCache
        .getExecutableByExchange(
          "coindcx",
        );

    const coinDCXQuoteMarkets =
      this.createMarketSet(
        coinDCXQuotes.map(
          (quote) =>
            quote.market,
        ),
      );

    const executableCoinDCXMarkets =
      this.createMarketSet(
        executableCoinDCXQuotes.map(
          (quote) =>
            quote.market,
        ),
      );

    const binanceMarkets =
      this.createMarketSet(
        marketCache
          .getExecutableByExchange(
            "binance",
          )
          .map(
            (quote) =>
              quote.market,
          ),
      );

    const bybitMarkets =
      this.createMarketSet(
        marketCache
          .getExecutableByExchange(
            "bybit",
          )
          .map(
            (quote) =>
              quote.market,
          ),
      );

    const persistentSilentRecords =
      audit.records.filter(
        (record) =>
          record.state ===
          "PERSISTENTLY_SILENT",
      );

    const diagnostics =
      persistentSilentRecords
        .map(
          (record) =>
            this.buildPersistentSilentDiagnostic(
              record,
              coinDCXQuoteMarkets,
              executableCoinDCXMarkets,
              binanceMarkets,
              bybitMarkets,
            ),
        )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              second
                .totalStaleRecoveries !==
              first
                .totalStaleRecoveries
            ) {
              return (
                second
                  .totalStaleRecoveries -
                first
                  .totalStaleRecoveries
              );
            }

            return (
              (
                second
                  .ageSinceLastDataMs ??
                -1
              ) -
              (
                first
                  .ageSinceLastDataMs ??
                -1
              )
            );
          },
        );

    const persistentSilentRecoveryCounts =
      persistentSilentRecords
        .map(
          (record) =>
            record
              .totalStaleRecoveries,
        );

    const persistentSilentSharedWithBinance =
      diagnostics.filter(
        (record) =>
          record.sharedWithBinance,
      ).length;

    const persistentSilentSharedWithBybit =
      diagnostics.filter(
        (record) =>
          record.sharedWithBybit,
      ).length;

    const persistentSilentSharedWithAnyExternalExchange =
      diagnostics.filter(
        (record) =>
          record
            .sharedWithAnyExternalExchange,
      ).length;

    const persistentSilentWithPriorData =
      persistentSilentRecords.filter(
        (record) =>
          record.firstDataAt !==
          null,
      ).length;

    const persistentSilentNeverReceivedData =
      persistentSilentRecords.length -
      persistentSilentWithPriorData;

    const failedInitialSubscriptions =
      audit.records.filter(
        (record) =>
          record.state ===
            "FAILED" &&
          record.firstDataAt ===
            null,
      ).length;

    const currentCoinDCXOrderBooks =
      coinDCXQuotes.filter(
        (quote) =>
          orderBookService.has(
            "coindcx",
            quote.market,
          ),
      ).length;

    const summary =
      audit.summary;

    const persistentSilentPercent =
      summary.requested +
        summary.persistentlySilent >
      0
        ? this.round(
            (
              summary.persistentlySilent /
              (
                summary.requested +
                summary.persistentlySilent
              )
            ) *
              100,
            4,
          )
        : 0;

    const report:
      CoinDCXStaleRecoveryForensicsReport = {
      generatedAt:
        now,

      version:
        "20.9",

      build:
        "4C",

      mode:
        "DIAGNOSTIC_ONLY",

      mutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      summary: {
        auditedSubscriptions:
          audit.records.length,

        active:
          summary.active,

        retrying:
          summary.retrying,

        failed:
          summary.failed,

        stale:
          summary.stale,

        persistentlySilent:
          summary.persistentlySilent,

        neverReceivedData:
          summary.neverReceivedData,

        receivedData:
          summary.receivedData,

        totalRetries:
          summary.totalRetries,

        totalStaleRecoveries:
          summary.totalStaleRecoveries,

        persistentSilentPercent,

        persistentSilentWithPriorData,

        persistentSilentNeverReceivedData,

        failedInitialSubscriptions,

        currentCoinDCXQuotes:
          coinDCXQuotes.length,

        currentCoinDCXExecutableQuotes:
          executableCoinDCXQuotes.length,

        currentCoinDCXOrderBooks,

        persistentSilentSharedWithBinance,

        persistentSilentSharedWithBybit,

        persistentSilentSharedWithAnyExternalExchange,

        persistentSilentWithCachedTicker:
          diagnostics.filter(
            (record) =>
              record
                .cachedTickerPresent,
          ).length,

        persistentSilentWithExecutableQuote:
          diagnostics.filter(
            (record) =>
              record
                .executableQuotePresent,
          ).length,

        persistentSilentWithOrderBook:
          diagnostics.filter(
            (record) =>
              record
                .orderBookPresent,
          ).length,

        averageTotalStaleRecoveriesPerPersistentSilentMarket:
          this.averageOrNull(
            persistentSilentRecoveryCounts,
          ),

        maximumTotalStaleRecoveriesOnPersistentSilentMarket:
          this.maximumOrNull(
            persistentSilentRecoveryCounts,
          ),
      },

      failureClasses:
        this.buildFailureClassDistribution(
          audit,
        ),

      recoveryAttemptDistribution:
        this.buildRecoveryAttemptDistribution(
          audit.records,
        ),

      persistentSilentAgeBuckets:
        this.buildPersistentSilentAgeBuckets(
          persistentSilentRecords,
        ),

      persistentSilentMarkets:
        diagnostics.slice(
          0,
          this.normalizeLimit(
            marketLimit,
          ),
        ),

      observations:
        [],
    };

    report.observations =
      this.buildObservations(
        report,
      );

    return report;
  }

  private buildPersistentSilentDiagnostic(
    record:
      CoinDCXSubscriptionAuditRecord,

    coinDCXQuoteMarkets:
      Set<string>,

    executableCoinDCXMarkets:
      Set<string>,

    binanceMarkets:
      Set<string>,

    bybitMarkets:
      Set<string>,
  ): CoinDCXPersistentSilentMarketDiagnostic {
    const market =
      this.normalizeMarket(
        record.market,
      );

    const sharedWithBinance =
      binanceMarkets.has(
        market,
      );

    const sharedWithBybit =
      bybitMarkets.has(
        market,
      );

    return {
      market,

      state:
        record.state,

      firstDataAt:
        record.firstDataAt,

      lastDataAt:
        record.lastDataAt,

      ageSinceLastDataMs:
        record.ageSinceLastDataMs,

      retryCount:
        record.retryCount,

      staleRecoveryAttempts:
        record.staleRecoveryAttempts,

      totalStaleRecoveries:
        record.totalStaleRecoveries,

      lastStaleRecoveryAt:
        record.lastStaleRecoveryAt,

      snapshotCount:
        record.snapshotCount,

      updateCount:
        record.updateCount,

      cachedTickerPresent:
        coinDCXQuoteMarkets.has(
          market,
        ),

      executableQuotePresent:
        executableCoinDCXMarkets.has(
          market,
        ),

      orderBookPresent:
        orderBookService.has(
          "coindcx",
          market,
        ),

      sharedWithBinance,

      sharedWithBybit,

      sharedWithAnyExternalExchange:
        sharedWithBinance ||
        sharedWithBybit,
    };
  }

  private buildFailureClassDistribution(
    audit:
      CoinDCXSubscriptionAuditReport,
  ): CoinDCXRecoveryFailureDistributionItem[] {
    const values =
      audit.records.map(
        (record) =>
          this.classifyRecord(
            record,
          ),
      );

    const counts =
      new Map<
        CoinDCXRecoveryFailureClass,
        number
      >();

    for (const value of values) {
      counts.set(
        value,
        (
          counts.get(
            value,
          ) ??
          0
        ) +
          1,
      );
    }

    return Array.from(
      counts.entries(),
    )
      .map(
        (
          [
            key,
            count,
          ],
        ): CoinDCXRecoveryFailureDistributionItem => ({
          key,

          count,

          percent:
            values.length >
              0
              ? this.round(
                  (
                    count /
                    values.length
                  ) *
                    100,
                  4,
                )
              : 0,
        }),
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.count -
          first.count,
      );
  }

  private classifyRecord(
    record:
      CoinDCXSubscriptionAuditRecord,
  ): CoinDCXRecoveryFailureClass {
    if (
      record.state ===
        "ACTIVE"
    ) {
      return "HEALTHY_ACTIVE";
    }

    if (
      record.state ===
        "PERSISTENTLY_SILENT" &&
      record.firstDataAt !==
        null
    ) {
      return "STALE_AFTER_GENUINE_DATA";
    }

    if (
      record.state ===
        "PERSISTENTLY_SILENT" &&
      record.firstDataAt ===
        null
    ) {
      return "NEVER_RECEIVED_DATA";
    }

    if (
      record.state ===
        "STALE" &&
      record.firstDataAt !==
        null
    ) {
      return "CURRENTLY_STALE_RECOVERABLE";
    }

    if (
      record.state ===
        "RETRYING" &&
      record.firstDataAt ===
        null
    ) {
      return "RETRYING_INITIAL_JOIN";
    }

    if (
      record.state ===
        "FAILED" &&
      record.firstDataAt ===
        null
    ) {
      return "FAILED_INITIAL_JOIN";
    }

    if (
      record.firstDataAt ===
        null
    ) {
      return "NEVER_RECEIVED_DATA";
    }

    return "OTHER";
  }

  private buildRecoveryAttemptDistribution(
    records:
      readonly CoinDCXSubscriptionAuditRecord[],
  ): CoinDCXRecoveryAttemptDistributionItem[] {
    const labels = [
      "0",
      "1",
      "2",
      "3_TO_4",
      "GE_5",
    ];

    const counts =
      new Map<
        string,
        number
      >(
        labels.map(
          (label) => [
            label,
            0,
          ],
        ),
      );

    for (const record of records) {
      const attempts =
        record.totalStaleRecoveries;

      const key =
        attempts ===
          0
          ? "0"
          : attempts ===
              1
            ? "1"
            : attempts ===
                2
              ? "2"
              : attempts <=
                  4
                ? "3_TO_4"
                : "GE_5";

      counts.set(
        key,
        (
          counts.get(
            key,
          ) ??
          0
        ) +
          1,
      );
    }

    return labels.map(
      (
        attempts,
      ): CoinDCXRecoveryAttemptDistributionItem => {
        const count =
          counts.get(
            attempts,
          ) ??
          0;

        return {
          attempts,

          count,

          percent:
            records.length >
              0
              ? this.round(
                  (
                    count /
                    records.length
                  ) *
                    100,
                  4,
                )
              : 0,
        };
      },
    );
  }

  private buildPersistentSilentAgeBuckets(
    records:
      readonly CoinDCXSubscriptionAuditRecord[],
  ): CoinDCXStaleAgeBucket[] {
    const order:
      CoinDCXStaleAgeBucket["key"][] = [
      "LT_30_SECONDS",
      "30_TO_59_SECONDS",
      "1_TO_4_MINUTES",
      "5_TO_14_MINUTES",
      "15_TO_59_MINUTES",
      "GE_60_MINUTES",
      "NO_LAST_DATA",
    ];

    const counts =
      new Map<
        CoinDCXStaleAgeBucket["key"],
        number
      >(
        order.map(
          (key) => [
            key,
            0,
          ],
        ),
      );

    for (const record of records) {
      const age =
        record.ageSinceLastDataMs;

      const key:
        CoinDCXStaleAgeBucket["key"] =
        age ===
          null
          ? "NO_LAST_DATA"
          : age <
              30_000
            ? "LT_30_SECONDS"
            : age <
                60_000
              ? "30_TO_59_SECONDS"
              : age <
                  5 *
                    60_000
                ? "1_TO_4_MINUTES"
                : age <
                    15 *
                      60_000
                  ? "5_TO_14_MINUTES"
                  : age <
                      60 *
                        60_000
                    ? "15_TO_59_MINUTES"
                    : "GE_60_MINUTES";

      counts.set(
        key,
        (
          counts.get(
            key,
          ) ??
          0
        ) +
          1,
      );
    }

    return order.map(
      (
        key,
      ): CoinDCXStaleAgeBucket => {
        const count =
          counts.get(
            key,
          ) ??
          0;

        return {
          key,

          count,

          percent:
            records.length >
              0
              ? this.round(
                  (
                    count /
                    records.length
                  ) *
                    100,
                  4,
                )
              : 0,
        };
      },
    );
  }

  private buildObservations(
    report:
      CoinDCXStaleRecoveryForensicsReport,
  ): string[] {
    const summary =
      report.summary;

    const observations:
      string[] = [
      "V20.9 Build 4C is read-only CoinDCX stale-recovery forensics; it does not reconnect, resubscribe, release quarantine, widen freshness, or change execution policy.",

      "PERSISTENTLY_SILENT means the existing CoinDCX subscription audit has exhausted its configured stale-recovery path; this diagnostic does not override that decision.",
    ];

    if (
      summary.persistentlySilent >
        0
    ) {
      observations.push(
        `${summary.persistentlySilent} audited CoinDCX market(s) are persistently silent (${summary.persistentSilentPercent}% of audited subscription evidence).`,
      );
    }

    if (
      summary.persistentSilentWithPriorData >
        0
    ) {
      observations.push(
        `${summary.persistentSilentWithPriorData} persistent-silent market(s) previously received genuine CoinDCX depth data before becoming silent; these are stale-after-data failures rather than initial subscription failures.`,
      );
    }

    if (
      summary
        .persistentSilentNeverReceivedData >
        0
    ) {
      observations.push(
        `${summary.persistentSilentNeverReceivedData} persistent-silent market(s) never recorded genuine depth data.`,
      );
    }

    if (
      summary.failedInitialSubscriptions >
        0
    ) {
      observations.push(
        `${summary.failedInitialSubscriptions} subscription(s) exhausted initial join/retry evidence without ever receiving depth data.`,
      );
    }

    if (
      summary
        .persistentSilentSharedWithAnyExternalExchange >
        0
    ) {
      observations.push(
        `${summary.persistentSilentSharedWithAnyExternalExchange} persistent-silent CoinDCX market(s) are currently shared with executable Binance and/or Bybit markets, so their loss directly reduces cross-exchange pairability.`,
      );
    }

    if (
      summary
        .persistentSilentWithExecutableQuote >
        0 ||
      summary
        .persistentSilentWithOrderBook >
        0
    ) {
      observations.push(
        `Warning: ${summary.persistentSilentWithExecutableQuote} persistent-silent market(s) still have executable CoinDCX quote evidence and ${summary.persistentSilentWithOrderBook} still have order-book evidence. These should be inspected for invalidation/reconciliation inconsistency.`,
      );
    }

    if (
      summary.persistentlySilent >
        0 &&
      summary
        .averageTotalStaleRecoveriesPerPersistentSilentMarket !==
        null
    ) {
      observations.push(
        `Persistent-silent markets averaged ${summary.averageTotalStaleRecoveriesPerPersistentSilentMarket} stale recovery attempt(s), with a maximum observed total of ${summary.maximumTotalStaleRecoveriesOnPersistentSilentMarket}.`,
      );
    }

    if (
      summary
        .persistentSilentWithPriorData ===
        summary.persistentlySilent &&
      summary.persistentlySilent >
        0
    ) {
      observations.push(
        "All current persistent-silent markets had previously delivered genuine depth data. This points more strongly toward subscription longevity/update-silence behavior than market-symbol discovery failure.",
      );
    }

    return observations;
  }

  private createMarketSet(
    markets:
      readonly string[],
  ): Set<string> {
    return new Set(
      markets.map(
        (market) =>
          this.normalizeMarket(
            market,
          ),
      ),
    );
  }

  private normalizeMarket(
    market:
      string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }

  private normalizeLimit(
    value:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 100;
    }

    return Math.min(
      500,
      Math.max(
        1,
        Math.floor(
          value,
        ),
      ),
    );
  }

  private averageOrNull(
    values:
      readonly number[],
  ): number | null {
    if (
      values.length ===
      0
    ) {
      return null;
    }

    const total =
      values.reduce(
        (
          sum,
          value,
        ) =>
          sum +
          value,
        0,
      );

    return this.round(
      total /
        values.length,
      4,
    );
  }

  private maximumOrNull(
    values:
      readonly number[],
  ): number | null {
    if (
      values.length ===
      0
    ) {
      return null;
    }

    return Math.max(
      ...values,
    );
  }

  private round(
    value:
      number,

    decimals:
      number,
  ): number {
    const factor =
      10 **
      decimals;

    return Math.round(
      value *
        factor,
    ) /
      factor;
  }
}

export const coinDCXStaleRecoveryForensicsService =
  new CoinDCXStaleRecoveryForensicsService();