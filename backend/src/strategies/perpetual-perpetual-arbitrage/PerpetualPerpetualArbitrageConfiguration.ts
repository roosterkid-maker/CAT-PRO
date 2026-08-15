import {
  PERPETUAL_PERPETUAL_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";

export interface PerpetualPerpetualArbitrageConfigurationInput {
  readonly enabled?: boolean;
  readonly mode?: "SHADOW";
  readonly exchanges?: readonly string[];
  readonly markets?: readonly string[];
  readonly targetQuoteNotional?: number;
  readonly minimumGrossDislocationPercent?: number;
  readonly minimumExpectedNetPercent?: number;
  readonly safetyBufferPercent?: number;
  readonly adverseFundingPeriodsReserved?: number;
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumEvidenceSkewMs?: number;
  readonly signalTtlMs?: number;
  readonly maximumSignalsPerSnapshot?: number;
}

export interface PerpetualPerpetualArbitrageConfiguration {
  readonly version: "29.0";
  readonly strategyId: typeof PERPETUAL_PERPETUAL_ARBITRAGE_STRATEGY_ID;
  readonly enabled: boolean;
  readonly mode: "SHADOW";
  readonly state: "DISABLED" | "SHADOW_READY";
  readonly exchanges: readonly string[];
  readonly markets: readonly string[];
  readonly targetQuoteNotional: number;
  readonly minimumGrossDislocationPercent: number;
  readonly minimumExpectedNetPercent: number;
  readonly safetyBufferPercent: number;
  readonly adverseFundingPeriodsReserved: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumEvidenceSkewMs: number;
  readonly signalTtlMs: number;
  readonly maximumSignalsPerSnapshot: number;
  readonly safety: {
    readonly sameContractTwoVenueOnly: true;
    readonly matchedLongShortOnly: true;
    readonly convergenceNotGuaranteed: true;
    readonly roundTripFeesReserved: true;
    readonly adverseFundingReserved: true;
    readonly shadowOnly: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export function createPerpetualPerpetualArbitrageConfiguration(
  input: PerpetualPerpetualArbitrageConfigurationInput = {},
): PerpetualPerpetualArbitrageConfiguration {
  if ((input.mode ?? "SHADOW") !== "SHADOW") {
    throw new Error("Perpetual-perpetual arbitrage is SHADOW-only in V29.0.");
  }
  const enabled = input.enabled ?? false;
  if (typeof enabled !== "boolean") throw new Error("Perpetual-perpetual enabled must be boolean.");
  const exchanges = normalize(input.exchanges ?? ["binance", "bybit"], false);
  const markets = normalize(input.markets ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"], true);
  if (exchanges.length < 2 || markets.length === 0 || markets.length > 10) {
    throw new Error("Perpetual-perpetual arbitrage requires two exchanges and one to ten markets.");
  }
  return deepFreeze({
    version: "29.0",
    strategyId: PERPETUAL_PERPETUAL_ARBITRAGE_STRATEGY_ID,
    enabled,
    mode: "SHADOW",
    state: enabled ? "SHADOW_READY" : "DISABLED",
    exchanges,
    markets,
    targetQuoteNotional: positive(input.targetQuoteNotional ?? 1_000, "targetQuoteNotional"),
    minimumGrossDislocationPercent: positive(input.minimumGrossDislocationPercent ?? 0.20, "minimumGrossDislocationPercent"),
    minimumExpectedNetPercent: positive(input.minimumExpectedNetPercent ?? 0.05, "minimumExpectedNetPercent"),
    safetyBufferPercent: nonNegative(input.safetyBufferPercent ?? 0.05, "safetyBufferPercent"),
    adverseFundingPeriodsReserved: positiveInteger(input.adverseFundingPeriodsReserved ?? 1, "adverseFundingPeriodsReserved"),
    maximumEvidenceAgeMs: positiveInteger(input.maximumEvidenceAgeMs ?? 15_000, "maximumEvidenceAgeMs"),
    maximumEvidenceSkewMs: positiveInteger(input.maximumEvidenceSkewMs ?? 2_500, "maximumEvidenceSkewMs"),
    signalTtlMs: positiveInteger(input.signalTtlMs ?? 5_000, "signalTtlMs"),
    maximumSignalsPerSnapshot: positiveInteger(input.maximumSignalsPerSnapshot ?? 20, "maximumSignalsPerSnapshot"),
    safety: {
      sameContractTwoVenueOnly: true,
      matchedLongShortOnly: true,
      convergenceNotGuaranteed: true,
      roundTripFeesReserved: true,
      adverseFundingReserved: true,
      shadowOnly: true,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  });
}

function normalize(values: readonly string[], compact: boolean): string[] {
  return Array.from(new Set(values.map((value) => compact
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    : value.trim().toLowerCase()).filter(Boolean))).sort();
}
function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Perpetual-perpetual ${label} must be positive.`);
  return value;
}
function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Perpetual-perpetual ${label} must be non-negative.`);
  return value;
}
function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Perpetual-perpetual ${label} must be a positive integer.`);
  return value;
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
