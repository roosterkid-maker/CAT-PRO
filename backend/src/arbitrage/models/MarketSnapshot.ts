import type { ExchangeQuote } from "./ExchangeQuote";

export interface MarketSnapshot {
  market: string;
  quotes: Record<string, ExchangeQuote>;
  timestamp: number;
}