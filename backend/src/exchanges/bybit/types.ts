export interface BybitTickerData {
  symbol?: string;

  lastPrice?: string;

  bid1Price?: string;
  bid1Size?: string;

  ask1Price?: string;
  ask1Size?: string;

  highPrice24h?: string;
  lowPrice24h?: string;

  turnover24h?: string;
  volume24h?: string;

  timestamp?: number;
}

export interface BybitTickerMessage {
  topic:
    string;

  type?:
    | "snapshot"
    | "delta";

  ts?:
    number;

  data?:
    BybitTickerData;
}

export type BybitOrderBookLevel =
  readonly [
    price:
      string,
    quantity:
      string,
  ];

export interface BybitOrderBookData {
  s:
    string;

  b:
    BybitOrderBookLevel[];

  a:
    BybitOrderBookLevel[];

  u?:
    number;

  seq?:
    number;
}

export interface BybitOrderBookMessage {
  topic:
    string;

  type:
    | "snapshot"
    | "delta";

  ts?:
    number;

  cts?:
    number;

  data:
    BybitOrderBookData;
}

export interface BybitSubscriptionResponse {
  success?:
    boolean;

  ret_msg?:
    string;

  conn_id?:
    string;

  op?:
    string;

  req_id?:
    string;
}

export interface BybitPublicTradeData {
  T:
    number;

  s:
    string;

  S:
    "Buy"
    | "Sell";

  v:
    string;

  p:
    string;

  i:
    string;
}

export interface BybitPublicTradeMessage {
  topic:
    string;

  type?:
    "snapshot";

  ts?:
    number;

  data:
    BybitPublicTradeData[];
}
