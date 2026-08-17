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

  executableAge: FreshnessAgeDistribution;

  orderBooks: number;

  freshOrderBooks: number;

  staleOrderBooks: number;

  orderBookAge: FreshnessAgeDistribution;

  cacheBookMatches: number;

  cacheFreshBookFresh: number;

  cacheStaleBookFresh: number;

  cacheFreshBookStale: number;

  cacheStaleBookStale: number;

  timestampDelta: FreshnessAgeDistribution;

  likelyCause: FreshnessRootCauseClassification;

  observations: string[];
}

export interface FreshnessRootCauseReport {
  generatedAt: number;

  version: string;

  build: string;

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  classification: FreshnessRootCauseClassification;

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

  exchanges: FreshnessExchangeRootCause[];

  observations: string[];
}

export interface FreshnessDiagnosticsResponse {
  success: boolean;

  data: FreshnessRootCauseReport;
}