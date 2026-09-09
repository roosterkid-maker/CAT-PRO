export const LIVE_ONLY_RUNTIME_PROFILE =
  "live-only" as const;

export const LIVE_ONLY_RUNTIME_CONFIRMATION =
  "ENABLE_CAT_PRO_LIVE_ONLY_RUNTIME" as const;

export interface LiveOnlyRuntimePolicy {
  readonly enabled: boolean;
  readonly minimumCapitalPerLegInr: 600;
  readonly preferredCapitalPerLegInr: number;
  readonly maximumCapitalPerLegInr: 1_000;
  readonly minimumCurrentNetProfitPercent: 0.3;
  readonly minimumPostStressNetProfitPercent: 0.15;
  readonly maximumOpportunityAgeMs: 10_000;
  readonly routeCooldownMs: 5_000;
  readonly maximumConcurrentTrades: 1;
  readonly automaticFundMovementEnabled: boolean;
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
      0.3 as const,
    minimumPostStressNetProfitPercent:
      0.15 as const,
    maximumOpportunityAgeMs:
      10_000 as const,
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
