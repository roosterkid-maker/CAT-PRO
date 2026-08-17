export type DerivativeFundingSettlementPriceQuality =
  | "EXACT_EXCHANGE_ASSOCIATED_MARK_PRICE"
  | "BOUNDED_PUBLIC_MARK_KLINE_PROXY";

export interface DerivativeFundingSettlementEvidence {
  readonly version: "56.0";
  readonly id: string;
  readonly exchange: string;
  readonly market: string;
  readonly settlementAsset: string;
  readonly fundingTime: number;
  readonly fundingRate: number;
  readonly markPrice: number;
  readonly rateSource: "PUBLIC_SETTLED_FUNDING_RATE_HISTORY";
  readonly priceSource:
    | "FUNDING_HISTORY_ASSOCIATED_MARK_PRICE"
    | "ONE_MINUTE_MARK_PRICE_KLINE_OPEN";
  readonly priceQuality: DerivativeFundingSettlementPriceQuality;
  readonly observedAt: number;
  readonly paymentFormula: "NEGATIVE_SIGNED_QUANTITY_X_MARK_PRICE_X_FUNDING_RATE";
  readonly accountTransactionEvidenceUsed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface DerivativeFundingSettlementProviderStatus {
  readonly exchange: string;
  readonly state: "NO_DATA" | "READY" | "DEGRADED";
  readonly lastAttemptAt: number | null;
  readonly lastSuccessAt: number | null;
  readonly evidenceCount: number;
  readonly lastError: string | null;
}

export interface DerivativeFundingSettlementSnapshot {
  readonly version: "56.0";
  readonly generatedAt: number;
  readonly mode: "PUBLIC_SETTLED_FUNDING_PAPER_EVIDENCE";
  readonly retentionMs: number;
  readonly evidence: readonly DerivativeFundingSettlementEvidence[];
  readonly providers: readonly DerivativeFundingSettlementProviderStatus[];
  readonly summary: {
    readonly evidence: number;
    readonly exactExchangeMarkPrices: number;
    readonly boundedMarkPriceProxies: number;
    readonly readyProviders: number;
  };
  readonly safety: {
    readonly publicReadOnly: true;
    readonly accountTransactionsAttributedToPaperPositions: false;
    readonly proxyEvidenceLabeled: true;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}
