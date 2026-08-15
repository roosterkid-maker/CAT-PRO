import type {
  PairSynchronizationRootCauseReport,
} from "./PairSynchronizationRootCause";

import type {
  ExecutionHealthStatus,
} from "../../execution/live/health/ExecutionHealthService";

export type ProductionSafetyStatus =
  | "SAFE"
  | "BLOCKED"
  | "EMERGENCY_STOP";

export type ProductionSafetyGateState =
  | "PASS"
  | "BLOCKED"
  | "EMERGENCY_STOP";

export interface ProductionSafetyGate {
  key: string;

  state: ProductionSafetyGateState;

  required: boolean;

  message: string;

  reasons: string[];
}

export interface ProductionSafetyState {
  accountEnabled: boolean;

  accountMode: string;

  emergencyStopActive: boolean;

  executionHealthStatus:
    ExecutionHealthStatus | "UNKNOWN";

  activeLiveSessions: number | null;

  activeLiveLocks: number | null;

  liveExecutionConfirmed: boolean | null;

  activeLiveSessionLimit: number;

  duplicateActiveSessionLockKeys: string[];

  liveAttemptsLastHour: number | null;

  liveAttemptsToday: number | null;

  accountTradesToday: number | null;

  effectiveDailyActivity: number | null;

  maximumLiveAttemptsPerHour: number;

  maximumDailyTrades: number | null;

  todayProfit: number | null;

  todayLoss: number | null;

  dailyNetPnl: number | null;

  dailyDrawdown: number | null;

  maximumDailyLoss: number | null;

  dailyLossRemaining: number | null;

  dailyLossUtilizationPercent: number | null;

  dailyDrawdownUtilizationPercent: number | null;

  marketDataExchanges: number | null;

  connectedMarketDataExchanges: number | null;

  disconnectedMarketDataExchanges: string[];

  executionAdapters: number | null;

  connectedExecutionAdapters: number | null;

  disconnectedExecutionAdapters: string[];

  executableQuotes: number | null;

  freshExecutableQuotes: number | null;

  staleExecutableQuotes: number | null;

  invalidTimestampExecutableQuotes: number | null;

  futureTimestampExecutableQuotes: number | null;

  freshnessCoveragePercent: number | null;

  staleEvictionRunning: boolean | null;

  staleEvictionLastRunAt: number | null;

  pairSynchronizationClassification:
    | PairSynchronizationRootCauseReport["classification"]
    | "UNKNOWN";

  currentFreshDirectionalPairs: number | null;

  synchronizedDirectionalPairs: number | null;

  unsynchronizedDirectionalPairs: number | null;

  synchronizationRatePercent: number | null;

  openPortfolioPositions: number | null;

  totalOpenCapital: number | null;

  totalOpenCapitalPercent: number | null;

  portfolioExposureBlockedCount: number | null;

  portfolioExposureWarningCount: number | null;

  canOpenNewPositions: boolean | null;

  reconciliationRunning: boolean | null;

  reconciliationLastScanAt: number | null;

  reconciliationRecords: number | null;

  reconciliationDrifted: number | null;

  reconciliationRemoteUnavailable: number | null;

  reconciliationErrors: number | null;

  reconciliationCriticalMismatches: number | null;

  reconciliationWarningMismatches: number | null;

  unresolvedReconciliationRecords: number | null;

  recoveryRunning: boolean | null;

  recoveryLastScanAt: number | null;

  openRecoveryIncidents: number | null;

  acknowledgedRecoveryIncidents: number | null;

  criticalRecoveryIncidents: number | null;

  unresolvedRecoveryIncidents: number | null;

  unresolvedExposureIncidents: number | null;

  unresolvedExposureQuantity: number | null;

  unresolvedExposureNotional: number | null;
}

export interface ProductionSafetyDiagnostics {
  generatedAt: number;

  version: "17.5";

  status: ProductionSafetyStatus;

  failClosed: true;

  liveSubmissionAllowed: false;

  state: ProductionSafetyState;

  gates: ProductionSafetyGate[];

  blockers: string[];

  emergencyReasons: string[];
}