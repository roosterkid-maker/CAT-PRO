import type { ExchangePair } from "../models/ExchangePair";
import type { ExchangeQuote } from "../models/ExchangeQuote";
import type { MarketSnapshot } from "../models/MarketSnapshot";

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