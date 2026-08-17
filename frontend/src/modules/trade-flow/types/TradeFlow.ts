export type TradeFlowWindowId =
  | "TODAY"
  | "7D"
  | "14D"
  | "LIFETIME";

export interface TradeFlowMarketRank {
  rank: number;
  market: string;
  baseAsset: string;
  quoteAsset: string;
  settlements: number;
  settlementSharePercent: number;
  totalQuantity: number;
  capitalTurnoverInr: number;
  realizedPnlInr: number;
  profitableSettlements: number;
  negativeSettlements: number;
  winRatePercent: number;
  leadingBuyExchange: string;
  leadingSellExchange: string;
  lastSettledAt: number;
}

export interface TradeFlowExchangeRank {
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

export interface TradeFlowRouteRank {
  rank: number;
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  settlements: number;
  settlementSharePercent: number;
  capitalTurnoverInr: number;
  realizedPnlInr: number;
  winRatePercent: number;
  lastSettledAt: number;
}

export interface TradeFlowInventoryRank {
  rank: number;
  exchange: string;
  asset: string;
  buySettlements: number;
  sellSettlements: number;
  boughtQuantity: number;
  soldQuantity: number;
  netQuantity: number;
  direction:
    | "ACCUMULATING"
    | "DISTRIBUTING"
    | "BALANCED";
  lastSettledAt: number;
}

export interface TradeFlowWindow {
  id: TradeFlowWindowId;
  label: string;
  startAt: number | null;
  endAt: number;
  summary: {
    settlements: number;
    profitableSettlements: number;
    negativeSettlements: number;
    flatSettlements: number;
    uniqueMarkets: number;
    uniqueRoutes: number;
    activeExchanges: number;
    capitalTurnoverInr: number;
    realizedPnlInr: number;
    deployableCashPnlInr: number;
    feesInr: number;
    tdsWithheldInr: number;
    winRatePercent: number;
  };
  markets: TradeFlowMarketRank[];
  buyExchanges: TradeFlowExchangeRank[];
  sellExchanges: TradeFlowExchangeRank[];
  routes: TradeFlowRouteRank[];
  inventoryFlows: TradeFlowInventoryRank[];
}

export interface StrategyOneTradeFlowReport {
  version: "117.0";
  generatedAt: number;
  sourceRevision: number;
  mode: "PAPER_ANALYTICS_ONLY";
  basis: "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS";
  timezone: "Asia/Kolkata";
  evidence: {
    storedTrades: number;
    storedStrategyOneSettlements: number;
    uniqueStrategyOneSettlements: number;
    credibleSettlements: number;
    excludedDistortedSettlements: number;
    duplicateIdsIgnored: number;
  };
  windows: Record<
    TradeFlowWindowId,
    TradeFlowWindow
  >;
  interpretation: {
    exchangePnlWarning: string;
    inventoryFlowMeaning: string;
    quantityWarning: string;
  };
  safety: {
    readOnly: true;
    paperEvidenceOnly: true;
    balanceMutated: false;
    transferInitiated: false;
    withdrawalInitiated: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface StrategyOneTradeFlowResponse {
  success: boolean;
  data: StrategyOneTradeFlowReport;
}
