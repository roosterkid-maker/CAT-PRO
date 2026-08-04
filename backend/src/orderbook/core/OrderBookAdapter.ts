import type { OrderBook } from "../models/OrderBook";

export interface OrderBookAdapter {
  readonly exchange: string;

  connect(): Promise<void>;

  disconnect(): Promise<void>;

  subscribe(
    markets: string[],
  ): Promise<void>;

  unsubscribe(
    markets: string[],
  ): Promise<void>;

  isConnected(): boolean;

  onOrderBook(
    callback: (
      book: OrderBook,
    ) => void,
  ): void;
}