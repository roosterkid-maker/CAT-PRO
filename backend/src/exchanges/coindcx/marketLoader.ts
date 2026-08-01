import axios from "axios";

import { COINDCX } from "./constants";

export interface CoinDCXMarketDetails {
  symbol: string;
  pair: string;

  base_currency_short_name: string;
  target_currency_short_name: string;

  status: string;
}

export interface LoadedCoinDCXMarket {
  symbol: string;
  pair: string;

  baseCurrency: string;
  quoteCurrency: string;
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

    const symbol =
      market.symbol
        ?.trim()
        .toUpperCase();

    const pair =
      market.pair
        ?.trim()
        .toUpperCase();

    const baseCurrency =
      market.base_currency_short_name
        ?.trim()
        .toUpperCase();

    const quoteCurrency =
      market.target_currency_short_name
        ?.trim()
        .toUpperCase();

    if (
      !symbol ||
      !pair ||
      !baseCurrency ||
      !quoteCurrency
    ) {
      continue;
    }

    markets.set(symbol, {
      symbol,
      pair,
      baseCurrency,
      quoteCurrency,
    });
  }

  return Array.from(
    markets.values(),
  );
}