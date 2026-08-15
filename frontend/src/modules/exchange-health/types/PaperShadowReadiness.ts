import type {
  CatProTargetExchange,
} from "./ExchangeFleet";

export type ExchangeFeeEvidenceSource =
  | "STATIC_CONFIG"
  | "PUBLIC_API"
  | "ACCOUNT_API";

export interface PaperShadowExchangeReadiness {
  exchange: CatProTargetExchange;

  displayName: string;

  marketDataConnected: boolean;

  capabilitySynchronization:
    | "SYNCHRONIZED"
    | "FAILED";

  capabilitySynchronizationError:
    string | null;

  capabilityMarkets: number;

  executableMarkets: number;

  feeEvidenceMarkets: number;

  completeOrderRuleMarkets: number;

  shadowEligibleMarkets: number;

  paperEligibleMarkets: number;

  feeEvidenceSources:
    Record<
      ExchangeFeeEvidenceSource,
      number
    >;

  shadowAvailability:
    | "AVAILABLE"
    | "BLOCKED";

  paperAvailability:
    | "AVAILABLE"
    | "BLOCKED";

  shadowEligibleMarketSample:
    string[];

  paperEligibleMarketSample:
    string[];

  blockers: string[];
}

export interface FiveExchangePaperShadowReadinessReport {
  generatedAt: number;

  version: "19.33";

  mode:
    "READ_ONLY_PAPER_SHADOW_READINESS";

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  allFiveShadowAvailable: boolean;

  allFivePaperAvailable: boolean;

  summary: {
    shadowAvailableExchanges: number;

    paperAvailableExchanges: number;

    totalShadowEligibleMarkets: number;

    totalPaperEligibleMarkets: number;
  };

  exchanges:
    PaperShadowExchangeReadiness[];

  blockers: string[];

  notes: string[];
}

export interface PaperShadowReadinessResponse {
  success: boolean;

  data:
    FiveExchangePaperShadowReadinessReport;
}

export interface ExchangeRollingReadiness {
  exchange: CatProTargetExchange;

  observations: number;

  connectedObservations: number;

  shadowAvailableObservations: number;

  paperAvailableObservations: number;

  shadowAvailabilityRatio: number;

  paperAvailabilityRatio: number;

  latestShadowEligibleMarkets: number;

  latestPaperEligibleMarkets: number;

  rollingShadowStable: boolean;

  rollingPaperStable: boolean;

  blockers: string[];
}

export interface FiveExchangeReadinessObservationReport {
  generatedAt: number;

  version: "19.34";

  mode:
    "PERSISTENT_ROLLING_READINESS_EVIDENCE";

  status:
    | "INSUFFICIENT_EVIDENCE"
    | "UNSTABLE"
    | "STABLE";

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  allFiveRollingShadowStable: boolean;

  allFiveRollingPaperStable: boolean;

  policy: {
    rollingWindowMs: number;

    minimumObservations: number;

    minimumDurationMs: number;

    minimumAvailabilityRatio: number;

    captureIntervalMs: number;
  };

  evidence: {
    observationsInWindow: number;

    firstObservedAt: number | null;

    lastObservedAt: number | null;

    observedDurationMs: number;

    observationRequirementMet: boolean;

    durationRequirementMet: boolean;

    persistenceHealthy: boolean;
  };

  exchanges:
    ExchangeRollingReadiness[];

  blockers: string[];

  persistence: {
    writes: number;

    writeFailures: number;

    validRecordsRead: number;

    malformedRecordsIgnored: number;

    lastWriteAt: number | null;

    lastError: string | null;
  };

  notes: string[];
}

export interface ReadinessObservationResponse {
  success: boolean;

  data:
    FiveExchangeReadinessObservationReport;
}
