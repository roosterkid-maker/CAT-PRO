import {
  normalizeUnoCoinMarket,
} from "../../../../exchanges/unocoin/normalize";

import {
  UNOCOIN,
} from "../../../../exchanges/unocoin/constants";

import {
  normalizeUnoCoinFeeRules,
} from "../../../../exchanges/unocoin/feeRules";

import {
  unoCoinPublicApi,
  type UnoCoinPublicMarketApi,
} from "../../../../exchanges/unocoin/UnoCoinPublicApi";

import type {
  UnoCoinBaseCoinSettings,
  UnoCoinPair,
} from "../../../../exchanges/unocoin/types";

import {
  createExchangeCapabilityKey,
  type ExchangeMarketCapability,
  type ExchangeTradingProduct,
} from "../../models/ExchangeCapability";

import type {
  ExchangeCapabilityProvider,
  ExchangeCapabilityQuery,
} from "../ExchangeCapabilityProvider";

const UNOCOIN_EXCHANGE =
  "unocoin";

const DEFAULT_PRODUCT:
  ExchangeTradingProduct =
  "spot";

export class UnoCoinCapabilityProvider
  implements ExchangeCapabilityProvider
{
  readonly exchange =
    UNOCOIN_EXCHANGE;

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
    private readonly api:
      UnoCoinPublicMarketApi =
      unoCoinPublicApi,
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
      normalizeUnoCoinMarket(
        market,
      );

    if (!normalizedMarket) {
      throw new Error(
        "UnoCoin capability lookup requires a market.",
      );
    }

    if (!this.isSynchronized()) {
      await this.synchronize(
        product,
      );
    }

    const capability =
      this.capabilities
        .get(
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
    this.capabilities
      .clear();

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
    if (
      this.synchronizationPromise
    ) {
      await this
        .synchronizationPromise;

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
    const [
      pairs,
      baseCoinSettings,
    ] =
      await Promise.all([
        this.api.getPairs(),
        this.api.getBaseCoinSettings(),
      ]);

    const synchronizedAt =
      Date.now();

    const nextCapabilities =
      new Map<
        string,
        ExchangeMarketCapability
      >();

    for (
      const pair
      of pairs
    ) {
      const capability =
        this.normalizePair(
          pair,
          baseCoinSettings,
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
        "UnoCoin returned no valid spot-market capabilities.",
      );
    }

    this.capabilities
      .clear();

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
  }

  private normalizePair(
    pair:
      UnoCoinPair,

    baseCoinSettings:
      UnoCoinBaseCoinSettings,

    product:
      ExchangeTradingProduct,

    synchronizedAt: number,
  ): ExchangeMarketCapability | null {
    const market =
      normalizeUnoCoinMarket(
        pair.ticker_id,
      );

    const quoteAsset =
      this.normalizeAsset(
        pair.base,
      );

    const baseAsset =
      this.normalizeAsset(
        pair.target,
      );

    if (
      !market ||
      !baseAsset ||
      !quoteAsset
    ) {
      return null;
    }

    const feeRules =
      normalizeUnoCoinFeeRules(
        baseCoinSettings[
          quoteAsset
        ] ??
          {},
      );

    return {
      exchange:
        this.exchange,

      market,

      /*
       * UnoCoin names the quote currency "base" and
       * the traded coin "target" in this endpoint.
       * Normalize those fields into CAT PRO's common
       * base-asset / quote-asset convention.
       */
      baseAsset,

      quoteAsset,

      product,

      /*
       * The public pairs response is the documented
       * current exchange-pair catalog. It does not
       * expose a separate maintenance flag.
       */
      tradingEnabled:
        true,

      maintenanceMode:
        false,

      order: {
        supportedOrderTypes: [
          "market",
          "limit",
        ],

        /*
         * The official contract does not state GTC,
         * IOC, or FOK semantics for ordinary orders.
         */
        supportedTimeInForce:
          [],

        supportsPostOnly:
          false,

        supportsClientOrderId:
          false,

        supportsOrderCancellation:
          true,

        supportsOrderStatusPolling:
          true,
      },

      /*
       * The pair catalog does not publish pair-specific tick/lot steps, so
       * those remain unknown. The official exchange order/history contract
       * does, however, serialize both `rate` and `volume` at eight decimal
       * places. Preserve that documented representation ceiling so PAPER
       * orders can be normalized without inventing a tick size.
       */
      price: {
        minimumPrice:
          null,

        maximumPrice:
          null,

        priceStep:
          null,

        pricePrecision:
          UNOCOIN
            .EXCHANGE_DECIMAL_PRECISION,
      },

      quantity: {
        minimumQuantity:
          feeRules
            ?.minimumVolume ??
          null,

        maximumQuantity:
          null,

        quantityStep:
          null,

        quantityPrecision:
          UNOCOIN
            .EXCHANGE_DECIMAL_PRECISION,
      },

      notional: {
        minimumNotional:
          feeRules
            ?.minimumNotional ??
          null,

        maximumNotional:
          feeRules
            ?.maximumNotional ??
          null,
      },

      /*
       * UnoCoin's public base-coin settings are
       * quote-specific. Rates include the published
       * tax percentage for that quote currency.
       */
      fees: {
        makerFeeRate:
          feeRules
            ?.makerFeeRate ??
          null,

        takerFeeRate:
          feeRules
            ?.takerFeeRate ??
          null,

        feeAsset:
          feeRules
            ? quoteAsset
            : null,
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
      ...this.capabilities
        .values(),
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
              normalizeUnoCoinMarket(
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

  private assertSupportedProduct(
    product:
      ExchangeTradingProduct,
  ): void {
    if (
      product !==
        "spot"
    ) {
      throw new Error(
        `UnoCoin capability provider does not support product: ${product}`,
      );
    }
  }
}

export const unoCoinCapabilityProvider =
  new UnoCoinCapabilityProvider();
