import type {
  CatProTargetExchange,
} from "@/modules/exchange-health/types/ExchangeFleet";

export interface FiveExchangeGoNoGoGate {
  key: string;

  category:
    | "ROLLING_EVIDENCE"
    | "V18_HARDENING"
    | "PRODUCTION_SAFETY"
    | "RECOVERY"
    | "ALERTING"
    | "CREDENTIALS"
    | "AUTHENTICATED_READ"
    | "CLOCK"
    | "EXECUTION_ADAPTER";

  state:
    | "PASS"
    | "BLOCKED";

  requiredForActivationReview: boolean;

  message: string;

  reasons: string[];
}

export interface FiveExchangeGoNoGoExchange {
  exchange: CatProTargetExchange;

  rollingShadowStable: boolean;

  rollingPaperStable: boolean;

  credentialsMonitored: boolean;

  credentialsConfigured: boolean;

  authenticatedReadFresh: boolean;

  clockMonitored: boolean;

  signedRequestAllowed: boolean;

  liveAdapterRegistered: boolean;

  liveAdapterConnected: false;

  blockers: string[];
}

export interface FiveExchangeGoNoGoReport {
  generatedAt: number;

  version: "19.35";

  mode:
    "FIVE_EXCHANGE_TINY_LIVE_GO_NO_GO";

  decision:
    | "NO_GO"
    | "GO_FOR_AUDITED_ACTIVATION_REVIEW";

  activationReviewEligible: boolean;

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  automaticPromotionAllowed: false;

  orderSubmissionPerformed: false;

  capitalReserved: false;

  summary: {
    totalGates: number;

    passed: number;

    blocked: number;

    requiredGates: number;

    requiredPassed: number;

    requiredBlocked: number;

    postActivationBlocked: number;

    exchangesWithoutBlockers: number;
  };

  gates: FiveExchangeGoNoGoGate[];

  exchanges:
    FiveExchangeGoNoGoExchange[];

  blockers: string[];

  postActivationBlockers: string[];

  notes: string[];
}

export interface FiveExchangeGoNoGoResponse {
  success: boolean;

  data:
    FiveExchangeGoNoGoReport;
}
