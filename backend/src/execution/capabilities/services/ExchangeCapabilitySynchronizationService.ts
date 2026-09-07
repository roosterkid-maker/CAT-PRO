import {
  sensitiveDataRedactor,
} from "../../../core/security/SensitiveDataRedactor";

import {
  exchangeCapabilityService,
} from "./ExchangeCapabilityService";

const DEFAULT_REFRESH_INTERVAL_MS =
  5 * 60 * 1_000;

/*
 * Binance, Bybit, CoinDCX, and ZebPay have no dedicated bespoke
 * market-rule synchronizer of their own (CoinSwitch and UnoCoin each do -
 * see CoinSwitchMarketRuleSynchronizationService). Their execution
 * adapters validate against exchangeCapabilityService.getCachedCapability(),
 * a cache-only synchronous read (deliberately never a live network fetch
 * on the order-submission hot path). Without this periodic background
 * synchronization, that cache is never populated for these four
 * exchanges and their exchange-rule validation stays permanently inert.
 */
const SYNCHRONIZED_EXCHANGES = [
  "binance",
  "bybit",
  "coindcx",
  "zebpay",
] as const;

export interface ExchangeCapabilitySynchronizationExchangeStatus {
  exchange: string;

  synchronized: boolean;

  marketCount: number;

  lastAttemptAt:
    number | null;

  lastSynchronizedAt:
    number | null;

  lastError:
    string | null;
}

export interface ExchangeCapabilitySynchronizationOptions {
  scheduleTimers?: boolean;

  refreshIntervalMs?: number;

  now?: () => number;
}

export class ExchangeCapabilitySynchronizationService {
  private readonly scheduleTimers:
    boolean;

  private readonly refreshIntervalMs:
    number;

  private readonly now:
    () => number;

  private refreshTimer:
    NodeJS.Timeout | null =
    null;

  private synchronizationPromise:
    Promise<void> | null =
    null;

  private readonly statusByExchange =
    new Map<
      string,
      ExchangeCapabilitySynchronizationExchangeStatus
    >();

  constructor(
    options:
      ExchangeCapabilitySynchronizationOptions = {},
  ) {
    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.refreshIntervalMs =
      this.requirePositiveInteger(
        options.refreshIntervalMs ??
          DEFAULT_REFRESH_INTERVAL_MS,
        "Exchange capability refresh interval",
      );

    this.now =
      options.now ??
      Date.now;

    for (
      const exchange
      of SYNCHRONIZED_EXCHANGES
    ) {
      this.statusByExchange.set(
        exchange,
        {
          exchange,
          synchronized: false,
          marketCount: 0,
          lastAttemptAt: null,
          lastSynchronizedAt: null,
          lastError: null,
        },
      );
    }
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
                  "[Exchange Capability Sync] Periodic synchronization failed:",
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
    readonly ExchangeCapabilitySynchronizationExchangeStatus[] {
    return [
      ...this.statusByExchange.values(),
    ].map(
      (status) => ({
        ...status,
      }),
    );
  }

  private async synchronizeNow():
    Promise<void> {
    /*
     * Each exchange is synchronized independently: one exchange's public
     * market-rules API being unreachable must not block the others from
     * refreshing.
     */
    await Promise.all(
      SYNCHRONIZED_EXCHANGES.map(
        (exchange) =>
          this.synchronizeOne(
            exchange,
          ),
      ),
    );
  }

  private async synchronizeOne(
    exchange: string,
  ): Promise<void> {
    const attemptedAt =
      this.now();

    const previous =
      this.statusByExchange.get(
        exchange,
      );

    try {
      const capabilities =
        await exchangeCapabilityService.synchronizeExchange(
          exchange,
          {},
        );

      this.statusByExchange.set(
        exchange,
        {
          exchange,
          synchronized: true,
          marketCount:
            capabilities.length,
          lastAttemptAt:
            attemptedAt,
          lastSynchronizedAt:
            this.now(),
          lastError: null,
        },
      );
    } catch (
      error:
        unknown
    ) {
      console.error(
        `[Exchange Capability Sync] ${exchange} synchronization failed; exchange-rule validation for ${exchange} remains inert:`,
        this.errorMessage(
          error,
        ),
      );

      this.statusByExchange.set(
        exchange,
        {
          exchange,
          synchronized:
            previous?.synchronized ??
            false,
          marketCount:
            previous?.marketCount ??
            0,
          lastAttemptAt:
            attemptedAt,
          lastSynchronizedAt:
            previous?.lastSynchronizedAt ??
            null,
          lastError:
            this.errorMessage(
              error,
            ),
        },
      );
    }
  }

  private errorMessage(
    error: unknown,
  ): string {
    const message =
      error instanceof Error &&
      error.message.trim()
        ? error.message
        : "Unknown exchange capability synchronization error.";

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

export const exchangeCapabilitySynchronizationService =
  new ExchangeCapabilitySynchronizationService();
