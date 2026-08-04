import type { ProfitBreakdown } from "./ProfitBreakdown";

export interface ProfitWaterfall {
  capital: number;

  quantity: number;

  breakdown: ProfitBreakdown;

  profitPercent: number;

  profitable: boolean;
}