import type {
  StrategyId,
} from "./StrategyMetadata";

export type StrategyIntentMode =
  | "SHADOW"
  | "PAPER"
  | "LIVE";

/**
 * A StrategyIntent is an immutable proposal contract.
 *
 * Creation records proposal evidence only. It does not route or execute an
 * intent, reserve or mutate capital, or authorize PAPER/LIVE activity.
 */
interface StrategyIntentBase {
  readonly id:
    string;

  readonly strategyId:
    StrategyId;

  readonly signalId:
    string;

  readonly kind:
    "PROPOSED_STRATEGY_ACTION";

  readonly proposedMode:
    StrategyIntentMode;

  readonly proposalType:
    string;

  readonly proposedCapital:
    number | null;

  readonly createdAt:
    number;

  readonly expiresAt:
    number;

  readonly status:
    "PROPOSED";

  readonly executionAuthorized:
    false;

  readonly automaticExecutionAllowed:
    false;
}

export interface CrossExchangeArbitragePaperStrategyIntent
extends StrategyIntentBase {
  readonly proposedMode:
    "PAPER";

  readonly proposalType:
    "CROSS_EXCHANGE_ARBITRAGE_PAPER_EXECUTION";

  readonly proposedCapital:
    number;

  readonly evidence: {
    readonly type:
      "CROSS_EXCHANGE_ARBITRAGE_PAPER_EXECUTION";

    readonly sourceOpportunityId:
      string;

    readonly candidateGeneration:
      string;

    readonly market:
      string;

    readonly buyExchange:
      string;

    readonly sellExchange:
      string;
  };
}

export interface CrossExchangeMarketMakingHedgeStrategyIntent
extends StrategyIntentBase {
  readonly strategyId:
    "cross-exchange-market-making";

  readonly proposedMode:
    "SHADOW";

  readonly proposalType:
    "XEMM_HEDGE_AFTER_SIMULATED_MAKER_FILL";

  readonly proposedCapital:
    null;

  readonly evidence: {
    readonly type:
      "XEMM_HEDGE_AFTER_SIMULATED_MAKER_FILL";

    readonly simulatedFillId:
      string;

    readonly makerOrderId:
      string;

    readonly market:
      string;

    readonly makerExchange:
      string;

    readonly makerSide:
      | "BID"
      | "ASK";

    readonly simulatedMakerFillPrice:
      number;

    readonly simulatedQuantity:
      number;

    readonly hedgeExchange:
      string;

    readonly hedgeSide:
      | "BUY"
      | "SELL";

    readonly hedgeReferencePrice:
      number;

    readonly hedgeReferenceQuantity:
      number;

    readonly hedgeTakerFeePercent:
      number;

    readonly hedgeTakerFeeSource:
      | "STATIC_CONFIG"
      | "PUBLIC_API"
      | "ACCOUNT_API";

    readonly hedgeCapacityStatus:
      "FULL_TOP_OF_BOOK_CAPACITY_VERIFIED";

    readonly balanceEvidence:
      "NOT_EVALUATED_V21_3";

    readonly hedgeSlippageBeyondTop:
      "NOT_EVALUATED_V21_3";

    readonly recoveryExecution:
      "NOT_AUTHORIZED_V21_3";
  };
}

export interface HedgeInventoryManagementStrategyIntent
extends StrategyIntentBase {
  readonly strategyId:
    "hedge-inventory-management";

  readonly proposedMode:
    "SHADOW";

  readonly proposalType:
    "HEDGE_INVENTORY_REDUCTION";

  readonly proposedCapital:
    number;

  readonly evidence: {
    readonly type:
      "HEDGE_INVENTORY_REDUCTION";
    readonly sourceProposalId:
      string;
    readonly sourceType:
      "PORTFOLIO_EXPOSURE";
    readonly sourceCapitalReservationAssessmentId:
      string;
    readonly sourceRiskApprovalAssessmentId:
      string;
    readonly routeId:
      string;
    readonly asset:
      string;
    readonly quoteAsset:
      string;
    readonly side:
      | "BUY"
      | "SELL";
    readonly venue:
      string;
    readonly market:
      string;
    readonly proposedQuantity:
      number;
    readonly referenceVwapPrice:
      number;
    readonly capitalReservationId:
      string;
    readonly capitalReservationExpiresAt:
      number;
    readonly recursionDepth:
      0;
    readonly reservationMutationAuthorized:
      false;
  };
}

export type StrategyIntent =
  | CrossExchangeArbitragePaperStrategyIntent
  | CrossExchangeMarketMakingHedgeStrategyIntent
  | HedgeInventoryManagementStrategyIntent;

export function immutableStrategyIntent(
  intent:
    StrategyIntent,
): StrategyIntent {
  return deepFreeze(
    structuredClone(
      intent,
    ),
  );
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}
