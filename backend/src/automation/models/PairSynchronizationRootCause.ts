export interface PairSynchronizationDistribution {
  count: number;

  minimumMs: number | null;

  p50Ms: number | null;

  p95Ms: number | null;

  averageMs: number | null;

  maximumMs: number | null;
}

export interface PairSynchronizationRouteDiagnostic {
  route: string;

  buyExchange: string;

  sellExchange: string;

  maximumPairSkewMs: number;

  totalCurrentPairs: number;

  bothFreshPairs: number;

  synchronizedPairs: number;

  unsynchronizedPairs: number;

  synchronizationRatePercent: number;

  skew: PairSynchronizationDistribution;

  buyAge: PairSynchronizationDistribution;

  sellAge: PairSynchronizationDistribution;

  buyNewer: number;

  sellNewer: number;

  equalTimestamp: number;

  recentRejections: number;

  likelyCause: string;
}

export interface PairSynchronizationMismatchSample {
  market: string;

  buyExchange: string;

  sellExchange: string;

  buyTimestamp: number;

  sellTimestamp: number;

  buyAgeMs: number;

  sellAgeMs: number;

  timestampSkewMs: number;

  maximumPairSkewMs: number;

  olderSide:
    | "BUY"
    | "SELL"
    | "EQUAL";

  exceededByMs: number;
}

export interface PairSynchronizationRootCauseReport {
  generatedAt: number;

  version: "17.3";

  build: "4";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  classification:
    | "HEALTHY"
    | "ROUTE_SPECIFIC_SKEW"
    | "SYSTEMIC_SKEW"
    | "INSUFFICIENT_DATA";

  primaryFinding: string;

  summary: {
    currentExecutableQuotes: number;

    currentFreshExecutableQuotes: number;

    currentFreshDirectionalPairs: number;

    synchronizedDirectionalPairs: number;

    unsynchronizedDirectionalPairs: number;

    synchronizationRatePercent: number;

    recentPairSynchronizationRejections: number;
  };

  routes:
    PairSynchronizationRouteDiagnostic[];

  mismatchSamples:
    PairSynchronizationMismatchSample[];

  observations: string[];
}