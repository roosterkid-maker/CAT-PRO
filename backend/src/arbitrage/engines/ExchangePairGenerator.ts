import type { ExchangePair } from "../models/ExchangePair";
import type { ExchangeQuote } from "../models/ExchangeQuote";
import type { MarketSnapshot } from "../models/MarketSnapshot";

export interface PositiveSpreadPairBatch {
  readonly pairs: ExchangePair[];
  readonly totalExecutablePairs: number;
  readonly nonPositiveSpreadPairs: number;
}

export class ExchangePairGenerator {
  generate(snapshot: MarketSnapshot): ExchangePair[] {
    const quotes = Object.values(snapshot.quotes);

    const pairs: ExchangePair[] = [];

    for (
      let buyIndex = 0;
      buyIndex < quotes.length;
      buyIndex++
    ) {
      for (
        let sellIndex = 0;
        sellIndex < quotes.length;
        sellIndex++
      ) {
        if (buyIndex === sellIndex) {
          continue;
        }

        const buy = quotes[buyIndex];
        const sell = quotes[sellIndex];

        if (
          !this.isExecutableBuyQuote(buy) ||
          !this.isExecutableSellQuote(sell)
        ) {
          continue;
        }

        if (buy.exchange === sell.exchange) {
          continue;
        }

        pairs.push({
          market: snapshot.market,
          buy,
          sell,
        });
      }
    }

    return pairs;
  }

  /**
   * Build objects only for routes that can possibly have a positive raw
   * spread. A zero/negative executable spread cannot become profitable after
   * fees. Positive routes remain subject to every OpportunityEngine gate.
   */
  generatePositiveSpreadCandidates(
    snapshot:
      MarketSnapshot,
  ): PositiveSpreadPairBatch {
    const quotes =
      Object.values(
        snapshot.quotes,
      );

    const pairs:
      ExchangePair[] =
      [];

    let totalExecutablePairs =
      0;

    let nonPositiveSpreadPairs =
      0;

    for (
      let buyIndex = 0;
      buyIndex < quotes.length;
      buyIndex++
    ) {
      const buy =
        quotes[
          buyIndex
        ];

      if (
        !this.isExecutableBuyQuote(
          buy,
        )
      ) {
        continue;
      }

      for (
        let sellIndex = 0;
        sellIndex < quotes.length;
        sellIndex++
      ) {
        if (
          buyIndex ===
          sellIndex
        ) {
          continue;
        }

        const sell =
          quotes[
            sellIndex
          ];

        if (
          !this.isExecutableSellQuote(
            sell,
          ) ||
          buy.exchange ===
            sell.exchange
        ) {
          continue;
        }

        totalExecutablePairs +=
          1;

        if (
          sell.bestBidPrice! <=
          buy.bestAskPrice!
        ) {
          nonPositiveSpreadPairs +=
            1;

          continue;
        }

        pairs.push({
          market:
            snapshot.market,
          buy,
          sell,
        });
      }
    }

    return {
      pairs,
      totalExecutablePairs,
      nonPositiveSpreadPairs,
    };
  }

  private isExecutableBuyQuote(
    quote: ExchangeQuote | undefined,
  ): quote is ExchangeQuote {
    return Boolean(
      quote &&
        quote.executable &&
        Number.isFinite(
          quote.bestAskPrice,
        ) &&
        quote.bestAskPrice! > 0 &&
        Number.isFinite(
          quote.bestAskQty,
        ) &&
        quote.bestAskQty! > 0,
    );
  }

  private isExecutableSellQuote(
    quote: ExchangeQuote | undefined,
  ): quote is ExchangeQuote {
    return Boolean(
      quote &&
        quote.executable &&
        Number.isFinite(
          quote.bestBidPrice,
        ) &&
        quote.bestBidPrice! > 0 &&
        Number.isFinite(
          quote.bestBidQty,
        ) &&
        quote.bestBidQty! > 0,
    );
  }
}

export const exchangePairGenerator =
  new ExchangePairGenerator();
