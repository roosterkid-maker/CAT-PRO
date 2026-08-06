import type {
  TradingExecutionConfig,
} from "../models/ExecutionMode";

export interface ExecutableProfitConfig {
  buySlippagePercent: number;
  sellSlippagePercent: number;
  safetyBufferPercent: number;
  minimumProfitPercent: number;
}

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

export const defaultExecutableProfitConfig: ExecutableProfitConfig = {
  buySlippagePercent: 0.02,

  sellSlippagePercent: 0.02,

  safetyBufferPercent: 0.05,

  minimumProfitPercent:
    defaultTradingExecutionConfig.minimumNetProfitPercent,
};