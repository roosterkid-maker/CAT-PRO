import type {
  LiveExecutionStatus,
} from "../models/LiveExecutionResult";

import type {
  OrderLifecycleStatus,
} from "../lifecycle/OrderLifecycleRecord";

export type ReconciliationStatus =
  | "MATCHED"
  | "DRIFT"
  | "NOT_SUBMITTED"
  | "REMOTE_UNAVAILABLE"
  | "ERROR";

export type ReconciliationSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export interface ExecutionReconciliationRecord {
  id: string;

  orderLifecycleId: string;

  sessionId: string;

  planId: string;

  exchange: string;

  market: string;

  side:
    | "buy"
    | "sell";

  exchangeOrderId: string | null;

  status: ReconciliationStatus;

  severity: ReconciliationSeverity;

  internal: {
    status: OrderLifecycleStatus;

    requestedQuantity: number;

    filledQuantity: number;

    remainingQuantity: number;

    averageFillPrice: number;

    feeAmount: number;
  };

  remote: {
    available: boolean;

    status: LiveExecutionStatus | null;

    requestedQuantity: number | null;

    filledQuantity: number | null;

    remainingQuantity: number | null;

    averageFillPrice: number | null;

    feeAmount: number | null;
  };

  drift: {
    statusMismatch: boolean;

    requestedQuantityDifference: number;

    filledQuantityDifference: number;

    remainingQuantityDifference: number;

    averageFillPriceDifference: number;

    feeDifference: number;
  };

  reasons: string[];

  checkedAt: number;
}

export interface ExecutionReconciliationDiagnostics {
  generatedAt: number;

  running: boolean;

  scanIntervalMs: number;

  scanInProgress: boolean;

  lastScanAt: number | null;

  scans: number;

  ordersChecked: number;

  matched: number;

  drifted: number;

  notSubmitted: number;

  remoteUnavailable: number;

  errors: number;

  criticalMismatches: number;

  warningMismatches: number;

  orphanScanSupported: false;

  orphanScanReason: string;

  records: ExecutionReconciliationRecord[];
}