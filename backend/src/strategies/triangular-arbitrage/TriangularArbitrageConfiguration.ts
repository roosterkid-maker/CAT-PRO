import {TRIANGULAR_ARBITRAGE_STRATEGY_ID} from "../models/StrategyMetadata";

export const ACLA_STRATEGY_NAME = "ADAPTIVE_CLOSED_LOOP_ARBITRAGE" as const;
export type AclaCompoundingMode = "FIXED" | "COMPOUND" | "HYBRID";

export interface AclaCapitalPoolConfiguration {
  readonly totalAllocationInr: number;
  readonly activeCycleCapitalInr: number;
  readonly recoveryReserveInr: number;
  readonly feeTdsDustReserveInr: number;
  readonly compoundingMode: AclaCompoundingMode;
  readonly hybridReinvestmentPercent: number;
  readonly profitSweepThresholdInr: number;
  readonly maximumCycleLossInr: number;
  readonly dailyLossLimitInr: number;
  readonly maximumConsecutiveFailedCycles: number;
  readonly minimumCapitalProtectionInr: number;
  readonly maximumRecoveryLossInr: number;
  readonly maximumRecoveryAttempts: number;
  readonly maximumUnconvertedDurationMs: number;
  readonly maximumOpenCycles: 1;
}

export interface TriangularArbitrageConfigurationInput {
  readonly enabled?: boolean;
  readonly mode?: "SHADOW";
  readonly minimumNetProfitPercent?: number;
  readonly fastScreenMinimumGrossProfitPercent?: number;
  readonly minimumAbsoluteNetProfitInr?: number;
  readonly maximumInitialInputQuantity?: number;
  readonly maximumCapabilityAgeMs?: number;
  readonly maximumOrderBookAgeMs?: number;
  readonly maximumOpportunityAgeMs?: number;
  readonly maximumBookTimestampSkewMs?: number;
  readonly signalTtlMs?: number;
  readonly maximumSignalsPerSnapshot?: number;
  readonly slippageReservePercent?: number;
  readonly adverseMoveReservePercent?: number;
  readonly safetyBufferPercent?: number;
  readonly tdsCapitalLockPercent?: number;
  readonly maximumCyclesPerHour?: number;
  readonly routeCooldownMs?: number;
  readonly allowedExchanges?: readonly string[];
  readonly allowedStartingAssets?: readonly string[];
  readonly blockedAssets?: readonly string[];
  readonly startAssetInrValues?: Readonly<Record<string, number>>;
  readonly capitalPool?: Partial<AclaCapitalPoolConfiguration>;
}

export interface TriangularArbitrageConfiguration {
  readonly version: "180.0";
  readonly strategyId: typeof TRIANGULAR_ARBITRAGE_STRATEGY_ID;
  readonly strategyName: typeof ACLA_STRATEGY_NAME;
  readonly enabled: boolean;
  readonly mode: "SHADOW";
  readonly state: "DISABLED" | "SHADOW_READY";
  readonly minimumNetProfitPercent: number;
  readonly fastScreenMinimumGrossProfitPercent: number;
  readonly minimumAbsoluteNetProfitInr: number;
  readonly maximumInitialInputQuantity: number;
  readonly maximumCapabilityAgeMs: number;
  readonly maximumOrderBookAgeMs: number;
  readonly maximumOpportunityAgeMs: number;
  readonly maximumBookTimestampSkewMs: number;
  readonly signalTtlMs: number;
  readonly maximumSignalsPerSnapshot: number;
  readonly slippageReservePercent: number;
  readonly adverseMoveReservePercent: number;
  readonly safetyBufferPercent: number;
  readonly tdsCapitalLockPercent: number;
  readonly maximumCyclesPerHour: number;
  readonly routeCooldownMs: number;
  readonly allowedExchanges: readonly string[];
  readonly allowedStartingAssets: readonly string[];
  readonly blockedAssets: readonly string[];
  readonly startAssetInrValues: Readonly<Record<string, number>>;
  readonly capitalPool: AclaCapitalPoolConfiguration;
  readonly safety: {
    readonly shadowEvidenceOnly: true;
    readonly accountReadAllowed: false;
    readonly capitalMutationAllowed: false;
    readonly paperExecutionImplemented: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly leverageAllowed: false;
    readonly marginAllowed: false;
    readonly borrowingAllowed: false;
  };
}

export function createTriangularArbitrageConfiguration(
  input: TriangularArbitrageConfigurationInput = {},
): TriangularArbitrageConfiguration {
  const mode = input.mode ?? "SHADOW";
  if (mode !== "SHADOW") throw new Error("ACLA triangular arbitrage is SHADOW-only in V180.0.");
  const enabled = input.enabled ?? false;
  if (typeof enabled !== "boolean") throw new Error("ACLA triangular arbitrage enabled must be a boolean.");

  const allowedExchanges = normalizedList(input.allowedExchanges ?? []);
  const allowedStartingAssets = normalizedList(input.allowedStartingAssets ?? ["INR", "USDT", "USDC"]);
  const blockedAssets = normalizedList(input.blockedAssets ?? []);
  if (allowedStartingAssets.some((asset) => blockedAssets.includes(asset))) {
    throw new Error("ACLA starting-asset allow-list and asset block-list overlap.");
  }

  const capital = input.capitalPool ?? {};
  const totalAllocationInr = positiveFinite(capital.totalAllocationInr ?? 1_000, "capitalPool.totalAllocationInr");
  const activeCycleCapitalInr = positiveFinite(capital.activeCycleCapitalInr ?? 850, "capitalPool.activeCycleCapitalInr");
  const recoveryReserveInr = nonNegativeFinite(capital.recoveryReserveInr ?? 100, "capitalPool.recoveryReserveInr");
  const feeTdsDustReserveInr = nonNegativeFinite(capital.feeTdsDustReserveInr ?? 50, "capitalPool.feeTdsDustReserveInr");
  if (Math.abs(activeCycleCapitalInr + recoveryReserveInr + feeTdsDustReserveInr - totalAllocationInr) > 1e-8) {
    throw new Error("ACLA capital-pool buckets must exactly equal total allocation.");
  }
  const compoundingMode = capital.compoundingMode ?? "HYBRID";
  if (!["FIXED", "COMPOUND", "HYBRID"].includes(compoundingMode)) throw new Error("ACLA compounding mode is invalid.");
  const hybridReinvestmentPercent = boundedPercent(capital.hybridReinvestmentPercent ?? 50, "capitalPool.hybridReinvestmentPercent");
  const profitSweepThresholdInr = nonNegativeFinite(capital.profitSweepThresholdInr ?? 10, "capitalPool.profitSweepThresholdInr");
  const maximumCycleLossInr = positiveFinite(capital.maximumCycleLossInr ?? 3, "capitalPool.maximumCycleLossInr");
  const dailyLossLimitInr = positiveFinite(capital.dailyLossLimitInr ?? 15, "capitalPool.dailyLossLimitInr");
  const maximumConsecutiveFailedCycles = positiveInteger(capital.maximumConsecutiveFailedCycles ?? 3, "capitalPool.maximumConsecutiveFailedCycles");
  const minimumCapitalProtectionInr = positiveFinite(capital.minimumCapitalProtectionInr ?? 750, "capitalPool.minimumCapitalProtectionInr");
  const maximumRecoveryLossInr = positiveFinite(capital.maximumRecoveryLossInr ?? 3, "capitalPool.maximumRecoveryLossInr");
  const maximumRecoveryAttempts = positiveInteger(capital.maximumRecoveryAttempts ?? 3, "capitalPool.maximumRecoveryAttempts");
  const maximumUnconvertedDurationMs = positiveInteger(capital.maximumUnconvertedDurationMs ?? 2_000, "capitalPool.maximumUnconvertedDurationMs");
  if (minimumCapitalProtectionInr > activeCycleCapitalInr) {
    throw new Error("ACLA minimum capital protection cannot exceed active cycle capital.");
  }

  const rawRates = input.startAssetInrValues ?? {INR: 1, USDT: 85, USDC: 85};
  const startAssetInrValues: Record<string, number> = {};
  for (const [asset, value] of Object.entries(rawRates)) {
    const normalized = normalizeAsset(asset);
    startAssetInrValues[normalized] = positiveFinite(value, `startAssetInrValues.${normalized}`);
  }
  for (const asset of allowedStartingAssets) {
    if (!startAssetInrValues[asset]) throw new Error(`ACLA INR valuation is missing for allowed start asset ${asset}.`);
  }

  return deepFreeze({
    version: "180.0",
    strategyId: TRIANGULAR_ARBITRAGE_STRATEGY_ID,
    strategyName: ACLA_STRATEGY_NAME,
    enabled,
    mode,
    state: enabled ? "SHADOW_READY" : "DISABLED",
    minimumNetProfitPercent: positiveFinite(input.minimumNetProfitPercent ?? 0.25, "minimumNetProfitPercent"),
    fastScreenMinimumGrossProfitPercent: positiveFinite(input.fastScreenMinimumGrossProfitPercent ?? 0.4, "fastScreenMinimumGrossProfitPercent"),
    minimumAbsoluteNetProfitInr: positiveFinite(input.minimumAbsoluteNetProfitInr ?? 1.5, "minimumAbsoluteNetProfitInr"),
    maximumInitialInputQuantity: positiveFinite(input.maximumInitialInputQuantity ?? 1_000, "maximumInitialInputQuantity"),
    maximumCapabilityAgeMs: positiveInteger(input.maximumCapabilityAgeMs ?? 300_000, "maximumCapabilityAgeMs"),
    maximumOrderBookAgeMs: positiveInteger(input.maximumOrderBookAgeMs ?? 150, "maximumOrderBookAgeMs"),
    maximumOpportunityAgeMs: positiveInteger(input.maximumOpportunityAgeMs ?? 150, "maximumOpportunityAgeMs"),
    maximumBookTimestampSkewMs: positiveInteger(input.maximumBookTimestampSkewMs ?? 100, "maximumBookTimestampSkewMs"),
    signalTtlMs: positiveInteger(input.signalTtlMs ?? 500, "signalTtlMs"),
    maximumSignalsPerSnapshot: positiveInteger(input.maximumSignalsPerSnapshot ?? 50, "maximumSignalsPerSnapshot"),
    slippageReservePercent: nonNegativeFinite(input.slippageReservePercent ?? 0.1, "slippageReservePercent"),
    adverseMoveReservePercent: nonNegativeFinite(input.adverseMoveReservePercent ?? 0.07, "adverseMoveReservePercent"),
    safetyBufferPercent: nonNegativeFinite(input.safetyBufferPercent ?? 0.03, "safetyBufferPercent"),
    tdsCapitalLockPercent: boundedPercent(input.tdsCapitalLockPercent ?? 1, "tdsCapitalLockPercent"),
    maximumCyclesPerHour: positiveInteger(input.maximumCyclesPerHour ?? 120, "maximumCyclesPerHour"),
    routeCooldownMs: positiveInteger(input.routeCooldownMs ?? 1_000, "routeCooldownMs"),
    allowedExchanges,
    allowedStartingAssets,
    blockedAssets,
    startAssetInrValues,
    capitalPool: {totalAllocationInr, activeCycleCapitalInr, recoveryReserveInr, feeTdsDustReserveInr,
      compoundingMode, hybridReinvestmentPercent, profitSweepThresholdInr, maximumCycleLossInr,
      dailyLossLimitInr, maximumConsecutiveFailedCycles, minimumCapitalProtectionInr,
      maximumRecoveryLossInr, maximumRecoveryAttempts, maximumUnconvertedDurationMs,
      maximumOpenCycles: 1},
    safety: {shadowEvidenceOnly: true, accountReadAllowed: false, capitalMutationAllowed: false,
      paperExecutionImplemented: true, paperExecutionAllowed: false, liveExecutionAllowed: false,
      orderSubmissionAllowed: false, leverageAllowed: false, marginAllowed: false, borrowingAllowed: false},
  });
}

function normalizedList(values: readonly string[]): readonly string[] {
  return [...new Set(values.map(normalizeAsset).filter(Boolean))].sort();
}
function normalizeAsset(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`ACLA triangular arbitrage ${label} must be positive and finite.`);
  return value;
}
function nonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`ACLA triangular arbitrage ${label} must be non-negative and finite.`);
  return value;
}
function boundedPercent(value: number, label: string): number {
  const result = nonNegativeFinite(value, label);
  if (result > 100) throw new Error(`ACLA triangular arbitrage ${label} cannot exceed 100.`);
  return result;
}
function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`ACLA triangular arbitrage ${label} must be a positive integer.`);
  return value;
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
