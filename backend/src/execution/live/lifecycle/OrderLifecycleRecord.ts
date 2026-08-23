import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

import type {
  ExecutionPolicyIdentity,
} from "../../../trading/models/ExecutionPlan";

export type OrderLifecycleLeg =
  | "BUY"
  | "SELL";

export type OrderLifecyclePurpose =
  | "PRIMARY"
  | "RECOVERY";

export type OrderLifecycleStatus =
  | "PREPARED"
  | "SUBMISSION_REQUESTED"
  | "ACKNOWLEDGED"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "TIMED_OUT"
  | "FAILED"
  | "ABORTED";

export type OrderLifecycleEventType =
  | "ORDER_PREPARED"
  | "SUBMISSION_REQUESTED"
  | "ORDER_ACKNOWLEDGED"
  | "ORDER_OPEN"
  | "ORDER_PARTIALLY_FILLED"
  | "ORDER_FILLED"
  | "ORDER_CANCELLED"
  | "ORDER_REJECTED"
  | "ORDER_TIMED_OUT"
  | "ORDER_FAILED"
  | "ORDER_ABORTED";

export interface OrderLifecycleEvent {
  type:
    OrderLifecycleEventType;

  timestamp:
    number;

  message:
    string;

  metadata:
    Readonly<
      Record<
        string,
        unknown
      >
    >;
}

export interface OrderLifecycleRecord {
  id:
    string;

  sessionId:
    string;

  planId:
    string;

  policyIdentity?:
    ExecutionPolicyIdentity;

  leg:
    OrderLifecycleLeg;

  purpose:
    OrderLifecyclePurpose;

  recoveryIncidentId:
    string | null;

  exchange:
    string;

  market:
    string;

  side:
    | "buy"
    | "sell";

  status:
    OrderLifecycleStatus;

  request:
    LiveExecutionRequest;

  exchangeOrderId:
    string | null;

  clientOrderId:
    string | null;

  requestedQuantity:
    number;

  filledQuantity:
    number;

  remainingQuantity:
    number;

  requestedPrice:
    number | null;

  averageFillPrice:
    number;

  feeAmount:
    number;

  createdAt:
    number;

  updatedAt:
    number;

  submittedAt:
    number | null;

  completedAt:
    number | null;

  failureReason:
    string | null;

  latestResult:
    LiveExecutionResult | null;

  events:
    OrderLifecycleEvent[];
}

export interface PrepareOrderLifecycleResult {
  approved:
    boolean;

  order:
    OrderLifecycleRecord | null;

  reasons:
    string[];
}

export interface PreparePaperRecoveryOrderLifecycleRequest {
  sessionId: string;

  recoveryIncidentId: string;

  leg: OrderLifecycleLeg;

  exchange: string;

  market: string;

  quantity: number;

  limitPrice: number;
}

export interface OrderLifecycleDiagnostics {
  generatedAt:
    number;

  liveOrderSubmissionConfirmed:
    boolean;

  totalOrders:
    number;

  prepared:
    number;

  submissionRequested:
    number;

  acknowledged:
    number;

  open:
    number;

  partiallyFilled:
    number;

  filled:
    number;

  cancelled:
    number;

  rejected:
    number;

  timedOut:
    number;

  failed:
    number;

  aborted:
    number;

  orders:
    OrderLifecycleRecord[];
}
