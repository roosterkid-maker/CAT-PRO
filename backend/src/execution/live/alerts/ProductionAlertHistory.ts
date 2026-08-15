import type {
  ProductionAlertSeverity,
  ProductionAlertSource,
} from "./ProductionAlert";

export type ProductionAlertLifecycleStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RESOLVED";

export interface ProductionAlertHistoryRecord {
  key: string;

  severity:
    ProductionAlertSeverity;

  source:
    ProductionAlertSource;

  title: string;

  message: string;

  status:
    ProductionAlertLifecycleStatus;

  conditionActive: boolean;

  blocksFutureLiveTrading: boolean;

  requiresManualReview: boolean;

  firstDetectedAt: number;

  lastDetectedAt: number;

  lastStateChangedAt: number;

  acknowledgedAt:
    number | null;

  resolvedAt:
    number | null;

  occurrenceCount: number;

  acknowledgementNote:
    string | null;

  resolutionNote:
    string | null;

  metadata:
    Record<
      string,
      unknown
    >;
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

  livePromotionBlocked:
    boolean;

  persistenceHealthy:
    boolean;

  alerts:
    ProductionAlertHistoryRecord[];

  persistence: {
    persistenceFilePath: string;

    restored: boolean;

    restoredAt:
      number | null;

    writes: number;

    writeFailures: number;

    lastPersistedAt:
      number | null;

    lastError:
      string | null;

    foundation: {
      linesRead: number;

      validRecordsRead: number;

      legacyRecordsRead: number;

      malformedRecordsIgnored: number;

      lastSequence: number;
    };
  };

  blockers:
    string[];

  notes:
    string[];
}