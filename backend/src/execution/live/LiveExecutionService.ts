import {
  binanceExecutionAdapter,
} from "./adapters/BinanceExecutionAdapter";

import {
  coinDCXExecutionAdapter,
} from "./adapters/CoinDCXExecutionAdapter";

import {
  bybitExecutionAdapter,
} from "./adapters/BybitExecutionAdapter";

import {
  binanceUsdMExecutionAdapter,
  bybitLinearExecutionAdapter,
} from "./derivatives/DerivativeExecutionAdapters";

import {
  ProductRoutingLiveExecutionAdapter,
} from "./derivatives/ProductRoutingLiveExecutionAdapter";

import {
  coinSwitchExecutionAdapter,
} from "./adapters/CoinSwitchExecutionAdapter";

import {
  unoCoinExecutionAdapter,
} from "./adapters/UnoCoinExecutionAdapter";

import type {
  LiveExecutionAdapter,
  LiveExecutionAdapterCapabilities,
  LiveExecutionAdapterReadiness,
  LiveExecutionAdapterVerificationMethod,
  LiveExecutionAdapterVerificationState,
} from "./contracts/LiveExecutionAdapter";

import {
  SafeReadLiveExecutionAdapter,
} from "./resilience/SafeReadLiveExecutionAdapter";

const LIVE_EXECUTION_ENABLED =
  false as const;

export interface LiveExecutionExchangeStatus {
  exchange:
    string;

  adapterRegistered:
    boolean;

  capabilities:
    LiveExecutionAdapterCapabilities | null;

  credentialsConfigured:
    boolean;

  authenticationVerified:
    boolean;

  exchangeApiReachable:
    boolean;

  verificationState:
    LiveExecutionAdapterVerificationState;

  readOnlyVerificationFresh:
    boolean;

  lastVerifiedAt:
    | number
    | null;

  lastVerificationAttemptAt:
    | number
    | null;

  verificationExpiresAt:
    | number
    | null;

  verificationMethod:
    | LiveExecutionAdapterVerificationMethod
    | null;

  lastVerificationError:
    | string
    | null;

  liveExecutionEnabled:
    false;

  /*
   * Backward-compatible strict connectivity flag.
   * It is never inferred from credential presence.
   */
  adapterConnected:
    boolean;
}

export class LiveExecutionService {
  private readonly adapters =
    new Map<
      string,
      LiveExecutionAdapter
    >();

  private readonly readOnlyReadinessProviders =
    new Map<
      string,
      () => LiveExecutionAdapterReadiness
    >();

  constructor() {
    /*
     * VERSION 18 BUILD 8
     *
     * Execution/cancel paths pass straight
     * through.
     *
     * getOrderStatus receives controlled,
     * idempotent SAFE_READ retries.
     */
    this.register(
      new SafeReadLiveExecutionAdapter(
        coinDCXExecutionAdapter,
      ),
    );

    this.register(
      new SafeReadLiveExecutionAdapter(
        new ProductRoutingLiveExecutionAdapter(
          binanceExecutionAdapter,
          binanceUsdMExecutionAdapter,
        ),
      ),
    );

    /*
     * V22.20 adds the official Bybit V5 spot order
     * lifecycle foundation. Global LIVE execution
     * remains compile-time disabled, so registration
     * adds capability evidence without connectivity or
     * order-submission authorization.
     */
    this.register(
      new SafeReadLiveExecutionAdapter(
        new ProductRoutingLiveExecutionAdapter(
          bybitExecutionAdapter,
          bybitLinearExecutionAdapter,
        ),
      ),
    );

    /*
     * V22.21 implements CoinSwitch PRO LIMIT create,
     * status, and two-phase cancellation. Registration
     * remains non-connected while the global LIVE gate
     * is compile-time disabled.
     */
    this.register(
      new SafeReadLiveExecutionAdapter(
        coinSwitchExecutionAdapter,
      ),
    );

    /*
     * V95 adds the official UnoCoin ordinary LIMIT create,
     * pair-history status, and confirmed cancellation foundation.
     * Global LIVE execution remains compile-time disabled.
     */
    this.register(
      new SafeReadLiveExecutionAdapter(
        unoCoinExecutionAdapter,
      ),
    );
  }

  register(
    adapter:
      LiveExecutionAdapter,
  ): void {
    const exchange =
      this.normalizeExchange(
        adapter.exchange,
      );

    if (
      !exchange
    ) {
      throw new Error(
        "Live execution adapter exchange name is required.",
      );
    }

    this.adapters.set(
      exchange,
      adapter,
    );
  }

  getAdapter(
    exchange:
      string,
  ): LiveExecutionAdapter {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    const adapter =
      this.adapters.get(
        normalizedExchange,
      );

    if (
      !adapter
    ) {
      throw new Error(
        `Live execution adapter not found for exchange: ${exchange}`,
      );
    }

    return adapter;
  }

  hasAdapter(
    exchange:
      string,
  ): boolean {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    if (
      !normalizedExchange
    ) {
      return false;
    }

    return this.adapters.has(
      normalizedExchange,
    );
  }

  getRegisteredExchanges():
    string[] {
    return [
      ...this.adapters.keys(),
    ].sort(
      (
        first,
        second,
      ) =>
        first.localeCompare(
          second,
        ),
    );
  }

  getMonitoredExchanges():
    string[] {
    return [
      ...new Set([
        ...this.adapters.keys(),
        ...this.readOnlyReadinessProviders.keys(),
      ]),
    ].sort(
      (
        first,
        second,
      ) =>
        first.localeCompare(
          second,
        ),
    );
  }

  getExchangeStatus(
    exchange:
      string,
  ): LiveExecutionExchangeStatus {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    const adapterRegistered =
      normalizedExchange.length >
        0 &&
      this.adapters.has(
        normalizedExchange,
      );

    const adapter =
      adapterRegistered
        ? this.adapters.get(
            normalizedExchange,
          ) ?? null
        : null;

    const readiness =
      adapter?.getReadiness() ??
      null;

    const capabilities =
      adapter?.getCapabilities() ??
      null;

    const credentialsConfigured =
      readiness
        ?.credentialsConfigured ??
      false;

    const authenticationVerified =
      readiness
        ?.authenticationVerified ??
      false;

    const exchangeApiReachable =
      readiness
        ?.exchangeApiReachable ??
      false;

    const adapterConnected =
      LIVE_EXECUTION_ENABLED &&
      adapterRegistered &&
      authenticationVerified &&
      exchangeApiReachable;

    return {
      exchange:
        normalizedExchange,

      adapterRegistered,

      capabilities:
        capabilities === null
          ? null
          : {
              ...capabilities,
              products: [
                ...capabilities.products,
              ],
            },

      credentialsConfigured,

      authenticationVerified,

      exchangeApiReachable,

      verificationState:
        readiness
          ?.verificationState ??
        "NOT_CONFIGURED",

      readOnlyVerificationFresh:
        readiness
          ?.readOnlyVerificationFresh ??
        false,

      lastVerifiedAt:
        readiness
          ?.lastVerifiedAt ??
        null,

      lastVerificationAttemptAt:
        readiness
          ?.lastVerificationAttemptAt ??
        null,

      verificationExpiresAt:
        readiness
          ?.verificationExpiresAt ??
        null,

      verificationMethod:
        readiness
          ?.verificationMethod ??
        null,

      lastVerificationError:
        readiness
          ?.lastVerificationError ??
        null,

      liveExecutionEnabled:
        LIVE_EXECUTION_ENABLED,

      adapterConnected,
    };
  }

  getExchangeStatuses(
    exchanges?:
      readonly string[],
  ):
    LiveExecutionExchangeStatus[] {
    const requestedExchanges =
      exchanges ??
      this.getRegisteredExchanges();

    const normalizedExchanges =
      [
        ...new Set(
          requestedExchanges
            .map(
              (
                exchange,
              ) =>
                this.normalizeExchange(
                  exchange,
                ),
            )
            .filter(
              (
                exchange,
              ) =>
                exchange.length >
                0,
            ),
        ),
      ].sort(
        (
          first,
          second,
        ) =>
          first.localeCompare(
            second,
          ),
      );

    return normalizedExchanges.map(
      (
        exchange,
      ) =>
        this.getExchangeStatus(
          exchange,
        ),
    );
  }

  getMonitoredExchangeStatus(
    exchange:
      string,
  ): LiveExecutionExchangeStatus {
    const adapterStatus =
      this.getExchangeStatus(
        exchange,
      );

    if (
      adapterStatus.adapterRegistered
    ) {
      return adapterStatus;
    }

    const readinessProvider =
      this.readOnlyReadinessProviders
        .get(
          adapterStatus.exchange,
        );

    if (!readinessProvider) {
      return adapterStatus;
    }

    const readiness =
      readinessProvider();

    return {
      ...adapterStatus,

      credentialsConfigured:
        readiness.credentialsConfigured,

      authenticationVerified:
        readiness.authenticationVerified,

      exchangeApiReachable:
        readiness.exchangeApiReachable,

      verificationState:
        readiness.verificationState,

      readOnlyVerificationFresh:
        readiness.readOnlyVerificationFresh,

      lastVerifiedAt:
        readiness.lastVerifiedAt,

      lastVerificationAttemptAt:
        readiness.lastVerificationAttemptAt,

      verificationExpiresAt:
        readiness.verificationExpiresAt,

      verificationMethod:
        readiness.verificationMethod,

      lastVerificationError:
        readiness.lastVerificationError,

      liveExecutionEnabled:
        false,

      adapterConnected:
        false,
    };
  }

  getMonitoredExchangeStatuses():
    LiveExecutionExchangeStatus[] {
    return this.getMonitoredExchanges()
      .map(
        (exchange) =>
          this.getMonitoredExchangeStatus(
            exchange,
          ),
      );
  }

  isExchangeConnected(
    exchange:
      string,
  ): boolean {
    return this.getExchangeStatus(
      exchange,
    ).adapterConnected;
  }

  areExchangesConnected(
    ...exchanges:
      string[]
  ): boolean {
    if (
      exchanges.length ===
      0
    ) {
      return false;
    }

    return exchanges.every(
      (
        exchange,
      ) =>
        this.isExchangeConnected(
          exchange,
        ),
    );
  }

  clear():
    void {
    this.adapters.clear();

    this.readOnlyReadinessProviders
      .clear();
  }

  size():
    number {
    return this.adapters.size;
  }

  private normalizeExchange(
    exchange:
      string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }

  registerReadOnlyReadinessProvider(
    exchange: string,
    provider: () =>
      LiveExecutionAdapterReadiness,
  ): void {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    if (!normalizedExchange) {
      throw new Error(
        "Read-only readiness exchange name is required.",
      );
    }

    this.readOnlyReadinessProviders
      .set(
        normalizedExchange,
        provider,
      );
  }
}

export const liveExecutionService =
  new LiveExecutionService();
