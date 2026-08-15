import type {
  OrderBook,
} from "../models/OrderBook";

import type {
  OrderBookLevel,
} from "../models/OrderBookLevel";

const MAXIMUM_LEVELS =
  20;

export class OrderBookMerger {
  /*
   * This merger is intended strictly for
   * genuine incremental/delta feeds.
   *
   * Complete snapshots must use
   * OrderBookService.replace().
   */
  merge(
    existing:
      OrderBook | null,

    incoming:
      OrderBook,
  ): OrderBook {
    if (
      !existing
    ) {
      return this.normalizeBook(
        incoming,
      );
    }

    /*
     * Never merge unrelated books.
     */
    if (
      existing.exchange !==
        incoming.exchange ||
      existing.market !==
        incoming.market
    ) {
      return this.normalizeBook(
        incoming,
      );
    }

    return {
      exchange:
        incoming.exchange,

      market:
        incoming.market,

      bids:
        this.mergeSide(
          existing.bids,
          incoming.bids,
          "bid",
        ),

      asks:
        this.mergeSide(
          existing.asks,
          incoming.asks,
          "ask",
        ),

      timestamp:
        Math.max(
          existing.timestamp,
          incoming.timestamp,
        ),
    };
  }

  private normalizeBook(
    book:
      OrderBook,
  ): OrderBook {
    return {
      exchange:
        book.exchange,

      market:
        book.market,

      bids:
        this.normalizeSide(
          book.bids,
          "bid",
        ),

      asks:
        this.normalizeSide(
          book.asks,
          "ask",
        ),

      timestamp:
        book.timestamp,
    };
  }

  private mergeSide(
    existing:
      OrderBookLevel[],

    incoming:
      OrderBookLevel[],

    side:
      "bid" |
      "ask",
  ): OrderBookLevel[] {
    const levels =
      new Map<
        number,
        number
      >();

    for (
      const level
      of existing
    ) {
      if (
        !Number.isFinite(
          level.price,
        ) ||
        !Number.isFinite(
          level.quantity,
        ) ||
        level.price <=
          0 ||
        level.quantity <=
          0
      ) {
        continue;
      }

      levels.set(
        level.price,
        level.quantity,
      );
    }

    for (
      const level
      of incoming
    ) {
      if (
        !Number.isFinite(
          level.price,
        ) ||
        level.price <=
          0 ||
        !Number.isFinite(
          level.quantity,
        )
      ) {
        continue;
      }

      /*
       * Quantity zero is meaningful in a
       * delta feed: remove that price level.
       */
      if (
        level.quantity <=
        0
      ) {
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

    return this.sortAndLimit(
      Array.from(
        levels.entries(),
      ).map(
        (
          [
            price,
            quantity,
          ],
        ) => ({
          price,
          quantity,
        }),
      ),
      side,
    );
  }

  private normalizeSide(
    levels:
      OrderBookLevel[],

    side:
      "bid" |
      "ask",
  ): OrderBookLevel[] {
    return this.sortAndLimit(
      levels
        .filter(
          (
            level,
          ) =>
            Number.isFinite(
              level.price,
            ) &&
            Number.isFinite(
              level.quantity,
            ) &&
            level.price >
              0 &&
            level.quantity >
              0,
        )
        .map(
          (
            level,
          ) => ({
            price:
              level.price,

            quantity:
              level.quantity,
          }),
        ),
      side,
    );
  }

  private sortAndLimit(
    levels:
      OrderBookLevel[],

    side:
      "bid" |
      "ask",
  ): OrderBookLevel[] {
    levels.sort(
      side ===
        "bid"
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

    return levels.slice(
      0,
      MAXIMUM_LEVELS,
    );
  }
}

export const orderBookMerger =
  new OrderBookMerger();