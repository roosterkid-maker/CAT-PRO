import {
  binanceAccountApi,
} from "../../exchanges/binance/api/BinanceAccountApi";

import {
  binanceCredentialsProvider,
} from "../../exchanges/binance/api/BinanceCredentialsProvider";

import {
  bybitAccountApi,
} from "../../exchanges/bybit/api/BybitAccountApi";

import {
  bybitCredentialsProvider,
} from "../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  coinDCXAccountApi,
} from "../../exchanges/coindcx/api/CoinDCXAccountApi";

import {
  coinDCXCredentialsProvider,
} from "../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import {
  coinSwitchAccountApi,
} from "../../exchanges/coinswitch/api/CoinSwitchAccountApi";

import {
  coinSwitchCredentialsProvider,
} from "../../exchanges/coinswitch/api/CoinSwitchCredentialsProvider";

import {
  unoCoinAccountApi,
} from "../../exchanges/unocoin/api/UnoCoinAccountApi";

import {
  unoCoinCredentialsProvider,
} from "../../exchanges/unocoin/api/UnoCoinCredentialsProvider";

import {
  executionAdapterVerificationService,
} from "../../execution/live/verification/ExecutionAdapterVerificationService";

import {
  tradingAccountService,
  type ExchangeBalanceSnapshot,
} from "./TradingAccountService";

export type SupportedBalanceExchange =
  | "binance"
  | "bybit"
  | "coindcx"
  | "coinswitch"
  | "unocoin";

export type ExchangeBalanceSynchronizationStatus =
  | "SYNCHRONIZED"
  | "NOT_CONFIGURED"
  | "FAILED";

export interface ExchangeBalanceSynchronizationResult {
  exchange: SupportedBalanceExchange;

  status:
    ExchangeBalanceSynchronizationStatus;

  synchronizedAt: number | null;

  synchronizedBalances: number;

  reasons: string[];
}

export interface ExchangeBalanceSynchronizationReport {
  startedAt: number;

  completedAt: number;

  successfulExchanges: number;

  failedExchanges: number;

  skippedExchanges: number;

  totalSynchronizedBalances: number;

  results:
    ExchangeBalanceSynchronizationResult[];
}

export class ExchangeBalanceSynchronizationService {
  private synchronizationPromise:
    Promise<ExchangeBalanceSynchronizationReport> | null =
    null;

  private lastReport:
    ExchangeBalanceSynchronizationReport | null =
    null;

  synchronizeAll():
    Promise<ExchangeBalanceSynchronizationReport> {
    if (
      this.synchronizationPromise
    ) {
      return this.synchronizationPromise;
    }

    this.synchronizationPromise =
      this.performSynchronization()
        .finally(() => {
          this.synchronizationPromise =
            null;
        });

    return this.synchronizationPromise;
  }

  async synchronizeExchange(
    exchange:
      SupportedBalanceExchange,
  ): Promise<ExchangeBalanceSynchronizationResult> {
    switch (exchange) {
      case "binance":
        return this.synchronizeBinance();

      case "coindcx":
        return this.synchronizeCoinDCX();

      case "bybit":
        return this.synchronizeBybit();

      case "coinswitch":
        return this.synchronizeCoinSwitch();

      case "unocoin":
        return this.synchronizeUnoCoin();

      default:
        return this.assertNever(
          exchange,
        );
    }
  }

  isSynchronizationInProgress():
    boolean {
    return (
      this.synchronizationPromise !==
      null
    );
  }

  getLastReport():
    ExchangeBalanceSynchronizationReport | null {
    return this.lastReport
      ? structuredClone(
          this.lastReport,
        )
      : null;
  }

  private async performSynchronization():
    Promise<ExchangeBalanceSynchronizationReport> {
    const startedAt =
      Date.now();

    const results =
      await Promise.all([
        this.synchronizeBinance(),
        this.synchronizeBybit(),
        this.synchronizeCoinDCX(),
        this.synchronizeCoinSwitch(),
        this.synchronizeUnoCoin(),
      ]);

    const completedAt =
      Date.now();

    const report:
      ExchangeBalanceSynchronizationReport = {
      startedAt,

      completedAt,

      successfulExchanges:
        results.filter(
          (result) =>
            result.status ===
            "SYNCHRONIZED",
        ).length,

      failedExchanges:
        results.filter(
          (result) =>
            result.status ===
            "FAILED",
        ).length,

      skippedExchanges:
        results.filter(
          (result) =>
            result.status ===
            "NOT_CONFIGURED",
        ).length,

      totalSynchronizedBalances:
        results.reduce(
          (
            total,
            result,
          ) =>
            total +
            result.synchronizedBalances,
          0,
        ),

      results,
    };

    this.lastReport =
      structuredClone(
        report,
      );

    return report;
  }

  private async synchronizeBinance():
    Promise<ExchangeBalanceSynchronizationResult> {
    const exchange:
      SupportedBalanceExchange =
      "binance";

    if (
      !binanceCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      tradingAccountService
        .removeExchangeBalances(
          exchange,
        );

      return {
        exchange,

        status:
          "NOT_CONFIGURED",

        synchronizedAt:
          null,

        synchronizedBalances:
          0,

        reasons: [
          "Binance API credentials are not configured.",
        ],
      };
    }

    try {
      const credentials =
        binanceCredentialsProvider
          .getCredentials();

      const balances =
        await binanceAccountApi
          .getBalances(
            credentials,
          );

      const synchronizedAt =
        Date.now();

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "SIGNED_BALANCE_READ",
          synchronizedAt,
        );

      const snapshots:
        ExchangeBalanceSnapshot[] =
        balances.map(
          (balance) => ({
            exchange,

            asset:
              balance.asset,

            availableBalance:
              balance.availableBalance,

            lockedBalance:
              balance.lockedBalance,

            totalBalance:
              balance.totalBalance,

            synchronizedAt,
          }),
        );

      this.replaceExchangeBalances(
        exchange,
        snapshots,
      );

      return {
        exchange,

        status:
          "SYNCHRONIZED",

        synchronizedAt,

        synchronizedBalances:
          snapshots.length,

        reasons: [
          `Synchronized ${snapshots.length} Binance balances.`,
        ],
      };
    } catch (
      error: unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "SIGNED_BALANCE_READ",
          error,
        );

      return {
        exchange,

        status:
          "FAILED",

        synchronizedAt:
          null,

        synchronizedBalances:
          0,

        reasons: [
          this.getErrorMessage(
            error,
            "Binance balance synchronization failed.",
          ),
        ],
      };
    }
  }

  private async synchronizeCoinDCX():
    Promise<ExchangeBalanceSynchronizationResult> {
    const exchange:
      SupportedBalanceExchange =
      "coindcx";

    if (
      !coinDCXCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      tradingAccountService
        .removeExchangeBalances(
          exchange,
        );

      return {
        exchange,

        status:
          "NOT_CONFIGURED",

        synchronizedAt:
          null,

        synchronizedBalances:
          0,

        reasons: [
          "CoinDCX API credentials are not configured.",
        ],
      };
    }

    try {
      const credentials =
        coinDCXCredentialsProvider
          .getCredentials();

      const balances =
        await coinDCXAccountApi
          .getBalances(
            credentials,
          );

      const synchronizedAt =
        Date.now();

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "SIGNED_BALANCE_READ",
          synchronizedAt,
        );

      const snapshots:
        ExchangeBalanceSnapshot[] =
        balances.map(
          (balance) => ({
            exchange,

            asset:
              balance.currency,

            availableBalance:
              balance.availableBalance,

            lockedBalance:
              balance.lockedBalance,

            totalBalance:
              balance.totalBalance,

            synchronizedAt,
          }),
        );

      this.replaceExchangeBalances(
        exchange,
        snapshots,
      );

      return {
        exchange,

        status:
          "SYNCHRONIZED",

        synchronizedAt,

        synchronizedBalances:
          snapshots.length,

        reasons: [
          `Synchronized ${snapshots.length} CoinDCX balances.`,
        ],
      };
    } catch (
      error: unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "SIGNED_BALANCE_READ",
          error,
        );

      return {
        exchange,

        status:
          "FAILED",

        synchronizedAt:
          null,

        synchronizedBalances:
          0,

        reasons: [
          this.getErrorMessage(
            error,
            "CoinDCX balance synchronization failed.",
          ),
        ],
      };
    }
  }

  private async synchronizeBybit():
    Promise<ExchangeBalanceSynchronizationResult> {
    const exchange:
      SupportedBalanceExchange =
      "bybit";

    if (
      !bybitCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      tradingAccountService
        .removeExchangeBalances(
          exchange,
        );

      return {
        exchange,

        status:
          "NOT_CONFIGURED",

        synchronizedAt:
          null,

        synchronizedBalances:
          0,

        reasons: [
          "Bybit API credentials are not configured.",
        ],
      };
    }

    try {
      const credentials =
        bybitCredentialsProvider
          .getCredentials();

      const walletBalances =
        await bybitAccountApi
          .getUnifiedWalletBalances(
            credentials,
          );

      const transferableBalances =
        await bybitAccountApi
          .getUnifiedTransferableBalances(
            walletBalances.map(
              (
                balance,
              ) =>
                balance.coin,
            ),
            credentials,
          );

      const synchronizedAt =
        Date.now();

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "SIGNED_BALANCE_READ",
          synchronizedAt,
        );

      const snapshots:
        ExchangeBalanceSnapshot[] =
        walletBalances.map(
          (
            balance,
          ) => {
            const availableBalance =
              transferableBalances.get(
                balance.coin,
              );

            if (
              availableBalance ===
                undefined
            ) {
              throw new Error(
                `Bybit transferable balance is missing for ${balance.coin}.`,
              );
            }

            const ownedBalance =
              Math.max(
                0,
                balance.walletBalance -
                  balance.spotBorrow,
              );

            const boundedAvailable =
              Math.min(
                ownedBalance,
                availableBalance,
              );

            const lockedBalance =
              Math.max(
                0,
                ownedBalance -
                  boundedAvailable,
              );

            return {
              exchange,
              asset:
                balance.coin,
              availableBalance:
                boundedAvailable,
              lockedBalance,
              totalBalance:
                boundedAvailable +
                lockedBalance,
              synchronizedAt,
            };
          },
        );

      this.replaceExchangeBalances(
        exchange,
        snapshots,
      );

      return {
        exchange,

        status:
          "SYNCHRONIZED",

        synchronizedAt,

        synchronizedBalances:
          snapshots.length,

        reasons: [
          `Synchronized ${snapshots.length} Bybit transferable UNIFIED balances.`,
        ],
      };
    } catch (
      error: unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "SIGNED_BALANCE_READ",
          error,
        );

      return {
        exchange,

        status:
          "FAILED",

        synchronizedAt:
          null,

        synchronizedBalances:
          0,

        reasons: [
          this.getErrorMessage(
            error,
            "Bybit authenticated wallet verification failed.",
          ),
        ],
      };
    }
  }

  private async synchronizeCoinSwitch():
    Promise<ExchangeBalanceSynchronizationResult> {
    const exchange:
      SupportedBalanceExchange =
      "coinswitch";

    if (
      !coinSwitchCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      tradingAccountService
        .removeExchangeBalances(
          exchange,
        );

      return {
        exchange,
        status:
          "NOT_CONFIGURED",
        synchronizedAt:
          null,
        synchronizedBalances:
          0,
        reasons: [
          "CoinSwitch API credentials are not configured.",
        ],
      };
    }

    try {
      const credentials =
        coinSwitchCredentialsProvider
          .getCredentials();

      const balances =
        await coinSwitchAccountApi
          .getBalances(
            credentials,
          );

      const synchronizedAt =
        Date.now();

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "SIGNED_BALANCE_READ",
          synchronizedAt,
        );

      const snapshots:
        ExchangeBalanceSnapshot[] =
        balances.map(
          (balance) => ({
            exchange,
            asset:
              balance.asset,
            availableBalance:
              balance.availableBalance,
            lockedBalance:
              balance.lockedBalance,
            totalBalance:
              balance.totalBalance,
            synchronizedAt,
          }),
        );

      this.replaceExchangeBalances(
        exchange,
        snapshots,
      );

      return {
        exchange,
        status:
          "SYNCHRONIZED",
        synchronizedAt,
        synchronizedBalances:
          snapshots.length,
        reasons: [
          `Synchronized ${snapshots.length} CoinSwitch Spot portfolio balances.`,
        ],
      };
    } catch (
      error: unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "SIGNED_BALANCE_READ",
          error,
        );

      return {
        exchange,
        status:
          "FAILED",
        synchronizedAt:
          null,
        synchronizedBalances:
          0,
        reasons: [
          this.getErrorMessage(
            error,
            "CoinSwitch portfolio balance synchronization failed.",
          ),
        ],
      };
    }
  }

  private async synchronizeUnoCoin():
    Promise<ExchangeBalanceSynchronizationResult> {
    const exchange:
      SupportedBalanceExchange =
      "unocoin";

    if (
      !unoCoinCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      tradingAccountService
        .removeExchangeBalances(
          exchange,
        );

      return {
        exchange,
        status:
          "NOT_CONFIGURED",
        synchronizedAt:
          null,
        synchronizedBalances:
          0,
        reasons: [
          "UnoCoin API token is not configured.",
        ],
      };
    }

    try {
      const credentials =
        unoCoinCredentialsProvider
          .getCredentials();

      const balances =
        await unoCoinAccountApi
          .getBalances(
            credentials,
          );

      const synchronizedAt =
        Date.now();

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "TOKEN_BALANCE_READ",
          synchronizedAt,
        );

      const snapshots:
        ExchangeBalanceSnapshot[] =
        balances.map(
          (balance) => ({
            exchange,
            asset:
              balance.asset,
            availableBalance:
              balance.availableBalance,
            lockedBalance:
              balance.lockedBalance,
            totalBalance:
              balance.totalBalance,
            synchronizedAt,
          }),
        );

      this.replaceExchangeBalances(
        exchange,
        snapshots,
      );

      return {
        exchange,
        status:
          "SYNCHRONIZED",
        synchronizedAt,
        synchronizedBalances:
          snapshots.length,
        reasons: [
          `Synchronized ${snapshots.length} UnoCoin wallet balances.`,
        ],
      };
    } catch (
      error: unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "TOKEN_BALANCE_READ",
          error,
        );

      return {
        exchange,
        status:
          "FAILED",
        synchronizedAt:
          null,
        synchronizedBalances:
          0,
        reasons: [
          this.getErrorMessage(
            error,
            "UnoCoin wallet balance synchronization failed.",
          ),
        ],
      };
    }
  }

  private replaceExchangeBalances(
    exchange:
      SupportedBalanceExchange,

    snapshots:
      readonly ExchangeBalanceSnapshot[],
  ): void {
    /*
     * Only replace the previous snapshot after
     * the complete remote response has been
     * fetched and normalized successfully.
     *
     * This prevents a failed API call from
     * partially corrupting the local balance
     * state.
     */
    tradingAccountService
      .removeExchangeBalances(
        exchange,
      );

    tradingAccountService
      .updateExchangeBalances(
        snapshots,
      );
  }

  private getErrorMessage(
    error: unknown,
    fallback: string,
  ): string {
    if (
      error instanceof Error &&
      error.message.trim()
    ) {
      return error.message;
    }

    return fallback;
  }

  private assertNever(
    value: never,
  ): never {
    throw new Error(
      `Unsupported balance exchange: ${String(
        value,
      )}`,
    );
  }
}

export const exchangeBalanceSynchronizationService =
  new ExchangeBalanceSynchronizationService();
