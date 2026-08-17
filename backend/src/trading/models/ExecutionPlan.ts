export type OrderSide =
  | "BUY"
  | "SELL";

export type ExecutionMode =
  | "PAPER"
  | "TESTNET"
  | "LIVE";

export type ExecutionStrategy =
  | "PARALLEL"
  | "BUY_FIRST"
  | "SELL_FIRST";

export type ExecutionStatus =
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type ExecutionOrderType =
  | "market"
  | "limit";

export type ExecutionTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK";

export interface ExecutionPolicyIdentity {
  readonly policyId: string;

  readonly revision: number;

  readonly policyHash: string;
}

export interface ExecutionLeg {
  readonly exchange: string;

  readonly market: string;

  readonly side: OrderSide;

  readonly quantity: number;

  readonly limitPrice: number;

  /**
   * Added as an incremental migration field.
   *
   * Existing PAPER execution currently assumes
   * limit-price based execution, therefore this
   * remains optional until every execution path
   * is migrated to the shared order validator.
   */
  readonly orderType?:
    ExecutionOrderType;

  readonly timeInForce?:
    ExecutionTimeInForce;

  /**
   * Asset information allows the execution
   * safety layer to validate balances without
   * parsing market strings at execution time.
   */
  readonly baseAsset?:
    string;

  readonly quoteAsset?:
    string;

  /** Native wallet units held atomically before a LIVE submission. */
  readonly balanceReservationAmount?:
    number;
}

export interface ExecutionPlan {
  readonly id: string;

  /**
   * Immutable identity of the policy that authorized
   * planning. Historical execution evidence can use
   * this to prove which thresholds were in force.
   */
  readonly policyIdentity?:
    ExecutionPolicyIdentity;

  /**
   * Schema version allows future execution plans
   * to evolve without silently changing the
   * meaning of historical plans.
   */
  readonly version?:
    number;

  readonly market: string;

  readonly mode:
    ExecutionMode;

  readonly strategy:
    ExecutionStrategy;

  readonly status:
    ExecutionStatus;

  readonly capital:
    number;

  readonly expectedProfit:
    number;

  readonly expectedProfitPercent:
    number;

  /**
   * Expected trading fees for both execution
   * legs combined.
   *
   * Optional during the migration from the
   * existing paper execution planner.
   */
  readonly expectedFees?:
    number;

  /**
   * Expected net profit after known execution
   * costs.
   */
  readonly expectedNetProfit?:
    number;

  readonly expectedNetProfitPercent?:
    number;

  readonly maximumSlippagePercent:
    number;

  /**
   * Expected execution slippage calculated by
   * the planner/simulator when available.
   */
  readonly expectedSlippagePercent?:
    number;

  /**
   * Risk and execution scores captured when the
   * plan is created.
   *
   * They become historical evidence of why the
   * trade was approved.
   */
  readonly riskScore?:
    number;

  readonly executionScore?:
    number;

  readonly timeoutMs:
    number;

  readonly buy:
    ExecutionLeg;

  readonly sell:
    ExecutionLeg;

  readonly createdAt:
    number;

  /**
   * Absolute expiration timestamp.
   *
   * Arbitrage plans should never remain
   * executable indefinitely because the market
   * state that created them becomes stale.
   */
  readonly expiresAt?:
    number;

  /**
   * Timestamp of the underlying opportunity.
   * This is different from createdAt: the quote
   * may already be old when planning starts.
   */
  readonly opportunityTimestamp?:
    number;

  /**
   * Optional deterministic fingerprint of the
   * execution-critical plan fields.
   *
   * Later the live execution gateway can verify
   * that a validated plan was not changed before
   * submission.
   */
  readonly validationHash?:
    string;
}
