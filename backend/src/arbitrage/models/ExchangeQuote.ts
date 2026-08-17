import type { QuoteSource } from "../../core/models/ExecutableQuote";

export interface ExchangeQuote {
  exchange: string;
  market: string;

  lastPrice: number | null;

  bestBidPrice: number | null;
  bestBidQty: number | null;

  bestAskPrice: number | null;
  bestAskQty: number | null;

  spread: number | null;

  timestamp: number;

  source: QuoteSource;
  executable: boolean;
}