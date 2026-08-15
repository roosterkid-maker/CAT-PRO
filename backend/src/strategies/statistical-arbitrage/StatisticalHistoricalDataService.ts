import {resolve} from "node:path";
import {
  JsonlRotatingWriter,
  readLatestValidJsonlAcrossArchives,
} from "../../core/persistence/JsonlArchiveStore";
import type {DerivativeMarketDataSnapshot} from "../../derivatives/models/DerivativeMarketEvidence";
import {
  derivativeMarketDataService,
  type DerivativeMarketDataSnapshotListener,
} from "../../derivatives/services/DerivativeMarketDataService";

export interface StatisticalPairSample {
  readonly timestamp: number;
  readonly leftMid: number;
  readonly rightMid: number;
}

export interface StatisticalHistoryPairIdentity {
  readonly pairId: string;
  readonly exchange: string;
  readonly leftMarket: string;
  readonly rightMarket: string;
}

export interface StatisticalHistoryStore {
  record(pair: StatisticalHistoryPairIdentity, sample: StatisticalPairSample, now?: number): void;
  getHistory(pairId: string, limit: number, throughInclusive?: number): readonly StatisticalPairSample[];
}

interface PersistedPairHistory {
  readonly pair: StatisticalHistoryPairIdentity;
  readonly samples: readonly StatisticalPairSample[];
}

interface PersistedStatisticalHistorySnapshot {
  readonly version: "32.0";
  readonly featureVersion: "STAT_PAIR_LOG_PRICE_V1";
  readonly generatedAt: number;
  readonly pairs: readonly PersistedPairHistory[];
}

export interface StatisticalHistoricalDataConfiguration {
  readonly pairs: readonly StatisticalHistoryPairIdentity[];
  readonly maximumTrackedPairs: number;
  readonly maximumSamplesPerPair: number;
  readonly maximumEvidenceAgeMs: number;
  readonly maximumEvidenceSkewMs: number;
  readonly minimumPersistenceIntervalMs: number;
  readonly rotationMaximumFileBytes: number;
  readonly rotationMaximumRecords: number;
  readonly maximumArchives: number;
}

const DEFAULT_FILE = resolve(process.cwd(), "logs", "statistical-arbitrage", "historical-pairs.jsonl");
const DEFAULT_PAIRS: readonly StatisticalHistoryPairIdentity[] = [
  {pairId: "binance:BTCUSDT:ETHUSDT", exchange: "binance", leftMarket: "BTCUSDT", rightMarket: "ETHUSDT"},
  {pairId: "bybit:BTCUSDT:ETHUSDT", exchange: "bybit", leftMarket: "BTCUSDT", rightMarket: "ETHUSDT"},
];
const DEFAULT_CONFIGURATION: StatisticalHistoricalDataConfiguration = {
  pairs: DEFAULT_PAIRS,
  maximumTrackedPairs: 50,
  maximumSamplesPerPair: 500,
  maximumEvidenceAgeMs: 15_000,
  maximumEvidenceSkewMs: 2_500,
  minimumPersistenceIntervalMs: 60_000,
  rotationMaximumFileBytes: 16 * 1_024 * 1_024,
  rotationMaximumRecords: 2_000,
  maximumArchives: 4,
};

export class StatisticalHistoricalDataService implements StatisticalHistoryStore {
  private readonly configuration: StatisticalHistoricalDataConfiguration;
  private readonly pairRegistry = new Map<string, StatisticalHistoryPairIdentity>();
  private readonly seedPairIds: ReadonlySet<string>;
  private readonly histories = new Map<string, {pair: StatisticalHistoryPairIdentity; samples: StatisticalPairSample[]}>();
  private readonly writer: JsonlRotatingWriter<PersistedStatisticalHistorySnapshot>;
  private unsubscribe: (() => void) | null = null;
  private lastPersistenceAt: number | null = null;
  private writes = 0;
  private writeFailures = 0;
  private pairEvictions = 0;
  private restored = false;
  private restoreStatus: "AVAILABLE" | "NO_DATA" | "FAILED" = "NO_DATA";
  private lastError: string | null = null;

  constructor(
    private readonly persistenceFilePath = DEFAULT_FILE,
    configuration: Partial<StatisticalHistoricalDataConfiguration> = {},
    private readonly source: {
      subscribe(listener: DerivativeMarketDataSnapshotListener): () => void;
    } = derivativeMarketDataService,
  ) {
    this.configuration = {...DEFAULT_CONFIGURATION, ...configuration,
      pairs: normalizePairs(configuration.pairs ?? DEFAULT_PAIRS)};
    this.seedPairIds = new Set(this.configuration.pairs.map((pair) => pair.pairId));
    for (const value of [this.configuration.maximumTrackedPairs, this.configuration.maximumSamplesPerPair, this.configuration.maximumEvidenceAgeMs,
      this.configuration.maximumEvidenceSkewMs, this.configuration.rotationMaximumFileBytes,
      this.configuration.rotationMaximumRecords, this.configuration.maximumArchives]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Statistical historical configuration values must be positive integers.");
    }
    if (!Number.isSafeInteger(this.configuration.minimumPersistenceIntervalMs) || this.configuration.minimumPersistenceIntervalMs < 0) {
      throw new Error("Statistical historical persistence interval must be a non-negative integer.");
    }
    if (this.configuration.pairs.length > this.configuration.maximumTrackedPairs) {
      throw new Error("Statistical history seed pairs exceed the tracked-pair cap.");
    }
    this.writer = new JsonlRotatingWriter(persistenceFilePath, {enabled: true,
      maximumFileBytes: this.configuration.rotationMaximumFileBytes,
      maximumRecords: this.configuration.rotationMaximumRecords,
      maximumArchives: this.configuration.maximumArchives, protectExistingOversizedFile: true});
    this.registerPairs(this.configuration.pairs);
    this.restore();
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.source.subscribe((snapshot) => this.acceptSnapshot(snapshot));
  }
  stop(): void { this.unsubscribe?.(); this.unsubscribe = null; }
  isRunning(): boolean { return this.unsubscribe !== null; }

  record(pair: StatisticalHistoryPairIdentity, sample: StatisticalPairSample, now = Date.now()): void {
    validatePair(pair); validateSample(sample);
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Statistical history observation time must be a positive safe integer.");
    if (sample.timestamp > now) return;
    const normalizedPair = normalizePair(pair);
    if (!this.pairRegistry.has(normalizedPair.pairId)) this.registerPairs([normalizedPair]);
    if (!this.pairRegistry.has(normalizedPair.pairId)) return;
    const existing = this.histories.get(normalizedPair.pairId) ?? {pair: normalizedPair, samples: []};
    if ((existing.samples.at(-1)?.timestamp ?? 0) >= sample.timestamp) return;
    existing.samples.push(structuredClone(sample));
    if (existing.samples.length > this.configuration.maximumSamplesPerPair) {
      existing.samples.splice(0, existing.samples.length - this.configuration.maximumSamplesPerPair);
    }
    this.histories.set(normalizedPair.pairId, existing);
    if (this.lastPersistenceAt === null || now - this.lastPersistenceAt >= this.configuration.minimumPersistenceIntervalMs) this.persist(now);
  }

  getHistory(pairId: string, limit: number, throughInclusive = Date.now()): readonly StatisticalPairSample[] {
    const normalizedLimit = Math.max(1, Math.min(this.configuration.maximumSamplesPerPair, Math.floor(limit)));
    return (this.histories.get(pairId.trim())?.samples ?? []).filter((sample) => sample.timestamp <= throughInclusive)
      .slice(-normalizedLimit).map((sample) => structuredClone(sample));
  }

  getPairs(): readonly StatisticalHistoryPairIdentity[] {
    return [...this.pairRegistry.values()].sort((first, second) => first.pairId.localeCompare(second.pairId))
      .map((pair) => structuredClone(pair));
  }

  registerPairs(pairs: readonly StatisticalHistoryPairIdentity[]): {readonly registered: number; readonly retained: number} {
    let registered = 0;
    for (const input of pairs) {
      validatePair(input);
      const pair = normalizePair(input);
      const existing = this.pairRegistry.get(pair.pairId);
      if (existing) {
        if (existing.exchange !== pair.exchange || existing.leftMarket !== pair.leftMarket || existing.rightMarket !== pair.rightMarket) {
          throw new Error(`Statistical pair identity collision: ${pair.pairId}.`);
        }
        continue;
      }
      if (this.pairRegistry.size >= this.configuration.maximumTrackedPairs) break;
      this.pairRegistry.set(pair.pairId, pair);
      registered += 1;
    }
    return deepFreeze({registered, retained: this.pairRegistry.size});
  }

  synchronizePairs(pairs: readonly StatisticalHistoryPairIdentity[]): {
    readonly registered: number; readonly evicted: number; readonly retained: number;
  } {
    const desired = normalizePairs(pairs);
    if (desired.length > this.configuration.maximumTrackedPairs) {
      throw new Error("Statistical discovery pairs exceed the tracked-pair cap.");
    }
    const desiredIds = new Set(desired.map((pair) => pair.pairId));
    const missing = desired.filter((pair) => !this.pairRegistry.has(pair.pairId)).length;
    const requiredEvictions = Math.max(0, this.pairRegistry.size + missing - this.configuration.maximumTrackedPairs);
    const evictable = [...this.pairRegistry.values()].filter((pair) =>
      !this.seedPairIds.has(pair.pairId) && !desiredIds.has(pair.pairId))
      .sort((first, second) => (this.histories.get(first.pairId)?.samples.at(-1)?.timestamp ?? 0) -
        (this.histories.get(second.pairId)?.samples.at(-1)?.timestamp ?? 0) || first.pairId.localeCompare(second.pairId));
    let evicted = 0;
    for (const pair of evictable.slice(0, requiredEvictions)) {
      this.pairRegistry.delete(pair.pairId); this.histories.delete(pair.pairId); evicted += 1;
    }
    this.pairEvictions += evicted;
    const registration = this.registerPairs(desired);
    return deepFreeze({registered: registration.registered, evicted, retained: this.pairRegistry.size});
  }

  getDiagnostics(now = Date.now()) {
    const pairs = [...this.histories.values()].map((record) => ({...record.pair,
      samples: record.samples.length, firstTimestamp: record.samples[0]?.timestamp ?? null,
      lastTimestamp: record.samples.at(-1)?.timestamp ?? null}));
    return deepFreeze({generatedAt: now, version: "32.0" as const,
      featureVersion: "STAT_PAIR_LOG_PRICE_V1" as const, running: this.isRunning(),
      persistenceFilePath: this.persistenceFilePath, restored: this.restored, restoreStatus: this.restoreStatus,
      pairCount: pairs.length, totalSamples: pairs.reduce((sum, pair) => sum + pair.samples, 0),
      maximumSamplesPerPair: this.configuration.maximumSamplesPerPair, pairs, writes: this.writes,
      maximumTrackedPairs: this.configuration.maximumTrackedPairs,
      writeFailures: this.writeFailures, lastPersistenceAt: this.lastPersistenceAt,
      pairEvictions: this.pairEvictions,
      lastError: this.lastError, rotation: this.writer.getDiagnostics(),
      safety: {publicReadOnly: true, featureVersionPinned: true, samplesBounded: true,
        dynamicPairRotationBounded: true,
        backtestResultAvailable: false, walkForwardEvidenceAvailable: false,
        paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}});
  }

  private acceptSnapshot(snapshot: DerivativeMarketDataSnapshot): void {
    const now = Date.now();
    for (const pair of this.getPairs()) {
      const left = snapshot.markets.find((market) => market.exchange === pair.exchange && market.market === pair.leftMarket);
      const right = snapshot.markets.find((market) => market.exchange === pair.exchange && market.market === pair.rightMarket);
      if (!left || !right) continue;
      const timestamps = [left.sourceTimestamp, right.sourceTimestamp, left.observedAt, right.observedAt, snapshot.generatedAt];
      if (timestamps.some((timestamp) => timestamp <= 0 || timestamp > now || now - timestamp > this.configuration.maximumEvidenceAgeMs) ||
          Math.max(...timestamps) - Math.min(...timestamps) > this.configuration.maximumEvidenceSkewMs) continue;
      const leftMid = (left.bidPrice + left.askPrice) / 2; const rightMid = (right.bidPrice + right.askPrice) / 2;
      if (!Number.isFinite(leftMid) || leftMid <= 0 || !Number.isFinite(rightMid) || rightMid <= 0) continue;
      this.record(pair, {timestamp: Math.min(left.sourceTimestamp, right.sourceTimestamp), leftMid, rightMid}, now);
    }
  }

  private persist(now: number): void {
    const snapshot: PersistedStatisticalHistorySnapshot = {version: "32.0", featureVersion: "STAT_PAIR_LOG_PRICE_V1",
      generatedAt: now, pairs: [...this.histories.values()].sort((a, b) => a.pair.pairId.localeCompare(b.pair.pairId))
        .map((record) => ({pair: record.pair, samples: record.samples}))};
    try { this.writer.append(snapshot); this.writes += 1; this.lastPersistenceAt = now; this.lastError = null; }
    catch (error: unknown) { this.writeFailures += 1; this.lastError = error instanceof Error ? error.message : "Statistical history persistence failed."; }
  }

  private restore(): void {
    const result = readLatestValidJsonlAcrossArchives(this.persistenceFilePath, isPersistedSnapshot, {
      chunkSizeBytes: 64 * 1_024, maximumLineBytes: 8 * 1_024 * 1_024});
    this.restored = true; this.restoreStatus = result.restoreStatus; this.lastError = result.lastError;
    if (!result.value) return;
    const restoredAt = Date.now();
    for (const record of result.value.pairs.slice(0, this.configuration.maximumTrackedPairs)) {
      const pair = normalizePair(record.pair);
      this.registerPairs([pair]);
      if (!this.pairRegistry.has(pair.pairId)) continue;
      const samples = record.samples.filter((sample) => {
        try { validateSample(sample); return sample.timestamp <= restoredAt; } catch { return false; }
      }).slice(-this.configuration.maximumSamplesPerPair).map((sample) => structuredClone(sample));
      this.histories.set(pair.pairId, {pair, samples});
    }
    this.lastPersistenceAt = result.value.generatedAt;
  }
}

function normalizePairs(pairs: readonly StatisticalHistoryPairIdentity[]): StatisticalHistoryPairIdentity[] {
  const normalized = pairs.map(normalizePair); if (normalized.length === 0 || new Set(normalized.map((pair) => pair.pairId)).size !== normalized.length) throw new Error("Statistical history requires unique seed pairs."); return normalized;
}
function normalizePair(pair: StatisticalHistoryPairIdentity): StatisticalHistoryPairIdentity { return {pairId: pair.pairId.trim(), exchange: pair.exchange.trim().toLowerCase(), leftMarket: pair.leftMarket.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""), rightMarket: pair.rightMarket.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}; }
function validatePair(pair: StatisticalHistoryPairIdentity): void { const value = normalizePair(pair); if (!value.pairId || !value.exchange || !value.leftMarket || !value.rightMarket || value.leftMarket === value.rightMarket) throw new Error("Invalid statistical history pair."); }
function validateSample(sample: StatisticalPairSample): void { if (!Number.isSafeInteger(sample.timestamp) || sample.timestamp <= 0 || !Number.isFinite(sample.leftMid) || sample.leftMid <= 0 || !Number.isFinite(sample.rightMid) || sample.rightMid <= 0) throw new Error("Invalid statistical history sample."); }
function isPersistedSnapshot(value: unknown): value is PersistedStatisticalHistorySnapshot { if (typeof value !== "object" || value === null) return false; const candidate = value as Partial<PersistedStatisticalHistorySnapshot>; return candidate.version === "32.0" && candidate.featureVersion === "STAT_PAIR_LOG_PRICE_V1" && Number.isSafeInteger(candidate.generatedAt) && (candidate.generatedAt ?? 0) > 0 && Array.isArray(candidate.pairs) && candidate.pairs.every((record) => typeof record === "object" && record !== null && Array.isArray((record as PersistedPairHistory).samples)); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) deepFreeze(nested); return Object.freeze(value); }

export const statisticalHistoricalDataService = new StatisticalHistoricalDataService();
