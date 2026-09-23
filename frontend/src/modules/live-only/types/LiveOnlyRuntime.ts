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
