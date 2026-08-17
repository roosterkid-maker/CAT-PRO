import {
  SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";

export interface SpotPerpetualBasisConfigurationInput {
  readonly enabled?: boolean;
  readonly mode?: "SHADOW";
  readonly exchanges?: readonly string[];
  readonly markets?: readonly string[];
  readonly targetQuoteCapital?: number;
  readonly minimumExpectedNetPercent?: number;
  readonly safetyBufferPercent?: number;
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumTimestampSkewMs?: number;
  readonly signalTtlMs?: number;
  readonly maximumSignalsPerSnapshot?: number;
}

export interface SpotPerpetualBasisConfiguration {
  readonly version: "27.0";
  readonly strategyId: typeof SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID;
  readonly enabled: boolean;
  readonly mode: "SHADOW";
  readonly state: "DISABLED" | "SHADOW_READY";
  readonly exchanges: readonly string[];
  readonly markets: readonly string[];
  readonly targetQuoteCapital: number;
  readonly minimumExpectedNetPercent: number;
  readonly safetyBufferPercent: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumTimestampSkewMs: number;
  readonly signalTtlMs: number;
  readonly maximumSignalsPerSnapshot: number;
  readonly safety: {
    readonly cashAndCarryOnly: true;
    readonly shortSpotAllowed: false;
    readonly shadowOnly: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export function createSpotPerpetualBasisConfiguration(
  input: SpotPerpetualBasisConfigurationInput = {},
): SpotPerpetualBasisConfiguration {
  if ((input.mode ?? "SHADOW") !== "SHADOW") {
    throw new Error("Spot-perpetual basis arbitrage is SHADOW-only in V27.0.");
  }

  const enabled = input.enabled ?? false;

  if (typeof enabled !== "boolean") {
    throw new Error("Spot-perpetual basis enabled must be a boolean.");
  }

  const exchanges = normalizeList(input.exchanges ?? ["binance", "bybit"], false);
  const markets = normalizeList(input.markets ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"], true);

  if (exchanges.length === 0 || markets.length === 0 || markets.length > 10) {
    throw new Error("Spot-perpetual basis requires exchanges and one to ten markets.");
  }

  const configuration: SpotPerpetualBasisConfiguration = {
    version: "27.0",
    strategyId: SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
    enabled,
    mode: "SHADOW",
    state: enabled ? "SHADOW_READY" : "DISABLED",
    exchanges,
    markets,
    targetQuoteCapital: positive(input.targetQuoteCapital ?? 1_000, "targetQuoteCapital"),
    minimumExpectedNetPercent: positive(input.minimumExpectedNetPercent ?? 0.25, "minimumExpectedNetPercent"),
    safetyBufferPercent: nonNegative(input.safetyBufferPercent ?? 0.10, "safetyBufferPercent"),
    maximumEvidenceAgeMs: positiveInteger(input.maximumEvidenceAgeMs ?? 15_000, "maximumEvidenceAgeMs"),
    maximumTimestampSkewMs: positiveInteger(input.maximumTimestampSkewMs ?? 2_500, "maximumTimestampSkewMs"),
    signalTtlMs: positiveInteger(input.signalTtlMs ?? 5_000, "signalTtlMs"),
    maximumSignalsPerSnapshot: positiveInteger(input.maximumSignalsPerSnapshot ?? 20, "maximumSignalsPerSnapshot"),
    safety: {
      cashAndCarryOnly: true,
      shortSpotAllowed: false,
      shadowOnly: true,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  };

  return deepFreeze(configuration);
}

function normalizeList(values: readonly string[], compact: boolean): string[] {
  return Array.from(new Set(values.map((value) => {
    const normalized = value.trim();
    return compact
      ? normalized.toUpperCase().replace(/[^A-Z0-9]/g, "")
      : normalized.toLowerCase();
  }).filter(Boolean))).sort();
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Spot-perpetual basis ${label} must be positive and finite.`);
  }
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Spot-perpetual basis ${label} must be non-negative and finite.`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Spot-perpetual basis ${label} must be a positive integer.`);
  }
  return value;
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
