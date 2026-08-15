import type {
  LiveExecutionStatus,
} from "../models/LiveExecutionResult";

export type RecoveryInspectionStatus =
  | "CONFIRMED_TERMINAL"
  | "CONFIRMED_OPEN"
  | "CONFIRMED_PARTIAL"
  | "UNAVAILABLE"
  | "INSUFFICIENT_IDENTIFIER"
  | "QUERY_FAILED";

export interface AuthoritativeOrderInspection {
  inspectedAt: number;

  lifecycleOrderId: string;

  sessionId: string;

  leg:
    | "BUY"
    | "SELL";

  exchange: string;

  market: string;

  persistedStatus: string;

  exchangeOrderId:
    string | null;

  clientOrderId:
    string | null;

  adapterRegistered: boolean;

  adapterConnected: boolean;

  inspectionStatus:
    RecoveryInspectionStatus;

  authoritativeStatus:
    LiveExecutionStatus | null;

  authoritativeFilledQuantity:
    number | null;

  authoritativeRemainingQuantity:
    number | null;

  authoritativeAverageFillPrice:
    number | null;

  authoritativeFeeAmount:
    number | null;

  authoritativeCancelled:
    boolean | null;

  authoritativeTimedOut:
    boolean | null;

  querySucceeded: boolean;

  failureReason:
    string | null;

  reasons: string[];
}

export interface AuthoritativeRecoveryInspectionReport {
  generatedAt: number;

  version: "18.0";

  build: "5";

  inspectionOnly: true;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticCancelAllowed: false;

  automaticResubmissionAllowed: false;

  automaticHedgeAllowed: false;

  automaticUnwindAllowed: false;

  recoveryGateAutomaticallyCleared: false;

  summary: {
    persistedRiskOrders: number;

    inspectedOrders: number;

    confirmedTerminal: number;

    confirmedOpen: number;

    confirmedPartial: number;

    unavailable: number;

    insufficientIdentifier: number;

    queryFailed: number;
  };

  inspections:
    AuthoritativeOrderInspection[];

  blockers: string[];

  notes: string[];
}