export type DynamicMarketMakingPaperClosureState =
  | "NO_DATA"
  | "CAPABILITY_EVIDENCE_BLOCKED"
  | "INVENTORY_EVIDENCE_BLOCKED"
  | "WAITING_FOR_EMPIRICAL_FILL"
  | "WAITING_FOR_MODELED_EDGE"
  | "SIGNAL_AVAILABLE"
  | "SIGNAL_ADMITTED"
  | "PAPER_BLOCKED"
  | "PAPER_QUEUED";

export interface DynamicMarketMakingRouteSummary {
  routeId: string;
  exchange: string;
  market: string;
  status: "QUALIFIED" | "BLOCKED";
  blockers: string[];
  diagnostics: {
    book: null | {
      bestBid: number;
      bestAsk: number;
      midPrice: number;
      bookSpreadPercent: number;
      bidDepthQuantity: number;
      askDepthQuantity: number;
      volatilitySampleCount: number;
      minimumVolatilitySamples: number;
    };
    capability: null | {
      baseAsset: string;
      quoteAsset: string;
      postOnlySupported: boolean;
      capabilitySynchronizedAt: number;
      priceStep: number | null;
      quantityStep: number | null;
      minimumNotional: number | null;
      makerFeePercent: number;
    };
    inventory: null | {
      source: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS";
      synchronizedAt: number;
      ageMs: number;
      baseAsset: string;
      quoteAsset: string;
      baseTotal: number;
      quoteTotal: number;
      baseAvailable: number;
      quoteAvailable: number;
      baseValueQuote: number | null;
      totalValueQuote: number | null;
      baseSharePercent: number | null;
      targetBasePercent: number;
      deviationPercent: number | null;
      skewPercent: number | null;
      unadjustedFairPrice: number | null;
      fairPrice: number | null;
    };
    fillQuality: null | {
      source: "EXCHANGE_PUBLIC_TRADE_TAPE";
      sampleCount: number;
      minimumSamples: number;
      lookbackMs: number;
      aggressorFlowImbalance: number | null;
      tradeFlowFairValueSkewPercent: number | null;
      adverseSelectionSpreadPercent: number | null;
      liquidityCoverageMultiple: number | null;
      minimumLiquidityCoverageMultiple: number;
      liquiditySpreadPenaltyPercent: number | null;
      bidFillProbabilityPercent: number | null;
      askFillProbabilityPercent: number | null;
      minimumFillProbabilityPercent: number;
      queuePositionKnown: false;
    };
    economics: null | {
      bidQuotePrice: number;
      askQuotePrice: number;
      quoteQuantity: number;
      targetQuoteQuantity: number;
      adaptiveHalfSpreadPercent: number;
      modeledGrossCapturePercent: number;
      makerRoundTripFeePercent: number;
      safetyBufferPercent: number;
      modeledNetCapturePercent: number;
      minimumModeledNetCapturePercent: number;
      thresholdShortfallPercent: number;
      marketRegime: "CALM" | "NORMAL" | "VOLATILE";
      realizedVolatilityPercent: number;
      modeledCaptureGuaranteed: false;
    };
  };
}

export interface DynamicMarketMakingPaperClosureReport {
  version: "72.0";
  generatedAt: number;
  strategyId: "dynamic-market-making";
  mode: "DYNAMIC_MARKET_MAKING_PAPER_CLOSURE_OBSERVABILITY";
  state: DynamicMarketMakingPaperClosureState;
  message: string;
  controller: {
    running: boolean;
    currentSignals: number;
    totalSignalsObserved: number;
    lastSignalObservedAt: number | null;
  };
  funnel: {
    evaluatedMarkets: number;
    bookReadyMarkets: number;
    capabilityReadyMarkets: number;
    inventoryReadyMarkets: number;
    publicTradeReadyMarkets: number;
    fillProbabilityReadyMarkets: number;
    economicallyEvaluableMarkets: number;
    qualifiedMarkets: number;
  };
  thresholds: {
    targetQuoteNotional: number;
    minimumVolatilitySamples: number;
    minimumPublicTradeSamples: number;
    minimumEmpiricalFillProbabilityPercent: number;
    minimumModeledNetCapturePercent: number;
    minimumLiquidityCoverageMultiple: number;
    inventoryTargetBasePercent: number;
  };
  routes: {
    mostAdvancedRoute: DynamicMarketMakingRouteSummary | null;
    bestFillRoute: DynamicMarketMakingRouteSummary | null;
    bestNetRoute: DynamicMarketMakingRouteSummary | null;
    marketReadiness: DynamicMarketMakingRouteSummary[];
    dominantBlockers: Array<{code: string; count: number}>;
  };
  inventoryEvidence: {
    synchronizedBalances: number;
    freshBalances: number;
    exchangesWithBalances: number;
    balances: Array<{
      exchange: string;
      asset: string;
      availableBalance: number;
      totalBalance: number;
      synchronizedAt: number;
      ageMs: number;
      fresh: boolean;
    }>;
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
    authenticatedInventoryOnly: true;
    inventoryNeutralEvidenceOnly: true;
    postOnlyRequired: true;
    queuePositionKnown: false;
    fillProbabilityInferred: false;
    modeledCaptureGuaranteed: false;
    balanceInferenceAllowed: false;
    profitabilityThresholdMutated: false;
    signalFabricationAllowed: false;
    paperExecutionTriggeredByRead: false;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };
}

export interface DynamicMarketMakingPaperClosureResponse {
  success: true;
  data: DynamicMarketMakingPaperClosureReport;
}
