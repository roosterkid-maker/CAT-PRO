import type { OrderBookLevel } from "./OrderBookLevel";

export interface OrderBook {
  exchange: string;

  market: string;

  bids: OrderBookLevel[];

  asks: OrderBookLevel[];

  timestamp: number;
}