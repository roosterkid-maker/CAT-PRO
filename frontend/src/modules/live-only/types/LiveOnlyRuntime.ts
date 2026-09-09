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
  };
}
