export type PaperTradingReadinessStage =
  | "SHADOW_SOAK"
  | "PAPER_BLOCKED"
  | "PAPER_READY"
  | "PAPER_SOAK"
  | "PAPER_SOAK_COMPLETE";

export type PaperTradingReadinessGateStatus =
  | "PASS"
  | "BLOCKED";

export interface PaperTradingReadinessGate {
  key: string;

  label: string;

  status:
    PaperTradingReadinessGateStatus;

  passed: boolean;

  evidence: string;

  requiredFor: Array<
    | "SHADOW_DEPLOYMENT"
    | "PAPER_START"
    | "PAPER_SOAK"
  >;
}

export interface PaperTradingReadinessReport {
  generatedAt: number;

  version: "20.9";

  mode:
    "READ_ONLY_PAPER_READINESS";

  evidenceStatus:
    "AVAILABLE";

  stage:
    PaperTradingReadinessStage;

  readyForShadowDeployment:
    boolean;

  readyForPaperTrading:
    boolean;

  readyForPaperSoakReview:
    boolean;

  liveExecutionAllowed:
    false;

  orderSubmissionAllowed:
    false;

  summary: {
    schedulerRunning: boolean;

    targetExchangeCount: 5;

    marketDataConnected: number;

    minimumCrossExchangeVenues: number;

    shadowAvailableExchanges: number;

    paperAvailableExchanges: number;

    completedShadowOutcomes: number;

    minimumShadowOutcomes: number;

    remainingShadowOutcomes: number;

    shadowReadinessLevel: string;

    shadowQuality: {
      successRatePercent: number;
      successRateTargetPercent: number;
      dataAvailabilityRatePercent: number;
      dataAvailabilityTargetPercent: number;
      profitRetentionPercent: number;
      profitRetentionTargetPercent: number;
    };

    paperExecutionArmed: boolean;

    controllerPaperExecutionAllowed: boolean;

    paperAccountMode: boolean;

    accountingIntegrityPassed: boolean;

    runtimeAcceptanceEvidence: boolean;

    runtimeAcceptanceReady: boolean;
  };

  soak: {
    evidenceStatus:
      | "AVAILABLE"
      | "NO_DATA";

    minimumAttributedClosedTrades: number;

    attributedPaperTrades:
      number | null;

    attributedClosedTrades:
      number | null;

    remainingAttributedClosedTrades:
      number | null;

    attributedNetProfit:
      number | null;

    minimumConsecutiveRuntimePasses:
      number;

    consecutiveRuntimePasses:
      number;

    remainingConsecutiveRuntimePasses:
      number;

    status:
      | "NOT_STARTED"
      | "COLLECTING"
      | "READY_FOR_DEPLOYMENT_REVIEW";
  };

  gates:
    PaperTradingReadinessGate[];

  blockers:
    string[];

  notes:
    string[];
}
