export interface DerivativeFeeEvidence {
  readonly exchange: string;
  readonly product: "LINEAR_PERPETUAL";
  readonly makerPercent: number;
  readonly takerPercent: number;
  readonly source: "EXPLICIT_OPERATOR_CONFIG" | "PUBLIC_INSTRUMENT_RULES";
  readonly market: string | null;
  readonly configuredAt: number;
  readonly executionAuthorized: false;
  readonly liveExecutionAllowed: false;
}

export interface DerivativeFeeEvidenceSnapshot {
  readonly generatedAt: number;
  readonly version: "27.0";
  readonly evidenceStatus: "AVAILABLE" | "PARTIAL" | "NO_DATA";
  readonly expectedExchanges: readonly string[];
  readonly configuredExchanges: number;
  readonly evidence: readonly DerivativeFeeEvidence[];
  readonly missingExchanges: readonly string[];
  readonly safety: {
    readonly undocumentedDefaultAllowed: false;
    readonly feeInferenceAllowed: false;
    readonly orderSubmissionAllowed: false;
    readonly liveExecutionAllowed: false;
  };
}
