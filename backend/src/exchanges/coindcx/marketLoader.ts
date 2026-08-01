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

export async function loadMarkets(): Promise<LoadedCoinDCXMarket[]> {
  const url = COINDCX.REST.BASE_URL + COINDCX.REST.MARKETS;

  const response = await axios.get<CoinDCXMarketDetails[]>(url, {
    timeout: 10_000,
  });

  return response.data
    .filter((market) => market.status === "active")
    .filter((market) => Boolean(market.symbol && market.pair))
    .map((market) => ({
      symbol: market.symbol.toUpperCase(),
      pair: market.pair.toUpperCase(),
      baseCurrency: market.base_currency_short_name.toUpperCase(),
      quoteCurrency: market.target_currency_short_name.toUpperCase(),
    }));
}