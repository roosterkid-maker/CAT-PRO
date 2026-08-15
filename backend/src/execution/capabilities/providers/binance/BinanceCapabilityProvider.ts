import {
  binanceMarketRulesApi,
  type BinanceMarketRules,
  type BinanceMarketRulesSource,
} from "../../../../exchanges/binance/api/BinanceMarketRulesApi";

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

const BINANCE_EXCHANGE =
  "binance";

const DEFAULT_PRODUCT:
  ExchangeTradingProduct =
  "spot";

export class BinanceCapabilityProvider
  implements ExchangeCapabilityProvider
{
  readonly exchange =
    BINANCE_EXCHANGE;

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

  constructor(
    private readonly marketRulesSource:
      BinanceMarketRulesSource =
      binanceMarketRulesApi,
  ) {}

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

    const markets =
      this.normalizeMarkets(
        query.markets,
      );

    if (
      query.forceRefresh !== true
    ) {
      if (
        markets.length ===
          0 &&
        this.isSynchronized()
      ) {
        return this.getCachedCapabilities(
          product,
        );
      }

      if (
        markets.length >
        0
      ) {
        const cachedCapabilities =
          markets
            .map((market) =>
              this.getCachedCapability(
                market,
                product,
              ),
            )
            .filter(
              (
                capability,
              ): capability is ExchangeMarketCapability =>
                capability !== null,
            );

        if (
          cachedCapabilities.length ===
          markets.length
        ) {
          return cachedCapabilities;
        }
      }
    }

    if (
      this.synchronizationPromise
    ) {
      await this.synchronizationPromise;

      const cachedAfterSynchronization =
        markets.length ===
          0
          ? this.getCachedCapabilities(
              product,
            )
          : markets
              .map((market) =>
                this.getCachedCapability(
                  market,
                  product,
                ),
              )
              .filter(
                (
                  capability,
                ): capability is ExchangeMarketCapability =>
                  capability !== null,
              );

      const synchronizationSatisfied =
        markets.length ===
          0
          ? cachedAfterSynchronization.length >
            0
          : cachedAfterSynchronization.length ===
            markets.length;

      if (
        synchronizationSatisfied &&
        query.forceRefresh !==
          true
      ) {
        return cachedAfterSynchronization;
      }
    }

    const synchronizationPromise =
      markets.length ===
        0
        ? this.synchronizeAllMarkets(
            product,
          )
        : this.synchronizeMarkets(
            markets,
            product,
          );

    this.synchronizationPromise =
      synchronizationPromise;

    try {
      return await synchronizationPromise;
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
        "Binance capability lookup requires a market.",
      );
    }

    const capabilities =
      await this.getCapabilities({
        product,

        markets: [
          normalizedMarket,
        ],

        forceRefresh:
          true,
      });

    return (
      capabilities[0] ??
      null
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
    markets:
      readonly string[],

    product:
      ExchangeTradingProduct,
  ): Promise<
    readonly ExchangeMarketCapability[]
  > {
    const synchronizedAt =
      Date.now();

    const marketRules =
      await Promise.all(
        markets.map(
          (market) =>
            this.marketRulesSource
              .getMarketRules(
                market,
              ),
        ),
      );

    return this.commitRules(
      marketRules,
      product,
      synchronizedAt,
      false,
    );
  }

  private async synchronizeAllMarkets(
    product:
      ExchangeTradingProduct,
  ): Promise<
    readonly ExchangeMarketCapability[]
  > {
    const synchronizedAt =
      Date.now();

    const marketRules =
      await this.marketRulesSource
        .getAllMarketRules();

    return this.commitRules(
      marketRules,
      product,
      synchronizedAt,
      true,
    );
  }

  private commitRules(
    marketRules:
      readonly BinanceMarketRules[],

    product:
      ExchangeTradingProduct,

    synchronizedAt: number,

    replaceProduct: boolean,
  ): readonly ExchangeMarketCapability[] {

    const capabilities =
      marketRules.map(
        (rules) =>
          this.normalizeCapability(
            rules,
            product,
            synchronizedAt,
          ),
      );

    if (
      capabilities.length ===
      0
    ) {
      throw new Error(
        "Binance returned no valid spot-market capabilities.",
      );
    }

    /*
     * Commit only after every requested market
     * has been fetched and normalized.
     *
     * A failed request therefore cannot leave a
     * partially updated capability set.
     */
    if (replaceProduct) {
      for (
        const [
          key,
          capability,
        ]
        of this.capabilities
      ) {
        if (
          capability.product ===
          product
        ) {
          this.capabilities.delete(
            key,
          );
        }
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

    this.lastSynchronizationTime =
      synchronizedAt;

    return capabilities.map(
      (capability) =>
        structuredClone(
          capability,
        ),
    );
  }

  private normalizeCapability(
    rules:
      BinanceMarketRules,

    product:
      ExchangeTradingProduct,

    synchronizedAt: number,
  ): ExchangeMarketCapability {
    const supportedOrderTypes =
      this.normalizeOrderTypes(
        rules.supportedOrderTypes,
      );

    const supportedTimeInForce =
      this.resolveTimeInForce(
        supportedOrderTypes,
      );

    const status =
      rules.status
        .trim()
        .toUpperCase();

    const tradingEnabled =
      status ===
        "TRADING" &&
      rules.spotTradingAllowed;

    const maintenanceMode =
      status ===
        "BREAK" ||
      status ===
        "HALT";

    return {
      exchange:
        BINANCE_EXCHANGE,

      market:
        rules.symbol
          .trim()
          .toUpperCase(),

      baseAsset:
        rules.baseAsset
          .trim()
          .toUpperCase(),

      quoteAsset:
        rules.quoteAsset
          .trim()
          .toUpperCase(),

      product,

      tradingEnabled,

      maintenanceMode,

      order: {
        supportedOrderTypes,

        supportedTimeInForce,

        /*
         * Binance exchange-info exposes LIMIT_MAKER in each symbol's
         * orderTypes array. The signed BinanceOrderApi maps that exact
         * venue contract and rejects a timeInForce combination before I/O.
         * Report post-only only when the current market metadata explicitly
         * advertises LIMIT_MAKER; never infer it from ordinary LIMIT support.
         */
        supportsPostOnly:
          rules.supportedOrderTypes.some(
            (orderType) =>
              orderType.trim().toUpperCase() ===
                "LIMIT_MAKER",
          ),

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
            rules.minimumPrice,
          ),

        maximumPrice:
          this.positiveOrNull(
            rules.maximumPrice,
          ),

        priceStep:
          this.positiveOrNull(
            rules.priceStep,
          ),

        pricePrecision:
          this.calculatePrecision(
            rules.priceStep,
          ),
      },

      quantity: {
        minimumQuantity:
          this.positiveOrNull(
            rules.minimumQuantity,
          ),

        maximumQuantity:
          this.positiveOrNull(
            rules.maximumQuantity,
          ),

        quantityStep:
          this.positiveOrNull(
            rules.quantityStep,
          ),

        quantityPrecision:
          this.calculatePrecision(
            rules.quantityStep,
          ),
      },

      notional: {
        minimumNotional:
          this.positiveOrNull(
            rules.minimumNotional,
          ),

        maximumNotional:
          this.positiveOrNull(
            rules.maximumNotional,
          ),
      },

      fees: {
        /*
         * Binance exchange-info does not provide
         * account-specific maker/taker fees.
         *
         * These remain unknown until a dedicated
         * fee source is connected.
         */
        makerFeeRate:
          null,

        takerFeeRate:
          null,

        feeAsset:
          null,
      },

      /*
       * BinanceMarketRulesApi currently does not
       * expose a source update timestamp.
       */
      sourceUpdatedAt:
        null,

      synchronizedAt,
    };
  }

  private normalizeOrderTypes(
    orderTypes:
      readonly string[],
  ): ExchangeOrderType[] {
    const normalizedTypes =
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
          .toUpperCase()
      ) {
        case "MARKET":
          normalizedTypes.add(
            "market",
          );
          break;

        case "LIMIT":
        case "LIMIT_MAKER":
          normalizedTypes.add(
            "limit",
          );
          break;

        default:
          break;
      }
    }

    return [
      ...normalizedTypes,
    ];
  }

  private resolveTimeInForce(
    supportedOrderTypes:
      readonly ExchangeOrderType[],
  ): ExchangeTimeInForce[] {
    /*
     * Current market-rules parsing does not
     * expose Binance timeInForce metadata.
     *
     * GTC is safely associated with standard
     * limit orders. IOC and FOK are not claimed
     * until the API parser explicitly exposes
     * them.
     */
    if (
      supportedOrderTypes.includes(
        "limit",
      )
    ) {
      return [
        "GTC",
      ];
    }

    return [];
  }

  private getCachedCapability(
    market: string,

    product:
      ExchangeTradingProduct,
  ): ExchangeMarketCapability | null {
    const capability =
      this.capabilities.get(
        createExchangeCapabilityKey(
          BINANCE_EXCHANGE,
          market,
          product,
        ),
      );

    return capability
      ? structuredClone(
          capability,
        )
      : null;
  }

  private getCachedCapabilities(
    product:
      ExchangeTradingProduct,
  ): ExchangeMarketCapability[] {
    return [
      ...this.capabilities.values(),
    ]
      .filter(
        (capability) =>
          capability.product ===
          product,
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
              market.length >
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

  private calculatePrecision(
    step:
      number | null,
  ): number | null {
    if (
      step === null ||
      !Number.isFinite(
        step,
      ) ||
      step <= 0
    ) {
      return null;
    }

    /*
     * Do not use toFixed() here. Binary floating-point tails can turn an
     * authoritative step such as 0.01 into 0.01000000000000000021 and make
     * the capability look like it requires 20 decimal places. JavaScript's
     * shortest round-trip representation preserves the exchange step without
     * manufacturing precision, including scientific notation for tiny steps.
     */
    const [
      mantissa,
      exponentText,
    ] = step
      .toString()
      .toLowerCase()
      .split("e");

    const decimalDigits =
      mantissa
        .split(".")[1]
        ?.length ??
      0;

    const exponent =
      exponentText ===
        undefined
        ? 0
        : Number(
            exponentText,
          );

    if (
      !Number.isSafeInteger(
        exponent,
      )
    ) {
      return null;
    }

    return Math.max(
      0,
      decimalDigits -
        exponent,
    );
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
        `Binance capability provider does not support product: ${product}`,
      );
    }
  }
}

export const binanceCapabilityProvider =
  new BinanceCapabilityProvider();
