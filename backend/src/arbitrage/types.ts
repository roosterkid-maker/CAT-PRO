import type { NormalizedTicker } from "../exchanges/coindcx/types";

export interface MarketComparison {
  market: string;
  exchanges: Record<string, NormalizedTicker>;
}