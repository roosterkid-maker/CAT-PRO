import {
  clearDynamicFeeEvidence,
  replaceExchangeMarketFeeEvidence,
} from "../config/fees";

import type {
  ExchangeFeeEvidence,
} from "../models/FeeModel";

import {
  sensitiveDataRedactor,
} from "../../core/security/SensitiveDataRedactor";

import {
  COINSWITCH_PUBLIC_VENUES,
  type CoinSwitchPublicVenue,
} from "../../exchanges/coinswitch/constants";

import {
  coinSwitchCredentialsProvider,
  type CoinSwitchCredentialSource,
} from "../../exchanges/coinswitch/api/CoinSwitchCredentialsProvider";

import {
  coinSwitchTradingFeeApi,
  type CoinSwitchTradingFee,
} from "../../exchanges/coinswitch/api/CoinSwitchTradingFeeApi";

import {
  executionAdapterVerificationService,
} from "../../execution/live/verification/ExecutionAdapterVerificationService";

const COINSWITCH_EXCHANGE =
  "coinswitch";

const DEFAULT_REFRESH_INTERVAL_MS =
  20_000;

const DEFAULT_EVIDENCE_TTL_MS =
  30_000;

const INDIA_GST_ON_TRADING_FEES_MULTIPLIER =
  1.18;

interface CoinSwitchFeeApi {
  getTradingFees(
    venue:
      CoinSwitchPublicVenue,
    credentials?:
      ReturnType<
        CoinSwitchCredentialSource[
          "getCredentials"
        ]
      >,
  ): Promise<
    CoinSwitchTradingFee[]
  >;
}

export interface CoinSwitchFeeSynchronizationStatus {
  exchange: "coinswitch";

  source: "ACCOUNT_API";

  credentialsConfigured:
    boolean;

  synchronized:
    boolean;

  venueCount: number;

  marketCount: number;

  lastAttemptAt:
    number | null;

  lastSynchronizedAt:
    number | null;

  expiresAt:
    number | null;

  lastError:
    string | null;
}

export interface CoinSwitchFeeSynchronizationOptions {
  api?: CoinSwitchFeeApi;

  credentialsProvider?:
    CoinSwitchCredentialSource;

  now?: () => number;

  scheduleTimers?: boolean;

  refreshIntervalMs?: number;

  evidenceTtlMs?: number;
}

export class CoinSwitchFeeSynchronizationService {
  private readonly api:
    CoinSwitchFeeApi;

  private readonly credentialsProvider:
    CoinSwitchCredentialSource;

  private readonly now:
    () => number;

  private readonly scheduleTimers:
    boolean;

  private readonly refreshIntervalMs:
    number;

  private readonly evidenceTtlMs:
    number;

  private refreshTimer:
    NodeJS.Timeout | null =
    null;

  private synchronizationPromise:
    Promise<void> | null =
    null;

  private status:
    CoinSwitchFeeSynchronizationStatus = {
    exchange:
      COINSWITCH_EXCHANGE,

    source:
      "ACCOUNT_API",

    credentialsConfigured:
      false,

    synchronized:
      false,

    venueCount:
      0,

    marketCount:
      0,

    lastAttemptAt:
      null,

    lastSynchronizedAt:
      null,

    expiresAt:
      null,

    lastError:
      null,
  };

  constructor(
    options:
      CoinSwitchFeeSynchronizationOptions = {},
  ) {
    this.api =
      options.api ??
      coinSwitchTradingFeeApi;

    this.credentialsProvider =
      options.credentialsProvider ??
      coinSwitchCredentialsProvider;

    this.now =
      options.now ??
      Date.now;

    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.refreshIntervalMs =
      this.requirePositiveInteger(
        options.refreshIntervalMs ??
          DEFAULT_REFRESH_INTERVAL_MS,
        "CoinSwitch fee refresh interval",
      );

    this.evidenceTtlMs =
      this.requirePositiveInteger(
        options.evidenceTtlMs ??
          DEFAULT_EVIDENCE_TTL_MS,
        "CoinSwitch fee evidence TTL",
      );
  }

  async synchronize():
    Promise<void> {
    if (
      this.synchronizationPromise
    ) {
      await this.synchronizationPromise;

      return;
    }

    const synchronizationPromise =
      this.synchronizeNow();

    this.synchronizationPromise =
      synchronizationPromise;

    try {
      await synchronizationPromise;
    } finally {
      if (
        this.synchronizationPromise ===
          synchronizationPromise
      ) {
        this.synchronizationPromise =
          null;
      }
    }
  }

  start(): void {
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
          void this.synchronize()
            .catch(
              (
                error:
                  unknown,
              ) => {
                console.error(
                  "[CoinSwitch Fees] Synchronization failed; CoinSwitch fee-dependent routes remain blocked:",
                  this.errorMessage(
                    error,
                  ),
                );
              },
            );
        },
        this.refreshIntervalMs,
      );

    this.refreshTimer.unref();
  }

  stop(): void {
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

  getStatus():
    CoinSwitchFeeSynchronizationStatus {
    const now =
      this.now();

    return {
      ...this.status,

      synchronized:
        this.status.synchronized &&
        this.status.expiresAt !==
          null &&
        this.status.expiresAt >=
          now,
    };
  }

  private async synchronizeNow():
    Promise<void> {
    const attemptedAt =
      this.now();

    const credentialsConfigured =
      this.credentialsProvider
        .isConfigured();

    if (!credentialsConfigured) {
      clearDynamicFeeEvidence(
        COINSWITCH_EXCHANGE,
      );

      executionAdapterVerificationService
        .recordNotConfigured(
          COINSWITCH_EXCHANGE,
        );

      this.status = {
        exchange:
          COINSWITCH_EXCHANGE,

        source:
          "ACCOUNT_API",

        credentialsConfigured:
          false,

        synchronized:
          false,

        venueCount:
          0,

        marketCount:
          0,

        lastAttemptAt:
          attemptedAt,

        lastSynchronizedAt:
          null,

        expiresAt:
          null,

        lastError:
          null,
      };

      return;
    }

    this.status = {
      ...this.status,

      credentialsConfigured:
        true,

      lastAttemptAt:
        attemptedAt,
    };

    try {
      const credentials =
        this.credentialsProvider
          .getCredentials();

      const responses =
        await Promise.all(
          COINSWITCH_PUBLIC_VENUES
            .map(
              (venue) =>
                this.api
                  .getTradingFees(
                    venue,
                    credentials,
                  ),
            ),
        );

      const synchronizedAt =
        this.now();

      const expiresAt =
        synchronizedAt +
        this.evidenceTtlMs;

      const evidenceByMarket =
        new Map<
          string,
          ExchangeFeeEvidence
        >();

      for (const fees of responses) {
        for (const fee of fees) {
          const quoteAsset =
            this.quoteAssetForVenue(
              fee.venue,
            );

          const market =
            `${fee.baseAsset}_${quoteAsset}`;

          evidenceByMarket.set(
            market,
            {
              exchange:
                COINSWITCH_EXCHANGE,

              market,

              makerPercent:
                this.includeTradingFeeGst(
                  fee.makerPercent,
                ),

              takerPercent:
                this.includeTradingFeeGst(
                  fee.takerPercent,
                ),

              source:
                "ACCOUNT_API",

              synchronizedAt,

              expiresAt,
            },
          );
        }
      }

      const evidence = [
        ...evidenceByMarket
          .values(),
      ];

      if (
        evidence.length ===
          0
      ) {
        throw new Error(
          "CoinSwitch returned no valid account fee evidence.",
        );
      }

      replaceExchangeMarketFeeEvidence(
        COINSWITCH_EXCHANGE,
        evidence,
      );

      executionAdapterVerificationService
        .recordSuccess(
          COINSWITCH_EXCHANGE,
          "SIGNED_FEE_READ",
          synchronizedAt,
        );

      this.status = {
        exchange:
          COINSWITCH_EXCHANGE,

        source:
          "ACCOUNT_API",

        credentialsConfigured:
          true,

        synchronized:
          true,

        venueCount:
          responses.length,

        marketCount:
          evidence.length,

        lastAttemptAt:
          attemptedAt,

        lastSynchronizedAt:
          synchronizedAt,

        expiresAt,

        lastError:
          null,
      };
    } catch (
      error:
        unknown
    ) {
      clearDynamicFeeEvidence(
        COINSWITCH_EXCHANGE,
      );

      executionAdapterVerificationService
        .recordFailure(
          COINSWITCH_EXCHANGE,
          "SIGNED_FEE_READ",
          error,
          attemptedAt,
        );

      this.status = {
        ...this.status,

        synchronized:
          false,

        venueCount:
          0,

        marketCount:
          0,

        lastAttemptAt:
          attemptedAt,

        expiresAt:
          null,

        lastError:
          this.errorMessage(
            error,
          ),
      };

      throw error;
    }
  }

  private quoteAssetForVenue(
    venue:
      CoinSwitchPublicVenue,
  ): "INR" | "USDT" {
    switch (venue) {
      case "coinswitchx":
        return "INR";

      case "c2c1":
        return "USDT";
    }
  }

  private errorMessage(
    error: unknown,
  ): string {
    const message =
      error instanceof Error &&
      error.message.trim()
        ? error.message
        : "Unknown CoinSwitch fee synchronization error.";

    return sensitiveDataRedactor
      .redactString(
        message,
      );
  }

  private includeTradingFeeGst(
    feePercent: number,
  ): number {
    return Number(
      (
        feePercent *
        INDIA_GST_ON_TRADING_FEES_MULTIPLIER
      ).toFixed(
        12,
      ),
    );
  }

  private requirePositiveInteger(
    value: number,
    label: string,
  ): number {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value <= 0
    ) {
      throw new Error(
        `${label} must be a positive integer.`,
      );
    }

    return value;
  }
}

export const coinSwitchFeeSynchronizationService =
  new CoinSwitchFeeSynchronizationService();
