export type CatProTargetExchange =
  | "coindcx"
  | "binance"
  | "bybit"
  | "unocoin"
  | "coinswitch";

export type CatProFleetExchange =
  | CatProTargetExchange
  | "zebpay";

export type CatProFoundationExchange =
  | "giottus"
  | "mudrex"
  | "bitbns";

export type ExchangeCapabilityImplementationState =
  | "IMPLEMENTED"
  | "DOCUMENTED_NOT_IMPLEMENTED";

export interface ExchangeFleetCapability {
  exchange:
    CatProFleetExchange;

  displayName: string;

  officialDocumentationUrl: string;

  marketData: {
    implementationState:
      ExchangeCapabilityImplementationState;

    adapterRegistered: boolean;

    connected: boolean;
  };

  marketRules: {
    implementationState:
      ExchangeCapabilityImplementationState;

    providerRegistered: boolean;
  };

  authenticatedRead: {
    implementationState:
      ExchangeCapabilityImplementationState;

    monitored: boolean;

    credentialsConfigured: boolean;

    verificationState:
      | "NOT_CONFIGURED"
      | "CONFIGURED_UNVERIFIED"
      | "VERIFICATION_STALE"
      | "VERIFIED";

    fresh: boolean;
  };

  clockSafety: {
    implementationState:
      ExchangeCapabilityImplementationState;

    monitored: boolean;

    signedRequestAllowed:
      boolean | null;
  };

  liveOrderAdapter: {
    implementationState:
      ExchangeCapabilityImplementationState;

    adapterRegistered: boolean;

    liveExecutionEnabled: false;

    adapterConnected: false;
  };
}

export interface ExchangeFleetCapabilityReport {
  generatedAt: number;

  version: "20.0";

  targetExchangeCount: 5;

  liveTradingEnabled: false;

  liveSubmissionAllowed: false;

  summary: {
    marketDataImplemented: number;

    marketDataConnected: number;

    marketRuleProviders: number;

    authenticatedReadMonitored: number;

    verifiedReadAccess: number;

    liveOrderAdapters: number;
  };

  exchanges:
    ExchangeFleetCapability[];

  observationExchangeCount: 1;

  observationExchanges:
    ExchangeFleetCapability[];

  observationSummary: {
    marketDataConnected: number;

    executionEligible: number;

    paperEligibleMarkets: number;
  };

  foundationExchangeCount: 3;

  foundationExchanges: Array<{
    exchange: CatProFoundationExchange;
    displayName: string;
    officialDocumentationUrl: string;
    documentedProduct: "SPOT" | "FUTURES" | "LEGACY_SPOT_CLIENT";
    requiredCredentialVariables: string[];
    credentialsConfigured: boolean;
    marketDataAdapterImplemented: false;
    authenticatedReadImplemented: false;
    orderAdapterImplemented: false;
    liveExecutionEnabled: false;
    readinessState: "CREDENTIALS_PENDING" | "SPOT_CONTRACT_REVIEW_REQUIRED";
    blockers: string[];
  }>;

  notes: string[];
}

export interface ExchangeFleetCapabilityResponse {
  success: boolean;

  data:
    ExchangeFleetCapabilityReport;
}
