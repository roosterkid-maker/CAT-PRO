export type LiveOrderSide =
  | "buy"
  | "sell";

export type LiveOrderType =
  | "limit"
  | "market";

export interface LiveExecutionRequest {
  exchange: string;

  /** Defaults to SPOT for legacy callers. PERPETUAL must be explicit. */
  product?: "SPOT" | "PERPETUAL";

  market: string;

  side: LiveOrderSide;

  orderType: LiveOrderType;

  /**
   * Requires maker-only exchange semantics. Adapters must reject this flag
   * before any signed request unless the venue has an audited post-only map.
   */
  postOnly?: boolean;

  /** Required explicitly for every PERPETUAL request. */
  reduceOnly?: boolean;

  /** Required for PERPETUAL requests; never inferred from venue defaults. */
  positionMode?: "ONE_WAY" | "HEDGE";

  /** Economic exposure side. Venue-specific BOTH/positionIdx mapping is adapter-owned. */
  positionSide?: "LONG" | "SHORT";

  quantity: number;

  price?: number;

  clientOrderId?: string;

  timeoutMs?: number;

  pollingIntervalMs?: number;

  cancelOnTimeout?: boolean;
}
