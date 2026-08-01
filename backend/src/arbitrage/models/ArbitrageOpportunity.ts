import type { ExchangePair } from "./ExchangePair";

export type ExecutionDecision =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface ArbitrageOpportunity {
  pair: ExchangePair;

  buyPrice: number;
  sellPrice: number;

  buyAvailableQty: number;
  sellAvailableQty: number;

  /**
   * Required quantity based on reference capital.
   */
  requiredQty: number;

  /**
   * Maximum quantity available on both top-of-book legs.
   */
  availableExecutableQty: number;

  /**
   * Quantity that can actually be evaluated/executed.
   */
  executableQty: number;

  liquidityScore: number;
  enoughLiquidity: boolean;

  freshnessScore: number;
  feeScore: number;
  spreadScore: number;

  decision: ExecutionDecision;

  analysisSummary: string[];

  rawSpread: number;
  rawSpreadPercent: number;

  estimatedFees: number;

  netProfit: number;
  netProfitPercent: number;

  usedLastPriceFallback: false;
  quotesAreFresh: boolean;

  score: number;
  timestamp: number;
}