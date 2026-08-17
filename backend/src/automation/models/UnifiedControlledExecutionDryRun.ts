import type {
  ControlledCoordinatorDryBridgeResult,
} from "./ControlledCoordinatorDryBridge";

import type {
  ControlledReconciliationSettlementValidationResult,
} from "./ControlledReconciliationSettlementValidation";

import type {
  ControlledRecoveryStateMachineValidationResult,
} from "./ControlledRecoveryStateMachineValidation";

import type {
  ControlledTwoLegPreparationResult,
} from "./ControlledTwoLegExecution";

import type {
  LiveCandidateEligibilityResult,
} from "./LiveCandidateEligibility";

import type {
  LiveFinalLastLookResult,
} from "./LiveFinalLastLook";

import type {
  LiveOrderValidationResult,
} from "./LiveOrderValidation";

export type UnifiedControlledExecutionDryRunStatus =
  | "BLOCKED_CURRENT_EVIDENCE"
  | "DRY_VALIDATED";

export interface UnifiedControlledExecutionDryRunResult {
  generatedAt: number;

  version: "17.2";

  build: "5";

  mode: "CONTROLLED_LIVE";

  status:
    UnifiedControlledExecutionDryRunStatus;

  passed: boolean;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  exchangeOrderSubmitted: false;

  candidateKey: string;

  capital: number;

  stages: {
    eligibility:
      LiveCandidateEligibilityResult;

    lastLook:
      LiveFinalLastLookResult;

    orderValidation:
      LiveOrderValidationResult;

    twoLegPlan:
      ControlledTwoLegPreparationResult;

    coordinatorDryBridge:
      ControlledCoordinatorDryBridgeResult | null;

    recoveryStateMachine:
      ControlledRecoveryStateMachineValidationResult;

    reconciliationSettlement:
      ControlledReconciliationSettlementValidationResult;
  };

  checks: {
    infrastructureRecoveryValidated: boolean;

    infrastructureReconciliationSettlementValidated: boolean;

    infrastructureValidated: boolean;

    candidateEvidenceReady: boolean;

    coordinatorDryBridgeValidated: boolean;

    noExchangeOrderSubmitted: boolean;
  };

  blockers: string[];

  reasons: string[];
}