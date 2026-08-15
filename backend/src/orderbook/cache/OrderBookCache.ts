import type { OrderBook } from "../models/OrderBook";

export class OrderBookCache {
  private readonly books =
    new Map<string, OrderBook>();

  private revision = 0;

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

    this.revision += 1;
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
    if (this.books.delete(
      this.key(
        exchange,
        market,
      ),
    )) {
      this.revision += 1;
    }
  }

  clear(): void {
    if (this.books.size > 0) this.revision += 1;
    this.books.clear();
  }

  size(): number {
    return this.books.size;
  }

  getRevision(): number {
    return this.revision;
  }

  getAll(): OrderBook[] {
    return [
      ...this.books.values(),
    ];
  }
}

export const orderBookCache =
  new OrderBookCache();
