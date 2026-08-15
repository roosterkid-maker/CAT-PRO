import type {
  ExecutionDryRunResult,
  ExecutionDryRunScenario,
} from "../../execution/live/dryrun/ExecutionDryRunHarness";

export interface ControlledReconciliationSettlementScenario {
  scenario: ExecutionDryRunScenario;

  passed: boolean;

  noExchangeOrderSubmitted: true;

  accountCapitalUnchanged: boolean;

  requiredChecksPassed: boolean;

  raw: ExecutionDryRunResult;

  reasons: string[];
}

export interface ControlledReconciliationSettlementValidationResult {
  generatedAt: number;

  version: "17.2";

  build: "4";

  mode: "CONTROLLED_LIVE";

  passed: boolean;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  exchangeOrderSubmitted: false;

  scenarios: ControlledReconciliationSettlementScenario[];

  checks: {
    balancedSettlementCompleted: boolean;

    balancedReconciliationMatched: boolean;

    balancedCoordinatorCompleted: boolean;

    failedLegRecoveryDetected: boolean;

    failedLegSettlementBlocked: boolean;

    failedLegCoordinatorFailed: boolean;

    allAccountCapitalUnchanged: boolean;
  };

  reasons: string[];
}