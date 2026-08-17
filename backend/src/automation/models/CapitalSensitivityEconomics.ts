export type CapitalSensitivityRouteSource =
  | "CURRENT_ACCEPTED"
  | "RECENT_POSITIVE_SPREAD_REJECTION";

export interface CapitalSensitivityPoint {
  capital: number;

  simulationSuccess: boolean;

  fullyExecutable: boolean;

  fillPercent: number | null;

  executableQuantity: number | null;

  executableCapital: number | null;

  consumedLevels: number | null;

  buyVWAP: number | null;

  sellVWAP: number | null;

  buySlippagePercent: number | null;

  sellSlippagePercent: number | null;

  totalSlippagePercent: number | null;

  slippageCost: number | null;

  grossSpreadProfit: number | null;

  totalFees: number | null;

  netProfit: number | null;

  netProfitPercent: number | null;

  confidenceScore: number | null;

  recommendation: string | null;

  optimizerScore: number;

  failureReason: string | null;
}

export interface CapitalSensitivityRouteReport {
  market: string;

  buyExchange: string;

  sellExchange: string;

  source: CapitalSensitivityRouteSource;

  sourceRawSpreadPercent: number | null;

  sourceNetProfitPercent: number | null;

  optimizer: {
    evaluatedCandidates: number;

    successfulCandidates: number;

    failedCandidates: number;

    executionSuccessRate: number;

    optimizationTimeMs: number;
  };

  bestCapital: number | null;

  bestOptimizerScore: number | null;

  bestNetProfit: number | null;

  bestNetProfitPercent: number | null;

  maximumPositiveNetProfitCapital: number | null;

  maximumFullyExecutableProfitableCapital: number | null;

  maximumExecuteRecommendedCapital: number | null;

  sensitivity: CapitalSensitivityPoint[];

  observations: string[];
}

export interface CapitalSensitivityEconomicsReport {
  generatedAt: number;

  version: "17.4";

  build: "2";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  configuration: {
    minimumCapital: number;

    maximumCapital: number;

    capitalStep: number;

    displayedCapitalPoints: number[];

    maximumRoutesAnalyzed: number;
  };

  summary: {
    selectedRoutes: number;

    routesWithSuccessfulSimulation: number;

    routesWithPositiveNetProfit: number;

    routesWithExecuteRecommendation: number;

    currentAcceptedRoutesIncluded: number;

    recentPositiveSpreadRoutesIncluded: number;
  };

  routes: CapitalSensitivityRouteReport[];

  observations: string[];
}