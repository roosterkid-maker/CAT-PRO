import {
  SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
} from "../models/StrategyMetadata";
import {DERIVATIVE_CANDIDATE_MARKETS} from "../../derivatives/providers/DerivativeProviderUtilities";
import {SPOT_PERPETUAL_PERPETUAL_VENUES, SPOT_PERPETUAL_SPOT_VENUES} from
  "../../derivatives/services/DerivativeVenueCapabilityRegistry";

export interface SpotPerpetualBasisConfigurationInput {
  readonly enabled?: boolean;
  readonly mode?: "SHADOW";
  /** Legacy shorthand retained for existing deployments; applies to both legs. */
  readonly exchanges?: readonly string[];
  readonly spotExchanges?: readonly string[];
  readonly perpetualExchanges?: readonly string[];
  readonly markets?: readonly string[];
  readonly targetQuoteCapital?: number;
  readonly minimumExpectedNetPercent?: number;
  readonly closeAtOrBelowAbsoluteBasisPercent?: number;
  readonly spotSlippageBufferPercent?: number;
  readonly perpetualSlippageBufferPercent?: number;
  readonly nextOpeningDelayMs?: number;
  readonly perpetualLeverage?: number;
  readonly safetyBufferPercent?: number;
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumTimestampSkewMs?: number;
  readonly signalTtlMs?: number;
  readonly maximumSignalsPerSnapshot?: number;
}

export interface SpotPerpetualBasisConfiguration {
  readonly version: "176.0";
  readonly strategyId: typeof SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID;
  readonly enabled: boolean;
  readonly mode: "SHADOW";
  readonly state: "DISABLED" | "SHADOW_READY";
  readonly exchanges: readonly string[];
  readonly spotExchanges: readonly string[];
  readonly perpetualExchanges: readonly string[];
  readonly markets: readonly string[];
  readonly targetQuoteCapital: number;
  readonly minimumExpectedNetPercent: number;
  readonly closeAtOrBelowAbsoluteBasisPercent: number;
  readonly spotSlippageBufferPercent: number;
  readonly perpetualSlippageBufferPercent: number;
  readonly nextOpeningDelayMs: number;
  readonly perpetualLeverage: 1;
  readonly safetyBufferPercent: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumTimestampSkewMs: number;
  readonly signalTtlMs: number;
  readonly maximumSignalsPerSnapshot: number;
  readonly safety: {
    readonly cashAndCarryOnly: true;
    readonly shortSpotAllowed: false;
    readonly oneWayPerpetualRequired: true;
    readonly roundTripFeesReserved: true;
    readonly positiveFundingCountsTowardQualification: false;
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
    throw new Error("Spot-perpetual basis arbitrage signals are SHADOW-only; PAPER uses the central CAT PRO lifecycle.");
  }

  const enabled = input.enabled ?? false;

  if (typeof enabled !== "boolean") {
    throw new Error("Spot-perpetual basis enabled must be a boolean.");
  }

  const legacyExchanges = input.exchanges;
  const spotExchanges = normalizeList(input.spotExchanges ?? legacyExchanges ?? SPOT_PERPETUAL_SPOT_VENUES, false);
  const perpetualExchanges = normalizeList(input.perpetualExchanges ?? legacyExchanges ?? SPOT_PERPETUAL_PERPETUAL_VENUES, false);
  const exchanges = Array.from(new Set([...spotExchanges, ...perpetualExchanges])).sort();
  const markets = normalizeList(input.markets ?? DERIVATIVE_CANDIDATE_MARKETS, true);

  if (
    spotExchanges.length === 0 || perpetualExchanges.length === 0 ||
    spotExchanges.length > 6 || perpetualExchanges.length > 5 ||
    markets.length === 0 || markets.length > 20
  ) {
    throw new Error("Spot-perpetual basis requires one to six spot venues, one to five perpetual venues and one to twenty markets.");
  }

  const perpetualLeverage = positiveInteger(input.perpetualLeverage ?? 1, "perpetualLeverage");
  if (perpetualLeverage !== 1) {
    throw new Error("CAT PRO Strategy #4 PAPER foundation is deliberately restricted to 1x perpetual leverage.");
  }

  const configuration: SpotPerpetualBasisConfiguration = {
    version: "176.0",
    strategyId: SPOT_PERPETUAL_BASIS_ARBITRAGE_STRATEGY_ID,
    enabled,
    mode: "SHADOW",
    state: enabled ? "SHADOW_READY" : "DISABLED",
    exchanges,
    spotExchanges,
    perpetualExchanges,
    markets,
    targetQuoteCapital: positive(input.targetQuoteCapital ?? 1_000, "targetQuoteCapital"),
    minimumExpectedNetPercent: positive(input.minimumExpectedNetPercent ?? 0.30, "minimumExpectedNetPercent"),
    closeAtOrBelowAbsoluteBasisPercent: nonNegative(
      input.closeAtOrBelowAbsoluteBasisPercent ?? 0.10,
      "closeAtOrBelowAbsoluteBasisPercent",
    ),
    spotSlippageBufferPercent: nonNegative(
      input.spotSlippageBufferPercent ?? 0.05,
      "spotSlippageBufferPercent",
    ),
    perpetualSlippageBufferPercent: nonNegative(
      input.perpetualSlippageBufferPercent ?? 0.05,
      "perpetualSlippageBufferPercent",
    ),
    nextOpeningDelayMs: positiveInteger(input.nextOpeningDelayMs ?? 120_000, "nextOpeningDelayMs"),
    perpetualLeverage: 1,
    safetyBufferPercent: nonNegative(input.safetyBufferPercent ?? 0.10, "safetyBufferPercent"),
    maximumEvidenceAgeMs: positiveInteger(input.maximumEvidenceAgeMs ?? 15_000, "maximumEvidenceAgeMs"),
    maximumTimestampSkewMs: positiveInteger(input.maximumTimestampSkewMs ?? 2_500, "maximumTimestampSkewMs"),
    signalTtlMs: positiveInteger(input.signalTtlMs ?? 5_000, "signalTtlMs"),
    maximumSignalsPerSnapshot: positiveInteger(input.maximumSignalsPerSnapshot ?? 20, "maximumSignalsPerSnapshot"),
    safety: {
      cashAndCarryOnly: true,
      shortSpotAllowed: false,
      oneWayPerpetualRequired: true,
      roundTripFeesReserved: true,
      positiveFundingCountsTowardQualification: false,
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
