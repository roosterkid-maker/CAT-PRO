import type { OrderBook } from "../models/OrderBook";
import type { OrderBookLevel } from "../models/OrderBookLevel";

export class OrderBookMerger {
  merge(
    existing: OrderBook | null,
    incoming: OrderBook,
  ): OrderBook {
    if (!existing) {
      return incoming;
    }

    return {
      exchange: incoming.exchange,

      market: incoming.market,

      bids: this.mergeSide(
        existing.bids,
        incoming.bids,
        "bid",
      ),

      asks: this.mergeSide(
        existing.asks,
        incoming.asks,
        "ask",
      ),

      timestamp:
        incoming.timestamp,
    };
  }

  private mergeSide(
    existing: OrderBookLevel[],
    incoming: OrderBookLevel[],
    side: "bid" | "ask",
  ): OrderBookLevel[] {
    const levels =
      new Map<number, number>();

    for (const level of existing) {
      levels.set(
        level.price,
        level.quantity,
      );
    }

    for (const level of incoming) {
      if (level.quantity <= 0) {
        levels.delete(
          level.price,
        );

        continue;
      }

      levels.set(
        level.price,
        level.quantity,
      );
    }

    const merged = [
      ...levels.entries(),
    ].map(
      ([price, quantity]) => ({
        price,
        quantity,
      }),
    );

    merged.sort(
      side === "bid"
        ? (
            first,
            second,
          ) =>
            second.price -
            first.price
        : (
            first,
            second,
          ) =>
            first.price -
            second.price,
    );

    return merged.slice(0, 20);
  }
}

export const orderBookMerger =
  new OrderBookMerger();