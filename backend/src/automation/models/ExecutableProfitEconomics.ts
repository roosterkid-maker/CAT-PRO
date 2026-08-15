export type ExecutableProfitEconomicsBucket =
  | "NON_POSITIVE_SPREAD"
  | "BELOW_SPREAD_GATE"
  | "SPREAD_PASSES_FEES_DO_NOT"
  | "NET_PROFIT_BELOW_MINIMUM"
  | "ECONOMICALLY_PASSING_REJECTED_LATER";

export interface ExecutableProfitEconomicsDistribution {
  count: number;

  minimumPercent: number | null;

  p50Percent: number | null;

  p95Percent: number | null;

  averagePercent: number | null;

  maximumPercent: number | null;
}

export interface ExecutableProfitEconomicsRoute {
  market: string;

  buyExchange: string;

  sellExchange: string;

  rejectionStage: string;

  rejectionCode: string;

  rawSpreadPercent: number;

  feeBurdenPercent: number;

  netProfitPercent: number;

  minimumSpreadPercent: number;

  minimumNetProfitPercent: number;

  minimumEconomicSpreadPercent: number;

  distanceToMinimumNetProfitPercent: number;

  spreadSurplusAfterFeesPercent: number;

  slippageMeasured: false;

  bucket: ExecutableProfitEconomicsBucket;

  rejectedAt: number;
}

export interface ExecutableProfitEconomicsReport {
  generatedAt: number;

  version: "17.4";

  build: "1";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  sampleSize: number;

  economicallyAnalyzableRecords: number;

  summary: {
    positiveRawSpread: number;

    spreadBelowMinimum: number;

    spreadPassesButFeesEliminateProfit: number;

    netProfitBelowMinimum: number;

    economicallyPassingRejectedLater: number;

    currentAcceptedOpportunities: number;
  };

  economics: {
    rawSpread:
      ExecutableProfitEconomicsDistribution;

    feeBurden:
      ExecutableProfitEconomicsDistribution;

    netProfit:
      ExecutableProfitEconomicsDistribution;

    distanceToMinimumNetProfit:
      ExecutableProfitEconomicsDistribution;
  };

  byRoute: Array<{
    route: string;

    count: number;

    averageRawSpreadPercent: number;

    averageFeeBurdenPercent: number;

    averageNetProfitPercent: number;

    economicallyPassing: number;
  }>;

  closestToProfitability:
    ExecutableProfitEconomicsRoute[];

  observations: string[];
}