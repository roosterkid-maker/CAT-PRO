export type PaperPortfolioRouteStatus =
  | "INSUFFICIENT_DATA"
  | "BLOCKED"
  | "THROTTLED"
  | "NEUTRAL"
  | "BOOSTED";

export interface PaperPortfolioRoutePerformance {
  key: string;

  buyExchange: string;

  sellExchange: string;

  status: PaperPortfolioRouteStatus;

  capitalMultiplier: number;

  score: number;

  shadow: {
    total: number;

    completed: number;

    success: number;

    failed: number;

    dataUnavailable: number;

    successRatePercent: number;

    executableSampleRatePercent: number;

    profitableSampleRatePercent: number;

    averageProfitRetentionPercent: number;

    averageObservedNetProfit: number;
  };

  paper: {
    trades: number;

    winningTrades: number;

    losingTrades: number;

    winRatePercent: number;

    capitalUsed: number;

    netProfit: number;

    roiPercent: number;

    averageProfitPerTrade: number;

    largestWin: number;

    largestLoss: number;
  };

  components: {
    shadowConfidence: number;

    shadowSuccess: number;

    executability: number;

    profitRetention: number;

    paperWinRate: number;

    paperRoi: number;

    drawdownSafety: number;
  };

  reasons: string[];
}

export interface PaperPortfolioOptimizerConfig {
  minimumShadowCompletedOutcomes: number;

  minimumPaperTrades: number;

  minimumMultiplier: number;

  maximumMultiplier: number;

  blockScoreBelow: number;

  throttleScoreBelow: number;

  boostScoreAt: number;

  targetPaperWinRatePercent: number;

  targetPaperRoiPercent: number;

  maximumAcceptableLossPercent: number;
}

export interface PaperPortfolioOptimizerDiagnostics {
  generatedAt: number;

  mode: "PAPER";

  portfolioOptimizationEnabled: true;

  capitalMutationAllowed: false;

  liveExecutionAllowed: false;

  config: PaperPortfolioOptimizerConfig;

  totalRoutes: number;

  insufficientData: number;

  blocked: number;

  throttled: number;

  neutral: number;

  boosted: number;

  bestRoute: PaperPortfolioRoutePerformance | null;

  worstRoute: PaperPortfolioRoutePerformance | null;

  routes: PaperPortfolioRoutePerformance[];
}