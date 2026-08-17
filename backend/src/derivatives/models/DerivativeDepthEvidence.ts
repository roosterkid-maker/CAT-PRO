import type {
  OrderBookLevel,
} from "../../orderbook/models/OrderBookLevel";

export interface DerivativeDepthEvidence {
  readonly exchange: string;
  readonly market: string;
  readonly product: "LINEAR_PERPETUAL";
  readonly bids: readonly OrderBookLevel[];
  readonly asks: readonly OrderBookLevel[];
  readonly sourceTimestamp: number;
  readonly observedAt: number;
  readonly source: "PUBLIC_REST_FULL_DEPTH";
  readonly executionAuthorized: false;
  readonly orderSubmissionAllowed: false;
}

export interface DerivativeDepthVenueResult {
  readonly exchange: string;
  readonly generatedAt: number;
  readonly books: readonly DerivativeDepthEvidence[];
}

export interface DerivativeDepthProviderStatus {
  readonly exchange: string;
  readonly state: "READY" | "DEGRADED" | "NO_DATA";
  readonly configuredMarkets: number;
  readonly retainedBooks: number;
  readonly freshBooks: number;
  readonly lastAttemptAt: number | null;
  readonly lastSuccessAt: number | null;
  readonly lastError: string | null;
}

export interface DerivativeDepthSnapshot {
  readonly generatedAt: number;
  readonly version: "27.0";
  readonly mode: "BOUNDED_PUBLIC_FULL_DEPTH";
  readonly freshnessThresholdMs: number;
  readonly configuredMarkets: readonly string[];
  readonly providers: readonly DerivativeDepthProviderStatus[];
  readonly books: readonly DerivativeDepthEvidence[];
  readonly summary: {
    readonly providerCount: number;
    readonly readyProviders: number;
    readonly retainedBooks: number;
    readonly freshBooks: number;
  };
  readonly safety: {
    readonly boundedAllowlistOnly: true;
    readonly publicReadOnly: true;
    readonly accountReadAllowed: false;
    readonly paperExecutionAllowed: false;
    readonly liveExecutionAllowed: false;
    readonly orderSubmissionAllowed: false;
  };
}
