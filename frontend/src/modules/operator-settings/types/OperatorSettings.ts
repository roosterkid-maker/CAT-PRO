export interface OperatorSettingsReport {
  generatedAt: number;

  mode:
    "READ_ONLY_OPERATOR_SETTINGS";

  mutableFromFrontend:
    false;

  account: {
    id: string;
    name: string;
    mode: string;
    enabled: boolean;
    emergencyStop: boolean;
    initialCapital: number;
    currentCapital: number;
    availableCapital: number;
    todayProfit: number;
    todayLoss: number;
    openTrades: number;
    tradesToday: number;

    limits: {
      maximumCapitalPerTrade: number;
      maximumDailyLoss: number;
      maximumOpenTrades: number;
      maximumDailyTrades: number;
    };
  };

  paperCapital: {
    version: "86.0";
    revision: number;
    updatedAt: number;
    source: "DEFAULT" | "DASHBOARD";
    mode: "PAPER_ONLY";
    currency: "INR";
    capitalBudgetInr: number;
    accountingEquityInr: number;
    availableAccountingEquityInr: number;
    minimumCapitalPerTrade: number;
    maximumCapitalPerTrade: number;
    capitalStep: number;
    maximumExecutionsPerBatch: number;
    maximumBatchCapital: number;
    mutableFromFrontend: true;
    liveExecutionAllowed: false;
    orderSubmissionAllowed: false;
  };

  paperControls: {
    minimumDailyAttemptLimit: 1;
    maximumDailyAttemptLimit: 5000;
    dailyAttemptLimitMutable: true;
    paperDataResetAvailable: true;
    resetPausesBot: true;
    liveDataResetAllowed: false;
  };

  runtime: {
    nodeEnv: string;
    tradingMode: string;
    liveTradingEnabled: boolean;
    frontendOrigin: string;
    executionTimeoutMs: number;
    executionPollingIntervalMs: number;
    executionCancelOnTimeout: boolean;
    maximumQuoteAgeMs: number;
    minimumNetProfitPercent: number;
    minimumLiquidityPercent: number;
    logLevel: string;
    logDirectory: string;
  };

  opportunityPolicy: {
    minimumSpreadPercent: number;
    minimumNetProfitPercent: number;
    maximumQuoteAgeMs: number;
    minimumExchangeCount: number;
    referenceCapital: number;
    minimumLiquidityPercent: number;
    maximumCrossExchangePriceRatio: number;
    allowLastPriceFallback: boolean;
  };

  executionPolicy: {
    mode: string;
    enabled: boolean;
    maximumCapitalPerTrade: number;
    minimumNetProfitPercent: number;
    targetProfitPercent: number;
    maximumOpenTrades: number;
    requireFreshBidAsk: boolean;
    killSwitchEnabled: boolean;

    executableProfit: {
      buySlippagePercent: number;
      sellSlippagePercent: number;
      safetyBufferPercent: number;
      minimumProfitPercent: number;
    };
  };

  exposureLimits: {
    maximumTotalOpenCapitalPercent: number;
    maximumSinglePositionPercent: number;
    maximumExchangeExposurePercent: number;
    maximumMarketExposurePercent: number;
    warningThresholdPercentOfLimit: number;
  };

  freshness: {
    evictionIntervalMs: number;

    defaultRule: {
      maximumQuoteAgeMs: number;
      maximumPairSkewMs: number;
    };

    exchanges: Record<
      string,
      {
        maximumQuoteAgeMs: number;
        maximumPairSkewMs: number;
      }
    >;
  };

  credentials: {
    credentialValuesReturned:
      false;

    logRedactionEnabled:
      boolean;

    auditRedactionEnabled:
      boolean;

    allConfigured:
      boolean;

    exchanges: Array<{
      exchange: string;
      configured: boolean;
      source: string;
      requiredVariables: string[];
      secretValuesExposed: false;
    }>;
  };

  tinyLive: {
    preflightOnly: true;
    minimumCapital: 100;
    maximumCapital: 500;
    currency: "INR";
    liveOrderSubmissionFromSettingsAllowed: false;
  };

  strategyOnePolicy: {
    generatedAt: number;
    mode: "VERSIONED_STRATEGY_ONE_POLICY";
    active: {
      schemaVersion: "102.0";
      policyId: string;
      revision: number;
      label: string;
      rationale: string;
      policyHash: string;
      values: {
        discovery: {
          minimumSpreadPercent: number;
          minimumNetProfitPercent: number;
          referenceCapitalInr: number;
          minimumLiquidityPercent: number;
          maximumQuoteAgeMs: number;
          maximumCrossExchangePriceRatio: number;
          allowLastPriceFallback: false;
        };
        qualification: {
          minimumConsecutiveObservations: number;
          minimumPersistenceMs: number;
          minimumNetProfitPercent: number;
          minimumLiquidityScore: number;
          minimumFreshnessScore: number;
        };
        paper: {
          minimumNetProfitPercent: number;
          maximumSnapshotAgeMs: number;
          routeCooldownMs: number;
          maximumCapitalPerTradeInr: number;
          buySlippagePercent: number;
          sellSlippagePercent: number;
          safetyBufferPercent: number;
          requireCompleteTwoLegDepth: true;
        };
        tinyLive: {
          mode: "PREFLIGHT_ONLY";
          capitalPerLegInr: number;
          maximumConcurrentTrades: 1;
          minimumNetProfitPercent: number;
          maximumPreviewOpportunityAgeMs: number;
          orderSubmissionMaximumQuoteAgeMs: null;
          requireCompleteTwoLegDepth: true;
          requirePrefundedBalances: true;
          requireParallelDispatch: true;
          requireAuditedTimeInForce: true;
          requireWebSocketFillConfirmation: true;
          requireBoundedResidualRecovery: true;
        };
      };
      safety: {
        liveOrderSubmissionAllowed: false;
        automaticFundMovementAllowed: false;
        midTradeMutationAllowed: false;
        activationRequiresBotPaused: true;
        activationRequiresNoOpenExposure: true;
      };
    };
    availableVersions: Array<{
      policyId: string;
      revision: number;
      label: string;
      policyHash: string;
      active: boolean;
    }>;
    activationGuard: {
      clear: boolean;
      botPaused: boolean;
      accountOpenTrades: number;
      activeExecutionSessions: number;
      activeExecutionLocks: number;
      nonTerminalOrders: number;
      unresolvedRecoveryIncidents: number;
      blockers: string[];
    };
    activationConfirmation: "ACTIVATE_VERSIONED_STRATEGY_ONE_POLICY";
    activationIsAtomic: true;
    persistenceIsAppendOnly: true;
    liveOrderSubmissionAllowed: false;
    orderTimeQuoteAgeCalibrated: false;
    reasons: string[];
  };

  safetyInvariants:
    string[];
}

export interface OperatorSettingsResponse {
  success:
    boolean;

  data:
    OperatorSettingsReport;
}

export interface PaperCapitalConfigurationInput {
  capitalBudgetInr: number;
  minimumCapitalPerTrade: number;
  maximumCapitalPerTrade: number;
  capitalStep: number;
  maximumExecutionsPerBatch: number;
  maximumBatchCapital: number;
  confirmation: "UPDATE_PAPER_CAPITAL_CONFIGURATION";
}

export interface PaperDailyAttemptLimitInput {
  maximumDailyAttempts: number;
  confirmation: "UPDATE_PAPER_DAILY_ATTEMPT_LIMIT";
}

export interface PaperTradingDataResetInput {
  confirmation: "RESET_ALL_PAPER_TRADING_DATA";
}

export interface PaperTradingDataResetSummary {
  resetAt: number;
  confirmation: "RESET_ALL_PAPER_TRADING_DATA";
  botEnabled: false;
  liveDataCleared: false;
  credentialsCleared: false;
  configurationCleared: false;
  cleared: {
    paperTrades: number;
    executionJournalRecords: number;
    inventoryCheckpoints: number;
    strategyOneAcceptanceRecords: number;
    paperSessionRecords: number;
    accountLedgerEntries: number;
    dailyReservationAttempts: number;
    centralQueueRecords: number;
    centralCapitalAllocations: number;
    centralSimulationRecords: number;
    centralPositionGroups: number;
    centralAccountingRecords: number;
  };
}

export interface PaperTradingDataResetResponse
  extends OperatorSettingsResponse {
  reset: PaperTradingDataResetSummary;
}
