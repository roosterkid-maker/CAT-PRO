import type {
  MonitoredOpportunityCandidate,
} from "./OpportunityMonitor";

export type CandidateQualificationStatus =
  | "OBSERVING"
  | "QUALIFIED"
  | "REJECTED"
  | "EXPIRED";

export interface CandidateQualificationCheck {
  passed: boolean;

  currentValue:
    | number
    | string
    | boolean;

  requiredValue:
    | number
    | string
    | boolean;

  reason: string;
}

export interface CandidateQualificationChecks {
  active:
    CandidateQualificationCheck;

  consecutiveObservations:
    CandidateQualificationCheck;

  persistence:
    CandidateQualificationCheck;

  netProfit:
    CandidateQualificationCheck;

  liquidity:
    CandidateQualificationCheck;

  freshness:
    CandidateQualificationCheck;

  profitStability:
    CandidateQualificationCheck;
}

export type CandidateLiquidityQualificationSource =
  | "LEGACY_SCORE"
  | "CAPITAL_AWARE_SIMULATION"
  | "NONE";

export interface CandidateCapitalAwareLiquidityAssessment {
  enabled: boolean;

  validationCapital: number;

  validationCapitalCurrency?: "INR";

  quoteAsset?:
    string | null;

  simulationCapital?:
    number | null;

  attempted: boolean;

  simulationSuccess: boolean;

  fullyExecutable: boolean;

  fillPercent:
    number | null;

  executableCapital:
    number | null;

  netProfit:
    number | null;

  netProfitPercent:
    number | null;

  totalSlippagePercent:
    number | null;

  confidenceScore:
    number | null;

  recommendation:
    string | null;

  /** Exact accepted opportunity used for market-rule and last-look checks. */
  opportunityResolved?: boolean;

  /** Quantity/min-notional/precision rules were evaluated for both legs. */
  marketRulesChecked?: boolean;

  /** True only when both venue increments are complete enough for a real order. */
  liveOrderSafe?: boolean;

  fundedRouteState?:
    "FUNDED" |
    "REDUCED" |
    "BLOCKED" |
    null;

  stressStatus?:
    "PASSED" |
    "BLOCKED" |
    null;

  /** Conservative net after exact VWAP, fees, adverse-move reserve and buffer. */
  postStressNetProfit?:
    number | null;

  postStressNetProfitPercent?:
    number | null;

  minimumRequiredNetProfitPercent:
    number;

  requireExecuteRecommendation:
    boolean;

  passed: boolean;

  failureReason:
    string | null;
}

export interface CandidateLiquidityQualificationAssessment {
  legacyLiquidityScore: number;

  legacyMinimumLiquidityScore: number;

  legacyPassed: boolean;

  capitalAware:
    CandidateCapitalAwareLiquidityAssessment;

  passed: boolean;

  source:
    CandidateLiquidityQualificationSource;
}

export interface CandidateQualificationRecord {
  key: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status:
    CandidateQualificationStatus;

  qualified: boolean;

  score: number;

  evaluatedAt: number;

  profitDrawdownPercent: number;

  liquidityAssessment:
    CandidateLiquidityQualificationAssessment;

  checks:
    CandidateQualificationChecks;

  reasons: string[];

  candidate:
    MonitoredOpportunityCandidate;
}

export interface CandidateQualificationConfig {
  minimumConsecutiveObservations:
    number;

  minimumPersistenceMs:
    number;

  fastLaneMinimumPostStressNetProfitPercent:
    number;

  fastLaneMinimumConsecutiveDistinctBookObservations:
    number;

  fastLaneMinimumPersistenceMs:
    number;

  minimumNetProfitPercent:
    number;

  minimumLiquidityScore:
    number;

  minimumFreshnessScore:
    number;

  maximumProfitDrawdownPercent:
    number;

  capitalAwareLiquidityEnabled:
    boolean;

  capitalAwareLiquidityValidationCapital:
    number;

  capitalAwareLiquidityMinimumNetProfitPercent:
    number;

  capitalAwareLiquidityRequireExecuteRecommendation:
    boolean;
}

export interface CandidateQualificationDiagnostics {
  generatedAt: number;

  executionAllowed: false;

  config:
    CandidateQualificationConfig;

  totalCandidates: number;

  observing: number;

  qualified: number;

  rejected: number;

  expired: number;

  legacyLiquidityPasses: number;

  capitalAwareLiquidityPasses: number;

  liquidityRejected: number;

  qualifications:
    CandidateQualificationRecord[];
}
