export type ControlledTwoLegPreparationStatus =
  | "BLOCKED"
  | "PREPARED";

export type ControlledTwoLegStrategy =
  | "PARALLEL"
  | "BUY_FIRST"
  | "SELL_FIRST"
  | "NONE";

export type ControlledTwoLegFailureScenario =
  | "BUY_FILLED_SELL_FAILED"
  | "SELL_FILLED_BUY_FAILED"
  | "BUY_PARTIAL_SELL_FULL"
  | "SELL_PARTIAL_BUY_FULL"
  | "BOTH_PARTIAL"
  | "BUY_TIMEOUT"
  | "SELL_TIMEOUT"
  | "EXCHANGE_DISCONNECT"
  | "CANCEL_FAILURE"
  | "RECONCILIATION_MISMATCH";

export type ControlledTwoLegRecoveryAction =
  | "CANCEL_OPEN_LEG"
  | "POLL_REMOTE_STATUS"
  | "FREEZE_NEW_ROUTE_EXECUTION"
  | "RECONCILE_BOTH_LEGS"
  | "HEDGE_RESIDUAL_EXPOSURE"
  | "UNWIND_RESIDUAL_EXPOSURE"
  | "ESCALATE_MANUAL_REVIEW";

export interface ControlledTwoLegRecoveryPolicy {
  scenario: ControlledTwoLegFailureScenario;

  actions: ControlledTwoLegRecoveryAction[];

  automaticLiveActionAllowed: false;

  message: string;
}

export interface ControlledTwoLegLegPlan {
  leg:
    | "BUY"
    | "SELL";

  exchange: string;

  market: string;

  quantity: number;

  limitPrice: number;

  timeoutMs: number;

  cancelOnTimeout: true;

  submissionAllowed: false;
}

export interface ControlledTwoLegPreparationResult {
  generatedAt: number;

  version: "17.2";

  mode: "CONTROLLED_LIVE";

  status:
    ControlledTwoLegPreparationStatus;

  candidateKey: string;

  capital: number;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  coordinatorSessionCreated: false;

  capitalReserved: false;

  routeLockAcquired: false;

  strategy:
    ControlledTwoLegStrategy;

  strategyReasons: string[];

  prerequisites: {
    candidateEligibilityPassed: boolean;

    finalLastLookPassed: boolean;

    orderValidationPassed: boolean;
  };

  buy:
    ControlledTwoLegLegPlan | null;

  sell:
    ControlledTwoLegLegPlan | null;

  recoveryPolicies:
    ControlledTwoLegRecoveryPolicy[];

  blockers: string[];

  warnings: string[];
}