import axios from "axios";

import { COINDCX } from "./constants";

export interface CoinDCXMarketDetails {
  symbol?: string;
  coindcx_name?: string;
  pair?: string;

  base_currency_short_name?: string;
  target_currency_short_name?: string;

  status?: string;

  min_quantity?: number | string;
  max_quantity?: number | string;

  min_price?: number | string;
  max_price?: number | string;

  min_notional?: number | string;

  base_currency_precision?: number | string;
  target_currency_precision?: number | string;

  step?: number | string;

  order_types?: string[];
}

export interface LoadedCoinDCXMarket {
  symbol: string;
  pair: string;

  baseCurrency: string;
  quoteCurrency: string;

  minimumQuantity: number;
  maximumQuantity: number | null;

  minimumPrice: number;
  maximumPrice: number | null;

  minimumNotional: number;

  pricePrecision: number;
  quantityPrecision: number;

  quantityStep: number;

  orderTypes: string[];
}

export async function loadMarkets(): Promise<
  LoadedCoinDCXMarket[]
> {
  const url =
    COINDCX.REST.BASE_URL +
    COINDCX.REST.MARKETS;

  const response = await axios.get<
    CoinDCXMarketDetails[]
  >(url, {
    timeout: 10_000,
  });

  if (!Array.isArray(response.data)) {
    throw new Error(
      "Invalid CoinDCX markets response.",
    );
  }

  const markets =
    new Map<
      string,
      LoadedCoinDCXMarket
    >();

  for (const market of response.data) {
    if (
      market.status
        ?.trim()
        .toLowerCase() !== "active"
    ) {
      continue;
    }

    const symbol = (
      market.symbol ??
      market.coindcx_name ??
      ""
    )
      .trim()
      .toUpperCase();

    const pair =
      market.pair
        ?.trim()
        .toUpperCase() ??
      "";

    const baseCurrency =
      market.base_currency_short_name
        ?.trim()
        .toUpperCase() ??
      "";

    const quoteCurrency =
      market.target_currency_short_name
        ?.trim()
        .toUpperCase() ??
      "";

    if (
      !symbol ||
      !pair ||
      !baseCurrency ||
      !quoteCurrency
    ) {
      continue;
    }

    const minimumQuantity =
      thisNumber(
        market.min_quantity,
        0,
      );

    const maximumQuantity =
      optionalPositiveNumber(
        market.max_quantity,
      );

    const minimumPrice =
      thisNumber(
        market.min_price,
        0,
      );

    const maximumPrice =
      optionalPositiveNumber(
        market.max_price,
      );

    const minimumNotional =
      thisNumber(
        market.min_notional,
        0,
      );

    const pricePrecision =
      nonNegativeInteger(
        market.base_currency_precision,
      );

    const quantityPrecision =
      nonNegativeInteger(
        market.target_currency_precision,
      );

    const quantityStep =
      thisNumber(
        market.step,
        0,
      );

    markets.set(symbol, {
      symbol,
      pair,

      baseCurrency,
      quoteCurrency,

      minimumQuantity,
      maximumQuantity,

      minimumPrice,
      maximumPrice,

      minimumNotional,

      pricePrecision,
      quantityPrecision,

      quantityStep,

      orderTypes:
        Array.isArray(
          market.order_types,
        )
          ? market.order_types
              .filter(
                (
                  orderType,
                ): orderType is string =>
                  typeof orderType ===
                    "string" &&
                  orderType.trim().length >
                    0,
              )
              .map((orderType) =>
                orderType
                  .trim()
                  .toLowerCase(),
              )
          : [],
    });
  }

  return Array.from(
    markets.values(),
  );
}

function thisNumber(
  value:
    | number
    | string
    | undefined,
  fallback: number,
): number {
  const parsed =
    Number(value);

  return Number.isFinite(parsed) &&
    parsed >= 0
    ? parsed
    : fallback;
}

function optionalPositiveNumber(
  value:
    | number
    | string
    | undefined,
): number | null {
  const parsed =
    Number(value);

  return Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

function nonNegativeInteger(
  value:
    | number
    | string
    | undefined,
): number {
  const parsed =
    Number(value);

  return Number.isFinite(parsed) &&
    parsed >= 0
    ? Math.floor(parsed)
    : 0;
}