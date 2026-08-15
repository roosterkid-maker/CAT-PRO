import type {
  PaperTradeStatus,
} from "../../trading/models/PaperTrade";

export type PositionMarkSource =
  | "BEST_BID"
  | "LAST_PRICE"
  | "TRADE_PRICE"
  | "UNAVAILABLE";

export interface PortfolioPosition {
  id: string;

  market: string;

  buyExchange: string;
  sellExchange: string;

  status: PaperTradeStatus;

  quantity: number;
  capital: number;

  entryBuyPrice: number;
  expectedSellPrice: number;

  markPrice: number | null;
  markSource: PositionMarkSource;
  markTimestamp: number | null;
  markAgeMs: number | null;

  estimatedFees: number;

  unrealizedProfit: number | null;
  unrealizedProfitPercent: number | null;

  realizedProfit: number | null;
  realizedProfitPercent: number | null;

  openedAt: number;
  closedAt: number | null;
  ageMs: number;
}

export interface ExchangePositionExposure {
  exchange: string;

  openPositions: number;

  buySideCapital: number;
  sellSideNotional: number;

  totalReferencedCapital: number;
}

export interface PositionSnapshot {
  generatedAt: number;

  summary: {
    totalPositions: number;
    openPositions: number;
    closedPositions: number;

    openCapital: number;

    unrealizedProfit: number;
    realizedProfit: number;

    profitableOpenPositions: number;
    losingOpenPositions: number;
    unpricedOpenPositions: number;
  };

  exposureByExchange: ExchangePositionExposure[];

  open: PortfolioPosition[];

  closed: PortfolioPosition[];
}