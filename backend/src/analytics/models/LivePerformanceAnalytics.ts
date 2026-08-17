export type LivePerformanceEvidenceStatus =
  | "NO_DATA"
  | "PARTIAL"
  | "AVAILABLE";

export type PerformanceEvidenceLevel =
  | "NO_DATA"
  | "INSUFFICIENT"
  | "DEVELOPING"
  | "ESTABLISHED";

export interface LivePerformanceExecutionSummary {
  totalExecutions: number;

  filledExecutions: number;

  partialFillExecutions: number;

  failedExecutions: number;

  rejectedExecutions: number;

  timedOutExecutions: number;

  cancelledExecutions: number;

  fillRatePercent: number;

  partialFillRatePercent: number;

  failureRatePercent: number;

  timeoutRatePercent: number;

  cancellationRatePercent: number;

  averageExecutionTimeMs: number;

  fastestExecutionTimeMs: number | null;

  slowestExecutionTimeMs: number | null;
}

export interface LivePerformancePnLSummary {
  totalCycles: number;

  completedCycles: number;

  profitableCycles: number;

  lossCycles: number;

  recoveryRequiredCycles: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  averageNetProfit: number;

  winRatePercent: number;
}

export interface LivePerformanceSlippageSummary {
  sampledExecutions: number;

  sampledBuyExecutions: number;

  sampledSellExecutions: number;

  averageAbsoluteSlippagePercent: number;

  averageSignedSlippagePercent: number;

  worstAdverseSlippagePercent: number;

  bestFavorableSlippagePercent: number;
}

export interface LivePerformanceExchangeSummary {
  exchange: string;

  totalExecutions: number;

  fillRatePercent: number;

  partialFillRatePercent: number;

  failureRatePercent: number;

  timeoutRatePercent: number;

  averageExecutionTimeMs: number;

  lastExecutionAt: number | null;
}

export interface ExpectedVsRealizedCycle {
  sessionId: string;

  planId: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  capital: number;

  expectedNetProfit: number;

  realizedGrossProfit: number;

  realizedNetProfit: number;

  profitVariance: number;

  profitRetentionPercent: number | null;

  expectedFees: number | null;

  realizedFees: number;

  feeVariance: number | null;

  expectedProfitPercent: number;

  realizedRoiPercent: number;

  totalAdverseSlippagePercent: number;

  executionDurationMs: number;

  settledAt: number;
}

export interface ExpectedVsRealizedSummary {
  matchedCycles: number;

  unmatchedSettlements: number;

  unmatchedSessions: number;

  totalExpectedNetProfit: number;

  totalRealizedNetProfit: number;

  totalProfitVariance: number;

  aggregateProfitRetentionPercent: number | null;

  averageProfitRetentionPercent: number | null;

  cyclesMeetingOrBeatingExpectation: number;

  cyclesBelowExpectation: number;

  expectedFees: number;

  realizedFees: number;

  feeVariance: number;

  latest: ExpectedVsRealizedCycle[];
}

export interface RoutePerformanceRecord {
  routeKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  evidenceLevel: PerformanceEvidenceLevel;

  matchedCycles: number;

  profitableCycles: number;

  lossCycles: number;

  expectationMetCycles: number;

  expectationMissedCycles: number;

  winRatePercent: number;

  expectationHitRatePercent: number;

  totalCapital: number;

  totalExpectedNetProfit: number;

  totalRealizedGrossProfit: number;

  totalRealizedNetProfit: number;

  averageRealizedNetProfit: number;

  profitRetentionPercent: number | null;

  totalRealizedFees: number;

  averageRealizedFees: number;

  averageRoiPercent: number;

  averageAdverseSlippagePercent: number;

  averageExecutionDurationMs: number;

  latestSettlementAt: number;
}

export interface ExchangePairPerformanceRecord {
  exchangePairKey: string;

  buyExchange: string;

  sellExchange: string;

  evidenceLevel: PerformanceEvidenceLevel;

  marketsObserved: string[];

  matchedCycles: number;

  profitableCycles: number;

  lossCycles: number;

  expectationMetCycles: number;

  expectationMissedCycles: number;

  winRatePercent: number;

  expectationHitRatePercent: number;

  totalCapital: number;

  totalExpectedNetProfit: number;

  totalRealizedGrossProfit: number;

  totalRealizedNetProfit: number;

  averageRealizedNetProfit: number;

  profitRetentionPercent: number | null;

  totalRealizedFees: number;

  averageRealizedFees: number;

  averageRoiPercent: number;

  averageAdverseSlippagePercent: number;

  averageExecutionDurationMs: number;

  latestSettlementAt: number;
}

export interface RoutePerformanceSummary {
  minimumEstablishedSamples: number;

  routesObserved: number;

  establishedRoutes: number;

  developingRoutes: number;

  insufficientRoutes: number;

  routes: RoutePerformanceRecord[];

  exchangePairsObserved: number;

  establishedExchangePairs: number;

  developingExchangePairs: number;

  insufficientExchangePairs: number;

  exchangePairs: ExchangePairPerformanceRecord[];
}

export interface LivePerformanceAnalyticsReport {
  generatedAt: number;

  version: "17.6";

  evidenceStatus:
    LivePerformanceEvidenceStatus;

  liveTradingEnabled: false;

  analyticsOnly: true;

  execution:
    LivePerformanceExecutionSummary;

  pnl:
    LivePerformancePnLSummary;

  slippage:
    LivePerformanceSlippageSummary;

  expectedVsRealized:
    ExpectedVsRealizedSummary;

  routePerformance:
    RoutePerformanceSummary;

  exchanges:
    LivePerformanceExchangeSummary[];

  evidence: {
    executionMetricsAvailable: boolean;

    pnlRecordsAvailable: boolean;

    slippageSamplesAvailable: boolean;

    expectedVsRealizedAvailable: boolean;

    routePerformanceAvailable: boolean;

    establishedRouteEvidenceAvailable: boolean;

    recentExecutionHistorySampleSize: number;
  };

  notes: string[];
}