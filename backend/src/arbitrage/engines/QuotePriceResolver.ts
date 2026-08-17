import type { ExchangeQuote } from "../models/ExchangeQuote";

export interface ResolvedQuotePrices {
  buyPrice: number;
  sellPrice: number;
  usedLastPriceFallback: false;
}

export class QuotePriceResolver {
  resolve(
    buyQuote: ExchangeQuote,
    sellQuote: ExchangeQuote,
  ): ResolvedQuotePrices | null {
    const buyPrice =
      buyQuote.bestAskPrice;

    const sellPrice =
      sellQuote.bestBidPrice;

    if (
      !buyQuote.executable ||
      !sellQuote.executable ||
      buyPrice === null ||
      sellPrice === null ||
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      buyPrice <= 0 ||
      sellPrice <= 0
    ) {
      return null;
    }

    return {
      buyPrice,
      sellPrice,
      usedLastPriceFallback: false,
    };
  }
}

export const quotePriceResolver =
  new QuotePriceResolver();