export const STRATEGY_ONE_TINY_LIVE_MAXIMUM_CAPITAL_PER_LEG_INR =
  500;

export const STRATEGY_ONE_TINY_LIVE_MAXIMUM_CONCURRENT_ATTEMPTS =
  1;

export const STRATEGY_ONE_TINY_LIVE_DAILY_ATTEMPT_CAP =
  1;

export const DEFAULT_TINY_LIVE_MINIMUM_NET_PROFIT_PERCENT =
  0.30;

export const DEFAULT_STRATEGY_ONE_MAXIMUM_BOOK_AGE_MS =
  250;

export const DEFAULT_STRATEGY_ONE_MAXIMUM_BOOK_SKEW_MS =
  250;

export const DEFAULT_STRATEGY_ONE_AUTHORITY_TTL_MS =
  60_000;

export function getTinyLiveMinimumNetProfitPercent():
number {
  return readBoundedNumber(
    "TINY_LIVE_MINIMUM_NET_PROFIT_PERCENT",
    DEFAULT_TINY_LIVE_MINIMUM_NET_PROFIT_PERCENT,
    0,
    100,
  );
}

export function getStrategyOneTinyLiveDailyAttemptCap():
number {
  return readBoundedInteger(
    "STRATEGY_ONE_TINY_LIVE_DAILY_ATTEMPT_CAP",
    STRATEGY_ONE_TINY_LIVE_DAILY_ATTEMPT_CAP,
    1,
    STRATEGY_ONE_TINY_LIVE_DAILY_ATTEMPT_CAP,
  );
}

export function getStrategyOneTinyLiveMaximumCapitalPerLegInr():
number {
  return readBoundedInteger(
    "STRATEGY_ONE_TINY_LIVE_MAX_CAPITAL_PER_LEG_INR",
    STRATEGY_ONE_TINY_LIVE_MAXIMUM_CAPITAL_PER_LEG_INR,
    100,
    STRATEGY_ONE_TINY_LIVE_MAXIMUM_CAPITAL_PER_LEG_INR,
  );
}

export function getStrategyOneTinyLiveMaximumConcurrentAttempts():
number {
  return readBoundedInteger(
    "STRATEGY_ONE_TINY_LIVE_MAX_CONCURRENT_ATTEMPTS",
    STRATEGY_ONE_TINY_LIVE_MAXIMUM_CONCURRENT_ATTEMPTS,
    1,
    STRATEGY_ONE_TINY_LIVE_MAXIMUM_CONCURRENT_ATTEMPTS,
  );
}

export function getCoinDcxTdsWithholdingPercent():
number {
  return readBoundedNumber(
    "COINDCX_TDS_WITHHOLDING_PERCENT",
    1,
    0,
    100,
  );
}

function readBoundedNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw =
    process.env[name]
      ?.trim();

  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be a finite number between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function readBoundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value =
    readBoundedNumber(
      name,
      fallback,
      minimum,
      maximum,
    );

  if (
    !Number.isSafeInteger(
      value,
    )
  ) {
    throw new Error(
      `${name} must be a safe integer.`,
    );
  }

  return value;
}
