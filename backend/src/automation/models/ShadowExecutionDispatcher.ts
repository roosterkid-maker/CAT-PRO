import type {
  CandidateQualificationRecord,
} from "./CandidateQualification";

import type {
  ExecutionCandidateQueueItem,
} from "./ExecutionCandidateQueue";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export type ShadowDispatchStatus =
  | "SHADOW_DISPATCHED"
  | "REVALIDATION_FAILED"
  | "DUPLICATE_SUPPRESSED";

export interface ShadowDispatchRecord {
  strategyAttribution: StrategyAttribution;

  id: string;

  queueItemId: string;

  candidateKey: string;

  candidateGeneration: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: ShadowDispatchStatus;

  priorityScore: number;

  qualificationScore: number;

  netProfitPercent: number;

  liquidityScore: number;

  freshnessScore: number;

  consecutiveObservations: number;

  persistenceMs: number;

  dispatchedAt: number;

  reasons: string[];

  qualification: CandidateQualificationRecord;

  queueItem: ExecutionCandidateQueueItem;
}

export interface ShadowDispatchBatchResult {
  generatedAt: number;

  attempted: number;

  dispatched: number;

  revalidationFailed: number;

  duplicatesSuppressed: number;

  records: ShadowDispatchRecord[];
}

export interface ShadowExecutionDispatcherDiagnostics {
  generatedAt: number;

  mode: "SHADOW";

  executionAllowed: false;

  paperExecutionAllowed: false;

  liveExecutionAllowed: false;

  automaticDispatchEnabled: true;

  maximumBatchSize: number;

  totalRuns: number;

  totalAttempts: number;

  totalDispatched: number;

  totalRevalidationFailed: number;

  totalDuplicatesSuppressed: number;

  noReadyItemRuns: number;

  dispatchedCandidateGenerations: number;

  lastRunAt: number | null;

  lastDispatchAt: number | null;

  lastRecord: ShadowDispatchRecord | null;

  records: ShadowDispatchRecord[];
}
