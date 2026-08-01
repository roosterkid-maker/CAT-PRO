import type { ExecutableQuote } from "./core/models/ExecutableQuote";

export interface MarketComparison {
  market: string;

  exchanges: Record<
    string,
    ExecutableQuote
  >;
}