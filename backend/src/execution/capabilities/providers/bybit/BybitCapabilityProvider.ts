import {
  loadBybitSpotInstruments,
  type BybitSpotInstrument,
} from "../../../../exchanges/bybit/marketLoader";

import {
  createExchangeCapabilityKey,
  type ExchangeMarketCapability,
  type ExchangeTradingProduct,
} from "../../models/ExchangeCapability";

import type {
  ExchangeCapabilityProvider,
  ExchangeCapabilityQuery,
} from "../ExchangeCapabilityProvider";

const BYBIT_EXCHANGE =
  "bybit";

const DEFAULT_PRODUCT:
  ExchangeTradingProduct =
  "spot";

export type BybitSpotInstrumentLoader =
  () => Promise<BybitSpotInstrument[]>;

export class BybitCapabilityProvider
  implements ExchangeCapabilityProvider
{
  readonly exchange =
    BYBIT_EXCHANGE;

  private readonly capabilities =
    new Map<
      string,
      ExchangeMarketCapability
    >();

  private lastSynchronizationTime:
    number | null =
    null;

  private synchronizationPromise:
    Promise<void> | null =
    null;

  constructor(
    private readonly loadInstruments:
      BybitSpotInstrumentLoader =
      loadBybitSpotInstruments,
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

    const requestedMarkets =
      this.normalizeMarkets(
        query.markets,
      );

    if (
      query.forceRefresh ===
        true ||
      !this.isSynchronized()
    ) {
      await this.synchronize(
        product,
      );
    }

    return this.selectCapabilities(
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
        "Bybit capability lookup requires a market.",
      );
    }

    if (!this.isSynchronized()) {
      await this.synchronize(
        product,
      );
    }

    const capability =
      this.capabilities.get(
        createExchangeCapabilityKey(
          this.exchange,
          normalizedMarket,
          product,
        ),
      );

    return capability
      ? structuredClone(
          capability,
        )
      : null;
  }

  invalidateCache():
    void {
    this.capabilities.clear();

    this.lastSynchronizationTime =
      null;
  }

  getLastSynchronizationTime():
    number | null {
    return this.lastSynchronizationTime;
  }

  isSynchronized():
    boolean {
    return (
      this.lastSynchronizationTime !==
        null &&
      this.capabilities.size >
        0
    );
  }

  private async synchronize(
    product:
      ExchangeTradingProduct,
  ): Promise<void> {
    if (this.synchronizationPromise) {
      await this.synchronizationPromise;

      return;
    }

    const synchronizationPromise =
      this.synchronizeNow(
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
  }

  private async synchronizeNow(
    product:
      ExchangeTradingProduct,
  ): Promise<void> {
    const instruments =
      await this.loadInstruments();

    const synchronizedAt =
      Date.now();

    const nextCapabilities =
      new Map<
        string,
        ExchangeMarketCapability
      >();

    for (const instrument of instruments) {
      const capability =
        this.normalizeInstrument(
          instrument,
          product,
          synchronizedAt,
        );

      if (!capability) {
        continue;
      }

      nextCapabilities.set(
        createExchangeCapabilityKey(
          capability.exchange,
          capability.market,
          capability.product,
        ),
        capability,
      );
    }

    if (
      nextCapabilities.size ===
        0
    ) {
      throw new Error(
        "Bybit returned no valid spot-market capabilities.",
      );
    }

    this.capabilities.clear();

    for (
      const [key, capability]
      of nextCapabilities
    ) {
      this.capabilities.set(
        key,
        capability,
      );
    }

    this.lastSynchronizationTime =
      synchronizedAt;
  }

  private normalizeInstrument(
    instrument:
      BybitSpotInstrument,

    product:
      ExchangeTradingProduct,

    synchronizedAt: number,
  ): ExchangeMarketCapability | null {
    const market =
      this.normalizeMarket(
        instrument.symbol,
      );

    const baseAsset =
      this.normalizeAsset(
        instrument.baseCoin,
      );

    const quoteAsset =
      this.normalizeAsset(
        instrument.quoteCoin,
      );

    if (
      !market ||
      !baseAsset ||
      !quoteAsset
    ) {
      return null;
    }

    const status =
      instrument.status
        .trim()
        .toUpperCase();

    const priceStep =
      this.positiveOrNull(
        instrument.priceFilter
          ?.tickSize,
      );

    const quantityStep =
      this.positiveOrNull(
        instrument.lotSizeFilter
          ?.basePrecision,
      );

    const maximumQuantity =
      this.minimumKnownMaximum(
        instrument.lotSizeFilter
          ?.maxLimitOrderQty,
        instrument.lotSizeFilter
          ?.maxMarketOrderQty,
      );

    return {
      exchange:
        this.exchange,

      market,

      baseAsset,

      quoteAsset,

      product,

      tradingEnabled:
        status ===
        "TRADING",

      maintenanceMode:
        status !==
        "TRADING",

      order: {
        supportedOrderTypes: [
          "market",
          "limit",
        ],

        supportedTimeInForce: [
          "GTC",
          "IOC",
          "FOK",
        ],

        supportsPostOnly:
          true,

        supportsClientOrderId:
          true,

        supportsOrderCancellation:
          true,

        supportsOrderStatusPolling:
          true,
      },

      price: {
        minimumPrice:
          null,

        maximumPrice:
          null,

        priceStep,

        pricePrecision:
          this.calculatePrecision(
            priceStep,
          ),
      },

      quantity: {
        /*
         * minOrderQty is deprecated for current
         * spot instruments. minOrderAmt is the
         * authoritative lower-bound constraint.
         */
        minimumQuantity:
          null,

        /*
         * The common model has one maximum. Use the
         * lower of the separately documented LIMIT
         * and MARKET maxima so it is safe for both.
         */
        maximumQuantity,

        quantityStep,

        quantityPrecision:
          this.calculatePrecision(
            quantityStep,
          ),
      },

      notional: {
        minimumNotional:
          this.positiveOrNull(
            instrument.lotSizeFilter
              ?.minOrderAmt,
          ),

        /*
         * maxOrderAmt is deprecated in the current
         * spot contract and is deliberately ignored.
         */
        maximumNotional:
          null,
      },

      /*
       * Public instrument metadata does not prove
       * account-specific fees.
       */
      fees: {
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

  private selectCapabilities(
    product:
      ExchangeTradingProduct,

    requestedMarkets:
      readonly string[],
  ): ExchangeMarketCapability[] {
    const requestedMarketSet =
      requestedMarkets.length >
        0
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
          .map(
            (market) =>
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
    ];
  }

  private normalizeMarket(
    market: string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_,\-/]+/g,
        "",
      );
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

  private positiveOrNull(
    value: unknown,
  ): number | null {
    const parsed =
      typeof value ===
        "string" ||
      typeof value ===
        "number"
        ? Number(
            value,
          )
        : Number.NaN;

    return (
      Number.isFinite(
        parsed,
      ) &&
      parsed >
        0
    )
      ? parsed
      : null;
  }

  private minimumKnownMaximum(
    limitMaximum: unknown,

    marketMaximum: unknown,
  ): number | null {
    const normalizedLimit =
      this.positiveOrNull(
        limitMaximum,
      );

    const normalizedMarket =
      this.positiveOrNull(
        marketMaximum,
      );

    return normalizedLimit !==
        null &&
      normalizedMarket !==
        null
      ? Math.min(
          normalizedLimit,
          normalizedMarket,
        )
      : null;
  }

  private calculatePrecision(
    step: number | null,
  ): number | null {
    if (
      step ===
        null
    ) {
      return null;
    }

    const normalized =
      step
        .toString()
        .toLowerCase();

    const [
      coefficient =
        normalized,
      exponentText,
    ] =
      normalized.split(
        "e",
      );

    const coefficientPrecision =
      coefficient.split(
        ".",
      )[1]?.length ??
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
      coefficientPrecision -
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
        `Bybit capability provider does not support product: ${product}`,
      );
    }
  }
}

export const bybitCapabilityProvider =
  new BybitCapabilityProvider();
