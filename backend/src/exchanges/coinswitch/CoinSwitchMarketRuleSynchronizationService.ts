import {
  sensitiveDataRedactor,
} from "../../core/security/SensitiveDataRedactor";

import {
  COINSWITCH_PUBLIC_VENUES,
  type CoinSwitchPublicVenue,
} from "./constants";

import {
  clearCoinSwitchMarketRuleEvidence,
  replaceCoinSwitchMarketRuleEvidence,
  type CoinSwitchMarketRuleEvidence,
} from "./CoinSwitchMarketRuleEvidence";

import {
  coinSwitchCredentialsProvider,
  type CoinSwitchCredentialSource,
} from "./api/CoinSwitchCredentialsProvider";

import {
  coinSwitchTradeInfoApi,
  type CoinSwitchTradeInfo,
} from "./api/CoinSwitchTradeInfoApi";

const DEFAULT_REFRESH_INTERVAL_MS =
  5 * 60 * 1_000;

const DEFAULT_EVIDENCE_TTL_MS =
  15 * 60 * 1_000;

interface CoinSwitchTradeInfoSource {
  getTradeInfo(
    venue:
      CoinSwitchPublicVenue,
    credentials?:
      ReturnType<
        CoinSwitchCredentialSource[
          "getCredentials"
        ]
      >,
  ): Promise<
    CoinSwitchTradeInfo[]
  >;
}

export interface CoinSwitchMarketRuleSynchronizationStatus {
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

export interface CoinSwitchMarketRuleSynchronizationOptions {
  api?:
    CoinSwitchTradeInfoSource;

  credentialsProvider?:
    CoinSwitchCredentialSource;

  now?: () => number;

  scheduleTimers?: boolean;

  refreshIntervalMs?: number;

  evidenceTtlMs?: number;
}

export class CoinSwitchMarketRuleSynchronizationService {
  private readonly api:
    CoinSwitchTradeInfoSource;

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
    CoinSwitchMarketRuleSynchronizationStatus = {
    exchange:
      "coinswitch",
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
      CoinSwitchMarketRuleSynchronizationOptions = {},
  ) {
    this.api =
      options.api ??
      coinSwitchTradeInfoApi;

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
        "CoinSwitch market-rule refresh interval",
      );

    this.evidenceTtlMs =
      this.requirePositiveInteger(
        options.evidenceTtlMs ??
          DEFAULT_EVIDENCE_TTL_MS,
        "CoinSwitch market-rule evidence TTL",
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
                  "[CoinSwitch Rules] Synchronization failed; rule-dependent paper routes remain blocked:",
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
    CoinSwitchMarketRuleSynchronizationStatus {
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
      clearCoinSwitchMarketRuleEvidence();

      this.status = {
        exchange:
          "coinswitch",
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
                  .getTradeInfo(
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
          CoinSwitchMarketRuleEvidence
        >();

      for (const rules of responses) {
        for (const rule of rules) {
          evidenceByMarket.set(
            rule.market,
            {
              exchange:
                "coinswitch",
              venue:
                rule.venue,
              market:
                rule.market,
              priceStep:
                rule.priceStep,
              pricePrecision:
                rule.pricePrecision,
              quantityStep:
                rule.quantityStep,
              quantityPrecision:
                rule.quantityPrecision,
              minimumNotional:
                rule.minimumNotional,
              maximumNotional:
                rule.maximumNotional,
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
          "CoinSwitch returned no valid market-rule evidence.",
        );
      }

      replaceCoinSwitchMarketRuleEvidence(
        evidence,
      );

      this.status = {
        exchange:
          "coinswitch",
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
      clearCoinSwitchMarketRuleEvidence();

      this.status = {
        ...this.status,
        credentialsConfigured:
          true,
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

  private errorMessage(
    error: unknown,
  ): string {
    const message =
      error instanceof Error &&
      error.message.trim()
        ? error.message
        : "Unknown CoinSwitch market-rule synchronization error.";

    return sensitiveDataRedactor
      .redactString(
        message,
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

export const coinSwitchMarketRuleSynchronizationService =
  new CoinSwitchMarketRuleSynchronizationService();
