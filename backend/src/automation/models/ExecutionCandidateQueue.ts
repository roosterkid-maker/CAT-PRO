import type {
  CandidateQualificationRecord,
} from "./CandidateQualification";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export type ExecutionQueueItemStatus =
  | "READY"
  | "EXPIRED"
  | "CANCELLED"
  | "REMOVED"
  | "CONSUMED";

export interface ExecutionCandidateQueueItem {
  strategyAttribution: StrategyAttribution;

  id: string;

  candidateKey: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: ExecutionQueueItemStatus;

  priorityScore: number;

  qualificationScore: number;

  netProfitPercent: number;

  liquidityScore: number;

  freshnessScore: number;

  persistenceMs: number;

  consecutiveObservations: number;

  enqueuedAt: number;

  updatedAt: number;

  expiresAt: number;

  consumedAt: number | null;

  cancelledAt: number | null;

  removedAt: number | null;

  expiredAt: number | null;

  renewals: number;

  reason: string;

  qualification: CandidateQualificationRecord;
}

export interface ExecutionCandidateQueueConfig {
  ttlMs: number;

  maximumQueueSize: number;
}

export interface ExecutionCandidateQueueDiagnostics {
  generatedAt: number;

  executionAllowed: false;

  config: ExecutionCandidateQueueConfig;

  totalItemsCreated: number;

  activeItems: number;

  ready: number;

  expired: number;

  cancelled: number;

  removed: number;

  consumed: number;

  duplicateEnqueueAttemptsPrevented: number;

  totalRenewals: number;

  highestPriority: number | null;

  averageReadyAgeMs: number;

  oldestReadyAgeMs: number;

  items: ExecutionCandidateQueueItem[];
}
