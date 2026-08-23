export type ExchangeClockMode =
  | "SERVER_SYNCHRONIZED"
  | "LOCAL_CLOCK_ONLY"
  | "NOT_REQUIRED";

export type ExchangeClockHealth =
  | "HEALTHY"
  | "STALE"
  | "UNSYNCHRONIZED"
  | "LOCAL_ONLY"
  | "NOT_APPLICABLE"
  | "FAILED";

export interface ExchangeClockState {
  exchange: string;

  mode: ExchangeClockMode;

  health: ExchangeClockHealth;

  synchronized: boolean;

  offsetMs: number;

  absoluteOffsetMs: number;

  lastSynchronizedAt:
    | number
    | null;

  ageMs:
    | number
    | null;

  maximumAllowedAgeMs: number;

  maximumAllowedOffsetMs: number;

  signedRequestAllowed: boolean;

  reasons: string[];
}

export interface ExchangeClockSafetyReport {
  generatedAt: number;

  version: "18.0";

  build: "9";

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticClockCorrectionAllowed: boolean;

  signedRequestsFailClosed: boolean;

  exchanges:
    ExchangeClockState[];

  allServerSynchronizedClocksHealthy: boolean;

  blockers: string[];

  notes: string[];
}

export interface ExchangeClockSafetyResponse {
  success: boolean;

  data:
    ExchangeClockSafetyReport;
}

export interface ExchangeClockSynchronizationRunnerStatus {
  version: "95.0";

  running: boolean;

  synchronizationInProgress: boolean;

  refreshIntervalMs: number;

  maximumEvidenceAgeMs: number;

  refreshMarginMs: number;

  attempts: number;

  skippedOverlaps: number;

  lastStartedAt:
    number | null;

  lastCompletedAt:
    number | null;

  lastSuccessfulAt:
    number | null;

  lastFailedAt:
    number | null;

  lastAllServerClocksHealthy:
    boolean | null;

  lastError:
    string | null;
}

export interface ExchangeClockSynchronizationResponse {
  success: boolean;

  data:
    ExchangeClockSafetyReport & {
      synchronization:
        ExchangeClockSynchronizationRunnerStatus;
    };
}
