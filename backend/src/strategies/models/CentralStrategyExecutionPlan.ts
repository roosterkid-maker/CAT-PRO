import type {StrategyId} from "./StrategyMetadata";
import type {StrategySignal} from "./StrategySignal";

export type CentralStrategyRouteFamily =
  | "SPOT_TWO_VENUE"
  | "SPOT_TRIANGULAR"
  | "SPOT_PERPETUAL"
  | "PERPETUAL_TWO_VENUE"
  | "SPOT_MARKET_MAKING"
  | "PERPETUAL_STATISTICAL_PAIR";

export type CentralExecutionPattern =
  | "PARALLEL_TWO_LEG"
  | "SEQUENTIAL_THREE_LEG"
  | "PASSIVE_MAKER_THEN_HEDGE"
  | "TWO_SIDED_PASSIVE_MAKER"
  | "PARALLEL_STATISTICAL_PAIR";

export type CentralStrategySettlementPolicy =
  | {
      readonly kind: "EXISTING_STRATEGY_ONE_OWNER";
      readonly lifecycleOwner: "EXISTING_STRATEGY_ONE_ORCHESTRATOR";
    }
  | {
      readonly kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE";
      readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
      readonly requiresPassiveFillEvidence: true;
    }
  | {
      readonly kind: "IMMEDIATE_CONVERSION_CYCLE";
      readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
      readonly startAsset: string;
      readonly initialQuantity: number;
      readonly modeledFinalQuantity: number;
      readonly flows: readonly {
        readonly legId: string;
        readonly fromAsset: string;
        readonly toAsset: string;
      }[];
    }
  | {
      readonly kind: "BASIS_CONVERGENCE";
      readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
      readonly entryBasisPercent: number;
      readonly closeAtOrBelowAbsoluteBasisPercent: number;
      readonly nextOpeningDelayMs: number;
      readonly perpetualLeverage: 1;
      readonly fundingTimestamps: readonly [number];
      readonly requiresFundingEvidence: true;
      readonly forcedTimeExitAllowed: false;
    }
  | {
      readonly kind: "FUNDING_CAPTURE_THEN_EXIT";
      readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
      readonly notBefore: number;
      readonly fundingTimestamps: readonly number[];
      readonly fundingSchedule?: readonly {
        readonly longTimestamp: number;
        readonly shortTimestamp: number;
      }[];
      readonly requiresFundingEvidence: true;
      readonly forcedTimeExitAllowed: false;
    }
  | {
      readonly kind: "SPREAD_CONVERGENCE";
      readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
      readonly entryDislocationPercent: number;
      readonly closeAtOrBelowAbsoluteDislocationPercent: number;
      readonly fundingTimestamps: readonly [number, number];
      readonly requiresFundingEvidence: true;
      readonly forcedTimeExitAllowed: false;
    }
  | {
      readonly kind: "TWO_SIDED_PASSIVE_FILL_CYCLE";
      readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
      readonly requiresEveryPassiveFillEvidence: true;
    }
  | {
      readonly kind: "STATISTICAL_MEAN_REVERSION";
      readonly lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR";
      readonly entryZScore: number;
      readonly closeAtOrBelowAbsoluteZScore: number;
      readonly baselineSpreadMean: number;
      readonly baselineSpreadStandardDeviation: number;
      readonly hedgeBeta: number;
      readonly leftMarket: string;
      readonly rightMarket: string;
      readonly fundingTimestamps: readonly [number, number];
      readonly requiresFundingEvidence: true;
      readonly forcedTimeExitAllowed: false;
    };

export interface CentralStrategyExecutionLeg {
  readonly id: string;
  readonly sequence: number;
  readonly exchange: string;
  readonly product: "SPOT" | "PERPETUAL";
  readonly market: string;
  readonly side: "BUY" | "SELL";
  readonly orderType: "MARKET" | "LIMIT_POST_ONLY";
  readonly quantity: number | null;
  readonly referencePrice: number;
  readonly reduceOnly: false;
  readonly dependency: "PARALLEL" | "AFTER_PREVIOUS" | "PASSIVE_FILL_TRIGGER";
  readonly evidenceOnly: true;
}

/**
 * Canonical, immutable execution description shared by all eight strategies.
 * A compiled plan is evidence, not authorization. Only a separately admitted
 * central runtime may reserve capital or execute it.
 */
export interface CentralStrategyExecutionPlan {
  readonly version: "35.0";
  readonly id: string;
  readonly strategyId: StrategyId;
  readonly signalId: string;
  readonly signalKind: StrategySignal["kind"];
  readonly routeFamily: CentralStrategyRouteFamily;
  readonly pattern: CentralExecutionPattern;
  readonly settlementPolicy: CentralStrategySettlementPolicy;
  readonly executionOwner:
    | "EXISTING_STRATEGY_ONE_ORCHESTRATOR"
    | "CENTRAL_SHARED_ORCHESTRATOR";
  readonly compilationState: "REUSED_EXISTING_PATH" | "COMPILED_SHADOW";
  readonly promotionState: "EXISTING_PAPER_PATH" | "BLOCKED";
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly legs: readonly CentralStrategyExecutionLeg[];
  readonly modeledNetValue: number | null;
  readonly modeledNetValueUnit: "QUOTE" | "START_ASSET" | "PERCENT_ONLY" | null;
  readonly executionReadinessBlockers: readonly string[];
  readonly sourceExecutionAuthorized: false;
  readonly capitalReservationAllowed: false;
  readonly riskApprovalGranted: false;
  readonly executionHandoffAllowed: false;
  readonly automaticExecutionAllowed: false;
  readonly paperExecutionAllowed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}
