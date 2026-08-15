export type TriangularPaperClosureState =
  | "NO_DATA"
  | "WAITING_FOR_QUALIFIED_EDGE"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export interface TriangularPathSummary {
  pathId: string;
  exchange: string;
  assets: string[];
  grossProfitPercent: number;
  referenceFeeAdjustedProfitPercent: number | null;
  feeDragPercent: number | null;
  quantizationDragPercent: number | null;
  netProfitPercent: number | null;
  initialSizingLimitQuantity: number;
  initialInputQuantity: number;
  retainedStartQuantity: number;
  capitalUtilizationPercent: number;
  finalOutputQuantity: number | null;
  status: "QUALIFIED" | "BLOCKED";
  blockers: string[];
  legs: Array<{
    market: string;
    fromAsset: string;
    toAsset: string;
    action: "SELL_BASE" | "BUY_BASE";
    inputQuantity: number;
    tradedInputQuantity: number;
    feePercent: number;
    outputAfterFee: number;
  }>;
}

export interface TriangularPaperClosureReport {
  version: "87.0";
  generatedAt: number;
  strategyId: "triangular-arbitrage";
  mode: "TRIANGULAR_PAPER_CLOSURE_OBSERVABILITY";
  state: TriangularPaperClosureState;
  message: string;
  controller: {
    running: boolean;
    currentSignals: number;
    totalSignalsObserved: number;
    lastSignalObservedAt: number | null;
  };
  economics: {
    evidenceState: "CURRENT" | "RECENT_LAST_ECONOMIC" | "NO_DATA";
    evidenceAgeMs: number | null;
    currentEvaluatedPaths: number;
    sourceSnapshotGeneratedAt: number | null;
    evaluatedPaths: number;
    economicallyEvaluablePaths: number;
    grossPositivePaths: number;
    netPositivePaths: number;
    qualifiedPaths: number;
    minimumNetProfitPercent: number;
    bestGrossPath: TriangularPathSummary | null;
    bestNetPath: TriangularPathSummary | null;
    nearestPaths: TriangularPathSummary[];
    exchanges: Array<{
      exchange: string;
      evaluatedPaths: number;
      economicallyEvaluablePaths: number;
      grossPositivePaths: number;
      netPositivePaths: number;
      qualifiedPaths: number;
      bestNetProfitPercent: number | null;
    }>;
    thresholdShortfallPercent: number | null;
    dominantBlockers: Array<{code: string; count: number}>;
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
  fundingPolicy: {
    upfrontWalletBalanceLegs: readonly [1];
    previousLegProceedsFundedLegs: readonly [2, 3];
    startAsset: string | null;
    intermediateWalletBalanceRequired: false;
    previousLegFeeAdjustedProceedsRequired: true;
  };
  safety: {
    readOnlyAggregation: true;
    genuineMarketPathsOnly: true;
    feesAndRulesRemainRequired: true;
    profitabilityThresholdMutated: false;
    signalFabricationAllowed: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface TriangularPaperClosureResponse {
  success: true;
  data: TriangularPaperClosureReport;
}
