import type { MarketTicker } from "@/types/market";
import type { PriceDirection } from "./priceDirection";

export interface MarketViewModel extends MarketTicker {
  previousPrice: number | null;
  direction: PriceDirection;
}