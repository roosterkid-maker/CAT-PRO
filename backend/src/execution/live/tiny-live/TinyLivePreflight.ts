export type TinyLivePreflightGateState =
  | "PASS"
  | "BLOCKED";

export interface TinyLiveBalanceRequirement {
  exchange: string;

  asset: string;

  requiredAmount: number;

  maximumAgeMs?: number;
}

export interface TinyLivePreflightRequest {
  requestedCapital: number;

  market: string;

  buyExchange: string;

  sellExchange: string;

  confirmationToken: string;

  balanceRequirements:
    TinyLiveBalanceRequirement[];
}

export interface TinyLivePreflightGate {
  key: string;

  state:
    TinyLivePreflightGateState;

  required: true;

  message: string;

  reasons: string[];
}

export interface TinyLivePreflightReport {
  generatedAt: number;

  version: "18.0";

  build: "15";

  mode:
    "TINY_LIVE_PREFLIGHT";

  preflightOnly: true;

  liveOrderSubmissionPerformed: false;

  capitalReserved: false;

  liveSessionCreated: false;

  approved: boolean;

  requestedCapital: number;

  hardCapitalRange: {
    minimum: 100;

    maximum: 500;

    currency: "INR";
  };

  market: string;

  buyExchange: string;

  sellExchange: string;

  gates:
    TinyLivePreflightGate[];

  blockers: string[];

  safety: {
    automaticOrderSubmissionAllowed: false;

    automaticCapitalReservationAllowed: false;

    automaticCancelAllowed: false;

    automaticHedgeAllowed: false;

    automaticUnwindAllowed: false;

    preflightConfirmationRequired: true;
  };

  notes: string[];
}