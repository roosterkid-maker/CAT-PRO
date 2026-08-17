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

export type ProductionAlertLifecycleStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RESOLVED";

export interface ProductionAlert {
  key: string;
  severity: ProductionAlertSeverity;
  source: ProductionAlertSource;
  title: string;
  message: string;
  detectedAt: number;
  blocksFutureLiveTrading: boolean;
  requiresManualReview: boolean;
  metadata: Record<string, unknown>;
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

  systemState: ProductionAlertSystemState;

  summary: {
    totalAlerts: number;
    info: number;
    warnings: number;
    critical: number;
    liveBlockingAlerts: number;
    manualReviewAlerts: number;
  };

  alerts: ProductionAlert[];

  sourceStates: {
    executionHealth: string;
    restartRecovery: string;
    clockHealthy: boolean;
    sessionRecoveryRequired: boolean;
    duplicateSubmissionRisk: boolean;
    accountingUncertain: number;
    emergencyStopActive: boolean;
    credentialConfigurationHealthy: boolean;
  };

  notes: string[];
}

export interface ProductionAlertHistoryRecord {
  key: string;
  severity: ProductionAlertSeverity;
  source: ProductionAlertSource;

  title: string;
  message: string;

  status: ProductionAlertLifecycleStatus;

  conditionActive: boolean;

  blocksFutureLiveTrading: boolean;
  requiresManualReview: boolean;

  firstDetectedAt: number;
  lastDetectedAt: number;
  lastStateChangedAt: number;

  acknowledgedAt: number | null;
  resolvedAt: number | null;

  occurrenceCount: number;

  acknowledgementNote: string | null;
  resolutionNote: string | null;

  metadata: Record<string, unknown>;
}

export interface ProductionAlertHistoryReport {
  generatedAt: number;

  version: "18.0";
  build: "12";

  monitoringOnly: true;

  liveTradingEnabled: false;
  liveSubmissionAllowed: false;

  automaticTradingActionAllowed: false;
  automaticAlertResolutionAllowed: false;

  explicitResolutionRequired: true;

  summary: {
    totalAlerts: number;
    open: number;
    acknowledged: number;
    resolved: number;
    activeConditions: number;
    unresolved: number;
    unresolvedCritical: number;
    activeCritical: number;
  };

  livePromotionBlocked: boolean;

  persistenceHealthy: boolean;

  alerts: ProductionAlertHistoryRecord[];

  persistence: {
    persistenceFilePath: string;

    restored: boolean;
    restoredAt: number | null;

    writes: number;
    writeFailures: number;

    lastPersistedAt: number | null;

    lastError: string | null;

    foundation: {
      linesRead: number;
      validRecordsRead: number;
      legacyRecordsRead: number;
      malformedRecordsIgnored: number;
      lastSequence: number;
    };
  };

  blockers: string[];

  notes: string[];
}

export interface ProductionAlertResponse {
  success: boolean;

  data: ProductionAlertReport;
}

export interface ProductionAlertHistoryResponse {
  success: boolean;

  data: ProductionAlertHistoryReport;
}

export interface ProductionAlertMutationResponse {
  success: boolean;

  data: ProductionAlertHistoryRecord;
}

export interface ProductionAlertBulkResolveRequest {
  resolutionNote: string;

  onlyCritical?: boolean;
}

export interface ProductionAlertBulkResolveResponse {
  success: boolean;

  data: {
    resolvedCount: number;

    alerts: ProductionAlertHistoryRecord[];
  };
}
