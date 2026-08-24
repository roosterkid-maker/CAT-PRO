export type FundingRatePaperClosureState =
  | "NO_DATA"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_FUNDING_EDGE"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export interface FundingRateDifferentialDiagnostics {
  market: string;
  longExchange: string;
  shortExchange: string;
  longFundingRate: number;
  shortFundingRate: number;
  fundingDifferentialPercent: number;
  minimumFundingDifferentialPercent: number;
  longFundingIntervalMinutes: number;
  shortFundingIntervalMinutes: number;
  nextFundingTimeLong: number;
  nextFundingTimeShort: number;
  fundingTimeSkewMs: number;
}

export interface FundingRateRouteEconomics {
  quantity: number;
  longEntryVwap: number;
  shortEntryVwap: number;
  longNotional: number;
  shortNotional: number;
  referenceNotional: number;
  singlePeriodExpectedFundingQuote: number;
  singlePeriodExpectedFundingPercent: number;
  modeledFundingPeriods: number;
  minimumQualifyingFundingPeriods: number;
  maximumFundingPeriodsToCapture: number;
  projectedHoldingTimeMs: number;
  expectedFundingQuote: number;
  expectedFundingPercent: number;
  entryBasisCostQuote: number;
  entryBasisCostPercent: number;
  roundTripFeeQuote: number;
  roundTripFeePercent: number;
  safetyBufferQuote: number;
  safetyBufferPercent: number;
  expectedNetQuote: number;
  expectedNetPercent: number;
  minimumExpectedNetPercent: number;
  thresholdShortfallPercent: number;
}

export interface FundingRateRouteSummary {
  routeId: string;
  market: string;
  status: "QUALIFIED" | "BLOCKED";
  blockers: string[];
  differential: FundingRateDifferentialDiagnostics;
  economics: FundingRateRouteEconomics | null;
}

export interface FundingRateVenueEvidence {
  exchange: string;
  configured: boolean;
  state: "READY" | "DEGRADED" | "NO_DATA";
  authenticatedReadReady: boolean;
  positionMarkets: number;
  availableMargin: number | null;
  availableMarginUnit: "USDT" | "ACCOUNT_USD_VALUE" | null;
  targetMarginCovered: boolean;
  feeConfigured: boolean;
  paperEvidenceReady: boolean;
  lastSuccessAt: number | null;
  lastError: string | null;
}

export interface FundingRatePaperClosureReport {
  version: "88.0";
  generatedAt: number;
  strategyId: "funding-rate-arbitrage";
  mode: "FUNDING_RATE_PAPER_CLOSURE_OBSERVABILITY";
  state: FundingRatePaperClosureState;
  message: string;
  controller: {
    running: boolean;
    currentSignals: number;
    totalSignalsObserved: number;
    lastSignalObservedAt: number | null;
  };
  economics: {
    sourceSnapshotGeneratedAt: number | null;
    evaluatedRoutes: number;
    differentialEvaluableRoutes: number;
    differentialQualifiedRoutes: number;
    economicallyEvaluableRoutes: number;
    netPositiveRoutes: number;
    qualifiedRoutes: number;
    minimumFundingDifferentialPercent: number;
    minimumExpectedNetPercent: number;
    maximumFundingPeriodsToCapture: number;
    bestDifferentialRoute: FundingRateRouteSummary | null;
    bestNetRoute: FundingRateRouteSummary | null;
    dominantBlockers: Array<{code: string; count: number}>;
  };
  derivativeEvidence: {
    targetQuoteNotional: number;
    configuredVenues: number;
    authenticatedReadReadyVenues: number;
    targetMarginCoveredVenues: number;
    feeConfiguredVenues: number;
    paperEvidenceReadyVenues: number;
    paperEvidenceReadyRoutes: number;
    venues: FundingRateVenueEvidence[];
  };
  lineage: {
    admissionsObserved: number;
    plansAdmitted: number;
    latestPlanAdmissionDecision: string | null;
    intakeObserved: number;
    latestPlanIntakeState: string | null;
    latestPlanIntakeBlockers: string[];
    activeQueue: number;
    completedQueue: number;
  };
  safety: {
    readOnlyAggregation: true;
    sameMarketTwoVenueOnly: true;
    intraRouteLongSpotShortPerpetualOnly?: true;
    matchedLongShortOnly: true;
    expectedFundingNotGuaranteed: true;
    projectedFundingRatePersistenceRequired: true;
    favorableEntryBasisExcluded: true;
    roundTripFeesReserved: true;
    authenticatedReadsOnly: true;
    balanceOrMarginInferenceAllowed: false;
    profitabilityThresholdMutated: false;
    signalFabricationAllowed: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface FundingRatePaperClosureResponse {
  success: true;
  data: FundingRatePaperClosureReport;
}
