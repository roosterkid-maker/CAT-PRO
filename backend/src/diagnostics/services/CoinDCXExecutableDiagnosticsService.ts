import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

export type CoinDCXExecutableDiagnosticCode =
  | "EXECUTABLE_HEALTHY"
  | "EXECUTABLE_ZERO_BID_QTY"
  | "EXECUTABLE_ZERO_ASK_QTY"
  | "EXECUTABLE_ZERO_BOTH_QTY"
  | "NO_ORDER_BOOK"
  | "MISSING_BID_PRICE"
  | "MISSING_ASK_PRICE"
  | "MISSING_BOTH_PRICES"
  | "MISSING_BID_QTY"
  | "MISSING_ASK_QTY"
  | "MISSING_BOTH_QTY"
  | "CROSSED_TOP_OF_BOOK"
  | "NON_EXECUTABLE_OTHER";

export interface CoinDCXExecutableDiagnosticRecord {
  market:
    string;

  executable:
    boolean;

  code:
    CoinDCXExecutableDiagnosticCode;

  reason:
    string;

  lastPrice:
    number | null;

  bestBidPrice:
    number | null;

  bestBidQty:
    number | null;

  bestAskPrice:
    number | null;

  bestAskQty:
    number | null;

  spread:
    number | null;

  quoteAgeMs:
    number;

  hasOrderBook:
    boolean;

  orderBookBidLevels:
    number;

  orderBookAskLevels:
    number;

  orderBookAgeMs:
    number | null;

  sharedWithBinance:
    boolean;

  sharedWithBybit:
    boolean;

  sharedWithAnyExternalExchange:
    boolean;
}

export interface CoinDCXExecutableDiagnosticDistribution {
  code:
    CoinDCXExecutableDiagnosticCode;

  count:
    number;

  percent:
    number;
}

export interface CoinDCXExecutableDiagnosticsReport {
  generatedAt:
    number;

  summary: {
    totalCoinDCXQuotes:
      number;

    executableQuotes:
      number;

    nonExecutableQuotes:
      number;

    healthyExecutableQuotes:
      number;

    zeroQuantityExecutableQuotes:
      number;

    quotesWithOrderBook:
      number;

    quotesWithoutOrderBook:
      number;

    sharedWithBinance:
      number;

    sharedWithBybit:
      number;

    sharedWithAnyExternalExchange:
      number;

    nonExecutableSharedWithAnyExternalExchange:
      number;

    executableCoveragePercent:
      number;

    healthyExecutableCoveragePercent:
      number;
  };

  distribution:
    CoinDCXExecutableDiagnosticDistribution[];

  records:
    CoinDCXExecutableDiagnosticRecord[];
}

export class CoinDCXExecutableDiagnosticsService {
  generate(
    limit:
      number | null =
      null,

    now =
      Date.now(),
  ): CoinDCXExecutableDiagnosticsReport {
    const coinDCXQuotes =
      marketCache
        .getByExchange(
          "coindcx",
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.market
              .localeCompare(
                second.market,
              ),
        );

    const binanceMarkets =
      this.createMarketSet(
        marketCache
          .getExecutableByExchange(
            "binance",
          ),
      );

    const bybitMarkets =
      this.createMarketSet(
        marketCache
          .getExecutableByExchange(
            "bybit",
          ),
      );

    const records =
      coinDCXQuotes.map(
        (
          quote,
        ) =>
          this.analyzeQuote(
            quote,
            binanceMarkets,
            bybitMarkets,
            now,
          ),
      );

    const distribution =
      this.buildDistribution(
        records,
      );

    const executableQuotes =
      records.filter(
        (
          record,
        ) =>
          record.executable,
      ).length;

    const nonExecutableQuotes =
      records.length -
      executableQuotes;

    const healthyExecutableQuotes =
      records.filter(
        (
          record,
        ) =>
          record.code ===
          "EXECUTABLE_HEALTHY",
      ).length;

    const zeroQuantityExecutableQuotes =
      records.filter(
        (
          record,
        ) =>
          record.executable &&
          (
            record.bestBidQty ===
              0 ||
            record.bestAskQty ===
              0
          ),
      ).length;

    const quotesWithOrderBook =
      records.filter(
        (
          record,
        ) =>
          record.hasOrderBook,
      ).length;

    const sharedWithBinance =
      records.filter(
        (
          record,
        ) =>
          record.sharedWithBinance,
      ).length;

    const sharedWithBybit =
      records.filter(
        (
          record,
        ) =>
          record.sharedWithBybit,
      ).length;

    const sharedWithAnyExternalExchange =
      records.filter(
        (
          record,
        ) =>
          record
            .sharedWithAnyExternalExchange,
      ).length;

    const nonExecutableSharedWithAnyExternalExchange =
      records.filter(
        (
          record,
        ) =>
          !record.executable &&
          record
            .sharedWithAnyExternalExchange,
      ).length;

    const selectedRecords =
      limit ===
        null
        ? records
        : records.slice(
            0,
            this.normalizeLimit(
              limit,
            ),
          );

    return {
      generatedAt:
        now,

      summary: {
        totalCoinDCXQuotes:
          records.length,

        executableQuotes,

        nonExecutableQuotes,

        healthyExecutableQuotes,

        zeroQuantityExecutableQuotes,

        quotesWithOrderBook,

        quotesWithoutOrderBook:
          records.length -
          quotesWithOrderBook,

        sharedWithBinance,

        sharedWithBybit,

        sharedWithAnyExternalExchange,

        nonExecutableSharedWithAnyExternalExchange,

        executableCoveragePercent:
          this.percentage(
            executableQuotes,
            records.length,
          ),

        healthyExecutableCoveragePercent:
          this.percentage(
            healthyExecutableQuotes,
            records.length,
          ),
      },

      distribution,

      records:
        selectedRecords,
    };
  }

  private analyzeQuote(
    quote:
      ExecutableQuote,

    binanceMarkets:
      ReadonlySet<string>,

    bybitMarkets:
      ReadonlySet<string>,

    now:
      number,
  ): CoinDCXExecutableDiagnosticRecord {
    const market =
      this.normalizeMarket(
        quote.market,
      );

    const orderBook =
      orderBookService.get(
        "coindcx",
        market,
      );

    const sharedWithBinance =
      binanceMarkets.has(
        market,
      );

    const sharedWithBybit =
      bybitMarkets.has(
        market,
      );

    const diagnostic =
      this.resolveDiagnostic(
        quote,
        orderBook !==
          null,
      );

    return {
      market,

      executable:
        quote.executable,

      code:
        diagnostic.code,

      reason:
        diagnostic.reason,

      lastPrice:
        quote.lastPrice,

      bestBidPrice:
        quote.bestBidPrice,

      bestBidQty:
        quote.bestBidQty,

      bestAskPrice:
        quote.bestAskPrice,

      bestAskQty:
        quote.bestAskQty,

      spread:
        quote.spread,

      quoteAgeMs:
        Math.max(
          0,
          now -
            quote.timestamp,
        ),

      hasOrderBook:
        orderBook !==
        null,

      orderBookBidLevels:
        orderBook
          ?.bids.length ??
        0,

      orderBookAskLevels:
        orderBook
          ?.asks.length ??
        0,

      orderBookAgeMs:
        orderBook
          ? Math.max(
              0,
              now -
                orderBook.timestamp,
            )
          : null,

      sharedWithBinance,

      sharedWithBybit,

      sharedWithAnyExternalExchange:
        sharedWithBinance ||
        sharedWithBybit,
    };
  }

  private resolveDiagnostic(
    quote:
      ExecutableQuote,

    hasOrderBook:
      boolean,
  ): {
    code:
      CoinDCXExecutableDiagnosticCode;

    reason:
      string;
  } {
    if (
      quote.executable
    ) {
      const zeroBid =
        quote.bestBidQty ===
        0;

      const zeroAsk =
        quote.bestAskQty ===
        0;

      if (
        zeroBid &&
        zeroAsk
      ) {
        return {
          code:
            "EXECUTABLE_ZERO_BOTH_QTY",

          reason:
            "Quote is marked executable, but both top-of-book quantities are zero.",
        };
      }

      if (
        zeroBid
      ) {
        return {
          code:
            "EXECUTABLE_ZERO_BID_QTY",

          reason:
            "Quote is marked executable, but best-bid quantity is zero.",
        };
      }

      if (
        zeroAsk
      ) {
        return {
          code:
            "EXECUTABLE_ZERO_ASK_QTY",

          reason:
            "Quote is marked executable, but best-ask quantity is zero.",
        };
      }

      return {
        code:
          "EXECUTABLE_HEALTHY",

        reason:
          "Bid, ask and top-of-book quantities are available.",
      };
    }

    if (
      !hasOrderBook &&
      quote.bestBidPrice ===
        null &&
      quote.bestAskPrice ===
        null
    ) {
      return {
        code:
          "NO_ORDER_BOOK",

        reason:
          "CoinDCX ticker exists, but no CoinDCX order book has been cached for this market.",
      };
    }

    if (
      quote.bestBidPrice ===
        null &&
      quote.bestAskPrice ===
        null
    ) {
      return {
        code:
          "MISSING_BOTH_PRICES",

        reason:
          "Both executable bid and ask prices are missing.",
      };
    }

    if (
      quote.bestBidPrice ===
      null
    ) {
      return {
        code:
          "MISSING_BID_PRICE",

        reason:
          "Executable best-bid price is missing.",
      };
    }

    if (
      quote.bestAskPrice ===
      null
    ) {
      return {
        code:
          "MISSING_ASK_PRICE",

        reason:
          "Executable best-ask price is missing.",
      };
    }

    if (
      quote.bestBidQty ===
        null &&
      quote.bestAskQty ===
        null
    ) {
      return {
        code:
          "MISSING_BOTH_QTY",

        reason:
          "Both executable bid and ask quantities are missing.",
      };
    }

    if (
      quote.bestBidQty ===
      null
    ) {
      return {
        code:
          "MISSING_BID_QTY",

        reason:
          "Executable best-bid quantity is missing.",
      };
    }

    if (
      quote.bestAskQty ===
      null
    ) {
      return {
        code:
          "MISSING_ASK_QTY",

        reason:
          "Executable best-ask quantity is missing.",
      };
    }

    if (
      quote.bestAskPrice <
      quote.bestBidPrice
    ) {
      return {
        code:
          "CROSSED_TOP_OF_BOOK",

        reason:
          "Best ask is below best bid, so the cached CoinDCX top-of-book is structurally invalid.",
      };
    }

    return {
      code:
        "NON_EXECUTABLE_OTHER",

      reason:
        "Quote is non-executable for a reason not covered by the standard diagnostics.",
    };
  }

  private buildDistribution(
    records:
      readonly CoinDCXExecutableDiagnosticRecord[],
  ): CoinDCXExecutableDiagnosticDistribution[] {
    const counts =
      new Map<
        CoinDCXExecutableDiagnosticCode,
        number
      >();

    for (
      const record
      of records
    ) {
      counts.set(
        record.code,
        (
          counts.get(
            record.code,
          ) ??
          0
        ) +
          1,
      );
    }

    return Array.from(
      counts.entries(),
    )
      .map(
        (
          [
            code,
            count,
          ],
        ) => ({
          code,

          count,

          percent:
            this.percentage(
              count,
              records.length,
            ),
        }),
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.count -
          first.count,
      );
  }

  private createMarketSet(
    quotes:
      readonly ExecutableQuote[],
  ): Set<string> {
    return new Set(
      quotes.map(
        (
          quote,
        ) =>
          this.normalizeMarket(
            quote.market,
          ),
      ),
    );
  }

  private normalizeMarket(
    market:
      string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }

  private normalizeLimit(
    limit:
      number,
  ): number {
    if (
      !Number.isFinite(
        limit,
      )
    ) {
      return 100;
    }

    return Math.min(
      1_000,
      Math.max(
        1,
        Math.floor(
          limit,
        ),
      ),
    );
  }

  private percentage(
    numerator:
      number,

    denominator:
      number,
  ): number {
    if (
      denominator <=
      0
    ) {
      return 0;
    }

    return Number(
      (
        (
          numerator /
          denominator
        ) *
        100
      ).toFixed(
        4,
      ),
    );
  }
}

export const coinDCXExecutableDiagnosticsService =
  new CoinDCXExecutableDiagnosticsService();