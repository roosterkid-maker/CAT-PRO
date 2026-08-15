export type CoinDCXOrderBookSide =
  Record<string, string | number>;

export interface CoinDCXOrderBookPayload {
  /* Source timestamps / event time documented by CoinDCX. */
  ts?: number;
  E?: number;

  /*
   * CoinDCX documents `vs` as a version, but does not
   * document it as a monotonic update sequence. It is
   * retained as evidence and is not invented into one.
   */
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
