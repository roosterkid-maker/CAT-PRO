import type {
  TradingExecutionConfig,
} from "../models/ExecutionMode";

export const defaultTradingExecutionConfig: TradingExecutionConfig = {
  mode: "paper",

  enabled: true,

  maximumCapitalPerTrade: 10_000,

  minimumNetProfitPercent: 0.5,

  targetProfitPercent: 0.5,

  maximumOpenTrades: 1,

  requireFreshBidAsk: false,

  killSwitchEnabled: true,
};