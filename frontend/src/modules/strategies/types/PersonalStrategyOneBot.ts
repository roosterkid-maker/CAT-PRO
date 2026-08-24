export type PersonalStrategyOneBotState =
  | "PAUSED"
  | "BLOCKED"
  | "COLLECTING_PAPER_SOAK"
  | "DAILY_LIMIT_REACHED"
  | "WAITING_FOR_OPPORTUNITY"
  | "WAITING_FOR_PAPER_CAPACITY"
  | "OBSERVING_OPPORTUNITY"
  | "READY_TO_EXECUTE_PAPER";

export interface PersonalBotFundingLeg {
  exchange: string;
  asset: string | null;
  synchronizationStatus: "SYNCHRONIZED" | "NOT_CONFIGURED" | "FAILED" | "NO_REPORT" | "NOT_REQUIRED_PAPER";
  availableBalance: number | null;
  requiredBalance: number | null;
  snapshotAgeMs: number | null;
  maximumSnapshotAgeMs: number;
  sufficient: boolean;
}

export interface PersonalBotFundedRoute {
  version: "86.0";
  evaluatedAt: number;
  opportunityId: string;
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  baseAsset: string | null;
  quoteAsset: string | null;
  requestedCapitalInr: number;
  convertedQuoteCapital: number | null;
  capitalQuantity: number | null;
  depthQuantity: number | null;
  preFundingQuantity: number | null;
  balanceCappedQuantity: number | null;
  executableQuantity: number | null;
  estimatedExecutableCapitalInr: number | null;
  reductionPercent: number | null;
  state: "FUNDED" | "REDUCED" | "BLOCKED";
  fundingBoundary: "AUTHENTICATED_LIVE_READINESS" | "ISOLATED_PAPER";
  buyFunding: PersonalBotFundingLeg;
  sellFunding: PersonalBotFundingLeg;
  quantityNormalization: unknown | null;
  blockers: string[];
  authenticatedBalancesRequired: boolean;
  isolatedPaperCapital: boolean;
  staleBalanceAllowed: false;
  quantityNeverIncreased: true;
  liveExecutionAllowed: false;
  orderSubmissionAllowed: false;
}

export interface PersonalBotInventoryRequirement {
  side: "BUY_QUOTE" | "SELL_BASE";
  exchange: string;
  asset: string | null;
  requiredAmount: number | null;
  availableAmount: number | null;
  planningAvailableAmount: number | null;
  deficitAmount: number | null;
  evidence: "PRESENT" | "SYNCHRONIZED_ASSET_OMITTED" | "UNAVAILABLE";
  action: string;
}

export interface PersonalBotInventoryRoute {
  rank: number;
  opportunityId: string;
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  baseAsset: string | null;
  quoteAsset: string | null;
  fundingState: "FUNDED" | "REDUCED" | "BLOCKED";
  targetQuantity: number | null;
  modeledNetProfitInr: number | null;
  modeledNetReturnPercent: number;
  fullySpecified: boolean;
  requirements: [PersonalBotInventoryRequirement, PersonalBotInventoryRequirement];
  blockers: string[];
}

export type PersonalBotCapitalPlacementConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface PersonalBotCapitalPlacementVenueRank {
  rank: number;
  side: "BUY" | "SELL";
  exchange: string;
  uniqueSettlements: number;
  uniqueMarkets: number;
  profitableSettlements: number;
  negativeSettlements: number;
  winRatePercent: number;
  settlementSharePercent: number;
  totalCapitalInr: number;
  realizedPnlInr: number;
  deployableCashPnlInr: number;
  feesInr: number;
  tdsWithheldInr: number;
  averageNetReturnPercent: number;
  liveAdapterRegistered: boolean;
  confidence: PersonalBotCapitalPlacementConfidence;
}

export interface PersonalBotCapitalPlacementRouteRank {
  rank: number;
  routeKey: string;
  market: string;
  baseAsset: string;
  quoteAsset: string;
  buyExchange: string;
  sellExchange: string;
  uniqueSettlements: number;
  profitableSettlements: number;
  negativeSettlements: number;
  winRatePercent: number;
  totalCapitalInr: number;
  realizedPnlInr: number;
  deployableCashPnlInr: number;
  feesInr: number;
  tdsWithheldInr: number;
  averageNetReturnPercent: number;
  lastSettledAt: number;
  buyAdapterRegistered: boolean;
  sellAdapterRegistered: boolean;
  liveAdapterFoundationReady: boolean;
  confidence: PersonalBotCapitalPlacementConfidence;
}

export interface PersonalBotCapitalPlacement {
  version: "91.0";
  generatedAt: number;
  mode: "HISTORICAL_ADVISORY_ONLY";
  basis: "UNIQUE_CREDIBLE_CLOSED_STRATEGY_ONE_SETTLEMENTS";
  minimumRouteSample: number;
  evidence: {
    storedStrategyOneSettlements: number;
    uniqueStrategyOneSettlements: number;
    credibleSettlements: number;
    excludedDistortedSettlements: number;
    duplicateIdsIgnored: number;
  };
  buyVenues: PersonalBotCapitalPlacementVenueRank[];
  sellVenues: PersonalBotCapitalPlacementVenueRank[];
  totalRoutes: number;
  routes: PersonalBotCapitalPlacementRouteRank[];
  pilot: {
    state: "NO_DATA" | "NO_ADAPTER_READY_ROUTE" | "COLLECTING" | "CANDIDATE_FOR_PREFLIGHT";
    requestedPerLegInr: number;
    minimumTwoLegInventoryInr: number;
    recommendedRoute: PersonalBotCapitalPlacementRouteRank | null;
    reasons: string[];
    preflightRequired: true;
    currentOrderRulesVerified: false;
    currentBalancesVerified: false;
  };
  safety: {
    advisoryOnly: true;
    historicalEvidenceDoesNotAuthorizeLive: true;
    automaticFundMovementAllowed: false;
    transferInitiated: false;
    withdrawalInitiated: false;
    balanceMutated: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export type PersonalCapitalManagerState =
  | "EVIDENCE_INCOMPLETE"
  | "WAITING_FOR_ROUTE"
  | "ORDER_RULE_BLOCKED"
  | "OPERATOR_ACTION_REQUIRED"
  | "READY_FOR_PREFLIGHT";

export interface PersonalCapitalManagerAction {
  priority: number;
  kind:
    | "HOLD_OFF_EXCHANGE_RESERVE"
    | "WAIT_FOR_CURRENT_ROUTE"
    | "REFRESH_BALANCE_EVIDENCE"
    | "PREPOSITION_ASSET"
    | "KEEP_POSITION"
    | "WAIT_FOR_LEGAL_ORDER_SIZE"
    | "RUN_READ_ONLY_PREFLIGHT";
  state: "WAITING" | "BLOCKED" | "ACTION_REQUIRED" | "READY";
  exchange: string | null;
  asset: string | null;
  amount: number | null;
  unit: "INR" | "NATIVE_ASSET" | null;
  instruction: string;
  operatorApprovalRequired: boolean;
  automaticExecutionAllowed: false;
}

export interface PersonalCapitalManager {
  version: "158.0";
  generatedAt: number;
  mode: "ADVISORY_ONLY";
  state: PersonalCapitalManagerState;
  pilotPolicy: {
    recommendedStartingBankrollInr: 3_000;
    maximumInitialExchangeExposureInr: 2_000;
    offExchangeReserveInr: 1_000;
    offExchangeReserveLocation: "OPERATOR_LINKED_BANK_ACCOUNT";
    offExchangeReserveEvidence: "NOT_OBSERVED_BY_BOT";
    requestedPerLegInr: number;
    minimumTwoLegInventoryInr: number;
  };
  evidence: {
    exchanges: number;
    freshExchanges: number;
    allExchangeBalancesFresh: boolean;
    currentRouteAvailable: boolean;
    currentRouteFullySpecified: boolean;
    historicalRouteMatched: boolean;
    nativeAssetUnitsNeverSummed: true;
  };
  capitalTruth: {
    valuationState: "NO_FRESH_BALANCE_EVIDENCE" | "INR_SUBTOTAL_ONLY" | "FULLY_INR_DENOMINATED";
    verifiedInrSubtotal: {
      availableInr: number | null;
      lockedInr: number | null;
      totalInr: number | null;
      contributingExchanges: number;
    };
    allAssetPortfolioValueInr: number | null;
    positiveUnvaluedAssetCount: number;
    nativeAssetTotals: Array<{
      asset: string;
      availableBalance: number;
      lockedBalance: number;
      totalBalance: number;
      contributingExchanges: number;
    }>;
    paper: {
      source: "ISOLATED_PAPER_LEDGER";
      budgetInr: number;
      accountingEquityInr: number;
      availableAccountingEquityInr: number;
      tdsReceivableInr: number;
      tdsTreatment: "RECOVERABLE_CASH_LOCK_NOT_TRADING_FEE";
      includedInLiveBalanceTotals: false;
    };
    missingValuesNeverTreatedAsZero: true;
  };
  profitTruth: {
    mode: "PAPER_EVIDENCE_ONLY";
    currency: "INR";
    credibleSettlements: number;
    grossTradingProfitInr: number;
    tradingFeesInr: number;
    economicNetPnlInr: number;
    tdsWithheldInr: number;
    deployableCashPnlInr: number;
    realizedLossesInr: number;
    pendingSettlements: number;
    pendingPnlInr: null;
    taxReserveInr: null;
    safelyWithdrawableProfitInr: null;
    withdrawalState: "UNAVAILABLE_WITHOUT_RECONCILED_LIVE_LEDGER";
    paperProfitNeverWithdrawable: true;
  };
  allocation: {
    basis: "CURRENT_EXECUTE_REQUIREMENT_PLUS_DURABLE_ROUTE_DEMAND";
    status: "EVIDENCE_INCOMPLETE" | "WAITING_FOR_CURRENT_ROUTE" | "TARGETS_AVAILABLE";
    staticEqualAllocationUsed: false;
    stage: "SINGLE_CYCLE_TINY_LIVE_ADVISORY";
    targetOperatingCycles: 1;
    targets: Array<{
      side: "BUY_QUOTE" | "SELL_BASE";
      exchange: string;
      asset: string;
      minimumAmount: number;
      targetAmount: number;
      maximumAmount: number;
      currentAmount: number;
      deficitAmount: number;
      surplusAmount: number;
      estimatedOperatingCycles: number;
      state: "NO_DATA" | "DEFICIT" | "ON_TARGET" | "SURPLUS";
      blockedCurrentRoute: boolean;
      reason: string;
    }>;
    demandRanking: Array<{
      rank: number;
      side: "BUY" | "SELL";
      exchange: string;
      settlementSharePercent: number;
      uniqueSettlements: number;
      realizedPnlInr: number;
      averageNetReturnPercent: number;
      confidence: "LOW" | "MEDIUM" | "HIGH";
    }>;
    scalingBlockedUntilLiveEvidence: true;
    explanation: string;
  };
  route: {
    routeKey: string;
    market: string;
    buyExchange: string;
    sellExchange: string;
    baseAsset: string | null;
    quoteAsset: string | null;
    fundingState: "FUNDED" | "REDUCED" | "BLOCKED";
    historicalRank: number | null;
    historicalSettlements: number | null;
    confidence: "LOW" | "MEDIUM" | "HIGH" | null;
    requirements: PersonalBotInventoryRequirement[];
  } | null;
  venues: Array<{
    exchange: string;
    displayName: string;
    status: "SYNCHRONIZED" | "STALE" | "FAILED" | "NOT_CONFIGURED" | "PENDING";
    lastSynchronizedAt: number | null;
    balanceAgeMs: number | null;
    positiveAssetCount: number;
    synchronizedAssetCount: number;
    assetsTruncated: boolean;
    assets: Array<{
      asset: string;
      availableBalance: number;
      lockedBalance: number;
      totalBalance: number;
    }>;
  }>;
  actions: PersonalCapitalManagerAction[];
  rebalancing: {
    version: "158.0";
    phase: "PHASE_A_B_ADVISORY";
    authorityMode: "ADVISORY_ONLY";
    inventory: {
      version: "121.0";
      generatedAt: number;
      state: "READY_FOR_REBALANCING_ANALYSIS" | "PARTIAL_EVIDENCE" | "NO_BALANCE_EVIDENCE";
      valuationAsset: "USDT";
      maximumBalanceAgeMs: number;
      totals: {
        exchanges: number;
        synchronizedExchanges: number;
        positiveAssets: number;
        currentValuations: number;
        staleValuations: number;
        unavailableValuations: number;
        knownAvailableValueUsdt: number;
        knownAvailableAfterReservationsValueUsdt: number;
        knownLockedValueUsdt: number;
        knownTotalValueUsdt: number;
        decisionUsableValueUsdt: number;
        authoritativeAvailableCapitalUsdt: number | null;
        authoritativeLockedCapitalUsdt: number | null;
        authoritativeTotalCapitalUsdt: number | null;
        directUsdtAvailable: number;
        directUsdtAvailableAfterReservations: number;
        directUsdtLocked: number;
        directUsdtTotal: number;
      };
      exchanges: Array<{
        exchange: string;
        displayName: string;
        balanceStatus: string;
        lastSynchronizedAt: number | null;
        balanceAgeMs: number | null;
        positiveAssets: number;
        currentValuations: number;
        staleValuations: number;
        unavailableValuations: number;
        authoritativeTotalValueUsdt: number | null;
        authoritativeAvailableAfterReservationsValueUsdt: number | null;
        knownTotalValueUsdt: number;
        directUsdtAvailableAfterReservations: number;
        unvaluedPositiveAssets: string[];
      }>;
      blockers: string[];
      limitations: string[];
      missingValuesTreatedAsZero: false;
      accountingCapitalMixedWithWalletValuation: false;
    };
    policyBasis: {
      policyId: string;
      revision: number;
      source: "CREDIBLE_STRATEGY_ONE_SETTLEMENTS_PLUS_CURRENT_ROUTE";
      staticEqualAllocationUsed: false;
      crediblePaperSettlements: number;
      currentRouteBoostApplied: boolean;
      evidenceSufficient: boolean;
      formula: string;
    };
    allocation: {
      version: "122.0";
      generatedAt: number;
      state: "READY" | "BLOCKED_EVIDENCE" | "BLOCKED_POLICY";
      policy: {
        policyId: string;
        revision: number;
        targets: Array<{
          exchange: string;
          targetPercent: number;
          minimumPercent: number;
          maximumPercent: number;
          emergencyReserveUsdt: number;
        }>;
      };
      capital: {
        totalUsdt: number | null;
        availableAfterReservationsUsdt: number | null;
        reservedInventoryUsdt: number | null;
        inTransitUsdt: null;
      };
      exchanges: Array<{
        exchange: string;
        displayName: string;
        state: "CRITICAL_LOW" | "UNDERFUNDED" | "BALANCED" | "OVERFUNDED" | "CRITICAL_HIGH";
        currentCapitalUsdt: number;
        availableCapitalUsdt: number;
        targetCapitalUsdt: number;
        minimumCapitalUsdt: number;
        maximumCapitalUsdt: number;
        emergencyReserveUsdt: number;
        imbalanceUsdt: number;
        imbalancePercentOfTarget: number;
        deficitToTargetUsdt: number;
        surplusAboveTargetUsdt: number;
        transferableSurplusUsdt: number;
        activeReservedCapitalUsdt: number;
        suggestedAction: "NO_ACTION" | "PREFER_NATURAL_REBALANCE" | "SOFT_REBALANCE_ANALYSIS" | "HARD_REBALANCE_ANALYSIS";
        reasons: string[];
      }>;
      summary: {
        criticalLow: number;
        underfunded: number;
        balanced: number;
        overfunded: number;
        criticalHigh: number;
        totalDeficitToTargetUsdt: number;
        totalSurplusAboveTargetUsdt: number;
        totalTransferableSurplusUsdt: number;
      };
      blockers: string[];
    };
    plan: {
      version: "124.0";
      generatedAt: number;
      state: "BLOCKED" | "NO_REBALANCE_REQUIRED" | "NATURAL_REBALANCE_AVAILABLE" | "SOFT_REBALANCE_PREFERRED" | "HARD_REBALANCE_ANALYSIS_REQUIRED";
      currentAction: "BLOCK" | "NO_ACTION" | "PRIORITIZE_NATURAL_REVERSE" | "PREFER_INVENTORY_AWARE_TRADES" | "WAIT_FOR_OPERATOR_APPROVED_HARD_REBALANCE_INFRASTRUCTURE";
      desiredMoves: Array<{
        sequence: number;
        sourceExchange: string;
        destinationExchange: string;
        amountUsdt: number;
        submissionState: "ANALYSIS_ONLY";
        transferAsset: null;
        transferNetwork: null;
        estimatedCostUsdt: null;
        reason: string;
      }>;
      blockers: string[];
      reasons: string[];
    };
    safetyContext: {
      executionRecoveryPending: boolean;
      settlementReconciliationPending: boolean;
      emergencyStopActive: boolean;
    };
    phases: {
      phaseAUnifiedTruth: "ACTIVE";
      phaseBAdvisoryRebalancing: "ACTIVE";
      phaseCManualTransfers: "LOCKED_NOT_IMPLEMENTED";
      phaseDCappedAutomaticTransfers: "LOCKED_NOT_IMPLEMENTED";
      phaseEProfitWithdrawalManager: "LOCKED_WITHOUT_LIVE_LEDGER";
    };
    safety: {
      readOnly: true;
      executionHotPathUntouched: true;
      balanceMutationAllowed: false;
      transferSubmissionAllowed: false;
      withdrawalSubmissionAllowed: false;
      bankWithdrawalAllowed: false;
      liveOrderSubmissionAllowed: false;
      explicitAuthorityRequiredForLaterPhases: true;
    };
  };
  safety: {
    advisoryOnly: true;
    paperCapitalIsolated: true;
    paperExecutionAffected: false;
    automaticFundMovementAllowed: false;
    transferInitiated: false;
    withdrawalInitiated: false;
    balanceMutated: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
    bankWithdrawalAllowed: false;
    transferAuthorityMode: "ADVISORY_ONLY";
    emergencyFreezeAvailableBeforeTransferPhases: true;
  };
}

export interface PersonalBotOpportunity {
  id: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  decision: "EXECUTE" | "REVIEW" | "SKIP";
  modeledNetProfitInr: number | null;
  netProfit: number;
  netProfitPercent: number;
  executableQuantity: number;
  score: number;
  observedAt: number;
  funding: PersonalBotFundedRoute | null;
}

export interface PersonalBotExecution {
  id: string;
  strategyId: string;
  strategyName: string;
  market: string;
  baseAsset: string;
  quoteAsset: string;
  buyExchange: string;
  sellExchange: string;
  quantity: number;
  capital: number;
  buyPrice: number;
  sellPrice: number;
  fees: number;
  tdsWithheld: number;
  deployableCashProfit: number;
  pnl: number;
  pnlPercent: number;
  status: "detected" | "validated" | "open" | "monitoring" | "target-hit" | "closed" | "cancelled" | "failed";
  executedAt: number;
  completedAt: number | null;
  simulated: true;
}

export interface PersonalBotExcludedExecution {
  id: string;
  market: string;
  baseAsset: string;
  quoteAsset: string;
  buyExchange: string;
  sellExchange: string;
  quantity: number;
  capital: number;
  buyPrice: number;
  sellPrice: number;
  reportedPnl: number;
  reportedPnlPercent: number;
  completedAt: number;
  priceRatio: number | null;
  maximumCrediblePriceRatio: number;
  ratioExcessPercent: number | null;
  failureCode: "INVALID_EXECUTED_PRICE" | "PRICE_RATIO_EXCEEDED";
  reason: string;
  excludedFromPnl: true;
  simulated: true;
}

export interface PersonalBotRuntimeControl {
  version: "82.0";
  enabled: boolean;
  updatedAt: number;
  source: "DEFAULT" | "DASHBOARD";
  mode: "PAPER_ONLY";
  liveExecutionAllowed: false;
  orderSubmissionAllowed: false;
  scannerActive: true;
  effectivePaperExecutionEnabled: boolean;
}

export interface PersonalBotLatencyDistribution {
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}

export type PostGuardValidationStatus =
  | "NO_DATA"
  | "COLLECTING"
  | "VALIDATING"
  | "SAMPLE_COMPLETE";

export type PostGuardRouteState =
  | "COLLECTING"
  | "ELIGIBLE"
  | "QUARANTINED"
  | "PROBE_ELIGIBLE";

export interface PostGuardProfitMetrics {
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRatePercent: number | null;
  netPnl: number;
  expectancyPerTrade: number | null;
  profitFactor: number | null;
  profitFactorState: "AVAILABLE" | "NO_LOSSES" | "NO_DATA";
  maximumDrawdown: number;
  totalCapital: number;
  totalFees: number;
  feeDragPercent: number | null;
  averageNetReturnPercent: number | null;
  averageAdverseSlippagePercent: number | null;
}

export interface PostGuardRouteProfitability {
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  state: PostGuardRouteState;
  paperAdmissionAllowed: boolean;
  quarantineUntil: number | null;
  latestClosedAt: number | null;
  metrics: PostGuardProfitMetrics;
}

export interface PostGuardMarketProfitability {
  market: string;
  metrics: PostGuardProfitMetrics;
}

export interface PostGuardProfitValidation {
  version: "83.0";
  generatedAt: number;
  strategyId: "cross-exchange-arbitrage";
  cohort: "CROSS_VENUE_PRICE_CREDIBILITY_V1";
  cohortStartedAt: number | null;
  latestTradeAt: number | null;
  validationStatus: PostGuardValidationStatus;
  expectancyDecision:
    | "NO_DATA"
    | "INSUFFICIENT_SAMPLE"
    | "POSITIVE_EXPECTANCY_OBSERVED"
    | "NON_POSITIVE_EXPECTANCY";
  minimumValidationTrades: number;
  targetValidationTrades: number;
  remainingMinimumTrades: number;
  remainingTargetTrades: number;
  readyForVpsPaperReview: boolean;
  overall: PostGuardProfitMetrics;
  routes: PostGuardRouteProfitability[];
  markets: PostGuardMarketProfitability[];
  quarantinedRoutes: number;
  safety: {
    taggedSettlementsOnly: true;
    historicalTradesExcluded: true;
    minimumRouteSample: number;
    routeQuarantineMs: number;
    paperAdmissionMayBeBlocked: true;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export type PersonalOpportunityConversionStatus =
  | "NO_MARKET_DATA"
  | "ENGINE_FILTERING"
  | "PERSISTENCE_WAIT"
  | "QUALIFICATION_BLOCKED"
  | "QUEUE_WAIT"
  | "PAPER_REJECTED"
  | "READY_FOR_PAPER"
  | "COLLECTING_POST_GUARD";

export type PersonalOpportunityConversionStageStatus =
  | "PASSED"
  | "WAITING"
  | "BLOCKED"
  | "NOT_REACHED";

export type PersonalOpportunityConversionStageKey =
  | "EXECUTABLE_MARKET_DATA"
  | "PAIR_EVALUATION"
  | "ENGINE_ACCEPTANCE"
  | "PROFIT_QUALIFICATION"
  | "PERSISTENCE_MONITOR"
  | "CANDIDATE_QUALIFICATION"
  | "CENTRAL_QUEUE"
  | "PAPER_ATTEMPT"
  | "POST_GUARD_SETTLEMENT";

export interface PersonalOpportunityConversionStage {
  key: PersonalOpportunityConversionStageKey;
  label: string;
  status: PersonalOpportunityConversionStageStatus;
  count: number;
  scope: "CURRENT_SCAN" | "CURRENT_STATE" | "RECENT_5_MIN" | "DURABLE_COHORT";
  reason: string;
}

export interface PersonalOpportunityConversionBlocker {
  stage: "EXECUTION_QUALITY" | "EVALUATOR" | "ENGINE" | "PERSISTENCE" | "QUALIFICATION" | "QUEUE" | "PAPER";
  code: string;
  label: string;
  count: number;
  percentOfEvaluatedPairs: number | null;
  reason: string;
  operatorAction: string;
}

export interface PersonalOpportunityCandidateConversion {
  opportunityId: string;
  candidateKey: string;
  profitRouteKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  decision: "EXECUTE" | "REVIEW" | "SKIP";
  netProfit: number;
  netProfitPercent: number;
  executableQuantity: number;
  score: number;
  modeledCapitalInr: number | null;
  modeledNetProfitInr: number | null;
  economicEvidence: "FULL_DEPTH_VALIDATION" | "CURRENT_OPPORTUNITY" | "UNAVAILABLE";
  queuePriorityScore: number | null;
  currentStage: PersonalOpportunityConversionStageKey;
  qualificationStatus: "NOT_OBSERVED" | "OBSERVING" | "QUALIFIED" | "REJECTED" | "EXPIRED";
  queueStatus: "READY" | "EXPIRED" | "CANCELLED" | "REMOVED" | "CONSUMED" | null;
  routeProfitState: PostGuardRouteState | "NO_SAMPLE";
  routeSampleTrades: number;
  routeExpectancyInr: number | null;
  routeAverageNetReturnPercent: number | null;
  paperAdmissionAllowed: boolean;
  selectableForPaper: boolean;
  failedChecks: string[];
  reason: string;
}

export interface PersonalOpportunityConversion {
  version: "84.1";
  generatedAt: number;
  strategyId: "cross-exchange-arbitrage";
  profile: "PERSONAL_SELF_USE";
  status: PersonalOpportunityConversionStatus;
  primaryBottleneck: PersonalOpportunityConversionBlocker | null;
  nextAction: string;
  snapshot: {
    scanStartedAt: number | null;
    cachedQuotes: number;
    executableQuotes: number;
    evaluatedPairs: number;
    engineAccepted: number;
    profitQualified: number;
    currentOpportunities: number;
    executeDecisions: number;
    activeCandidates: number;
    qualifiedCandidates: number;
    readyQueueItems: number;
  };
  stages: PersonalOpportunityConversionStage[];
  engineRejections: PersonalOpportunityConversionBlocker[];
  qualificationFailures: Array<{check: string; count: number; reason: string}>;
  arbitration: {
    basis: "FULL_DEPTH_MODELED_INR_PROFIT_THEN_NET_RETURN";
    currentEligible: number;
    paperReady: number;
    admissionBlocked: number;
    currentLeaderOpportunityId: string | null;
    currentLeaderCandidateKey: string | null;
    currentLeaderModeledCapitalInr: number | null;
    currentLeaderModeledNetProfitInr: number | null;
    paperWinnerCandidateKey: string | null;
    routeHistoryUsedAsTieBreakOnly: true;
  };
  currentCandidates: PersonalOpportunityCandidateConversion[];
  recentPaper: {
    windowMs: number;
    cycles: number;
    attempts: number;
    executed: number;
    rejected: number;
    latestStatus: string | null;
    latestAt: number | null;
    latestReasons: string[];
    orchestratorMode: "DISABLED" | "SHADOW" | "PAPER" | "LIVE_BLOCKED" | "LIVE_ELIGIBLE" | "LIVE";
    orchestratorStatus: string | null;
    orchestratorReasons: string[];
  };
  postGuard: {
    taggedSettlements: number;
    targetSettlements: number;
    validationStatus: PostGuardValidationStatus;
    latestTradeAt: number | null;
    quarantinedRoutes: number;
  };
  policy: {
    discoveryMinimumNetProfitPercent: number | null;
    qualificationMinimumNetProfitPercent: number | null;
    liveMinimumNetProfitPercent: number | null;
    thresholdMutationAllowed: false;
  };
  safety: {
    readOnlyDiagnostics: true;
    realEvidenceOnly: true;
    fakeOpportunityAllowed: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface PersonalStrategyOneBotData {
  version: "90.0";
  generatedAt: number;
  profile: "PERSONAL_STRATEGY_ONE";
  state: PersonalStrategyOneBotState;
  strategy: {
    id: "cross-exchange-arbitrage";
    displayName: "Cross-Exchange Arbitrage";
    runtimeOwner: "UNIFIED_AUTOMATED_EXECUTION_ORCHESTRATOR";
  };
  control: PersonalBotRuntimeControl;
  opportunity: {
    current: number;
    executable: number;
    fundedExecutable: number;
    top: PersonalBotOpportunity[];
    accepted: PersonalBotOpportunity[];
  };
  funding: {
    mode: "AUTHENTICATED_TWO_LEG_BALANCE";
    requestedCapitalInr: number;
    evaluatedRoutes: number;
    fundedRoutes: number;
    reducedRoutes: number;
    blockedRoutes: number;
    routes: PersonalBotFundedRoute[];
  };
  paperCapacity: {
    mode: "ISOLATED_PAPER";
    requestedCapitalInr: number;
    evaluatedRoutes: number;
    executableRoutes: number;
    reducedRoutes: number;
    blockedRoutes: number;
    routes: PersonalBotFundedRoute[];
    authenticatedBalancesRequired: false;
    liveBalancesMutated: false;
  };
  inventoryPlan: {
    mode: "ADVISORY_PREPOSITIONING";
    generatedAt: number;
    requestedCapitalInr: number;
    recommendationStatus: "NO_CURRENT_EXECUTE_ROUTE" | "EVIDENCE_INCOMPLETE" | "FUNDING_REQUIRED" | "MIN_NOTIONAL_BLOCKED" | "READY";
    recommendedRoute: PersonalBotInventoryRoute | null;
    alternatives: PersonalBotInventoryRoute[];
    safety: {
      advisoryOnly: true;
      transferInitiated: false;
      withdrawalInitiated: false;
      balanceMutated: false;
      liveExecutionAllowed: false;
      orderSubmissionAllowed: false;
    };
  };
  capitalPlacement: PersonalBotCapitalPlacement;
  capitalManager: PersonalCapitalManager;
  performance: {
    storedExecutions: number;
    successfulExecutions: number;
    excludedUncredibleExecutions: number;
    successfulToday: number;
    successfulCurrentClockHour: number;
    currentClockHourLabel: string;
    hourlySuccessfulTrades: Array<{
      hour: number;
      label: string;
      startAt: number;
      endAt: number;
      successfulTrades: number;
      realizedPnl: number;
      current: boolean;
    }>;
    hourlyClockBasis: "ASIA_KOLKATA";
    hourlyTimeZone: "Asia/Kolkata";
    winningExecutions: number;
    winRatePercent: number | null;
    realizedPnl: number;
    realizedPnlToday: number;
    pnlUnit: "ACCOUNT_CURRENCY";
  };
  hotPath: {
    codeSideOnly: true;
    sampleWindowCapacity: 512;
    state: "COLLECTING" | "PASS" | "MISS";
    scanner: {
      eventDriven: boolean;
      minimumEventScanIntervalMs: number;
      executableUpdatesReceived: number;
      coalescedExecutableUpdates: number;
      marketUpdateToDecisionMs: PersonalBotLatencyDistribution;
      evaluationMs: PersonalBotLatencyDistribution;
    };
    automation: {
      decisionToQueueMs: PersonalBotLatencyDistribution;
      candidateDecisionToExecutionStartMs: PersonalBotLatencyDistribution;
      decisionToExecutionCompleteMs: PersonalBotLatencyDistribution;
      pendingSnapshots: number;
      pendingSnapshotHighWaterMark: number;
      coalescedEmptySnapshots: number;
      coalescedCandidateSnapshots: number;
      droppedCandidateSnapshots: number;
    };
    targets: {
      marketUpdateToDecisionP95Ms: 25;
      marketUpdateToDecisionP99Ms: 40;
      decisionToQueueP95Ms: 10;
      decisionToQueueP99Ms: 25;
      candidateDecisionToExecutionStartP95Ms: 25;
      candidateDecisionToExecutionStartP99Ms: 40;
      decisionToExecutionCompleteP99Ms: 40;
      maximumDroppedCandidateSnapshots: 0;
    };
    gates: {
      marketUpdateToDecision: "COLLECTING" | "PASS" | "MISS";
      decisionToQueue: "COLLECTING" | "PASS" | "MISS";
      candidateDecisionToExecutionStart: "COLLECTING" | "PASS" | "MISS";
      decisionToExecutionComplete: "COLLECTING" | "PASS" | "MISS";
      candidateSnapshotDrops: "COLLECTING" | "PASS" | "MISS";
    };
  };
  profitValidation: PostGuardProfitValidation;
  conversion: PersonalOpportunityConversion;
  recentExecutions: PersonalBotExecution[];
  excludedExecutions: PersonalBotExcludedExecution[];
  paper: {
    accountEnabled: boolean;
    accountMode: "PAPER" | "TESTNET" | "LIVE";
    emergencyStop: boolean;
    automationArmed: boolean;
    automationAllowed: boolean;
    orchestratorMode: "DISABLED" | "SHADOW" | "PAPER" | "LIVE_BLOCKED" | "LIVE_ELIGIBLE" | "LIVE";
    tradesToday: number;
    maximumDailyTrades: number;
    remainingDailyTrades: number;
    dailyActivity: {
      counterSemantics: "CAPITAL_RESERVED_ATTEMPTS";
      reservationAttempts: number;
      settledPaperExecutions: number;
      credibleStrategyOneSettlements: number;
      credibilityExcludedStrategyOneSettlements: number;
      dryRunReservations: number;
      failedDryRunReservations: number;
      otherUnlinkedOrNonSettledReservations: number;
      otherAttemptDetails: Array<{
        attemptId: string;
        attemptNumber: number;
        reservedAt: number;
        reservedCapital: number;
        accountMode: "PAPER" | "TESTNET" | "LIVE";
        capitalReleaseStatus: "RELEASE_CONFIRMED" | "STILL_RESERVED";
        releasedAt: number | null;
        sessionLinkStatus: "LINKED" | "NO_DURABLE_SESSION_LINK";
        sessionId: string | null;
        sessionStatus: "VALIDATING" | "RESERVED" | "READY_FOR_SUBMISSION" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED" | null;
        market: string | null;
        buyExchange: string | null;
        sellExchange: string | null;
        reason: string;
      }>;
      otherAttemptDetailCoverage: {
        expected: number;
        available: number;
        complete: boolean;
        matchingWindowMs: 250;
        routeAttributionAvailableForLinkedAttempts: true;
      };
      remainingAttemptBudget: number;
      equationBalanced: boolean;
    };
    availableCapital: number;
    paperTdsReceivable: number;
    capitalBudgetInr: number;
    minimumCapitalPerTrade: number;
    maximumCapitalPerTrade: number;
    capitalStep: number;
    maximumExecutionsPerBatch: number;
    maximumBatchCapital: number;
  };
  soak: {
    status: "NOT_STARTED" | "COLLECTING" | "PASSED";
    acceptedPasses: number;
    consecutivePasses: number;
    minimumConsecutivePasses: number;
    safeRejections: number;
    evidenceIncomplete: number;
  };
  lastExecutionCycle: {
    status: string;
    completedAt: number;
    readyCandidates: number;
    ownedCandidates: number;
    reasons: string[];
  } | null;
  blockers: string[];
  nextAction: string;
  safety: {
    readOnlyAggregation: true;
    fakeOpportunityAllowed: false;
    fakeBalanceAllowed: false;
    accountPolicyMutated: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface PersonalStrategyOneBotResponse {
  success: true;
  data: PersonalStrategyOneBotData;
}

export interface PersonalStrategyOnePerformanceSummaryResponse {
  success: true;
  data: {
    version: "148.0";
    generatedAt: number;
    profile: "PERSONAL_STRATEGY_ONE_PERFORMANCE_SUMMARY";
    performance: PersonalStrategyOneBotData["performance"];
    safety: {
      readOnlyAggregation: true;
      paperExecutionTriggeredByRead: false;
      liveExecutionAllowed: false;
      orderSubmissionAllowed: false;
    };
  };
}

export interface PersonalBotControlResponse {
  success: true;
  data: Omit<PersonalBotRuntimeControl, "scannerActive" | "effectivePaperExecutionEnabled">;
}
