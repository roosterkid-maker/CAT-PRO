import {
  orderBookCache,
} from "../cache/OrderBookCache";

import {
  orderBookMerger,
} from "../calculators/OrderBookMerger";

import type {
  OrderBook,
} from "../models/OrderBook";

export interface OrderBookServiceDiagnostics {
  mergedUpdates:
    number;

  replacedSnapshots:
    number;

  rejectedInvalidBooks:
    number;

  rejectedEmptyBooks:
    number;

  rejectedCrossedBooks:
    number;
}

export type OrderBookRejectionReason =
  | "INVALID_BOOK"
  | "EMPTY_BOOK"
  | "CROSSED_BOOK";

export interface OrderBookMutationResult {
  accepted:
    boolean;

  reason:
    "OK" |
    OrderBookRejectionReason;

  book:
    OrderBook | null;
}

const diagnostics:
  OrderBookServiceDiagnostics = {
  mergedUpdates:
    0,

  replacedSnapshots:
    0,

  rejectedInvalidBooks:
    0,

  rejectedEmptyBooks:
    0,

  rejectedCrossedBooks:
    0,
};

export class OrderBookService {
  /*
   * Use update() only for true incremental /
   * delta order-book data.
   */
  update(
    book:
      OrderBook,
  ): OrderBookMutationResult {
    const validation =
      this.validateUpdate(
        book,
      );

    if (
      !validation.valid
    ) {
      this.recordRejectedBook(
        validation.reason,
      );

      return {
        accepted:
          false,

        reason:
          validation.reason,

        book:
          null,
      };
    }

    const existing =
      this.get(
        book.exchange,
        book.market,
      );

    const mergedBook =
      orderBookMerger
        .merge(
          existing,
          book,
        );

    const mergedValidation =
      this.validate(
        mergedBook,
      );

    if (
      !mergedValidation.valid
    ) {
      this.recordRejectedBook(
        mergedValidation.reason,
      );

      console.warn(
        `[OrderBookService] Rejected merged book ${book.exchange}:${book.market}: ${mergedValidation.reason}`,
      );

      return {
        accepted:
          false,

        reason:
          mergedValidation.reason,

        book:
          null,
      };
    }

    orderBookCache.set(
      mergedBook,
    );

    diagnostics.mergedUpdates +=
      1;

    return {
      accepted:
        true,

      reason:
        "OK",

      book:
        mergedBook,
    };
  }

  /*
   * Use replace() when the incoming payload
   * represents a complete authoritative
   * order-book snapshot.
   *
   * Binance partial-depth snapshots and
   * CoinDCX normalized books use this path.
   */
  replace(
    book:
      OrderBook,
  ): OrderBookMutationResult {
    const validation =
      this.validate(
        book,
      );

    if (
      !validation.valid
    ) {
      this.recordRejectedBook(
        validation.reason,
      );

      console.warn(
        `[OrderBookService] Rejected snapshot ${book.exchange}:${book.market}: ${validation.reason}`,
      );

      return {
        accepted:
          false,

        reason:
          validation.reason,

        book:
          null,
      };
    }

    orderBookCache.set(
      book,
    );

    diagnostics.replacedSnapshots +=
      1;

    return {
      accepted:
        true,

      reason:
        "OK",

      book,
    };
  }

  get(
    exchange:
      string,

    market:
      string,
  ): OrderBook | null {
    return orderBookCache.get(
      exchange,
      market,
    );
  }

  has(
    exchange:
      string,

    market:
      string,
  ): boolean {
    return orderBookCache.has(
      exchange,
      market,
    );
  }

  remove(
    exchange:
      string,

    market:
      string,
  ): void {
    orderBookCache.remove(
      exchange,
      market,
    );
  }

  clear():
    void {
    orderBookCache.clear();
  }

  size():
    number {
    return orderBookCache.size();
  }

  getRevision():
    number {
    return orderBookCache.getRevision();
  }

  getAll():
    OrderBook[] {
    return orderBookCache.getAll();
  }

  isFresh(
    exchange:
      string,

    market:
      string,

    maximumAgeMs:
      number,

    now =
      Date.now(),
  ): boolean {
    const book =
      this.get(
        exchange,
        market,
      );

    if (
      !book
    ) {
      return false;
    }

    if (
      !Number.isFinite(
        maximumAgeMs,
      ) ||
      maximumAgeMs <
        0
    ) {
      return false;
    }

    const ageMs =
      Math.max(
        0,
        now -
          book.timestamp,
      );

    return (
      ageMs <=
      maximumAgeMs
    );
  }

  getTimestamp(
    exchange:
      string,

    market:
      string,
  ): number | null {
    return (
      this.get(
        exchange,
        market,
      )
        ?.timestamp ??
      null
    );
  }

  getDiagnostics():
    OrderBookServiceDiagnostics {
    return {
      ...diagnostics,
    };
  }

  resetDiagnostics():
    void {
    diagnostics.mergedUpdates =
      0;

    diagnostics.replacedSnapshots =
      0;

    diagnostics.rejectedInvalidBooks =
      0;

    diagnostics.rejectedEmptyBooks =
      0;

    diagnostics.rejectedCrossedBooks =
      0;
  }

  private validate(
    book:
      OrderBook,
  ): {
    valid:
      boolean;

    reason:
      "OK" |
      OrderBookRejectionReason;
  } {
    if (
      !book ||
      typeof book.exchange !==
        "string" ||
      !book.exchange.trim() ||
      typeof book.market !==
        "string" ||
      !book.market.trim() ||
      !Number.isFinite(
        book.timestamp,
      ) ||
      book.timestamp <=
        0 ||
      !Array.isArray(
        book.bids,
      ) ||
      !Array.isArray(
        book.asks,
      )
    ) {
      return {
        valid:
          false,

        reason:
          "INVALID_BOOK",
      };
    }

    if (
      book.bids.length ===
        0 ||
      book.asks.length ===
        0
    ) {
      return {
        valid:
          false,

        reason:
          "EMPTY_BOOK",
      };
    }

    const bestBid =
      book.bids[0];

    const bestAsk =
      book.asks[0];

    if (
      !bestBid ||
      !bestAsk ||
      !Number.isFinite(
        bestBid.price,
      ) ||
      !Number.isFinite(
        bestBid.quantity,
      ) ||
      !Number.isFinite(
        bestAsk.price,
      ) ||
      !Number.isFinite(
        bestAsk.quantity,
      ) ||
      bestBid.price <=
        0 ||
      bestBid.quantity <=
        0 ||
      bestAsk.price <=
        0 ||
      bestAsk.quantity <=
        0
    ) {
      return {
        valid:
          false,

        reason:
          "INVALID_BOOK",
      };
    }

    if (
      bestAsk.price <
      bestBid.price
    ) {
      return {
        valid:
          false,

        reason:
          "CROSSED_BOOK",
      };
    }

    return {
      valid:
        true,

      reason:
        "OK",
    };
  }

  /*
   * Incremental updates may legitimately contain only
   * one side of the book and quantity-zero deletions.
   * The complete merged result is still subjected to
   * the strict snapshot validator above.
   */
  private validateUpdate(
    book:
      OrderBook,
  ): {
    valid:
      boolean;

    reason:
      "OK" |
      OrderBookRejectionReason;
  } {
    if (
      !book ||
      typeof book.exchange !==
        "string" ||
      !book.exchange.trim() ||
      typeof book.market !==
        "string" ||
      !book.market.trim() ||
      !Number.isFinite(
        book.timestamp,
      ) ||
      book.timestamp <=
        0 ||
      !Array.isArray(
        book.bids,
      ) ||
      !Array.isArray(
        book.asks,
      )
    ) {
      return {
        valid:
          false,

        reason:
          "INVALID_BOOK",
      };
    }

    if (
      book.bids.length ===
        0 &&
      book.asks.length ===
        0
    ) {
      return {
        valid:
          false,

        reason:
          "EMPTY_BOOK",
      };
    }

    const levels = [
      ...book.bids,
      ...book.asks,
    ];

    if (
      levels.some(
        (level) =>
          !level ||
          !Number.isFinite(
            level.price,
          ) ||
          !Number.isFinite(
            level.quantity,
          ) ||
          level.price <=
            0 ||
          level.quantity <
            0,
      )
    ) {
      return {
        valid:
          false,

        reason:
          "INVALID_BOOK",
      };
    }

    return {
      valid:
        true,

      reason:
        "OK",
    };
  }

  private recordRejectedBook(
    reason:
      "OK" |
      OrderBookRejectionReason,
  ): void {
    if (
      reason ===
      "OK"
    ) {
      return;
    }

    diagnostics.rejectedInvalidBooks +=
      1;

    if (
      reason ===
      "EMPTY_BOOK"
    ) {
      diagnostics.rejectedEmptyBooks +=
        1;
    }

    if (
      reason ===
      "CROSSED_BOOK"
    ) {
      diagnostics.rejectedCrossedBooks +=
        1;
    }
  }
}

export const orderBookService =
  new OrderBookService();
