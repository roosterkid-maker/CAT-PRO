export type QualificationPersistenceRootCauseClassification =
  | "NO_CANDIDATES"
  | "PERSISTENCE_DOMINANT"
  | "PROFIT_DOMINANT"
  | "LIQUIDITY_DOMINANT"
  | "FRESHNESS_DOMINANT"
  | "PROFIT_STABILITY_DOMINANT"
  | "MIXED_QUALITY_FAILURES"
  | "QUALIFICATION_HEALTHY";

export interface QualificationCheckFailureSummary {
  check: string;

  failed: number;

  activeFailed: number;

  percentOfCandidates: number;
}

export interface QualificationPersistenceCandidateTrace {
  key: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  monitorStatus: string;

  qualificationStatus: string;

  qualified: boolean;

  score: number;

  lifetimeMs: number;

  consecutiveObservations: number;

  totalObservations: number;

  reappearances: number;

  latestNetProfitPercent: number;

  bestNetProfitPercent: number;

  profitDrawdownPercent: number;

  liquidityScore: number;

  freshnessScore: number;

  failedChecks: string[];

  remaining: {
    consecutiveObservations: number;

    persistenceMs: number;

    netProfitPercent: number;

    liquidityScore: number;

    freshnessScore: number;

    profitStabilityPercent: number;
  };

  reasons: string[];
}

export interface QualificationPersistenceRootCauseReport {
  generatedAt: number;

  version: "17.4";

  build: "5";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  liveExecutionAllowed: false;

  classification:
    QualificationPersistenceRootCauseClassification;

  primaryBottleneck: string;

  config: {
    minimumConsecutiveObservations: number;

    minimumPersistenceMs: number;

    minimumNetProfitPercent: number;

    minimumLiquidityScore: number;

    minimumFreshnessScore: number;

    maximumProfitDrawdownPercent: number;
  };

  summary: {
    totalCandidates: number;

    activeCandidates: number;

    disappearedCandidates: number;

    observing: number;

    qualified: number;

    rejected: number;

    expired: number;

    candidatesMeetingPersistence: number;

    candidatesMeetingQuality: number;

    candidatesMeetingAllChecks: number;
  };

  failedChecks:
    QualificationCheckFailureSummary[];

  activeCandidates:
    QualificationPersistenceCandidateTrace[];

  recentCandidates:
    QualificationPersistenceCandidateTrace[];

  observations: string[];
}