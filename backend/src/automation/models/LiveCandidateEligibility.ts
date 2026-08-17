import type {
  ExchangeOrderValidationResult,
} from "../../execution/capabilities/validation/ExchangeOrderValidation";

import type {
  RiskAssessment,
} from "../../risk/models/RiskAssessment";

import type {
  ExchangeBalanceCheckResult,
} from "../../trading/account/TradingAccountService";

export type LiveCandidateEligibilityStatus =
  | "BLOCKED"
  | "TECHNICALLY_READY";

export type LiveCandidateEligibilityGateState =
  | "PASS"
  | "BLOCKED"
  | "NOT_IMPLEMENTED";

export interface LiveCandidateEligibilityGate {
  key: string;

  state:
    LiveCandidateEligibilityGateState;

  required: boolean;

  message: string;
}

export interface LiveCandidateEligibilityRequest {
  candidateKey: string;

  capital: number;
}

export interface LiveCandidateEligibilityResult {
  generatedAt: number;

  version: "17.0";

  mode: "CONTROLLED_LIVE";

  status:
    LiveCandidateEligibilityStatus;

  candidateKey: string;

  capital: number;

  liveExecutionAllowed: false;

  liveOrderSubmissionAllowed: false;

  candidate: {
    found: boolean;

    qualified: boolean;

    qualificationScore:
      number | null;

    market:
      string | null;

    buyExchange:
      string | null;

    sellExchange:
      string | null;

    currentOpportunityId:
      string | null;
  };

  routeEvidence: {
    status:
      string | null;

    score:
      number | null;

    capitalMultiplier:
      number | null;

    reasons:
      string[];
  };

  marketIntegrity: {
    buyFresh: boolean;

    sellFresh: boolean;

    synchronized: boolean;

    timestampSkewMs:
      number | null;

    maximumPairSkewMs:
      number | null;

    buyBookValid: boolean;

    sellBookValid: boolean;
  };

  simulation: {
    attempted: boolean;

    success: boolean;

    recommendation:
      string | null;

    confidence:
      number | null;

    fillPercent:
      number | null;

    executableQuantity:
      number | null;

    buyVwap:
      number | null;

    sellVwap:
      number | null;

    netProfit:
      number | null;

    netProfitPercent:
      number | null;

    executionTimeMs:
      number | null;

    failureReason:
      string | null;
  };

  adapters: Array<{
    exchange: string;

    adapterRegistered: boolean;

    adapterConnected: boolean;
  }>;

  balances: {
    buyQuote:
      ExchangeBalanceCheckResult | null;

    sellBase:
      ExchangeBalanceCheckResult | null;
  };

  orderValidation: {
    buy:
      ExchangeOrderValidationResult | null;

    sell:
      ExchangeOrderValidationResult | null;
  };

  risk:
    RiskAssessment | null;

  gates:
    LiveCandidateEligibilityGate[];

  blockers:
    string[];
}