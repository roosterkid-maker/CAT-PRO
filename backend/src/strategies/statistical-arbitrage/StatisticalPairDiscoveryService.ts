import type {DerivativeFeeEvidence} from "../../derivatives/models/DerivativeFeeEvidence";
import type {DerivativeMarketDataSnapshot, DerivativeMarketEvidence} from "../../derivatives/models/DerivativeMarketEvidence";
import {derivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import type {StatisticalArbitragePair} from "./StatisticalArbitrageConfiguration";
import {
  statisticalHistoricalDataService,
  type StatisticalHistoryPairIdentity,
  type StatisticalHistoryStore,
} from "./StatisticalHistoricalDataService";
import {
  statisticalWalkForwardValidationService,
  type StatisticalRegimeEvidence,
  type StatisticalWalkForwardConfiguration,
  type StatisticalWalkForwardReport,
  type StatisticalWalkForwardValidationService,
} from "./StatisticalWalkForwardValidationService";
import {
  statisticalPromotionLifecycleService,
  type StatisticalPromotionLifecycleEvidence,
  type StatisticalPromotionLifecycleInput,
} from "./StatisticalPromotionLifecycleService";

export interface StatisticalPairDiscoveryConfiguration {
  readonly maximumMarketsPerExchange: number;
  readonly maximumCandidatePairs: number;
  readonly maximumSelectedPairs: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumEvidenceSkewMs: number;
  readonly minimumRegimeSamples: number;
  readonly minimumAbsoluteRegimeCorrelation: number;
  readonly highVolatilityPercent: number;
  readonly walkForward: Partial<StatisticalWalkForwardConfiguration>;
}

export interface StatisticalPairResearchCandidate extends StatisticalArbitragePair {
  readonly state: "PROMOTED" | "COLLECTING_HISTORY" | "REJECTED";
  readonly qualificationState: "PROMOTED" | "COLLECTING_HISTORY" | "REJECTED";
  readonly lifecycle: StatisticalPromotionLifecycleEvidence;
  readonly seeded: boolean;
  readonly liquidityFloorQuote: number;
  readonly sampleCount: number;
  readonly returnCorrelation: number | null;
  readonly walkForwardPassed: boolean;
  readonly regimeAdmitted: boolean;
  readonly outOfSampleTrades: number;
  readonly outOfSampleNetPercent: number | null;
  readonly maximumDrawdownPercent: number | null;
  readonly rankScore: number;
  readonly blockers: readonly string[];
  readonly walkForward: StatisticalWalkForwardReport;
  readonly regime: StatisticalRegimeEvidence;
}

export interface StatisticalPairDiscoverySnapshot {
  readonly generatedAt: number;
  readonly sourceSnapshotGeneratedAt: number;
  readonly version: "35.0";
  readonly eligibleMarkets: number;
  readonly candidatePairs: number;
  readonly promotedPairs: number;
  readonly collectingPairs: number;
  readonly rejectedPairs: number;
  readonly requirements: {
    readonly maximumMarketsPerExchange: number;
    readonly maximumCandidatePairs: number;
    readonly maximumSelectedPairs: number;
    readonly minimumRegimeSamples: number;
    readonly minimumAbsoluteRegimeCorrelation: number;
    readonly highVolatilityPercent: number;
    readonly minimumTrainingSamples: number;
    readonly testSamplesPerFold: number;
    readonly minimumFolds: number;
    readonly minimumSamplesForFirstFold: number;
    readonly minimumSamplesForRequiredFolds: number;
    readonly minimumOutOfSampleTrades: number;
    readonly minimumNetPercent: number;
    readonly maximumDrawdownPercent: number;
  };
  readonly selectedPairs: readonly StatisticalArbitragePair[];
  readonly signalEligiblePairs: readonly StatisticalArbitragePair[];
  readonly rankings: readonly StatisticalPairResearchCandidate[];
  readonly safety: {
    readonly boundedUniverse: true;
    readonly sameExchangeOnly: true;
    readonly sameSettlementAssetOnly: true;
    readonly stickyCandidateUniverse: true;
    readonly futureEvidenceRejected: true;
    readonly explicitCostsRequired: true;
    readonly promotionHysteresisRequired: true;
    readonly demotionBlocksSignalsImmediately: true;
    readonly lifecyclePersistent: true;
    readonly signalsRequireConfirmedPromotion: true;
    readonly thresholdsRelaxed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}

interface DiscoveryHistoryStore extends StatisticalHistoryStore {
  getPairs(): readonly StatisticalHistoryPairIdentity[];
  registerPairs(pairs: readonly StatisticalHistoryPairIdentity[]): {readonly registered: number; readonly retained: number};
  synchronizePairs(pairs: readonly StatisticalHistoryPairIdentity[]): {
    readonly registered: number; readonly evicted: number; readonly retained: number;
  };
}

export interface StatisticalPairDiscoveryDependencies {
  readonly history: DiscoveryHistoryStore;
  readonly validation: StatisticalWalkForwardValidationService;
  readonly promotionLifecycle: {
    reconcile(inputs: readonly StatisticalPromotionLifecycleInput[], now?: number):
      ReadonlyMap<string, StatisticalPromotionLifecycleEvidence>;
  };
  getFee(exchange: string): DerivativeFeeEvidence | null;
}

const DEFAULT_CONFIGURATION: StatisticalPairDiscoveryConfiguration = {
  maximumMarketsPerExchange: 8,
  maximumCandidatePairs: 40,
  maximumSelectedPairs: 10,
  maximumEvidenceAgeMs: 15_000,
  maximumEvidenceSkewMs: 2_500,
  minimumRegimeSamples: 20,
  minimumAbsoluteRegimeCorrelation: 0.5,
  highVolatilityPercent: 2,
  walkForward: {},
};

const DEFAULT_DEPENDENCIES: StatisticalPairDiscoveryDependencies = {
  history: statisticalHistoricalDataService,
  validation: statisticalWalkForwardValidationService,
  promotionLifecycle: statisticalPromotionLifecycleService,
  getFee: (exchange) => derivativeFeeEvidenceService.get(exchange),
};

export class StatisticalPairDiscoveryService {
  private readonly configuration: StatisticalPairDiscoveryConfiguration;
  private readonly dependencies: StatisticalPairDiscoveryDependencies;
  private readonly activeCandidates = new Map<string, DiscoveryCandidate>();
  private latest: StatisticalPairDiscoverySnapshot | null = null;

  constructor(
    configuration: Partial<StatisticalPairDiscoveryConfiguration> = {},
    dependencies: Partial<StatisticalPairDiscoveryDependencies> = {},
  ) {
    this.configuration = {...DEFAULT_CONFIGURATION, ...configuration,
      walkForward: {...DEFAULT_CONFIGURATION.walkForward, ...configuration.walkForward}};
    this.dependencies = {...DEFAULT_DEPENDENCIES, ...dependencies};
    for (const value of [this.configuration.maximumMarketsPerExchange, this.configuration.maximumCandidatePairs,
      this.configuration.maximumSelectedPairs, this.configuration.maximumEvidenceAgeMs,
      this.configuration.maximumEvidenceSkewMs, this.configuration.minimumRegimeSamples]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Statistical discovery count/timing values must be positive integers.");
    }
    if (this.configuration.maximumSelectedPairs > this.configuration.maximumCandidatePairs) {
      throw new Error("Statistical discovery selected-pair cap cannot exceed candidate-pair cap.");
    }
    for (const value of [this.configuration.minimumAbsoluteRegimeCorrelation, this.configuration.highVolatilityPercent]) {
      if (!Number.isFinite(value) || value < 0) throw new Error("Statistical discovery regime thresholds must be finite and non-negative.");
    }
  }

  evaluate(
    snapshot: DerivativeMarketDataSnapshot,
    requiredPairs: readonly StatisticalArbitragePair[] = [],
    now = Date.now(),
  ): StatisticalPairDiscoverySnapshot {
    if (!Number.isSafeInteger(now) || now <= 0 || snapshot.generatedAt > now) {
      throw new Error("Statistical discovery requires a current positive observation time.");
    }
    const eligible = snapshot.markets.filter((market) => this.isEligible(market, snapshot.generatedAt, now));
    const eligibleByKey = new Map(eligible.map((market) => [marketKey(market.exchange, market.market), market]));
    const seedsByEconomicKey = new Map(requiredPairs.map((pair) => [economicKey(pair), pair]));
    const candidates = new Map<string, DiscoveryCandidate>();

    for (const pair of requiredPairs) {
      const left = eligibleByKey.get(marketKey(pair.exchange, pair.leftMarket));
      const right = eligibleByKey.get(marketKey(pair.exchange, pair.rightMarket));
      if (left && right && compatible(left, right)) this.addCandidate(candidates, pair, true, left, right);
    }

    const groups = groupMarkets(eligible);
    for (const markets of groups.values()) {
      const bounded = [...markets].sort((first, second) => liquidity(second) - liquidity(first) || first.market.localeCompare(second.market))
        .slice(0, this.configuration.maximumMarketsPerExchange);
      for (let leftIndex = 0; leftIndex < bounded.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < bounded.length; rightIndex += 1) {
          const first = bounded[leftIndex]!; const second = bounded[rightIndex]!;
          const [left, right] = first.market.localeCompare(second.market) <= 0 ? [first, second] : [second, first];
          const fallback: StatisticalArbitragePair = {pairId: `${left.exchange}:${left.market}:${right.market}`,
            exchange: left.exchange, leftMarket: left.market, rightMarket: right.market};
          const pair = seedsByEconomicKey.get(economicKey(fallback)) ?? fallback;
          this.addCandidate(candidates, pair, seedsByEconomicKey.has(economicKey(fallback)), left, right);
        }
      }
    }

    const retained = new Map<string, DiscoveryCandidate>();
    const activeUniverse = this.activeCandidates.size > 0
      ? [...this.activeCandidates.values()]
      : this.dependencies.history.getPairs().map((pair) => ({pair, seeded: seedsByEconomicKey.has(economicKey(pair)),
          retained: true, liquidityFloorQuote: 0}));
    for (const candidate of activeUniverse) {
      const key = economicKey(candidate.pair);
      const left = eligibleByKey.get(marketKey(candidate.pair.exchange, candidate.pair.leftMarket));
      const right = eligibleByKey.get(marketKey(candidate.pair.exchange, candidate.pair.rightMarket));
      if (!left || !right || !compatible(left, right)) continue;
      const seed = seedsByEconomicKey.get(key);
      this.addCandidate(retained, seed ?? candidate.pair, Boolean(seed) || candidate.seeded, left, right, true);
    }
    for (const candidate of candidates.values()) {
      const key = economicKey(candidate.pair);
      const current = retained.get(key);
      if (!current || (candidate.seeded && !current.seeded)) retained.set(key, candidate);
    }

    const boundedCandidates = takeVenueDiversified([...retained.values()]
      .sort((first, second) => Number(second.seeded) - Number(first.seeded) ||
        Number(second.retained) - Number(first.retained) ||
        second.liquidityFloorQuote - first.liquidityFloorQuote || first.pair.pairId.localeCompare(second.pair.pairId)),
    this.configuration.maximumCandidatePairs, (item) => item.pair.exchange);
    this.activeCandidates.clear();
    for (const candidate of boundedCandidates) this.activeCandidates.set(economicKey(candidate.pair), structuredClone(candidate));
    if (boundedCandidates.length > 0) {
      this.dependencies.history.synchronizePairs(boundedCandidates.map((item) => item.pair));
    }
    for (const candidate of boundedCandidates) {
      const left = eligibleByKey.get(marketKey(candidate.pair.exchange, candidate.pair.leftMarket))!;
      const right = eligibleByKey.get(marketKey(candidate.pair.exchange, candidate.pair.rightMarket))!;
      this.dependencies.history.record(candidate.pair, {timestamp: Math.min(left.sourceTimestamp, right.sourceTimestamp),
        leftMid: midpoint(left), rightMid: midpoint(right)}, now);
    }

    const qualifications = boundedCandidates.map((candidate) => this.rank(candidate, now));
    const lifecycle = this.dependencies.promotionLifecycle.reconcile(qualifications.map((candidate) => ({
      pairId: candidate.pairId, exchange: candidate.exchange, leftMarket: candidate.leftMarket,
      rightMarket: candidate.rightMarket, qualificationState: candidate.state, blockers: candidate.blockers,
    })), now);
    const rankings: StatisticalPairResearchCandidate[] = qualifications.map((candidate) => {
      const evidence = lifecycle.get(candidate.pairId);
      if (!evidence) throw new Error(`Statistical promotion lifecycle evidence missing for ${candidate.pairId}.`);
      return freeze({...candidate, qualificationState: candidate.state, state: evidence.publishedState,
        blockers: evidence.blockers, lifecycle: evidence});
    })
      .sort((first, second) => stateRank(first.state) - stateRank(second.state) ||
        second.rankScore - first.rankScore || second.sampleCount - first.sampleCount || first.pairId.localeCompare(second.pairId));
    const selectedRankings = (["PROMOTED", "COLLECTING_HISTORY", "REJECTED"] as const).flatMap((state) =>
      takeVenueDiversified(rankings.filter((item) => item.state === state), this.configuration.maximumSelectedPairs,
        (item) => item.exchange));
    const selectedPairs = selectedRankings.slice(0, this.configuration.maximumSelectedPairs)
      .map(({pairId, exchange, leftMarket, rightMarket}) => ({pairId, exchange, leftMarket, rightMarket}));
    const signalEligiblePairs = selectedRankings.filter((candidate) => candidate.lifecycle.signalEligible)
      .slice(0, this.configuration.maximumSelectedPairs)
      .map(({pairId, exchange, leftMarket, rightMarket}) => ({pairId, exchange, leftMarket, rightMarket}));
    const walkForwardRequirements = this.dependencies.validation.getConfiguration(this.configuration.walkForward);
    this.latest = freeze({generatedAt: now, sourceSnapshotGeneratedAt: snapshot.generatedAt, version: "35.0",
      eligibleMarkets: eligible.length, candidatePairs: rankings.length,
      promotedPairs: rankings.filter((item) => item.state === "PROMOTED").length,
      collectingPairs: rankings.filter((item) => item.state === "COLLECTING_HISTORY").length,
      rejectedPairs: rankings.filter((item) => item.state === "REJECTED").length,
      requirements: {maximumMarketsPerExchange: this.configuration.maximumMarketsPerExchange,
        maximumCandidatePairs: this.configuration.maximumCandidatePairs,
        maximumSelectedPairs: this.configuration.maximumSelectedPairs,
        minimumRegimeSamples: this.configuration.minimumRegimeSamples,
        minimumAbsoluteRegimeCorrelation: this.configuration.minimumAbsoluteRegimeCorrelation,
        highVolatilityPercent: this.configuration.highVolatilityPercent,
        minimumTrainingSamples: walkForwardRequirements.minimumTrainingSamples,
        testSamplesPerFold: walkForwardRequirements.testSamplesPerFold,
        minimumFolds: walkForwardRequirements.minimumFolds,
        minimumSamplesForFirstFold: walkForwardRequirements.minimumTrainingSamples + walkForwardRequirements.testSamplesPerFold,
        minimumSamplesForRequiredFolds: walkForwardRequirements.minimumTrainingSamples +
          walkForwardRequirements.testSamplesPerFold * walkForwardRequirements.minimumFolds,
        minimumOutOfSampleTrades: walkForwardRequirements.minimumTrades,
        minimumNetPercent: walkForwardRequirements.minimumNetPercent,
        maximumDrawdownPercent: walkForwardRequirements.maximumDrawdownPercent},
      selectedPairs, signalEligiblePairs, rankings,
      safety: {boundedUniverse: true, sameExchangeOnly: true, sameSettlementAssetOnly: true,
        stickyCandidateUniverse: true,
        futureEvidenceRejected: true, explicitCostsRequired: true, thresholdsRelaxed: false,
        promotionHysteresisRequired: true, demotionBlocksSignalsImmediately: true,
        lifecyclePersistent: true, signalsRequireConfirmedPromotion: true,
        paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
    return this.getSnapshot()!;
  }

  getSnapshot(): StatisticalPairDiscoverySnapshot | null {
    return this.latest ? freeze(structuredClone(this.latest)) : null;
  }

  private rank(
    candidate: DiscoveryCandidate,
    now: number,
  ): Omit<StatisticalPairResearchCandidate, "qualificationState" | "lifecycle"> {
    const history = this.dependencies.history.getHistory(candidate.pair.pairId, 5_000, now);
    const fee = this.dependencies.getFee(candidate.pair.exchange);
    const walkForward = this.dependencies.validation.validate(candidate.pair.pairId, history,
      {...this.configuration.walkForward, roundTripCostPercent: fee ? fee.takerPercent * 4 : 0}, now);
    const regime = this.dependencies.validation.monitorRegime(candidate.pair.pairId, history, {
      minimumSamples: this.configuration.minimumRegimeSamples,
      minimumAbsoluteCorrelation: this.configuration.minimumAbsoluteRegimeCorrelation,
      highVolatilityPercent: this.configuration.highVolatilityPercent,
    }, now);
    const walkForwardPassed = Boolean(fee && walkForward.validationPassed);
    const regimeAdmitted = regime.regime === "STABLE_CORRELATED";
    const blockers = [...(!fee ? ["EXPLICIT_DERIVATIVE_FEE_EVIDENCE_MISSING"] : []),
      ...walkForward.blockers, ...(regimeAdmitted ? [] : [`REGIME_${regime.regime}`])];
    const state: StatisticalPairResearchCandidate["state"] = walkForwardPassed && regimeAdmitted
      ? "PROMOTED" : walkForward.evidenceStatus === "AVAILABLE" && regime.regime !== "INSUFFICIENT_DATA"
        ? "REJECTED" : "COLLECTING_HISTORY";
    const correlationScore = Math.min(40, Math.abs(regime.returnCorrelation ?? 0) * 40);
    const rankScore = normalize(correlationScore + (regimeAdmitted ? 20 : 0) + (walkForwardPassed ? 30 : 0) +
      Math.min(10, Math.max(0, walkForward.summary.netReturnPercent ?? 0)));
    return freeze({...candidate.pair, state, seeded: candidate.seeded,
      liquidityFloorQuote: normalize(candidate.liquidityFloorQuote), sampleCount: history.length,
      returnCorrelation: regime.returnCorrelation, walkForwardPassed, regimeAdmitted,
      outOfSampleTrades: walkForward.summary.totalTrades,
      outOfSampleNetPercent: walkForward.summary.netReturnPercent,
      maximumDrawdownPercent: walkForward.summary.maximumDrawdownPercent,
      rankScore, blockers: [...new Set(blockers)], walkForward, regime});
  }

  private addCandidate(
    target: Map<string, DiscoveryCandidate>,
    pair: StatisticalArbitragePair,
    seeded: boolean,
    left: DerivativeMarketEvidence,
    right: DerivativeMarketEvidence,
    retained = false,
  ): void {
    const key = economicKey(pair);
    const current = target.get(key);
    if (!current || (seeded && !current.seeded)) target.set(key, {pair: structuredClone(pair), seeded, retained,
      liquidityFloorQuote: Math.min(liquidity(left), liquidity(right))});
  }

  private isEligible(market: DerivativeMarketEvidence, snapshotGeneratedAt: number, now: number): boolean {
    const times = [market.sourceTimestamp, market.observedAt, snapshotGeneratedAt];
    return market.product === "LINEAR_PERPETUAL" && market.tradingEnabled && market.quoteAsset === market.settleAsset &&
      positive(midpoint(market)) && positive(market.bidQuantity) && positive(market.askQuantity) &&
      times.every((timestamp) => Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= now &&
        now - timestamp <= this.configuration.maximumEvidenceAgeMs) &&
      Math.max(...times) - Math.min(...times) <= this.configuration.maximumEvidenceSkewMs;
  }
}

interface DiscoveryCandidate {
  readonly pair: StatisticalArbitragePair;
  readonly seeded: boolean;
  readonly retained: boolean;
  readonly liquidityFloorQuote: number;
}

function groupMarkets(markets: readonly DerivativeMarketEvidence[]): Map<string, DerivativeMarketEvidence[]> {
  const groups = new Map<string, DerivativeMarketEvidence[]>();
  for (const market of markets) {
    const key = `${market.exchange}:${market.quoteAsset}:${market.settleAsset}`;
    const values = groups.get(key) ?? []; values.push(market); groups.set(key, values);
  }
  return groups;
}
function compatible(left: DerivativeMarketEvidence, right: DerivativeMarketEvidence): boolean {
  return left.exchange === right.exchange && left.quoteAsset === right.quoteAsset && left.settleAsset === right.settleAsset && left.market !== right.market;
}
function economicKey(pair: StatisticalArbitragePair): string { return `${pair.exchange}:${[pair.leftMarket, pair.rightMarket].sort().join(":")}`; }
function marketKey(exchange: string, market: string): string { return `${exchange.toLowerCase()}:${market.toUpperCase()}`; }
function midpoint(market: DerivativeMarketEvidence): number { return (market.bidPrice + market.askPrice) / 2; }
function liquidity(market: DerivativeMarketEvidence): number { return Math.min(market.bidPrice * market.bidQuantity, market.askPrice * market.askQuantity); }
function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function stateRank(state: StatisticalPairResearchCandidate["state"]): number { return state === "PROMOTED" ? 0 : state === "COLLECTING_HISTORY" ? 1 : 2; }
function takeVenueDiversified<T>(values: readonly T[], limit: number, venue: (value: T) => string): T[] {
  const queues = new Map<string, T[]>();
  for (const value of values) { const key = venue(value); const queue = queues.get(key) ?? []; queue.push(value); queues.set(key, queue); }
  const result: T[] = []; const venues = [...queues.keys()].sort();
  while (result.length < limit && venues.some((key) => (queues.get(key)?.length ?? 0) > 0)) {
    for (const key of venues) { const value = queues.get(key)?.shift(); if (value) result.push(value); if (result.length >= limit) break; }
  }
  return result;
}
function normalize(value: number): number { return Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const statisticalPairDiscoveryService = new StatisticalPairDiscoveryService();
