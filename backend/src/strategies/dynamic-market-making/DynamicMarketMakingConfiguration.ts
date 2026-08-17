import {DYNAMIC_MARKET_MAKING_STRATEGY_ID} from "../models/StrategyMetadata";

export interface DynamicMarketMakingConfigurationInput {
  readonly enabled?: boolean;
  readonly mode?: "SHADOW";
  readonly exchanges?: readonly string[];
  readonly markets?: readonly string[];
  readonly targetQuoteNotional?: number;
  readonly minimumSamples?: number;
  readonly maximumSamples?: number;
  readonly volatilitySpreadMultiplier?: number;
  readonly imbalanceFairValueWeight?: number;
  readonly minimumHalfSpreadPercent?: number;
  readonly minimumModeledNetCapturePercent?: number;
  readonly safetyBufferPercent?: number;
  readonly inventoryTargetBasePercent?: number;
  readonly maximumInventorySkewPercent?: number;
  readonly maximumInventoryEvidenceAgeMs?: number;
  readonly maximumCapabilityEvidenceAgeMs?: number;
  readonly minimumPublicTradeSamples?: number;
  readonly publicTradeLookbackMs?: number;
  readonly volatileRegimeThresholdPercent?: number;
  readonly maximumAdverseSelectionSpreadPercent?: number;
  readonly minimumEmpiricalFillProbabilityPercent?: number;
  readonly minimumLiquidityCoverageMultiple?: number;
  readonly maximumEvidenceAgeMs?: number;
  readonly refreshIntervalMs?: number;
  readonly signalTtlMs?: number;
  readonly maximumSignalsPerSnapshot?: number;
}

export interface DynamicMarketMakingConfiguration {
  readonly version: "30.0";
  readonly strategyId: typeof DYNAMIC_MARKET_MAKING_STRATEGY_ID;
  readonly enabled: boolean;
  readonly mode: "SHADOW";
  readonly state: "DISABLED" | "SHADOW_READY";
  readonly exchanges: readonly string[];
  readonly markets: readonly string[];
  readonly targetQuoteNotional: number;
  readonly minimumSamples: number;
  readonly maximumSamples: number;
  readonly volatilitySpreadMultiplier: number;
  readonly imbalanceFairValueWeight: number;
  readonly minimumHalfSpreadPercent: number;
  readonly minimumModeledNetCapturePercent: number;
  readonly safetyBufferPercent: number;
  readonly inventoryTargetBasePercent: number;
  readonly maximumInventorySkewPercent: number;
  readonly maximumInventoryEvidenceAgeMs: number;
  readonly maximumCapabilityEvidenceAgeMs: number;
  readonly minimumPublicTradeSamples: number;
  readonly publicTradeLookbackMs: number;
  readonly volatileRegimeThresholdPercent: number;
  readonly maximumAdverseSelectionSpreadPercent: number;
  readonly minimumEmpiricalFillProbabilityPercent: number;
  readonly minimumLiquidityCoverageMultiple: number;
  readonly maximumEvidenceAgeMs: number;
  readonly refreshIntervalMs: number;
  readonly signalTtlMs: number;
  readonly maximumSignalsPerSnapshot: number;
  readonly safety: {
    readonly inventoryNeutralEvidenceOnly: true;
    readonly postOnlyRequired: true;
    readonly queuePositionNotInferred: true;
    readonly fillProbabilityNotInferred: true;
    readonly shadowOnly: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export function createDynamicMarketMakingConfiguration(input: DynamicMarketMakingConfigurationInput = {}): DynamicMarketMakingConfiguration {
  if ((input.mode ?? "SHADOW") !== "SHADOW") throw new Error("Dynamic market making is SHADOW-only in V30.0.");
  const enabled = input.enabled ?? false;
  if (typeof enabled !== "boolean") throw new Error("Dynamic market making enabled must be boolean.");
  const exchanges = normalize(input.exchanges ?? ["binance", "bybit"], false);
  const markets = normalize(input.markets ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"], true);
  if (exchanges.length === 0 || markets.length === 0 || markets.length > 20) throw new Error("Dynamic market making requires exchanges and one to twenty markets.");
  const minimumSamples = integer(input.minimumSamples ?? 5, "minimumSamples");
  const maximumSamples = integer(input.maximumSamples ?? 60, "maximumSamples");
  if (maximumSamples < minimumSamples) throw new Error("Dynamic market making maximumSamples must cover minimumSamples.");
  return deepFreeze({
    version: "30.0", strategyId: DYNAMIC_MARKET_MAKING_STRATEGY_ID, enabled, mode: "SHADOW",
    state: enabled ? "SHADOW_READY" : "DISABLED", exchanges, markets,
    targetQuoteNotional: positive(input.targetQuoteNotional ?? 250, "targetQuoteNotional"),
    minimumSamples, maximumSamples,
    volatilitySpreadMultiplier: nonNegative(input.volatilitySpreadMultiplier ?? 1.5, "volatilitySpreadMultiplier"),
    imbalanceFairValueWeight: bounded(input.imbalanceFairValueWeight ?? 0.5, 0, 1, "imbalanceFairValueWeight"),
    minimumHalfSpreadPercent: positive(input.minimumHalfSpreadPercent ?? 0.05, "minimumHalfSpreadPercent"),
    minimumModeledNetCapturePercent: positive(input.minimumModeledNetCapturePercent ?? 0.05, "minimumModeledNetCapturePercent"),
    safetyBufferPercent: nonNegative(input.safetyBufferPercent ?? 0.05, "safetyBufferPercent"),
    inventoryTargetBasePercent: bounded(input.inventoryTargetBasePercent ?? 50, 1, 99, "inventoryTargetBasePercent"),
    maximumInventorySkewPercent: nonNegative(input.maximumInventorySkewPercent ?? 0.25, "maximumInventorySkewPercent"),
    maximumInventoryEvidenceAgeMs: integer(input.maximumInventoryEvidenceAgeMs ?? 15_000, "maximumInventoryEvidenceAgeMs"),
    maximumCapabilityEvidenceAgeMs: integer(input.maximumCapabilityEvidenceAgeMs ?? 300_000, "maximumCapabilityEvidenceAgeMs"),
    minimumPublicTradeSamples: integer(input.minimumPublicTradeSamples ?? 10, "minimumPublicTradeSamples"),
    publicTradeLookbackMs: integer(input.publicTradeLookbackMs ?? 30_000, "publicTradeLookbackMs"),
    volatileRegimeThresholdPercent: positive(input.volatileRegimeThresholdPercent ?? 0.35, "volatileRegimeThresholdPercent"),
    maximumAdverseSelectionSpreadPercent: nonNegative(input.maximumAdverseSelectionSpreadPercent ?? 0.15, "maximumAdverseSelectionSpreadPercent"),
    minimumEmpiricalFillProbabilityPercent: bounded(input.minimumEmpiricalFillProbabilityPercent ?? 1, 0, 100, "minimumEmpiricalFillProbabilityPercent"),
    minimumLiquidityCoverageMultiple: positive(input.minimumLiquidityCoverageMultiple ?? 2, "minimumLiquidityCoverageMultiple"),
    maximumEvidenceAgeMs: integer(input.maximumEvidenceAgeMs ?? 5_000, "maximumEvidenceAgeMs"),
    refreshIntervalMs: integer(input.refreshIntervalMs ?? 1_000, "refreshIntervalMs"),
    signalTtlMs: integer(input.signalTtlMs ?? 15_000, "signalTtlMs"),
    maximumSignalsPerSnapshot: integer(input.maximumSignalsPerSnapshot ?? 20, "maximumSignalsPerSnapshot"),
    safety: {inventoryNeutralEvidenceOnly: true, postOnlyRequired: true, queuePositionNotInferred: true,
      fillProbabilityNotInferred: true, shadowOnly: true, paperExecutionAllowed: false,
      liveExecutionAllowed: false, orderSubmissionAllowed: false},
  });
}

function normalize(values: readonly string[], compact: boolean): string[] { return Array.from(new Set(values.map((value) => compact ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : value.trim().toLowerCase()).filter(Boolean))).sort(); }
function positive(value: number, label: string): number { if (!Number.isFinite(value) || value <= 0) throw new Error(`Dynamic market making ${label} must be positive.`); return value; }
function nonNegative(value: number, label: string): number { if (!Number.isFinite(value) || value < 0) throw new Error(`Dynamic market making ${label} must be non-negative.`); return value; }
function integer(value: number, label: string): number { if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Dynamic market making ${label} must be a positive integer.`); return value; }
function bounded(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Dynamic market making ${label} is out of range.`); return value; }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }
