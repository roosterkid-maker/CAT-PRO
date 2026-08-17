import type {CrossExchangeMarketMakingConfigurationInput} from "../cross-exchange-market-making/CrossExchangeMarketMakingConfiguration";
import {
  CENTRAL_PAPER_STRATEGY_IDS,
  type CentralPaperStrategyId,
} from "./ActualStrategyCatalog";

import {
  CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID,
} from "../models/StrategyMetadata";

export type OptionalStrategyId =
  CentralPaperStrategyId;

export interface StrategyRuntimeOperatorConfiguration {
  readonly version: "45.0";
  readonly shadowEnabledStrategies: readonly OptionalStrategyId[];
  readonly controllerEnabled: Readonly<Record<OptionalStrategyId, boolean>>;
  readonly xemm: CrossExchangeMarketMakingConfigurationInput;
  readonly centralPaper: {
    readonly enabled: boolean;
    readonly confirmationPresent: boolean;
    readonly allowedStrategies: readonly OptionalStrategyId[];
  };
  readonly blockers: readonly string[];
  readonly safety: {
    readonly environmentOptInRequired: true;
    readonly unknownStrategiesFailClosed: true;
    readonly paperConfirmationRequired: true;
    readonly liveConfigurationRead: false;
    readonly liveExecutionAllowed: false;
  };
}

export function createStrategyRuntimeOperatorConfiguration(environment: NodeJS.ProcessEnv = process.env): StrategyRuntimeOperatorConfiguration {
  const blockers: string[] = [];
  const shadow = parseStrategyList(environment.CAT_PRO_SHADOW_STRATEGIES, "CAT_PRO_SHADOW_STRATEGIES", blockers);
  const paper = parseStrategyList(environment.CAT_PRO_CENTRAL_PAPER_STRATEGIES, "CAT_PRO_CENTRAL_PAPER_STRATEGIES", blockers);
  const confirmationPresent = environment.CAT_PRO_CENTRAL_PAPER_CONFIRMATION === "ENABLE_CENTRAL_PAPER_V1";
  if (paper.length > 0 && !confirmationPresent) blockers.push("CENTRAL_PAPER_CONFIRMATION_MISSING");

  const xemmRequested = shadow.includes(CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID);
  const xemmMarkets = list(environment.CAT_PRO_XEMM_MARKETS, true);
  const xemmQuantity = positive(environment.CAT_PRO_XEMM_QUANTITY);
  const xemmEdge = positive(environment.CAT_PRO_XEMM_MINIMUM_RETAINED_EDGE_PERCENT);
  const routeMinimumConsecutivePasses = configuredInteger(
    environment.CAT_PRO_XEMM_ROUTE_MINIMUM_CONSECUTIVE_PASSES, 3,
    "CAT_PRO_XEMM_ROUTE_MINIMUM_CONSECUTIVE_PASSES", false, blockers,
  );
  const routeMinimumDwellMs = configuredInteger(
    environment.CAT_PRO_XEMM_ROUTE_MINIMUM_DWELL_MS, 2_000,
    "CAT_PRO_XEMM_ROUTE_MINIMUM_DWELL_MS", true, blockers,
  );
  const routeFailoverCooldownMs = configuredInteger(
    environment.CAT_PRO_XEMM_ROUTE_FAILOVER_COOLDOWN_MS, 5_000,
    "CAT_PRO_XEMM_ROUTE_FAILOVER_COOLDOWN_MS", true, blockers,
  );
  const legacyMakerExchange = optionalExchange(environment.CAT_PRO_XEMM_MAKER_EXCHANGE);
  const legacyHedgeExchange = optionalExchange(environment.CAT_PRO_XEMM_HEDGE_EXCHANGE);
  const explicitVenuePairsRequested = Boolean(environment.CAT_PRO_XEMM_VENUE_PAIRS?.trim());
  const explicitVenuePairs = parseXemmVenuePairs(environment.CAT_PRO_XEMM_VENUE_PAIRS, blockers);
  const venuePairs = explicitVenuePairsRequested
    ? explicitVenuePairs
    : legacyMakerExchange && legacyHedgeExchange && legacyMakerExchange !== legacyHedgeExchange
      ? [{makerExchange: legacyMakerExchange, hedgeExchange: legacyHedgeExchange}]
      : [];
  const makerExchange = venuePairs[0]?.makerExchange ?? null;
  const hedgeExchange = venuePairs[0]?.hedgeExchange ?? null;
  const xemmComplete = Boolean(venuePairs.length > 0 && xemmMarkets.length > 0 && xemmQuantity !== null && xemmEdge !== null &&
    routeMinimumConsecutivePasses !== null && routeMinimumDwellMs !== null && routeFailoverCooldownMs !== null);
  if (xemmRequested && !xemmComplete) blockers.push("XEMM_OPERATOR_CONFIGURATION_INCOMPLETE");

  const shadowEnabledStrategies = shadow.filter((id) => id !== CROSS_EXCHANGE_MARKET_MAKING_STRATEGY_ID || xemmComplete);
  const controllerEnabled = Object.fromEntries(CENTRAL_PAPER_STRATEGY_IDS.map((id) => [id, shadowEnabledStrategies.includes(id)])) as Record<OptionalStrategyId, boolean>;
  const xemm: CrossExchangeMarketMakingConfigurationInput = xemmComplete && xemmRequested ? {
    enabled: true,
    makerExchange,
    hedgeExchange,
    venuePairs,
    routeStability: {
      minimumConsecutivePasses: routeMinimumConsecutivePasses!,
      minimumDwellMs: routeMinimumDwellMs!,
      failoverCooldownMs: routeFailoverCooldownMs!,
    },
    marketAllowlist: xemmMarkets,
    minimumRetainedEdgePercent: xemmEdge,
    makerLifecycle: {enabled: true, quantityByMarket: Object.fromEntries(xemmMarkets.map((market) => [market, xemmQuantity!])),
      maximumOrderAgeMs: 30_000, minimumRepriceTicks: 1},
    makerFill: {enabled: true, minimumRestingTimeMs: 1_000, minimumTradeThroughTicks: 1, hedgeIntentTtlMs: 5_000,
      queueAwarePartialFillsEnabled: true, maximumPublicTradeAgeMs: 15_000},
  } : {enabled: false};

  return freeze({version: "45.0", shadowEnabledStrategies, controllerEnabled: freeze(controllerEnabled), xemm,
    centralPaper: {enabled: confirmationPresent && paper.length > 0, confirmationPresent, allowedStrategies: paper},
    blockers: Array.from(new Set(blockers)), safety: {environmentOptInRequired: true, unknownStrategiesFailClosed: true,
      paperConfirmationRequired: true, liveConfigurationRead: false, liveExecutionAllowed: false}});
}

function parseStrategyList(value: string | undefined, label: string, blockers: string[]): OptionalStrategyId[] {
  const values = list(value, false);
  const known: OptionalStrategyId[] = [];
  for (const item of values) {
    if ((CENTRAL_PAPER_STRATEGY_IDS as readonly string[]).includes(item)) known.push(item as OptionalStrategyId);
    else blockers.push(`${label}_UNKNOWN_STRATEGY:${item}`);
  }
  return Array.from(new Set(known)).sort();
}
function list(value: string | undefined, compactMarket: boolean): string[] {
  return Array.from(new Set((value ?? "").split(",").map((item) => compactMarket
    ? item.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    : item.trim().toLowerCase()).filter(Boolean))).sort();
}
const XEMM_SPOT_EXCHANGES = new Set(["binance", "bybit", "coindcx", "coinswitch", "unocoin"]);
function parseXemmVenuePairs(value: string | undefined, blockers: string[]): Array<{makerExchange: string; hedgeExchange: string}> {
  if (!value?.trim()) return [];
  const pairs: Array<{makerExchange: string; hedgeExchange: string}> = [];
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    const parts = raw.split(">").map((part) => part.trim().toLowerCase());
    const makerExchange = parts.length === 2 ? optionalExchange(parts[0]) : null;
    const hedgeExchange = parts.length === 2 ? optionalExchange(parts[1]) : null;
    if (!makerExchange || !hedgeExchange || makerExchange === hedgeExchange ||
        !XEMM_SPOT_EXCHANGES.has(makerExchange) || !XEMM_SPOT_EXCHANGES.has(hedgeExchange)) {
      blockers.push(`CAT_PRO_XEMM_VENUE_PAIRS_INVALID:${raw.trim() || "EMPTY"}`);
      continue;
    }
    const key = `${makerExchange}>${hedgeExchange}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({makerExchange, hedgeExchange});
    }
  }
  return pairs;
}
function optionalExchange(value: string | undefined): string | null { const normalized = value?.trim().toLowerCase() ?? ""; return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : null; }
function positive(value: string | undefined): number | null { if (!value?.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function configuredInteger(value: string | undefined, fallback: number, label: string, allowZero: boolean,
  blockers: string[]): number | null {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    blockers.push(`${label}_INVALID:${value.trim()}`);
    return null;
  }
  return parsed;
}
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const strategyRuntimeOperatorConfiguration = createStrategyRuntimeOperatorConfiguration();
