import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
  CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
  DYNAMIC_MARKET_MAKING_STRATEGY_ID,
  FUNDING_RATE_ARBITRAGE_STRATEGY_ID,
  PERPETUAL_PERPETUAL_ARBITRAGE_STRATEGY_ID,
  SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
  STATISTICAL_ARBITRAGE_STRATEGY_ID,
  TRIANGULAR_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";

/**
 * Authoritative identity and source-directory contract for CAT PRO's eight
 * trading strategies. Shared discovery and hedge/recovery capabilities are
 * intentionally excluded because they do not own an independent trading
 * lifecycle.
 */
export const ACTUAL_STRATEGY_CATALOG = [
  {
    id: CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
    strategyNumber: 1,
    implementationDirectory: "cross-exchange-arbitrage",
    paperPath: "EXISTING_STRATEGY_ONE",
    requiresAuthenticatedDerivativeEvidence: false,
  },
  {
    id: CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
    strategyNumber: 2,
    implementationDirectory: "cross-exchange-market-making",
    paperPath: "CENTRAL_MULTI_STRATEGY",
    requiresAuthenticatedDerivativeEvidence: false,
  },
  {
    id: TRIANGULAR_ARBITRAGE_STRATEGY_ID,
    strategyNumber: 3,
    implementationDirectory: "triangular-arbitrage",
    paperPath: "CENTRAL_MULTI_STRATEGY",
    requiresAuthenticatedDerivativeEvidence: false,
  },
  {
    id: SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
    strategyNumber: 4,
    implementationDirectory: "spot-perpetual-basis-arbitrage",
    paperPath: "CENTRAL_MULTI_STRATEGY",
    requiresAuthenticatedDerivativeEvidence: true,
  },
  {
    id: FUNDING_RATE_ARBITRAGE_STRATEGY_ID,
    strategyNumber: 5,
    implementationDirectory: "funding-rate-arbitrage",
    paperPath: "CENTRAL_MULTI_STRATEGY",
    requiresAuthenticatedDerivativeEvidence: true,
  },
  {
    id: PERPETUAL_PERPETUAL_ARBITRAGE_STRATEGY_ID,
    strategyNumber: 6,
    implementationDirectory: "perpetual-perpetual-arbitrage",
    paperPath: "CENTRAL_MULTI_STRATEGY",
    requiresAuthenticatedDerivativeEvidence: true,
  },
  {
    id: DYNAMIC_MARKET_MAKING_STRATEGY_ID,
    strategyNumber: 7,
    implementationDirectory: "dynamic-market-making",
    paperPath: "CENTRAL_MULTI_STRATEGY",
    requiresAuthenticatedDerivativeEvidence: false,
  },
  {
    id: STATISTICAL_ARBITRAGE_STRATEGY_ID,
    strategyNumber: 8,
    implementationDirectory: "statistical-arbitrage",
    paperPath: "CENTRAL_MULTI_STRATEGY",
    requiresAuthenticatedDerivativeEvidence: true,
  },
] as const;

export type ActualStrategyCatalogEntry =
  typeof ACTUAL_STRATEGY_CATALOG[number];

export type ActualStrategyId =
  ActualStrategyCatalogEntry["id"];

export type CentralPaperStrategyId = Exclude<
  ActualStrategyId,
  typeof CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID
>;

export const ACTUAL_STRATEGY_IDS =
  ACTUAL_STRATEGY_CATALOG.map(
    (strategy) => strategy.id,
  ) as readonly ActualStrategyId[];

export const CENTRAL_PAPER_STRATEGY_IDS =
  ACTUAL_STRATEGY_CATALOG
    .filter(
      (strategy) =>
        strategy.paperPath ===
          "CENTRAL_MULTI_STRATEGY",
    )
    .map(
      (strategy) => strategy.id,
    ) as readonly CentralPaperStrategyId[];

export function getActualStrategy(
  strategyId: string,
): ActualStrategyCatalogEntry | null {
  return ACTUAL_STRATEGY_CATALOG.find(
    (strategy) =>
      strategy.id === strategyId,
  ) ?? null;
}
