export type StrategyOnePaperAcceptanceStatus =
  | "PASSED"
  | "REJECTED_SAFE"
  | "EXCLUDED_UNCREDIBLE"
  | "EVIDENCE_INCOMPLETE";

export type StrategyOnePaperAcceptanceGateKey =
  | "STRATEGY_ATTRIBUTED"
  | "UNIFIED_PAPER_OWNERSHIP"
  | "CONTROLLER_EXECUTED"
  | "EXECUTION_COMPLETED"
  | "SETTLEMENT_RECONCILED"
  | "JOURNAL_TERMINAL"
  | "PAPER_TRADE_CLOSED"
  | "PRICE_CREDIBLE"
  | "VENUE_INVENTORY_CHECKPOINTED"
  | "ACCOUNTING_TRANSACTION_CORRECT"
  | "LIVE_ISOLATED";

export interface StrategyOnePaperAcceptanceGate {
  key: StrategyOnePaperAcceptanceGateKey;

  passed: boolean;

  evidence: string;
}

export interface StrategyOnePaperAcceptanceRecord {
  schemaVersion: 1;

  recordId: string;

  capturedAt: number;

  unifiedCycleId: number;

  paperBatchId: string;

  paperBatchNumber: number;

  controllerCycleId: number;

  candidateKey: string;

  candidateGeneration:
    string | null;

  planId:
    string | null;

  strategyAttributed: boolean;

  unifiedPaperOwned: boolean;

  controllerStatus: string;

  /**
   * Exact controller decision evidence captured at the boundary. Older
   * persisted records may not contain this field, so consumers must retain
   * the explicit legacy fallback.
   */
  controllerDecisionReasons?: string[];

  resultSuccessful: boolean;

  executionCompletedEvidence: boolean;

  status: StrategyOnePaperAcceptanceStatus;

  recoveryExecuted: boolean;

  gates: StrategyOnePaperAcceptanceGate[];

  reasons: string[];

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  exchangeOrdersSubmitted: 0;
}

export interface StrategyOnePaperRuntimeAcceptanceReport {
  generatedAt: number;

  strategyId:
    "cross-exchange-arbitrage";

  evidenceStatus:
    | "AVAILABLE"
    | "NO_DATA";

  totalAttempts: number;

  passed: number;

  rejectedSafe: number;

  credibilityExcluded: number;

  evidenceIncomplete: number;

  recoveredPasses: number;

  consecutivePasses: number;

  minimumConsecutivePasses: number;

  remainingConsecutivePasses: number;

  streakEvidence: {
    safeRejectionsExcluded: number;

    latestResetAt: number | null;

    latestResetStatus:
      StrategyOnePaperAcceptanceStatus | null;

    latestResetCandidateKey: string | null;

    latestResetReasons: string[];

    latestSafeRejectionAt: number | null;

    latestSafeRejectionCandidateKey: string | null;

    latestSafeRejectionReasons: string[];
  };

  soakStatus:
    | "NOT_STARTED"
    | "COLLECTING"
    | "PASSED";

  readyForPaperSoakReview: boolean;

  persistence: {
    filePath: string;

    restored: boolean;

    restoredAt: number | null;

    writes: number;

    writeFailures: number;

    malformedRecordsIgnored: number;

    lastError: string | null;
  };

  records: StrategyOnePaperAcceptanceRecord[];

  blockers: string[];

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;
}
