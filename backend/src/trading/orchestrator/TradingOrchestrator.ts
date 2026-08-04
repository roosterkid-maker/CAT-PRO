import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";

import {
  executionAnalysis,
} from "../analysis/ExecutionAnalysis";

import {
  riskEngine,
} from "../risk/RiskEngine";

import {
  capitalAllocationEngine,
} from "../allocation/CapitalAllocationEngine";

import {
  defaultArbitragePolicy,
} from "../../arbitrage/config/policy";

export interface TradingDecision {
  approved: boolean;

  executionScore: number;

  riskScore: number;

  allocatedCapital: number;

  executableQuantity: number;

  decision: "EXECUTE" | "REVIEW" | "SKIP";

  reasons: string[];
}

export class TradingOrchestrator {
  evaluate(
    opportunity: ArbitrageOpportunity,
    requestedCapital: number,
  ): TradingDecision {

    const execution =
      executionAnalysis.analyze(
        opportunity,
        defaultArbitragePolicy,
      );

    const risk =
      riskEngine.evaluate(
        opportunity,
      );

    const allocation =
      capitalAllocationEngine.allocate(
        opportunity,
        requestedCapital,
      );

    const approved =
      execution.executable &&
      risk.approved &&
      allocation.approved;

    const reasons = [
      ...execution.summary,
      ...risk.reasons,
      allocation.reason,
    ];

    return {

      approved,

      executionScore:
        execution.overallScore,

      riskScore:
        risk.score,

      allocatedCapital:
        allocation.allocatedCapital,

      executableQuantity:
        allocation.executableQuantity,

      decision:
        approved
          ? "EXECUTE"
          : execution.overallScore >= 70
            ? "REVIEW"
            : "SKIP",

      reasons,
    };
  }
}

export const tradingOrchestrator =
  new TradingOrchestrator();