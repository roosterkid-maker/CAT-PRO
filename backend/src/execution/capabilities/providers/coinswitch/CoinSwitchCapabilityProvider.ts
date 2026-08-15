import {
  COINSWITCH_PUBLIC_VENUES,
  type CoinSwitchPublicVenue,
} from "../../../../exchanges/coinswitch/constants";

import {
  getExchangeFeeEvidence,
} from "../../../../arbitrage/config/fees";

import {
  getCoinSwitchMarketRuleEvidence,
} from "../../../../exchanges/coinswitch/CoinSwitchMarketRuleEvidence";

import {
  normalizeCoinSwitchTicker,
} from "../../../../exchanges/coinswitch/normalize";

import {
  coinSwitchPublicApi,
  type CoinSwitchPublicMarketApi,
} from "../../../../exchanges/coinswitch/CoinSwitchPublicApi";

import type {
  CoinSwitchTicker,
} from "../../../../exchanges/coinswitch/types";

import {
  createExchangeCapabilityKey,
  type ExchangeMarketCapability,
  type ExchangeTradingProduct,
} from "../../models/ExchangeCapability";

import type {
  ExchangeCapabilityProvider,
  ExchangeCapabilityQuery,
} from "../ExchangeCapabilityProvider";

const COINSWITCH_EXCHANGE =
  "coinswitch";

const DEFAULT_PRODUCT:
  ExchangeTradingProduct =
  "spot";

export class CoinSwitchCapabilityProvider
  implements ExchangeCapabilityProvider
{
  readonly exchange =
    COINSWITCH_EXCHANGE;

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
      CoinSwitchPublicMarketApi =
      coinSwitchPublicApi,
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
        "CoinSwitch capability lookup requires a market.",
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
      ? this.withCurrentEvidence(
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
    const responses =
      await Promise.allSettled(
        COINSWITCH_PUBLIC_VENUES.map(
          async (
            venue,
          ) => ({
            venue,

            tickers:
              await this.api.getTickers(
                venue,
              ),
          }),
        ),
      );

    const synchronizedAt =
      Date.now();

    const nextCapabilities =
      new Map<
        string,
        ExchangeMarketCapability
      >();

    for (const response of responses) {
      if (
        response.status !==
        "fulfilled"
      ) {
        continue;
      }

      for (
        const [
          responseSymbol,
          ticker,
        ]
        of Object.entries(
          response.value.tickers,
        )
      ) {
        const capability =
          this.normalizeTicker(
            response.value.venue,
            responseSymbol,
            ticker,
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
    }

    if (
      nextCapabilities.size ===
        0
    ) {
      throw new Error(
        "CoinSwitch returned no valid public spot-market capabilities.",
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

  private normalizeTicker(
    venue:
      CoinSwitchPublicVenue,

    responseSymbol: string,

    ticker:
      CoinSwitchTicker,

    product:
      ExchangeTradingProduct,

    synchronizedAt: number,
  ): ExchangeMarketCapability | null {
    const normalized =
      normalizeCoinSwitchTicker(
        venue,
        responseSymbol,
        ticker,
        synchronizedAt,
      );

    if (!normalized) {
      return null;
    }

    return {
      exchange:
        this.exchange,

      market:
        normalized.descriptor.market,

      baseAsset:
        normalized.descriptor.baseAsset,

      quoteAsset:
        normalized.descriptor.quoteAsset,

      product,

      /*
       * The public all-pairs ticker catalog is the
       * available-market evidence. It does not expose
       * a separate per-pair maintenance flag.
       */
      tradingEnabled:
        true,

      maintenanceMode:
        false,

      order: {
        /*
         * The audited CoinSwitch create-order contract
         * currently documents LIMIT orders only.
         */
        supportedOrderTypes: [
          "limit",
        ],

        supportedTimeInForce:
          [],

        supportsPostOnly:
          false,

        supportsClientOrderId:
          true,

        supportsOrderCancellation:
          true,

        supportsOrderStatusPolling:
          true,
      },

      /*
       * Precision, increment, notional, and fee data
       * are available only from signed surfaces in the
       * audited contract. Unknown remains fail-closed.
       */
      price: {
        minimumPrice:
          null,

        maximumPrice:
          null,

        priceStep:
          null,

        pricePrecision:
          null,
      },

      quantity: {
        minimumQuantity:
          null,

        maximumQuantity:
          null,

        quantityStep:
          null,

        quantityPrecision:
          null,
      },

      notional: {
        minimumNotional:
          null,

        maximumNotional:
          null,
      },

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
          this.withCurrentEvidence(
            capability,
          ),
      );
  }

  private withCurrentEvidence(
    capability:
      ExchangeMarketCapability,
  ): ExchangeMarketCapability {
    const feeEvidence =
      getExchangeFeeEvidence(
        COINSWITCH_EXCHANGE,
        capability.market,
      );

    const ruleEvidence =
      getCoinSwitchMarketRuleEvidence(
        capability.market,
      );

    const cloned =
      structuredClone(
        capability,
      );

    return {
      ...cloned,

      price:
        ruleEvidence
          ? {
              ...cloned.price,
              priceStep:
                ruleEvidence.priceStep,
              pricePrecision:
                ruleEvidence.pricePrecision,
            }
          : cloned.price,

      quantity:
        ruleEvidence
          ? {
              ...cloned.quantity,
              quantityStep:
                ruleEvidence.quantityStep,
              quantityPrecision:
                ruleEvidence.quantityPrecision,
            }
          : cloned.quantity,

      notional:
        ruleEvidence
          ? {
              minimumNotional:
                ruleEvidence.minimumNotional,
              maximumNotional:
                ruleEvidence.maximumNotional,
            }
          : cloned.notional,

      fees: {
        makerFeeRate:
          feeEvidence?.source ===
            "ACCOUNT_API"
            ? feeEvidence.makerPercent /
              100
            : null,

        takerFeeRate:
          feeEvidence?.source ===
            "ACCOUNT_API"
            ? feeEvidence.takerPercent /
              100
            : null,

        feeAsset:
          feeEvidence?.source ===
            "ACCOUNT_API"
            ? capability.quoteAsset
            : null,
      },
    };
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
    const assets =
      market
        .trim()
        .toUpperCase()
        .split(
          /[\s_,\-/]+/,
        )
        .filter(
          (asset) =>
            asset.length >
            0,
        );

    return assets.length ===
      2
      ? `${assets[0]}_${assets[1]}`
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
        `CoinSwitch capability provider does not support product: ${product}`,
      );
    }
  }
}

export const coinSwitchCapabilityProvider =
  new CoinSwitchCapabilityProvider();
