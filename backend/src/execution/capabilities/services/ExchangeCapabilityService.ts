import {
  canonicalizeExchangeCapabilityMarket,
  createExchangeCapabilityKey,
  type ExchangeMarketCapability,
  type ExchangeTradingProduct,
} from "../models/ExchangeCapability";

import {
  binanceCapabilityProvider,
} from "../providers/binance/BinanceCapabilityProvider";

import {
  bybitCapabilityProvider,
} from "../providers/bybit/BybitCapabilityProvider";

import {
  coinDCXCapabilityProvider,
} from "../providers/coindcx/CoinDCXCapabilityProvider";

import {
  coinSwitchCapabilityProvider,
} from "../providers/coinswitch/CoinSwitchCapabilityProvider";

import {
  unoCoinCapabilityProvider,
} from "../providers/unocoin/UnoCoinCapabilityProvider";

import {
  zebPayCapabilityProvider,
} from "../providers/zebpay/ZebPayCapabilityProvider";

import type {
  ExchangeCapabilityProvider,
  ExchangeCapabilityQuery,
} from "../providers/ExchangeCapabilityProvider";

export interface ExchangeCapabilityLookupRequest {
  exchange: string;

  market: string;

  product?: ExchangeTradingProduct;

  forceRefresh?: boolean;

  maximumAgeMs?: number;
}

export interface ExchangeCapabilityProviderStatus {
  exchange: string;

  synchronized: boolean;

  lastSynchronizationTime:
    number | null;

  cachedCapabilities: number;
}

export interface ExchangeCapabilityServiceStatus {
  registeredProviders: number;

  cachedCapabilities: number;

  providers:
    readonly ExchangeCapabilityProviderStatus[];
}

const DEFAULT_MAXIMUM_CAPABILITY_AGE_MS =
  5 * 60 * 1000;

export class ExchangeCapabilityService {
  private readonly providers =
    new Map<
      string,
      ExchangeCapabilityProvider
    >();

  private readonly capabilities =
    new Map<
      string,
      ExchangeMarketCapability
    >();

  constructor(
    providers:
      readonly ExchangeCapabilityProvider[] = [],

    private readonly now:
      () => number =
      Date.now,
  ) {
    for (
      const provider
      of providers
    ) {
      this.registerProvider(
        provider,
      );
    }
  }

  registerProvider(
    provider:
      ExchangeCapabilityProvider,
  ): void {
    const exchange =
      this.normalizeExchange(
        provider.exchange,
      );

    if (!exchange) {
      throw new Error(
        "Exchange capability provider requires an exchange name.",
      );
    }

    if (
      this.providers.has(
        exchange,
      )
    ) {
      throw new Error(
        `Exchange capability provider is already registered: ${exchange}`,
      );
    }

    this.providers.set(
      exchange,
      provider,
    );
  }

  hasProvider(
    exchange: string,
  ): boolean {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    return (
      normalizedExchange.length >
        0 &&
      this.providers.has(
        normalizedExchange,
      )
    );
  }

  getRegisteredExchanges():
    string[] {
    return [
      ...this.providers.keys(),
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

  async synchronizeExchange(
    exchange: string,

    query:
      ExchangeCapabilityQuery = {},
  ): Promise<
    readonly ExchangeMarketCapability[]
  > {
    const provider =
      this.getProvider(
        exchange,
      );

    const capabilities =
      await provider
        .getCapabilities({
          ...query,

          forceRefresh:
            this.shouldForceProviderRefresh(
              provider,
              query.forceRefresh,
            ),
        });

    const normalizedCapabilities =
      capabilities.map(
        (capability) =>
          this.normalizeCapability(
            capability,
            provider.exchange,
          ),
      );

    this.replaceProviderCapabilities(
      provider.exchange,
      query.product,
      query.markets,
      normalizedCapabilities,
    );

    return normalizedCapabilities.map(
      (capability) =>
        structuredClone(
          capability,
        ),
    );
  }

  private shouldForceProviderRefresh(
    provider:
      ExchangeCapabilityProvider,

    requestedForceRefresh:
      boolean | undefined,
  ): boolean {
    if (
      requestedForceRefresh !==
        false
    ) {
      return true;
    }

    if (!provider.isSynchronized()) {
      return true;
    }

    const lastSynchronizationTime =
      provider
        .getLastSynchronizationTime();

    if (
      lastSynchronizationTime ===
        null ||
      !Number.isSafeInteger(
        lastSynchronizationTime,
      ) ||
      lastSynchronizationTime <=
        0
    ) {
      return true;
    }

    const ageMs =
      this.now() -
      lastSynchronizationTime;

    return (
      ageMs < 0 ||
      ageMs >=
        DEFAULT_MAXIMUM_CAPABILITY_AGE_MS
    );
  }

  async getCapability(
    request:
      ExchangeCapabilityLookupRequest,
  ): Promise<
    ExchangeMarketCapability | null
  > {
    const exchange =
      this.normalizeExchange(
        request.exchange,
      );

    const market =
      this.normalizeMarket(
        request.market,
      );

    const product =
      request.product ??
      "spot";

    const maximumAgeMs =
      request.maximumAgeMs ??
      DEFAULT_MAXIMUM_CAPABILITY_AGE_MS;

    this.validateLookupRequest(
      exchange,
      market,
      maximumAgeMs,
    );

    const key =
      createExchangeCapabilityKey(
        exchange,
        market,
        product,
      );

    const cached =
      this.capabilities.get(
        key,
      );

    if (
      cached &&
      request.forceRefresh !==
        true &&
      this.isFresh(
        cached,
        maximumAgeMs,
      )
    ) {
      return structuredClone(
        cached,
      );
    }

    const provider =
      this.getProvider(
        exchange,
      );

    const capability =
      await provider
        .getCapability(
          market,
          product,
        );

    if (!capability) {
      this.capabilities.delete(
        key,
      );

      return null;
    }

    const normalizedCapability =
      this.normalizeCapability(
        capability,
        exchange,
      );

    this.capabilities.set(
      key,
      normalizedCapability,
    );

    return structuredClone(
      normalizedCapability,
    );
  }

  getCachedCapability(
    exchange: string,

    market: string,

    product:
      ExchangeTradingProduct =
      "spot",
  ): ExchangeMarketCapability | null {
    const key =
      createExchangeCapabilityKey(
        exchange,
        market,
        product,
      );

    const capability =
      this.capabilities.get(
        key,
      );

    return capability
      ? structuredClone(
          capability,
        )
      : null;
  }

  getCachedCapabilities(
    exchange?: string,
  ): ExchangeMarketCapability[] {
    const normalizedExchange =
      exchange ===
      undefined
        ? null
        : this.normalizeExchange(
            exchange,
          );

    return [
      ...this.capabilities.values(),
    ]
      .filter(
        (capability) =>
          normalizedExchange ===
            null ||
          capability.exchange ===
            normalizedExchange,
      )
      .sort(
        (
          first,
          second,
        ) => {
          const exchangeComparison =
            first.exchange.localeCompare(
              second.exchange,
            );

          if (
            exchangeComparison !==
            0
          ) {
            return exchangeComparison;
          }

          const productComparison =
            first.product.localeCompare(
              second.product,
            );

          if (
            productComparison !==
            0
          ) {
            return productComparison;
          }

          return first.market.localeCompare(
            second.market,
          );
        },
      )
      .map(
        (capability) =>
          structuredClone(
            capability,
          ),
      );
  }

  invalidateExchange(
    exchange: string,
  ): void {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    const provider =
      this.providers.get(
        normalizedExchange,
      );

    provider?.invalidateCache();

    for (
      const [
        key,
        capability,
      ]
      of this.capabilities
    ) {
      if (
        capability.exchange ===
        normalizedExchange
      ) {
        this.capabilities.delete(
          key,
        );
      }
    }
  }

  invalidateAll(): void {
    for (
      const provider
      of this.providers.values()
    ) {
      provider.invalidateCache();
    }

    this.capabilities.clear();
  }

  getStatus():
    ExchangeCapabilityServiceStatus {
    const providers =
      this.getRegisteredExchanges()
        .map(
          (
            exchange,
          ):
            ExchangeCapabilityProviderStatus => {
            const provider =
              this.providers.get(
                exchange,
              );

            if (!provider) {
              throw new Error(
                `Registered exchange capability provider disappeared: ${exchange}`,
              );
            }

            return {
              exchange,

              synchronized:
                provider
                  .isSynchronized(),

              lastSynchronizationTime:
                provider
                  .getLastSynchronizationTime(),

              cachedCapabilities: [
                ...this.capabilities.values(),
              ].filter(
                (capability) =>
                  capability.exchange ===
                  exchange,
              ).length,
            };
          },
        );

    return {
      registeredProviders:
        this.providers.size,

      cachedCapabilities:
        this.capabilities.size,

      providers,
    };
  }

  private getProvider(
    exchange: string,
  ): ExchangeCapabilityProvider {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    const provider =
      this.providers.get(
        normalizedExchange,
      );

    if (!provider) {
      throw new Error(
        `Exchange capability provider not found: ${exchange}`,
      );
    }

    return provider;
  }

  private replaceProviderCapabilities(
    exchange: string,

    product:
      ExchangeTradingProduct | undefined,

    markets:
      readonly string[] | undefined,

    capabilities:
      readonly ExchangeMarketCapability[],
  ): void {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    const normalizedMarkets =
      markets
        ? new Set(
            markets.map(
              (market) =>
                canonicalizeExchangeCapabilityMarket(
                  market,
                ),
            ),
          )
        : null;

    for (
      const [
        key,
        capability,
      ]
      of this.capabilities
    ) {
      const exchangeMatches =
        capability.exchange ===
        normalizedExchange;

      const productMatches =
        product ===
          undefined ||
        capability.product ===
          product;

      const marketMatches =
        normalizedMarkets ===
          null ||
        normalizedMarkets.has(
          canonicalizeExchangeCapabilityMarket(
            capability.market,
          ),
        );

      if (
        exchangeMatches &&
        productMatches &&
        marketMatches
      ) {
        this.capabilities.delete(
          key,
        );
      }
    }

    for (
      const capability
      of capabilities
    ) {
      this.capabilities.set(
        createExchangeCapabilityKey(
          capability.exchange,
          capability.market,
          capability.product,
        ),
        capability,
      );
    }
  }

  private normalizeCapability(
    capability:
      ExchangeMarketCapability,

    expectedExchange:
      string,
  ): ExchangeMarketCapability {
    const exchange =
      this.normalizeExchange(
        capability.exchange,
      );

    const normalizedExpectedExchange =
      this.normalizeExchange(
        expectedExchange,
      );

    const market =
      this.normalizeMarket(
        capability.market,
      );

    const baseAsset =
      capability.baseAsset
        .trim()
        .toUpperCase();

    const quoteAsset =
      capability.quoteAsset
        .trim()
        .toUpperCase();

    if (
      exchange !==
      normalizedExpectedExchange
    ) {
      throw new Error(
        `Capability exchange ${exchange} does not match provider ${normalizedExpectedExchange}.`,
      );
    }

    if (
      !market ||
      !baseAsset ||
      !quoteAsset
    ) {
      throw new Error(
        "Exchange capability requires market, base asset, and quote asset.",
      );
    }

    if (
      !Number.isSafeInteger(
        capability.synchronizedAt,
      ) ||
      capability.synchronizedAt <=
        0 ||
      capability.synchronizedAt >
        Date.now()
    ) {
      throw new Error(
        `Exchange capability has an invalid synchronization timestamp: ${exchange}:${market}`,
      );
    }

    return {
      ...structuredClone(
        capability,
      ),

      exchange,

      market,

      baseAsset,

      quoteAsset,

      order: {
        ...structuredClone(
          capability.order,
        ),

        supportedOrderTypes: [
          ...new Set(
            capability.order
              .supportedOrderTypes,
          ),
        ],

        supportedTimeInForce: [
          ...new Set(
            capability.order
              .supportedTimeInForce,
          ),
        ],
      },
    };
  }

  private validateLookupRequest(
    exchange: string,

    market: string,

    maximumAgeMs: number,
  ): void {
    if (!exchange) {
      throw new Error(
        "Exchange capability lookup requires an exchange.",
      );
    }

    if (!market) {
      throw new Error(
        "Exchange capability lookup requires a market.",
      );
    }

    if (
      !Number.isFinite(
        maximumAgeMs,
      ) ||
      maximumAgeMs <=
        0
    ) {
      throw new Error(
        "Maximum exchange capability age must be positive.",
      );
    }
  }

  private isFresh(
    capability:
      ExchangeMarketCapability,

    maximumAgeMs: number,
  ): boolean {
    return (
      Date.now() -
        capability.synchronizedAt <=
      maximumAgeMs
    );
  }

  private normalizeExchange(
    exchange: string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }

  private normalizeMarket(
    market: string,
  ): string {
    return market
      .trim()
      .toUpperCase();
  }
}

export const exchangeCapabilityService =
  new ExchangeCapabilityService([
    binanceCapabilityProvider,
    bybitCapabilityProvider,
    coinDCXCapabilityProvider,
    coinSwitchCapabilityProvider,
    unoCoinCapabilityProvider,
    zebPayCapabilityProvider,
  ]);
