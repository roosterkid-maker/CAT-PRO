export type TradeDecision =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export type TradeRisk =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface TradingIntelligence {
  decision: {
    decision: TradeDecision;
    reason: string;
    confidence: number;
  };

  risk: {
    risk: TradeRisk;
    score: number;
    reason: string;
  };

  confidence: {
    confidence: number;
    reason: string;
  };

  summary: string[];
}