export type ExecutionMode =
  | "paper"
  | "manual-confirm"
  | "live";

export interface TradingExecutionConfig {
  mode: ExecutionMode;

  enabled: boolean;

  maximumCapitalPerTrade: number;

  minimumNetProfitPercent: number;

  targetProfitPercent: number;

  maximumOpenTrades: number;

  requireFreshBidAsk: boolean;

  killSwitchEnabled: boolean;
}