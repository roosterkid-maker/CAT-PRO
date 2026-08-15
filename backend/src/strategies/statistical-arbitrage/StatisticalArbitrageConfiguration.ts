import {STATISTICAL_ARBITRAGE_STRATEGY_ID} from "../models/StrategyMetadata";

export interface StatisticalArbitragePairInput {
  readonly pairId?: string;
  readonly exchange: string;
  readonly leftMarket: string;
  readonly rightMarket: string;
}

export interface StatisticalArbitragePair {
  readonly pairId: string;
  readonly exchange: string;
  readonly leftMarket: string;
  readonly rightMarket: string;
}

export interface StatisticalArbitrageConfigurationInput {
  readonly enabled?: boolean;
  readonly mode?: "SHADOW";
  readonly pairs?: readonly StatisticalArbitragePairInput[];
  readonly targetQuoteNotional?: number;
  readonly minimumBaselineSamples?: number;
  readonly maximumSamples?: number;
  readonly entryZScoreThreshold?: number;
  readonly minimumAbsoluteReturnCorrelation?: number;
  readonly minimumHedgeBeta?: number;
  readonly maximumHedgeBeta?: number;
  readonly minimumModeledNetPercent?: number;
  readonly safetyBufferPercent?: number;
  readonly maximumEvidenceAgeMs?: number;
  readonly maximumEvidenceSkewMs?: number;
  readonly signalTtlMs?: number;
  readonly maximumSignalsPerSnapshot?: number;
}

export interface StatisticalArbitrageConfiguration {
  readonly version: "31.0";
  readonly strategyId: typeof STATISTICAL_ARBITRAGE_STRATEGY_ID;
  readonly enabled: boolean;
  readonly mode: "SHADOW";
  readonly state: "DISABLED" | "SHADOW_READY";
  readonly pairs: readonly StatisticalArbitragePair[];
  readonly targetQuoteNotional: number;
  readonly minimumBaselineSamples: number;
  readonly maximumSamples: number;
  readonly entryZScoreThreshold: number;
  readonly minimumAbsoluteReturnCorrelation: number;
  readonly minimumHedgeBeta: number;
  readonly maximumHedgeBeta: number;
  readonly minimumModeledNetPercent: number;
  readonly safetyBufferPercent: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumEvidenceSkewMs: number;
  readonly signalTtlMs: number;
  readonly maximumSignalsPerSnapshot: number;
  readonly safety: {
    readonly baselineExcludesCurrentObservation: true;
    readonly cointegrationNotInferred: true;
    readonly meanReversionNotGuaranteed: true;
    readonly correlationCausationNotInferred: true;
    readonly shadowOnly: true;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

const DEFAULT_PAIRS: readonly StatisticalArbitragePairInput[] = [
  {exchange: "binance", leftMarket: "BTCUSDT", rightMarket: "ETHUSDT"},
  {exchange: "bybit", leftMarket: "BTCUSDT", rightMarket: "ETHUSDT"},
];

export function createStatisticalArbitrageConfiguration(input: StatisticalArbitrageConfigurationInput = {}): StatisticalArbitrageConfiguration {
  if ((input.mode ?? "SHADOW") !== "SHADOW") throw new Error("Statistical arbitrage is SHADOW-only in V31.0.");
  const enabled = input.enabled ?? false;
  if (typeof enabled !== "boolean") throw new Error("Statistical arbitrage enabled must be boolean.");
  const pairs = (input.pairs ?? DEFAULT_PAIRS).map((pair) => {
    const exchange = pair.exchange.trim().toLowerCase();
    const leftMarket = normalizeMarket(pair.leftMarket); const rightMarket = normalizeMarket(pair.rightMarket);
    if (!exchange || !leftMarket || !rightMarket || leftMarket === rightMarket) throw new Error("Statistical arbitrage pair identity is invalid.");
    return {pairId: pair.pairId?.trim() || `${exchange}:${leftMarket}:${rightMarket}`, exchange, leftMarket, rightMarket};
  });
  if (pairs.length === 0 || pairs.length > 10 || new Set(pairs.map((pair) => pair.pairId)).size !== pairs.length) throw new Error("Statistical arbitrage requires one to ten unique pairs.");
  const minimumBaselineSamples = integer(input.minimumBaselineSamples ?? 30, "minimumBaselineSamples");
  const maximumSamples = integer(input.maximumSamples ?? 120, "maximumSamples");
  if (maximumSamples <= minimumBaselineSamples) throw new Error("Statistical arbitrage maximumSamples must exceed baseline samples.");
  const minimumHedgeBeta = positive(input.minimumHedgeBeta ?? 0.25, "minimumHedgeBeta");
  const maximumHedgeBeta = positive(input.maximumHedgeBeta ?? 4, "maximumHedgeBeta");
  if (maximumHedgeBeta <= minimumHedgeBeta) throw new Error("Statistical arbitrage beta range is invalid.");
  return deepFreeze({
    version: "31.0", strategyId: STATISTICAL_ARBITRAGE_STRATEGY_ID, enabled, mode: "SHADOW",
    state: enabled ? "SHADOW_READY" : "DISABLED", pairs, targetQuoteNotional: positive(input.targetQuoteNotional ?? 500, "targetQuoteNotional"),
    minimumBaselineSamples, maximumSamples, entryZScoreThreshold: positive(input.entryZScoreThreshold ?? 2, "entryZScoreThreshold"),
    minimumAbsoluteReturnCorrelation: bounded(input.minimumAbsoluteReturnCorrelation ?? 0.6, 0, 1, "minimumAbsoluteReturnCorrelation"),
    minimumHedgeBeta, maximumHedgeBeta, minimumModeledNetPercent: positive(input.minimumModeledNetPercent ?? 0.10, "minimumModeledNetPercent"),
    safetyBufferPercent: nonNegative(input.safetyBufferPercent ?? 0.05, "safetyBufferPercent"),
    maximumEvidenceAgeMs: integer(input.maximumEvidenceAgeMs ?? 15_000, "maximumEvidenceAgeMs"),
    maximumEvidenceSkewMs: integer(input.maximumEvidenceSkewMs ?? 2_500, "maximumEvidenceSkewMs"),
    signalTtlMs: integer(input.signalTtlMs ?? 5_000, "signalTtlMs"), maximumSignalsPerSnapshot: integer(input.maximumSignalsPerSnapshot ?? 10, "maximumSignalsPerSnapshot"),
    safety: {baselineExcludesCurrentObservation: true, cointegrationNotInferred: true, meanReversionNotGuaranteed: true,
      correlationCausationNotInferred: true, shadowOnly: true, paperExecutionAllowed: false,
      liveExecutionAllowed: false, orderSubmissionAllowed: false},
  });
}

function normalizeMarket(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function positive(value: number, label: string): number { if (!Number.isFinite(value) || value <= 0) throw new Error(`Statistical arbitrage ${label} must be positive.`); return value; }
function nonNegative(value: number, label: string): number { if (!Number.isFinite(value) || value < 0) throw new Error(`Statistical arbitrage ${label} must be non-negative.`); return value; }
function integer(value: number, label: string): number { if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Statistical arbitrage ${label} must be a positive integer.`); return value; }
function bounded(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Statistical arbitrage ${label} is out of range.`); return value; }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }
