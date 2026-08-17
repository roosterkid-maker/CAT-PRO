export type FreshnessRootCauseClassification =
  | "EVICTION_NOT_RUNNING"
  | "MARKET_CACHE_STALE"
  | "ORDER_BOOK_FEED_STALE"
  | "CACHE_PUBLICATION_MISMATCH"
  | "PAIR_SYNCHRONIZATION"
  | "MIXED"
  | "HEALTHY"
  | "INSUFFICIENT_DATA";

export interface FreshnessAgeDistribution {
  count: number;

  minimumMs: number | null;

  p50Ms: number | null;

  p95Ms: number | null;

  averageMs: number | null;

  maximumMs: number | null;
}

export interface FreshnessExchangeRootCause {
  exchange: string;

  maximumQuoteAgeMs: number;

  maximumPairSkewMs: number;

  totalQuotes: number;

  executableQuotes: number;

  freshExecutableQuotes: number;

  staleExecutableQuotes: number;

  freshnessCoveragePercent: number;

  executableAge:
    FreshnessAgeDistribution;

  orderBooks: number;

  freshOrderBooks: number;

  staleOrderBooks: number;

  orderBookAge:
    FreshnessAgeDistribution;

  cacheBookMatches: number;

  cacheFreshBookFresh: number;

  cacheStaleBookFresh: number;

  cacheFreshBookStale: number;

  cacheStaleBookStale: number;

  timestampDelta:
    FreshnessAgeDistribution;

  likelyCause:
    FreshnessRootCauseClassification;

  observations: string[];
}

export interface FreshnessRejectionAgeSummary {
  sampleSize: number;

  staleBuy: number;

  staleSell: number;

  staleBoth: number;

  pairNotSynchronized: number;

  buyAge:
    FreshnessAgeDistribution;

  sellAge:
    FreshnessAgeDistribution;

  pairSkew:
    FreshnessAgeDistribution;

  byRoute: Array<{
    route: string;

    count: number;
  }>;
}

export interface FreshnessMismatchSample {
  exchange: string;

  market: string;

  cacheExecutable: boolean;

  cacheTimestamp: number;

  cacheAgeMs: number | null;

  cacheMaximumAgeMs: number;

  cacheFresh: boolean;

  orderBookPresent: boolean;

  orderBookTimestamp: number | null;

  orderBookAgeMs: number | null;

  orderBookFresh: boolean | null;

  timestampDeltaMs: number | null;

  diagnosis: string;
}

export interface FreshnessRootCauseReport {
  generatedAt: number;

  version: "17.3";

  build: "2";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  classification:
    FreshnessRootCauseClassification;

  primaryFinding: string;

  eviction: {
    running: boolean;

    intervalMs: number;

    lastRunAt: number | null;

    totalRuns: number;

    totalScanned: number;

    totalFresh: number;

    totalStale: number;

    totalEvicted: number;
  };

  cache: {
    totalQuotes: number;

    executableQuotes: number;

    freshExecutableQuotes: number;

    staleExecutableQuotes: number;

    executableFreshnessPercent: number;
  };

  exchanges:
    FreshnessExchangeRootCause[];

  rejections:
    FreshnessRejectionAgeSummary;

  mismatchSamples:
    FreshnessMismatchSample[];

  observations: string[];
}