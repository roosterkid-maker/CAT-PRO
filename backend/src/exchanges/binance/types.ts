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