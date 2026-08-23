import type { ExecutableQuote } from "../core/models/ExecutableQuote";
import type { ExchangeQuote } from "./models/ExchangeQuote";
import type { MarketSnapshot } from "./models/MarketSnapshot";

export class ComparisonEngine {
  groupByMarket(
    quotes: ExecutableQuote[],
  ): MarketSnapshot[] {
    const snapshots =
      new Map<string, MarketSnapshot>();

    for (
      const incomingQuote
      of quotes
    ) {
      const market =
        this.normalizeMarket(
          incomingQuote.market,
        );

      const exchange =
        incomingQuote.exchange
          .trim()
          .toLowerCase();

      if (
        !market ||
        !exchange
      ) {
        continue;
      }

      const quote:
        ExchangeQuote = {
        exchange,
        market,

        lastPrice:
          incomingQuote.lastPrice,

        bestBidPrice:
          incomingQuote.bestBidPrice,

        bestBidQty:
          incomingQuote.bestBidQty,

        bestAskPrice:
          incomingQuote.bestAskPrice,

        bestAskQty:
          incomingQuote.bestAskQty,

        spread:
          incomingQuote.spread,

        timestamp:
          incomingQuote.timestamp,

        source:
          incomingQuote.source,

        executable:
          incomingQuote.executable,
      };

      const existing =
        snapshots.get(
          market,
        );

      if (existing) {
        const currentQuote =
          existing.quotes[
            exchange
          ];

        if (
          !currentQuote ||
          quote.timestamp >=
            currentQuote.timestamp
        ) {
          existing.quotes[
            exchange
          ] =
            quote;
        }

        existing.timestamp =
          Math.max(
            existing.timestamp,
            quote.timestamp,
          );

        continue;
      }

      snapshots.set(
        market,
        {
          market,

          quotes: {
            [exchange]:
              quote,
          },

          timestamp:
            quote.timestamp,
        },
      );
    }

    return Array.from(
      snapshots.values(),
    );
  }

  /**
   * Allocation-light grouping for MarketCache's already-normalized immutable
   * executable quotes. The general groupByMarket path remains available for
   * untrusted/ad-hoc inputs; the scanner avoids normalizing and cloning every
   * quote again on every market-data event.
   */
  groupNormalizedExecutableByMarket(
    quotes: readonly ExecutableQuote[],
  ): MarketSnapshot[] {
    const snapshots = new Map<string, MarketSnapshot>();

    for (const quote of quotes) {
      const existing = snapshots.get(quote.market);
      if (existing) {
        const currentQuote = existing.quotes[quote.exchange];
        if (!currentQuote || quote.timestamp >= currentQuote.timestamp) {
          existing.quotes[quote.exchange] = quote;
        }
        if (quote.timestamp > existing.timestamp) {
          existing.timestamp = quote.timestamp;
        }
        continue;
      }

      snapshots.set(quote.market, {
        market: quote.market,
        quotes: {
          [quote.exchange]: quote,
        },
        timestamp: quote.timestamp,
      });
    }

    return Array.from(snapshots.values());
  }

  private normalizeMarket(
    rawMarket:
      string,
  ): string {
    return rawMarket
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }
}

export const comparisonEngine =
  new ComparisonEngine();
