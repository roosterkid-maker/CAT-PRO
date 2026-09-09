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
  balanceSnapshotAgeMs: number | null;
  maximumBalanceSnapshotAgeMs: number | null;
  balanceSufficient: boolean;
  explanation: string;
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
  blockers: string[];
  whatWouldMakeExecutable: string[];
  policyChecks: LiveOnlyIntelligencePolicyCheck[];
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
