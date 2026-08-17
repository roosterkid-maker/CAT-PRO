export interface UnoCoinPair {
  ticker_id?: unknown;

  base?: unknown;

  target?: unknown;
}

export interface UnoCoinTicker {
  ticker_id?: unknown;

  base_currency?: unknown;

  target_currency?: unknown;

  last_price?: unknown;

  base_volume?: unknown;

  target_volume?: unknown;

  bid?: unknown;

  ask?: unknown;

  high?: unknown;

  low?: unknown;
}

export type UnoCoinOrderBookLevel =
  readonly [unknown, unknown];

export interface UnoCoinOrderBook {
  ticker_id?: unknown;

  timestamp?: unknown;

  bids?: unknown;

  asks?: unknown;
}

export interface UnoCoinAssetOrder {
  coin?: unknown;

  base_coin?: unknown;

  order_type?: unknown;

  rate?: unknown;

  volume?: unknown;
}

export interface UnoCoinAssetOrderPage {
  data?: unknown;
}

export interface UnoCoinAssetOrderBook {
  bids?: unknown;

  asks?: unknown;
}

export interface UnoCoinBaseCoinSetting {
  maker_fee?: unknown;

  taker_fee?: unknown;

  tax?: unknown;

  min_bid_amount?: unknown;

  min_ask_amount?: unknown;

  max_bid_amount?: unknown;

  max_ask_amount?: unknown;

  min_volume?: unknown;

  limit_24_hr?: unknown;
}

export type UnoCoinBaseCoinSettings =
  Record<
    string,
    UnoCoinBaseCoinSetting
  >;
