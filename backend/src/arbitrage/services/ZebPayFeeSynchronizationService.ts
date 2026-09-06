import {
  replaceExchangeMarketFeeEvidence,
} from "../config/fees";

import type {
  ExchangeFeeEvidence,
} from "../models/FeeModel";

import {
  normalizeZebPayMarket,
} from "../../exchanges/zebpay/normalize";

import {
  zebPayPublicApi,
  type ZebPayPublicMarketApi,
} from "../../exchanges/zebpay/ZebPayPublicApi";

import type {
  ZebPayTradePair,
} from "../../exchanges/zebpay/types";

const ZEBPAY_EXCHANGE =
  "zebpay";

const DEFAULT_REFRESH_INTERVAL_MS =
  5 * 60 * 1_000;

const DEFAULT_EVIDENCE_TTL_MS =
  15 * 60 * 1_000;

export interface ZebPayFeeSynchronizationStatus {
  exchange: "zebpay";

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

export interface ZebPayFeeSynchronizationOptions {
  api?: ZebPayPublicMarketApi;

  now?: () => number;

  scheduleTimers?: boolean;

  refreshIntervalMs?: number;

  evidenceTtlMs?: number;
}

/*
 * Mirrors UnoCoinFeeSynchronizationService.ts - same public-API-only,
 * no-credentials-required pattern. ZebPay's own account-tier fee endpoint
 * (ZebPayAccountApi.getTradeFees) is more precise but requires authenticated
 * credentials that are not currently configured for CAT-PRO; this service
 * can be swapped or supplemented to prefer that endpoint once they are.
 */
export class ZebPayFeeSynchronizationService {
  private readonly api:
    ZebPayPublicMarketApi;

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
    ZebPayFeeSynchronizationStatus = {
    exchange:
      ZEBPAY_EXCHANGE,

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
      ZebPayFeeSynchronizationOptions = {},
  ) {
    this.api =
      options.api ??
      zebPayPublicApi;

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
        "ZebPay fee refresh interval",
      );

    this.evidenceTtlMs =
      this.requirePositiveInteger(
        options.evidenceTtlMs ??
          DEFAULT_EVIDENCE_TTL_MS,
        "ZebPay fee evidence TTL",
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
                  "[ZebPay Fees] Synchronization failed:",
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
    ZebPayFeeSynchronizationStatus {
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
      const pairs =
        await this.api.getTradePairs();

      const synchronizedAt =
        this.now();

      const expiresAt =
        synchronizedAt +
        this.evidenceTtlMs;

      const evidence:
        ExchangeFeeEvidence[] = [];

      for (const pair of pairs) {
        const normalized =
          this.normalizePair(
            pair,
          );

        if (!normalized) {
          continue;
        }

        evidence.push({
          exchange:
            ZEBPAY_EXCHANGE,

          market:
            normalized.market,

          makerPercent:
            normalized.makerPercent,

          takerPercent:
            normalized.takerPercent,

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
          "ZebPay returned no valid trade-pair fee evidence.",
        );
      }

      replaceExchangeMarketFeeEvidence(
        ZEBPAY_EXCHANGE,
        evidence,
      );

      this.status = {
        exchange:
          ZEBPAY_EXCHANGE,

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

  /*
   * ZebPay's public trade-pairs payload gives isEnable, per-pair base/quote
   * currency codes (not a combined "pair" string like the market-ticker
   * payload), and maker/taker percentages already inclusive of the
   * exchange's own published rate (GST is applied separately downstream by
   * the same effective-rate convention UnoCoin's evidence uses).
   */
  private normalizePair(
    pair:
      ZebPayTradePair,
  ): {
    market: string;
    makerPercent: number;
    takerPercent: number;
  } | null {
    if (
      pair.isEnable ===
        false ||
      pair.isEnable ===
        "false" ||
      pair.isEnable ===
        0
    ) {
      return null;
    }

    const base =
      this.normalizeAsset(
        pair.tradeVolumeCurrency,
      );

    const quote =
      this.normalizeAsset(
        pair.tradeDenominationCurrency,
      );

    if (
      !base ||
      !quote
    ) {
      return null;
    }

    const market =
      normalizeZebPayMarket(
        `${base}_${quote}`,
      );

    if (!market) {
      return null;
    }

    const makerPercent =
      this.nonNegativeNumberOrNull(
        pair.makerFeePercent,
      );

    const takerPercent =
      this.nonNegativeNumberOrNull(
        pair.takerFeePercent,
      );

    if (
      makerPercent ===
        null ||
      takerPercent ===
        null
    ) {
      return null;
    }

    return {
      market,
      makerPercent,
      takerPercent,
    };
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

  private nonNegativeNumberOrNull(
    value: unknown,
  ): number | null {
    const parsed =
      Number(
        value,
      );

    return Number.isFinite(
      parsed,
    ) &&
      parsed >=
        0
      ? parsed
      : null;
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
      : "Unknown ZebPay fee synchronization error.";
  }
}

export const zebPayFeeSynchronizationService =
  new ZebPayFeeSynchronizationService();
