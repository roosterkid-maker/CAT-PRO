export type StrategyEvidenceStatus =
  | "AVAILABLE"
  | "NO_DATA"
  | "NOT_REPORTED";

export interface StrategyMetadata {
  id: string;
  strategyNumber: number;
  displayName: string;
  version: string;
  category: string;
  description: string;
  controllerMode:
    | "READ_ONLY"
    | "SHADOW_ONLY";
  signalSource: string;
  legacyHistoryAttribution:
    "UNATTRIBUTED_LEGACY";
  capabilities: {
    signalAdaptation: boolean;
    intentGeneration: boolean;
    automaticExecution: boolean;
    paperExecution: boolean;
    liveExecution: boolean;
  };
}

export interface StrategyRuntimeSnapshot {
  strategyId: string;
  generatedAt: number;
  running: boolean;
  startCount: number;
  stopCount: number;
  processedSnapshots: number;
  duplicateSnapshotsIgnored: number;
  totalSignalsObserved: number;
  currentSignalCount: number;
  lastSnapshotGeneratedAt: number | null;
  lastSignalObservedAt: number | null;
  lastError: string | null;
  evidence: {
    snapshot: StrategyEvidenceStatus;
    signals: StrategyEvidenceStatus;
    performance: StrategyEvidenceStatus;
  };
  safety: {
    readOnly: true;
    signalExecutionAllowed: false;
    intentExecutionAllowed: false;
    automaticExecutionAllowed: false;
  };
}

interface StrategySignalBase {
  id: string;
  strategyId: string;
  evidenceStatus: "AVAILABLE";
  generatedAt: number;
  observedAt: number;
  expiresAt: number;
  executionAuthorized: false;
  automaticExecutionAllowed: false;
}

export interface CrossExchangeArbitrageStrategySignal
extends StrategySignalBase {
  kind: "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY";
  source: "OpportunityService";
  sourceOpportunityId: string;
  sourceSnapshotGeneratedAt: number;
  evidence: {
    market: string;
    buyExchange: string;
    sellExchange: string;
    netProfit: number;
    netProfitPercent: number;
    executableQuantity: number;
    liquidityScore: number;
    freshnessScore: number;
    decision: "EXECUTE" | "REVIEW" | "SKIP";
    quotesAreFresh: boolean;
    enoughLiquidity: boolean;
  };
}

export interface CrossExchangeMarketMakingStrategySignal
extends StrategySignalBase {
  kind: "XEMM_SAFE_MAKER_PRICE";
  source: "XEMMPriceEngine";
  evidence: {
    market: string;
    side: "BID" | "ASK";
    makerExchange: string;
    hedgeExchange: string;
    hedgeReferenceSide: "BID" | "ASK";
    hedgeReferencePrice: number;
    safeMakerPrice: number;
    priceStep: number;
    minimumRetainedEdgePercent: number;
    modeledRetainedEdgePercent: number;
    postOnlyRequired: true;
    quantitySizing: "NOT_EVALUATED_V21_1";
    queuePosition: "NOT_EVALUATED_V21_1";
    fillProbability: "NOT_EVALUATED_V21_1";
    makerPlacement: "NOT_SIMULATED_V21_1";
    hedgeSlippage: "NOT_EVALUATED_V21_1";
  };
}

export type StrategySignal =
  | CrossExchangeArbitrageStrategySignal
  | CrossExchangeMarketMakingStrategySignal;

export interface StrategyIntent {
  id: string;
  strategyId: string;
  signalId: string;
  kind: "PROPOSED_STRATEGY_ACTION";
  proposedMode: "SHADOW" | "PAPER" | "LIVE";
  proposalType:
    | "CROSS_EXCHANGE_ARBITRAGE_PAPER_EXECUTION"
    | "XEMM_HEDGE_AFTER_SIMULATED_MAKER_FILL"
    | "HEDGE_INVENTORY_REDUCTION";
  proposedCapital: number | null;
  createdAt: number;
  expiresAt: number;
  status: "PROPOSED";
  executionAuthorized: false;
  automaticExecutionAllowed: false;
}

export interface StrategyAttributionCoverage {
  evidenceStatus: "AVAILABLE" | "NO_DATA";
  totalRecords: number;
  attributedToStrategy: number;
  attributedToOtherStrategies: number;
  unattributedLegacy: number;
  attributionCoveragePercent: number | null;
}

export interface StrategyPerformanceAnalytics {
  generatedAt: number;
  strategyId: string;
  evidenceStatus: StrategyEvidenceStatus;
  shadow: {
    evidenceStatus: StrategyEvidenceStatus;
    totalRecords: number | null;
    tracking: number | null;
    completedOutcomes: number | null;
    successfulOutcomes: number | null;
    failedOutcomes: number | null;
    dataUnavailableOutcomes: number | null;
    successRatePercent: number | null;
    averageProfitRetentionPercent: number | null;
  };
  paper: {
    evidenceStatus: StrategyEvidenceStatus;
    totalTrades: number | null;
    openTrades: number | null;
    closedTrades: number | null;
    winningTrades: number | null;
    losingTrades: number | null;
    winRatePercent: number | null;
    netProfit: number | null;
  };
  notes: string[];
}

export interface StrategySafetyReadModel {
  readOnly: true;
  signalExecutionAllowed: false;
  intentGenerationAllowed: boolean;
  intentExecutionAllowed: false;
  automaticExecutionAllowed: false;
  paperExecutionAllowed: false;
  liveExecutionAllowed: false;
  capitalReservationAllowed: false;
  orderSubmissionAllowed: false;
}

export interface StrategyLifecycleSnapshot {
  version: string;
  strategyId: string;
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  controllerRunning: boolean;
  activeOrderCount: number;
  cancelledOrderCount: number;
  retainedOrderCount: number;
  totalOrdersObserved: number;
  totalEventsObserved: number;
  evaluations: Array<{
    market: string;
    side: "BID" | "ASK";
    evaluatedAt: number;
    action:
      | "PLACED"
      | "MONITORED"
      | "CANCELLED"
      | "REPRICED"
      | "REJECTED";
    orderId: string | null;
    previousOrderId: string | null;
    pricingBlockers: string[];
    lifecycleBlockers: string[];
  }>;
  orders: Array<{
    id: string;
    mode: "SHADOW";
    market: string;
    side: "BID" | "ASK";
    makerExchange: string;
    hedgeExchange: string;
    status: "ACTIVE" | "CANCELLED" | "SIMULATED_FILLED";
    simulatedPrice: number;
    simulatedQuantity: number;
    simulatedNotional: number;
    revision: number;
    previousOrderId: string | null;
    placedAt: number;
    lastEvaluatedAt: number;
    cancelledAt: number | null;
    cancellationReason: string | null;
    safety: {
      makerFillSimulated: false;
      hedgeIntentGenerated: false;
      capitalReserved: false;
      exchangeOrderSubmitted: false;
      executionAuthorized: false;
    };
  }>;
}

export interface StrategyFillAndHedgeSnapshot {
  version: string;
  strategyId: string;
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  controllerRunning: boolean;
  assessments: unknown[];
  fills: Array<{
    id: string;
    orderId: string;
    market: string;
    makerSide: "BID" | "ASK";
    simulatedFillPrice: number;
    simulatedFillQuantity: number;
    simulatedAt: number;
    exchangeFill: false;
    executionAuthorized: false;
  }>;
  hedgeAssessments: unknown[];
  hedgeIntents: StrategyIntent[];
  newlyFilledOrderIds: string[];
}

export interface StrategyShadowAnalyticsSnapshot {
  version: "21.5";
  strategyId: "cross-exchange-market-making";
  generatedAt: number;
  evidenceStatus:
    | "AVAILABLE"
    | "NO_DATA";
  configurationState: string;
  thresholds: {
    minimumPricingEvaluationsPerRoute: number;
    minimumSimulatedFillsPerRoute: number;
    minimumHedgeReadyRatePercent: number;
  };
  summary: {
    configuredRoutes: number;
    evidenceRoutes: number;
    shadowReadyRoutes: number;
    pricingEvaluations: number;
    acceptedPrices: number;
    rejectedPrices: number;
    simulatedFills: number;
    simulatedPartialFills: number;
    queueModeledFills: number;
    hedgeReady: number;
    hedgeBlocked: number;
    hedgeIntents: number;
  };
  routes: Array<{
    routeId: string;
    market: string;
    makerExchange: string;
    hedgeExchange: string;
    evidenceStatus:
      | "AVAILABLE"
      | "NO_DATA";
    firstObservedAt: number | null;
    lastObservedAt: number | null;
    pricing: {
      evaluations: number;
      accepted: number;
      rejected: number;
      acceptedBid: number;
      acceptedAsk: number;
      acceptanceRatePercent: number | null;
      averageModeledRetainedEdgePercent: number | null;
      rejectionBlockers: Array<{
        key: string;
        count: number;
      }>;
    };
    lifecycle: {
      placed: number;
      monitored: number;
      cancelled: number;
      repriced: number;
      activeOrders: number;
      simulatedFilledOrders: number;
    };
    fills: {
      assessments: number;
      noFillAssessments: number;
      simulatedFullFills: number;
      simulatedFillEvents: number;
      simulatedPartialFills: number;
      queueModeledFills: number;
      simulatedFillNotional: number;
      blockers: Array<{
        key: string;
        count: number;
      }>;
    };
    hedges: {
      assessed: number;
      ready: number;
      blocked: number;
      readyRatePercent: number | null;
      intentsGenerated: number;
      blockers: Array<{
        key: string;
        count: number;
      }>;
    };
    economics: {
      modeledHedgedFills: number;
      modeledRetainedQuoteValue: number | null;
      modeledRetainedBasisQuoteValue: number | null;
      modeledRetainedEdgePercent: number | null;
      minimumObservedRetainedEdgePercent: number | null;
      maximumObservedRetainedEdgePercent: number | null;
      classification:
        "MODELED_SHADOW_ECONOMICS_NOT_REALIZED_PNL";
    };
    readiness: {
      state:
        | "NO_DATA"
        | "COLLECTING"
        | "SHADOW_EVIDENCE_SUFFICIENT";
      shadowEvidenceSufficient: boolean;
      paperEligible: false;
      liveEligible: false;
      gates: Array<{
        key: string;
        status:
          | "PASS"
          | "BLOCKED";
        passed: boolean;
        evidence: string;
      }>;
      paperBlockers: string[];
    };
  }>;
  readiness: {
    state:
      | "NO_DATA"
      | "COLLECTING"
      | "SHADOW_EVIDENCE_SUFFICIENT";
    shadowEvidenceSufficient: boolean;
    paperEligible: false;
    liveEligible: false;
    blockers: string[];
    paperBlockers: string[];
  };
  notes: string[];
  safety: {
    readOnlyAnalytics: true;
    simulatedEvidenceOnly: true;
    modeledEconomicsAreRealizedPnl: false;
    readinessGrantsPaperAuthority: false;
    readinessGrantsLiveAuthority: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    capitalReservationAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryExposureSnapshot {
  version: "22.1";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  controllerRunning: boolean;
  source: "PortfolioSnapshot";
  sourceGeneratedAt: number | null;
  sourceAgeMs: number | null;
  sourceExpiresAt: number | null;
  valuationQuoteAsset: string | null;
  summary: {
    configuredAssets: number;
    assessedAssets: number;
    withinTargetAssets: number;
    hedgeReviewAssets: number;
    exposureLimitBreachedAssets: number;
    unavailableAssets: number;
    grossDeviationQuoteValue: number | null;
    hedgeActionableAssets: 0;
  };
  assessments: Array<{
    asset: string;
    evidenceStatus: StrategyEvidenceStatus;
    actualQuantity: number | null;
    targetQuantity: number;
    deviationQuantity: number | null;
    direction:
      | "EXCESS"
      | "DEFICIT"
      | "BALANCED"
      | "UNKNOWN";
    unitPriceQuote: number | null;
    actualQuoteValue: number | null;
    deviationQuoteValue: number | null;
    maximumDeviationQuoteValue: number;
    exposureLimitQuoteValue: number;
    state:
      | "WITHIN_TARGET"
      | "HEDGE_REVIEW"
      | "EXPOSURE_LIMIT_BREACHED"
      | "NO_DATA";
    hedgeUrgency:
      | "NONE"
      | "NORMAL"
      | "URGENT"
      | "UNKNOWN";
    observedExchanges: string[];
    newestBalanceSynchronizedAt: number | null;
    oldestBalanceAgeMs: number | null;
    oldestValuationAgeMs: number | null;
    blockers: string[];
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    readOnlyExposureEvidence: true;
    classificationIsExecutionInstruction: false;
    hedgeProposalGenerated: false;
    hedgeIntentGenerated: false;
    portfolioMutationAllowed: false;
    balanceMutationAllowed: false;
    recoveryActionAllowed: false;
    capitalReservationAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryShadowTargetSnapshot {
  version: "22.2";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  sourceExposureGeneratedAt: number | null;
  sourcePortfolioGeneratedAt: number | null;
  sourceExpiresAt: number | null;
  summary: {
    configuredAssets: number;
    hedgeRequiredAssets: number;
    modeledTargets: number;
    notRequiredAssets: number;
    blockedAssets: number;
    totalModeledTargetQuoteValue: number | null;
    actionableTargets: 0;
    intentsGenerated: 0;
  };
  targets: Array<{
    id: string;
    asset: string;
    valuationQuoteAsset: string;
    valuationPair: string;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "TARGET_MODELED"
      | "NOT_REQUIRED"
      | "BLOCKED";
    side:
      | "BUY"
      | "SELL"
      | "NONE";
    urgency:
      | "NONE"
      | "NORMAL"
      | "URGENT"
      | "UNKNOWN";
    sourceExposureState: string;
    sourceDirection: string;
    hedgeRatio: number;
    deviationQuantity: number | null;
    deviationQuoteValue: number | null;
    modeledTargetQuantity: number | null;
    modeledTargetQuoteValue: number | null;
    modeledResidualDeviationQuantity: number | null;
    modeledResidualDeviationQuoteValue: number | null;
    modeledResidualState: string;
    candidateVenues: string[];
    selectedVenue: null;
    executionMarket: null;
    selectedPrice: null;
    executableQuantity: null;
    estimatedFeeQuoteValue: null;
    estimatedSlippageQuoteValue: null;
    totalEstimatedCostQuoteValue: null;
    executionAuthorized: false;
    automaticExecutionAllowed: false;
    blockers: string[];
    recursionProtection: {
      sourceStrategyId: "hedge-inventory-management";
      parentIntentId: null;
      recursionDepth: 0;
      maximumRecursionDepth: 0;
      recursiveHedgeAllowed: false;
    };
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    shadowTargetEvidenceOnly: true;
    targetIsHedgeProposal: false;
    targetIsStrategyIntent: false;
    venueSelectionAllowed: false;
    hedgeProposalGenerationAllowed: false;
    hedgeIntentGenerationAllowed: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    capitalReservationAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryRouteEconomicsSnapshot {
  version: "22.3";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  routeEconomicsConfigurationState: string;
  sourceTargetGeneratedAt: number | null;
  sourceRouteEvidenceGeneratedAt: number | null;
  summary: {
    targetsRequiringRoute: number;
    candidatesEvaluated: number;
    candidatesPassingEconomics: number;
    shadowRoutesSelected: number;
    blockedTargets: number;
    modeledFeeQuoteValue: number | null;
    modeledSlippageQuoteValue: number | null;
    actionableRoutes: 0;
    intentsGenerated: 0;
  };
  routes: Array<{
    id: string;
    targetId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    targetQuantity: number | null;
    state:
      | "SHADOW_ROUTE_MODELED"
      | "NO_ROUTE"
      | "NOT_REQUIRED"
      | "BLOCKED";
    evidenceStatus: StrategyEvidenceStatus;
    candidates: Array<{
      venue: string;
      market: string;
      asset: string;
      quoteAsset: string;
      side: "BUY" | "SELL";
      requestedQuantity: number;
      evidenceStatus: StrategyEvidenceStatus;
      state: "ECONOMICS_PASS" | "REJECTED";
      orderBookTimestamp: number;
      orderBookAgeMs: number | null;
      bestPrice: number | null;
      vwapPrice: number | null;
      executableQuantity: number;
      unfilledQuantity: number;
      grossNotionalQuoteValue: number | null;
      takerFeePercent: number;
      feeSource: "STATIC_CONFIG" | "PUBLIC_API" | "ACCOUNT_API";
      feeSynchronizedAt: number | null;
      feeExpiresAt: number | null;
      estimatedFeeQuoteValue: number | null;
      slippagePercent: number | null;
      estimatedSlippageQuoteValue: number | null;
      totalModeledFrictionQuoteValue: number | null;
      modeledAllInQuoteValue: number | null;
      blockers: string[];
      executionAuthorized: false;
    }>;
    selectedCandidate: {
      venue: string;
      market: string;
      asset: string;
      quoteAsset: string;
      side: "BUY" | "SELL";
      requestedQuantity: number;
      evidenceStatus: StrategyEvidenceStatus;
      state: "ECONOMICS_PASS" | "REJECTED";
      orderBookTimestamp: number;
      orderBookAgeMs: number | null;
      bestPrice: number | null;
      vwapPrice: number | null;
      executableQuantity: number;
      unfilledQuantity: number;
      grossNotionalQuoteValue: number | null;
      takerFeePercent: number;
      feeSource: "STATIC_CONFIG" | "PUBLIC_API" | "ACCOUNT_API";
      feeSynchronizedAt: number | null;
      feeExpiresAt: number | null;
      estimatedFeeQuoteValue: number | null;
      slippagePercent: number | null;
      estimatedSlippageQuoteValue: number | null;
      totalModeledFrictionQuoteValue: number | null;
      modeledAllInQuoteValue: number | null;
      blockers: string[];
      executionAuthorized: false;
    } | null;
    blockers: string[];
    actionable: false;
    intentGenerated: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    shadowRouteEvidenceOnly: true;
    routeSelectionIsExecutionApproval: false;
    marketRulesEvaluated: false;
    basisCorrelationRiskEvaluated: false;
    riskApprovalGranted: false;
    capitalReserved: false;
    hedgeIntentGenerationAllowed: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryMarketRuleSnapshot {
  version: "22.4";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  routeEconomicsConfigurationState: string;
  marketRuleConfigurationState: string;
  sourceRouteGeneratedAt: number | null;
  sourceMarketRuleEvidenceGeneratedAt: number | null;
  summary: {
    shadowRoutesSelected: number;
    capabilitiesEvaluated: number;
    feasibleRoutes: number;
    rejectedRoutes: number;
    blockedRoutes: number;
    totalOriginalQuantity: number | null;
    totalQuantizedQuantity: number | null;
    actionableRoutes: 0;
    intentsGenerated: 0;
  };
  assessments: Array<{
    id: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    venue: string | null;
    market: string | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "RULES_PASS"
      | "RULES_REJECTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceCapabilitySynchronizedAt: number | null;
    capabilityAgeMs: number | null;
    originalTargetQuantity: number | null;
    quantizedQuantity: number | null;
    quantizationLossQuantity: number | null;
    quantizationLossPercent: number | null;
    vwapPrice: number | null;
    modeledNotionalQuoteValue: number | null;
    rules: {
      tradingEnabled: boolean | null;
      maintenanceMode: boolean | null;
      marketOrderSupported: boolean | null;
      minimumQuantity: number | null;
      maximumQuantity: number | null;
      quantityStep: number | null;
      quantityPrecision: number | null;
      minimumNotional: number | null;
      maximumNotional: number | null;
    };
    blockers: string[];
    remainingGates: string[];
    executionAuthorized: false;
    actionable: false;
    intentGenerated: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    readOnlyMarketRuleEvidence: true;
    feasibilityIsExecutionApproval: false;
    quantityQuantizationIsExecutionInstruction: false;
    basisCorrelationRiskEvaluated: false;
    riskApprovalGranted: false;
    capitalReserved: false;
    hedgeIntentGenerationAllowed: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryPostRuleEconomicsSnapshot {
  version: "22.5";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  routeEconomicsConfigurationState: string;
  marketRuleConfigurationState: string;
  postRuleEconomicsConfigurationState: string;
  sourceRouteGeneratedAt: number | null;
  sourceMarketRuleGeneratedAt: number | null;
  sourceRouteEvidenceGeneratedAt: number | null;
  summary: {
    marketRuleAssessments: number;
    routesRequiringRevalidation: number;
    routesRevalidated: number;
    routesRejected: number;
    blockedRoutes: number;
    changedQuantityRoutes: number;
    revalidatedFeeQuoteValue: number | null;
    revalidatedSlippageQuoteValue: number | null;
    actionableRoutes: 0;
    intentsGenerated: 0;
  };
  assessments: Array<{
    id: string;
    routeId: string;
    marketRuleAssessmentId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    venue: string | null;
    market: string | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "REVALIDATED"
      | "REJECTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceMarketRuleState: string;
    originalTargetQuantity: number | null;
    quantizedQuantity: number | null;
    quantityChanged: boolean | null;
    originalEconomics: {
      vwapPrice: number | null;
      estimatedFeeQuoteValue: number | null;
      estimatedSlippageQuoteValue: number | null;
      modeledAllInQuoteValue: number | null;
    };
    revalidatedEconomics: {
      requestedQuantity: number | null;
      vwapPrice: number | null;
      executableQuantity: number | null;
      estimatedFeeQuoteValue: number | null;
      estimatedSlippageQuoteValue: number | null;
      modeledAllInQuoteValue: number | null;
    };
    candidateBlockers: string[];
    blockers: string[];
    remainingGates: string[];
    executionAuthorized: false;
    actionable: false;
    intentGenerated: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    readOnlyRevalidationEvidence: true;
    revalidationIsExecutionApproval: false;
    basisCorrelationRiskEvaluated: false;
    riskApprovalGranted: false;
    capitalReserved: false;
    hedgeIntentGenerationAllowed: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryBasisRiskSnapshot {
  version: "22.6";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  postRuleEconomicsConfigurationState: string;
  basisRiskConfigurationState: string;
  sourcePostRuleEconomicsGeneratedAt: number | null;
  sourceBasisRiskEvidenceGeneratedAt: number | null;
  thresholds: {
    maximumEvidenceAgeMs: number;
    maximumBasisDeviationPercent: number;
    minimumCorrelationCoefficient: number;
    minimumCorrelationObservations: number;
  };
  summary: {
    revalidatedRoutes: number;
    evidenceRecordsMatched: number;
    riskPassingRoutes: number;
    riskRejectedRoutes: number;
    blockedRoutes: number;
    maximumObservedBasisDeviationPercent: number | null;
    minimumObservedCorrelationCoefficient: number | null;
    actionableRoutes: 0;
    riskApprovalsGranted: 0;
    intentsGenerated: 0;
  };
  assessments: Array<{
    id: string;
    postRuleEconomicsAssessmentId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    venue: string | null;
    market: string | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "RISK_PASS"
      | "RISK_REJECTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourcePostRuleEconomicsState: string;
    sourceEvidenceObservedAt: number | null;
    evidenceAgeMs: number | null;
    hedgeQuantity: number | null;
    hedgeVwapPrice: number | null;
    referencePrice: number | null;
    signedBasisDeviationPercent: number | null;
    absoluteBasisDeviationPercent: number | null;
    maximumBasisDeviationPercent: number;
    correlationCoefficient: number | null;
    minimumCorrelationCoefficient: number;
    correlationObservations: number | null;
    minimumCorrelationObservations: number;
    correlationWindowMs: number | null;
    evidenceSource: "SYNCHRONIZED_RETURN_SERIES" | null;
    blockers: string[];
    remainingGates: string[];
    riskApprovalGranted: false;
    executionAuthorized: false;
    actionable: false;
    intentGenerated: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    readOnlyBasisCorrelationEvidence: true;
    screenIsRiskEngineApproval: false;
    riskApprovalGranted: false;
    capitalReserved: false;
    hedgeIntentGenerationAllowed: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryRiskApprovalSnapshot {
  version: "22.7";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  basisRiskConfigurationState: string;
  riskApprovalConfigurationState: string;
  sourceBasisRiskGeneratedAt: number | null;
  sourceRiskApprovalEvidenceGeneratedAt: number | null;
  thresholds: {
    maximumAssessmentAgeMs: number;
  };
  summary: {
    basisRiskPassingRoutes: number;
    evidenceRecordsMatched: number;
    riskApprovalsGranted: number;
    riskRejections: number;
    blockedRoutes: number;
    minimumObservedRiskScore: number | null;
    actionableRoutes: 0;
    capitalReservations: 0;
    intentsGenerated: 0;
  };
  assessments: Array<{
    id: string;
    basisRiskAssessmentId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    venue: string | null;
    market: string | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "RISK_APPROVED"
      | "RISK_REJECTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceBasisRiskState: string;
    sourceAssessmentAssessedAt: number | null;
    assessmentAgeMs: number | null;
    hedgeQuantity: number | null;
    hedgeVwapPrice: number | null;
    evidenceSource: "CANONICAL_RISK_ENGINE" | null;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "BLOCKED" | null;
    riskScore: number | null;
    riskChecks: {
      marketIntegrity: boolean;
      executionQuality: boolean;
      capitalAvailable: boolean;
      exposureAllowed: boolean;
      dailyLimitsAllowed: boolean;
    } | null;
    reasons: string[];
    warnings: string[];
    blockers: string[];
    remainingGates: string[];
    riskApprovalGranted: boolean;
    executionAuthorized: false;
    actionable: false;
    capitalReserved: false;
    intentGenerated: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    canonicalRiskEngineEvidenceOnly: true;
    strategyCallsRiskEngineDirectly: false;
    approvalIsExecutionAuthorization: false;
    capitalReserved: false;
    hedgeIntentGenerationAllowed: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryCapitalReservationSnapshot {
  version: "22.8";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  riskApprovalConfigurationState: string;
  capitalReservationConfigurationState: string;
  sourceRiskApprovalGeneratedAt: number | null;
  sourceCapitalReservationEvidenceGeneratedAt: number | null;
  thresholds: {
    maximumEvidenceAgeMs: number;
    minimumRemainingTtlMs: number;
  };
  summary: {
    riskApprovedRoutes: number;
    evidenceRecordsMatched: number;
    activeReservations: number;
    reservationRejections: number;
    blockedRoutes: number;
    totalReservedAmount: number;
    minimumObservedRemainingTtlMs: number | null;
    actionableRoutes: 0;
    intentsGenerated: 0;
  };
  assessments: Array<{
    id: string;
    riskApprovalAssessmentId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    venue: string | null;
    market: string | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "CAPITAL_RESERVED"
      | "RESERVATION_REJECTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceRiskApprovalState: string;
    sourceEvidenceObservedAt: number | null;
    evidenceAgeMs: number | null;
    hedgeQuantity: number | null;
    hedgeVwapPrice: number | null;
    evidenceSource: "CAPITAL_RESERVATION_SERVICE" | null;
    requestedAmount: number | null;
    reservationId: string | null;
    reservationOwnerType:
      | "EXECUTION_PLAN"
      | "STRATEGY_RISK_APPROVAL"
      | "MANUAL"
      | null;
    reservationOwnerId: string | null;
    reservedAmount: number | null;
    reservationStatus:
      | "ACTIVE"
      | "COMMITTED"
      | "RELEASED"
      | "EXPIRED"
      | null;
    reservationCreatedAt: number | null;
    reservationExpiresAt: number | null;
    remainingTtlMs: number | null;
    reservationReasons: string[];
    blockers: string[];
    remainingGates: string[];
    riskApprovalGranted: boolean;
    capitalReserved: boolean;
    executionAuthorized: false;
    actionable: false;
    intentGenerated: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    canonicalCapitalReservationEvidenceOnly: true;
    strategyCreatesReservations: false;
    strategyCommitsReservations: false;
    strategyReleasesReservations: false;
    reservationIsExecutionAuthorization: false;
    hedgeIntentGenerationAllowed: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryIntentProposalSnapshot {
  version: "22.9";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  capitalReservationConfigurationState: string;
  intentProposalConfigurationState: string;
  sourceCapitalReservationGeneratedAt: number | null;
  thresholds: {
    maximumCapitalReservationAgeMs: number;
    proposalTtlMs: number;
    maximumRecursionDepth: 0;
  };
  summary: {
    capitalReservedRoutes: number;
    proposalsReady: number;
    blockedRoutes: number;
    notApplicableRoutes: number;
    totalProposedQuantity: number;
    totalProposedCapital: number;
    strategyIntentsGenerated: 0;
    actionableRoutes: 0;
  };
  assessments: Array<{
    id: string;
    capitalReservationAssessmentId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    venue: string | null;
    market: string | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "PROPOSAL_READY"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceCapitalReservationState: string;
    sourceEvidenceObservedAt: number | null;
    sourceAgeMs: number | null;
    proposal: {
      id: string;
      strategyId: "hedge-inventory-management";
      kind: "PROPOSED_STRATEGY_ACTION";
      proposalType: "HEDGE_INVENTORY_REDUCTION";
      proposedMode: "SHADOW";
      status: "PROPOSED";
      sourceType: "PORTFOLIO_EXPOSURE";
      sourceCapitalReservationAssessmentId: string;
      sourceRiskApprovalAssessmentId: string;
      routeId: string;
      asset: string;
      quoteAsset: string;
      side: "BUY" | "SELL";
      venue: string;
      market: string;
      proposedQuantity: number;
      referenceVwapPrice: number;
      proposedCapital: number;
      capitalReservationId: string;
      capitalReservationExpiresAt: number;
      recursionDepth: 0;
      createdAt: number;
      expiresAt: number;
      persistedAsStrategyIntent: false;
      executionAuthorized: false;
      automaticExecutionAllowed: false;
    } | null;
    blockers: string[];
    remainingGates: string[];
    proposalGenerated: boolean;
    persistedAsStrategyIntent: false;
    intentGenerated: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    exactCapitalReservationBinding: true;
    deterministicBoundedProposalOnly: true;
    proposalIsStrategyIntent: false;
    strategyPersistsIntents: false;
    strategyCallsIntentService: false;
    recursionDepth: 0;
    recursiveHedgeAllowed: false;
    capitalReservationMutationAllowed: false;
    intentExecutionAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryIntentPersistenceSnapshot {
  version: "22.10";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  intentProposalConfigurationState: string;
  intentPersistenceConfigurationState: string;
  sourceIntentProposalGeneratedAt: number | null;
  thresholds: {
    maximumProposalAgeMs: number;
  };
  summary: {
    proposalsReady: number;
    canonicalIntentsPersisted: number;
    proposalsNotPersisted: number;
    blockedRoutes: number;
    activeShadowIntents: number;
    executableIntents: 0;
    actionableRoutes: 0;
  };
  assessments: Array<{
    id: string;
    intentProposalAssessmentId: string;
    sourceProposalId: string | null;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL" | "NONE";
    venue: string | null;
    market: string | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "INTENT_PERSISTED"
      | "NOT_PERSISTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceProposalState: string;
    proposalAgeMs: number | null;
    intent: {
      id: string;
      strategyId: "hedge-inventory-management";
      signalId: string;
      kind: "PROPOSED_STRATEGY_ACTION";
      proposedMode: "SHADOW";
      proposalType: "HEDGE_INVENTORY_REDUCTION";
      proposedCapital: number;
      createdAt: number;
      expiresAt: number;
      status: "PROPOSED";
      executionAuthorized: false;
      automaticExecutionAllowed: false;
      evidence: {
        type: "HEDGE_INVENTORY_REDUCTION";
        sourceProposalId: string;
        sourceType: "PORTFOLIO_EXPOSURE";
        sourceCapitalReservationAssessmentId: string;
        sourceRiskApprovalAssessmentId: string;
        routeId: string;
        asset: string;
        quoteAsset: string;
        side: "BUY" | "SELL";
        venue: string;
        market: string;
        proposedQuantity: number;
        referenceVwapPrice: number;
        capitalReservationId: string;
        capitalReservationExpiresAt: number;
        recursionDepth: 0;
        reservationMutationAuthorized: false;
      };
    } | null;
    blockers: string[];
    remainingGates: string[];
    intentGenerated: boolean;
    intentPersisted: boolean;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    canonicalStrategyIntentServiceOnly: true;
    explicitPersistenceHandoffOnly: true;
    readModelCreatesIntents: false;
    deterministicReplayDeduplication: true;
    oneIntentPerCapitalReservation: true;
    intentIsExecutionAuthorization: false;
    reservationMutationAuthorized: false;
    recursiveHedgeAllowed: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryIntentLifecycleSnapshot {
  version: "22.11";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  intentProposalConfigurationState: string;
  intentPersistenceConfigurationState: string;
  intentLifecycleConfigurationState: string;
  sourceIntentProposalGeneratedAt: number | null;
  thresholds: {
    maximumIntentAgeMs: number;
  };
  summary: {
    canonicalIntents: number;
    activeIntents: number;
    expiredIntents: number;
    revokedIntents: number;
    blockedIntents: number;
    terminalEventsRecorded: number;
    executableIntents: 0;
    actionableIntents: 0;
  };
  assessments: Array<{
    id: string;
    intentId: string;
    sourceProposalId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL";
    venue: string;
    market: string;
    proposedQuantity: number;
    referenceVwapPrice: number;
    proposedCapital: number;
    capitalReservationId: string;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "ACTIVE"
      | "EXPIRED"
      | "REVOKED"
      | "BLOCKED";
    sourceProposalState: string | null;
    intentAgeMs: number | null;
    intentExpiresAt: number;
    capitalReservationExpiresAt: number;
    terminalEvent: {
      id: string;
      intentId: string;
      sourceProposalId: string;
      state: "EXPIRED" | "REVOKED";
      reason: string;
      recordedAt: number;
      canonicalIntentMutated: false;
      reservationMutationAuthorized: false;
      executionAuthorized: false;
    } | null;
    blockers: string[];
    remainingGates: string[];
    lifecycleRevalidated: boolean;
    terminal: boolean;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    immutableTerminalEvidenceOnly: true;
    explicitLifecycleHandoffOnly: true;
    readModelCreatesLifecycleEvents: false;
    terminalStateIrreversible: true;
    canonicalIntentMutated: false;
    sourceProposalRevalidatedExactly: true;
    reservationMutationAuthorized: false;
    intentIsExecutionAuthorization: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryIntentLastLookSnapshot {
  version: "22.12";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  intentLifecycleConfigurationState: string;
  intentPreflightConfigurationState: string;
  sourceIntentLifecycleGeneratedAt: number | null;
  sourceIntentProposalGeneratedAt: number | null;
  thresholds: {
    maximumLifecycleAgeMs: number;
  };
  summary: {
    lifecycleIntents: number;
    lifecycleActiveIntents: number;
    preflightPassedIntents: number;
    preflightRejectedIntents: number;
    blockedIntents: number;
    executionPlansCreated: 0;
    executableIntents: 0;
    actionableIntents: 0;
  };
  assessments: Array<{
    id: string;
    lifecycleAssessmentId: string;
    intentId: string;
    sourceProposalId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL";
    venue: string;
    market: string;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "PREFLIGHT_PASS"
      | "PREFLIGHT_REJECTED"
      | "BLOCKED";
    sourceLifecycleState: string;
    sourceProposalState: string | null;
    lifecycleAgeMs: number;
    intentAgeMs: number | null;
    intentExpiresAt: number;
    capitalReservationId: string;
    capitalReservationExpiresAt: number;
    proposedQuantity: number;
    referenceVwapPrice: number;
    proposedCapital: number;
    blockers: string[];
    remainingGates: string[];
    lastLookPassed: boolean;
    executionPlanCreated: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    readOnlyLastLookEvidence: true;
    lifecycleActiveIntentsOnly: true;
    exactSourceLineageRequired: true;
    ttlRecheckedAtPreflight: true;
    preflightPassIsExecutionAuthorization: false;
    executionPlanCreationAllowed: false;
    reservationMutationAuthorized: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryShadowExecutionPlanSnapshot {
  version: "22.13";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  intentPreflightConfigurationState: string;
  executionPlanProposalConfigurationState: string;
  sourceIntentPreflightGeneratedAt: number | null;
  sourceIntentLifecycleGeneratedAt: number | null;
  thresholds: {
    maximumPreflightAgeMs: number;
    proposalTtlMs: number;
  };
  summary: {
    preflightPassedIntents: number;
    planProposalsReady: number;
    notApplicableIntents: number;
    blockedIntents: number;
    totalProposedQuantity: number;
    totalProposedCapital: number;
    canonicalExecutionPlansCreated: 0;
    executablePlans: 0;
    actionablePlans: 0;
  };
  assessments: Array<{
    id: string;
    lastLookAssessmentId: string;
    intentId: string;
    sourceIntentProposalId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    side: "BUY" | "SELL";
    venue: string;
    market: string;
    evidenceStatus: StrategyEvidenceStatus;
    state: "PLAN_PROPOSAL_READY" | "NOT_APPLICABLE" | "BLOCKED";
    sourcePreflightState: string;
    preflightAgeMs: number;
    proposal: {
      id: string;
      validationHash: string;
      mode: "SHADOW";
      executionType: "SINGLE_LEG_INVENTORY_REDUCTION";
      proposedCapital: number;
      leg: {
        venue: string;
        market: string;
        side: "BUY" | "SELL";
        quantity: number;
        referencePrice: number;
        orderTypeSelected: false;
        timeInForceSelected: false;
        submissionAuthorized: false;
      };
      capitalReservation: {
        id: string;
        amount: number;
        expiresAt: number;
        commitAuthorized: false;
        releaseAuthorized: false;
      };
      createdAt: number;
      expiresAt: number;
      executionPlanMaterialized: false;
      executionAuthorized: false;
      orderSubmissionAuthorized: false;
    } | null;
    blockers: string[];
    remainingGates: string[];
    planProposalGenerated: boolean;
    executionPlanCreated: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    deterministicShadowProposalOnly: true;
    canonicalExecutionPlannerCalled: false;
    proposalIsCanonicalExecutionPlan: false;
    singleLegReferenceOnly: true;
    orderParametersSelected: false;
    capitalReservationMutationAuthorized: false;
    executionPlanCreationAllowed: false;
    executionAuthorized: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryShadowFillSimulationSnapshot {
  version: "22.14";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  executionPlanProposalConfigurationState: string;
  shadowFillSimulationConfigurationState: string;
  sourceExecutionPlanProposalGeneratedAt: number | null;
  sourceFillEvidenceGeneratedAt: number | null;
  thresholds: {
    maximumEvidenceAgeMs: number;
    maximumSlippagePercent: number;
  };
  summary: {
    planProposalsEvaluated: number;
    simulatedFullFills: number;
    simulatedPartialFills: number;
    rejectedSimulations: number;
    notApplicablePlans: number;
    blockedPlans: number;
    totalRequestedQuantity: number;
    totalSimulatedFilledQuantity: number;
    totalSimulatedResidualQuantity: number;
    totalSimulatedGrossQuoteValue: number;
    totalSimulatedFeeQuoteValue: number;
    totalSimulatedSlippageQuoteValue: number;
    totalResidualExposureQuoteValue: number;
    actualExchangeFills: 0;
    canonicalExecutionPlansCreated: 0;
    executablePlans: 0;
    actionablePlans: 0;
  };
  assessments: Array<{
    id: string;
    planAssessmentId: string;
    planProposalId: string | null;
    intentId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    venue: string;
    market: string;
    side: "BUY" | "SELL";
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "SIMULATED_FULL_FILL"
      | "SIMULATED_PARTIAL_FILL"
      | "SIMULATION_REJECTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourcePlanState: string;
    evidenceAgeMs: number | null;
    simulation: {
      id: string;
      sourcePlanProposalId: string;
      sourcePlanValidationHash: string;
      sourceEvidenceId: string;
      requestedQuantity: number;
      simulatedFilledQuantity: number;
      simulatedResidualQuantity: number;
      fillRatioPercent: number;
      referencePrice: number;
      simulatedVwapPrice: number;
      simulatedGrossQuoteValue: number;
      simulatedFeeQuoteValue: number;
      quoteFlow: "COST" | "PROCEEDS";
      simulatedQuoteValueAfterFees: number;
      simulatedSlippagePercent: number;
      simulatedSlippageQuoteValue: number;
      residualExposureQuoteValue: number;
      simulatedAt: number;
      evidenceObservedAt: number;
      method: "EXACT_MATCH_SHADOW_ORDER_BOOK_REPLAY_V22_14";
      exchangeFill: false;
      balanceMutationAuthorized: false;
      capitalReservationMutationAuthorized: false;
      executionAuthorized: false;
      orderSubmissionAuthorized: false;
    } | null;
    blockers: string[];
    remainingGates: string[];
    simulatedFillGenerated: boolean;
    exchangeFillCreated: false;
    executionReconciled: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    readOnlyShadowSimulationOnly: true;
    exactPlanAndEvidenceLineageRequired: true;
    feesVwapSlippageAndResidualModeled: true;
    exchangeFillCreated: false;
    canonicalExecutionPlannerCalled: false;
    executionReconciliationAllowed: false;
    portfolioMutationAllowed: false;
    balanceMutationAllowed: false;
    capitalReservationMutationAllowed: false;
    executionAuthorized: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryResidualReconciliationSnapshot {
  version: "22.15";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  shadowFillSimulationConfigurationState: string;
  residualReconciliationConfigurationState: string;
  sourceFillSimulationGeneratedAt: number | null;
  sourceReconciliationEvidenceGeneratedAt: number | null;
  thresholds: {
    maximumEvidenceAgeMs: number;
    residualQuantityTolerance: number;
    criticalResidualExposureQuoteValue: number;
  };
  summary: {
    eligibleSimulations: number;
    reconciledClosed: number;
    recoveryRequired: number;
    warningResiduals: number;
    criticalResiduals: number;
    rejectedReconciliations: number;
    notApplicableSimulations: number;
    blockedSimulations: number;
    totalReconciledResidualQuantity: number;
    totalReconciledResidualExposureQuoteValue: number;
    liveReconciliationRecordsCreated: 0;
    recoveryIncidentsCreated: 0;
    recoveryActionsCreated: 0;
    executableRecoveryActions: 0;
    actionableRecoveryActions: 0;
  };
  assessments: Array<{
    id: string;
    fillSimulationAssessmentId: string;
    simulationId: string | null;
    planProposalId: string | null;
    intentId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    venue: string;
    market: string;
    side: "BUY" | "SELL";
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "RECONCILED_CLOSED"
      | "RECOVERY_REQUIRED"
      | "RECONCILIATION_REJECTED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceFillSimulationState: string;
    evidenceAgeMs: number | null;
    reconciliation: {
      id: string;
      sourceSimulationId: string;
      sourcePlanProposalId: string;
      sourceEvidenceId: string;
      residualDirection: "LONG" | "SHORT" | "FLAT";
      requestedQuantity: number;
      reconciledFilledQuantity: number;
      reconciledResidualQuantity: number;
      referencePrice: number;
      reconciledResidualExposureQuoteValue: number;
      recoveryRequired: boolean;
      severity: "NONE" | "WARNING" | "CRITICAL";
      recommendedAction:
        | "NONE"
        | "REVIEW_RESIDUAL_HEDGE"
        | "ESCALATE_RESIDUAL_EXPOSURE";
      reconciledAt: number;
      evidenceObservedAt: number;
      method: "EXACT_MATCH_SHADOW_LEDGER_RECONCILIATION_V22_15";
      liveReconciliationRecordCreated: false;
      recoveryIncidentCreated: false;
      recoveryActionAuthorized: false;
      balanceMutationAuthorized: false;
      executionAuthorized: false;
      orderSubmissionAuthorized: false;
    } | null;
    recoveryRequired: boolean | null;
    blockers: string[];
    remainingGates: string[];
    liveReconciliationRecordCreated: false;
    recoveryIncidentCreated: false;
    recoveryActionCreated: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    readOnlyShadowReconciliationOnly: true;
    exactSimulationAndLedgerLineageRequired: true;
    liveReconciliationEngineCalled: false;
    executionRecoveryEngineCalled: false;
    recoveryIncidentCreationAllowed: false;
    recoveryActionCreationAllowed: false;
    portfolioMutationAllowed: false;
    balanceMutationAllowed: false;
    capitalReservationMutationAllowed: false;
    executionAuthorized: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryShadowRecoveryProposalSnapshot {
  version: "22.16";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  residualReconciliationConfigurationState: string;
  recoveryProposalConfigurationState: string;
  sourceResidualReconciliationGeneratedAt: number | null;
  thresholds: {
    maximumReconciliationAgeMs: number;
    proposalTtlMs: number;
    maximumProposalQuoteValue: number;
  };
  summary: {
    recoveryRequiredAssessments: number;
    recoveryProposalsReady: number;
    warningProposals: number;
    criticalProposals: number;
    notRequiredAssessments: number;
    notApplicableAssessments: number;
    blockedAssessments: number;
    totalProposedRecoveryQuantity: number;
    totalProposedRecoveryQuoteValue: number;
    recoveryIncidentsCreated: 0;
    recoveryActionsCreated: 0;
    canonicalExecutionPlansCreated: 0;
    executableRecoveryActions: 0;
    actionableRecoveryActions: 0;
  };
  assessments: Array<{
    id: string;
    reconciliationAssessmentId: string;
    reconciliationId: string | null;
    simulationId: string | null;
    planProposalId: string | null;
    intentId: string;
    routeId: string;
    asset: string;
    quoteAsset: string;
    venue: string;
    market: string;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "RECOVERY_PROPOSAL_READY"
      | "NOT_REQUIRED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceReconciliationState: string;
    reconciliationAgeMs: number | null;
    proposal: {
      id: string;
      validationHash: string;
      kind: "SHADOW_RECOVERY_ACTION_PROPOSAL";
      status: "PROPOSED";
      mode: "SHADOW";
      recoveryActionType:
        | "RESIDUAL_HEDGE_REVIEW"
        | "RESIDUAL_EXPOSURE_ESCALATION";
      sourceReconciliationId: string;
      sourceSimulationId: string;
      sourcePlanProposalId: string;
      residualDirection: "LONG" | "SHORT";
      sourceSeverity: "WARNING" | "CRITICAL";
      sourceRecommendedAction:
        | "REVIEW_RESIDUAL_HEDGE"
        | "ESCALATE_RESIDUAL_EXPOSURE";
      leg: {
        venue: string;
        market: string;
        side: "BUY" | "SELL";
        quantity: number;
        referencePrice: number;
        estimatedQuoteValue: number;
        orderTypeSelected: false;
        timeInForceSelected: false;
        submissionAuthorized: false;
      };
      createdAt: number;
      expiresAt: number;
      recoveryIncidentCreated: false;
      recoveryActionMaterialized: false;
      canonicalExecutionPlanCreated: false;
      executionAuthorized: false;
      automaticExecutionAllowed: false;
      orderSubmissionAuthorized: false;
    } | null;
    blockers: string[];
    remainingGates: string[];
    recoveryProposalGenerated: boolean;
    recoveryIncidentCreated: false;
    recoveryActionCreated: false;
    canonicalExecutionPlanCreated: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    deterministicBoundedShadowProposalOnly: true;
    sourceResidualNeverExceeded: true;
    orderParametersSelected: false;
    liveReconciliationEngineCalled: false;
    executionRecoveryEngineCalled: false;
    recoveryIncidentCreationAllowed: false;
    recoveryActionCreationAllowed: false;
    canonicalExecutionPlanCreationAllowed: false;
    portfolioMutationAllowed: false;
    balanceMutationAllowed: false;
    capitalReservationMutationAllowed: false;
    executionAuthorized: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryRecoveryProposalLifecycleSnapshot {
  version: "22.17";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  recoveryProposalConfigurationState: string;
  recoveryProposalLifecycleConfigurationState: string;
  sourceRecoveryProposalGeneratedAt: number | null;
  operatorDecisionEvidenceStatus: StrategyEvidenceStatus;
  sourceOperatorDecisionGeneratedAt: number | null;
  thresholds: {
    maximumProposalAgeMs: number;
    maximumOperatorDecisionAgeMs: number;
  };
  summary: {
    sourceProposalsReady: number;
    activeAwaitingOperatorDecision: number;
    operatorApproved: number;
    operatorRejected: number;
    expiredProposals: number;
    notApplicableAssessments: number;
    blockedAssessments: number;
    explicitOperatorDecisionsAccepted: number;
    lifecycleRecordsProduced: number;
    recoveryIncidentsCreated: 0;
    recoveryActionsCreated: 0;
    canonicalExecutionPlansCreated: 0;
    executableRecoveryActions: 0;
    actionableRecoveryActions: 0;
  };
  assessments: Array<{
    id: string;
    sourceAssessmentId: string;
    proposalId: string | null;
    proposalValidationHash: string | null;
    routeId: string;
    asset: string;
    quoteAsset: string;
    venue: string;
    market: string;
    side: "BUY" | "SELL" | null;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "ACTIVE_AWAITING_OPERATOR_DECISION"
      | "OPERATOR_APPROVED"
      | "OPERATOR_REJECTED"
      | "EXPIRED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceProposalState: string;
    proposalAgeMs: number | null;
    proposalExpiresAt: number | null;
    operatorDecision: {
      id: string;
      proposalId: string;
      proposalValidationHash: string;
      decision: "APPROVE" | "REJECT";
      decidedBy: string;
      reason: string;
      decidedAt: number;
      recoveryActionAuthorized: false;
      executionAuthorized: false;
      orderSubmissionAuthorized: false;
    } | null;
    operatorDecisionAgeMs: number | null;
    lifecycleRecord: {
      id: string;
      state: "EXPIRED" | "OPERATOR_APPROVED" | "OPERATOR_REJECTED";
      reason: string;
      recordedAt: number;
      operatorDecisionId: string | null;
      sourceProposalMutated: false;
      recoveryActionAuthorized: false;
      executionAuthorized: false;
      orderSubmissionAuthorized: false;
    } | null;
    blockers: string[];
    remainingGates: string[];
    lifecycleRevalidated: boolean;
    terminal: boolean;
    sourceProposalMutated: false;
    recoveryIncidentCreated: false;
    recoveryActionCreated: false;
    canonicalExecutionPlanCreated: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    immutableLifecycleEvidenceOnly: true;
    exactSourceProposalAndHashRequired: true;
    explicitExternalOperatorDecisionOnly: true;
    readModelCreatesOperatorDecisions: false;
    operatorApprovalIsExecutionAuthorization: false;
    sourceProposalMutated: false;
    recoveryIncidentCreationAllowed: false;
    recoveryActionCreationAllowed: false;
    canonicalExecutionPlanCreationAllowed: false;
    portfolioMutationAllowed: false;
    balanceMutationAllowed: false;
    capitalReservationMutationAllowed: false;
    executionAuthorized: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface HedgeInventoryShadowRecoveryActionHandoffSnapshot {
  version: "22.18";
  strategyId: "hedge-inventory-management";
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  configurationState: string;
  recoveryProposalConfigurationState: string;
  recoveryProposalLifecycleConfigurationState: string;
  recoveryActionHandoffConfigurationState: string;
  sourceRecoveryProposalGeneratedAt: number | null;
  sourceRecoveryProposalLifecycleGeneratedAt: number | null;
  thresholds: {
    maximumLifecycleAgeMs: number;
    handoffTtlMs: number;
    maximumHandoffQuoteValue: number;
  };
  summary: {
    lifecycleAssessments: number;
    operatorApprovedAssessments: number;
    recoveryHandoffsReady: number;
    awaitingOperatorDecision: number;
    notApprovedAssessments: number;
    notApplicableAssessments: number;
    blockedAssessments: number;
    totalHandoffQuantity: number;
    totalHandoffQuoteValue: number;
    recoveryIncidentsCreated: 0;
    recoveryActionsCreated: 0;
    canonicalExecutionPlansCreated: 0;
    capitalReservationsCreated: 0;
    executableRecoveryActions: 0;
    actionableRecoveryActions: 0;
  };
  assessments: Array<{
    id: string;
    lifecycleAssessmentId: string;
    lifecycleRecordId: string | null;
    recoveryProposalId: string | null;
    operatorDecisionId: string | null;
    routeId: string;
    asset: string;
    quoteAsset: string;
    venue: string;
    market: string;
    evidenceStatus: StrategyEvidenceStatus;
    state:
      | "RECOVERY_HANDOFF_READY"
      | "AWAITING_OPERATOR_DECISION"
      | "NOT_APPROVED"
      | "NOT_APPLICABLE"
      | "BLOCKED";
    sourceLifecycleState: string;
    lifecycleAgeMs: number | null;
    handoff: {
      id: string;
      validationHash: string;
      kind: "SHADOW_RECOVERY_ACTION_HANDOFF";
      status: "HANDOFF_READY";
      mode: "SHADOW";
      recoveryActionType:
        | "RESIDUAL_HEDGE_REVIEW"
        | "RESIDUAL_EXPOSURE_ESCALATION";
      sourceLifecycleRecordId: string;
      sourceRecoveryProposalId: string;
      sourceOperatorDecisionId: string;
      residualDirection: "LONG" | "SHORT";
      sourceSeverity: "WARNING" | "CRITICAL";
      operator: {
        decidedBy: string;
        reason: string;
        decidedAt: number;
        decision: "APPROVE";
      };
      leg: {
        venue: string;
        market: string;
        side: "BUY" | "SELL";
        quantity: number;
        referencePrice: number;
        estimatedQuoteValue: number;
        orderTypeSelected: false;
        timeInForceSelected: false;
        submissionAuthorized: false;
      };
      createdAt: number;
      expiresAt: number;
      recoveryIncidentCreated: false;
      recoveryActionMaterialized: false;
      canonicalExecutionPlanCreated: false;
      capitalReservationCreated: false;
      executionAuthorized: false;
      automaticExecutionAllowed: false;
      orderSubmissionAuthorized: false;
    } | null;
    blockers: string[];
    remainingGates: string[];
    handoffGenerated: boolean;
    sourceProposalMutated: false;
    recoveryIncidentCreated: false;
    recoveryActionCreated: false;
    canonicalExecutionPlanCreated: false;
    capitalReservationCreated: false;
    executionAuthorized: false;
    actionable: false;
  }>;
  blockers: string[];
  notes: string[];
  safety: {
    deterministicBoundedShadowHandoffOnly: true;
    exactApprovedLifecycleAndProposalLineageRequired: true;
    operatorApprovalConsumedAsEvidenceOnly: true;
    sourceProposalQuantityAndValueNeverExceeded: true;
    originalProposalExpiryNeverExceeded: true;
    orderParametersSelected: false;
    sourceProposalMutated: false;
    recoveryIncidentCreationAllowed: false;
    recoveryActionCreationAllowed: false;
    canonicalExecutionPlanCreationAllowed: false;
    capitalReservationMutationAllowed: false;
    portfolioMutationAllowed: false;
    balanceMutationAllowed: false;
    executionAuthorized: false;
    paperExecutionAllowed: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface StrategyListItem {
  metadata: StrategyMetadata;
  runtime: StrategyRuntimeSnapshot;
}

export interface StrategyCollection {
  generatedAt: number;
  version: string;
  mode: string;
  evidenceStatus: StrategyEvidenceStatus;
  orchestratorRunning: boolean;
  strategyCount: number;
  strategies: StrategyListItem[];
  safety: StrategySafetyReadModel;
}

export interface StrategyBlockerDiagnostics {
  generatedAt: number;
  evidenceStatus: StrategyEvidenceStatus;
  evaluatedRecords: number;
  blockedRecords: number;
  qualifiedRecords: number;
  blockers: Array<{
    code: string;
    count: number;
    sources: string[];
    detail: string | null;
  }>;
}

export interface StrategyDetail
extends StrategyListItem {
  blockerDiagnostics:
    StrategyBlockerDiagnostics;

  configuration: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      unknown | null;
  };
  lifecycle: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      StrategyLifecycleSnapshot | null;
  };
  fillAndHedge: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      StrategyFillAndHedgeSnapshot | null;
  };
  shadowAnalytics: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      StrategyShadowAnalyticsSnapshot | null;
  };
  exposure: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryExposureSnapshot | null;
  };
  hedgeTargets: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryShadowTargetSnapshot | null;
  };
  hedgeRoutes: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryRouteEconomicsSnapshot | null;
  };
  hedgeMarketRules: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryMarketRuleSnapshot | null;
  };
  hedgePostRuleEconomics: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryPostRuleEconomicsSnapshot | null;
  };
  hedgeBasisRisk: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryBasisRiskSnapshot | null;
  };
  hedgeRiskApproval: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryRiskApprovalSnapshot | null;
  };
  hedgeCapitalReservation: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryCapitalReservationSnapshot | null;
  };
  hedgeIntentProposal: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryIntentProposalSnapshot | null;
  };
  hedgeIntentPersistence: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryIntentPersistenceSnapshot | null;
  };
  hedgeIntentLifecycle: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryIntentLifecycleSnapshot | null;
  };
  hedgeIntentLastLook: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryIntentLastLookSnapshot | null;
  };
  hedgeExecutionPlanProposal: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryShadowExecutionPlanSnapshot | null;
  };
  hedgeShadowFillSimulation: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryShadowFillSimulationSnapshot | null;
  };
  hedgeResidualReconciliation: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryResidualReconciliationSnapshot | null;
  };
  hedgeRecoveryProposal: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryShadowRecoveryProposalSnapshot | null;
  };
  hedgeRecoveryProposalLifecycle: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryRecoveryProposalLifecycleSnapshot | null;
  };
  hedgeRecoveryActionHandoff: {
    evidenceStatus:
      StrategyEvidenceStatus;
    value:
      HedgeInventoryShadowRecoveryActionHandoffSnapshot | null;
  };
  signals: {
    evidenceStatus: StrategyEvidenceStatus;
    records: StrategySignal[];
  };
  intents: {
    evidenceStatus: StrategyEvidenceStatus;
    records: StrategyIntent[];
  };
  analytics: {
    evidenceStatus: StrategyEvidenceStatus;
    legacyHistoryAttribution:
      "UNATTRIBUTED_LEGACY";
    metrics:
      StrategyPerformanceAnalytics | null;
    reason: string;
  };
  attribution: {
    evidenceStatus: StrategyEvidenceStatus;
    intentEvidenceStatus: StrategyEvidenceStatus;
    intentId: string | null;
    attributedShadowOutcomes: {
      evidenceStatus: StrategyEvidenceStatus;
      count: number | null;
    };
    attributedPaperTrades: {
      evidenceStatus: StrategyEvidenceStatus;
      count: number | null;
    };
    shadowCoverage:
      StrategyAttributionCoverage | null;
    paperCoverage:
      StrategyAttributionCoverage | null;
  };
  safety: StrategySafetyReadModel;
}

export interface StrategyCollectionResponse {
  success: true;
  data: StrategyCollection;
}

export interface StrategyDetailResponse {
  success: true;
  data: StrategyDetail;
}
