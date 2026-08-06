import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  ExecutionResult,
} from "../models/ExecutionResult";

import {
  tradingOrchestrator,
} from "../orchestrator/TradingOrchestrator";

import {
  tradingAccountService,
} from "../account/TradingAccountService";

import {
  paperTradingService,
} from "../services/PaperTradingService";

import {
  executionPlanner,
} from "./ExecutionPlanner";

import {
  paperOrderExecutor,
} from "./PaperOrderExecutor";

export interface AutomatedPaperTradeRequest {
  opportunity: ArbitrageOpportunity;
  requestedCapital: number;
}

export interface AutomatedPaperTradeResponse {
  approved: boolean;
  result: ExecutionResult | null;
  reasons: string[];
}

export class AutomatedPaperTradingService {
  execute(
    request: AutomatedPaperTradeRequest,
  ): AutomatedPaperTradeResponse {
    const {
      opportunity,
      requestedCapital,
    } = request;

    /*
     * Account validation, executable-profit validation,
     * simulation and risk assessment are owned by
     * TradingOrchestrator.
     */
    const decision =
      tradingOrchestrator.evaluate(
        opportunity,
        requestedCapital,
      );

    if (!decision.approved) {
      return {
        approved: false,
        result: null,
        reasons: decision.reasons,
      };
    }

    const plan =
      executionPlanner.createPlan(
        decision,
        opportunity.pair.market,
        opportunity.pair.buy.exchange,
        opportunity.pair.sell.exchange,
        opportunity.buyPrice,
        opportunity.sellPrice,
      );

    const capitalReserved =
      tradingAccountService.reserveCapital(
        plan.capital,
      );

    if (!capitalReserved) {
      return {
        approved: false,
        result: null,
        reasons: [
          "Unable to reserve trading capital.",
        ],
      };
    }

    try {
      const result =
        paperOrderExecutor.execute(plan);

      paperTradingService.recordCompletedExecution(
        result,
      );

      tradingAccountService.releaseCapital(
        plan.capital,
      );

      tradingAccountService.recordProfit(
        result.netProfit,
      );

      return {
        approved: true,
        result,
        reasons: decision.reasons,
      };
    } catch (error: unknown) {
      tradingAccountService.releaseCapital(
        plan.capital,
      );

      return {
        approved: false,
        result: null,
        reasons: [
          error instanceof Error
            ? error.message
            : "Unknown paper execution error.",
        ],
      };
    }
  }
}

export const automatedPaperTradingService =
  new AutomatedPaperTradingService();