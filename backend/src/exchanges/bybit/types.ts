export interface BybitTickerData {
  symbol?: string;

  lastPrice?: string;

  bid1Price?: string;
  ask1Price?: string;

  timestamp?: number;
}

export interface BybitTickerMessage {
  topic?: string;

  type?: "snapshot" | "delta";

  ts?: number;

  data?: BybitTickerData;
}

export interface BybitSubscriptionResponse {
  success?: boolean;

  ret_msg?: string;

  conn_id?: string;

  op?: string;
}