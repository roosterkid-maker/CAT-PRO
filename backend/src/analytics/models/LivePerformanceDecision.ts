export type LivePerformanceDecision =
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_READY"
  | "ANALYTICALLY_READY_FOR_TINY_VALIDATION";

export interface LivePerformanceDecisionReport {
  generatedAt: number;

  version: "17.6";

  decision: LivePerformanceDecision;

  analyticsOnly: true;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  tinyValidationAuthorized: false;

  failClosed: true;

  summary: {
    readinessLevel:
      | "INSUFFICIENT_DATA"
      | "NOT_READY"
      | "READY_FOR_TINY_VALIDATION";

    performanceEvidenceStatus:
      | "NO_DATA"
      | "PARTIAL"
      | "AVAILABLE";

    totalReadinessGates: number;

    passingReadinessGates: number;

    blockedReadinessGates: number;

    insufficientReadinessGates: number;

    matchedLiveCycles: number;

    minimumMatchedLiveCycles: number;

    matchedSampleProgressPercent: number;

    establishedRoutes: number;

    establishedExchangePairs: number;

    aggregateProfitRetentionPercent:
      number | null;

    realizedNetProfit: number;

    fillRatePercent: number;

    partialFillRatePercent: number;

    failureRatePercent: number;

    timeoutRatePercent: number;

    averageExecutionTimeMs: number;

    averageAdverseSlippagePercent: number;
  };

  nextRequirements: string[];

  blockers: string[];

  insufficientEvidence: string[];

  warnings: string[];

  notes: string[];
}