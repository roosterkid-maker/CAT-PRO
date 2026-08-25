export const STRATEGY_ONE_CORE_EXCHANGES = [
  "binance",
  "bybit",
  "coindcx",
] as const;

export const STRATEGY_ONE_NON_CORE_EXCHANGES = [
  "coinswitch",
  "unocoin",
  "zebpay",
] as const;

export type StrategyOneCoreExchange =
  (typeof STRATEGY_ONE_CORE_EXCHANGES)[number];

export type StrategyOneNonCoreExchange =
  (typeof STRATEGY_ONE_NON_CORE_EXCHANGES)[number];

export type StrategyOneExchangeScope =
  | "CORE"
  | "NON_CORE"
  | "OUT_OF_SCOPE";

export interface StrategyOneDirectionalRoute {
  readonly buyExchange: StrategyOneCoreExchange;
  readonly sellExchange: StrategyOneCoreExchange;
}

export const STRATEGY_ONE_DIRECTIONAL_ROUTES:
  readonly StrategyOneDirectionalRoute[] = Object.freeze(
    STRATEGY_ONE_CORE_EXCHANGES.flatMap(
      (buyExchange) =>
        STRATEGY_ONE_CORE_EXCHANGES
          .filter(
            (sellExchange) =>
              sellExchange !== buyExchange,
          )
          .map(
            (sellExchange) => ({
              buyExchange,
              sellExchange,
            })),
    ),
  );

const CORE =
  new Set<string>(
    STRATEGY_ONE_CORE_EXCHANGES,
  );

const NON_CORE =
  new Set<string>(
    STRATEGY_ONE_NON_CORE_EXCHANGES,
  );

export function normalizeStrategyOneExchange(
  exchange: string,
): string {
  return exchange
    .trim()
    .toLowerCase();
}

export function classifyStrategyOneExchange(
  exchange: string,
): StrategyOneExchangeScope {
  const normalized =
    normalizeStrategyOneExchange(
      exchange,
    );

  if (CORE.has(normalized)) {
    return "CORE";
  }

  if (NON_CORE.has(normalized)) {
    return "NON_CORE";
  }

  return "OUT_OF_SCOPE";
}

export function isStrategyOneCoreExchange(
  exchange: string,
): exchange is StrategyOneCoreExchange {
  return classifyStrategyOneExchange(
    exchange,
  ) === "CORE";
}

export function isStrategyOneDirectionalRoute(
  buyExchange: string,
  sellExchange: string,
): boolean {
  const buy =
    normalizeStrategyOneExchange(
      buyExchange,
    );

  const sell =
    normalizeStrategyOneExchange(
      sellExchange,
    );

  return (
    buy !== sell &&
    isStrategyOneCoreExchange(
      buy,
    ) &&
    isStrategyOneCoreExchange(
      sell,
    )
  );
}
