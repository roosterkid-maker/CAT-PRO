import type { OrderBook } from "../models/OrderBook";

export class OrderBookCache {
  private readonly books =
    new Map<string, OrderBook>();

  private key(
    exchange: string,
    market: string,
  ): string {
    return `${exchange}:${market}`;
  }

  set(
    book: OrderBook,
  ): void {
    this.books.set(
      this.key(
        book.exchange,
        book.market,
      ),
      book,
    );
  }

  get(
    exchange: string,
    market: string,
  ): OrderBook | null {
    return (
      this.books.get(
        this.key(
          exchange,
          market,
        ),
      ) ?? null
    );
  }

  has(
    exchange: string,
    market: string,
  ): boolean {
    return this.books.has(
      this.key(
        exchange,
        market,
      ),
    );
  }

  remove(
    exchange: string,
    market: string,
  ): void {
    this.books.delete(
      this.key(
        exchange,
        market,
      ),
    );
  }

  clear(): void {
    this.books.clear();
  }

  size(): number {
    return this.books.size;
  }

  getAll(): OrderBook[] {
    return [
      ...this.books.values(),
    ];
  }
}

export const orderBookCache =
  new OrderBookCache();