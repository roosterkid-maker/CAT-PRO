import {
  replaceExchangeMarketFeeEvidence,
} from "../config/fees";

import type {
  ExchangeFeeEvidence,
} from "../models/FeeModel";

import {
  normalizeUnoCoinFeeRules,
} from "../../exchanges/unocoin/feeRules";

import {
  normalizeUnoCoinMarket,
} from "../../exchanges/unocoin/normalize";

import {
  unoCoinPublicApi,
  type UnoCoinPublicMarketApi,
} from "../../exchanges/unocoin/UnoCoinPublicApi";

const UNOCOIN_EXCHANGE =
  "unocoin";

const DEFAULT_REFRESH_INTERVAL_MS =
  5 * 60 * 1_000;

const DEFAULT_EVIDENCE_TTL_MS =
  15 * 60 * 1_000;

export interface UnoCoinFeeSynchronizationStatus {
  exchange: "unocoin";

  source: "PUBLIC_API";

  synchronized: boolean;

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

export interface UnoCoinFeeSynchronizationOptions {
  api?: UnoCoinPublicMarketApi;

  now?: () => number;

  scheduleTimers?: boolean;

  refreshIntervalMs?: number;

  evidenceTtlMs?: number;
}

export class UnoCoinFeeSynchronizationService {
  private readonly api:
    UnoCoinPublicMarketApi;

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
    UnoCoinFeeSynchronizationStatus = {
    exchange:
      UNOCOIN_EXCHANGE,

    source:
      "PUBLIC_API",

    synchronized:
      false,

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
      UnoCoinFeeSynchronizationOptions = {},
  ) {
    this.api =
      options.api ??
      unoCoinPublicApi;

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
        "UnoCoin fee refresh interval",
      );

    this.evidenceTtlMs =
      this.requirePositiveInteger(
        options.evidenceTtlMs ??
          DEFAULT_EVIDENCE_TTL_MS,
        "UnoCoin fee evidence TTL",
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
                  "[UnoCoin Fees] Synchronization failed:",
                  this.errorMessage(
                    error,
                  ),
                );
              },
            );
        },
        this.refreshIntervalMs,
      );
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
    UnoCoinFeeSynchronizationStatus {
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

    this.status = {
      ...this.status,

      lastAttemptAt:
        attemptedAt,
    };

    try {
      const [
        pairs,
        settings,
      ] =
        await Promise.all([
          this.api.getPairs(),
          this.api.getBaseCoinSettings(),
        ]);

      const synchronizedAt =
        this.now();

      const expiresAt =
        synchronizedAt +
        this.evidenceTtlMs;

      const evidence:
        ExchangeFeeEvidence[] = [];

      for (const pair of pairs) {
        const market =
          normalizeUnoCoinMarket(
            pair.ticker_id,
          );

        const quoteAsset =
          this.normalizeAsset(
            pair.base,
          );

        const setting =
          settings[
            quoteAsset
          ];

        if (
          !market ||
          !quoteAsset ||
          !setting
        ) {
          continue;
        }

        const rules =
          normalizeUnoCoinFeeRules(
            setting,
          );

        if (!rules) {
          continue;
        }

        evidence.push({
          exchange:
            UNOCOIN_EXCHANGE,

          market,

          makerPercent:
            rules.makerPercent,

          takerPercent:
            rules.takerPercent,

          source:
            "PUBLIC_API",

          synchronizedAt,

          expiresAt,
        });
      }

      if (
        evidence.length ===
          0
      ) {
        throw new Error(
          "UnoCoin returned no valid market fee evidence.",
        );
      }

      replaceExchangeMarketFeeEvidence(
        UNOCOIN_EXCHANGE,
        evidence,
      );

      this.status = {
        exchange:
          UNOCOIN_EXCHANGE,

        source:
          "PUBLIC_API",

        synchronized:
          true,

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
      this.status = {
        ...this.status,

        lastAttemptAt:
          attemptedAt,

        lastError:
          this.errorMessage(
            error,
          ),
      };

      throw error;
    }
  }

  private normalizeAsset(
    value: unknown,
  ): string {
    return typeof value ===
      "string"
      ? value
          .trim()
          .toUpperCase()
      : "";
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

  private errorMessage(
    error: unknown,
  ): string {
    return error instanceof Error
      ? error.message
      : "Unknown UnoCoin fee synchronization error.";
  }
}

export const unoCoinFeeSynchronizationService =
  new UnoCoinFeeSynchronizationService();
