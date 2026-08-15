import type {
  PersonalBotCapitalPlacementRouteRank,
  PersonalBotFundedRoute,
} from "@/modules/strategies/types/PersonalStrategyOneBot";

export type TinyLivePreflightGateState =
  | "PASS"
  | "BLOCKED";

export interface TinyLiveBalanceRequirement {
  exchange: string;
  asset: string;
  requiredAmount: number;
  maximumAgeMs?: number;
}

export interface TinyLivePreflightRequest {
  requestedCapital: number;
  market: string;
  buyExchange: string;
  sellExchange: string;
  confirmationToken: string;
  balanceRequirements: TinyLiveBalanceRequirement[];
}

export interface TinyLivePreflightGate {
  key: string;
  state: TinyLivePreflightGateState;
  required: true;
  message: string;
  reasons: string[];
}

export interface TinyLivePreflightReport {
  generatedAt: number;

  version: "18.0";
  build: "15";

  mode: "TINY_LIVE_PREFLIGHT";

  preflightOnly: true;

  liveOrderSubmissionPerformed: false;
  capitalReserved: false;
  liveSessionCreated: false;

  approved: boolean;

  requestedCapital: number;

  hardCapitalRange: {
    minimum: 100;
    maximum: 500;
    currency: "INR";
  };

  market: string;

  buyExchange: string;
  sellExchange: string;

  gates: TinyLivePreflightGate[];

  blockers: string[];

  safety: {
    automaticOrderSubmissionAllowed: false;
    automaticCapitalReservationAllowed: false;
    automaticCancelAllowed: false;
    automaticHedgeAllowed: false;
    automaticUnwindAllowed: false;
    preflightConfirmationRequired: true;
  };

  notes: string[];
}

export interface TinyLivePreflightResponse {
  success: boolean;
  data: TinyLivePreflightReport;
}

export interface TinyLiveCapability {
  generatedAt: number;

  version: "18.0";
  build: "15";

  mode: "TINY_LIVE_PREFLIGHT";

  preflightOnly: true;

  minimumCapital: 100;
  maximumCapital: 500;

  currency: "INR";

  requiredConfirmationToken:
    "RUN_TINY_LIVE_PREFLIGHT_ONLY";

  liveOrderSubmissionPerformed: false;
  capitalReserved: false;
  liveSessionCreated: false;

  notes: string[];
}

export interface TinyLiveCapabilityResponse {
  success: boolean;
  data: TinyLiveCapability;
}

export interface TinyLiveEvidencePackage {
  schemaVersion: 1;

  milestone: "19.36";

  generatedAt: number;

  recordKind:
    | "PREVIEW"
    | "SEALED";

  mode:
    "TINY_LIVE_CONTENT_ADDRESSED_EVIDENCE";

  decision:
    | "NO_GO"
    | "GO_FOR_AUDITED_ACTIVATION_REVIEW";

  activationReviewEligible: boolean;

  targetExchanges: string[];

  tinyLivePolicy: {
    minimumCapital: 100;

    maximumCapital: 500;

    currency: "INR";

    preflightOnly: true;

    sealConfirmationRequired: true;
  };

  safety: {
    liveTradingEnabled: false;

    liveSubmissionAllowed: false;

    automaticPromotionAllowed: false;

    orderSubmissionPerformed: false;

    capitalReserved: false;

    liveSessionCreated: false;

    accountModeChanged: false;
  };

  evidence: {
    rollingReadiness: {
      version: "19.34";

      generatedAt: number;

      status:
        | "INSUFFICIENT_EVIDENCE"
        | "UNSTABLE"
        | "STABLE";

      allFiveRollingShadowStable: boolean;

      allFiveRollingPaperStable: boolean;

      policy: {
        minimumObservations: number;

        minimumDurationMs: number;

        minimumAvailabilityRatio: number;

        rollingWindowMs: number;

        captureIntervalMs: number;
      };

      observationEvidence: {
        observationsInWindow: number;

        observedDurationMs: number;

        observationRequirementMet: boolean;

        durationRequirementMet: boolean;

        persistenceHealthy: boolean;
      };
    };

    goNoGo: {
      version: "19.35";

      generatedAt: number;

      decision:
        | "NO_GO"
        | "GO_FOR_AUDITED_ACTIVATION_REVIEW";

      activationReviewEligible: boolean;

      summary: {
        totalGates: number;

        passed: number;

        blocked: number;

        exchangesWithoutBlockers: number;
      };

      blockers: string[];
    };

    v18Acceptance: {
      version: "18.0";

      build: "16";

      generatedAt: number;

      status: string;

      hardeningAccepted: boolean;

      tinyLiveOperationalReady: boolean;
    };
  };

  blockers: string[];

  notes: string[];

  packageId: string;

  integrity: {
    algorithm: "SHA-256";

    digest: string;

    canonicalization:
      "SORTED_JSON_KEYS_V1";

    verifiedAtGeneration: true;
  };
}

export interface TinyLiveEvidencePackageResponse {
  success: boolean;

  data: TinyLiveEvidencePackage;
}

export interface TinyLiveEvidenceArchive {
  generatedAt: number;

  version: "19.36";

  mode:
    "TINY_LIVE_EVIDENCE_ARCHIVE";

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  totalSealedPackages: number;

  latest: Array<{
    packageId: string;

    generatedAt: number;

    decision:
      | "NO_GO"
      | "GO_FOR_AUDITED_ACTIVATION_REVIEW";

    integrityVerified: boolean;
  }>;

  persistenceHealthy: boolean;

  notes: string[];
}

export interface TinyLiveEvidenceArchiveResponse {
  success: boolean;

  data: TinyLiveEvidenceArchive;
}

export type TinyLiveClosureOwner =
  | "CODE"
  | "OPERATOR"
  | "EXTERNAL"
  | "EVIDENCE";

export type TinyLiveClosureActionState =
  | "COMPLETE"
  | "ACTION_REQUIRED"
  | "WAITING_FOR_EVIDENCE"
  | "DEFERRED";

export interface TinyLiveClosureAction {
  key: string;
  title: string;
  owner: TinyLiveClosureOwner;
  state: TinyLiveClosureActionState;
  priority: "P0" | "P1" | "P2";
  blocking: boolean;
  summary: string;
  evidence: string[];
  steps: string[];
}

export interface TinyLiveReadinessClosureReport {
  generatedAt: number;
  version: "22.19";
  build: "TINY_LIVE_READINESS_CLOSURE";
  mode: "READ_ONLY_CLOSURE";
  decision:
    | "BLOCKED"
    | "READY_FOR_AUDITED_ACTIVATION_REVIEW";
  activationReviewEligible: boolean;
  summary: {
    prerequisiteActions: number;
    completedPrerequisites: number;
    actionRequired: number;
    waitingForEvidence: number;
    deferred: number;
    progressPercent: number;
  };
  nextAction: TinyLiveClosureAction | null;
  actions: TinyLiveClosureAction[];
  safety: {
    readOnly: true;
    credentialValuesReturned: false;
    automaticAlertResolutionAllowed: false;
    automaticAccountModeChangeAllowed: false;
    automaticLivePromotionAllowed: false;
    liveOrderSubmissionAllowed: false;
    orderSubmissionPerformed: false;
    capitalReserved: false;
  };
  notes: string[];
}

export interface TinyLiveReadinessClosureResponse {
  success: boolean;
  data: TinyLiveReadinessClosureReport;
}

export type StrategyOnePilotPreviewState =
  | "WAITING_FOR_CURRENT_EXECUTE_OPPORTUNITY"
  | "WAITING_FOR_HISTORICAL_MATCH"
  | "BLOCKED_CURRENT_EVIDENCE"
  | "READY_FOR_OPERATOR_PREFLIGHT";

export interface StrategyOnePilotCheck {
  key:
    | "CURRENT_LIVE_PROFIT_THRESHOLD"
    | "HISTORICAL_ROUTE_EVIDENCE"
    | "FRESH_TWO_LEG_FUNDING_AND_RULES"
    | "POST_STRESS_DEPTH_AND_ECONOMICS";
  state: "PASS" | "BLOCKED";
  message: string;
  reasons: string[];
}

export interface StrategyOnePilotStress {
  status: "PASSED" | "BLOCKED";
  evaluatedAt: number;
  sourceOpportunityAgeMs: number | null;
  buyBookTimestamp: number | null;
  sellBookTimestamp: number | null;
  timestampSkewMs: number | null;
  quantity: number;
  buyFillPercent: number | null;
  sellFillPercent: number | null;
  buyVwap: number | null;
  sellVwap: number | null;
  buyLimitPrice: number | null;
  sellLimitPrice: number | null;
  combinedDepthSlippagePercent: number | null;
  adverseMoveReservePercentPerLeg: number;
  tradingFees: number | null;
  safetyBuffer: number | null;
  postStressNetProfit: number | null;
  postStressNetProfitPercent: number | null;
  minimumNetProfitPercent: number;
  reasons: string[];
  paperOnly: true;
  liveExecutionAllowed: false;
  orderSubmissionAllowed: false;
}

export interface StrategyOnePilotCandidate {
  opportunityId: string;
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  observedAt: number;
  ageMs: number;
  currentNetProfitPercent: number;
  currentNetProfitPerBaseUnit: number;
  currentScore: number;
  historical: PersonalBotCapitalPlacementRouteRank;
  funding: PersonalBotFundedRoute;
  stress: StrategyOnePilotStress | null;
  checks: StrategyOnePilotCheck[];
  readyForOperatorPreflight: boolean;
}

export interface StrategyOnePilotSafety {
  readOnlyPreview: true;
  historicalEvidenceIsNotCurrentAuthorization: true;
  operatorPreflightIsNotOrderAuthorization: true;
  automaticFundMovementAllowed: false;
  transferInitiated: false;
  withdrawalInitiated: false;
  balanceMutated: false;
  capitalReserved: false;
  liveSessionCreated: false;
  liveExecutionAllowed: false;
  orderSubmissionAllowed: false;
  orderSubmissionPerformed: false;
}

export interface StrategyOnePilotPreviewReport {
  version: "92.0";
  generatedAt: number;
  mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW";
  state: StrategyOnePilotPreviewState;
  requestedCapitalPerLegInr: 100;
  minimumTwoLegInventoryInr: 200;
  minimumCurrentNetProfitPercent: number;
  maximumOpportunityAgeMs: number;
  evidence: {
    currentFreshExecuteOpportunities: number;
    historicalAdapterReadyRoutes: number;
    matchedCurrentRoutes: number;
    fullyPreflightableMatches: number;
  };
  selected: StrategyOnePilotCandidate | null;
  alternatives: StrategyOnePilotCandidate[];
  blockers: string[];
  requiredConfirmationToken: "RUN_STRATEGY_ONE_PILOT_PREFLIGHT_ONLY";
  safety: StrategyOnePilotSafety;
}

export interface StrategyOnePilotPreflightRunReport {
  version: "92.0";
  generatedAt: number;
  mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT";
  decision:
    | "BLOCKED_BEFORE_CORE_PREFLIGHT"
    | "CORE_PREFLIGHT_BLOCKED"
    | "CORE_PREFLIGHT_PASSED";
  approvedForActivationReview: boolean;
  expectedOpportunityId: string;
  preview: StrategyOnePilotPreviewReport;
  corePreflight: TinyLivePreflightReport | null;
  blockers: string[];
  safety: StrategyOnePilotSafety;
}

export interface StrategyOnePilotPreviewResponse {
  success: boolean;
  data: StrategyOnePilotPreviewReport;
}

export interface StrategyOnePilotPreflightRunResponse {
  success: boolean;
  data: StrategyOnePilotPreflightRunReport;
}
