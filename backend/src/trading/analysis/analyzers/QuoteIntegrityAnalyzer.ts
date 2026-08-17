export type QuoteIntegrityFailureCode =
  | "INVALID_BUY_PRICE"
  | "INVALID_SELL_PRICE"
  | "INVALID_MAXIMUM_PRICE_RATIO"
  | "PRICE_RATIO_EXCEEDED";

export interface QuoteIntegrityInput {
  buyPrice:
    number;

  sellPrice:
    number;

  /**
   * Safety guard against obviously corrupted,
   * mismatched, or incorrectly normalized
   * cross-exchange prices.
   *
   * Example:
   *
   * 1.50 = highest price may be at most
   *        1.5x the lowest price.
   *
   * This is NOT an arbitrage spread threshold.
   * Genuine price differences below this ratio
   * remain eligible for normal spread/profit
   * evaluation.
   */
  maximumPriceRatio:
    number;
}

export interface QuoteIntegrityAnalysis {
  acceptable:
    boolean;

  score:
    number;

  priceRatio:
    number | null;

  failureCode:
    QuoteIntegrityFailureCode | null;

  reason:
    string;
}

export class QuoteIntegrityAnalyzer {
  analyze(
    input:
      QuoteIntegrityInput,
  ): QuoteIntegrityAnalysis {
    if (
      !Number.isFinite(
        input.buyPrice,
      ) ||
      input.buyPrice <= 0
    ) {
      return {
        acceptable:
          false,

        score:
          0,

        priceRatio:
          null,

        failureCode:
          "INVALID_BUY_PRICE",

        reason:
          "Buy price is invalid.",
      };
    }

    if (
      !Number.isFinite(
        input.sellPrice,
      ) ||
      input.sellPrice <= 0
    ) {
      return {
        acceptable:
          false,

        score:
          0,

        priceRatio:
          null,

        failureCode:
          "INVALID_SELL_PRICE",

        reason:
          "Sell price is invalid.",
      };
    }

    if (
      !Number.isFinite(
        input.maximumPriceRatio,
      ) ||
      input.maximumPriceRatio <
        1
    ) {
      return {
        acceptable:
          false,

        score:
          0,

        priceRatio:
          null,

        failureCode:
          "INVALID_MAXIMUM_PRICE_RATIO",

        reason:
          "Maximum cross-exchange price ratio must be at least 1.",
      };
    }

    const lowerPrice =
      Math.min(
        input.buyPrice,
        input.sellPrice,
      );

    const higherPrice =
      Math.max(
        input.buyPrice,
        input.sellPrice,
      );

    const priceRatio =
      higherPrice /
      lowerPrice;

    if (
      !Number.isFinite(
        priceRatio,
      ) ||
      priceRatio <
        1
    ) {
      return {
        acceptable:
          false,

        score:
          0,

        priceRatio:
          null,

        failureCode:
          "PRICE_RATIO_EXCEEDED",

        reason:
          "Unable to calculate a valid cross-exchange price ratio.",
      };
    }

    if (
      priceRatio >
      input.maximumPriceRatio
    ) {
      return {
        acceptable:
          false,

        score:
          0,

        priceRatio,

        failureCode:
          "PRICE_RATIO_EXCEEDED",

        reason:
          `Cross-exchange price ratio ${priceRatio.toFixed(
            4,
          )}x exceeds integrity limit ${input.maximumPriceRatio.toFixed(
            4,
          )}x.`,
      };
    }

    /*
     * Quote integrity is a binary safety gate.
     *
     * We deliberately do NOT reduce the score
     * because two exchanges have different prices.
     *
     * That difference is evaluated separately by
     * SpreadAnalyzer and OpportunityEvaluator,
     * because price divergence is the source of
     * an arbitrage opportunity.
     */
    return {
      acceptable:
        true,

      score:
        100,

      priceRatio,

      failureCode:
        null,

      reason:
        `Cross-exchange quote integrity is valid at ${priceRatio.toFixed(
          4,
        )}x price ratio.`,
    };
  }
}

export const quoteIntegrityAnalyzer =
  new QuoteIntegrityAnalyzer();