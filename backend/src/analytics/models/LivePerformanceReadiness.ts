export type LivePerformanceReadinessLevel =
  | "INSUFFICIENT_DATA"
  | "NOT_READY"
  | "READY_FOR_TINY_VALIDATION";

export type LivePerformanceReadinessGateState =
  | "PASS"
  | "BLOCKED"
  | "INSUFFICIENT_DATA";

export interface LivePerformanceReadinessGate {
  key: string;

  state: LivePerformanceReadinessGateState;

  required: boolean;

  message: string;

  reasons: string[];
}

export interface LivePerformanceReadinessMetrics {
  matchedLiveCycles: number;

  minimumMatchedLiveCycles: number;

  totalExecutions: number;

  fillRatePercent: number;

  partialFillRatePercent: number;

  failureRatePercent: number;

  timeoutRatePercent: number;

  averageExecutionTimeMs: number;

  averageAdverseSlippagePercent: number;

  aggregateProfitRetentionPercent: number | null;

  totalExpectedNetProfit: number;

  totalRealizedNetProfit: number;

  totalProfitVariance: number;

  establishedRoutes: number;

  establishedExchangePairs: number;
}

export interface LivePerformanceReadinessPolicy {
  minimumMatchedLiveCycles: number;

  minimumProfitRetentionPercent: number;

  executionHealthMustBeHealthy: true;

  positiveRealizedNetProfitRequired: true;

  establishedRouteEvidenceRequired: true;

  partialFillRateIsObserved: true;

  adverseSlippageIsObserved: true;
}

export interface LivePerformanceReadinessReport {
  generatedAt: number;

  version: "17.6";

  level: LivePerformanceReadinessLevel;

  analyticsOnly: true;

  liveTradingEnabled: false;

  tinyValidationAuthorized: false;

  failClosed: true;

  policy: LivePerformanceReadinessPolicy;

  metrics: LivePerformanceReadinessMetrics;

  gates: LivePerformanceReadinessGate[];

  blockers: string[];

  insufficientEvidence: string[];

  notes: string[];
}