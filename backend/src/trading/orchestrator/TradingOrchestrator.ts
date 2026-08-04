import { opportunityRankingService } from "../../ranking/services/OpportunityRankingService";
import { capitalOptimizer } from "../../optimizer/services/CapitalOptimizer";
import { executionSimulator } from "../../execution/services/ExecutionSimulator";
import { riskEngine } from "../../risk/services/RiskEngine";

import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";

export type TradingRecommendation =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface TradingDecision {
  approved: boolean;

  decision: TradingRecommendation;

  allocatedCapital: number;

  executionScore: number;

  riskScore: number;

  reasons: string[];
}

export type TradeCycleStatus =
  | "NO_OPPORTUNITY"
  | "OPTIMIZATION_FAILED"
  | "SIMULATION_MISSING"
  | "RISK_BLOCKED"
  | "READY";

export interface TradeCycleResult {
  status: TradeCycleStatus;

  market: string | null;

  buyExchange: string | null;
  sellExchange: string | null;

  capital: number | null;

  rankingScore: number | null;

  riskLevel:
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | null;

  reasons: string[];
}

export class TradeOrchestrator {
  /**
   * Backward-compatible evaluation method used by
   * AutomatedPaperTradingService and ExecutionPlanner.
   */
  evaluate(
    opportunity: ArbitrageOpportunity,
    requestedCapital: number,
  ): TradingDecision {
    if (
      !Number.isFinite(requestedCapital) ||
      requestedCapital <= 0
    ) {
      return {
        approved: false,

        decision: "SKIP",

        allocatedCapital: 0,

        executionScore: 0,

        riskScore: 0,

        reasons: [
          "Requested capital must be a positive number.",
        ],
      };
    }

    const execution =
      executionSimulator.simulate({
        market:
          opportunity.pair.market,

        buyExchange:
          opportunity.pair.buy.exchange,

        sellExchange:
          opportunity.pair.sell.exchange,

        capital:
          requestedCapital,
      });

    if (
      !execution.success ||
      !execution.simulation
    ) {
      return {
        approved: false,

        decision: "SKIP",

        allocatedCapital: 0,

        executionScore: 0,

        riskScore: 0,

        reasons: [
          execution.failureReason ??
            "Execution simulation failed.",
        ],
      };
    }

    const simulation =
      execution.simulation;

    const executionScore =
      this.clampScore(
        simulation.confidence.score,
      );

    const risk =
      riskEngine.assess({
        capital:
          requestedCapital,

        confidence:
          simulation.confidence.score,

        fillPercent:
          simulation.depth.fillPercent,

        netProfit:
          simulation.profit.breakdown
            .netProfit,

        executionTimeMs:
          execution.executionTimeMs,

        liquidityScore:
          opportunity.liquidityScore,
      });

    const riskScore =
      this.clampScore(
        risk.score,
      );

    const simulationDecision =
      simulation.decision
        .recommendation;

    const approved =
      risk.approved &&
      simulationDecision ===
        "EXECUTE";

    const decision:
      TradingRecommendation =
      !risk.approved
        ? "SKIP"
        : simulationDecision;

    const reasons =
      this.collectReasons(
        simulation.confidence.reasons,
        risk.reasons,
        approved,
      );

    return {
      approved,

      decision,

      allocatedCapital:
        approved
          ? requestedCapital
          : 0,

      executionScore,

      riskScore,

      reasons,
    };
  }

  /**
   * Evaluates the highest-ranked opportunity and
   * determines whether it is ready for execution.
   */
  executeCycle(): TradeCycleResult {
    const ranking =
      opportunityRankingService.rank();

    const topOpportunity =
      ranking.opportunities[0];

    if (!topOpportunity) {
      return {
        status:
          "NO_OPPORTUNITY",

        market: null,

        buyExchange: null,
        sellExchange: null,

        capital: null,

        rankingScore: null,

        riskLevel: null,

        reasons: [
          "No ranked opportunity is currently available.",
        ],
      };
    }

    const optimization =
      capitalOptimizer.optimize({
        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        minimumCapital: 500,

        maximumCapital:
          50_000,

        capitalStep: 500,
      });

    const bestCandidate =
      optimization.best;

    if (
      !bestCandidate ||
      bestCandidate.score <= 0
    ) {
      return {
        status:
          "OPTIMIZATION_FAILED",

        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        capital: null,

        rankingScore:
          topOpportunity.score,

        riskLevel: null,

        reasons: [
          "Capital optimizer did not produce a profitable executable candidate.",
        ],
      };
    }

    const simulation =
      bestCandidate.execution
        .simulation;

    if (!simulation) {
      return {
        status:
          "SIMULATION_MISSING",

        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        capital:
          bestCandidate.capital,

        rankingScore:
          topOpportunity.score,

        riskLevel: null,

        reasons: [
          "Best optimization candidate does not contain a simulation result.",
        ],
      };
    }

    const risk =
      riskEngine.assess({
        capital:
          bestCandidate.capital,

        confidence:
          simulation.confidence
            .score,

        fillPercent:
          simulation.depth
            .fillPercent,

        netProfit:
          simulation.profit
            .breakdown.netProfit,

        executionTimeMs:
          bestCandidate.execution
            .executionTimeMs,

        liquidityScore:
          topOpportunity
            .liquidityScore,
      });

    if (
      !risk.approved ||
      simulation.decision
        .recommendation !==
        "EXECUTE"
    ) {
      return {
        status:
          "RISK_BLOCKED",

        market:
          topOpportunity.market,

        buyExchange:
          topOpportunity.buyExchange,

        sellExchange:
          topOpportunity.sellExchange,

        capital:
          bestCandidate.capital,

        rankingScore:
          topOpportunity.score,

        riskLevel:
          risk.level,

        reasons:
          risk.reasons.length > 0
            ? risk.reasons
            : [
                `Execution decision is ${simulation.decision.recommendation}.`,
              ],
      };
    }

    return {
      status: "READY",

      market:
        topOpportunity.market,

      buyExchange:
        topOpportunity.buyExchange,

      sellExchange:
        topOpportunity.sellExchange,

      capital:
        bestCandidate.capital,

      rankingScore:
        topOpportunity.score,

      riskLevel:
        risk.level,

      reasons:
        risk.reasons.length > 0
          ? risk.reasons
          : [
              "Opportunity passed ranking, optimization, simulation, and risk evaluation.",
            ],
    };
  }

  private collectReasons(
    executionReasons: string[],
    riskReasons: string[],
    approved: boolean,
  ): string[] {
    const reasons = [
      ...executionReasons,
      ...riskReasons,
    ];

    if (
      approved &&
      reasons.length === 0
    ) {
      reasons.push(
        "Trade passed execution and risk evaluation.",
      );
    }

    if (
      !approved &&
      reasons.length === 0
    ) {
      reasons.push(
        "Trade did not satisfy the execution requirements.",
      );
    }

    return [
      ...new Set(reasons),
    ];
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
        Math.round(value),
      ),
    );
  }
}

export const tradingOrchestrator =
  new TradeOrchestrator();

/**
 * Alias retained for newer integrations.
 */
export const tradeOrchestrator =
  tradingOrchestrator;