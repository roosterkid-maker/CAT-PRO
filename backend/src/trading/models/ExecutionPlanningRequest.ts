import type {
  ExecutionMode,
  ExecutionStrategy,
} from "./ExecutionPlan";

import type {
  TradingDecision,
} from "../orchestrator/TradingOrchestrator";

export interface ExecutionPlanningRequest {
  decision:
    TradingDecision;

  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  buyPrice:
    number;

  sellPrice:
    number;

  /** Base-asset quantity resolved after INR-to-quote conversion and depth caps. */
  quantity:
    number;

  /** Account-side amount reserved by the execution coordinator. */
  reservationCapital: number;

  /** Converts modeled quote-asset P&L into account currency. */
  quoteToAccountConversionRate: number;

  baseAsset?:
    string;

  quoteAsset?:
    string;

  mode?:
    ExecutionMode;

  strategy?:
    ExecutionStrategy;

  expectedFees?:
    number;

  expectedSlippagePercent?:
    number;

  opportunityTimestamp?:
    number;

  timeoutMs?:
    number;

  maximumSlippagePercent?:
    number;
}
