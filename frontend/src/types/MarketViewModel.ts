import type { MarketTicker } from "@/types/market";
import type { PriceDirection } from "@/modules/market/types/priceDirection";

export interface MarketViewModel extends MarketTicker {
  previousPrice: number;
  direction: PriceDirection;
}