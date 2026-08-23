export type SpotPerpetualBasisPaperClosureState =
  | "NO_DATA"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_QUALIFIED_EDGE"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export interface SpotPerpetualBasisRouteSummary {
  routeId: string;
  spotExchange: string;
  perpetualExchange: string;
  market: string;
  status: "QUALIFIED" | "BLOCKED";
  blockers: string[];
  quantity: number;
  spotBuyVwap: number;
  perpetualSellVwap: number;
  grossBasisPercent: number;
  entryFeeQuote: number;
  exitFeeReserveQuote: number;
  totalFeeQuote: number;
  totalFeePercent: number;
  fundingRate: number;
  expectedFundingQuote: number;
  expectedFundingPercent: number;
  fundingQualificationCreditQuote: number;
  positiveFundingExcludedFromQualification: boolean;
  slippageBufferQuote: number;
  spotSlippageBufferPercent: number;
  perpetualSlippageBufferPercent: number;
  safetyBufferQuote: number;
  safetyBufferPercent: number;
  expectedNetQuote: number;
  expectedNetPercent: number;
  minimumExpectedNetPercent: number;
  thresholdShortfallPercent: number;
}

export interface SpotPerpetualBasisVenueEvidence {
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

export interface SpotPerpetualBasisPaperClosureReport {
  version: "176.0";
  generatedAt: number;
  strategyId: "spot-perpetual-basis-arbitrage";
  mode: "SPOT_PERPETUAL_BASIS_PAPER_CLOSURE_OBSERVABILITY";
  state: SpotPerpetualBasisPaperClosureState;
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
    economicallyEvaluableRoutes: number;
    grossPositiveRoutes: number;
    netPositiveRoutes: number;
    qualifiedRoutes: number;
    minimumExpectedNetPercent: number;
    closeAtOrBelowAbsoluteBasisPercent: number;
    nextOpeningDelayMs: number;
    perpetualLeverage: 1;
    bestRoute: SpotPerpetualBasisRouteSummary | null;
    dominantBlockers: Array<{code: string; count: number}>;
  };
  derivativeEvidence: {
    targetQuoteCapital: number;
    configuredVenues: number;
    authenticatedReadReadyVenues: number;
    targetMarginCoveredVenues: number;
    feeConfiguredVenues: number;
    paperEvidenceReadyVenues: number;
    venues: SpotPerpetualBasisVenueEvidence[];
  };
  topology: {
    spotVenues: 6;
    perpetualVenues: 5;
    totalVenueCombinationsPerSharedMarket: 30;
    intraExchangeCombinationsPerSharedMarket: 5;
    crossExchangeCombinationsPerSharedMarket: 25;
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
    authenticatedReadsOnly: true;
    balanceOrMarginInferenceAllowed: false;
    feesAndRulesRemainRequired: true;
    profitabilityThresholdMutated: false;
    signalFabricationAllowed: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface SpotPerpetualBasisPaperClosureResponse {
  success: true;
  data: SpotPerpetualBasisPaperClosureReport;
}
