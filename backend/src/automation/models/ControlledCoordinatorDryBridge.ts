import type {
  LiveExecutionSession,
} from "../../execution/live/coordinator/LiveExecutionSession";

import type {
  OrderLifecycleRecord,
} from "../../execution/live/lifecycle/OrderLifecycleRecord";

import type {
  ExecutionPlan,
} from "../../trading/models/ExecutionPlan";

export type ControlledCoordinatorDryBridgeStatus =
  | "BLOCKED"
  | "VALIDATED";

export interface ControlledCoordinatorDryBridgeResult {
  generatedAt: number;

  version: "17.2";

  build: "2";

  mode: "CONTROLLED_LIVE";

  status:
    ControlledCoordinatorDryBridgeStatus;

  candidateKey: string;

  capital: number;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  exchangeOrderSubmitted: false;

  preparationPlan:
    ExecutionPlan | null;

  coordinator: {
    dryRunPreparationAttempted: boolean;

    dryRunPreparationApproved: boolean;

    sessionCreated: boolean;

    routeLockTemporarilyAcquired: boolean;

    capitalTemporarilyReserved: boolean;

    cleanupCompleted: boolean;

    finalSession:
      LiveExecutionSession | null;
  };

  lifecycle: {
    buyPrepared: boolean;

    sellPrepared: boolean;

    buyAborted: boolean;

    sellAborted: boolean;

    buy:
      OrderLifecycleRecord | null;

    sell:
      OrderLifecycleRecord | null;
  };

  blockers: string[];

  warnings: string[];

  reasons: string[];
}