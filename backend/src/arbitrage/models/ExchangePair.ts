import type { ExchangeQuote } from "./ExchangeQuote";

export interface ExchangePair {
  market: string;

  buy: ExchangeQuote;
  sell: ExchangeQuote;
}