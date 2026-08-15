import type {
  PaperPortfolioRouteStatus,
} from "./PaperPortfolioOptimizer";

export type AdaptivePaperCapitalAllocationStatus =
  | "ALLOCATED"
  | "REJECTED_LIMITS"
  | "REJECTED_QUALITY"
  | "REJECTED_PORTFOLIO"
  | "OPTIMIZER_REJECTED";

export interface AdaptivePaperCapitalQualityFactors {
  qualification: number;

  profit: number;

  liquidity: number;

  freshness: number;

  persistence: number;

  combined: number;
}

export interface AdaptivePaperCapitalAllocationConstraints {
  remainingBatchCapital: number;

  exchangeExposureLimit: number;

  currentBuyExchangeExposure: number;

  currentSellExchangeExposure: number;
}

export interface AdaptivePaperCapitalAllocationRecord {
  id: string;

  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: AdaptivePaperCapitalAllocationStatus;

  evaluatedAt: number;

  qualityFactors:
    AdaptivePaperCapitalQualityFactors;

  portfolioAdjustment: {
    routeStatus:
      PaperPortfolioRouteStatus;

    routeScore: number;

    capitalMultiplier: number;

    preAdjustmentBudget: number;

    adjustedBudget: number;

    reasons: string[];
  };

  limits: {
    accountAvailableCapital: number;

    accountMaximumCapitalPerTrade: number;

    configuredCapitalBudget: number;

    configuredCapitalInUse: number;

    configuredCapitalHeadroom: number;

    automationMaximumCapitalPerTrade: number;

    remainingBatchCapital: number;

    buyExchangeHeadroom: number;

    sellExchangeHeadroom: number;

    hardMaximumCapital: number;
  };

  qualityBudget: number;

  optimization: {
    minimumCapital: number;

    maximumCapital: number;

    capitalStep: number;

    evaluatedCandidates: number;

    successfulCandidates: number;

    bestScore: number | null;
  };

  allocatedCapital: number;

  reason: string;
}

export interface AdaptivePaperCapitalAllocatorConfig {
  totalCapitalBudget: number;

  minimumCapital: number;

  maximumCapitalPerTrade: number;

  capitalStep: number;

  minimumQualificationScore: number;

  fullSizeProfitPercent: number;

  persistenceTargetMs: number;

  minimumBudgetFactor: number;

  maximumHistory: number;
}

export interface AdaptivePaperCapitalAllocatorDiagnostics {
  generatedAt: number;

  mode: "PAPER";

  liveExecutionAllowed: false;

  adaptiveAllocationEnabled: true;

  portfolioOptimizationEnabled: true;

  config:
    AdaptivePaperCapitalAllocatorConfig;

  totalRequests: number;

  allocated: number;

  rejectedLimits: number;

  rejectedQuality: number;

  rejectedPortfolio: number;

  optimizerRejected: number;

  totalAllocatedCapital: number;

  averageAllocatedCapital: number;

  lastAllocationAt: number | null;

  lastAllocation:
    AdaptivePaperCapitalAllocationRecord | null;

  recentAllocations:
    AdaptivePaperCapitalAllocationRecord[];
}
