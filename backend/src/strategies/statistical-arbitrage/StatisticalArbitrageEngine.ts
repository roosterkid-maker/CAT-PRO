import type {DerivativeDepthEvidence} from "../../derivatives/models/DerivativeDepthEvidence";
import type {DerivativeFeeEvidence} from "../../derivatives/models/DerivativeFeeEvidence";
import type {DerivativeMarketDataSnapshot} from "../../derivatives/models/DerivativeMarketEvidence";
import {derivativeDepthService} from "../../derivatives/services/DerivativeDepthService";
import {derivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import {vwapCalculator} from "../../orderbook/calculators/VWAPCalculator";
import type {StatisticalArbitrageSignalEvidence} from "../models/StrategySignal";
import type {StatisticalArbitrageConfiguration, StatisticalArbitragePair} from "./StatisticalArbitrageConfiguration";
import type {
  StatisticalHistoryPairIdentity,
  StatisticalHistoryStore,
  StatisticalPairSample,
} from "./StatisticalHistoricalDataService";

export type StatisticalArbitrageBlocker =
  | "MARKET_EVIDENCE_MISSING" | "MARKET_IDENTITY_MISMATCH" | "EVIDENCE_STALE"
  | "EVIDENCE_SKEW_EXCEEDED" | "HISTORY_INSUFFICIENT" | "BASELINE_VARIANCE_INSUFFICIENT"
  | "HEDGE_BETA_OUT_OF_RANGE" | "RETURN_CORRELATION_TOO_LOW" | "ZSCORE_THRESHOLD_NOT_MET"
  | "DERIVATIVE_DEPTH_MISSING" | "DERIVATIVE_FEE_EVIDENCE_MISSING" | "MARKET_RULES_INCOMPLETE"
  | "QUANTITY_INVALID" | "MAXIMUM_QUANTITY_EXCEEDED" | "DEPTH_INSUFFICIENT"
  | "MINIMUM_NOTIONAL_NOT_MET" | "MODELED_NET_THRESHOLD_NOT_MET";

export interface StatisticalArbitrageAssessment {
  readonly id: string; readonly pairId: string; readonly exchange: string;
  readonly status: "QUALIFIED" | "BLOCKED"; readonly blockers: readonly StatisticalArbitrageBlocker[];
  readonly evidence: StatisticalArbitrageSignalEvidence | null;
  readonly executionAuthorized: false; readonly automaticExecutionAllowed: false;
}

export interface StatisticalArbitrageSnapshot {
  readonly generatedAt: number; readonly sourceSnapshotGeneratedAt: number;
  readonly evaluatedPairs: number; readonly qualifiedPairs: number; readonly blockedPairs: number;
  readonly assessments: readonly StatisticalArbitrageAssessment[];
  readonly safety: {readonly baselineExcludesCurrentObservation: true; readonly cointegrationVerified: false;
    readonly meanReversionGuaranteed: false; readonly correlationImpliesCausation: false;
    readonly shadowOnly: true; readonly positionEvidenceRequiredBeforeExecution: true;
    readonly marginEvidenceRequiredBeforeExecution: true; readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false; readonly orderSubmissionAllowed: false;};
}

export interface StatisticalArbitrageDependencies {
  getDerivativeDepth(exchange: string, market: string, now: number): DerivativeDepthEvidence | null;
  getDerivativeFee(exchange: string): DerivativeFeeEvidence | null;
}

const DEFAULT_DEPENDENCIES: StatisticalArbitrageDependencies = {
  getDerivativeDepth: (exchange, market, now) => derivativeDepthService.getBook(exchange, market, now),
  getDerivativeFee: (exchange) => derivativeFeeEvidenceService.get(exchange),
};

export class StatisticalArbitrageEngine {
  private readonly dependencies: StatisticalArbitrageDependencies;
  constructor(
    dependencies: Partial<StatisticalArbitrageDependencies> = {},
    private readonly historyStore: StatisticalHistoryStore = new InMemoryStatisticalHistoryStore(),
  ) { this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies}; }

  evaluate(snapshot: DerivativeMarketDataSnapshot, configuration: StatisticalArbitrageConfiguration, now = Date.now()): StatisticalArbitrageSnapshot {
    const assessments = configuration.enabled
      ? configuration.pairs.map((pair) => this.evaluatePair(pair, snapshot, configuration, now))
      : [];
    return immutableClone({generatedAt: now, sourceSnapshotGeneratedAt: snapshot.generatedAt,
      evaluatedPairs: assessments.length, qualifiedPairs: assessments.filter((item) => item.status === "QUALIFIED").length,
      blockedPairs: assessments.filter((item) => item.status === "BLOCKED").length, assessments,
      safety: {baselineExcludesCurrentObservation: true, cointegrationVerified: false, meanReversionGuaranteed: false,
        correlationImpliesCausation: false, shadowOnly: true, positionEvidenceRequiredBeforeExecution: true,
        marginEvidenceRequiredBeforeExecution: true, paperExecutionAllowed: false, liveExecutionAllowed: false,
        orderSubmissionAllowed: false}});
  }

  private evaluatePair(pair: StatisticalArbitragePair, snapshot: DerivativeMarketDataSnapshot, configuration: StatisticalArbitrageConfiguration, now: number): StatisticalArbitrageAssessment {
    const blockers = new Set<StatisticalArbitrageBlocker>();
    const left = snapshot.markets.find((market) => market.exchange === pair.exchange && market.market === pair.leftMarket);
    const right = snapshot.markets.find((market) => market.exchange === pair.exchange && market.market === pair.rightMarket);
    if (!left || !right) { blockers.add("MARKET_EVIDENCE_MISSING"); return this.blocked(pair, blockers, snapshot.generatedAt); }
    if (left.exchange !== right.exchange || left.quoteAsset !== right.quoteAsset || left.settleAsset !== right.settleAsset) blockers.add("MARKET_IDENTITY_MISMATCH");
    const evidenceTimes = [left.sourceTimestamp, right.sourceTimestamp, snapshot.generatedAt];
    if (evidenceTimes.some((timestamp) => timestamp <= 0 || timestamp > now || now - timestamp > configuration.maximumEvidenceAgeMs)) blockers.add("EVIDENCE_STALE");
    if (Math.max(...evidenceTimes) - Math.min(...evidenceTimes) > configuration.maximumEvidenceSkewMs) blockers.add("EVIDENCE_SKEW_EXCEEDED");
    const leftMid = (left.bidPrice + left.askPrice) / 2; const rightMid = (right.bidPrice + right.askPrice) / 2;
    if (!positive(leftMid) || !positive(rightMid)) blockers.add("MARKET_EVIDENCE_MISSING");
    if (blockers.size > 0) return this.blocked(pair, blockers, snapshot.generatedAt);

    this.historyStore.record(pair, {
      timestamp: Math.min(left.sourceTimestamp, right.sourceTimestamp),
      leftMid,
      rightMid,
    }, now);
    const history = this.historyStore.getHistory(pair.pairId, configuration.maximumSamples, now);
    const baseline = history.slice(0, -1);
    if (baseline.length < configuration.minimumBaselineSamples) {
      blockers.add("HISTORY_INSUFFICIENT"); return this.blocked(pair, blockers, snapshot.generatedAt);
    }
    const leftLogs = baseline.map((sample) => Math.log(sample.leftMid));
    const rightLogs = baseline.map((sample) => Math.log(sample.rightMid));
    const beta = covariance(leftLogs, rightLogs) / variance(rightLogs);
    if (!Number.isFinite(beta)) blockers.add("BASELINE_VARIANCE_INSUFFICIENT");
    if (!Number.isFinite(beta) || beta < configuration.minimumHedgeBeta || beta > configuration.maximumHedgeBeta) blockers.add("HEDGE_BETA_OUT_OF_RANGE");
    if (blockers.size > 0) return this.blocked(pair, blockers, snapshot.generatedAt);

    const baselineSpreads = baseline.map((sample) => Math.log(sample.leftMid) - beta * Math.log(sample.rightMid));
    const spreadMean = mean(baselineSpreads); const spreadStandardDeviation = standardDeviation(baselineSpreads);
    if (!Number.isFinite(spreadStandardDeviation) || spreadStandardDeviation <= 1e-8) {
      blockers.add("BASELINE_VARIANCE_INSUFFICIENT"); return this.blocked(pair, blockers, snapshot.generatedAt);
    }
    const correlation = pearson(logReturns(leftLogs), logReturns(rightLogs));
    if (!Number.isFinite(correlation) || Math.abs(correlation) < configuration.minimumAbsoluteReturnCorrelation) blockers.add("RETURN_CORRELATION_TOO_LOW");
    const currentSpread = Math.log(leftMid) - beta * Math.log(rightMid);
    const zScore = (currentSpread - spreadMean) / spreadStandardDeviation;
    if (!Number.isFinite(zScore) || Math.abs(zScore) < configuration.entryZScoreThreshold) blockers.add("ZSCORE_THRESHOLD_NOT_MET");
    if (blockers.size > 0) return this.blocked(pair, blockers, snapshot.generatedAt);

    const direction = zScore > 0 ? "SHORT_LEFT_LONG_RIGHT" : "LONG_LEFT_SHORT_RIGHT";
    const longMarketEvidence = direction === "SHORT_LEFT_LONG_RIGHT" ? right : left;
    const shortMarketEvidence = direction === "SHORT_LEFT_LONG_RIGHT" ? left : right;
    const longDepth = this.dependencies.getDerivativeDepth(pair.exchange, longMarketEvidence.market, now);
    const shortDepth = this.dependencies.getDerivativeDepth(pair.exchange, shortMarketEvidence.market, now);
    const fee = this.dependencies.getDerivativeFee(pair.exchange);
    if (!longDepth || !shortDepth) blockers.add("DERIVATIVE_DEPTH_MISSING");
    if (!fee) blockers.add("DERIVATIVE_FEE_EVIDENCE_MISSING");
    if (!longDepth || !shortDepth || !fee) return this.blocked(pair, blockers, snapshot.generatedAt);

    for (const market of [left, right]) {
      if (!positive(market.rules.quantityStep) || !positive(market.rules.minimumQuantity) || !positive(market.rules.minimumNotional)) blockers.add("MARKET_RULES_INCOMPLETE");
    }
    if (blockers.size > 0) return this.blocked(pair, blockers, snapshot.generatedAt);
    const leftDesired = configuration.targetQuoteNotional;
    const rightDesired = configuration.targetQuoteNotional * Math.abs(beta);
    const desiredLong = longMarketEvidence === left ? leftDesired : rightDesired;
    const desiredShort = shortMarketEvidence === left ? leftDesired : rightDesired;
    const longBestAsk = longDepth.asks[0]?.price ?? 0; const shortBestBid = shortDepth.bids[0]?.price ?? 0;
    let longQuantity = roundDown(desiredLong / longBestAsk, longMarketEvidence.rules.quantityStep);
    let shortQuantity = roundDown(desiredShort / shortBestBid, shortMarketEvidence.rules.quantityStep);
    if (!positive(longQuantity) || !positive(shortQuantity) || longQuantity < longMarketEvidence.rules.minimumQuantity || shortQuantity < shortMarketEvidence.rules.minimumQuantity) blockers.add("QUANTITY_INVALID");
    if (longQuantity > longMarketEvidence.rules.maximumMarketQuantity || shortQuantity > shortMarketEvidence.rules.maximumMarketQuantity) blockers.add("MAXIMUM_QUANTITY_EXCEEDED");
    if (blockers.size > 0) return this.blocked(pair, blockers, snapshot.generatedAt);
    const longFill = vwapCalculator.calculate(longDepth.asks, longQuantity);
    const shortFill = vwapCalculator.calculate(shortDepth.bids, shortQuantity);
    if (longFill.partialFill || shortFill.partialFill || longFill.filledQuantity < longQuantity || shortFill.filledQuantity < shortQuantity) {
      blockers.add("DEPTH_INSUFFICIENT"); return this.blocked(pair, blockers, snapshot.generatedAt);
    }
    const longNotional = longFill.totalCost; const shortNotional = shortFill.totalCost;
    if (longNotional < longMarketEvidence.rules.minimumNotional || shortNotional < shortMarketEvidence.rules.minimumNotional) {
      blockers.add("MINIMUM_NOTIONAL_NOT_MET"); return this.blocked(pair, blockers, snapshot.generatedAt);
    }
    const referenceNotional = (longNotional + shortNotional) / 2;
    const modeledGrossReversionQuote = referenceNotional * Math.abs(currentSpread - spreadMean);
    const roundTripFeeQuote = (longNotional + shortNotional) * fee.takerPercent / 100 * 2;
    const adverseFundingReserveQuote = longNotional * Math.abs(longMarketEvidence.fundingRate) + shortNotional * Math.abs(shortMarketEvidence.fundingRate);
    const safetyBufferQuote = referenceNotional * configuration.safetyBufferPercent / 100;
    const modeledNetQuote = modeledGrossReversionQuote - roundTripFeeQuote - adverseFundingReserveQuote - safetyBufferQuote;
    const modeledNetPercent = modeledNetQuote / referenceNotional * 100;
    if (!Number.isFinite(modeledNetPercent) || modeledNetPercent < configuration.minimumModeledNetPercent) {
      blockers.add("MODELED_NET_THRESHOLD_NOT_MET"); return this.blocked(pair, blockers, snapshot.generatedAt);
    }

    const evidence: StatisticalArbitrageSignalEvidence = {
      pairId: pair.pairId, exchange: pair.exchange, leftMarket: pair.leftMarket, rightMarket: pair.rightMarket,
      direction, baselineSampleCount: baseline.length, baselineExcludesCurrentObservation: true, hedgeBeta: beta,
      returnCorrelation: correlation, currentSpread, baselineSpreadMean: spreadMean,
      baselineSpreadStandardDeviation: spreadStandardDeviation, zScore, entryZScoreThreshold: configuration.entryZScoreThreshold,
      nextFundingTimeLong: longMarketEvidence.nextFundingTime,
      nextFundingTimeShort: shortMarketEvidence.nextFundingTime,
      longMarket: longMarketEvidence.market, shortMarket: shortMarketEvidence.market, longQuantity, shortQuantity,
      longEntryVwap: longFill.averagePrice, shortEntryVwap: shortFill.averagePrice,
      modeledGrossReversionQuote, roundTripFeeQuote, adverseFundingReserveQuote, safetyBufferQuote,
      modeledNetQuote, modeledNetPercent, modeledReversionGuaranteed: false, cointegrationVerified: false,
      correlationImpliesCausation: false, fullDepthApplied: true, marketRulesApplied: true,
      explicitFeesApplied: true, executionReadinessBlockers: ["POSITION_EVIDENCE_MISSING", "MARGIN_EVIDENCE_MISSING",
        "LIQUIDATION_CONTROL_MISSING", "REDUCE_ONLY_UNVERIFIED", "DERIVATIVE_ADAPTER_MISSING"],
    };
    return immutableClone({id: `${pair.pairId}:${snapshot.generatedAt}`, pairId: pair.pairId, exchange: pair.exchange,
      status: "QUALIFIED", blockers: [], evidence, executionAuthorized: false, automaticExecutionAllowed: false});
  }

  private blocked(pair: StatisticalArbitragePair, blockers: ReadonlySet<StatisticalArbitrageBlocker>, timestamp: number): StatisticalArbitrageAssessment {
    return immutableClone({id: `${pair.pairId}:${timestamp}`, pairId: pair.pairId, exchange: pair.exchange,
      status: "BLOCKED", blockers: [...blockers], evidence: null, executionAuthorized: false, automaticExecutionAllowed: false});
  }
}

class InMemoryStatisticalHistoryStore implements StatisticalHistoryStore {
  private readonly histories = new Map<string, StatisticalPairSample[]>();

  record(pair: StatisticalHistoryPairIdentity, sample: StatisticalPairSample): void {
    const history = this.histories.get(pair.pairId) ?? [];
    if ((history.at(-1)?.timestamp ?? 0) >= sample.timestamp) return;
    history.push(structuredClone(sample));
    this.histories.set(pair.pairId, history);
  }

  getHistory(pairId: string, limit: number, throughInclusive = Date.now()): readonly StatisticalPairSample[] {
    return (this.histories.get(pairId) ?? []).filter((sample) => sample.timestamp <= throughInclusive)
      .slice(-limit).map((sample) => structuredClone(sample));
  }
}

function mean(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function variance(values: readonly number[]): number { const average = mean(values); return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length; }
function covariance(first: readonly number[], second: readonly number[]): number { const firstMean = mean(first); const secondMean = mean(second); return first.reduce((sum, value, index) => sum + (value - firstMean) * ((second[index] ?? secondMean) - secondMean), 0) / first.length; }
function standardDeviation(values: readonly number[]): number { return Math.sqrt(variance(values)); }
function logReturns(logValues: readonly number[]): number[] { return logValues.slice(1).map((value, index) => value - (logValues[index] ?? value)); }
function pearson(first: readonly number[], second: readonly number[]): number { const denominator = Math.sqrt(variance(first) * variance(second)); return denominator > 0 ? covariance(first, second) / denominator : Number.NaN; }
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function roundDown(value: number, step: number): number { return Math.floor((value + Number.EPSILON) / step) * step; }
function immutableClone<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }
