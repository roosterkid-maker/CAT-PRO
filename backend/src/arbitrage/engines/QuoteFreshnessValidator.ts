import type { ExchangeQuote } from "../models/ExchangeQuote";

export class QuoteFreshnessValidator {
  isFresh(
    quote: ExchangeQuote,
    maximumQuoteAgeMs: number,
    now = Date.now(),
  ): boolean {
    if (!Number.isFinite(quote.timestamp)) {
      return false;
    }

    const ageMs = now - quote.timestamp;

    return ageMs >= 0 && ageMs <= maximumQuoteAgeMs;
  }
}

export const quoteFreshnessValidator =
  new QuoteFreshnessValidator();