export const LIVE_ONLY_RUNTIME_PROFILE =
  "live-only" as const;

export const LIVE_ONLY_RUNTIME_CONFIRMATION =
  "ENABLE_CAT_PRO_LIVE_ONLY_RUNTIME" as const;

export interface LiveOnlyRuntimePolicy {
  readonly enabled: boolean;
  readonly minimumCapitalPerLegInr: 600;
  readonly preferredCapitalPerLegInr: number;
  readonly maximumCapitalPerLegInr: 1_000;
  readonly minimumCurrentNetProfitPercent: 1.5;
  readonly minimumPostStressNetProfitPercent: 1.3;
  readonly maximumOpportunityAgeMs: 2_000;
  readonly routeCooldownMs: 5_000;
  readonly maximumConcurrentTrades: 1;
  readonly automaticFundMovementEnabled: boolean;
}

/*
 * A fixed 1.01x price-ratio ceiling cannot coexist with a 1.30% post-stress
 * floor: even before fees, reserves and statutory cash withholding, a route
 * needs more than a 1% gross spread to retain 1.30%.  CAT PRO therefore uses
 * two distinct boundaries:
 *
 * - >= 0.80% gross spread is anomalous and needs the full 25 independent
 *   route samples used by the capital study;
 * - > 1.05x remains an absolute fail-closed quote-integrity rejection.
 *
 * This keeps large apparent gaps out of the fast path without silently making
 * every TDS-aware Indian route mathematically impossible.
 */
export const LIVE_ONLY_SUSPICIOUS_GROSS_SPREAD_PERCENT =
  0.8 as const;

export const LIVE_ONLY_ABSOLUTE_MAXIMUM_PRICE_RATIO =
  1.05 as const;

export const LIVE_ONLY_SUSPICIOUS_ROUTE_MINIMUM_SAMPLES =
  25 as const;

export interface LiveOnlySpreadIntegrity {
  readonly grossSpreadPercent: number | null;
  readonly priceRatio: number | null;
  readonly suspicious: boolean;
  readonly withinAbsoluteCeiling: boolean;
}

export function evaluateLiveOnlySpreadIntegrity(
  buyPrice: number,
  sellPrice: number,
): LiveOnlySpreadIntegrity {
  if (
    !Number.isFinite(buyPrice) ||
    buyPrice <= 0 ||
    !Number.isFinite(sellPrice) ||
    sellPrice <= 0
  ) {
    return Object.freeze({
      grossSpreadPercent: null,
      priceRatio: null,
      suspicious: false,
      withinAbsoluteCeiling: false,
    });
  }

  const grossSpreadPercent =
    ((sellPrice - buyPrice) / buyPrice) *
    100;
  const priceRatio =
    Math.max(buyPrice, sellPrice) /
    Math.min(buyPrice, sellPrice);

  return Object.freeze({
    grossSpreadPercent,
    priceRatio,
    suspicious:
      grossSpreadPercent >=
      LIVE_ONLY_SUSPICIOUS_GROSS_SPREAD_PERCENT,
    withinAbsoluteCeiling:
      Number.isFinite(priceRatio) &&
      priceRatio >= 1 &&
      priceRatio <=
        LIVE_ONLY_ABSOLUTE_MAXIMUM_PRICE_RATIO,
  });
}

export function isLiveOnlyRuntimeProfile(
  environment:
    NodeJS.ProcessEnv = process.env,
): boolean {
  return environment
    .CAT_PRO_RUNTIME_PROFILE
    ?.trim()
    .toLowerCase() ===
      LIVE_ONLY_RUNTIME_PROFILE;
}

export function isLiveOnlyRuntimeEnabled(
  environment:
    NodeJS.ProcessEnv = process.env,
): boolean {
  return isLiveOnlyRuntimeProfile(
    environment,
  ) &&
    environment.TRADING_MODE
      ?.trim()
      .toLowerCase() === "live" &&
    environment.TRADING_EXECUTION_MODE
      ?.trim()
      .toLowerCase() === "live" &&
    environment.LIVE_TRADING_ENABLED
      ?.trim()
      .toLowerCase() === "true" &&
    environment.ARBITRAGE_LIVE_CONFIRMATION
      ?.trim() ===
      "ENABLE_CONFIRMED_ARBITRAGE_EXECUTION" &&
    environment.CAT_PRO_LIVE_ONLY_CONFIRMATION
      ?.trim() ===
      LIVE_ONLY_RUNTIME_CONFIRMATION;
}

export function getLiveOnlyRuntimePolicy(
  environment:
    NodeJS.ProcessEnv = process.env,
): LiveOnlyRuntimePolicy {
  const preferredCapitalPerLegInr =
    readInteger(
      environment
        .CAT_PRO_LIVE_TRADE_CAPITAL_INR,
      600,
      "CAT_PRO_LIVE_TRADE_CAPITAL_INR",
    );

  if (
    preferredCapitalPerLegInr < 600 ||
    preferredCapitalPerLegInr > 1_000
  ) {
    throw new Error(
      "CAT_PRO_LIVE_TRADE_CAPITAL_INR must remain between ₹600 and ₹1,000.",
    );
  }

  const automaticFundMovementEnabled =
    environment.CAT_PRO_REBALANCER_ENABLED
      ?.trim()
      .toLowerCase() === "true";

  return Object.freeze({
    enabled:
      isLiveOnlyRuntimeEnabled(
        environment,
      ),
    minimumCapitalPerLegInr:
      600 as const,
    preferredCapitalPerLegInr,
    maximumCapitalPerLegInr:
      1_000 as const,
    minimumCurrentNetProfitPercent:
      1.5 as const,
    minimumPostStressNetProfitPercent:
      1.3 as const,
    maximumOpportunityAgeMs:
      2_000 as const,
    routeCooldownMs:
      5_000 as const,
    maximumConcurrentTrades:
      1 as const,
    automaticFundMovementEnabled,
  });
}

function readInteger(
  raw:
    string | undefined,
  fallback:
    number,
  name:
    string,
): number {
  if (!raw?.trim()) {
    return fallback;
  }

  const value =
    Number(
      raw,
    );

  if (
    !Number.isSafeInteger(
      value,
    )
  ) {
    throw new Error(
      `${name} must be a whole INR amount.`,
    );
  }

  return value;
}
