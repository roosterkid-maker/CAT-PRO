export interface LiveOnlyAttempt {
  opportunityId: string;
  routeKey: string;
  market: string;
  buyExchange: string;
  sellExchange: string;
  netProfitPercent: number;
  startedAt: number;
  completedAt: number;
  status: "COMPLETED" | "BLOCKED" | "PARTIAL" | "FAILED";
  reason: string;
}

export interface LiveOnlyRuntimeResponse {
  success: boolean;
  data: {
    profileSelected: boolean;
    policy: {
      enabled: boolean;
      minimumCapitalPerLegInr: number;
      preferredCapitalPerLegInr: number;
      maximumCapitalPerLegInr: number;
      minimumCurrentNetProfitPercent: number;
      minimumPostStressNetProfitPercent: number;
      maximumStatutoryCashWithholdingPercentPerAttempt: number;
      maximumOpportunityAgeMs: number;
      routeCooldownMs: number;
      maximumConcurrentTrades: number;
      automaticFundMovementEnabled: boolean;
    };
    runner: {
      runtimeEnabled: boolean;
      running: boolean;
      inFlight: boolean;
      halted: boolean;
      haltedReason: string | null;
      snapshotsObserved: number;
      candidatesObserved: number;
      preflightBlocks: number;
      attempts: number;
      completed: number;
      recentAttempts: LiveOnlyAttempt[];
      authority: {
        blockingAuthorityPresent: boolean;
        records: number;
      };
      safety: {
        freshExactPreflightRequired: boolean;
        finalOrderTimeLastLookRequired: boolean;
        oneConcurrentTrade: boolean;
        sameOpportunityRetryAllowed: boolean;
        haltOnPossibleExposure: boolean;
      };
    };
    capitalManager: {
      enabled: boolean;
      sameExchangeEnabled: boolean;
      crossExchangeEnabled: boolean;
      maximumPerTransferUsdt: number;
      maximumPerDaySameExchangeUsdt: number;
      maximumPerDayCrossExchangeUsdt: number;
      withdrawalWhitelistEntries: number;
      dedicatedBinanceCredentialsConfigured: boolean;
      runner: {
        running: boolean;
        cycleInProgress: boolean;
        pollIntervalMs: number;
        lastCycleAt: number | null;
        lastError: string | null;
      };
    };
    capitalStudy: {
      running: boolean;
      trackedRoutes: number;
      executionStudyReadyRoutes: number;
      capitalStudyReadyRoutes: number;
      policy: {
        independentSamplesPerExecutionDecision: number;
        qualificationCyclesForCapitalAction: number;
        independentSamplesForCapitalAction: number;
        adaptiveCurrentNetLadderPercent: number[];
      };
      routes: Array<{
        routeKey: string;
        market: string;
        buyExchange: string;
        sellExchange: string;
        status: "CURRENT_ROUTE_BLOCKED" | "CURRENT_ROUTE_READY";
        currentConsecutiveSamples: number;
        requiredCurrentSamples: number;
        completedQualificationCycles: number;
        requiredQualificationCycles: number;
        effectiveMinimumCurrentNetProfitPercent: number;
        latestNetProfitPercent: number | null;
        latestEvidenceAgeMs: number | null;
        latestObservedAt: number | null;
        funding?: {
          buyExchange: string;
          buyAsset: string;
          buyRequired: number | null;
          buyAvailable: number | null;
          buySufficient: boolean;
          sellExchange: string;
          sellAsset: string;
          sellRequired: number | null;
          sellAvailable: number | null;
          sellShortfall: number | null;
          sellSufficient: boolean;
        };
        recommendation: string;
        recommendationDetail: string;
        safety: {
          recoveryClean: boolean;
          movementAllowed: boolean;
        };
      }>;
    };
  };
}

export interface LiveOnlyInventoryAsset {
  asset: string;
  totalBalance: number;
  availableAfterReservations: number;
  totalValueUsdt: number | null;
  priceUsdt: number | null;
  estimated: boolean;
}

export interface LiveOnlyInventoryResponse {
  success: boolean;
  data: {
    generatedAt: number;
    state: string;
    usdtInr: number | null;
    knownTotalValueUsdt: number;
    estimatedValueUsdt: number;
    unavailableValuations: number;
    exchanges: Array<{
      exchange: string;
      displayName: string;
      balanceUsableForDecision: boolean;
      lastSynchronizedAt: number | null;
      knownTotalValueUsdt: number;
      estimatedValueUsdt: number;
      assets: LiveOnlyInventoryAsset[];
    }>;
  };
}

export type InrEvidenceTier = "BOOK" | "QUOTE" | "TICKER";

export interface InrScannedRoute {
  routeKey: string;
  kind: "INR_USDT" | "INR_INR" | "USDT_USDT";
  coin: string;
  buyVenue: string;
  buyMarket: string;
  sellVenue: string;
  sellMarket: string;
  conversionVenue: string | null;
  usdtInrRate: number | null;
  evidence: InrEvidenceTier;
  buyEvidence: InrEvidenceTier;
  sellEvidence: InrEvidenceTier;
  buyPriceInr: number;
  sellPriceInr: number;
  grossEdgePercent: number;
  feesPercent: number;
  netEdgePercent: number;
  cashLockedPercent: number;
  tdsVerified: boolean;
  depthAtThresholdInr: number | null;
  averageNetAtDepthPercent: number | null;
  minimumOrderInr: number | null;
  marketsTradable: boolean | null;
  suspect: boolean;
  qualifies: boolean;
  observedAt: number;
}

export interface InrOpportunityWindow {
  id: string;
  routeKey: string;
  kind: "INR_USDT" | "INR_INR" | "USDT_USDT";
  coin: string;
  buyVenue: string;
  buyMarket: string;
  sellVenue: string;
  sellMarket: string;
  startedAt: number;
  lastSeenAt: number;
  endedAt: number | null;
  durationMs: number;
  scans: number;
  peakNetPercent: number;
  lastNetPercent: number;
  peakDepthInr: number;
  minimumOrderInr: number | null;
  tdsVerified: boolean;
  alertedAt: number | null;
}

export interface InrCoinPersistence {
  coin: string;
  windows: number;
  activeWindows: number;
  longestMs: number;
  averageMs: number;
  totalMs: number;
  bestNetPercent: number;
  lastSeenAt: number;
  routes: string[];
}

export interface InrScannerResponse {
  success: boolean;
  data: {
    running: boolean;
    scans: number;
    lastScanAt: number | null;
    lastScanDurationMs: number | null;
    config: {
      minimumNetPercent: number;
      nearMissNetPercent: number;
      suspectGrossPercent: number;
      windowGraceMs: number;
      alertAfterMs: number;
      exitHysteresisPercent: number;
      alertCooldownMs: number;
      maximumTickerAgeMs: number;
      maximumBookAgeMs: Record<string, number>;
      scanIntervalMs: number;
    };
    venues: Record<string, {inrMarkets: number; inrBooks: number; inrQuotes: number; usdtBooks: number}>;
    conversion: Array<{venue: string; market: string; bid: number | null; ask: number | null; evidence: InrEvidenceTier | null}>;
    routesEvaluated: number;
    opportunities: InrScannedRoute[];
    nearMisses: InrScannedRoute[];
    activeWindows: InrOpportunityWindow[];
    recentWindows: InrOpportunityWindow[];
    coinPersistence: InrCoinPersistence[];
    alerts: InrOpportunityWindow[];
    depthNominations: Record<string, string[]>;
    minimumOrderCoverage: {known: number; pending: number};
    coinSwitchInrDepth: {
      running: boolean;
      requests: number;
      successes: number;
      failures: number;
      consecutiveFailures: number;
      pausedUntil: number | null;
      lastMarket: string | null;
      lastError: string | null;
      lastSuccessAt: number | null;
      activeMarkets: string[];
    } | null;
  };
}

export interface CoinStudyDirection {
  kind: "INR_USDT" | "INR_INR" | "USDT_USDT";
  buyVenue: string;
  buyQuote: "INR" | "USDT";
  sellVenue: string;
  sellQuote: "INR" | "USDT";
  edgeMinutes: number;
  sharePercent: number;
}

export interface CoinStudyEntry {
  coin: string;
  rank: number;
  core: boolean;
  windows: number;
  edgeMinutes: number;
  sharePercent: number;
  activeDays: number;
  averageNetPercent: number;
  bestNetPercent: number;
  averageDepthInr: number | null;
  peakHoursIst: number[];
  hourlyEdgeMinutes: number[];
  directions: CoinStudyDirection[];
  twoWay: boolean;
  placement: {
    trades: number;
    coin: {venue: string; needInr: number; haveInr: number | null};
    cash: {venue: string; asset: "INR" | "USDT"; needInr: number; haveInr: number | null};
  };
}

export interface CoinStudyResponse {
  success: boolean;
  data: {
    generatedAt: number;
    studyDays: number;
    dataSpanHours: number;
    dataSufficient: boolean;
    tradeSizeInr: number;
    totals: {windows: number; edgeMinutes: number; coins: number; nonExecutableEdgeMinutes: number};
    coreBasket: string[];
    coins: CoinStudyEntry[];
  };
}

export interface RefillAction {
  id: string;
  priority: number;
  kind: "MOVE_USDT" | "MOVE_COIN" | "BUY_COIN" | "DEPOSIT_INR";
  coins: string[];
  asset: string;
  fromVenue: string | null;
  toVenue: string;
  amountInr: number;
  quantity: number | null;
  mode: "AUTO" | "MANUAL";
  reason: string;
  howTo: string;
}

export interface RefillPlanResponse {
  success: boolean;
  data: {
    generatedAt: number;
    usdtInr: number | null;
    allocation: {
      budgetInr: number;
      allocatedInr: number;
      liveSignalHours: number;
      coins: Array<{
        coin: string;
        weightPercent: number;
        trades: number;
        perTradeInr: number;
        coinVenue: string;
        coinNeedInr: number;
        coinHaveInr: number | null;
        cashVenue: string;
        cashAsset: "INR" | "USDT";
        cashNeedInr: number;
        cashHaveInr: number | null;
        expectedDailyProfitInr: number;
      }>;
      unfunded: string[];
      unfundedBy: Record<string, string>;
      perLegInr: number;
      configuredLegInr: number;
      dynamicLeg: {enabled: boolean; maximumInr: number};
      dailyLossLimitInr: number | null;
      exitBlocked: Array<{coin: string; from: string; to: string; reason: string}>;
    } | null;
    venuePlan: {
      rows: Array<{
        key: string;
        venues: string[];
        fundWith: "INR" | "USDT";
        targetInr: number;
        cashTargetInr: number;
        stockTargetInr: number;
        haveInr: number;
        gapInr: number;
      }>;
      misplaced: Array<{coin: string; venue: string; toVenue: string; valueInr: number}>;
    } | null;
    actions: RefillAction[];
    covered: Array<{venue: string; asset: string; haveInr: number | null; targetInr: number}>;
    automation: {
      enabled: boolean;
      autoUsdtDestinations: string[];
      maximumPerTransferUsdt: number;
      maximumPerDayUsdt: number;
      destinationCooldownMinutes: number;
      lastTopUpAt: Record<string, number>;
      blocked: Record<string, {until: number; reason: string}>;
      autoBuy: {
        enabled: boolean;
        dailyCapInr: number;
        spentTodayInr: number;
        cashFloorInr: number;
        paused: Record<string, {until: number; reason: string}>;
      };
      autoSell?: {
        enabled: boolean;
        dailyCapInr: number;
        spentTodayInr: number;
        minimumHoldHours: number;
        lastSkip: {at: number; reason: string} | null;
        paused: Record<string, {until: number; reason: string}>;
      };
    };
    recentExecutions: Array<{
      at: number;
      actionId: string;
      toVenue: string;
      amountUsdt: number;
      status: string;
      kind?: "USDT_TOPUP" | "STOCK_BUY" | "STOCK_SELL" | "FUNDING_SWEEP";
      coin?: string;
      spentInr?: number;
      detail: string;
      referenceId: string | null;
    }>;
  };
}

export interface InrExecutorResponse {
  success: boolean;
  data: {
    running: boolean;
    mode: "off" | "shadow" | "live";
    halted: boolean;
    haltedReason: string | null;
    inFlight: boolean;
    realizedNetInrToday: number;
    counts: Record<string, number>;
    blockers: Record<string, number>;
    policy: {minimumNetPercent: number; targetCapitalPerLegInr: number; inrVenues: string[]} | null;
    recentAttempts: Array<{
      at: number;
      status: string;
      coin: string;
      kind: string;
      routeKey: string;
      buyVenue: string;
      sellVenue: string;
      scannedNetPercent: number;
      reason: string | null;
    }>;
    recentSessions: Array<{
      sessionId: string;
      state: string;
      startedAt: number;
      updatedAt: number;
      realizedNetInr: number | null;
      route: {coin: string; kind: string; buyVenue: string; sellVenue: string};
    }>;
  };
}
