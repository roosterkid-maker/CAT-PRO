export interface PriceDeviationInput {
  buyPrice: number;
  sellPrice: number;
  maximumDeviationPercent: number;
}

export interface PriceDeviationAnalysis {
  acceptable: boolean;

  deviationPercent: number;

  score: number;

  reason: string;
}

export class PriceDeviationAnalyzer {
  analyze(
    input: PriceDeviationInput,
  ): PriceDeviationAnalysis {
    const deviationPercent =
      Math.abs(
        input.sellPrice -
          input.buyPrice,
      ) /
      input.buyPrice *
      100;

    const acceptable =
      deviationPercent <=
      input.maximumDeviationPercent;

    let score = 100;

    if (!acceptable) {
      score = 0;
    } else {
      score = Math.max(
        0,
        100 -
          deviationPercent * 10,
      );
    }

    return {
      acceptable,

      deviationPercent,

      score,

      reason: acceptable
        ? "Price deviation is within the acceptable range."
        : `Price deviation ${deviationPercent.toFixed(
            2,
          )}% exceeds maximum allowed ${input.maximumDeviationPercent.toFixed(
            2,
          )}%.`,
    };
  }
}

export const priceDeviationAnalyzer =
  new PriceDeviationAnalyzer();