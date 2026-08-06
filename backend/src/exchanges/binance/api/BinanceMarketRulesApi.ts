import {
  BINANCE,
} from "../constants";

import {
  binanceHttpClient,
} from "./BinanceHttpClient";

export interface BinanceMarketRules {
  symbol: string;

  status: string;

  baseAsset: string;

  quoteAsset: string;

  spotTradingAllowed: boolean;

  minimumPrice: number;

  maximumPrice: number;

  priceStep: number;

  minimumQuantity: number;

  maximumQuantity: number;

  quantityStep: number;

  minimumNotional: number;

  maximumNotional:
    | number
    | null;

  supportedOrderTypes:
    string[];
}

interface BinanceExchangeInfoResponse {
  symbols?: unknown;
}

interface BinanceSymbolResponse {
  symbol?: unknown;

  status?: unknown;

  baseAsset?: unknown;

  quoteAsset?: unknown;

  isSpotTradingAllowed?: unknown;

  orderTypes?: unknown;

  filters?: unknown;
}

interface BinanceFilterResponse {
  filterType?: unknown;

  minPrice?: unknown;

  maxPrice?: unknown;

  tickSize?: unknown;

  minQty?: unknown;

  maxQty?: unknown;

  stepSize?: unknown;

  minNotional?: unknown;

  maxNotional?: unknown;
}

export class BinanceMarketRulesApi {
  async getMarketRules(
    symbol: string,
  ): Promise<BinanceMarketRules> {
    const normalizedSymbol =
      this.requireSymbol(
        symbol,
      );

    const response =
      await binanceHttpClient.getPublic<
        BinanceExchangeInfoResponse
      >(
        BINANCE.REST.EXCHANGE_INFO,
        {
          symbol:
            normalizedSymbol,
        },
      );

    if (
      !Array.isArray(
        response.symbols,
      )
    ) {
      throw new Error(
        "Invalid Binance exchange-info response.",
      );
    }

    const rawSymbol =
      response.symbols.find(
        (value) => {
          if (!this.isRecord(value)) {
            return false;
          }

          return (
            this.toOptionalString(
              value.symbol,
            )
              ?.toUpperCase() ===
            normalizedSymbol
          );
        },
      );

    if (!rawSymbol) {
      throw new Error(
        `Binance market rules not found: ${normalizedSymbol}`,
      );
    }

    return this.normalizeRules(
      rawSymbol,
    );
  }

  private normalizeRules(
    value: unknown,
  ): BinanceMarketRules {
    if (!this.isRecord(value)) {
      throw new Error(
        "Invalid Binance symbol response.",
      );
    }

    const response =
      value as BinanceSymbolResponse;

    const symbol =
      this.toOptionalString(
        response.symbol,
      )
        ?.toUpperCase() ??
      null;

    const baseAsset =
      this.toOptionalString(
        response.baseAsset,
      )
        ?.toUpperCase() ??
      null;

    const quoteAsset =
      this.toOptionalString(
        response.quoteAsset,
      )
        ?.toUpperCase() ??
      null;

    if (
      !symbol ||
      !baseAsset ||
      !quoteAsset
    ) {
      throw new Error(
        "Binance symbol metadata is incomplete.",
      );
    }

    const filters =
      Array.isArray(
        response.filters,
      )
        ? response.filters.filter(
            (
              filter,
            ): filter is Record<
              string,
              unknown
            > =>
              this.isRecord(
                filter,
              ),
          )
        : [];

    const priceFilter =
      this.findFilter(
        filters,
        "PRICE_FILTER",
      );

    const lotSizeFilter =
      this.findFilter(
        filters,
        "LOT_SIZE",
      );

    const minNotionalFilter =
      this.findFilter(
        filters,
        "MIN_NOTIONAL",
      );

    const notionalFilter =
      this.findFilter(
        filters,
        "NOTIONAL",
      );

    const minimumNotional =
      this.toNonNegativeNumber(
        notionalFilter
          ?.minNotional ??
          minNotionalFilter
            ?.minNotional,
      );

    const maximumNotionalValue =
      this.toNonNegativeNumber(
        notionalFilter
          ?.maxNotional,
      );

    const supportedOrderTypes =
      Array.isArray(
        response.orderTypes,
      )
        ? response.orderTypes
            .map((orderType) =>
              this.toOptionalString(
                orderType,
              ),
            )
            .filter(
              (
                orderType,
              ): orderType is string =>
                orderType !== null,
            )
        : [];

    return {
      symbol,

      status:
        this.toOptionalString(
          response.status,
        ) ??
        "UNKNOWN",

      baseAsset,

      quoteAsset,

      spotTradingAllowed:
        response.isSpotTradingAllowed !==
        false,

      minimumPrice:
        this.toNonNegativeNumber(
          priceFilter?.minPrice,
        ),

      maximumPrice:
        this.toNonNegativeNumber(
          priceFilter?.maxPrice,
        ),

      priceStep:
        this.toNonNegativeNumber(
          priceFilter?.tickSize,
        ),

      minimumQuantity:
        this.toNonNegativeNumber(
          lotSizeFilter?.minQty,
        ),

      maximumQuantity:
        this.toNonNegativeNumber(
          lotSizeFilter?.maxQty,
        ),

      quantityStep:
        this.toNonNegativeNumber(
          lotSizeFilter?.stepSize,
        ),

      minimumNotional,

      maximumNotional:
        maximumNotionalValue > 0
          ? maximumNotionalValue
          : null,

      supportedOrderTypes,
    };
  }

  private findFilter(
    filters:
      Record<string, unknown>[],
    filterType: string,
  ): BinanceFilterResponse | null {
    const filter =
      filters.find(
        (candidate) =>
          this.toOptionalString(
            candidate.filterType,
          ) ===
          filterType,
      );

    return filter
      ? filter
      : null;
  }

  private requireSymbol(
    symbol: string,
  ): string {
    const normalized =
      symbol
        .trim()
        .toUpperCase();

    if (!normalized) {
      throw new Error(
        "Binance symbol is required.",
      );
    }

    return normalized;
  }

  private toNonNegativeNumber(
    value: unknown,
  ): number {
    const numberValue =
      Number(
        value ??
        0,
      );

    if (
      !Number.isFinite(
        numberValue,
      ) ||
      numberValue < 0
    ) {
      return 0;
    }

    return numberValue;
  }

  private toOptionalString(
    value: unknown,
  ): string | null {
    if (
      typeof value !==
      "string"
    ) {
      return null;
    }

    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
  }

  private isRecord(
    value: unknown,
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value ===
        "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }
}

export const binanceMarketRulesApi =
  new BinanceMarketRulesApi();