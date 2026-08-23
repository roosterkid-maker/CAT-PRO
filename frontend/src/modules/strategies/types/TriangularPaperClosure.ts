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
  expectedNetProfitQuantity: number | null;
  expectedNetProfitPercent: number | null;
  stressNetProfitQuantity: number | null;
  stressNetProfitPercent: number | null;
  absoluteNetProfitInr: number | null;
  startAssetInrValue: number | null;
  tdsCapitalLockInr: number | null;
  reserveDragPercent: number;
  maximumBookSkewMs: number | null;
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
    feeAmount: number;
    feeAsset: string;
    outputAfterFee: number;
    averageFillPrice: number;
    topOfBookPrice: number;
    depthSlippagePercent: number;
    roundingDustInputQuantity: number;
    consumedDepthLevels: number;
    orderBookAgeMs: number;
    executionPolicy: "FOK_OR_IOC_LIMIT_FUTURE_ONLY";
  }>;
}

export interface AclaCapitalPool {
  totalAllocationInr: number;
  activeCycleCapitalInr: number;
  activeFreeInr: number;
  reservedInr: number;
  inFlightInr: number;
  recoveryReserveInr: number;
  recoveryReserveInUseInr: number;
  feeTdsDustReserveInr: number;
  tdsLockedInr: number;
  dustLedgerInr: number;
  dustByAsset: Record<string, number>;
  realizedPnlInr: number;
  reinvestedProfitInr: number;
  sweepableProfitInr: number;
  sweptProfitInr: number;
  tdsCreditReleasedInr: number;
  completedCycles: number;
  failedCycles: number;
  recoveredCycles: number;
  consecutiveFailedCycles: number;
  dailyLossInr: number;
  dailyLossDateKey: string;
  circuitBreakerState: "OPEN" | "TRIPPED";
  circuitBreakerReason: string | null;
  openCycleId: string | null;
}

export interface AclaCapitalReport {
  generatedAt: number;
  restoredAt: number | null;
  pool: AclaCapitalPool;
  openCycle: {id: string; state: string; pathId: string; exchange: string} | null;
  recentCycles: Array<{id: string; state: string; pathId: string; exchange: string; realizedPnlInr: number | null; updatedAt: number}>;
  invariant: {
    activeBalanced: boolean;
    configuredBalanced: boolean;
    openCycleConsistent: boolean;
    feeReserveNonNegative: boolean;
    recoveryReserveProtected: boolean;
  };
  configuration: {
    compoundingMode: "FIXED" | "COMPOUND" | "HYBRID";
    hybridReinvestmentPercent: number;
    maximumCycleLossInr: number;
    dailyLossLimitInr: number;
    maximumConsecutiveFailedCycles: number;
    minimumCapitalProtectionInr: number;
  };
  safety: {shadowOnly: true; paperExecutionAllowed: false; liveExecutionAllowed: false; orderSubmissionAllowed: false};
}

export interface AclaLifecycleReport {
  running: boolean;
  admissionsObserved: number;
  admitted: number;
  completed: number;
  rejected: number;
  failed: number;
  cyclesInRollingHour: number;
  lastError: string | null;
  dominantBlockers: Array<{code: string; count: number}>;
  recentOutcomes: Array<{signalId: string; pathId: string | null; state: "COMPLETED" | "REJECTED" | "FAILED"; reason: string; cycleId: string | null; generatedAt: number}>;
}

export interface AclaPerformanceReport {
  affectedRouteWakeups: number;
  affectedPathsEvaluated: number;
  affectedPathsFastScreened: number;
  fullSnapshotPathsEvaluated: number;
  lastEvaluationDurationMs: number;
  dependencyMarkets: number;
  indexedPaths: number;
  pendingAffectedPaths: number;
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
  acla: {
    strategyName: "ADAPTIVE_CLOSED_LOOP_ARBITRAGE";
    rolloutStage: "SHADOW";
    configuration: {
      fastScreenMinimumGrossProfitPercent: number;
      minimumNetProfitPercent: number;
      minimumAbsoluteNetProfitInr: number;
      maximumOrderBookAgeMs: number;
      maximumOpportunityAgeMs: number;
      maximumBookTimestampSkewMs: number;
      slippageReservePercent: number;
      adverseMoveReservePercent: number;
      safetyBufferPercent: number;
      tdsCapitalLockPercent: number;
      routeCooldownMs: number;
      maximumCyclesPerHour: number;
      allowedExchanges: string[];
      allowedStartingAssets: string[];
    };
    capital: AclaCapitalReport | null;
    lifecycle: AclaLifecycleReport | null;
    performance: AclaPerformanceReport | null;
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
