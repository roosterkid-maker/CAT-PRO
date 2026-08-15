import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import type {
  PaperCapitalConversionEvidence,
  PaperExecutionStressEvidence,
  PaperPriceCredibilityEvidence,
  PaperVdaTaxWithholdingEvidence,
} from "./PaperProfitEvidence";

export type ExecutionLegSide =
  | "BUY"
  | "SELL";

export type ExecutionLegStatus =
  | "PENDING"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "FAILED"
  | "CANCELLED";

export type ExecutionResultStatus =
  | "COMPLETED"
  | "FAILED"
  | "PARTIALLY_COMPLETED";

export type TradingExecutionMode =
  | "PAPER"
  | "TESTNET"
  | "LIVE";

export interface ExecutionLegResult {
  exchange: string;

  market: string;

  side: ExecutionLegSide;

  requestedQuantity: number;

  filledQuantity: number;

  requestedPrice: number;

  averageFillPrice: number;

  status: ExecutionLegStatus;

  orderId: string | null;

  error: string | null;

  startedAt: number;

  completedAt: number | null;
}

export interface ExecutionResult {
  strategyAttribution: StrategyAttribution;

  /**
   * Present only when the automatic PAPER path passed the final cross-venue
   * credibility boundary. Historical and non-automated results remain
   * explicitly outside the post-guard profitability cohort.
   */
  priceCredibility?:
    PaperPriceCredibilityEvidence | null;

  capitalConversion?:
    PaperCapitalConversionEvidence | null;

  paperExecutionStress?:
    PaperExecutionStressEvidence | null;

  paperVdaTaxWithholding?:
    PaperVdaTaxWithholdingEvidence | null;

  quoteCapitalUsed?: number;

  quoteGrossProfit?: number;

  quoteTotalFees?: number;

  quoteNetProfit?: number;

  quoteTdsWithheld?: number;

  quoteDeployableCashProfit?: number;

  tdsWithheld?: number;

  deployableCashProfit?: number;

  planId: string;

  market: string;

  mode: TradingExecutionMode;

  status: ExecutionResultStatus;

  buy: ExecutionLegResult;

  sell: ExecutionLegResult;

  capitalUsed: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  netProfitPercent: number;

  startedAt: number;

  completedAt: number | null;

  successful: boolean;

  failureReason: string | null;
}
