export type EightStrategyPaperGateState = "PASSED" | "WAITING" | "BLOCKED" | "NOT_APPLICABLE";
export type EightStrategyPaperOperationalState =
  | "BLOCKED"
  | "READY_FOR_SIGNAL"
  | "READY_FOR_ADMISSION"
  | "PAPER_ACTIVE"
  | "SOAK_IN_PROGRESS"
  | "SOAK_ACCEPTED";
export type EightStrategyPaperClosureOwner =
  | "OPERATOR"
  | "EXCHANGE_CREDENTIALS"
  | "MARKET_EVIDENCE"
  | "STRATEGY_RUNTIME"
  | "CENTRAL_PAPER"
  | "SOAK_EVIDENCE"
  | "NONE";
export type EightStrategyPaperConvergencePriority = "P0" | "P1" | "P2" | "P3";
export type EightStrategyPaperConvergencePhase =
  | "CONTROL_PLANE"
  | "EVIDENCE_PREREQUISITE"
  | "SIGNAL_QUALIFICATION"
  | "PAPER_LIFECYCLE"
  | "SOAK_ACCEPTANCE"
  | "MAINTENANCE";
export type EightStrategyPaperConvergenceState =
  | "ACTION_REQUIRED"
  | "WAITING_FOR_EVIDENCE"
  | "IN_PROGRESS"
  | "COMPLETE";
export type EightStrategyRemediationClass =
  | "CODE_FIXED"
  | "EXTERNAL_ACTION_REQUIRED"
  | "MARKET_WAIT"
  | "PAPER_EVIDENCE_WAIT"
  | "VERIFIED_HEALTHY";

export type CentralPaperTraceStageId =
  | "ADMISSION" | "INTAKE" | "QUEUE" | "JOURNAL" | "POSITION" | "ACCOUNTING" | "SOAK";
export type CentralPaperTraceStageState = "PASSED" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "NOT_REACHED";
export type CentralPaperTraceState = "BLOCKED" | "WAITING" | "ACTIVE" | "CLOSED_ACCOUNTED" | "SOAK_ACCEPTED";
export type CentralPaperPlanPrerequisiteState = "DEFERRED" | "DUE_AT_STAGE" | "RESOLVED";

export interface CentralPaperLifecycleTrace {
  planId: string;
  strategyId: string;
  signalId: string | null;
  state: CentralPaperTraceState;
  currentStage: CentralPaperTraceStageId;
  passedStages: number;
  totalStages: number;
  latestActivityAt: number;
  stages: Array<{
    id: CentralPaperTraceStageId;
    state: CentralPaperTraceStageState;
    detail: string;
    evidenceId: string | null;
    observedAt: number | null;
  }>;
  blockers: string[];
  integrityBlockers: string[];
  planPrerequisites: Array<{
    code: string;
    ownerStage: CentralPaperTraceStageId;
    state: CentralPaperPlanPrerequisiteState;
    blocksCurrentStage: boolean;
  }>;
  nextTransition: string;
  closedPnlInr: number | null;
  executionTriggeredByRead: false;
  accountMutationPerformedByRead: false;
  liveExecutionAllowed: false;
  orderSubmissionAllowed: false;
}

export interface CentralPaperLifecycleTraceReport {
  version: "76.0";
  generatedAt: number;
  mode: "CENTRAL_PAPER_EXACT_LIFECYCLE_TRACE";
  summary: {
    targetStrategies: 7;
    plansObserved: number;
    blocked: number;
    waiting: number;
    active: number;
    closedAccounted: number;
    soakAccepted: number;
    lineageIntegrityFailures: number;
    deferredPrerequisites: number;
    prerequisitesDueAtCurrentStage: number;
  };
  strategies: Array<{
    strategyId: string;
    strategyNumber: number;
    plansObserved: number;
    latestTrace: CentralPaperLifecycleTrace | null;
    lifecycleState: CentralPaperTraceState;
    currentStage: CentralPaperTraceStageId;
    nextTransition: string;
  }>;
  recentTraces: CentralPaperLifecycleTrace[];
  safety: {
    readOnlyAggregation: true;
    actualPlanIdsOnly: true;
    exactLineageRequired: true;
    missingEvidenceFailsClosed: true;
    modeledLifecycleCompletionAllowed: false;
    executionTriggered: false;
    accountMutationPerformed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface CrossExchangeMarketMakingInventoryRoutingReport {
  version: "77.0";
  generatedAt: number;
  mode: "XEMM_INVENTORY_AWARE_DIRECTION_SELECTION";
  summary: {
    evaluations: number;
    feasible: number;
    blocked: number;
    currentRoutes: number;
    feasibleRoutes: number;
    blockedRoutes: number;
    lastFeasibleAt: number | null;
  };
  routes: Array<{
    version: "77.0";
    id: string;
    generatedAt: number;
    routeKey: string;
    market: string;
    side: "BID" | "ASK";
    makerExchange: string;
    hedgeExchange: string;
    quantity: number | null;
    state: "FEASIBLE" | "BLOCKED";
    requirements: Array<{
      role: "MAKER" | "HEDGE";
      action: "BUY" | "SELL";
      exchange: string;
      asset: string;
      requiredAmount: number;
      availableAmount: number | null;
      synchronizedAt: number | null;
      ageMs: number | null;
      state: "VERIFIED" | "NOT_SYNCHRONIZED" | "STALE" | "INSUFFICIENT";
    }>;
    blockers: string[];
    safety: CrossExchangeMarketMakingInventorySafety;
  }>;
  safety: CrossExchangeMarketMakingInventorySafety;
}

export interface CrossExchangeMarketMakingInventorySafety {
  readOnly: true;
  inferredBalanceAllowed: false;
  balanceMutationPerformed: false;
  transferPerformed: false;
  paperExecutionTriggered: false;
  liveExecutionAllowed: false;
  orderSubmissionAllowed: false;
}

export interface CrossExchangeMarketMakingVenueRoutingReport {
  version: "79.0";
  generatedAt: number;
  mode: "STABLE_OPERATOR_APPROVED_XEMM_FAILOVER";
  summary: {
    operatorApprovedPairs: number;
    markets: number;
    directionsEvaluated: number;
    priceQualified: number;
    inventoryQualified: number;
    qualifying: number;
    stable: number;
    selected: number;
    selectedCandidateKey: string | null;
    activeSince: number | null;
    lastTransitionAt: number | null;
    cooldownUntil: number | null;
  };
  candidates: Array<{
    version: "79.0";
    id: string;
    generatedAt: number;
    candidateKey: string;
    pairPriority: number;
    rank: number | null;
    market: string;
    side: "BID" | "ASK";
    makerExchange: string;
    hedgeExchange: string;
    priceState: "QUALIFIED" | "BLOCKED";
    inventoryState: "FEASIBLE" | "BLOCKED" | "NOT_EVALUATED";
    selectionState: "SELECTED" | "STABLE_CANDIDATE" | "QUALIFYING" | "COOLDOWN" | "BLOCKED";
    stabilityState: "ACTIVE" | "STABLE" | "QUALIFYING" | "COOLDOWN" | "RESET";
    consecutivePasses: number;
    minimumConsecutivePasses: number;
    qualifiedSince: number | null;
    dwellAgeMs: number;
    minimumDwellMs: number;
    modeledRetainedEdgePercent: number | null;
    inventoryRequirements: CrossExchangeMarketMakingInventoryRoutingReport["routes"][number]["requirements"];
    blockers: string[];
  }>;
  recentTransitions: Array<{
    id: string;
    at: number;
    type: "ACTIVATED" | "LOST";
    fromCandidateKey: string | null;
    toCandidateKey: string | null;
    reason: "INITIAL_STABLE_ROUTE" | "STABLE_FAILOVER_ROUTE" | "ACTIVE_ROUTE_NO_LONGER_FEASIBLE";
  }>;
  safety: {
    operatorApprovedPairsOnly: true;
    deterministicRanking: true;
    priceQualificationRequired: true;
    freshInventoryRequired: true;
    consecutiveQualificationRequired: true;
    minimumDwellRequired: true;
    stickyWhileHealthy: true;
    routeLossFailsClosed: true;
    cooldownBypassAllowed: false;
    inferredVenueAllowed: false;
    inferredBalanceAllowed: false;
    balanceMutationPerformed: false;
    transferPerformed: false;
    paperExecutionTriggered: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface EightStrategyPaperGate {
  state: EightStrategyPaperGateState;
  detail: string;
  evidenceCount: number;
}

export interface EightStrategyPaperAction {
  code: string;
  detail: string;
  owner: EightStrategyPaperClosureOwner;
  automaticallyPerformed: false;
}

export interface EightStrategyPaperReadinessItem {
  strategyId: string;
  strategyNumber: number;
  displayName: string;
  paperPath: "EXISTING_STRATEGY_ONE" | "CENTRAL_MULTI_STRATEGY";
  operationalState: EightStrategyPaperOperationalState;
  operationalGatesPassed: number;
  operationalGatesTotal: number;
  controller: {registered: boolean; running: boolean; lastError: string | null};
  signalEvidence: {current: number; observed: number; lastObservedAt: number | null; topBlockers: string[]};
  stages: {
    controller: EightStrategyPaperGate;
    signal: EightStrategyPaperGate;
    operator: EightStrategyPaperGate;
    admission: EightStrategyPaperGate;
    runtimeEvidence: EightStrategyPaperGate;
    queue: EightStrategyPaperGate;
    soak: EightStrategyPaperGate;
  };
  lineage: {
    admissions: number;
    latestAdmissionDecision: string | null;
    intakeRecords: number;
    latestIntakeState: string | null;
    queueRecords: number;
    activeQueue: number;
    completedQueue: number;
    latestQueueState: string | null;
  };
  soak: {
    state: "SOAK_ACCEPTED" | "SOAK_IN_PROGRESS" | "NO_DATA";
    closedCycles: number;
    consecutivePasses: number;
    minimumClosedCycles: number;
    minimumConsecutivePasses: number;
    rejectedCycles: number;
    recoveryStagingFailures: number;
    realizedPnlEvidenceStatus: "AVAILABLE" | "NO_DATA";
    realizedNetPnlInr: number | null;
    blockers: string[];
  };
  runtimeBlockers: string[];
  deferredPrerequisites: string[];
  nextActions: EightStrategyPaperAction[];
  paperExecutionTriggeredByRead: false;
  liveExecutionAllowed: false;
  orderSubmissionAllowed: false;
}

export interface EightStrategyPaperReadinessResponse {
  success: true;
  data: {
    version: "79.0";
    generatedAt: number;
    mode: "EIGHT_STRATEGY_PAPER_ACCEPTANCE_CONVERGENCE";
    decision: "ALL_SOAK_ACCEPTED" | "ACTION_REQUIRED" | "COLLECTING_PAPER_EVIDENCE";
    summary: {
      targetStrategies: 8;
      registered: number;
      running: number;
      operationallyUnblocked: number;
      blocked: number;
      readyForSignal: number;
      paperActive: number;
      soakInProgress: number;
      soakAccepted: number;
    };
    centralPipeline: {
      state: string;
      operatorEnabled: boolean;
      confirmationPresent: boolean;
      allowedStrategies: number;
      targetCentralStrategies: number;
      admissionRunning: boolean;
      intakeRunning: boolean;
      workerReady: boolean;
      activeQueue: number;
      openPositions: number;
      accountingPending: number;
      capitalReconciliationPending: number;
      blockers: string[];
    };
    blockerOwnership: Array<{owner: EightStrategyPaperClosureOwner; actions: number}>;
    convergence: {
      rawActions: number;
      uniqueWorkstreams: number;
      duplicatedActionsCollapsed: number;
      actionableNow: number;
      deferred: number;
      completed: number;
      firstActionableCode: string | null;
      workstreams: Array<{
        rank: number;
        code: string;
        owner: EightStrategyPaperClosureOwner;
        priority: EightStrategyPaperConvergencePriority;
        phase: EightStrategyPaperConvergencePhase;
        state: EightStrategyPaperConvergenceState;
        affectedStrategies: Array<{
          strategyId: string;
          strategyNumber: number;
          displayName: string;
          operationalState: EightStrategyPaperOperationalState;
        }>;
        affectedCount: number;
        readyNowStrategies: number;
        deferredStrategies: number;
        evidenceDetails: string[];
        automaticallyPerformed: false;
      }>;
    };
    acceptanceFlow: {
      completedStages: number;
      totalStages: number;
      currentStage: string;
      stages: Array<{
        id: string;
        label: string;
        passed: number;
        total: number;
        detail: string;
        state: "PASSED" | "IN_PROGRESS" | "WAITING";
      }>;
    };
    remediation: {
      generatedAt: number;
      decision: "EXTERNAL_ACTION_REQUIRED" | "EVIDENCE_COLLECTION_ACTIVE" | "CLEAR";
      classificationCounts: Array<{resolutionClass: EightStrategyRemediationClass; count: number}>;
      correctedCodeDefects: Array<{
        code: string;
        resolutionClass: "CODE_FIXED";
        summary: string;
      }>;
      strategyOneSoak: {
        resolutionClass: EightStrategyRemediationClass;
        totalPasses: number;
        consecutiveCompletedPasses: number;
        minimumConsecutivePasses: number;
        safeRejections: number;
        safeRejectionsExcludedFromStreak: number;
        latestIncompleteResetAt: number | null;
        latestIncompleteResetReasons: string[];
        latestSafeRejectionAt: number | null;
        latestSafeRejectionReasons: string[];
        summary: string;
      };
      dailyRiskBudget: {
        resolutionClass: EightStrategyRemediationClass;
        source: "TRADING_ACCOUNT_LIMITS";
        tradesToday: number | null;
        maximumDailyTrades: number | null;
        remainingTrades: number | null;
        exhausted: boolean;
        summary: string;
      };
      derivativeProviders: Array<{
        exchange: string;
        configured: boolean;
        providerState: "READY" | "DEGRADED" | "NO_DATA";
        authenticatedReadVerified: boolean;
        positionReadVerified: boolean;
        positionMarkets: number;
        marginState: "AVAILABLE" | "ZERO" | "NO_DATA";
        availableMargin: number | null;
        availableMarginUnit: "USDT" | "ACCOUNT_USD_VALUE" | null;
        errorCategory: string | null;
        resolutionClass: EightStrategyRemediationClass;
        summary: string;
        credentialValuesExposed: false;
      }>;
      spotBalanceProviders: Array<{
        exchange: string;
        synchronizationState: "SYNCHRONIZED" | "NOT_CONFIGURED" | "FAILED";
        synchronizedBalances: number;
        positiveAssets: number;
        errorCategory: string | null;
        resolutionClass: EightStrategyRemediationClass;
        summary: string;
        credentialValuesExposed: false;
      }>;
      deferredDerivativePrerequisites: Array<{
        strategyId: string;
        strategyNumber: number;
        blockers: string[];
        activation: "QUALIFIED_PLAN_OR_PLAN_BEARING_INTAKE";
      }>;
      marketWaits: Array<{
        strategyId: string;
        strategyNumber: number;
        displayName: string;
        resolutionClass: "MARKET_WAIT";
        blockers: string[];
        summary: string;
      }>;
      safety: {
        readOnlyClassification: true;
        credentialValuesExposed: false;
        blockersAutoClosed: false;
        accountPolicyMutated: false;
        fundsMutated: false;
        paperExecutionTriggered: false;
        liveExecutionAllowed: false;
        orderSubmissionAllowed: false;
      };
    };
    inventoryRouting: CrossExchangeMarketMakingInventoryRoutingReport | null;
    venueRouting: CrossExchangeMarketMakingVenueRoutingReport | null;
    lifecycleTrace: CentralPaperLifecycleTraceReport | null;
    strategies: EightStrategyPaperReadinessItem[];
    safety: {
      readOnlyAggregation: true;
      realSignalsOnly: true;
      actualAdmissionIntakeAndQueueEvidenceOnly: true;
      realClosedAccountedCyclesOnly: true;
      blockersNeverAutoClosed: true;
      duplicatedActionsCollapsedOnly: true;
      workstreamsAdvisoryOnly: true;
      priorityNeverGrantsExecution: true;
      operatorConfigurationMutated: false;
      paperExecutionTriggered: false;
      liveExecutionAllowed: false;
      orderSubmissionAllowed: false;
      orderSubmissionPerformed: false;
    };
  };
}
