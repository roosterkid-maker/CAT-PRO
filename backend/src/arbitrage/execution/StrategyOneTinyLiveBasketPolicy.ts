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
 * Read-only top-of-book generation captured for one eligible dynamic route.
 * It carries no prices, economics, balances or order authority.
 */
export interface StrategyOneTinyLiveBasketBookObservation
  extends StrategyOneTinyLiveBasketRoute {
  readonly buyTimestamp: number;
  readonly sellTimestamp: number;
}

export const STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID =
  "strategy-one-dynamic-usdt-route-pool-v1" as const;

/**
 * Dynamic Strategy #1 Tiny-LIVE boundary.
 *
 * Markets are deliberately not pinned. A route enters the pool only while it
 * is a current USDT spot direction between two audited venues. Existing
 * evidence, action-time inventory, order rules, fees, depth, freshness,
 * calibration and last-look gates still run for the exact route. This policy
 * grants no order, transfer or withdrawal authority.
 */
export const STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY = deepFreeze({
  schemaVersion: "188.0" as const,
  id: STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID,
  label: "Dynamic inventory-qualified USDT route pool",
  quoteAssets: ["USDT"] as const,
  venues: ["binance", "coindcx", "bybit"] as const,
  markets: [] as const,
  routes: [] as const,
  inventoryTargets: [] as const,
  capitalPerLegInr: 500,
  maximumAttempts: 10 as const,
  durationMinutes: 180,
  stopOnFirstNonCleanResult: true,
  routeSelection: "HIGHEST_CURRENT_NET_THAT_PASSES_FRESH_EXACT_PREFLIGHT" as const,
  timingQualification: "AUTOMATIC_EXACT_ROUTE_EVIDENCE" as const,
  perRouteOperatorApprovalRequired: false,
  eligibility: [
    "CURRENT_EXECUTE",
    "EXACT_ROUTE_CREDIBLE_HISTORY",
    "ACTION_TIME_INVENTORY",
    "ORDER_RULES_AND_FEES",
    "DEPTH_AND_STRESS_NET",
    "FRESH_BOOKS_AND_LAST_LOOK",
  ] as const,
  excludedVenues: ["coinswitch", "unocoin", "zebpay"] as const,
  automaticTransfersAllowed: false,
  withdrawalsAllowed: false,
  liveOrderSubmissionAuthorized: false,
});

export function isStrategyOneTinyLiveDynamicRoute(input: {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}): boolean {
  const market = normalizeMarket(input.market);
  const buyExchange = normalizeExchange(input.buyExchange);
  const sellExchange = normalizeExchange(input.sellExchange);
  const venues = STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY.venues as readonly string[];

  return market.endsWith("USDT") &&
    market.length >= 6 &&
    market.length <= 24 &&
    buyExchange !== sellExchange &&
    venues.includes(buyExchange) &&
    venues.includes(sellExchange);
}

export function strategyOneTinyLiveBasketRouteKey(input: {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
}): string {
  return `${normalizeMarket(input.market)}:${normalizeExchange(input.buyExchange)}->${normalizeExchange(input.sellExchange)}`;
}

/*
 * Compatibility aliases keep older imports safe while no new fixed-basket
 * authority can be created. Their values are the dynamic route-pool policy.
 */
export const STRATEGY_ONE_TINY_LIVE_BASKET_ID =
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_ID;
export const STRATEGY_ONE_TINY_LIVE_BASKET_POLICY =
  STRATEGY_ONE_TINY_LIVE_ROUTE_POOL_POLICY;
export const isStrategyOneTinyLiveBasketRoute =
  isStrategyOneTinyLiveDynamicRoute;

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
