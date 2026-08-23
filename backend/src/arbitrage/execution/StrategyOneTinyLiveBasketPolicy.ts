export type StrategyOneTinyLiveBasketExchange =
  | "binance"
  | "bybit"
  | "coindcx";

export interface StrategyOneTinyLiveBasketRoute {
  readonly market: string;
  readonly buyExchange: StrategyOneTinyLiveBasketExchange;
  readonly sellExchange: StrategyOneTinyLiveBasketExchange;
}

/**
 * Read-only top-of-book generation captured for one immutable pilot route.
 * It carries no prices, economics, balances or order authority; its only
 * purpose is to let timing calibration observe every configured route even
 * while that route has no positive arbitrage spread.
 */
export interface StrategyOneTinyLiveBasketBookObservation
  extends StrategyOneTinyLiveBasketRoute {
  readonly buyTimestamp: number;
  readonly sellTimestamp: number;
}

export interface StrategyOneTinyLiveInventoryTarget {
  readonly exchange: StrategyOneTinyLiveBasketExchange;
  readonly asset: string;
  readonly targetNotionalInr: number;
}

export const STRATEGY_ONE_TINY_LIVE_BASKET_ID =
  "strategy-one-seven-coin-inventory-v1" as const;

const ROUTES: readonly StrategyOneTinyLiveBasketRoute[] = [
  {market: "COTIUSDT", buyExchange: "coindcx", sellExchange: "binance"},
  {market: "BBUSDT", buyExchange: "coindcx", sellExchange: "binance"},
  {market: "BBUSDT", buyExchange: "binance", sellExchange: "coindcx"},
  {market: "BBUSDT", buyExchange: "bybit", sellExchange: "coindcx"},
  {market: "HEMIUSDT", buyExchange: "coindcx", sellExchange: "binance"},
  {market: "HEMIUSDT", buyExchange: "binance", sellExchange: "coindcx"},
  {market: "TREEUSDT", buyExchange: "bybit", sellExchange: "coindcx"},
  {market: "NEXOUSDT", buyExchange: "binance", sellExchange: "coindcx"},
  {market: "NEXOUSDT", buyExchange: "bybit", sellExchange: "coindcx"},
  {market: "PYBOBOUSDT", buyExchange: "coindcx", sellExchange: "bybit"},
  {market: "GPSUSDT", buyExchange: "coindcx", sellExchange: "bybit"},
] as const;

const INVENTORY: readonly StrategyOneTinyLiveInventoryTarget[] = [
  {exchange: "binance", asset: "COTI", targetNotionalInr: 1_000},
  {exchange: "binance", asset: "BB", targetNotionalInr: 500},
  {exchange: "binance", asset: "HEMI", targetNotionalInr: 500},
  {exchange: "coindcx", asset: "BB", targetNotionalInr: 500},
  {exchange: "coindcx", asset: "TREE", targetNotionalInr: 500},
  {exchange: "coindcx", asset: "HEMI", targetNotionalInr: 500},
  {exchange: "coindcx", asset: "NEXO", targetNotionalInr: 500},
  {exchange: "bybit", asset: "PYBOBO", targetNotionalInr: 500},
  {exchange: "bybit", asset: "GPS", targetNotionalInr: 500},
] as const;

const ROUTE_KEYS = new Set(
  ROUTES.map((route) => strategyOneTinyLiveBasketRouteKey(route)),
);

/**
 * Immutable, report-driven boundary for the first multi-market Strategy #1
 * pilot. Inventory targets describe pre-positioned SELL inventory only. They
 * never authorize a transfer, withdrawal or order, and quote-side funding is
 * still proven independently at action time.
 */
export const STRATEGY_ONE_TINY_LIVE_BASKET_POLICY = deepFreeze({
  schemaVersion: "183.0" as const,
  id: STRATEGY_ONE_TINY_LIVE_BASKET_ID,
  label: "Seven-coin / three-exchange controlled pilot",
  markets: [
    "COTIUSDT",
    "BBUSDT",
    "HEMIUSDT",
    "TREEUSDT",
    "NEXOUSDT",
    "PYBOBOUSDT",
    "GPSUSDT",
  ] as const,
  venues: ["binance", "coindcx", "bybit"] as const,
  routes: ROUTES,
  inventoryTargets: INVENTORY,
  capitalPerLegInr: 500,
  maximumAttempts: 10 as const,
  durationMinutes: 180,
  stopOnFirstNonCleanResult: true,
  routeSelection: "HIGHEST_CURRENT_NET_THAT_PASSES_FRESH_EXACT_PREFLIGHT" as const,
  excludedVenues: ["coinswitch", "unocoin", "zebpay"] as const,
  automaticTransfersAllowed: false,
  withdrawalsAllowed: false,
  liveOrderSubmissionAuthorized: false,
});

export function isStrategyOneTinyLiveBasketRoute(input: {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}): boolean {
  return ROUTE_KEYS.has(strategyOneTinyLiveBasketRouteKey(input));
}

export function strategyOneTinyLiveBasketRouteKey(input: {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}): string {
  return `${normalizeMarket(input.market)}:${normalizeExchange(input.buyExchange)}->${normalizeExchange(input.sellExchange)}`;
}

function normalizeMarket(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function normalizeExchange(value: string): string {
  return value.trim().toLowerCase();
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}
