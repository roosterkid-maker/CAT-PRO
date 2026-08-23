import {
  zebPayPublicApi,
  type ZebPayPublicMarketApi,
} from "../../../../exchanges/zebpay/ZebPayPublicApi";

import type {
  ZebPayTradePair,
} from "../../../../exchanges/zebpay/types";

import {
  createExchangeCapabilityKey,
  type ExchangeMarketCapability,
  type ExchangeTradingProduct,
} from "../../models/ExchangeCapability";

import type {
  ExchangeCapabilityProvider,
  ExchangeCapabilityQuery,
} from "../ExchangeCapabilityProvider";

const EXCHANGE =
  "zebpay";

export class ZebPayCapabilityProvider
  implements ExchangeCapabilityProvider
{
  readonly exchange =
    EXCHANGE;

  private readonly capabilities =
    new Map<
      string,
      ExchangeMarketCapability
    >();

  private lastSynchronizationTime:
    number | null = null;

  private synchronizationPromise:
    Promise<void> | null = null;

  constructor(
    private readonly api:
      ZebPayPublicMarketApi =
      zebPayPublicApi,
    private readonly now:
      () => number =
      Date.now,
  ) {}

  async getCapabilities(
    query:
      ExchangeCapabilityQuery = {},
  ): Promise<
    readonly ExchangeMarketCapability[]
  > {
    this.assertSpot(
      query.product ??
        "spot",
    );

    if (
      query.forceRefresh ===
        true ||
      !this.isSynchronized()
    ) {
      await this.synchronize();
    }

    const requested =
      new Set(
        (
          query.markets ??
          []
        ).map(
          canonicalMarket,
        ),
      );

    return [
      ...this.capabilities
        .values(),
    ]
      .filter(
        (capability) =>
          requested.size ===
            0 ||
          requested.has(
            canonicalMarket(
              capability.market,
            ),
          ),
      )
      .sort(
        (first, second) =>
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

  async getCapability(
    market: string,
    product:
      ExchangeTradingProduct =
      "spot",
  ): Promise<
    ExchangeMarketCapability | null
  > {
    this.assertSpot(product);

    if (!this.isSynchronized()) {
      await this.synchronize();
    }

    const capability =
      this.capabilities.get(
        createExchangeCapabilityKey(
          EXCHANGE,
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
    return this.lastSynchronizationTime !==
        null &&
      this.capabilities.size >
        0;
  }

  private async synchronize():
    Promise<void> {
    if (this.synchronizationPromise) {
      await this.synchronizationPromise;
      return;
    }

    const synchronization =
      this.synchronizeNow();

    this.synchronizationPromise =
      synchronization;

    try {
      await synchronization;
    } finally {
      if (
        this.synchronizationPromise ===
        synchronization
      ) {
        this.synchronizationPromise =
          null;
      }
    }
  }

  private async synchronizeNow():
    Promise<void> {
    const [
      markets,
      tradePairs,
    ] = await Promise.all([
      this.api.getMarkets(),
      this.api.getTradePairs(),
    ]);

    const currentCatalog =
      new Set(
        markets
          .map(
            (market) =>
              canonicalMarket(
                market.pair ??
                  "",
              ),
          )
          .filter(Boolean),
      );

    const synchronizedAt =
      this.now();

    const next =
      new Map<
        string,
        ExchangeMarketCapability
      >();

    for (const tradePair of tradePairs) {
      const capability =
        this.normalize(
          tradePair,
          currentCatalog,
          synchronizedAt,
        );

      if (!capability) {
        continue;
      }

      next.set(
        createExchangeCapabilityKey(
          EXCHANGE,
          capability.market,
          "spot",
        ),
        capability,
      );
    }

    if (next.size === 0) {
      throw new Error(
        "ZebPay capability synchronization produced no active Spot markets.",
      );
    }

    this.capabilities.clear();

    for (const [key, value] of next) {
      this.capabilities.set(
        key,
        value,
      );
    }

    this.lastSynchronizationTime =
      synchronizedAt;
  }

  private normalize(
    pair:
      ZebPayTradePair,
    currentCatalog:
      ReadonlySet<string>,
    synchronizedAt: number,
  ): ExchangeMarketCapability | null {
    const market =
      normalizeVenueMarket(
        pair.tradePairName,
      );

    const baseAsset =
      normalizeAsset(
        pair.tradeVolumeCurrency,
      );

    const quoteAsset =
      normalizeAsset(
        pair.tradeDenominationCurrency,
      );

    if (
      !market ||
      !baseAsset ||
      !quoteAsset ||
      !currentCatalog.has(
        canonicalMarket(
          market,
        ),
      )
    ) {
      return null;
    }

    const tradingEnabled =
      booleanValue(
        pair.isEnable,
      );

    const quantityPrecision =
      nonNegativeInteger(
        pair.tradeCurrencyInputDecimalPlaces ??
          pair.volumeCurrencyDecimalPlaces,
      );

    const pricePrecision =
      nonNegativeInteger(
        pair.denominationCurrencyInputDecimalPlaces ??
          pair.denominationCurrencyDecimalPlaces,
      );

    const quantityStep =
      quantityPrecision ===
        null
        ? null
        : 10 **
          -quantityPrecision;

    const minimumQuantity =
      positiveNumber(
        pair.sellMinQuantityPerTransaction,
      );

    return {
      exchange:
        EXCHANGE,
      market,
      baseAsset,
      quoteAsset,
      product:
        "spot",
      tradingEnabled,
      maintenanceMode:
        !tradingEnabled,
      order: {
        supportedOrderTypes:
          booleanValue(
            pair.isMarketOrderEnabled,
          )
            ? [
                "limit",
                "market",
              ]
            : [
                "limit",
              ],
        supportedTimeInForce: [
          "GTC",
        ],
        supportsPostOnly:
          false,
        supportsClientOrderId:
          false,
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
        priceStep:
          positiveNumber(
            pair.tradeTickSize ??
              pair.tickSize,
          ),
        pricePrecision,
      },
      quantity: {
        minimumQuantity,
        maximumQuantity:
          null,
        quantityStep,
        quantityPrecision,
      },
      notional: {
        minimumNotional:
          positiveNumber(
            pair.tradeMinimumAmount,
          ),
        maximumNotional:
          positiveNumber(
            pair.tradeMaximumAmount,
          ),
      },
      fees: {
        makerFeeRate:
          percentToRate(
            pair.makerFeePercent ??
              pair.makerFeesWithoutTax,
          ),
        takerFeeRate:
          percentToRate(
            pair.takerFeePercent ??
              pair.takerFeesWithoutTax,
          ),
        feeAsset:
          quoteAsset,
      },
      sourceUpdatedAt:
        null,
      synchronizedAt,
    };
  }

  private assertSpot(
    product:
      ExchangeTradingProduct,
  ): void {
    if (product !== "spot") {
      throw new Error(
        `ZebPay capability provider does not support product: ${product}.`,
      );
    }
  }
}

function normalizeVenueMarket(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toUpperCase()
    .replace(
      /[_/\s]+/gu,
      "-",
    );
}

function canonicalMarket(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/gu,
      "",
    );
}

function normalizeAsset(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  return /^[A-Z0-9]+$/u
    .test(normalized)
      ? normalized
      : "";
}

function positiveNumber(
  value: unknown,
): number | null {
  const parsed =
    Number(value);

  return Number.isFinite(parsed) &&
    parsed > 0
      ? parsed
      : null;
}

function percentToRate(
  value: unknown,
): number | null {
  const percent =
    positiveNumber(value);

  return percent === null
    ? null
    : percent /
      100;
}

function nonNegativeInteger(
  value: unknown,
): number | null {
  const parsed =
    Number(value);

  return Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= 18
      ? parsed
      : null;
}

function booleanValue(
  value: unknown,
): boolean {
  return value === true ||
    value === 1 ||
    (
      typeof value ===
        "string" &&
      [
        "true",
        "1",
        "yes",
      ].includes(
        value
          .trim()
          .toLowerCase(),
      )
    );
}

export const zebPayCapabilityProvider =
  new ZebPayCapabilityProvider();
