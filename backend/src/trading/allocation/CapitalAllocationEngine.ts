import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";

export interface CapitalAllocationConfig {
  minimumCapital: number;
  maximumCapital: number;

  minimumScore: number;
  preferredScore: number;

  maximumLiquidityUsagePercent: number;
}

export interface CapitalAllocationResult {
  requestedCapital: number;

  maximumExecutableCapital: number;
  liquidityLimitedCapital: number;

  scoreMultiplier: number;
  allocatedCapital: number;

  executableQuantity: number;

  approved: boolean;
  reason: string;
}

export const defaultCapitalAllocationConfig:
  CapitalAllocationConfig = {
  minimumCapital: 1_000,
  maximumCapital: 100_000,

  minimumScore: 65,
  preferredScore: 90,

  /*
   * Top-of-book liquidity ka maximum 25% hi use karenge,
   * taaki slippage aur partial-fill risk kam rahe.
   */
  maximumLiquidityUsagePercent: 25,
};

export class CapitalAllocationEngine {
  allocate(
    opportunity: ArbitrageOpportunity,
    requestedCapital: number,
    config: CapitalAllocationConfig =
      defaultCapitalAllocationConfig,
  ): CapitalAllocationResult {
    if (
      !Number.isFinite(requestedCapital) ||
      requestedCapital <= 0
    ) {
      return this.reject(
        "Requested capital must be a positive number.",
      );
    }

    if (
      !opportunity.quotesAreFresh ||
      !opportunity.enoughLiquidity ||
      opportunity.decision === "SKIP"
    ) {
      return this.reject(
        "Opportunity failed execution-quality requirements.",
      );
    }

    if (
      opportunity.score <
      config.minimumScore
    ) {
      return this.reject(
        `Opportunity score ${opportunity.score} is below the minimum score ${config.minimumScore}.`,
      );
    }

    const availableQuantity =
      opportunity.availableExecutableQty;

    const buyPrice =
      opportunity.buyPrice;

    if (
      !Number.isFinite(availableQuantity) ||
      !Number.isFinite(buyPrice) ||
      availableQuantity <= 0 ||
      buyPrice <= 0
    ) {
      return this.reject(
        "Opportunity contains invalid liquidity or price data.",
      );
    }

    const maximumExecutableCapital =
      availableQuantity * buyPrice;

    const liquidityUsageRatio =
      Math.max(
        0,
        Math.min(
          1,
          config.maximumLiquidityUsagePercent /
            100,
        ),
      );

    const liquidityLimitedCapital =
      maximumExecutableCapital *
      liquidityUsageRatio;

    const boundedRequestedCapital =
      Math.min(
        requestedCapital,
        config.maximumCapital,
      );

    const scoreRange =
      Math.max(
        1,
        config.preferredScore -
          config.minimumScore,
      );

    const scoreMultiplier =
      Math.max(
        0,
        Math.min(
          1,
          (opportunity.score -
            config.minimumScore) /
            scoreRange,
        ),
      );

    /*
     * Minimum score par 25% capital,
     * preferred score par 100% capital.
     */
    const adjustedScoreMultiplier =
      0.25 +
      scoreMultiplier * 0.75;

    const scoreLimitedCapital =
      boundedRequestedCapital *
      adjustedScoreMultiplier;

    const allocatedCapital =
      Math.min(
        scoreLimitedCapital,
        liquidityLimitedCapital,
        config.maximumCapital,
      );

    if (
      !Number.isFinite(allocatedCapital) ||
      allocatedCapital <
        config.minimumCapital
    ) {
      return {
        requestedCapital,

        maximumExecutableCapital,
        liquidityLimitedCapital,

        scoreMultiplier:
          adjustedScoreMultiplier,

        allocatedCapital: 0,
        executableQuantity: 0,

        approved: false,

        reason:
          "Safe executable capital is below the configured minimum.",
      };
    }

    const executableQuantity =
      allocatedCapital / buyPrice;

    return {
      requestedCapital,

      maximumExecutableCapital,
      liquidityLimitedCapital,

      scoreMultiplier:
        adjustedScoreMultiplier,

      allocatedCapital,
      executableQuantity,

      approved: true,

      reason:
        `₹${allocatedCapital.toFixed(
          2,
        )} allocated using execution score ${opportunity.score} and ${config.maximumLiquidityUsagePercent}% liquidity usage limit.`,
    };
  }

  private reject(
    reason: string,
  ): CapitalAllocationResult {
    return {
      requestedCapital: 0,

      maximumExecutableCapital: 0,
      liquidityLimitedCapital: 0,

      scoreMultiplier: 0,
      allocatedCapital: 0,

      executableQuantity: 0,

      approved: false,
      reason,
    };
  }
}

export const capitalAllocationEngine =
  new CapitalAllocationEngine();