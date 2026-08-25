export type DerivativeAccountEvidenceState =
  | "READY"
  | "DEGRADED"
  | "NO_DATA";

export interface DerivativePositionEvidence {
  readonly exchange: string;
  readonly market: string;
  readonly product: "LINEAR_PERPETUAL";
  readonly positionSide: "LONG" | "SHORT" | "FLAT" | "HEDGED";
  readonly signedQuantity: number;
  readonly entryPrice: number | null;
  readonly markPrice: number | null;
  readonly liquidationPrice: number | null;
  readonly leverage: number | null;
  readonly positionStatus: string | null;
  readonly source: "AUTHENTICATED_READ_ONLY_REST";
  readonly sourceEndpoint: string;
  readonly observedAt: number;
}

export interface DerivativeVenueAccountEvidence {
  readonly exchange: string;
  readonly product: "LINEAR_PERPETUAL";
  readonly settlementAsset: "USDT";
  readonly availableMargin: number;
  readonly availableMarginUnit: "USDT" | "ACCOUNT_USD_VALUE";
  readonly walletBalance: number | null;
  readonly totalEquity: number | null;
  readonly totalInitialMargin: number | null;
  readonly totalMaintenanceMargin: number | null;
  readonly positions: readonly DerivativePositionEvidence[];
  readonly marginSourceEndpoint: string;
  readonly positionSourceEndpoint: string;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly authenticatedReadVerified: true;
  readonly marginReadVerified: true;
  readonly positionReadVerified: true;
  readonly orderSubmissionAllowed: false;
  readonly liveExecutionAllowed: false;
}

export interface DerivativeAccountProviderStatus {
  readonly exchange: string;
  readonly state: DerivativeAccountEvidenceState;
  readonly configured: boolean;
  readonly lastAttemptAt: number | null;
  readonly lastSuccessAt: number | null;
  readonly retainedUntil: number | null;
  readonly positionMarkets: number;
  readonly lastError: string | null;
}

export interface DerivativeAccountEvidenceSnapshot {
  readonly version: "49.0";
  readonly generatedAt: number;
  readonly mode: "AUTHENTICATED_READ_ONLY_DERIVATIVE_ACCOUNT_EVIDENCE";
  readonly configuredMarkets: readonly string[];
  readonly freshnessThresholdMs: number;
  readonly providers: readonly DerivativeAccountProviderStatus[];
  readonly evidence: readonly DerivativeVenueAccountEvidence[];
  readonly safety: {
    readonly signedGetOnly: true;
    readonly credentialValuesExposed: false;
    readonly balanceInferenceAllowed: false;
    readonly positionInferenceAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly liveExecutionAllowed: false;
  };
}

export interface BinanceUsdMAccountVerificationReport {
  readonly version: "49.1";
  readonly mode: "BINANCE_USDM_SIGNED_GET_MARGIN_POSITION_VERIFICATION";
  readonly exchange: "binance";
  readonly requestedAt: number;
  readonly attemptedAt: number;
  readonly completedAt: number;
  readonly outcome: "VERIFIED" | "FAILED";
  readonly provider: DerivativeAccountProviderStatus;
  readonly checks: {
    readonly credentialsConfigured: boolean;
    readonly currentAttemptSucceeded: boolean;
    readonly freshEvidence: boolean;
    readonly authenticatedReadVerified: boolean;
    readonly marginReadVerified: boolean;
    readonly positionReadVerified: boolean;
    readonly configuredMarketsCovered: boolean;
  };
  readonly evidence: DerivativeVenueAccountEvidence | null;
  readonly safety: {
    readonly signedGetOnly: true;
    readonly endpoints: readonly [
      "GET /fapi/v3/balance",
      "GET /fapi/v3/positionRisk",
    ];
    readonly credentialValuesExposed: false;
    readonly orderSubmissionAllowed: false;
    readonly transferAllowed: false;
    readonly withdrawalAllowed: false;
    readonly paperAuthorityChanged: false;
    readonly liveExecutionAllowed: false;
  };
}
