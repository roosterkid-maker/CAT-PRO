export interface CoinDCXJoinPayload {
  channelName: string;
}

export interface CoinDCXSocketResponse<T> {
  data: T;
}

export interface CoinDCXPriceUpdate {
  market?: string;
  symbol?: string;
  pair?: string;

  price?: string | number;
  last_price?: string | number;

  bid?: string | number;
  ask?: string | number;

  bid_qty?: string | number;
  ask_qty?: string | number;

  timestamp?: number;
}

export interface NormalizedTicker {
  exchange: string;

  market: string;

  lastPrice: number;

  /**
   * Backward-compatible executable prices.
   * Existing comparison and UI code currently use these fields.
   */
  bid: number | null;
  ask: number | null;

  /**
   * Best executable order-book prices.
   */
  bestBidPrice: number | null;
  bestBidQty: number | null;

  bestAskPrice: number | null;
  bestAskQty: number | null;

  /**
   * Absolute spread:
   * bestAskPrice - bestBidPrice
   */
  spread: number | null;

  timestamp: number;
}