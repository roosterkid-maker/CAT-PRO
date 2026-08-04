import { opportunityRankingService } from "../../ranking/services/OpportunityRankingService";
import { capitalOptimizer } from "../../optimizer/services/CapitalOptimizer";
import { riskEngine } from "../../risk/services/RiskEngine";

export interface TradeCycleResult {
  status:
    | "NO_OPPORTUNITY"
    | "OPTIMIZATION_FAILED"
    | "SIMULATION_MISSING"
    | "RISK_BLOCKED"
    | "READY";

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
  executeCycle(): TradeCycleResult {
    const ranking =
      opportunityRankingService.rank();

    const topOpportunity =
      ranking.opportunities[0];

    if (!topOpportunity) {
      return {
        status: "NO_OPPORTUNITY",

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

        maximumCapital: 50_000,

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

    if (!risk.approved) {
      return {
        status: "RISK_BLOCKED",

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
          risk.reasons,
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
              "Opportunity passed ranking, optimization, and risk evaluation.",
            ],
    };
  }
}

export const tradeOrchestrator =
  new TradeOrchestrator();