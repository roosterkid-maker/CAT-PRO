import {
  sensitiveDataRedactor,
} from "../../core/security/SensitiveDataRedactor";

import {
  exchangeBalanceSynchronizationService,
  type ExchangeBalanceSynchronizationResult,
  type SupportedBalanceExchange,
} from "../../trading/account/ExchangeBalanceSynchronizationService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

const EXCHANGES = [
  {
    exchange:
      "coindcx",
    displayName:
      "CoinDCX",
  },
  {
    exchange:
      "binance",
    displayName:
      "Binance",
  },
  {
    exchange:
      "bybit",
    displayName:
      "Bybit",
  },
  {
    exchange:
      "unocoin",
    displayName:
      "UnoCoin",
  },
  {
    exchange:
      "coinswitch",
    displayName:
      "CoinSwitch",
  },
  {
    exchange:
      "zebpay",
    displayName:
      "ZebPay",
  },
] as const satisfies readonly {
  exchange:
    SupportedBalanceExchange;

  displayName: string;
}[];

const MAXIMUM_FRESH_AGE_MS =
  30_000;

const MAXIMUM_REASON_LENGTH =
  500;

export type ExchangeBalanceDashboardStatus =
  | "SYNCHRONIZED"
  | "STALE"
  | "FAILED"
  | "NOT_CONFIGURED"
  | "PENDING";

export interface ExchangeBalanceDashboardAsset {
  asset: string;

  availableBalance: number;

  lockedBalance: number;

  totalBalance: number;
}

export interface ExchangeBalanceDashboardExchange {
  exchange:
    SupportedBalanceExchange;

  displayName: string;

  status:
    ExchangeBalanceDashboardStatus;

  lastAttemptedAt:
    number | null;

  lastSynchronizedAt:
    number | null;

  balanceAgeMs:
    number | null;

  synchronizedAssetCount: number;

  positiveAssetCount: number;

  zeroAssetCount: number;

  retainedAfterFailure: boolean;

  reasons: string[];

  assets:
    ExchangeBalanceDashboardAsset[];
}

export interface ExchangeBalanceDashboardReport {
  generatedAt: number;

  synchronizationInProgress: boolean;

  maximumFreshAgeMs: number;

  totals: {
    exchanges: number;

    synchronized: number;

    stale: number;

    failed: number;

    notConfigured: number;

    pending: number;

    positiveAssets: number;
  };

  exchanges:
    ExchangeBalanceDashboardExchange[];
}

export class ExchangeBalancePortfolioService {
  getReport(
    now =
      Date.now(),
  ): ExchangeBalanceDashboardReport {
    const synchronizationReport =
      exchangeBalanceSynchronizationService
        .getLastReport();

    const exchanges =
      EXCHANGES.map(
        (definition) => {
          const result =
            synchronizationReport
              ?.results
              .find(
                (candidate) =>
                  candidate.exchange ===
                  definition.exchange,
              ) ??
            null;

          return this.buildExchangeReport(
            definition,
            result,
            synchronizationReport
              ?.completedAt ??
              null,
            now,
          );
        },
      );

    return {
      generatedAt:
        now,
      synchronizationInProgress:
        exchangeBalanceSynchronizationService
          .isSynchronizationInProgress(),
      maximumFreshAgeMs:
        MAXIMUM_FRESH_AGE_MS,
      totals: {
        exchanges:
          exchanges.length,
        synchronized:
          this.countStatus(
            exchanges,
            "SYNCHRONIZED",
          ),
        stale:
          this.countStatus(
            exchanges,
            "STALE",
          ),
        failed:
          this.countStatus(
            exchanges,
            "FAILED",
          ),
        notConfigured:
          this.countStatus(
            exchanges,
            "NOT_CONFIGURED",
          ),
        pending:
          this.countStatus(
            exchanges,
            "PENDING",
          ),
        positiveAssets:
          exchanges.reduce(
            (
              total,
              exchange,
            ) =>
              total +
              exchange
                .positiveAssetCount,
            0,
          ),
      },
      exchanges,
    };
  }

  private buildExchangeReport(
    definition:
      typeof EXCHANGES[number],
    result:
      ExchangeBalanceSynchronizationResult | null,
    lastAttemptedAt:
      number | null,
    now: number,
  ): ExchangeBalanceDashboardExchange {
    const snapshots =
      tradingAccountService
        .getExchangeBalances(
          definition.exchange,
        );

    const lastSynchronizedAt =
      snapshots.reduce<
        number | null
      >(
        (
          latest,
          snapshot,
        ) =>
          latest ===
            null
            ? snapshot.synchronizedAt
            : Math.max(
                latest,
                snapshot.synchronizedAt,
              ),
        result?.synchronizedAt ??
          null,
      );

    const balanceAgeMs =
      lastSynchronizedAt ===
        null
        ? null
        : Math.max(
            0,
            now -
              lastSynchronizedAt,
          );

    const assets =
      snapshots
        .filter(
          (snapshot) =>
            snapshot.totalBalance >
            0,
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.totalBalance -
              first.totalBalance ||
            first.asset.localeCompare(
              second.asset,
            ),
        )
        .map(
          (snapshot) => ({
            asset:
              snapshot.asset,
            availableBalance:
              snapshot.availableBalance,
            lockedBalance:
              snapshot.lockedBalance,
            totalBalance:
              snapshot.totalBalance,
          }),
        );

    return {
      exchange:
        definition.exchange,
      displayName:
        definition.displayName,
      status:
        this.resolveStatus(
          result,
          balanceAgeMs,
        ),
      lastAttemptedAt,
      lastSynchronizedAt,
      balanceAgeMs,
      synchronizedAssetCount:
        snapshots.length,
      positiveAssetCount:
        assets.length,
      zeroAssetCount:
        Math.max(
          0,
          snapshots.length -
            assets.length,
        ),
      retainedAfterFailure:
        result?.status ===
          "FAILED" &&
        snapshots.length >
          0,
      reasons:
        this.sanitizeReasons(
          result?.reasons ??
            [
              "Waiting for the first authenticated balance synchronization.",
            ],
        ),
      assets,
    };
  }

  private resolveStatus(
    result:
      ExchangeBalanceSynchronizationResult | null,
    balanceAgeMs:
      number | null,
  ): ExchangeBalanceDashboardStatus {
    if (!result) {
      return "PENDING";
    }

    if (
      result.status ===
        "NOT_CONFIGURED"
    ) {
      return "NOT_CONFIGURED";
    }

    if (
      result.status ===
        "FAILED"
    ) {
      return "FAILED";
    }

    return balanceAgeMs !==
        null &&
      balanceAgeMs <=
        MAXIMUM_FRESH_AGE_MS
      ? "SYNCHRONIZED"
      : "STALE";
  }

  private sanitizeReasons(
    reasons:
      readonly string[],
  ): string[] {
    return reasons.map(
      (reason) =>
        sensitiveDataRedactor
          .redactString(
            reason,
          )
          .slice(
            0,
            MAXIMUM_REASON_LENGTH,
          ),
    );
  }

  private countStatus(
    exchanges:
      readonly ExchangeBalanceDashboardExchange[],
    status:
      ExchangeBalanceDashboardStatus,
  ): number {
    return exchanges.filter(
      (exchange) =>
        exchange.status ===
        status,
    ).length;
  }
}

export const exchangeBalancePortfolioService =
  new ExchangeBalancePortfolioService();
