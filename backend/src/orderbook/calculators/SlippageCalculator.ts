import type { SlippageResult } from "../models/SlippageResult";

export class SlippageCalculator {
  calculate(
    idealPrice: number,
    averageFillPrice: number,
    filledQuantity: number,
  ): SlippageResult {
    if (
      !Number.isFinite(idealPrice) ||
      idealPrice <= 0
    ) {
      throw new Error(
        "Invalid ideal price.",
      );
    }

    if (
      !Number.isFinite(
        averageFillPrice,
      ) ||
      averageFillPrice <= 0
    ) {
      throw new Error(
        "Invalid average fill price.",
      );
    }

    if (
      !Number.isFinite(
        filledQuantity,
      ) ||
      filledQuantity < 0
    ) {
      throw new Error(
        "Invalid filled quantity.",
      );
    }

    const priceDifference =
      averageFillPrice -
      idealPrice;

    const slippagePercent =
      (priceDifference /
        idealPrice) *
      100;

    const slippageCost =
      priceDifference *
      filledQuantity;

    return {
      idealPrice,

      averageFillPrice,

      priceDifference,

      slippagePercent,

      slippageCost,
    };
  }
}

export const slippageCalculator =
  new SlippageCalculator();