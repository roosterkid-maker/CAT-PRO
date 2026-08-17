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
    | "AUDITED_LIVE_VENUE_CONTRACT"
    | "API_KEY_PERMISSION_BOUNDARY"
    | "PILOT_TIMING_HEADROOM"
    | "CURRENT_DISPATCH_RESERVED_FRESHNESS"
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
  timing: {
    schemaVersion: "115.0";
    generatedAt: number;
    routeKey: string;
    market: string;
    buyExchange: string;
    sellExchange: string;
    state: "READY" | "BLOCKED";
    absoluteBookAgeCeilingMs: 250;
    dispatchSafetyMarginMs: number;
    requiredOperationalHeadroomMs: number;
    decisionToExecutionStartP99Ms: number | null;
    dispatchBudgetMs: number | null;
    maximumBookAgeMs: number | null;
    executionGradeBuyAgeP99Ms: number | null;
    executionGradeSellAgeP99Ms: number | null;
    executionGradeWorstAgeP99Ms: number | null;
    residualOperationalHeadroomMs: number | null;
    blockers: string[];
    safety: {
      reviewOnly: true;
      thresholdRelaxationAllowed: false;
      automaticProposalAllowed: false;
      automaticApprovalAllowed: false;
      liveOrderSubmissionAuthorized: false;
    };
  };
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
  version: "115.0";
  generatedAt: number;
  mode: "STRATEGY_ONE_ACTION_TIME_PREFLIGHT_PREVIEW";
  state: StrategyOnePilotPreviewState;
  requestedCapitalPerLegInr: number;
  minimumTwoLegInventoryInr: number;
  minimumCurrentNetProfitPercent: number;
  maximumOpportunityAgeMs: number;
  maximumExecutionGradeBookAgeMs: 250;
  maximumDispatchReservedBookAgeMs: 190;
  maximumExecutionGradeBookSkewMs: 250;
  evidence: {
    currentFreshExecuteOpportunities: number;
    historicalAdapterReadyRoutes: number;
    excludedNonPilotCurrentOpportunities: number;
    excludedNonPilotHistoricalRoutes: number;
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
  version: "115.0";
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

export type StrategyOneTinyLivePreArmState =
  | "ARMED"
  | "CLAIMED"
  | "COMPLETED"
  | "FAILED_SAFE"
  | "DISARMED"
  | "EXPIRED";

export interface StrategyOneTinyLivePreArmRecord {
  schemaVersion: "125.0";
  id: string;
  state: StrategyOneTinyLivePreArmState;
  market: string;
  buyExchange: "binance" | "bybit";
  sellExchange: "binance" | "bybit";
  capitalPerLegInr: number;
  requiredArmPhrase: string;
  armedAt: number;
  expiresAt: number;
  claimedAt: number | null;
  opportunityId: string | null;
  authorityId: string | null;
  completedAt: number | null;
  executionStatus: string | null;
  failureReason: string | null;
  automaticRetryAllowed: false;
  automaticFundMovementAllowed: false;
  maximumAttempts: 1;
}

export interface StrategyOneTinyLivePreArmDiagnostics {
  schemaVersion: "125.0";
  generatedAt: number;
  runtimeGateEnabled: boolean;
  activeArm: StrategyOneTinyLivePreArmRecord | null;
  triggerInProgress: boolean;
  lastEvaluation: {
    evaluatedAt: number;
    opportunityId: string;
    outcome: "BLOCKED" | "CLAIMED" | "COMPLETED" | "FAILED_SAFE";
    reason: string;
  } | null;
  records: StrategyOneTinyLivePreArmRecord[];
  limits: {
    minimumDurationMinutes: number;
    defaultDurationMinutes: number;
    maximumDurationMinutes: number;
    maximumCapitalPerLegInr: 500;
    maximumAttemptsPerArm: 1;
  };
  safety: {
    exactRouteBound: true;
    freshActionTimePreflightRequired: true;
    durableClaimBeforeOrderAuthority: true;
    existingCoordinatorOnly: true;
    automaticRetryAllowed: false;
    automaticFundMovementAllowed: false;
    withdrawalAllowed: false;
  };
}

export interface StrategyOneTinyLivePreArmDiagnosticsResponse {
  success: true;
  data: StrategyOneTinyLivePreArmDiagnostics;
}

export interface StrategyOneTinyLivePreArmRecordResponse {
  success: true;
  data: StrategyOneTinyLivePreArmRecord;
}

export type StrategyOneTinyLiveAuditCategory =
  | "PROFIT"
  | "FRESHNESS_TIMING"
  | "INVENTORY_RULES"
  | "FEES_DEPTH_STRESS"
  | "VENUE_PERMISSION"
  | "HISTORICAL_EVIDENCE";

export interface StrategyOneTinyLiveOpportunityAuditReport {
  schemaVersion: "126.1";
  generatedAt: number;
  mode: "READ_ONLY_BINANCE_BYBIT_TINY_LIVE_OPPORTUNITY_AUDIT";
  state: "COLLECTING" | "READY_FOR_POLICY_REVIEW";
  thresholds: {
    discoveryNetProfitPercent: number;
    qualificationNetProfitPercent: number;
    liveNetProfitPercent: number;
    dispatchReservedMaximumBookAgeMs: number;
    minimumPolicyReviewSpanMs: number;
  };
  observation: {
    firstObservedAt: number | null;
    lastObservedAt: number | null;
    spanMs: number;
    wallClockSpanMs: number;
    eventSpanMs: number;
    idleSinceLastObservationMs: number | null;
    economicsGenerations: number;
    profitBands: {
      discovered: number;
      qualified: number;
      liveEligible: number;
    };
    dispatchReservedLiveEligibleGenerations: number;
  };
  blockerRanking: Array<{
    rank: number;
    code: string;
    count: number;
    detail: string;
  }>;
  routeRanking: Array<{
    rank: number;
    routeKey: string;
    market: string;
    buyExchange: "binance" | "bybit";
    sellExchange: "binance" | "bybit";
    current: boolean;
    lastObservedAt: number;
    timingReady: boolean;
    economicsGenerations: number;
    liveEligibleGenerations: number;
    qualifiedGenerations: number;
    discoveredGenerations: number;
    dispatchReservedLiveEligibleGenerations: number;
    latestNetProfitPercent: number | null;
    bestNetProfitPercent: number | null;
    p95NetProfitPercent: number | null;
    p50EstimatedFeeImpactPercent: number | null;
    dominantBlocker: string | null;
  }>;
  currentActionTime: {
    state: StrategyOnePilotPreviewState;
    selectedRouteKey: string | null;
    fullyPreflightableMatches: number;
    categories: Array<{
      category: StrategyOneTinyLiveAuditCategory;
      state: "PASS" | "BLOCKED" | "NOT_EVALUATED";
      reasons: string[];
    }>;
    blockers: string[];
  };
  safety: {
    readOnly: true;
    policyMutationAllowed: false;
    automaticFundMovementAllowed: false;
    capitalReserved: false;
    liveSessionCreated: false;
    orderSubmissionAllowed: false;
    orderSubmissionPerformed: false;
  };
}

export interface StrategyOneTinyLiveOpportunityAuditResponse {
  success: true;
  data: StrategyOneTinyLiveOpportunityAuditReport;
}
