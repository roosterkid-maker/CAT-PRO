export type DerivativeProduct = "LINEAR_PERPETUAL";

export interface DerivativeMarketEvidence {
  readonly exchange: string;
  readonly market: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly settleAsset: string;
  readonly product: DerivativeProduct;
  readonly tradingEnabled: boolean;
  readonly bidPrice: number;
  readonly bidQuantity: number;
  readonly askPrice: number;
  readonly askQuantity: number;
  readonly markPrice: number;
  readonly indexPrice: number;
  readonly fundingRate: number;
  readonly nextFundingTime: number;
  readonly fundingIntervalMinutes: number;
  /** Missing funding is explicit and fail-closed; zero is never fabricated. */
  readonly fundingEvidence?: "EXCHANGE_REPORTED" | "UNAVAILABLE";
  readonly openInterest: number | null;
  readonly fees?: {
    readonly makerPercent: number;
    readonly takerPercent: number;
    readonly source: "PUBLIC_INSTRUMENT_RULES";
  };
  readonly rules: {
    readonly priceStep: number;
    readonly quantityStep: number;
    readonly minimumQuantity: number;
    readonly maximumMarketQuantity: number;
    readonly minimumNotional: number;
    readonly maximumLeverage: number | null;
  };
  readonly sourceTimestamp: number;
  readonly rawSourceTimestamp?: number;
  readonly sourceClockOffsetMs?: number;
  readonly sourceTimestampNormalization?: "NONE" | "BOUNDED_FUTURE_CLOCK_SKEW";
  readonly observedAt: number;
  readonly sources: {
    readonly instrument: "PUBLIC_REST";
    readonly ticker: "PUBLIC_REST";
    readonly position: "NO_DATA";
    readonly margin: "NO_DATA";
    readonly liquidation: "NO_DATA";
  };
  readonly execution: {
    readonly derivativeAdapterRegistered: false;
    readonly authenticatedReadVerified: false;
    readonly reduceOnlyVerified: false;
    readonly orderSubmissionAllowed: false;
    readonly liveExecutionAllowed: false;
  };
}

export interface DerivativeVenuePublicSnapshot {
  readonly exchange: string;
  readonly generatedAt: number;
  readonly markets: readonly DerivativeMarketEvidence[];
}

export interface DerivativeProviderStatus {
  readonly exchange: string;
  readonly state: "READY" | "DEGRADED" | "NO_DATA";
  readonly lastAttemptAt: number | null;
  readonly lastSuccessAt: number | null;
  readonly marketCount: number;
  readonly freshMarketCount: number;
  readonly lastError: string | null;
}

export interface DerivativeMarketDataSnapshot {
  readonly generatedAt: number;
  readonly version: "26.0";
  readonly mode: "PUBLIC_READ_ONLY_DERIVATIVES_FOUNDATION";
  readonly freshnessThresholdMs: number;
  readonly summary: {
    readonly providers: number;
    readonly readyProviders: number;
    readonly markets: number;
    readonly freshMarkets: number;
    readonly exchanges: number;
    readonly positionEvidenceMarkets: 0;
    readonly marginEvidenceMarkets: 0;
    readonly derivativeExecutionAdapters: 0;
  };
  readonly providers: readonly DerivativeProviderStatus[];
  readonly markets: readonly DerivativeMarketEvidence[];
  readonly safety: {
    readonly publicReadOnly: true;
    readonly topOfBookOnly: true;
    readonly fullDepthAvailable: false;
    readonly positionStateAvailable: false;
    readonly marginStateAvailable: false;
    readonly liquidationControlAvailable: false;
    readonly reduceOnlyVerified: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}
