import type {
  ExchangeMarketCapability,
  ExchangeTimeInForce,
} from "../../execution/capabilities/models/ExchangeCapability";

import type {
  ExchangeOrderValidationResult,
} from "../../execution/capabilities/validation/ExchangeOrderValidation";

export type LiveOrderValidationStatus =
  | "READY"
  | "WARNING"
  | "BLOCKED";

export type LiveOrderValidationSeverity =
  | "INFO"
  | "WARNING"
  | "BLOCKER";

export interface LiveOrderValidationCheck {
  key: string;

  passed: boolean;

  severity:
    LiveOrderValidationSeverity;

  message: string;
}

export interface LiveOrderExecutionSemantics {
  exchange: string;

  requestedOrderType:
    "limit";

  adapterTimeInForce:
    ExchangeTimeInForce | null;

  timeInForceExplicitlyEnforced:
    boolean;

  cancelOnTimeoutRequired:
    boolean;

  statusPollingRequired:
    boolean;

  clientOrderIdRequired:
    boolean;

  notes: string[];
}

export interface LiveOrderValidationLeg {
  side:
    | "buy"
    | "sell";

  exchange: string;

  market: string;

  quantity: number;

  price: number;

  notional: number;

  capability:
    ExchangeMarketCapability | null;

  capabilityAgeMs:
    number | null;

  validation:
    ExchangeOrderValidationResult | null;

  executionSemantics:
    LiveOrderExecutionSemantics | null;

  checks:
    LiveOrderValidationCheck[];
}

export interface LiveOrderValidationResult {
  generatedAt: number;

  version: "17.1";

  mode: "CONTROLLED_LIVE";

  status:
    LiveOrderValidationStatus;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  candidateKey: string;

  capital: number;

  market:
    string | null;

  buyExchange:
    string | null;

  sellExchange:
    string | null;

  simulationReady: boolean;

  executableQuantity:
    number | null;

  buy:
    LiveOrderValidationLeg | null;

  sell:
    LiveOrderValidationLeg | null;

  checks:
    LiveOrderValidationCheck[];

  blockers: string[];

  warnings: string[];
}