import {
  FUNDING_RATE_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";

export interface FundingRateArbitrageConfigurationInput {
  readonly enabled?: boolean;
  readonly mode?: "SHADOW";
  readonly exchanges?: readonly string[];
  readonly markets?: readonly string[];
  readonly targetQuoteNotional?: number;
  readonly minimumFundingDifferentialPercent?: number;
  readonly minimumExpectedNetPercent?: number;
  readonly safetyBufferPercent?: number;
  readonly maximumFundingPeriodsToCapture?: number;
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumEvidenceSkewMs?: number;
  readonly maximumFundingTimeSkewMs?: number;
  readonly signalTtlMs?: number;
  readonly maximumSignalsPerSnapshot?: number;
}

export interface FundingRateArbitrageConfiguration {
  readonly version: "28.0";
  readonly strategyId: typeof FUNDING_RATE_ARBITRAGE_STRATEGY_ID;
  readonly enabled: boolean;
  readonly mode: "SHADOW";
  readonly state: "DISABLED" | "SHADOW_READY";
  readonly exchanges: readonly string[];
  readonly markets: readonly string[];
  readonly targetQuoteNotional: number;
  readonly minimumFundingDifferentialPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly safetyBufferPercent: number;
  readonly maximumFundingPeriodsToCapture: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumEvidenceSkewMs: number;
  readonly maximumFundingTimeSkewMs: number;
  readonly signalTtlMs: number;
  readonly maximumSignalsPerSnapshot: number;
  readonly safety: {
    readonly sameMarketTwoVenueOnly: true;
    readonly matchedLongShortOnly: true;
    readonly expectedFundingNotGuaranteed: true;
    readonly shadowOnly: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export function createFundingRateArbitrageConfiguration(
  input: FundingRateArbitrageConfigurationInput = {},
): FundingRateArbitrageConfiguration {
  if ((input.mode ?? "SHADOW") !== "SHADOW") {
    throw new Error("Funding-rate arbitrage is SHADOW-only in V28.0.");
  }

  const enabled = input.enabled ?? false;
  if (typeof enabled !== "boolean") {
    throw new Error("Funding-rate arbitrage enabled must be a boolean.");
  }

  const exchanges = normalize(input.exchanges ?? ["binance", "bybit"], false);
  const markets = normalize(input.markets ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"], true);
  if (exchanges.length < 2 || markets.length === 0 || markets.length > 10) {
    throw new Error("Funding-rate arbitrage requires two exchanges and one to ten markets.");
  }

  return deepFreeze({
    version: "28.0",
    strategyId: FUNDING_RATE_ARBITRAGE_STRATEGY_ID,
    enabled,
    mode: "SHADOW",
    state: enabled ? "SHADOW_READY" : "DISABLED",
    exchanges,
    markets,
    targetQuoteNotional: positive(input.targetQuoteNotional ?? 1_000, "targetQuoteNotional"),
    minimumFundingDifferentialPercent: nonNegative(
      input.minimumFundingDifferentialPercent ?? 0.01,
      "minimumFundingDifferentialPercent",
    ),
    minimumExpectedNetPercent: positive(
      input.minimumExpectedNetPercent ?? 0.05,
      "minimumExpectedNetPercent",
    ),
    safetyBufferPercent: nonNegative(input.safetyBufferPercent ?? 0.05, "safetyBufferPercent"),
    maximumFundingPeriodsToCapture: boundedPositiveInteger(
      input.maximumFundingPeriodsToCapture ?? 6,
      6,
      "maximumFundingPeriodsToCapture",
    ),
    maximumEvidenceAgeMs: positiveInteger(input.maximumEvidenceAgeMs ?? 15_000, "maximumEvidenceAgeMs"),
    // Depth completes before the ticker/funding refresh. Bound their allowed
    // local-observation gap to one refresh cadence while the independent 15s
    // age gate and 5s signal TTL still fail closed on stale evidence.
    maximumEvidenceSkewMs: positiveInteger(input.maximumEvidenceSkewMs ?? 5_000, "maximumEvidenceSkewMs"),
    maximumFundingTimeSkewMs: positiveInteger(
      input.maximumFundingTimeSkewMs ?? 300_000,
      "maximumFundingTimeSkewMs",
    ),
    signalTtlMs: positiveInteger(input.signalTtlMs ?? 5_000, "signalTtlMs"),
    maximumSignalsPerSnapshot: positiveInteger(
      input.maximumSignalsPerSnapshot ?? 20,
      "maximumSignalsPerSnapshot",
    ),
    safety: {
      sameMarketTwoVenueOnly: true,
      matchedLongShortOnly: true,
      expectedFundingNotGuaranteed: true,
      shadowOnly: true,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  });
}

function normalize(values: readonly string[], compact: boolean): string[] {
  return Array.from(new Set(values.map((value) => {
    const normalized = value.trim();
    return compact
      ? normalized.toUpperCase().replace(/[^A-Z0-9]/g, "")
      : normalized.toLowerCase();
  }).filter(Boolean))).sort();
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Funding-rate arbitrage ${label} must be positive and finite.`);
  }
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Funding-rate arbitrage ${label} must be non-negative and finite.`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Funding-rate arbitrage ${label} must be a positive integer.`);
  }
  return value;
}

function boundedPositiveInteger(value: number, maximum: number, label: string): number {
  const normalized = positiveInteger(value, label);
  if (normalized > maximum) {
    throw new Error(`Funding-rate arbitrage ${label} must not exceed ${maximum}.`);
  }
  return normalized;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
