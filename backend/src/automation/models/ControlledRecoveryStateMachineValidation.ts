import type {
  LiveExecutionSession,
} from "../../execution/live/coordinator/LiveExecutionSession";

import type {
  OrderLifecycleRecord,
} from "../../execution/live/lifecycle/OrderLifecycleRecord";

import type {
  ExecutionRecoveryEvaluation,
} from "../../execution/live/recovery/ExecutionRecoveryRecord";

export type ControlledRecoveryValidationScenario =
  | "BALANCED_FILLED"
  | "BUY_FILLED_SELL_FAILED"
  | "SELL_FILLED_BUY_FAILED"
  | "BUY_FILLED_SELL_PARTIAL"
  | "BUY_TIMEOUT_SELL_FILLED";

export interface ControlledRecoveryScenarioResult {
  scenario:
    ControlledRecoveryValidationScenario;

  passed:
    boolean;

  noExchangeOrderSubmitted:
    true;

  session:
    LiveExecutionSession | null;

  buy:
    OrderLifecycleRecord | null;

  sell:
    OrderLifecycleRecord | null;

  recovery:
    ExecutionRecoveryEvaluation | null;

  checks:
    Record<
      string,
      boolean
    >;

  reasons:
    string[];
}

export interface ControlledRecoveryStateMachineValidationResult {
  generatedAt:
    number;

  version:
    "17.2";

  build:
    "3";

  mode:
    "CONTROLLED_LIVE";

  passed:
    boolean;

  liveExecutionAllowed:
    false;

  liveOrderSubmissionAllowed:
    false;

  exchangeOrderSubmitted:
    false;

  scenarios:
    ControlledRecoveryScenarioResult[];
}