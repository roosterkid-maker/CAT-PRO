export type RestartRecoveryClassification =
  | "CLEAN"
  | "REVIEW_REQUIRED"
  | "POSSIBLE_OPEN_ORDER"
  | "POSSIBLE_EXPOSURE";

export interface RestartRecoveryFinding {
  key: string;

  source:
    | "SESSION_EVIDENCE"
    | "ORDER_EVIDENCE"
    | "PERSISTENCE_INTEGRITY";

  sessionId: string | null;

  orderId: string | null;

  severity:
    | "INFO"
    | "WARNING"
    | "CRITICAL";

  message: string;
}

export interface RestartRecoveryReport {
  generatedAt: number;

  version: "18.0";

  build: "4";

  classification:
    RestartRecoveryClassification;

  failClosed: true;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticRecoveryAllowed: false;

  automaticOrderResumeAllowed: false;

  automaticOrderResubmissionAllowed: false;

  automaticCancelAllowed: false;

  automaticHedgeAllowed: false;

  automaticUnwindAllowed: false;

  allowNewLivePreparation: boolean;

  summary: {
    interruptedRealSessions: number;

    possibleSubmittedRealOrders: number;

    possibleOpenOrders: number;

    possibleExposureSessions: number;

    persistenceIntegrityProblems: number;

    findings: number;
  };

  findings:
    RestartRecoveryFinding[];

  blockers: string[];

  nextActions: string[];

  notes: string[];
}

export interface RecoveryResolutionRecord {
  schemaVersion: 1;

  sessionId: string;

  status: "RESOLVED";

  basis:
    | "AUTHORITATIVE_TERMINAL_BALANCED"
    | "PERSISTED_PRE_SUBMISSION_NO_ORDER";

  evidenceFingerprint: string;

  resolutionNote: string;

  resolvedAt: number;

  authoritativeOrdersChecked: number;

  authoritativeFilledBuyQuantity: number;

  authoritativeFilledSellQuantity: number;

  evidence: {
    interruptedSessionStatus:
      string | null;

    riskyOrderIds:
      string[];

    authoritativeStatuses:
      Array<{
        lifecycleOrderId: string;

        leg:
          | "BUY"
          | "SELL";

        exchange: string;

        exchangeOrderId:
          string | null;

        status:
          string | null;

        filledQuantity:
          number | null;
      }>;
  };
}

export interface RecoveryResolutionDiagnostics {
  generatedAt: number;

  version: "18.0";

  build: "13";

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticRecoveryAllowed: false;

  automaticGateClearingAllowed: false;

  explicitEvidenceRequired: true;

  restored: boolean;

  restoredAt:
    number | null;

  totalResolutions: number;

  currentlyValidResolutions: number;

  staleResolutions: number;

  writes: number;

  writeFailures: number;

  lastError:
    string | null;

  resolutions:
    RecoveryResolutionRecord[];
}

export interface RecoveryOverviewResponse {
  success: boolean;

  data: {
    resolutions:
      RecoveryResolutionDiagnostics;

    recoveryGate:
      RestartRecoveryReport;
  };
}

export interface RuntimeRecoveryIncident {
  id: string;

  sessionId: string;

  planId: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status:
    | "OPEN"
    | "ACKNOWLEDGED"
    | "RESOLVED";

  severity:
    | "INFO"
    | "WARNING"
    | "CRITICAL";

  strategy:
    | "NONE"
    | "WAIT_FOR_COUNTER_LEG"
    | "RETRY_COUNTER_LEG"
    | "EMERGENCY_EXIT"
    | "MANUAL_INTERVENTION";

  exposureDirection:
    | "BALANCED"
    | "LONG"
    | "SHORT";

  boughtQuantity: number;

  soldQuantity: number;

  exposedQuantity: number;

  estimatedExposureNotional:
    number | null;

  buyLifecycleStatus:
    string | null;

  sellLifecycleStatus:
    string | null;

  buyOrderLifecycleId:
    string | null;

  sellOrderLifecycleId:
    string | null;

  reason: string;

  createdAt: number;

  updatedAt: number;

  acknowledgedAt:
    number | null;

  resolvedAt:
    number | null;

  resolutionNote:
    string | null;
}

export interface RuntimeRecoveryDiagnostics {
  generatedAt: number;

  running: boolean;

  scanIntervalMs: number;

  lastScanAt:
    number | null;

  scans: number;

  sessionsEvaluated: number;

  balancedSessions: number;

  recoveryDetections: number;

  openIncidents: number;

  acknowledgedIncidents: number;

  resolvedIncidents: number;

  criticalIncidents: number;

  warningIncidents: number;

  emergencyExitRecommendations: number;

  retryRecommendations: number;

  waitRecommendations: number;

  manualInterventionRecommendations: number;

  automaticEmergencySubmissionEnabled: false;

  incidents:
    RuntimeRecoveryIncident[];
}

export interface RuntimeRecoveryResponse {
  success: boolean;

  data:
    RuntimeRecoveryDiagnostics;
}

export interface OrderLifecyclePersistenceResponse {
  success: boolean;

  data: {
    generatedAt: number;

    version: "18.0";

    build: "3";

    liveTradingEnabled: false;

    liveSubmissionAllowed: false;

    automaticOrderResumeAllowed: false;

    automaticOrderResubmissionAllowed: false;

    evidence: {
      persistenceFilePath: string;

      restored: boolean;

      restoredAt:
        number | null;

      restoredOrders: number;

      restoredRealOrders: number;

      restoredDryRunOrders: number;

      possibleSubmittedRealOrders: number;

      duplicateGuardEntries: number;

      duplicateSubmissionRisk: boolean;

      writes: number;

      writeFailures: number;

      lastPersistedAt:
        number | null;

      lastError:
        string | null;

      duplicateEvidence:
        Array<{
          orderId: string;

          sessionId: string;

          planId: string;

          leg:
            | "BUY"
            | "SELL";

          exchange: string;

          market: string;

          status: string;

          exchangeOrderId:
            string | null;

          clientOrderId:
            string | null;

          updatedAt: number;
        }>;
    };
  };
}

export interface SettlementAccountingPersistenceResponse {
  success: boolean;

  data: {
    generatedAt: number;

    version: "18.0";

    build: "6";

    liveTradingEnabled: false;

    liveSubmissionAllowed: false;

    automaticAccountingReplayAllowed: false;

    persistence: {
      persistenceFilePath: string;

      restored: boolean;

      restoredAt:
        number | null;

      restoredSessions: number;

      settledSessions: number;

      blockedSessions: number;

      accountingApplied: number;

      dryRunNotAccounted: number;

      accountingUncertain: number;

      duplicateSettlementProtectionActive: true;

      automaticAccountingReplayAllowed: false;

      writes: number;

      writeFailures: number;

      lastPersistedAt:
        number | null;

      lastError:
        string | null;

      uncertainSessionIds:
        string[];
    };
  };
}

export interface RecoveryResolutionMutationResponse {
  success: boolean;

  data: {
    resolution:
      RecoveryResolutionRecord;

    recoveryGate:
      RestartRecoveryReport;
  };
}