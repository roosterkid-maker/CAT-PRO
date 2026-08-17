import type {
  ExecutionPlan,
} from "../../../trading/models/ExecutionPlan";

export type LiveExecutionSessionStatus =
  | "VALIDATING"
  | "RESERVED"
  | "READY_FOR_SUBMISSION"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type LiveExecutionCoordinatorEventType =
  | "SESSION_CREATED"
  | "PLAN_VALIDATED"
  | "CAPITAL_RESERVED"
  | "EXECUTION_LOCK_ACQUIRED"
  | "READY_FOR_SUBMISSION"
  | "EXECUTION_STARTED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXECUTION_CANCELLED"
  | "EXECUTION_EXPIRED"
  | "CAPITAL_RELEASED";

export interface LiveExecutionCoordinatorEvent {
  type:
    LiveExecutionCoordinatorEventType;

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

export interface LiveExecutionSession {
  id:
    string;

  planId:
    string;

  lockKey:
    string;

  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  capital:
    number;

  status:
    LiveExecutionSessionStatus;

  reservationId:
    string | null;

  createdAt:
    number;

  updatedAt:
    number;

  expiresAt:
    number;

  startedAt:
    number | null;

  completedAt:
    number | null;

  failureReason:
    string | null;

  validationReasons:
    string[];

  plan:
    ExecutionPlan;

  events:
    LiveExecutionCoordinatorEvent[];
}

export interface LiveExecutionCoordinatorDiagnostics {
  generatedAt:
    number;

  liveExecutionConfirmed:
    boolean;

  activeSessions:
    number;

  readySessions:
    number;

  runningSessions:
    number;

  totalPrepared:
    number;

  totalCompleted:
    number;

  totalFailed:
    number;

  totalCancelled:
    number;

  totalExpired:
    number;

  totalRejected:
    number;

  activeLocks:
    number;

  sessions:
    LiveExecutionSession[];
}

export interface PrepareLiveExecutionResult {
  approved:
    boolean;

  session:
    LiveExecutionSession | null;

  reasons:
    string[];
}