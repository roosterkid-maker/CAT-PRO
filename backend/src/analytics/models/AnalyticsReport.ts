import type { AnalyticsOverview } from "./AnalyticsOverview";
import type { ExchangePerformance } from "./ExchangePerformance";
import type { MarketPerformance } from "./MarketPerformance";

export interface AnalyticsReport {
  generatedAt: number;

  overview: AnalyticsOverview;

  exchanges: ExchangePerformance[];

  markets: MarketPerformance[];
}