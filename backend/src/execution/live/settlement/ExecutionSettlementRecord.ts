import type {
  ExecutionPolicyIdentity,
} from "../../../trading/models/ExecutionPlan";

export type ExecutionSettlementStatus =
  | "READY"
  | "SETTLED"
  | "BLOCKED"
  | "FAILED";

export interface ExecutionSettlementRecord {
  id: string;

  sessionId: string;

  planId: string;

  policyIdentity?:
    ExecutionPolicyIdentity;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: ExecutionSettlementStatus;

  quantity: number;

  buyAveragePrice: number;

  sellAveragePrice: number;

  buyNotional: number;

  sellNotional: number;

  grossProfit: number;

  buyFees: number;

  sellFees: number;

  totalFees: number;

  buySlippagePercent: number | null;

  sellSlippagePercent: number | null;

  totalAdverseSlippagePercent: number;

  netProfit: number;

  roiPercent: number;

  executionDurationMs: number;

  createdAt: number;

  settledAt: number | null;

  reasons: string[];
}

export interface ExecutionAuditEvent {
  sequence: number;

  timestamp: number;

  source:
    | "COORDINATOR"
    | "LIFECYCLE"
    | "FILL"
    | "RECOVERY"
    | "RECONCILIATION"
    | "SETTLEMENT";

  type: string;

  message: string;

  metadata:
    Readonly<
      Record<
        string,
        unknown
      >
    >;
}

export interface ExecutionAuditRecord {
  sessionId: string;

  planId: string;

  policyIdentity?:
    ExecutionPolicyIdentity;

  market: string;

  buyExchange: string;

  sellExchange: string;

  generatedAt: number;

  finalSessionStatus: string;

  settlementStatus:
    ExecutionSettlementStatus |
    "NOT_CREATED";

  recoveryIncidentCount: number;

  reconciliationRecordCount: number;

  events: ExecutionAuditEvent[];
}

export interface ExecutionSettlementDiagnostics {
  generatedAt: number;

  totalSettlements: number;

  settled: number;

  blocked: number;

  failed: number;

  totalGrossProfit: number;

  totalFees: number;

  totalNetProfit: number;

  settlements: ExecutionSettlementRecord[];
}
