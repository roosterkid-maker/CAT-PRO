import { orderBookCache } from "../cache/OrderBookCache";

import type { OrderBook } from "../models/OrderBook";

export class OrderBookService {
  update(
    book: OrderBook,
  ): void {
    orderBookCache.set(book);
  }

  get(
    exchange: string,
    market: string,
  ): OrderBook | null {
    return orderBookCache.get(
      exchange,
      market,
    );
  }

  has(
    exchange: string,
    market: string,
  ): boolean {
    return orderBookCache.has(
      exchange,
      market,
    );
  }

  remove(
    exchange: string,
    market: string,
  ): void {
    orderBookCache.remove(
      exchange,
      market,
    );
  }

  clear(): void {
    orderBookCache.clear();
  }

  size(): number {
    return orderBookCache.size();
  }

  getAll(): OrderBook[] {
    return orderBookCache.getAll();
  }

  isFresh(
    exchange: string,
    market: string,
    maximumAgeMs: number,
    now = Date.now(),
  ): boolean {
    const book = this.get(
      exchange,
      market,
    );

    if (!book) {
      return false;
    }

    if (
      !Number.isFinite(maximumAgeMs) ||
      maximumAgeMs < 0
    ) {
      return false;
    }

    const ageMs = Math.max(
      0,
      now - book.timestamp,
    );

    return ageMs <= maximumAgeMs;
  }

  getTimestamp(
    exchange: string,
    market: string,
  ): number | null {
    return (
      this.get(
        exchange,
        market,
      )?.timestamp ?? null
    );
  }
}

export const orderBookService =
  new OrderBookService();