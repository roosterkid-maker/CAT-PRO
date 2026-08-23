export type ShadowLiveReadinessLevel =
  | "INSUFFICIENT_DATA"
  | "NOT_READY"
  | "CAUTION"
  | "PROMISING"
  | "READY_FOR_PAPER";

export interface ShadowPerformanceFailureReason {
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

  thresholds: {
    successRatePercent: number;
    executableRatePercent: number;
    profitableSampleRatePercent: number;
    dataAvailabilityRatePercent: number;
    profitRetentionPercent: number;
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

    level: ShadowLiveReadinessLevel;

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

  failureReasons: ShadowPerformanceFailureReason[];

  exchangePairs: ShadowExchangePairPerformance[];
}
