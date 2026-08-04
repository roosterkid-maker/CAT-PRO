import type { ExchangePair } from "./ExchangePair";

export type ExecutionDecision =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface ArbitrageOpportunity {
  /**
   * Unique ID for this exact opportunity snapshot.
   * A refreshed/recalculated opportunity receives a new ID.
   */
  id: string;

  pair: ExchangePair;

  buyPrice: number;
  sellPrice: number;

  buyAvailableQty: number;
  sellAvailableQty: number;

  /**
   * Temporary compatibility fields.
   *
   * These are currently used by the opportunity DTO,
   * frontend trade planner, execution analysis,
   * allocation engine, risk engine and paper-trading flow.
   *
   * They will be removed after dynamic capital calculation
   * is integrated across all dependent modules.
   */
  requiredQty: number;

  availableExecutableQty: number;

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

  usedLastPriceFallback: boolean;
  quotesAreFresh: boolean;

  score: number;
  timestamp: number;
}