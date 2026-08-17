export interface PaperAnalyticsOverview {
  totalTrades: number;

  openTrades: number;

  closedTrades: number;

  winningTrades: number;

  losingTrades: number;

  winRate: number;

  totalProfit: number;

  averageProfit: number;

  averageLoss: number;

  roi: number;

  capitalInUse: number;

  averageExecutionTimeMs: number;
}

export interface PaperExchangePerformance {
  exchange: string;

  totalTrades: number;

  totalProfit: number;

  averageProfit: number;

  winRate: number;
}

export interface PaperMarketPerformance {
  market: string;

  totalTrades: number;

  totalProfit: number;

  averageProfit: number;

  winRate: number;
}

export interface PaperAnalyticsReport {
  generatedAt: number;

  overview: PaperAnalyticsOverview;

  exchanges: PaperExchangePerformance[];

  markets: PaperMarketPerformance[];
}

export interface PaperAnalyticsResponse {
  success: boolean;

  data: PaperAnalyticsReport;
}

export type ShadowReadinessLevel =
  | "INSUFFICIENT_DATA"
  | "NOT_READY"
  | "CAUTION"
  | "PROMISING"
  | "READY_FOR_PAPER";

export interface ShadowFailureReason {
  reason: string;

  count: number;

  percent: number;
}

export interface ShadowExchangePairPerformance {
  key: string;

  buyExchange: string;

  sellExchange: string;

  total: number;

  completed: number;

  success: number;

  failed: number;

  dataUnavailable: number;

  successRatePercent: number;

  executableSampleRatePercent: number;

  profitableSampleRatePercent: number;

  averageObservedNetProfit: number;

  averagePredictedNetProfit: number;

  averageProfitRetentionPercent: number;
}

export interface ShadowPerformanceAnalytics {
  generatedAt: number;

  mode: "SHADOW";

  executionAllowed: false;

  paperExecutionAllowed: false;

  liveExecutionAllowed: false;

  sampleRequirement: {
    minimumCompletedOutcomes: number;

    requirementMet: boolean;

    remaining: number;
  };

  summary: {
    trackedDispatches: number;

    tracking: number;

    completed: number;

    success: number;

    failed: number;

    dataUnavailable: number;

    completionRatePercent: number;

    successRatePercent: number;

    failureRatePercent: number;

    dataAvailabilityRatePercent: number;
  };

  executionQuality: {
    totalSamples: number;

    freshSamples: number;

    executableSamples: number;

    profitableSamples: number;

    freshnessRatePercent: number;

    executableRatePercent: number;

    profitableSampleRatePercent: number;
  };

  profitability: {
    averagePredictedNetProfit: number;

    averageObservedNetProfit: number;

    averageSuccessfulNetProfit: number;

    averageProfitRetentionPercent: number;

    positiveOutcomePercent: number;
  };

  readiness: {
    score: number;

    level: ShadowReadinessLevel;

    readyForPaperAutomation: boolean;

    reasons: string[];

    components: {
      sampleConfidence: number;

      successRate: number;

      executableRate: number;

      profitabilityRate: number;

      dataQuality: number;
    };
  };

  failureReasons: ShadowFailureReason[];

  exchangePairs: ShadowExchangePairPerformance[];
}

export interface ShadowPerformanceResponse {
  success: boolean;

  data: ShadowPerformanceAnalytics;
}

export type LivePerformanceEvidenceStatus =
  | "NO_DATA"
  | "PARTIAL"
  | "AVAILABLE";

export type PerformanceEvidenceLevel =
  | "NO_DATA"
  | "INSUFFICIENT"
  | "DEVELOPING"
  | "ESTABLISHED";

export interface LiveExecutionSummary {
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

export interface LivePnLSummary {
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

export interface LiveSlippageSummary {
  sampledExecutions: number;

  sampledBuyExecutions: number;

  sampledSellExecutions: number;

  averageAbsoluteSlippagePercent: number;

  averageSignedSlippagePercent: number;

  worstAdverseSlippagePercent: number;

  bestFavorableSlippagePercent: number;
}

export interface LiveExchangePerformance {
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

export interface LivePerformanceAnalytics {
  generatedAt: number;

  version: "17.6";

  evidenceStatus: LivePerformanceEvidenceStatus;

  liveTradingEnabled: false;

  analyticsOnly: true;

  execution: LiveExecutionSummary;

  pnl: LivePnLSummary;

  slippage: LiveSlippageSummary;

  expectedVsRealized: ExpectedVsRealizedSummary;

  routePerformance: {
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
  };

  exchanges: LiveExchangePerformance[];

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

export interface LivePerformanceResponse {
  success: boolean;

  data: LivePerformanceAnalytics;
}