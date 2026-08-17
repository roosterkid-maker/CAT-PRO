import type {StatisticalPairSample} from "./StatisticalHistoricalDataService";

export interface StatisticalWalkForwardConfiguration {
  readonly minimumTrainingSamples: number;
  readonly testSamplesPerFold: number;
  readonly minimumFolds: number;
  readonly maximumFolds: number;
  readonly entryZScoreThreshold: number;
  readonly roundTripCostPercent: number;
  readonly safetyBufferPercent: number;
  readonly minimumTrades: number;
  readonly minimumNetPercent: number;
  readonly maximumDrawdownPercent: number;
}

export interface StatisticalWalkForwardFold {
  readonly fold: number;
  readonly trainingSamples: number;
  readonly testSamples: number;
  readonly trainingStartTimestamp: number;
  readonly trainingEndTimestamp: number;
  readonly testStartTimestamp: number;
  readonly testEndTimestamp: number;
  readonly hedgeBeta: number;
  readonly spreadMean: number;
  readonly spreadStandardDeviation: number;
  readonly trades: number;
  readonly wins: number;
  readonly grossReturnPercent: number;
  readonly netReturnPercent: number;
  readonly maximumDrawdownPercent: number;
  readonly noLookaheadLeakage: true;
}

export interface StatisticalWalkForwardReport {
  readonly generatedAt: number;
  readonly version: "33.0";
  readonly featureVersion: "STAT_PAIR_LOG_PRICE_V1";
  readonly pairId: string;
  readonly evidenceStatus: "AVAILABLE" | "INSUFFICIENT_DATA" | "NO_DATA";
  readonly validationPassed: boolean;
  readonly sampleCount: number;
  readonly folds: readonly StatisticalWalkForwardFold[];
  readonly summary: {
    readonly completedFolds: number;
    readonly totalTrades: number;
    readonly wins: number;
    readonly winRatePercent: number | null;
    readonly grossReturnPercent: number | null;
    readonly netReturnPercent: number | null;
    readonly maximumDrawdownPercent: number | null;
  };
  readonly blockers: readonly string[];
  readonly safety: {
    readonly expandingWindow: true;
    readonly outOfSampleOnly: true;
    readonly costsApplied: true;
    readonly safetyBufferApplied: true;
    readonly cointegrationVerified: false;
    readonly livePromotionAuthorized: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

export interface StatisticalRegimeEvidence {
  readonly generatedAt: number;
  readonly version: "33.0";
  readonly featureVersion: "STAT_PAIR_LOG_PRICE_V1";
  readonly pairId: string;
  readonly regime: "STABLE_CORRELATED" | "HIGH_VOLATILITY" | "CORRELATION_BREAKDOWN" | "INSUFFICIENT_DATA";
  readonly sampleCount: number;
  readonly returnCorrelation: number | null;
  readonly averageLegVolatilityPercent: number | null;
  readonly livePromotionAuthorized: false;
}

const DEFAULT_CONFIGURATION: StatisticalWalkForwardConfiguration = {
  minimumTrainingSamples: 100,
  testSamplesPerFold: 25,
  minimumFolds: 3,
  maximumFolds: 8,
  entryZScoreThreshold: 2,
  roundTripCostPercent: 0,
  safetyBufferPercent: 0.05,
  minimumTrades: 10,
  minimumNetPercent: 0,
  maximumDrawdownPercent: 10,
};

export class StatisticalWalkForwardValidationService {
  validate(
    pairId: string,
    samples: readonly StatisticalPairSample[],
    input: Partial<StatisticalWalkForwardConfiguration> = {},
    now = Date.now(),
  ): StatisticalWalkForwardReport {
    const configuration = this.getConfiguration(input);
    const ordered = normalizeSamples(samples, now);
    const blockers: string[] = [];
    const minimumRequired = configuration.minimumTrainingSamples + configuration.testSamplesPerFold;
    if (ordered.length < minimumRequired) {
      blockers.push(`Historical samples ${ordered.length}/${minimumRequired}.`);
      return report(pairId, ordered.length, ordered.length === 0 ? "NO_DATA" : "INSUFFICIENT_DATA", [], false, blockers, now);
    }

    const availableFolds = Math.min(configuration.maximumFolds,
      Math.floor((ordered.length - configuration.minimumTrainingSamples) / configuration.testSamplesPerFold));
    const folds: StatisticalWalkForwardFold[] = [];
    for (let foldIndex = 0; foldIndex < availableFolds; foldIndex += 1) {
      const testStart = configuration.minimumTrainingSamples + foldIndex * configuration.testSamplesPerFold;
      const testEnd = Math.min(ordered.length, testStart + configuration.testSamplesPerFold);
      const training = ordered.slice(0, testStart);
      const test = ordered.slice(testStart, testEnd);
      if (test.length < 2) continue;
      const model = fit(training);
      if (!model) { blockers.push(`Fold ${foldIndex + 1} training variance was insufficient.`); continue; }
      let equity = 0; let peak = 0; let maximumDrawdown = 0; let trades = 0; let wins = 0; let gross = 0; let net = 0;
      for (let index = 0; index < test.length - 1; index += 1) {
        const current = spread(test[index]!, model.beta); const next = spread(test[index + 1]!, model.beta);
        const zScore = (current - model.mean) / model.standardDeviation;
        if (!Number.isFinite(zScore) || Math.abs(zScore) < configuration.entryZScoreThreshold) continue;
        const grossTrade = -Math.sign(zScore) * (next - current) * 100;
        const netTrade = grossTrade - configuration.roundTripCostPercent - configuration.safetyBufferPercent;
        trades += 1; gross += grossTrade; net += netTrade; equity += netTrade; if (netTrade > 0) wins += 1;
        peak = Math.max(peak, equity); maximumDrawdown = Math.max(maximumDrawdown, peak - equity);
      }
      folds.push({fold: foldIndex + 1, trainingSamples: training.length, testSamples: test.length,
        trainingStartTimestamp: training[0]!.timestamp, trainingEndTimestamp: training.at(-1)!.timestamp,
        testStartTimestamp: test[0]!.timestamp, testEndTimestamp: test.at(-1)!.timestamp,
        hedgeBeta: model.beta, spreadMean: model.mean, spreadStandardDeviation: model.standardDeviation,
        trades, wins, grossReturnPercent: gross, netReturnPercent: net,
        maximumDrawdownPercent: maximumDrawdown, noLookaheadLeakage: true});
    }
    const totalTrades = sum(folds, (fold) => fold.trades);
    const totalNet = sum(folds, (fold) => fold.netReturnPercent);
    const maxDrawdown = folds.length > 0 ? Math.max(...folds.map((fold) => fold.maximumDrawdownPercent)) : 0;
    if (folds.length < configuration.minimumFolds) blockers.push(`Completed folds ${folds.length}/${configuration.minimumFolds}.`);
    if (totalTrades < configuration.minimumTrades) blockers.push(`Out-of-sample trades ${totalTrades}/${configuration.minimumTrades}.`);
    if (totalNet < configuration.minimumNetPercent) blockers.push(`Net return ${totalNet.toFixed(6)}% below ${configuration.minimumNetPercent}%.`);
    if (maxDrawdown > configuration.maximumDrawdownPercent) blockers.push(`Maximum drawdown ${maxDrawdown.toFixed(6)}% exceeds ${configuration.maximumDrawdownPercent}%.`);
    return report(pairId, ordered.length, "AVAILABLE", folds, blockers.length === 0, blockers, now);
  }

  monitorRegime(
    pairId: string,
    samples: readonly StatisticalPairSample[],
    options: {minimumSamples?: number; minimumAbsoluteCorrelation?: number; highVolatilityPercent?: number} = {},
    now = Date.now(),
  ): StatisticalRegimeEvidence {
    const minimumSamples = options.minimumSamples ?? 20;
    const minimumCorrelation = options.minimumAbsoluteCorrelation ?? 0.5;
    const highVolatility = options.highVolatilityPercent ?? 2;
    const ordered = normalizeSamples(samples, now).slice(-Math.max(minimumSamples, 60));
    if (ordered.length < minimumSamples) return deepFreeze({generatedAt: now, version: "33.0", featureVersion: "STAT_PAIR_LOG_PRICE_V1",
      pairId, regime: "INSUFFICIENT_DATA", sampleCount: ordered.length, returnCorrelation: null,
      averageLegVolatilityPercent: null, livePromotionAuthorized: false});
    const leftReturns = returns(ordered.map((sample) => Math.log(sample.leftMid)));
    const rightReturns = returns(ordered.map((sample) => Math.log(sample.rightMid)));
    const correlation = pearson(leftReturns, rightReturns);
    const volatility = (standardDeviation(leftReturns) + standardDeviation(rightReturns)) / 2 * 100;
    const regime = !Number.isFinite(correlation) || Math.abs(correlation) < minimumCorrelation
      ? "CORRELATION_BREAKDOWN" : volatility > highVolatility ? "HIGH_VOLATILITY" : "STABLE_CORRELATED";
    return deepFreeze({generatedAt: now, version: "33.0", featureVersion: "STAT_PAIR_LOG_PRICE_V1",
      pairId, regime, sampleCount: ordered.length, returnCorrelation: correlation,
      averageLegVolatilityPercent: volatility, livePromotionAuthorized: false});
  }

  getConfiguration(input: Partial<StatisticalWalkForwardConfiguration> = {}): StatisticalWalkForwardConfiguration {
    const value = {...DEFAULT_CONFIGURATION, ...input};
    for (const item of [value.minimumTrainingSamples, value.testSamplesPerFold, value.minimumFolds,
      value.maximumFolds, value.minimumTrades]) if (!Number.isSafeInteger(item) || item <= 0) throw new Error("Walk-forward count values must be positive integers.");
    for (const item of [value.entryZScoreThreshold, value.roundTripCostPercent, value.safetyBufferPercent,
      value.maximumDrawdownPercent]) if (!Number.isFinite(item) || item < 0) throw new Error("Walk-forward thresholds must be finite and non-negative.");
    if (!Number.isFinite(value.minimumNetPercent)) throw new Error("Walk-forward minimum net return must be finite.");
    return deepFreeze(value);
  }
}

function fit(samples: readonly StatisticalPairSample[]): {beta: number; mean: number; standardDeviation: number} | null {
  const left = samples.map((sample) => Math.log(sample.leftMid)); const right = samples.map((sample) => Math.log(sample.rightMid));
  const rightVariance = variance(right); if (rightVariance <= 1e-12) return null;
  const beta = covariance(left, right) / rightVariance; const spreads = samples.map((sample) => spread(sample, beta));
  const spreadDeviation = standardDeviation(spreads); return Number.isFinite(beta) && spreadDeviation > 1e-8
    ? {beta, mean: mean(spreads), standardDeviation: spreadDeviation} : null;
}
function report(pairId: string, sampleCount: number, evidenceStatus: StatisticalWalkForwardReport["evidenceStatus"], folds: readonly StatisticalWalkForwardFold[], validationPassed: boolean, blockers: readonly string[], now: number): StatisticalWalkForwardReport {
  const trades = sum(folds, (fold) => fold.trades); const wins = sum(folds, (fold) => fold.wins);
  return deepFreeze({generatedAt: now, version: "33.0", featureVersion: "STAT_PAIR_LOG_PRICE_V1", pairId,
    evidenceStatus, validationPassed, sampleCount, folds, summary: {completedFolds: folds.length, totalTrades: trades,
      wins, winRatePercent: trades > 0 ? wins / trades * 100 : null,
      grossReturnPercent: folds.length > 0 ? sum(folds, (fold) => fold.grossReturnPercent) : null,
      netReturnPercent: folds.length > 0 ? sum(folds, (fold) => fold.netReturnPercent) : null,
      maximumDrawdownPercent: folds.length > 0 ? Math.max(...folds.map((fold) => fold.maximumDrawdownPercent)) : null},
    blockers, safety: {expandingWindow: true, outOfSampleOnly: true, costsApplied: true, safetyBufferApplied: true,
      cointegrationVerified: false, livePromotionAuthorized: false, paperExecutionAllowed: false,
      liveExecutionAllowed: false, orderSubmissionAllowed: false}});
}
function normalizeSamples(samples: readonly StatisticalPairSample[], now: number): StatisticalPairSample[] { return [...samples].filter((sample) => Number.isSafeInteger(sample.timestamp) && sample.timestamp > 0 && sample.timestamp <= now && Number.isFinite(sample.leftMid) && sample.leftMid > 0 && Number.isFinite(sample.rightMid) && sample.rightMid > 0).sort((a, b) => a.timestamp - b.timestamp).filter((sample, index, values) => index === 0 || sample.timestamp > values[index - 1]!.timestamp); }
function spread(sample: StatisticalPairSample, beta: number): number { return Math.log(sample.leftMid) - beta * Math.log(sample.rightMid); }
function returns(values: readonly number[]): number[] { return values.slice(1).map((value, index) => value - values[index]!); }
function mean(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }
function variance(values: readonly number[]): number { const average = mean(values); return values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length; }
function covariance(first: readonly number[], second: readonly number[]): number { const firstMean = mean(first); const secondMean = mean(second); return first.reduce((total, value, index) => total + (value - firstMean) * (second[index]! - secondMean), 0) / first.length; }
function standardDeviation(values: readonly number[]): number { return Math.sqrt(variance(values)); }
function pearson(first: readonly number[], second: readonly number[]): number { const denominator = Math.sqrt(variance(first) * variance(second)); return denominator > 0 ? covariance(first, second) / denominator : Number.NaN; }
function sum<T>(values: readonly T[], selector: (value: T) => number): number { return values.reduce((total, value) => total + selector(value), 0); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }

export const statisticalWalkForwardValidationService = new StatisticalWalkForwardValidationService();
