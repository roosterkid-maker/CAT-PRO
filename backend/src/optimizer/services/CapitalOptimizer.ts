import { executionSimulator } from "../../execution/services/ExecutionSimulator";

import type { ExecutionRequest } from "../../execution/models/ExecutionRequest";
import type { ExecutionResult } from "../../execution/models/ExecutionResult";

import type { OptimizationCandidate } from "../models/OptimizationCandidate";
import type { OptimizationRequest } from "../models/OptimizationRequest";
import type { OptimizationResult } from "../models/OptimizationResult";

const MAXIMUM_CANDIDATES = 1_000;

export class CapitalOptimizer {
  optimize(
    request: OptimizationRequest,
  ): OptimizationResult {
    const startedAt =
      performance.now();

    this.validateRequest(
      request,
    );

    const candidates:
      OptimizationCandidate[] = [];

    let best:
      | OptimizationCandidate
      | null = null;

    const candidateCount =
      Math.floor(
        (
          request.maximumCapital -
          request.minimumCapital
        ) /
          request.capitalStep,
      ) + 1;

    if (
      candidateCount >
      MAXIMUM_CANDIDATES
    ) {
      throw new Error(
        `Optimization request exceeds the maximum of ${MAXIMUM_CANDIDATES} candidates.`,
      );
    }

    for (
      let candidateIndex = 0;
      candidateIndex <
      candidateCount;
      candidateIndex += 1
    ) {
      const capital =
        this.roundCapital(
          request.minimumCapital +
            candidateIndex *
              request.capitalStep,
        );

      const executionCapital =
        this.roundExecutionCapital(
          capital *
          (
            request.executionCapitalMultiplier ??
            1
          ),
        );

      const executionRequest:
        ExecutionRequest = {
        market:
          request.market
            .trim()
            .toUpperCase(),

        buyExchange:
          request.buyExchange
            .trim()
            .toLowerCase(),

        sellExchange:
          request.sellExchange
            .trim()
            .toLowerCase(),

        capital:
          executionCapital,
      };

      const execution =
        executionSimulator.simulate(
          executionRequest,
        );

      const score =
        this.calculateScore(
          execution,
        );

      const candidate:
        OptimizationCandidate = {
        capital,

        executionCapital,

        executionCapitalCurrency:
          request.executionCapitalCurrency
            ?.trim()
            .toUpperCase() ||
          "MARKET_QUOTE",

        score,

        execution,
      };

      candidates.push(
        candidate,
      );

      if (
        this.isBetterCandidate(
          candidate,
          best,
        )
      ) {
        best = candidate;
      }
    }

    const successfulCandidates =
      candidates.filter(
        (candidate) =>
          candidate.execution
            .success,
      ).length;

    const failedCandidates =
      candidates.length -
      successfulCandidates;

    const optimizationTimeMs =
      performance.now() -
      startedAt;

    return {
      best,

      candidates,

      summary: {
        evaluatedCandidates:
          candidates.length,

        successfulCandidates,

        failedCandidates,

        executionSuccessRate:
          candidates.length > 0
            ? this.roundPercentage(
                (
                  successfulCandidates /
                  candidates.length
                ) * 100,
              )
            : 0,

        optimizationTimeMs:
          this.roundTime(
            optimizationTimeMs,
          ),
      },
    };
  }

  private validateRequest(
    request: OptimizationRequest,
  ): void {
    if (
      !request ||
      typeof request !==
        "object"
    ) {
      throw new Error(
        "Optimization request is required.",
      );
    }

    if (
      typeof request.market !==
        "string" ||
      !request.market.trim()
    ) {
      throw new Error(
        "Market is required.",
      );
    }

    if (
      typeof request.buyExchange !==
        "string" ||
      !request.buyExchange.trim()
    ) {
      throw new Error(
        "Buy exchange is required.",
      );
    }

    if (
      typeof request.sellExchange !==
        "string" ||
      !request.sellExchange.trim()
    ) {
      throw new Error(
        "Sell exchange is required.",
      );
    }

    const buyExchange =
      request.buyExchange
        .trim()
        .toLowerCase();

    const sellExchange =
      request.sellExchange
        .trim()
        .toLowerCase();

    if (
      buyExchange ===
      sellExchange
    ) {
      throw new Error(
        "Buy and sell exchanges must be different.",
      );
    }

    if (
      !Number.isFinite(
        request.minimumCapital,
      ) ||
      request.minimumCapital <= 0
    ) {
      throw new Error(
        "Minimum capital must be a positive number.",
      );
    }

    if (
      !Number.isFinite(
        request.maximumCapital,
      ) ||
      request.maximumCapital <= 0
    ) {
      throw new Error(
        "Maximum capital must be a positive number.",
      );
    }

    if (
      request.maximumCapital <
      request.minimumCapital
    ) {
      throw new Error(
        "Maximum capital must be greater than or equal to minimum capital.",
      );
    }

    if (
      !Number.isFinite(
        request.capitalStep,
      ) ||
      request.capitalStep <= 0
    ) {
      throw new Error(
        "Capital step must be a positive number.",
      );
    }

    if (
      request.executionCapitalMultiplier !==
        undefined &&
      (
        !Number.isFinite(
          request.executionCapitalMultiplier,
        ) ||
        request.executionCapitalMultiplier <=
          0
      )
    ) {
      throw new Error(
        "Execution-capital multiplier must be a positive number when provided.",
      );
    }

    const candidateCount =
      Math.floor(
        (
          request.maximumCapital -
          request.minimumCapital
        ) /
          request.capitalStep,
      ) + 1;

    if (
      !Number.isFinite(
        candidateCount,
      ) ||
      candidateCount <= 0
    ) {
      throw new Error(
        "Unable to calculate optimization candidates.",
      );
    }
  }

  private calculateScore(
    execution: ExecutionResult,
  ): number {
    if (
      !execution.success ||
      !execution.simulation
    ) {
      return 0;
    }

    const {
      profit,
      confidence,
      depth,
      decision,
    } = execution.simulation;

    const netProfit =
      profit.breakdown.netProfit;

    const confidenceScore =
      confidence.score;

    const fillPercent =
      depth.fillPercent;

    if (
      !Number.isFinite(
        netProfit,
      ) ||
      netProfit <= 0
    ) {
      return 0;
    }

    const confidenceFactor =
      this.clampFactor(
        confidenceScore / 100,
      );

    const fillFactor =
      this.clampFactor(
        fillPercent / 100,
      );

    const decisionFactor =
      decision.recommendation ===
      "EXECUTE"
        ? 1
        : decision.recommendation ===
            "REVIEW"
          ? 0.5
          : 0;

    return this.roundScore(
      netProfit *
        confidenceFactor *
        fillFactor *
        decisionFactor,
    );
  }

  private isBetterCandidate(
    candidate:
      OptimizationCandidate,

    currentBest:
      | OptimizationCandidate
      | null,
  ): boolean {
    if (!currentBest) {
      return true;
    }

    if (
      candidate.score >
      currentBest.score
    ) {
      return true;
    }

    if (
      candidate.score <
      currentBest.score
    ) {
      return false;
    }

    const candidateProfit =
      this.getNetProfit(
        candidate.execution,
      );

    const bestProfit =
      this.getNetProfit(
        currentBest.execution,
      );

    if (
      candidateProfit >
      bestProfit
    ) {
      return true;
    }

    if (
      candidateProfit <
      bestProfit
    ) {
      return false;
    }

    const candidateConfidence =
      this.getConfidence(
        candidate.execution,
      );

    const bestConfidence =
      this.getConfidence(
        currentBest.execution,
      );

    if (
      candidateConfidence >
      bestConfidence
    ) {
      return true;
    }

    if (
      candidateConfidence <
      bestConfidence
    ) {
      return false;
    }

    /*
     * Lower capital is preferred when
     * score, profit, and confidence match.
     */
    return (
      candidate.capital <
      currentBest.capital
    );
  }

  private getNetProfit(
    execution: ExecutionResult,
  ): number {
    return (
      execution.simulation
        ?.profit.breakdown
        .netProfit ?? 0
    );
  }

  private getConfidence(
    execution: ExecutionResult,
  ): number {
    return (
      execution.simulation
        ?.confidence.score ?? 0
    );
  }

  private clampFactor(
    value: number,
  ): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        1,
        value,
      ),
    );
  }

  private roundCapital(
    value: number,
  ): number {
    return (
      Math.round(
        value * 100,
      ) / 100
    );
  }

  private roundExecutionCapital(
    value: number,
  ): number {
    return Number(
      value.toFixed(
        12,
      ),
    );
  }

  private roundScore(
    value: number,
  ): number {
    return (
      Math.round(
        value * 1_000_000,
      ) / 1_000_000
    );
  }

  private roundPercentage(
    value: number,
  ): number {
    return (
      Math.round(
        value * 100,
      ) / 100
    );
  }

  private roundTime(
    value: number,
  ): number {
    return (
      Math.round(
        value * 1_000,
      ) / 1_000
    );
  }
}

export const capitalOptimizer =
  new CapitalOptimizer();
