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

  requestedCapitalInr?: number;
  quoteAsset?: string;
  requestedQuoteCapital?: number;
  executableQuoteCapital?: number;
  executableCapitalInr?: number;

  requiredQty: number;

  availableExecutableQty: number;

  executableQty: number;

  /** Per-base-unit amount in quoteAsset. */
  rawSpread: number;
  rawSpreadPercent: number;

  /** Per-base-unit amount in quoteAsset. */
  estimatedFees: number;

  /** Per-base-unit amount in quoteAsset, not account INR unless quoteAsset is INR. */
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
