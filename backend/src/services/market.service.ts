import axios from "axios";

const COINDCX_TICKER_URL = "https://api.coindcx.com/exchange/ticker";

export interface CoinDCXMarket {
  market: string;
  change_24_hour: string;
  high: string;
  low: string;
  volume: string;
  last_price: string;
  bid: string;
  ask: string;
  timestamp: number;
}

export async function fetchCoinDCXMarkets(): Promise<CoinDCXMarket[]> {
  const response = await axios.get<CoinDCXMarket[]>(
    COINDCX_TICKER_URL,
    {
      timeout: 10000,
    }
  );

  return response.data;
}

export async function fetchMarketsByQuote(
  quoteCurrency: string
): Promise<CoinDCXMarket[]> {
  const markets = await fetchCoinDCXMarkets();
  const quote = quoteCurrency.toUpperCase();

  return markets.filter((market) =>
    market.market.toUpperCase().endsWith(quote)
  );
}