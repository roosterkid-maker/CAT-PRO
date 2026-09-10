export type LiveOnlyIntelligenceCheckState = "PASS" | "BLOCKED" | "NOT_EVALUATED";

export interface LiveOnlyIntelligencePolicyCheck {
  key: string;
  label: string;
  state: LiveOnlyIntelligenceCheckState;
  current: string;
  required: string;
  reason: string;
}

export interface LiveOnlyIntelligenceLegPlan {
  side: "BUY" | "SELL";
  exchange: string;
  asset: string;
  price: number;
  quantity: number | null;
  requiredBalance: number | null;
  availableBalance: number | null;
  shortfall: number | null;
  balanceSynchronizationStatus: string;
  balanceSnapshotAgeMs: number | null;
  maximumBalanceSnapshotAgeMs: number | null;
  balanceSufficient: boolean;
  explanation: string;
}

export interface OpportunityCapitalFundingStudy {
  buyExchange: string;
  buyAsset: string | null;
  buyRequired: number | null;
  buyAvailable: number | null;
  buyShortfall: number | null;
  buySufficient: boolean;
  sellExchange: string;
  sellAsset: string | null;
  sellRequired: number | null;
  sellAvailable: number | null;
  sellShortfall: number | null;
  sellSufficient: boolean;
}

export interface OpportunityCapitalStudyDecision {
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  opportunityId: string;
  status: "CURRENT_ROUTE_BLOCKED" | "CURRENT_ROUTE_READY";
  executionQualified: boolean;
  capitalActionQualified: boolean;
  currentConsecutiveSamples: number;
  requiredCurrentSamples: number;
  completedQualificationCycles: number;
  requiredQualificationCycles: number;
  totalIndependentSamples: number;
  requiredTotalSamplesForCapital: number;
  effectiveMinimumCurrentNetProfitPercent: number;
  baselineMinimumCurrentNetProfitPercent: number;
  hardMinimumCurrentNetProfitPercent: number;
  latestNetProfitPercent: number;
  latestObservedAt: number;
  latestEvidenceAgeMs: number;
  recommendation: string;
  recommendationDetail: string;
  funding: OpportunityCapitalFundingStudy | null;
  blockers: string[];
  safety: {
    studyOnly: true;
    restartResetsQualification: false;
    hardGatesAutoRelaxed: false;
    recoveryClean: boolean;
    movementAllowed: boolean;
    orderSubmissionAllowed: false;
  };
}

export interface OpportunityCapitalStudyReport {
  schemaVersion: "1.0";
  generatedAt: number;
  running: boolean;
  trackedRoutes: number;
  executionStudyReadyRoutes: number;
  capitalStudyReadyRoutes: number;
  policy: {
    independentSamplesPerExecutionDecision: number;
    qualificationCyclesForCapitalAction: number;
    independentSamplesForCapitalAction: number;
    minimumSampleSpacingMs: number;
    adaptiveCurrentNetLadderPercent: number[];
    postStressNetHardFloorPercent: number;
    maximumBookAgeMs: number;
    maximumBookSkewMs: number;
  };
  routes: OpportunityCapitalStudyDecision[];
}

export interface LiveOnlyIntelligenceOpportunity {
  opportunityId: string;
  market: string;
  route: string;
  status: "READY_FOR_FINAL_EXECUTION" | "BLOCKED" | "ANALYTICAL_ONLY";
  engineDecision: string;
  netProfitPercent: number;
  qualityScore: number;
  generatedAt: number;
  opportunityAgeMs: number;
  requestedCapitalPerLegInr: number;
  maximumCapitalPerLegInr: number;
  estimatedExecutableCapitalInr: number | null;
  estimatedBuyRequirementInr: number | null;
  executionQuantity: number | null;
  buy: LiveOnlyIntelligenceLegPlan;
  sell: LiveOnlyIntelligenceLegPlan;
  postStressNetProfitPercent: number | null;
  postStressNetProfit: number | null;
  deployableCashPostStressNetProfitPercent: number | null;
  tradingFees: number | null;
  statutoryCashWithholding: number | null;
  statutoryCashWithholdingPercent: number | null;
  buyTakerFeePercent: number | null;
  sellTakerFeePercent: number | null;
  blockers: string[];
  whatWouldMakeExecutable: string[];
  policyChecks: LiveOnlyIntelligencePolicyCheck[];
  capitalStudy: OpportunityCapitalStudyDecision | null;
  safety: {
    reportIsReadOnly: true;
    authorityGranted: false;
    orderSubmitted: false;
    finalLastLookStillRequired: true;
  };
}

export interface LiveOnlyRuntimePolicy {
  enabled: boolean;
  minimumCapitalPerLegInr: number;
  preferredCapitalPerLegInr: number;
  maximumCapitalPerLegInr: number;
  minimumCurrentNetProfitPercent: number;
  minimumPostStressNetProfitPercent: number;
  maximumStatutoryCashWithholdingPercentPerAttempt: number;
  maximumOpportunityAgeMs: number;
  routeCooldownMs: number;
  maximumConcurrentTrades: number;
  automaticFundMovementEnabled: boolean;
}

export interface LiveOnlyRuntimeDiagnostics {
  runtimeEnabled: boolean;
  running: boolean;
  inFlight: boolean;
  halted: boolean;
  haltedReason: string | null;
  snapshotsObserved: number;
  candidatesObserved: number;
  preflightBlocks: number;
  attempts: number;
  completed: number;
}

export interface LiveOnlyRecentAttempt {
  opportunityId: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  netProfitPercent: number;
  startedAt: number;
  completedAt: number;
  status: string;
  orderSubmissionMayHaveOccurred: boolean;
  recoveryRequired: boolean;
  possibleExposure: boolean;
  reason: string;
}

export interface LiveOnlyCapitalManagerReport {
  enabled: boolean;
  sameExchangeEnabled: boolean;
  crossExchangeEnabled: boolean;
  maximumPerTransferUsdt: number;
  maximumPerDaySameExchangeUsdt: number;
  maximumPerDayCrossExchangeUsdt: number;
  withdrawalWhitelistEntries: number;
  dedicatedBinanceCredentialsConfigured: boolean;
  runner?: {
    running?: boolean;
    halted?: boolean;
    haltedReason?: string | null;
  };
}

export interface ExchangeFoundationCapability {
  exchange: "giottus" | "mudrex" | "bitbns";
  displayName: string;
  officialDocumentationUrl: string;
  documentedProduct: "SPOT" | "FUTURES" | "LEGACY_SPOT_CLIENT";
  requiredCredentialVariables: string[];
  credentialsConfigured: boolean;
  marketDataAdapterImplemented: false;
  authenticatedReadImplemented: false;
  orderAdapterImplemented: false;
  liveExecutionEnabled: false;
  readinessState: "CREDENTIALS_PENDING" | "SPOT_CONTRACT_REVIEW_REQUIRED";
  blockers: string[];
}

export interface LiveOnlyIntelligenceReport {
  schemaVersion: "1.0";
  generatedAt: number;
  sourceOpportunityCount: number;
  displayedOpportunityCount: number;
  truncated: boolean;
  runtime: LiveOnlyRuntimeDiagnostics;
  policy: LiveOnlyRuntimePolicy;
  policyReference: LiveOnlyIntelligencePolicyCheck[];
  capitalManager: LiveOnlyCapitalManagerReport;
  capitalStudy: OpportunityCapitalStudyReport;
  opportunities: LiveOnlyIntelligenceOpportunity[];
  recentAttempts: LiveOnlyRecentAttempt[];
  exchangeFoundations: ExchangeFoundationCapability[];
  safety: {
    readOnly: true;
    externalRequestPerformed: false;
    balanceMutated: false;
    transferInitiated: false;
    withdrawalInitiated: false;
    orderSubmissionAllowed: false;
  };
}

export interface LiveOnlyIntelligenceResponse {
  success: boolean;
  data: LiveOnlyIntelligenceReport;
}
