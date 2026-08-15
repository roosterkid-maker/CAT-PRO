export type ExposureHealth =
  | "HEALTHY"
  | "WARNING"
  | "BLOCKED";

export interface ExchangeExposureSnapshot {
  exchange: string;

  referencedCapital: number;
  exposurePercent: number;

  limitPercent: number;
  utilizationPercentOfLimit: number;

  openPositions: number;

  health: ExposureHealth;
}

export interface MarketExposureSnapshot {
  market: string;

  capital: number;
  exposurePercent: number;

  limitPercent: number;
  utilizationPercentOfLimit: number;

  openPositions: number;

  health: ExposureHealth;
}

export interface PositionExposureSnapshot {
  positionId: string;

  market: string;

  buyExchange: string;
  sellExchange: string;

  capital: number;
  exposurePercent: number;

  limitPercent: number;
  utilizationPercentOfLimit: number;

  health: ExposureHealth;
}

export interface ExposureSnapshot {
  generatedAt: number;

  capitalBase: number;

  limits: {
    maximumTotalOpenCapitalPercent: number;

    maximumSinglePositionPercent: number;

    maximumExchangeExposurePercent: number;

    maximumMarketExposurePercent: number;

    warningThresholdPercentOfLimit: number;
  };

  summary: {
    openPositions: number;

    totalOpenCapital: number;

    totalOpenCapitalPercent: number;

    totalOpenCapitalHealth: ExposureHealth;

    highestExchangeExposurePercent: number;

    highestMarketExposurePercent: number;

    highestPositionExposurePercent: number;

    warningCount: number;

    blockedCount: number;

    canOpenNewPositions: boolean;
  };

  exchanges: ExchangeExposureSnapshot[];

  markets: MarketExposureSnapshot[];

  positions: PositionExposureSnapshot[];

  warnings: string[];

  blockingReasons: string[];
}

export interface ProposedExposureRequest {
  capital: number;

  market: string;

  buyExchange: string;

  sellExchange: string;
}

export interface ProposedExposureAssessment {
  approved: boolean;

  health: ExposureHealth;

  reasons: string[];

  projected: {
    totalOpenCapitalPercent: number;

    positionExposurePercent: number;

    buyExchangeExposurePercent: number;

    sellExchangeExposurePercent: number;

    marketExposurePercent: number;
  };
}