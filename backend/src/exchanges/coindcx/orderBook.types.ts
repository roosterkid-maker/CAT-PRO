export type CoinDCXOrderBookSide =
  Record<string, string | number>;

export interface CoinDCXOrderBookPayload {
  ts?: number;
  E?: number;
  vs?: number;

  pr?: string;
  s?: string;

  asks?: CoinDCXOrderBookSide;
  bids?: CoinDCXOrderBookSide;
}

export interface CoinDCXOrderBookResponse {
  data?:
    | string
    | CoinDCXOrderBookPayload;
}