export type OrderSide =
  | "BUY"
  | "SELL";

export type OrderType =
  | "LIMIT"
  | "MARKET";

export interface Balance {
  asset: string;

  available: number;

  locked: number;
}

export interface PlaceOrderRequest {
  market: string;

  side: OrderSide;

  type: OrderType;

  quantity: number;

  price?: number;
}

export interface OrderResult {
  orderId: string;

  exchange: string;

  market: string;

  side: OrderSide;

  quantity: number;

  filledQuantity: number;

  averagePrice: number;

  status:
    | "NEW"
    | "PARTIALLY_FILLED"
    | "FILLED"
    | "CANCELLED"
    | "REJECTED";
}

export interface IExchangeTrading {
  getBalances(): Promise<Balance[]>;

  placeOrder(
    request: PlaceOrderRequest,
  ): Promise<OrderResult>;

  cancelOrder(
    orderId: string,
  ): Promise<boolean>;

  getOrder(
    orderId: string,
  ): Promise<OrderResult>;

  getOpenOrders(): Promise<
    OrderResult[]
  >;
}