export type PerpetualPerpetualPaperClosureState =
  | "NO_DATA"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_DISLOCATION"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export interface PerpetualPerpetualDislocationDiagnostics {
  market: string;
  longExchange: string;
  shortExchange: string;
  longBestAsk: number;
  shortBestBid: number;
  grossTopDislocationPercent: number;
  minimumGrossDislocationPercent: number;
  longFundingRate: number;
  shortFundingRate: number;
  nextFundingTimeLong: number;
  nextFundingTimeShort: number;
}

export interface PerpetualPerpetualRouteEconomics {
  quantity: number;
  longEntryVwap: number;
  shortEntryVwap: number;
  longNotional: number;
  shortNotional: number;
  referenceNotional: number;
  grossDislocationQuote: number;
  grossDislocationPercent: number;
  roundTripFeeQuote: number;
  roundTripFeePercent: number;
  adverseFundingReserveQuote: number;
  adverseFundingReservePercent: number;
  adverseFundingPeriodsReserved: number;
  safetyBufferQuote: number;
  safetyBufferPercent: number;
  expectedNetQuote: number;
  expectedNetPercent: number;
  minimumExpectedNetPercent: number;
  thresholdShortfallPercent: number;
}

export interface PerpetualPerpetualRouteSummary {
  routeId: string;
  market: string;
  firstExchange: string;
  secondExchange: string;
  status: "QUALIFIED" | "BLOCKED";
  blockers: string[];
  dislocation: PerpetualPerpetualDislocationDiagnostics | null;
  economics: PerpetualPerpetualRouteEconomics | null;
}

export interface PerpetualPerpetualVenueEvidence {
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

export interface PerpetualPerpetualPaperClosureReport {
  version: "71.0";
  generatedAt: number;
  strategyId: "perpetual-perpetual-arbitrage";
  mode: "PERPETUAL_PERPETUAL_PAPER_CLOSURE_OBSERVABILITY";
  state: PerpetualPerpetualPaperClosureState;
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
    dislocationEvaluableRoutes: number;
    grossQualifiedRoutes: number;
    economicallyEvaluableRoutes: number;
    netPositiveRoutes: number;
    qualifiedRoutes: number;
    minimumGrossDislocationPercent: number;
    minimumExpectedNetPercent: number;
    adverseFundingPeriodsReserved: number;
    bestGrossRoute: PerpetualPerpetualRouteSummary | null;
    bestNetRoute: PerpetualPerpetualRouteSummary | null;
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
    venues: PerpetualPerpetualVenueEvidence[];
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
    sameContractTwoVenueOnly: true;
    matchedLongShortOnly: true;
    convergenceNotGuaranteed: true;
    roundTripFeesReserved: true;
    adverseFundingReserved: true;
    authenticatedReadsOnly: true;
    balanceOrMarginInferenceAllowed: false;
    profitabilityThresholdMutated: false;
    signalFabricationAllowed: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface PerpetualPerpetualPaperClosureResponse {
  success: true;
  data: PerpetualPerpetualPaperClosureReport;
}
