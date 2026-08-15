import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import type {
  PaperCapitalConversionEvidence,
  PaperExecutionStressEvidence,
  PaperExecutionQualityEvidence,
  PaperPriceCredibilityEvidence,
  PaperVdaTaxWithholdingEvidence,
} from "./PaperProfitEvidence";

export type PaperTradeStatus =
  | "detected"
  | "validated"
  | "open"
  | "monitoring"
  | "target-hit"
  | "closed"
  | "cancelled"
  | "failed";

export interface PaperTrade {
  strategyAttribution: StrategyAttribution;

  priceCredibility?:
    PaperPriceCredibilityEvidence | null;

  paperExecutionStress?:
    PaperExecutionStressEvidence | null;

  paperVdaTaxWithholding?:
    PaperVdaTaxWithholdingEvidence | null;

  /**
   * Durable proof that account amounts are INR while venue prices and
   * quantities remain denominated in the market quote asset.
   */
  capitalConversion?:
    PaperCapitalConversionEvidence | null;

  quoteCapitalUsed?: number | null;

  quoteGrossProfit?: number | null;

  quoteTotalFees?: number | null;

  quoteNetProfit?: number | null;

  quoteTdsWithheld?: number | null;

  quoteDeployableCashProfit?: number | null;

  tdsWithheld?: number | null;

  deployableCashProfit?: number | null;

  executionQuality?:
    PaperExecutionQualityEvidence | null;

  id: string;

  market: string;

  buyExchange: string;
  sellExchange: string;

  capital: number;
  quantity: number;

  buyPrice: number;
  sellPrice: number;

  estimatedFees: number;
  expectedProfit: number;
  expectedProfitPercent: number;

  status: PaperTradeStatus;

  openedAt: number;
  closedAt: number | null;

  currentPrice: number;
  currentProfit: number;
  currentProfitPercent: number;

  highestProfit: number;
  lowestProfit: number;

  lastUpdatedAt: number;

  actualSellPrice: number | null;
  actualProfit: number | null;
  actualProfitPercent: number | null;

  failureReason: string | null;
}
