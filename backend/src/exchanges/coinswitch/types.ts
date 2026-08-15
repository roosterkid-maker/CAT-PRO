import type {
  CoinSwitchPublicVenue,
} from "./constants";

export interface CoinSwitchTicker {
  symbol?: unknown;

  openPrice?: unknown;

  lowPrice?: unknown;

  highPrice?: unknown;

  lastPrice?: unknown;

  baseVolume?: unknown;

  quoteVolume?: unknown;

  percentageChange?: unknown;

  bidPrice?: unknown;

  askPrice?: unknown;

  at?: unknown;
}

export interface CoinSwitchTickerEnvelope {
  data?: unknown;
}

export interface CoinSwitchServerTimeResponse {
  serverTime?: unknown;
}

export interface CoinSwitchOrderBookPayload {
  s?: unknown;

  timestamp?: unknown;

  bids?: unknown;

  asks?: unknown;

  success?: unknown;

  message?: unknown;
}

export interface CoinSwitchMarketDescriptor {
  venue:
    CoinSwitchPublicVenue;

  symbol: string;

  market: string;

  canonicalMarket: string;

  baseAsset: string;

  quoteAsset: string;

  ticker:
    CoinSwitchTicker;
}
