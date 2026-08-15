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

  /** Account capital is denominated in INR; market execution is denominated in quoteAsset. */
  requestedCapitalInr?: number;

  quoteAsset?: string;

  requestedQuoteCapital?: number;

  executableQuoteCapital?: number;

  executableCapitalInr?: number;

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

  /** Gross price delta for one base unit, denominated in quoteAsset. */
  rawSpread: number;

  rawSpreadPercent: number;

  /** Estimated fees for one base unit, denominated in quoteAsset. */
  estimatedFees: number;

  /** Net profit for one base unit, denominated in quoteAsset; never INR unless quoteAsset is INR. */
  netProfit: number;

  netProfitPercent: number;

  usedLastPriceFallback: boolean;

  quotesAreFresh: boolean;

  score: number;

  /**
   * Unix timestamp (milliseconds) representing
   * when this opportunity snapshot was generated.
   *
   * Used by the Version 4.0 Risk Engine to
   * calculate quoteAgeMs before live execution.
   */
  timestamp: number;
}
