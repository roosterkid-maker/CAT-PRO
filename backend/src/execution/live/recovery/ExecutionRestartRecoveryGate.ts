export type ExecutionRestartRecoveryClassification =
  | "CLEAN"
  | "REVIEW_REQUIRED"
  | "POSSIBLE_OPEN_ORDER"
  | "POSSIBLE_EXPOSURE";

export type ExecutionRestartRecoveryEvidenceSource =
  | "SESSION_EVIDENCE"
  | "ORDER_EVIDENCE"
  | "STRATEGY_ONE_TWO_LEG_EVIDENCE"
  | "PERSISTENCE_INTEGRITY";

export interface ExecutionRestartRecoveryFinding {
  key: string;

  source:
    ExecutionRestartRecoveryEvidenceSource;

  sessionId: string | null;

  orderId: string | null;

  severity:
    | "INFO"
    | "WARNING"
    | "CRITICAL";

  message: string;
}

export interface ExecutionRestartRecoveryReport {
  generatedAt: number;

  version: "18.0";

  build: "4";

  classification:
    ExecutionRestartRecoveryClassification;

  failClosed: true;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticRecoveryAllowed: false;

  automaticOrderResumeAllowed: false;

  automaticOrderResubmissionAllowed: false;

  automaticCancelAllowed: false;

  automaticHedgeAllowed: false;

  automaticUnwindAllowed: false;

  allowNewLivePreparation: boolean;

  summary: {
    interruptedRealSessions: number;

    possibleSubmittedRealOrders: number;

    possibleOpenOrders: number;

    possibleExposureSessions: number;

    unresolvedStrategyOneTwoLegSessions: number;

    strategyOneTwoLegPossibleExposureSessions: number;

    persistenceIntegrityProblems: number;

    findings: number;
  };

  findings:
    ExecutionRestartRecoveryFinding[];

  blockers: string[];

  nextActions: string[];

  notes: string[];
}
