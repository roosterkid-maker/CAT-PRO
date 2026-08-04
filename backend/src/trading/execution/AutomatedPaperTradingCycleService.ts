import { opportunityService } from "../../arbitrage/services/OpportunityService";
import { opportunityRankingService } from "../../ranking/services/OpportunityRankingService";

import type { ExecutionResult } from "../models/ExecutionResult";

import { automatedPaperTradingService } from "./AutomatedPaperTradingService";

export type AutomatedPaperCycleStatus =
  | "NO_OPPORTUNITY"
  | "OPPORTUNITY_EXPIRED"
  | "EXECUTION_REJECTED"
  | "EXECUTED";

export interface AutomatedPaperCycleResult {
  status: AutomatedPaperCycleStatus;

  opportunityId: string | null;

  market: string | null;

  requestedCapital: number | null;

  result: ExecutionResult | null;

  reasons: string[];
}

export class AutomatedPaperTradingCycleService {
  run(): AutomatedPaperCycleResult {
    const ranking =
      opportunityRankingService.rank();

    const topRanked =
      ranking.opportunities[0];

    if (!topRanked) {
      return {
        status: "NO_OPPORTUNITY",

        opportunityId: null,

        market: null,

        requestedCapital: null,

        result: null,

        reasons: [
          "No ranked opportunity is currently available.",
        ],
      };
    }

    const sourceOpportunities =
      opportunityService.getOpportunities();

    const opportunity =
      sourceOpportunities.find(
        (candidate) =>
          candidate.pair.market ===
            topRanked.market &&
          candidate.pair.buy.exchange ===
            topRanked.buyExchange &&
          candidate.pair.sell.exchange ===
            topRanked.sellExchange,
      );

    if (!opportunity) {
      return {
        status: "OPPORTUNITY_EXPIRED",

        opportunityId: null,

        market:
          topRanked.market,

        requestedCapital: null,

        result: null,

        reasons: [
          "The ranked opportunity is no longer available.",
        ],
      };
    }

    const requestedCapital =
      topRanked.recommendedCapital;

    if (
      !Number.isFinite(
        requestedCapital,
      ) ||
      requestedCapital <= 0
    ) {
      return {
        status: "EXECUTION_REJECTED",

        opportunityId:
          opportunity.id,

        market:
          opportunity.pair.market,

        requestedCapital: null,

        result: null,

        reasons: [
          "Ranking did not provide a valid recommended capital.",
        ],
      };
    }

    const execution =
      automatedPaperTradingService.execute({
        opportunity,
        requestedCapital,
      });

    if (
      !execution.approved ||
      !execution.result
    ) {
      return {
        status: "EXECUTION_REJECTED",

        opportunityId:
          opportunity.id,

        market:
          opportunity.pair.market,

        requestedCapital,

        result: null,

        reasons:
          execution.reasons,
      };
    }

    return {
      status: "EXECUTED",

      opportunityId:
        opportunity.id,

      market:
        opportunity.pair.market,

      requestedCapital,

      result:
        execution.result,

      reasons:
        execution.reasons,
    };
  }
}

export const automatedPaperTradingCycleService =
  new AutomatedPaperTradingCycleService();