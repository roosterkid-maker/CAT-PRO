import {
  evaluateDecision,
  type DecisionResult,
} from "./DecisionEngine";

import {
  evaluateRisk,
  type RiskResult,
} from "./RiskEngine";

import {
  evaluateConfidence,
  type ConfidenceResult,
} from "./ConfidenceEngine";

export interface TradingIntelligenceInput {
  roi: number;

  quoteFresh: boolean;

  exchangesConnected: boolean;

  spreadPositive: boolean;
}

export interface TradingIntelligenceResult {
  decision: DecisionResult;

  risk: RiskResult;

  confidence: ConfidenceResult;

  summary: string[];
}

export function evaluateTradingIntelligence(
  input: TradingIntelligenceInput,
): TradingIntelligenceResult {
  const decision =
    evaluateDecision(input.roi);

  const risk =
    evaluateRisk({
      roi: input.roi,
      quoteFresh: input.quoteFresh,
      exchangesConnected:
        input.exchangesConnected,
    });

  const confidence =
    evaluateConfidence({
      roi: input.roi,
      quoteFresh: input.quoteFresh,
      exchangesConnected:
        input.exchangesConnected,
      spreadPositive:
        input.spreadPositive,
    });

  const summary: string[] = [];

  summary.push(decision.reason);
  summary.push(risk.reason);
  summary.push(confidence.reason);

  return {
    decision,
    risk,
    confidence,
    summary,
  };
}