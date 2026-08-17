import {
  coinDCXAccountApi,
} from "../../../exchanges/coindcx/api/CoinDCXAccountApi";

import {
  coinDCXCredentialsProvider,
} from "../../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

import {
  binanceAccountApi,
} from "../../../exchanges/binance/api/BinanceAccountApi";

import {
  binanceCredentialsProvider,
} from "../../../exchanges/binance/api/BinanceCredentialsProvider";

import {
  bybitAccountApi,
} from "../../../exchanges/bybit/api/BybitAccountApi";

import {
  bybitCredentialsProvider,
} from "../../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  executionAdapterVerificationService,
} from "./ExecutionAdapterVerificationService";

export interface CoreExchangeAuthenticatedReadVerificationOptions {
  scheduleTimers?: boolean;

  refreshIntervalMs?: number;
}

const DEFAULT_REFRESH_INTERVAL_MS =
  20_000;

type CoreExchange =
  | "coindcx"
  | "binance"
  | "bybit";

export class CoreExchangeAuthenticatedReadVerificationService {
  private readonly scheduleTimers:
    boolean;

  private readonly refreshIntervalMs:
    number;

  private refreshTimer:
    NodeJS.Timeout | null =
    null;

  private verificationPromise:
    Promise<void> | null =
    null;

  constructor(
    options:
      CoreExchangeAuthenticatedReadVerificationOptions = {},
  ) {
    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.refreshIntervalMs =
      options.refreshIntervalMs ??
      DEFAULT_REFRESH_INTERVAL_MS;

    if (
      !Number.isSafeInteger(
        this.refreshIntervalMs,
      ) ||
      this.refreshIntervalMs <
        5_000
    ) {
      throw new Error(
        "Core exchange authenticated-read refresh interval must be an integer of at least 5000 ms.",
      );
    }
  }

  async verify():
    Promise<void> {
    if (
      this.verificationPromise
    ) {
      await this.verificationPromise;

      return;
    }

    const verificationPromise =
      this.verifyAll();

    this.verificationPromise =
      verificationPromise;

    try {
      await verificationPromise;
    } finally {
      if (
        this.verificationPromise ===
        verificationPromise
      ) {
        this.verificationPromise =
          null;
      }
    }
  }

  start():
    void {
    if (
      !this.scheduleTimers ||
      this.refreshTimer !==
        null
    ) {
      return;
    }

    this.refreshTimer =
      setInterval(
        () => {
          void this.verify()
            .catch(() => {
              /*
               * Individual failures are already recorded
               * through sanitized verification evidence.
               *
               * Do not print raw exchange API responses or
               * credential-related payloads here.
               */
            });
        },
        this.refreshIntervalMs,
      );

    this.refreshTimer.unref();
  }

  stop():
    void {
    if (
      this.refreshTimer ===
        null
    ) {
      return;
    }

    clearInterval(
      this.refreshTimer,
    );

    this.refreshTimer =
      null;
  }

  private async verifyAll():
    Promise<void> {
    const results =
      await Promise.allSettled([
        this.verifyCoinDCX(),
        this.verifyBinance(),
        this.verifyBybit(),
      ]);

    const rejected =
      results.filter(
        (
          result,
        ): result is PromiseRejectedResult =>
          result.status ===
          "rejected",
      );

    if (
      rejected.length >
      0
    ) {
      throw new Error(
        `${rejected.length} core exchange authenticated-read verification(s) failed.`,
      );
    }
  }

  private async verifyCoinDCX():
    Promise<void> {
    const exchange:
      CoreExchange =
      "coindcx";

    if (
      !coinDCXCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      return;
    }

    try {
      await coinDCXAccountApi
        .getBalances(
          coinDCXCredentialsProvider
            .getCredentials(),
        );

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "SIGNED_BALANCE_READ",
        );
    } catch (
      error:
        unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "SIGNED_BALANCE_READ",
          error,
        );

      throw error;
    }
  }

  private async verifyBinance():
    Promise<void> {
    const exchange:
      CoreExchange =
      "binance";

    if (
      !binanceCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      return;
    }

    try {
      await binanceAccountApi
        .getAccount(
          binanceCredentialsProvider
            .getCredentials(),
        );

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "SIGNED_BALANCE_READ",
        );
    } catch (
      error:
        unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "SIGNED_BALANCE_READ",
          error,
        );

      throw error;
    }
  }

  private async verifyBybit():
    Promise<void> {
    const exchange:
      CoreExchange =
      "bybit";

    if (
      !bybitCredentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          exchange,
        );

      return;
    }

    try {
      await bybitAccountApi
        .getUnifiedWalletBalances(
          bybitCredentialsProvider
            .getCredentials(),
        );

      executionAdapterVerificationService
        .recordSuccess(
          exchange,
          "SIGNED_BALANCE_READ",
        );
    } catch (
      error:
        unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          exchange,
          "SIGNED_BALANCE_READ",
          error,
        );

      throw error;
    }
  }
}

export const coreExchangeAuthenticatedReadVerificationService =
  new CoreExchangeAuthenticatedReadVerificationService();
