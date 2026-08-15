import {
  loadMarkets,
  type LoadedCoinDCXMarket,
} from "../../../../exchanges/coindcx/marketLoader";

import {
  createExchangeCapabilityKey,
  type ExchangeMarketCapability,
  type ExchangeOrderType,
  type ExchangeTimeInForce,
  type ExchangeTradingProduct,
} from "../../models/ExchangeCapability";

import type {
  ExchangeCapabilityProvider,
  ExchangeCapabilityQuery,
} from "../ExchangeCapabilityProvider";

const COINDCX_EXCHANGE =
  "coindcx";

const DEFAULT_PRODUCT:
  ExchangeTradingProduct =
  "spot";

export class CoinDCXCapabilityProvider
  implements ExchangeCapabilityProvider
{
  readonly exchange =
    COINDCX_EXCHANGE;

  private readonly capabilities =
    new Map<
      string,
      ExchangeMarketCapability
    >();

  private lastSynchronizationTime:
    number | null = null;

  private synchronizationPromise:
    Promise<
      readonly ExchangeMarketCapability[]
    > | null = null;

  async getCapabilities(
    query:
      ExchangeCapabilityQuery = {},
  ): Promise<
    readonly ExchangeMarketCapability[]
  > {
    const product =
      query.product ??
      DEFAULT_PRODUCT;

    this.assertSupportedProduct(
      product,
    );

    const requestedMarkets =
      this.normalizeMarkets(
        query.markets,
      );

    if (
      query.forceRefresh !== true &&
      this.isSynchronized()
    ) {
      const cached =
        this.selectCachedCapabilities(
          product,
          requestedMarkets,
        );

      if (
        requestedMarkets.length === 0 ||
        cached.length ===
          requestedMarkets.length
      ) {
        return cached;
      }
    }

    if (
      this.synchronizationPromise
    ) {
      await this.synchronizationPromise;

      const cachedAfterSynchronization =
        this.selectCachedCapabilities(
          product,
          requestedMarkets,
        );

      if (
        query.forceRefresh !== true &&
        (
          requestedMarkets.length === 0 ||
          cachedAfterSynchronization.length ===
            requestedMarkets.length
        )
      ) {
        return cachedAfterSynchronization;
      }
    }

    const synchronizationPromise =
      this.synchronizeMarkets(
        product,
      );

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

    return this.selectCachedCapabilities(
      product,
      requestedMarkets,
    );
  }

  async getCapability(
    market: string,

    product:
      ExchangeTradingProduct =
      DEFAULT_PRODUCT,
  ): Promise<
    ExchangeMarketCapability | null
  > {
    this.assertSupportedProduct(
      product,
    );

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (!normalizedMarket) {
      throw new Error(
        "CoinDCX capability lookup requires a market.",
      );
    }

    if (
      this.isSynchronized()
    ) {
      const cached =
        this.findCachedCapability(
          normalizedMarket,
          product,
        );

      if (cached) {
        return cached;
      }
    }

    await this.getCapabilities({
      product,

      markets: [
        normalizedMarket,
      ],

      forceRefresh:
        true,
    });

    return this.findCachedCapability(
      normalizedMarket,
      product,
    );
  }

  invalidateCache(): void {
    this.capabilities.clear();

    this.lastSynchronizationTime =
      null;
  }

  getLastSynchronizationTime():
    number | null {
    return this.lastSynchronizationTime;
  }

  isSynchronized(): boolean {
    return (
      this.lastSynchronizationTime !==
        null &&
      this.capabilities.size >
        0
    );
  }

  private async synchronizeMarkets(
    product:
      ExchangeTradingProduct,
  ): Promise<
    readonly ExchangeMarketCapability[]
  > {
    const loadedMarkets =
      await loadMarkets();

    const synchronizedAt =
      Date.now();

    const normalizedCapabilities =
      loadedMarkets.map(
        (market) =>
          this.normalizeCapability(
            market,
            product,
            synchronizedAt,
          ),
      );

    /*
     * CoinDCX market metadata is returned as one
     * exchange-wide snapshot.
     *
     * Replace the previous cache only after the
     * entire response has been fetched and
     * normalized successfully. A failed request
     * therefore cannot leave a partially updated
     * capability cache.
     */
    const nextCapabilities =
      new Map<
        string,
        ExchangeMarketCapability
      >();

    for (
      const capability
      of normalizedCapabilities
    ) {
      nextCapabilities.set(
        createExchangeCapabilityKey(
          capability.exchange,
          capability.market,
          capability.product,
        ),
        capability,
      );
    }

    this.capabilities.clear();

    for (
      const [
        key,
        capability,
      ]
      of nextCapabilities
    ) {
      this.capabilities.set(
        key,
        capability,
      );
    }

    this.lastSynchronizationTime =
      synchronizedAt;

    return normalizedCapabilities.map(
      (capability) =>
        structuredClone(
          capability,
        ),
    );
  }

  private normalizeCapability(
    market:
      LoadedCoinDCXMarket,

    product:
      ExchangeTradingProduct,

    synchronizedAt: number,
  ): ExchangeMarketCapability {
    const supportedOrderTypes =
      this.normalizeOrderTypes(
        market.orderTypes,
      );

    return {
      exchange:
        COINDCX_EXCHANGE,

      /*
       * CoinDCX order APIs use the normalized
       * exchange symbol, for example:
       * B-BTC_USDT.
       */
      market:
        this.normalizeMarket(
          `${market.baseCurrency}${market.quoteCurrency}`,
        ),

      baseAsset:
        market.baseCurrency
          .trim()
          .toUpperCase(),

      quoteAsset:
        market.quoteCurrency
          .trim()
          .toUpperCase(),

      product,

      /*
       * loadMarkets() already excludes every
       * CoinDCX market whose status is not active.
       * Therefore every returned market is
       * currently tradeable.
       *
       * An inactive or unavailable market will
       * not produce a capability and execution
       * validation will fail safely.
       */
      tradingEnabled:
        true,

      maintenanceMode:
        false,

      order: {
        supportedOrderTypes,

        /*
         * Existing CoinDCX market metadata does
         * not expose time-in-force support.
         * Do not assume GTC, IOC, or FOK.
         */
        supportedTimeInForce:
          [] satisfies ExchangeTimeInForce[],

        supportsPostOnly:
          false,

        supportsClientOrderId:
          true,

        supportsOrderCancellation:
          true,

        supportsOrderStatusPolling:
          true,
      },

      price: {
        minimumPrice:
          this.positiveOrNull(
            market.minimumPrice,
          ),

        maximumPrice:
          this.positiveOrNull(
            market.maximumPrice,
          ),

        /*
         * Existing CoinDCX metadata exposes price
         * precision, but not a reliable tick-size
         * field. Keep this unknown instead of
         * deriving a potentially incorrect rule.
         */
        priceStep:
          null,

        pricePrecision:
          this.nonNegativeIntegerOrNull(
            market.pricePrecision,
          ),
      },

      quantity: {
        minimumQuantity:
          this.positiveOrNull(
            market.minimumQuantity,
          ),

        maximumQuantity:
          this.positiveOrNull(
            market.maximumQuantity,
          ),

        quantityStep:
          this.positiveOrNull(
            market.quantityStep,
          ),

        quantityPrecision:
          this.nonNegativeIntegerOrNull(
            market.quantityPrecision,
          ),
      },

      notional: {
        minimumNotional:
          this.positiveOrNull(
            market.minimumNotional,
          ),

        /*
         * CoinDCX market metadata currently does
         * not expose maximum notional.
         */
        maximumNotional:
          null,
      },

      fees: {
        /*
         * Public market metadata does not provide
         * account-specific trading fees.
         */
        makerFeeRate:
          null,

        takerFeeRate:
          null,

        feeAsset:
          null,
      },

      sourceUpdatedAt:
        null,

      synchronizedAt,
    };
  }

  private normalizeOrderTypes(
    orderTypes:
      readonly string[],
  ): ExchangeOrderType[] {
    const normalized =
      new Set<
        ExchangeOrderType
      >();

    for (
      const orderType
      of orderTypes
    ) {
      switch (
        orderType
          .trim()
          .toLowerCase()
      ) {
        case "market":
        case "market_order":
          normalized.add(
            "market",
          );
          break;

        case "limit":
        case "limit_order":
          normalized.add(
            "limit",
          );
          break;

        default:
          break;
      }
    }

    return [
      ...normalized,
    ];
  }

  private selectCachedCapabilities(
    product:
      ExchangeTradingProduct,

    requestedMarkets:
      readonly string[],
  ): ExchangeMarketCapability[] {
    const requestedMarketSet =
      requestedMarkets.length > 0
        ? new Set(
            requestedMarkets,
          )
        : null;

    return [
      ...this.capabilities.values(),
    ]
      .filter(
        (capability) =>
          capability.product ===
            product &&
          (
            requestedMarketSet ===
              null ||
            requestedMarketSet.has(
              capability.market,
            )
          ),
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.market.localeCompare(
            second.market,
          ),
      )
      .map(
        (capability) =>
          structuredClone(
            capability,
          ),
      );
  }

  private findCachedCapability(
    market: string,

    product:
      ExchangeTradingProduct,
  ): ExchangeMarketCapability | null {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const directCapability =
      this.capabilities.get(
        createExchangeCapabilityKey(
          COINDCX_EXCHANGE,
          normalizedMarket,
          product,
        ),
      );

    if (directCapability) {
      return structuredClone(
        directCapability,
      );
    }

    return null;
  }

  private normalizeMarkets(
    markets:
      readonly string[] | undefined,
  ): string[] {
    if (!markets) {
      return [];
    }

    return [
      ...new Set(
        markets
          .map((market) =>
            this.normalizeMarket(
              market,
            ),
          )
          .filter(
            (market) =>
              market.length > 0,
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
  }

  private normalizeMarket(
    market: string,
  ): string {
    return market
      .trim()
      .toUpperCase();
  }

  private positiveOrNull(
    value:
      number | null,
  ): number | null {
    if (
      value === null ||
      !Number.isFinite(
        value,
      ) ||
      value <= 0
    ) {
      return null;
    }

    return value;
  }

  private nonNegativeIntegerOrNull(
    value: number,
  ): number | null {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value < 0
    ) {
      return null;
    }

    return value;
  }

  private assertSupportedProduct(
    product:
      ExchangeTradingProduct,
  ): void {
    if (
      product !==
      "spot"
    ) {
      throw new Error(
        `CoinDCX capability provider does not support product: ${product}`,
      );
    }
  }
}

export const coinDCXCapabilityProvider =
  new CoinDCXCapabilityProvider();
