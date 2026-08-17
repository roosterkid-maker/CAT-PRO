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
