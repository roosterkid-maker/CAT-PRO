export type CatProTargetExchange =
  | "coindcx"
  | "binance"
  | "bybit"
  | "unocoin"
  | "coinswitch";

export type ExchangeCapabilityImplementationState =
  | "IMPLEMENTED"
  | "DOCUMENTED_NOT_IMPLEMENTED";

export interface ExchangeFleetCapability {
  exchange:
    CatProTargetExchange;

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

  version: "19.27";

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

  notes: string[];
}

export interface ExchangeFleetCapabilityResponse {
  success: boolean;

  data:
    ExchangeFleetCapabilityReport;
}
