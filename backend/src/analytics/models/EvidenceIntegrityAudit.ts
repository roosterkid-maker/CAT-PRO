export type EvidencePersistenceMode =
  | "PERSISTENT"
  | "VOLATILE"
  | "UNKNOWN";

export type EvidenceIntegrityStatus =
  | "HEALTHY"
  | "PARTIAL_RESTART_SAFETY"
  | "DEGRADED";

export interface EvidenceIntegrityComponent {
  key: string;

  persistenceMode: EvidencePersistenceMode;

  restartSafe: boolean;

  healthy: boolean;

  evidenceCount: number | null;

  restored: boolean | null;

  writes: number | null;

  writeFailures: number | null;

  lastPersistedAt: number | null;

  message: string;

  reasons: string[];
}

export interface EvidenceIntegrityAuditReport {
  generatedAt: number;

  version: "17.6";

  build: "6";

  status: EvidenceIntegrityStatus;

  analyticsOnly: true;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  failClosed: true;

  shadowContinuity: {
    runtimeOutcomes: number;

    runtimeCompletedOutcomes: number;

    archivedOutcomes: number;

    archivedCompletedOutcomes: number;

    mergedTrackedDispatches: number;

    mergedCompletedOutcomes: number;

    minimumCompletedOutcomes: number;

    remainingCompletedOutcomes: number;

    historicalCompletedEvidencePreserved: boolean;
  };

  components: EvidenceIntegrityComponent[];

  restartSafeComponents: number;

  volatileComponents: number;

  persistenceFailures: string[];

  restartSafetyGaps: string[];

  notes: string[];
}