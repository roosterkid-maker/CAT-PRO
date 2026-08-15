import type {
  MultiOpportunityPaperBatchResult,
} from "../../../automation/models/MultiOpportunityPaperScheduler";

import type {
  ShadowDispatchBatchResult,
} from "../../../automation/models/ShadowExecutionDispatcher";

export type UnifiedAutomatedExecutionMode =
  | "DISABLED"
  | "SHADOW"
  | "PAPER"
  | "LIVE_BLOCKED"
  | "LIVE_ELIGIBLE"
  | "LIVE";

export type UnifiedAutomatedExecutionStatus =
  | "CYCLE_IN_PROGRESS"
  | "DISABLED"
  | "LIVE_BLOCKED"
  | "NO_OWNED_CANDIDATE"
  | "DISPATCHED"
  | "REJECTED"
  | "FAILED";

export interface UnifiedAutomatedExecutionRejection {
  queueItemId: string;
  candidateKey: string;
  reason: string;
}

export interface UnifiedAutomatedExecutionCycleResult {
  cycleId: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  mode: UnifiedAutomatedExecutionMode;
  status: UnifiedAutomatedExecutionStatus;
  strategyId: "cross-exchange-arbitrage";
  readyCandidates: number;
  ownedCandidates: number;
  routeLocksAcquired: number;
  ownershipRejections: UnifiedAutomatedExecutionRejection[];
  duplicateRejections: UnifiedAutomatedExecutionRejection[];
  shadow: ShadowDispatchBatchResult | null;
  paper: MultiOpportunityPaperBatchResult | null;
  liveExecutionAllowed: false;
  liveOrderSubmissionAllowed: false;
  exchangeOrdersSubmitted: 0;
  reasons: string[];
}

export interface UnifiedAutomatedExecutionDiagnostics {
  generatedAt: number;
  strategyId: "cross-exchange-arbitrage";
  mode: UnifiedAutomatedExecutionMode;
  runningCycle: boolean;
  totalCycles: number;
  shadowCycles: number;
  paperCycles: number;
  disabledCycles: number;
  liveBlockedCycles: number;
  ownershipRejections: number;
  duplicateRejections: number;
  completedGenerationClaims: number;
  activeRouteLocks: string[];
  lastCycle: UnifiedAutomatedExecutionCycleResult | null;
  liveExecutionAllowed: false;
  liveOrderSubmissionAllowed: false;
}
