import type {
  ExecutionResult,
} from "../../trading/models/ExecutionResult";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export type AutomatedPaperControllerCycleStatus =
  | "BLOCKED_READINESS"
  | "BLOCKED_NOT_ARMED"
  | "ACCOUNT_BLOCKED"
  | "NO_CANDIDATE"
  | "EXECUTION_REJECTED"
  | "EXECUTED"
  | "CYCLE_IN_PROGRESS";

export interface AutomatedPaperCandidateSummary {
  strategyAttribution: StrategyAttribution;

  candidateKey: string;

  candidateGeneration: string;

  opportunityId: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  qualificationScore: number;

  netProfitPercent: number;

  liquidityScore: number;

  freshnessScore: number;

  consecutiveObservations: number;

  persistenceMs: number;
}

export interface AutomatedPaperCandidateAttemptWindow {
  candidateKey: string;

  candidateGeneration: string;

  eligible: boolean;

  generationAlreadyAttempted: boolean;

  routeCooldownRemainingMs: number;

  reason: string;
}

export interface AutomatedPaperControllerCycleResult {
  cycleId: number;

  status: AutomatedPaperControllerCycleStatus;

  startedAt: number;

  completedAt: number;

  durationMs: number;

  readinessScore: number;

  readinessLevel: string;

  paperExecutionArmed: boolean;

  requestedCapital: number | null;

  candidate: AutomatedPaperCandidateSummary | null;

  result: ExecutionResult | null;

  reasons: string[];
}

export interface AutomatedPaperExecutionControllerConfig {
  maximumCapitalPerTrade: number;

  minimumNetProfitPercent: number;

  maximumSnapshotAgeMs: number;

  routeCooldownMs: number;

  maximumHistory: number;
}

export interface AutomatedPaperExecutionControllerDiagnostics {
  generatedAt: number;

  mode: "PAPER";

  automaticEvaluationEnabled: true;

  paperExecutionArmed: boolean;

  paperExecutionAllowed: boolean;

  liveExecutionAllowed: false;

  confirmationVariable:
    "AUTOMATED_PAPER_TRADING_CONFIRMATION";

  config: AutomatedPaperExecutionControllerConfig;

  runningCycle: boolean;

  totalCycles: number;

  blockedReadiness: number;

  blockedNotArmed: number;

  accountBlocked: number;

  noCandidate: number;

  executionAttempts: number;

  executed: number;

  executionRejected: number;

  attemptedCandidateGenerations: number;

  lastCycleAt: number | null;

  lastExecutionAt: number | null;

  lastCycle: AutomatedPaperControllerCycleResult | null;

  recentCycles: AutomatedPaperControllerCycleResult[];
}
