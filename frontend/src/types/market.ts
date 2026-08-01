export type MarketQuoteSource =
  | "bookTicker"
  | "orderBook"
  | "ticker"
  | "rest";

export interface MarketTicker {
  exchange: string;
  market: string;

  lastPrice: number | null;

  bestBidPrice: number | null;
  bestBidQty: number | null;

  bestAskPrice: number | null;
  bestAskQty: number | null;

  spread: number | null;

  timestamp: number;

  source: MarketQuoteSource;

  executable: boolean;
}