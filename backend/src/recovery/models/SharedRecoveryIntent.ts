export type SharedRecoveryIntentSeverity =
  | "WARNING"
  | "CRITICAL";

export type SharedRecoveryIntentStatus =
  | "STAGED"
  | "EXPIRED";

export interface SharedRecoveryIntentProposal {
  readonly sourceStrategyId: string;

  readonly sourceEvidenceId: string;

  readonly sourceValidationHash: string;

  readonly sourceType:
    "STRATEGY_RESIDUAL_EXPOSURE";

  readonly mode:
    | "SHADOW"
    | "PAPER"
    | "LIVE";

  readonly severity:
    SharedRecoveryIntentSeverity;

  readonly routeId: string;

  readonly asset: string;

  readonly quoteAsset: string;

  readonly residualDirection:
    | "LONG"
    | "SHORT";

  readonly venue: string;

  readonly market: string;

  readonly side:
    | "BUY"
    | "SELL";

  readonly quantity: number;

  readonly referencePrice: number;

  readonly estimatedQuoteValue: number;

  readonly sourceCreatedAt: number;

  readonly sourceExpiresAt: number;
}

/**
 * Strategy-neutral, immutable recovery staging contract.
 *
 * A staged recovery intent is evidence only. It deliberately cannot reserve
 * capital, materialize an execution plan, or submit an order.
 */
export interface SharedRecoveryIntent {
  readonly id: string;

  readonly version: "39.0";

  readonly kind:
    "SHARED_RECOVERY_INTENT";

  readonly status:
    "STAGED";

  readonly sourceStrategyId: string;

  readonly sourceEvidenceId: string;

  readonly sourceValidationHash: string;

  readonly sourceType:
    "STRATEGY_RESIDUAL_EXPOSURE";

  readonly mode:
    | "SHADOW"
    | "PAPER"
    | "LIVE";

  readonly severity:
    SharedRecoveryIntentSeverity;

  readonly routeId: string;

  readonly asset: string;

  readonly quoteAsset: string;

  readonly residualDirection:
    | "LONG"
    | "SHORT";

  readonly leg: {
    readonly venue: string;
    readonly market: string;
    readonly side:
      | "BUY"
      | "SELL";
    readonly quantity: number;
    readonly referencePrice: number;
    readonly estimatedQuoteValue: number;
    readonly orderTypeSelected: false;
    readonly timeInForceSelected: false;
  };

  readonly sourceCreatedAt: number;

  readonly stagedAt: number;

  readonly expiresAt: number;

  readonly capitalReservationCreated: false;

  readonly executionPlanCreated: false;

  readonly executionAuthorized: false;

  readonly automaticExecutionAllowed: false;

  readonly paperExecutionAllowed: false;

  readonly liveExecutionAllowed: false;

  readonly orderSubmissionAllowed: false;
}

export interface SharedRecoveryIntentView
extends SharedRecoveryIntent {
  readonly effectiveStatus:
    SharedRecoveryIntentStatus;

  readonly remainingTtlMs: number;
}

export interface SharedRecoveryReport {
  readonly generatedAt: number;

  readonly version: "39.0";

  readonly mode:
    "SHARED_RECOVERY_STAGING";

  readonly summary: {
    readonly total: number;
    readonly staged: number;
    readonly expired: number;
    readonly warning: number;
    readonly critical: number;
    readonly sourceStrategies: number;
  };

  readonly intents:
    readonly SharedRecoveryIntentView[];

  readonly safety: {
    readonly immutableEvidenceOnly: true;
    readonly capitalMutationAllowed: false;
    readonly executionPlanCreationAllowed: false;
    readonly automaticExecutionAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };

  readonly notes:
    readonly string[];
}
