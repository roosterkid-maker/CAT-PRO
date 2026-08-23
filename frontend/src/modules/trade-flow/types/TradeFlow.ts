export type TradeIntelligenceWindowId =
  | "TODAY"
  | "24H"
  | "48H"
  | "7D"
  | "14D"
  | "CUSTOM";

export interface TradeIntelligenceQuery {
  window: TradeIntelligenceWindowId;
  startAt?: number;
  endAt?: number;
}

export interface TradeIntelligenceRouteRank {
  rank: number;
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  settlements: number;
  successfulSettlements: number;
  settlementSharePercent: number;
  successRatePercent: number;
  capitalTurnoverInr: number;
  realizedPnlInr: number;
  averagePnlInr: number;
  deployableCashPnlInr: number;
  feesInr: number;
  tdsWithheldInr: number;
  capitalEfficiencyPercent: number;
  bestIstHour: number;
  lastSettledAt: number;
}

export interface TradeIntelligenceMarketRank {
  rank: number;
  market: string;
  baseAsset: string;
  quoteAsset: string;
  settlements: number;
  successfulSettlements: number;
  settlementSharePercent: number;
  successRatePercent: number;
  uniqueRoutes: number;
  leadingBuyExchange: string;
  leadingSellExchange: string;
  capitalTurnoverInr: number;
  realizedPnlInr: number;
  averagePnlInr: number;
  capitalEfficiencyPercent: number;
  bestIstHour: number;
  lastSettledAt: number;
}

export interface TradeIntelligenceExchangeRank {
  rank: number;
  side: "BUY" | "SELL";
  exchange: string;
  settlements: number;
  settlementSharePercent: number;
  uniqueMarkets: number;
  capitalTurnoverInr: number;
  associatedRoutePnlInr: number;
  lastSettledAt: number;
}

export interface TradeIntelligenceHourBucket {
  hour: number;
  label: string;
  state: "DATA" | "ZERO" | "NO_DATA";
  settlements: number;
  successfulSettlements: number;
  capitalTurnoverInr: number;
  realizedPnlInr: number;
  averagePnlInr: number;
}

export interface TradeIntelligenceTradeDetail {
  rank: number;
  id: string;
  settledAt: number;
  market: string;
  buyExchange: string;
  sellExchange: string;
  capitalInr: number;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  feesInr: number;
  tdsWithheldInr: number;
  realizedPnlInr: number;
  deployableCashPnlInr: number;
  returnPercent: number;
  executionDurationMs: number;
  evidenceBadge: "CREDIBLE_STRATEGY_1_PAPER";
}

export interface StrategyOneTradeIntelligenceReport {
  version: "154.0";
  generatedAt: number;
  sourceRevision: number;
  timezone: "Asia/Kolkata";
  mode: "PAPER";
  basis: "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS";
  window: {
    id: TradeIntelligenceWindowId;
    label: string;
    startAt: number;
    endAt: number;
  };
  evidence: {
    storedPaperTrades: number;
    attributedClosedStrategyOne: number;
    uniqueStrategyOneSettlements: number;
    credibleStrategyOneSettlements: number;
    selectedCredibleSettlements: number;
    exclusions: {
      duplicateIdsIgnored: number;
      distortedSettlements: number;
      openOrFailed: number;
      unattributedOrOtherStrategy: number;
      missingSettlementEconomics: number;
      syntheticDemos: 0;
    };
    syntheticDemoNote: string;
  };
  summary: {
    settlements: number;
    successfulSettlements: number;
    negativeSettlements: number;
    flatSettlements: number;
    uniqueMarkets: number;
    uniqueRoutes: number;
    activeExchanges: number;
    capitalTurnoverInr: number;
    realizedPnlInr: number;
    averagePnlInr: number;
    medianPnlInr: number;
    deployableCashPnlInr: number;
    feesInr: number;
    tdsWithheldInr: number;
    successRatePercent: number;
    capitalEfficiencyPercent: number;
    lastSettledAt: number | null;
  };
  routes: TradeIntelligenceRouteRank[];
  markets: TradeIntelligenceMarketRank[];
  buyExchanges: TradeIntelligenceExchangeRank[];
  sellExchanges: TradeIntelligenceExchangeRank[];
  routeMatrix: TradeIntelligenceRouteRank[];
  hourlyIst: TradeIntelligenceHourBucket[];
  topSuccessfulTrades: TradeIntelligenceTradeDetail[];
  presentation: {
    noData: boolean;
    liveEvidenceAvailable: false;
    exchangePnlWarning: string;
    turnoverDefinition: string;
    refreshAfterMs: 30_000;
    maximumDetailRows: 10;
  };
  safety: {
    readOnly: true;
    paperEvidenceOnly: true;
    balancesRead: false;
    balanceMutated: false;
    transferInitiated: false;
    withdrawalInitiated: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface StrategyOneTradeIntelligenceResponse {
  success: boolean;
  data: StrategyOneTradeIntelligenceReport;
}
