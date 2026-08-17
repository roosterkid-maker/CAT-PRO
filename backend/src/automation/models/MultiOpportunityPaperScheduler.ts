import type {
  AutomatedPaperControllerCycleResult,
} from "./AutomatedPaperExecutionController";

export type MultiOpportunityPaperBatchStatus =
  | "BLOCKED_READINESS"
  | "BLOCKED_NOT_ARMED"
  | "ACCOUNT_BLOCKED"
  | "NO_CANDIDATES"
  | "EXECUTED"
  | "PARTIAL"
  | "ALL_REJECTED"
  | "BATCH_IN_PROGRESS";

export interface MultiOpportunityPaperSkippedCandidate {
  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  qualificationScore: number;

  netProfitPercent: number;

  reason: string;
}

export interface MultiOpportunityPaperExecutionItem {
  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  requestedCapital: number;

  qualificationScore: number;

  netProfitPercent: number;

  result:
    AutomatedPaperControllerCycleResult;
}

export interface MultiOpportunityPaperBatchResult {
  id: string;

  batchNumber: number;

  status:
    MultiOpportunityPaperBatchStatus;

  startedAt: number;

  completedAt: number;

  durationMs: number;

  readinessScore: number;

  readinessLevel: string;

  paperExecutionArmed: boolean;

  candidatesConsidered: number;

  candidatesSelected: number;

  executionAttempts: number;

  executed: number;

  rejected: number;

  capitalScheduled: number;

  capitalExecuted: number;

  projectedExchangeCapital:
    Record<string, number>;

  executions:
    MultiOpportunityPaperExecutionItem[];

  skipped:
    MultiOpportunityPaperSkippedCandidate[];

  reasons: string[];
}

export interface MultiOpportunityPaperSchedulerConfig {
  maximumExecutionsPerBatch: number;

  maximumCandidatesConsidered: number;

  maximumCapitalPerTrade: number;

  maximumBatchCapital: number;

  maximumExchangeExposurePercent: number;

  minimumQualificationScore: number;

  minimumNetProfitPercent: number;

  maximumHistory: number;
}

export interface MultiOpportunityPaperSchedulerDiagnostics {
  generatedAt: number;

  mode: "PAPER";

  automaticSchedulingEnabled: true;

  liveExecutionAllowed: false;

  concurrentExecutionAllowed: false;

  config:
    MultiOpportunityPaperSchedulerConfig;

  batchInProgress: boolean;

  totalBatches: number;

  blockedReadiness: number;

  blockedNotArmed: number;

  accountBlocked: number;

  noCandidateBatches: number;

  totalExecutionAttempts: number;

  totalExecuted: number;

  totalRejected: number;

  lastBatchAt: number | null;

  lastExecutionAt: number | null;

  lastBatch:
    MultiOpportunityPaperBatchResult | null;

  recentBatches:
    MultiOpportunityPaperBatchResult[];
}