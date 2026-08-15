import type {
  StrategyLegacyAttribution,
} from "./StrategyEvidenceStatus";

export type StrategyId =
  string;

export const CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID =
  "cross-exchange-arbitrage" as const;

export const CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID =
  "cross-exchange-market-making" as const;

export const HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID =
  "hedge-inventory-management" as const;

export const TRIANGULAR_ARBITRAGE_STRATEGY_ID =
  "triangular-arbitrage" as const;

export const SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID =
  "spot-perpetual-basis-arbitrage" as const;

export const FUNDING_RATE_ARBITRAGE_STRATEGY_ID =
  "funding-rate-arbitrage" as const;

export const PERPETUAL_PERPETUAL_ARBITRAGE_STRATEGY_ID =
  "perpetual-perpetual-arbitrage" as const;

export const DYNAMIC_MARKET_MAKING_STRATEGY_ID =
  "dynamic-market-making" as const;

export const STATISTICAL_ARBITRAGE_STRATEGY_ID =
  "statistical-arbitrage" as const;

export interface StrategyMetadata {
  readonly id:
    StrategyId;

  readonly strategyNumber:
    number;

  readonly displayName:
    string;

  readonly version:
    | "20.0"
    | "21.0"
    | "21.1"
    | "21.2"
    | "21.3"
    | "21.4"
    | "21.5"
    | "21.6"
    | "21.7"
    | "22.0"
    | "22.1"
    | "22.2"
    | "22.3"
    | "22.4"
    | "22.5"
    | "22.6"
    | "22.7"
    | "22.8"
    | "22.9"
    | "22.10"
    | "22.11"
    | "22.12"
    | "22.13"
    | "22.14"
    | "22.15"
    | "22.16"
    | "22.17"
    | "22.18"
    | "25.0"
    | "27.0"
    | "28.0"
    | "29.0"
    | "30.0"
    | "31.0"
    | "35.0";

  readonly category:
    | "CROSS_EXCHANGE_ARBITRAGE"
    | "CROSS_EXCHANGE_MARKET_MAKING"
    | "HEDGE_INVENTORY_MANAGEMENT"
    | "TRIANGULAR_ARBITRAGE"
    | "SPOT_PERPETUAL_BASIS_ARBITRAGE"
    | "FUNDING_RATE_ARBITRAGE"
    | "PERPETUAL_PERPETUAL_ARBITRAGE"
    | "DYNAMIC_MARKET_MAKING"
    | "STATISTICAL_ARBITRAGE";

  readonly description:
    string;

  readonly controllerMode:
    | "READ_ONLY"
    | "SHADOW_ONLY";

  readonly signalSource:
    | "OpportunityService"
    | "NONE_V21_0"
    | "XEMMPriceEngine"
    | "NONE_V22_0"
    | "PortfolioSnapshot"
    | "DynamicOpportunityDiscovery"
    | "DerivativeMarketData"
    | "OrderBookService";

  readonly legacyHistoryAttribution:
    StrategyLegacyAttribution;

  readonly capabilities: {
    readonly signalAdaptation:
      boolean;

    readonly intentGeneration:
      boolean;

    readonly automaticExecution:
      false;

    readonly paperExecution:
      false;

    readonly liveExecution:
      false;
  };
}

export const crossExchangeArbitrageStrategyMetadata:
  StrategyMetadata = {
  id:
    CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,

  strategyNumber:
    1,

  displayName:
    "Cross-Exchange Arbitrage",

  version:
    "20.0",

  category:
    "CROSS_EXCHANGE_ARBITRAGE",

  description:
    "Read-only adaptation of the authoritative CAT PRO cross-exchange opportunity pipeline.",

  controllerMode:
    "READ_ONLY",

  signalSource:
    "OpportunityService",

  legacyHistoryAttribution:
    "UNATTRIBUTED_LEGACY",

  capabilities: {
    signalAdaptation:
      true,

    intentGeneration:
      true,

    automaticExecution:
      false,

    paperExecution:
      false,

    liveExecution:
      false,
  },
};
