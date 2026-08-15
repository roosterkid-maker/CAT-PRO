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