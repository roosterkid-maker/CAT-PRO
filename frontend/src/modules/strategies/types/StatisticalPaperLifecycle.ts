export type StatisticalPaperLifecycleState =
  | "RESEARCH_BLOCKED"
  | "AWAITING_ENTRY_SIGNAL"
  | "AWAITING_CENTRAL_ADMISSION"
  | "CENTRAL_ADMISSION_BLOCKED"
  | "PLAN_COMPILATION_BLOCKED"
  | "PAPER_ADMISSION_BLOCKED"
  | "PAPER_ADMISSION_ELIGIBLE"
  | "INTAKE_BLOCKED"
  | "QUEUED"
  | "DUPLICATE";

export type StatisticalPaperClosureState =
  | "NO_DATA"
  | "RESEARCH_BLOCKED"
  | "DERIVATIVE_EVIDENCE_BLOCKED"
  | "WAITING_FOR_ENTRY_DISLOCATION"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export interface StatisticalDerivativeVenueEvidence {
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

export interface StatisticalPaperGateSet {
  runtimeEnabled: boolean;
  strategyAllowed: boolean;
  planCurrent: boolean;
  evidenceCurrent: boolean;
  accountReady: boolean;
  capitalApproved: boolean;
  riskApproved: boolean;
  everyLegReady: boolean;
  controlsReady: boolean;
  researchPromotionReady: boolean;
}

export interface StatisticalPaperLifecycleLane {
  pairId: string;
  exchange: string;
  leftMarket: string;
  rightMarket: string;
  state: StatisticalPaperLifecycleState;
  research: {
    state: "PROMOTED" | "COLLECTING_HISTORY" | "REJECTED";
    rankScore: number | null;
    sampleCount: number;
    walkForwardPassed: boolean;
    regimeAdmitted: boolean;
  };
  lineage: {
    signalId: string | null;
    centralAdmissionId: string | null;
    planId: string | null;
    paperAdmissionId: string | null;
    intakeId: string | null;
    queueRecordId: string | null;
  };
  plan: {
    pattern: "PARALLEL_STATISTICAL_PAIR";
    legs: number;
    expiresAt: number;
    current: boolean;
  } | null;
  dryRun: {
    evaluated: boolean;
    state: "NOT_APPLICABLE" | "BLOCKED" | "ELIGIBLE";
    requestedCapitalInr: number | null;
    gates: StatisticalPaperGateSet | null;
    legs: Array<{
      legId: string;
      ready: boolean;
      balanceVerified: boolean;
      paperAdapterSupported: boolean;
      marketRulesVerified: boolean;
      feeEvidenceFresh: boolean;
      quoteFresh: boolean;
    }>;
    blockers: string[];
  };
  actualIntakeState: "IGNORED_STRATEGY_ONE" | "BLOCKED" | "QUEUED" | "DUPLICATE" | "FAILED" | "NOT_OBSERVED";
  queueState: "QUEUED" | "LEASED" | "COMPLETED" | "REJECTED" | "EXPIRED" | "NOT_QUEUED";
  blockers: string[];
}

export interface StatisticalPaperLifecycleResponse {
  success: boolean;
  data: {
    version: "73.0";
    generatedAt: number;
    strategyId: "statistical-arbitrage";
    mode: "STATISTICAL_ARBITRAGE_PAPER_CLOSURE_OBSERVABILITY";
    state: StatisticalPaperClosureState;
    message: string;
    evidenceStatus: "AVAILABLE" | "NO_DATA";
    controller: {
      running: boolean;
      currentSignals: number;
      totalSignalsObserved: number;
      lastSignalObservedAt: number | null;
    };
    research: {
      eligibleMarkets: number;
      candidatePairs: number;
      selectedPairs: number;
      promotedPairs: number;
      collectingPairs: number;
      rejectedPairs: number;
      signalEligiblePairs: number;
      minimumSamplesForRequiredFolds: number | null;
      minimumOutOfSampleTrades: number | null;
      closestCandidate: {
        pairId: string;
        state: "PROMOTED" | "COLLECTING_HISTORY" | "REJECTED";
        sampleCount: number;
        outOfSampleTrades: number;
        rankScore: number;
        blockers: string[];
      } | null;
      dominantBlockers: Array<{code: string; count: number}>;
    };
    economics: {
      sourceSnapshotGeneratedAt: number | null;
      evaluatedPairs: number;
      qualifiedPairs: number;
      blockedPairs: number;
      bestQualifiedPair: {
        pairId: string;
        exchange: string;
        direction: string;
        zScore: number;
        entryZScoreThreshold: number;
        modeledNetQuote: number;
        modeledNetPercent: number;
      } | null;
      dominantBlockers: Array<{code: string; count: number}>;
    };
    derivativeEvidence: {
      targetQuoteNotionalPerLeg: number;
      conservativePairMarginTarget: number;
      configuredVenues: number;
      authenticatedReadReadyVenues: number;
      targetMarginCoveredVenues: number;
      feeConfiguredVenues: number;
      paperEvidenceReadyVenues: number;
      paperEvidenceReadyPairs: number;
      venues: StatisticalDerivativeVenueEvidence[];
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
    summary: {
      selectedPairs: number;
      researchPromoted: number;
      currentSignals: number;
      plansCompiled: number;
      dryRunsEvaluated: number;
      paperEligible: number;
      paperBlocked: number;
      queued: number;
    };
    lanes: StatisticalPaperLifecycleLane[];
    safety: {
      readOnlyObservability: true;
      actualSignalsOnly: true;
      syntheticSignalsAllowed: false;
      previewQueueMutationPerformed: false;
      capitalReservationMutationPerformed: false;
      paperExecutionPerformed: false;
      researchThresholdsMutated: false;
      signalFabricationAllowed: false;
      balanceOrMarginInferenceAllowed: false;
      cointegrationVerified: false;
      meanReversionGuaranteed: false;
      liveExecutionAllowed: false;
      orderSubmissionAllowed: false;
    };
  };
}
