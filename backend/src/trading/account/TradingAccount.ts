export type TradingMode =
  | "PAPER"
  | "TESTNET"
  | "LIVE";

export interface TradingLimits {
  maximumCapitalPerTrade: number;

  maximumDailyLoss: number;

  maximumOpenTrades: number;

  maximumDailyTrades: number;
}

export interface TradingAccount {
  id: string;

  name: string;

  mode: TradingMode;

  enabled: boolean;

  emergencyStop: boolean;

  limits: TradingLimits;

  initialCapital: number;

  currentCapital: number;

  availableCapital: number;

  todayProfit: number;

  todayLoss: number;

  openTrades: number;

  tradesToday: number;
}

export const defaultTradingAccount: TradingAccount = {
  id: "default",

  name: "CAT PRO",

  mode: "PAPER",

  enabled: true,

  emergencyStop: false,

  limits: {
    maximumCapitalPerTrade: 100_000,

    maximumDailyLoss: 10_000,

    maximumOpenTrades: 5,

    maximumDailyTrades: 100,
  },

  initialCapital: 100_000,

  currentCapital: 100_000,

  availableCapital: 100_000,

  todayProfit: 0,

  todayLoss: 0,

  openTrades: 0,

  tradesToday: 0,
};