import { opportunityService } from "../../arbitrage/services/OpportunityService";
import { orderBookService } from "../../orderbook/services/OrderBookService";
import { capitalOptimizer } from "../../optimizer/services/CapitalOptimizer";

import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";
import type { OptimizationCandidate } from "../../optimizer/models/OptimizationCandidate";

import type { OpportunityScore } from "../models/OpportunityScore";
import type { RankingResult } from "../models/RankingResult";

const DEFAULT_MINIMUM_CAPITAL = 500;
const DEFAULT_MAXIMUM_CAPITAL = 50_000;
const DEFAULT_CAPITAL_STEP = 500;

const MAXIMUM_RANKED_OPPORTUNITIES = 25;

export class OpportunityRankingService {
  rank(
    sourceOpportunities:
      readonly ArbitrageOpportunity[] =
      opportunityService
        .getLastOpportunities(),
  ): RankingResult {
    const executableOpportunities =
      sourceOpportunities.filter(
        (opportunity) =>
          this.hasRequiredOrderBooks(
            opportunity,
          ),
      );

    const selectedOpportunities =
      executableOpportunities.slice(
        0,
        MAXIMUM_RANKED_OPPORTUNITIES,
      );

    const ranked: OpportunityScore[] = [];

    for (
      const opportunity
      of selectedOpportunities
    ) {
      const evaluation =
        this.evaluateOpportunity(
          opportunity,
        );

      if (!evaluation) {
        continue;
      }

      if (evaluation.score <= 0) {
        continue;
      }

      ranked.push(evaluation);
    }

    ranked.sort(
      (first, second) =>
        second.score - first.score,
    );

    return {
      opportunities: ranked,
      generatedAt: Date.now(),
    };
  }

  private hasRequiredOrderBooks(
    opportunity: ArbitrageOpportunity,
  ): boolean {
    const market =
      opportunity.pair.market
        .trim()
        .toUpperCase();

    const buyExchange =
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase();

    return (
      orderBookService.has(
        buyExchange,
        market,
      ) &&
      orderBookService.has(
        sellExchange,
        market,
      )
    );
  }

  private evaluateOpportunity(
    opportunity: ArbitrageOpportunity,
  ): OpportunityScore | null {
    try {
      const optimization =
        capitalOptimizer.optimize({
          market:
            opportunity.pair.market,

          buyExchange:
            opportunity.pair.buy.exchange,

          sellExchange:
            opportunity.pair.sell.exchange,

          minimumCapital:
            DEFAULT_MINIMUM_CAPITAL,

          maximumCapital:
            DEFAULT_MAXIMUM_CAPITAL,

          capitalStep:
            DEFAULT_CAPITAL_STEP,
        });

      const best =
        optimization.best;

      if (
        !best ||
        best.score <= 0 ||
        !best.execution.success ||
        !best.execution.simulation
      ) {
        return null;
      }

      return this.buildScore(
        opportunity,
        best,
      );
    } catch (error) {
      console.error(
        `[Ranking] Failed to evaluate ${opportunity.pair.market}:`,
        error,
      );

      return null;
    }
  }

  private buildScore(
    opportunity: ArbitrageOpportunity,
    candidate: OptimizationCandidate,
  ): OpportunityScore {
    const simulation =
      candidate.execution.simulation;

    if (!simulation) {
      throw new Error(
        "Successful optimization candidate has no simulation result.",
      );
    }

    const netProfit =
      simulation.profit.breakdown
        .netProfit;

    const confidence =
      simulation.confidence.score;

    const fillPercent =
      simulation.depth.fillPercent;

    const liquidityScore =
      opportunity.liquidityScore;

    const executionTimeMs =
      candidate.execution
        .executionTimeMs;

    const score =
      this.calculateRankingScore({
        optimizerScore:
          candidate.score,

        confidence,

        fillPercent,

        liquidityScore,

        executionTimeMs,
      });

    return {
      market:
        opportunity.pair.market,

      buyExchange:
        opportunity.pair.buy.exchange,

      sellExchange:
        opportunity.pair.sell.exchange,

      score,

      recommendedCapital:
  candidate.capital,

expectedNetProfit:
  netProfit,

      confidence,

      fillPercent,

      liquidityScore,

      executionTimeMs,

      recommendation:
        simulation.decision
          .recommendation,
    };
  }

  private calculateRankingScore(
    input: {
      optimizerScore: number;
      confidence: number;
      fillPercent: number;
      liquidityScore: number;
      executionTimeMs: number;
    },
  ): number {
    const profitScore =
      this.normalizeOptimizerScore(
        input.optimizerScore,
      );

    const confidenceScore =
      this.clampScore(
        input.confidence,
      );

    const fillScore =
      this.clampScore(
        input.fillPercent,
      );

    const liquidityScore =
      this.clampScore(
        input.liquidityScore,
      );

    const executionSpeedScore =
      this.calculateExecutionSpeedScore(
        input.executionTimeMs,
      );

    const weightedScore =
      profitScore * 0.35 +
      confidenceScore * 0.25 +
      fillScore * 0.2 +
      liquidityScore * 0.1 +
      executionSpeedScore * 0.1;

    return this.roundScore(
      weightedScore,
    );
  }

  private normalizeOptimizerScore(
    score: number,
  ): number {
    if (
      !Number.isFinite(score) ||
      score <= 0
    ) {
      return 0;
    }

    return this.clampScore(
      (
        score /
        (score + 100)
      ) * 100,
    );
  }

  private calculateExecutionSpeedScore(
    executionTimeMs: number,
  ): number {
    if (
      !Number.isFinite(
        executionTimeMs,
      ) ||
      executionTimeMs < 0
    ) {
      return 0;
    }

    return this.clampScore(
      100 - executionTimeMs,
    );
  }

  private clampScore(
    value: number,
  ): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        100,
        value,
      ),
    );
  }

  private roundScore(
    value: number,
  ): number {
    return (
      Math.round(
        value * 100,
      ) / 100
    );
  }
}

export const opportunityRankingService =
  new OpportunityRankingService();
