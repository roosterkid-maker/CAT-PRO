export type ProductionAlertSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export type ProductionAlertSource =
  | "EXECUTION_HEALTH"
  | "RESTART_RECOVERY"
  | "CLOCK_SAFETY"
  | "SESSION_PERSISTENCE"
  | "ORDER_PERSISTENCE"
  | "SETTLEMENT_ACCOUNTING"
  | "ACCOUNT_LEDGER"
  | "TRADING_ACCOUNT"
  | "CREDENTIAL_SAFETY";

export type ProductionAlertSystemState =
  | "OK"
  | "ATTENTION"
  | "BLOCKED";

export interface ProductionAlert {
  key: string;

  severity:
    ProductionAlertSeverity;

  source:
    ProductionAlertSource;

  title: string;

  message: string;

  detectedAt: number;

  blocksFutureLiveTrading: boolean;

  requiresManualReview: boolean;

  metadata:
    Record<
      string,
      unknown
    >;
}

export interface ProductionAlertReport {
  generatedAt: number;

  version: "18.0";

  build: "11";

  monitoringOnly: true;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticTradingActionAllowed: false;

  automaticCancelAllowed: false;

  automaticHedgeAllowed: false;

  automaticUnwindAllowed: false;

  automaticEmergencyStopMutationAllowed: false;

  systemState:
    ProductionAlertSystemState;

  summary: {
    totalAlerts: number;

    info: number;

    warnings: number;

    critical: number;

    liveBlockingAlerts: number;

    manualReviewAlerts: number;
  };

  alerts:
    ProductionAlert[];

  sourceStates: {
    executionHealth:
      string;

    restartRecovery:
      string;

    clockHealthy:
      boolean;

    sessionRecoveryRequired:
      boolean;

    duplicateSubmissionRisk:
      boolean;

    accountingUncertain:
      number;

    emergencyStopActive:
      boolean;

    credentialConfigurationHealthy:
      boolean;
  };

  notes: string[];
}