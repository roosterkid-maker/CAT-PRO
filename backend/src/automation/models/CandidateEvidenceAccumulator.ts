import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export interface CandidateEvidenceCheckCounts {
  active: number;

  consecutiveObservations: number;

  persistence: number;

  netProfit: number;

  liquidity: number;

  freshness: number;

  profitStability: number;
}

export interface CandidateEvidenceRouteRecord {
  /** Attribution of the latest observation only, not the aggregate history. */
  latestStrategyAttribution: StrategyAttribution;

  key: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  firstObservedAt: number;

  lastObservedAt: number;

  elapsedObservedMs: number;

  activeSnapshotObservations: number;

  qualificationEvaluations: number;

  observingEvaluations: number;

  qualifiedEvaluations: number;

  rejectedEvaluations: number;

  maximumConsecutiveObservations: number;

  maximumLifetimeMs: number;

  maximumTotalObservations: number;

  maximumReappearances: number;

  latestNetProfitPercent: number;

  bestNetProfitPercent: number;

  maximumLiquidityScore: number;

  maximumFreshnessScore: number;

  minimumProfitDrawdownPercent: number;

  bestQualificationScore: number;

  checkPassCounts: CandidateEvidenceCheckCounts;

  checkFailureCounts: CandidateEvidenceCheckCounts;

  persistencePassObservations: number;

  qualityPassObservations: number;

  allChecksPassObservations: number;

  lastFailedChecks: string[];

  lastReasons: string[];
}

export interface CandidateEvidencePersistenceDiagnostics {
  enabled: true;

  format: "JSONL_SNAPSHOT";

  restoreStatus:
    | "AVAILABLE"
    | "NO_DATA"
    | "FAILED";

  restoreReadStrategy:
    "REVERSE_BOUNDED_TAIL";

  filePath: string;

  restored: boolean;

  restoredAt: number | null;

  restoredRouteCount: number;

  restoreFileSizeBytes: number;

  restoreBytesRead: number;

  restoreRecordsExamined: number;

  restoreMalformedLinesIgnored: number;

  restoreOversizedLinesIgnored: number;

  restoreDurationMs: number;

  restoreChunkSizeBytes: number;

  maximumSnapshotBytes: number;

  writes: number;

  writeFailures: number;

  lastPersistedAt: number | null;

  lastError: string | null;
}

export interface CandidateEvidenceAccumulatorDiagnostics {
  generatedAt: number;

  version: "17.4";

  build: "8";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  startedAt: number;

  elapsedMs: number;

  processedAuthoritativeSnapshots: number;

  lastProcessedSnapshotGeneratedAt: number | null;

  persistence: CandidateEvidencePersistenceDiagnostics;

  config: {
    minimumConsecutiveObservations: number;

    minimumPersistenceMs: number;

    minimumNetProfitPercent: number;

    minimumLiquidityScore: number;

    minimumFreshnessScore: number;

    maximumProfitDrawdownPercent: number;
  };

  summary: {
    routesObserved: number;

    activeSnapshotObservations: number;

    routesReachedTwoConsecutiveObservations: number;

    routesReachedRequiredConsecutiveObservations: number;

    routesReachedRequiredPersistence: number;

    routesReachedRequiredNetProfit: number;

    routesReachedRequiredLiquidity: number;

    routesReachedRequiredFreshness: number;

    routesReachedProfitStability: number;

    routesReachedAllQualityChecks: number;

    routesReachedAllChecks: number;

    routesEverQualified: number;
  };

  failureDistribution: Array<{
    check: keyof CandidateEvidenceCheckCounts;

    failedObservations: number;

    routesAffected: number;
  }>;

  nearQualified: CandidateEvidenceRouteRecord[];

  routes: CandidateEvidenceRouteRecord[];

  observations: string[];
}
