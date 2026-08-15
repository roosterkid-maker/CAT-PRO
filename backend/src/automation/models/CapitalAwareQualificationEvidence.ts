import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export interface CapitalAwareQualificationEvidenceRoute {
  /** Attribution of the latest qualification observation only. */
  latestStrategyAttribution: StrategyAttribution;

  key: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  firstObservedAt: number;

  lastObservedAt: number;

  activeObservations: number;

  legacyLiquidityPassObservations: number;

  legacyLiquidityFailObservations: number;

  capitalAwareAttemptObservations: number;

  capitalAwareSimulationSuccessObservations: number;

  capitalAwarePassObservations: number;

  capitalAwareFailObservations: number;

  capitalAwareSourceObservations: number;

  qualifiedObservations: number;

  qualifiedViaCapitalAwareObservations: number;

  maximumLegacyLiquidityScore: number;

  bestCapitalAwareNetProfitPercent: number | null;

  maximumCapitalAwareFillPercent: number | null;

  maximumCapitalAwareExecutableCapital: number | null;

  minimumCapitalAwareSlippagePercent: number | null;

  maximumCapitalAwareConfidenceScore: number | null;

  lastQualificationStatus: string;

  lastLiquiditySource: string;

  lastLegacyLiquidityScore: number;

  lastLegacyPassed: boolean;

  lastCapitalAwareAttempted: boolean;

  lastCapitalAwarePassed: boolean;

  lastCapitalAwareFullyExecutable: boolean;

  lastCapitalAwareFillPercent: number | null;

  lastCapitalAwareNetProfitPercent: number | null;

  lastCapitalAwareRecommendation: string | null;

  lastCapitalAwareFailureReason: string | null;

  lastQualified: boolean;
}

export interface CapitalAwareQualificationEvidenceDiagnostics {
  generatedAt: number;

  version: "17.4";

  build: "13";

  mode: "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed: false;

  paperExecutionAllowed: false;

  liveExecutionAllowed: false;

  startedAt: number;

  processedSnapshots: number;

  lastSnapshotGeneratedAt: number | null;

  persistence: {
    enabled: true;

    format: "JSONL_SNAPSHOT";

    restoreStatus:
      | "AVAILABLE"
      | "NO_DATA"
      | "FAILED";

    restoreReadStrategy:
      "REVERSE_BOUNDED_MULTI_ARCHIVE";

    filePath: string;

    restored: boolean;

    restoredAt: number | null;

    restoredRouteCount: number;

    archivesConsidered: number;

    archivesOpened: number;

    restoreBytesRead: number;

    restoreRecordsExamined: number;

    restoreMalformedRecordsIgnored: number;

    restoreOversizedRecordsIgnored: number;

    restoreDurationMs: number;

    selectedAuthoritativeSource: string | null;

    rotation: {
      enabled: boolean;

      maximumFileBytes: number;

      maximumRecords: number;

      existingOversizedFileProtected: boolean;

      rotations: number;

      lastArchiveCreated: string | null;
    };

    writes: number;

    writeFailures: number;

    lastPersistedAt: number | null;

    lastError: string | null;
  };

  configuration: {
    minimumLiquidityScore: number;

    capitalAwareLiquidityEnabled: boolean;

    capitalAwareLiquidityValidationCapital: number;

    capitalAwareLiquidityMinimumNetProfitPercent: number;

    capitalAwareLiquidityRequireExecuteRecommendation: boolean;
  };

  summary: {
    routesObserved: number;

    activeObservations: number;

    routesLegacyLiquidityPassed: number;

    routesLegacyLiquidityFailed: number;

    routesCapitalAwareAttempted: number;

    routesCapitalAwarePassed: number;

    routesQualified: number;

    routesQualifiedViaCapitalAware: number;

    totalCapitalAwareAttempts: number;

    totalCapitalAwarePasses: number;

    totalQualifiedViaCapitalAwareObservations: number;
  };

  routes: CapitalAwareQualificationEvidenceRoute[];

  observations: string[];
}
