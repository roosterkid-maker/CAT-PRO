export type CapitalSensitivityRouteSource =
  | "CURRENT_ACCEPTED"
  | "RECENT_POSITIVE_SPREAD_REJECTION";

export interface CapitalSensitivityPoint {
  /** Account-side capital. Always INR. */
  capital: number;

  /** Actual amount passed to the market-quote depth simulator. */
  executionCapital: number;

  executionCapitalCurrency: string;

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

  quoteAsset: string | null;

  quoteCapitalPerInr: number | null;

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

  build: "3";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  configuration: {
    accountCapitalCurrency: "INR";

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
