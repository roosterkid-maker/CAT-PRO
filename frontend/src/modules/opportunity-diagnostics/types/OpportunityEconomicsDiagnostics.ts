export interface DiagnosticResponse<T> {
  success: boolean;

  data: T;
}

export interface OpportunityNearMissRoute {
  market: string;

  buyExchange: string;

  sellExchange: string;

  status:
    | "REJECTED"
    | "ACCEPTED";

  classification:
    | "SUSPICIOUS_BOOK"
    | "SMALL_CAP_CANDIDATE"
    | "REJECTED"
    | "ACCEPTED";

  blockers: Array<{
    stage: string;
    code: string;
    reason: string;
  }>;

  requestedCapitalInr:
    | number
    | null;

  quoteAsset:
    | string
    | null;

  requestedQuoteCapital:
    | number
    | null;

  executableQuoteCapital:
    | number
    | null;

  executableCapitalInr:
    | number
    | null;

  rejectionStage:
    | string
    | null;

  rejectionCode:
    | string
    | null;

  rejectionReason:
    | string
    | null;

  rawSpreadPercent:
    | number
    | null;

  netProfitPercent:
    | number
    | null;

  estimatedFees:
    | number
    | null;

  spreadBand:
    | string
    | null;

  distanceToDiscoveryPercent:
    | number
    | null;

  distanceToQualificationPercent:
    | number
    | null;

  distanceToLivePercent:
    | number
    | null;
}

export interface OpportunityNearMissAnalyticsReport {
  generatedAt: number;

  scanStartedAt:
    | number
    | null;

  scanCompletedAt:
    | number
    | null;

  mode:
    "READ_ONLY_NEAR_MISS_ANALYTICS";

  executionAllowed: false;

  policy: {
    minimumSpreadPercent:
      | number
      | null;

    discoveryMinimumNetProfitPercent:
      number;

    qualificationMinimumNetProfitPercent:
      number;

    liveMinimumNetProfitPercent:
      number;
  };

  pipeline: {
    cachedQuotes: number;

    executionQualityEligibleQuotes:
      number;

    marketSnapshots: number;

    exchangePairs: number;

    acceptedOpportunities:
      number;

    economicallyEvaluatedPairs:
      number;

    rawPositiveSpreads:
      number;

    feePositiveSpreads:
      number;

    evaluatorRejectedPairs:
      number;
  };

  spreadBands: {
    negative: number;

    zeroToDiscovery: number;

    discoveryToQualification:
      number;

    qualificationToLive:
      number;

    livePlus: number;
  };

  rejectionSummary: {
    totalCurrentScanRejections:
      number;

    economicallyEvaluatedRejections:
      number;

    notEconomicallyEvaluated:
      number;

    byStage:
      Partial<
        Record<
          string,
          number
        >
      >;

    byCode:
      Partial<
        Record<
          string,
          number
        >
      >;
  };

  topNearMisses:
    OpportunityNearMissRoute[];

  notEconomicallyEvaluatedSamples:
    OpportunityNearMissRoute[];

  observations: string[];
}

export type FeeExecutionStyle =
  | "TAKER_TAKER"
  | "MAKER_TAKER"
  | "TAKER_MAKER"
  | "MAKER_MAKER";

export interface FeeAwareScenario {
  style: FeeExecutionStyle;

  buyFeePercent: number;

  sellFeePercent: number;

  exactFeeBurdenPercent:
    number;

  netAfterTradingFeesPercent:
    number;

  breakEvenRawSpreadPercent:
    number;

  rawSpreadRequiredForDiscoveryPercent:
    number;

  rawSpreadRequiredForQualificationPercent:
    number;

  rawSpreadRequiredForLivePercent:
    number;

  currentSpreadMeetsBreakEven:
    boolean;

  currentSpreadMeetsDiscovery:
    boolean;

  currentSpreadMeetsQualification:
    boolean;

  currentSpreadMeetsLive:
    boolean;
}

export interface FeeAwareRouteAnalysis {
  market: string;

  buyExchange: string;

  sellExchange: string;

  rawSpreadPercent: number;

  currentTakerTakerNetProfitPercent:
    | number
    | null;

  scenarios:
    FeeAwareScenario[];

  bestFeeOnlyScenario:
    FeeExecutionStyle;

  bestFeeOnlyNetPercent:
    number;

  makerExecutionWarning:
    string;
}

export interface FeeAwareStrategyAnalyticsReport {
  generatedAt: number;

  mode:
    "READ_ONLY_FEE_STRATEGY_ANALYSIS";

  executionAllowed: false;

  feeRegistrySource:
    "MARKET_AWARE_EVIDENCE";

  feeRegistryWarning: string;

  profitPolicy: {
    discoveryMinimumNetProfitPercent:
      number;

    qualificationMinimumNetProfitPercent:
      number;

    liveMinimumNetProfitPercent:
      number;
  };

  analyzedRoutes: number;

  routes:
    FeeAwareRouteAnalysis[];

  observations: string[];
}

export type FeeVerificationStatus =
  | "VERIFIED"
  | "MISMATCH"
  | "NOT_CONFIGURED"
  | "UNSUPPORTED_BY_CURRENT_API"
  | "AUTH_FAILED"
  | "FAILED";

export type FeeEvidenceQuality =
  | "ACCOUNT_SYMBOL_EXACT"
  | "ACCOUNT_STANDARD_COMPONENT_ONLY"
  | "STATIC_ONLY";

export interface AccountFeeVerificationExchange {
  exchange:
    | "binance"
    | "bybit"
    | "coindcx";

  symbol: string;

  status:
    FeeVerificationStatus;

  evidenceQuality:
    FeeEvidenceQuality;

  configured: boolean;

  staticMakerPercent: number;

  staticTakerPercent: number;

  accountMakerPercent:
    | number
    | null;

  accountTakerPercent:
    | number
    | null;

  makerDifferencePercent:
    | number
    | null;

  takerDifferencePercent:
    | number
    | null;

  matchesStatic:
    | boolean
    | null;

  errorClassification:
    | string
    | null;

  reasons: string[];
}

export interface AccountFeeVerificationReport {
  generatedAt: number;

  mode:
    "READ_ONLY_ACCOUNT_FEE_VERIFICATION";

  liveExecutionAllowed: false;

  staticRegistryMutationAllowed:
    false;

  symbol: string;

  verifiedExchanges: number;

  mismatchedExchanges: number;

  unresolvedExchanges: number;

  safeToTrustStaticRegistryForLive:
    boolean;

  exchanges:
    AccountFeeVerificationExchange[];

  blockers: string[];

  observations: string[];
}

export type OpportunityNearMissAnalyticsResponse =
  DiagnosticResponse<
    OpportunityNearMissAnalyticsReport
  >;

export type FeeAwareStrategyAnalyticsResponse =
  DiagnosticResponse<
    FeeAwareStrategyAnalyticsReport
  >;

export type AccountFeeVerificationResponse =
  DiagnosticResponse<
    AccountFeeVerificationReport
  >;
