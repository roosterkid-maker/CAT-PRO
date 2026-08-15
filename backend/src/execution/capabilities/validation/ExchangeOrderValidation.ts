import type {
  ExchangeMarketCapability,
  ExchangeOrderType,
  ExchangeTimeInForce,
  ExchangeTradingProduct,
} from "../models/ExchangeCapability";

export type ExchangeOrderSide =
  | "buy"
  | "sell";

export interface ExchangeOrderValidationRequest {
  exchange: string;

  market: string;

  product?: ExchangeTradingProduct;

  side: ExchangeOrderSide;

  orderType: ExchangeOrderType;

  timeInForce?: ExchangeTimeInForce;

  quantity: number;

  price?: number;

  capability:
    ExchangeMarketCapability;

  validationMode?:
    | "EXCHANGE_ORDER"
    | "ISOLATED_PAPER_SIMULATION";
}

export interface NormalizedExchangeOrder {
  exchange: string;

  market: string;

  product:
    ExchangeTradingProduct;

  side:
    ExchangeOrderSide;

  orderType:
    ExchangeOrderType;

  timeInForce:
    ExchangeTimeInForce | null;

  quantity: number;

  price: number | null;

  notional: number | null;
}

export type ExchangeOrderValidationCode =
  | "INVALID_EXCHANGE"
  | "INVALID_MARKET"
  | "CAPABILITY_MISMATCH"
  | "TRADING_DISABLED"
  | "MAINTENANCE_MODE"
  | "UNSUPPORTED_ORDER_TYPE"
  | "UNSUPPORTED_TIME_IN_FORCE"
  | "PRICE_REQUIRED"
  | "PRICE_NOT_ALLOWED"
  | "INVALID_PRICE"
  | "PRICE_BELOW_MINIMUM"
  | "PRICE_ABOVE_MAXIMUM"
  | "PRICE_STEP_MISMATCH"
  | "PRICE_PRECISION_EXCEEDED"
  | "INVALID_QUANTITY"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_ABOVE_MAXIMUM"
  | "QUANTITY_STEP_MISMATCH"
  | "QUANTITY_PRECISION_EXCEEDED"
  | "NOTIONAL_BELOW_MINIMUM"
  | "NOTIONAL_ABOVE_MAXIMUM"
  | "CAPABILITY_DATA_INVALID";

export interface ExchangeOrderValidationIssue {
  code:
    ExchangeOrderValidationCode;

  field:
    | "exchange"
    | "market"
    | "product"
    | "orderType"
    | "timeInForce"
    | "price"
    | "quantity"
    | "notional"
    | "capability";

  message: string;
}

export interface ExchangeOrderValidationResult {
  valid: boolean;

  normalizedOrder:
    NormalizedExchangeOrder | null;

  issues:
    readonly ExchangeOrderValidationIssue[];

  reasons:
    readonly string[];
}

export function createExchangeOrderValidationResult(
  normalizedOrder:
    NormalizedExchangeOrder | null,

  issues:
    readonly ExchangeOrderValidationIssue[],
): ExchangeOrderValidationResult {
  const clonedIssues =
    issues.map(
      (issue) => ({
        ...issue,
      }),
    );

  return {
    valid:
      clonedIssues.length === 0 &&
      normalizedOrder !== null,

    normalizedOrder:
      normalizedOrder
        ? {
            ...normalizedOrder,
          }
        : null,

    issues:
      clonedIssues,

    reasons:
      clonedIssues.map(
        (issue) =>
          issue.message,
      ),
  };
}
