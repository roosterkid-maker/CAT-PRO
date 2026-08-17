import type {
  StrategyOnePolicyReport,
} from "../../trading/policy/StrategyOneExecutionPolicyService";

export interface OperatorSettingsReport {
  generatedAt: number;

  mode: "READ_ONLY_OPERATOR_SETTINGS";

  mutableFromFrontend: false;

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
    credentialValuesReturned: false;
    logRedactionEnabled: boolean;
    auditRedactionEnabled: boolean;
    allConfigured: boolean;
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

  strategyOnePolicy:
    StrategyOnePolicyReport;

  safetyInvariants: string[];
}
