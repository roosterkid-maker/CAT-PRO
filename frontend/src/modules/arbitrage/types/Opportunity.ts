export type OpportunityDecision =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface Opportunity {
    id: string;
  market: string;

  buyExchange: string;
  buyPrice: number;
  buyAvailableQty: number;

  sellExchange: string;
  sellPrice: number;
  sellAvailableQty: number;

  requiredQty: number;

  availableExecutableQty: number;

  executableQty: number;

  rawSpread: number;
  rawSpreadPercent: number;

  estimatedFees: number;

  netProfit: number;
  netProfitPercent: number;

  liquidityScore: number;

  freshnessScore: number;

  feeScore: number;

  spreadScore: number;

  overallScore: number;

  decision: OpportunityDecision;

  analysisSummary: string[];

  enoughLiquidity: boolean;

  usedLastPriceFallback: false;

  quotesAreFresh: boolean;

  timestamp: number;
}

export interface OpportunitiesResponse {
  success: boolean;
  count: number;
  data: Opportunity[];
}