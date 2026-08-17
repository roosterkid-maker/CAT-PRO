import {
  TRIANGULAR_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";

export interface TriangularArbitrageConfigurationInput {
  readonly enabled?: boolean;

  readonly mode?: "SHADOW";

  readonly minimumNetProfitPercent?: number;

  readonly maximumInitialInputQuantity?: number;

  readonly maximumCapabilityAgeMs?: number;

  readonly signalTtlMs?: number;

  readonly maximumSignalsPerSnapshot?: number;
}

export interface TriangularArbitrageConfiguration {
  readonly version: "25.0";

  readonly strategyId: typeof TRIANGULAR_ARBITRAGE_STRATEGY_ID;

  readonly enabled: boolean;

  readonly mode: "SHADOW";

  readonly state: "DISABLED" | "SHADOW_READY";

  readonly minimumNetProfitPercent: number;

  readonly maximumInitialInputQuantity: number;

  readonly maximumCapabilityAgeMs: number;

  readonly signalTtlMs: number;

  readonly maximumSignalsPerSnapshot: number;

  readonly safety: {
    readonly shadowEvidenceOnly: true;
    readonly accountReadAllowed: false;
    readonly capitalMutationAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export function createTriangularArbitrageConfiguration(
  input: TriangularArbitrageConfigurationInput = {},
): TriangularArbitrageConfiguration {
  const mode = input.mode ?? "SHADOW";

  if (mode !== "SHADOW") {
    throw new Error("Triangular arbitrage is SHADOW-only in V25.0.");
  }

  const enabled = input.enabled ?? false;

  if (typeof enabled !== "boolean") {
    throw new Error("Triangular arbitrage enabled must be a boolean.");
  }

  const minimumNetProfitPercent =
    positiveFinite(input.minimumNetProfitPercent ?? 0.2, "minimumNetProfitPercent");

  const maximumInitialInputQuantity =
    positiveFinite(input.maximumInitialInputQuantity ?? 1_000, "maximumInitialInputQuantity");

  const maximumCapabilityAgeMs =
    positiveInteger(input.maximumCapabilityAgeMs ?? 300_000, "maximumCapabilityAgeMs");

  const signalTtlMs =
    positiveInteger(input.signalTtlMs ?? 3_000, "signalTtlMs");

  const maximumSignalsPerSnapshot =
    positiveInteger(input.maximumSignalsPerSnapshot ?? 50, "maximumSignalsPerSnapshot");

  return deepFreeze({
    version: "25.0",
    strategyId: TRIANGULAR_ARBITRAGE_STRATEGY_ID,
    enabled,
    mode,
    state: enabled ? "SHADOW_READY" : "DISABLED",
    minimumNetProfitPercent,
    maximumInitialInputQuantity,
    maximumCapabilityAgeMs,
    signalTtlMs,
    maximumSignalsPerSnapshot,
    safety: {
      shadowEvidenceOnly: true,
      accountReadAllowed: false,
      capitalMutationAllowed: false,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  });
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Triangular arbitrage ${label} must be positive and finite.`);
  }

  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Triangular arbitrage ${label} must be a positive integer.`);
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
