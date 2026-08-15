export interface BinanceBookTicker {
  u: number;
  s: string;

  b: string;
  B: string;

  a: string;
  A: string;
}

export interface BinanceCombinedStreamMessage {
  stream: string;
  data: BinanceBookTicker;
}

export interface BinanceSubscriptionResponse {
  result: null;
  id: number;
}

export interface BinanceExchangeSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
}

export interface BinanceExchangeInfoResponse {
  symbols: BinanceExchangeSymbol[];
}

export interface BinanceTicker24Hour {
  symbol: string;

  volume: string;

  quoteVolume: string;
}

export type BinanceDepthLevel = [
  string,
  string,
];

export interface BinancePartialDepth {
  lastUpdateId: number;

  bids: BinanceDepthLevel[];

  asks: BinanceDepthLevel[];
}

export interface BinanceCombinedDepthMessage {
  stream: string;

  data: BinancePartialDepth;
}

export interface BinanceAggregateTrade {
  e:
    "aggTrade";

  s:
    string;

  a:
    number;

  p:
    string;

  q:
    string;

  T:
    number;

  m:
    boolean;
}

export interface BinanceCombinedAggregateTradeMessage {
  stream:
    string;

  data:
    BinanceAggregateTrade;
}
