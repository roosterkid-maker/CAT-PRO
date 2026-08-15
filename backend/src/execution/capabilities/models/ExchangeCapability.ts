export type ExchangeTradingProduct =
  | "spot"
  | "margin"
  | "futures";

export type ExchangeOrderType =
  | "market"
  | "limit";

export type ExchangeTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK";

export interface ExchangeOrderCapabilities {
  supportedOrderTypes:
    readonly ExchangeOrderType[];

  supportedTimeInForce:
    readonly ExchangeTimeInForce[];

  supportsPostOnly: boolean;

  supportsClientOrderId: boolean;

  supportsOrderCancellation: boolean;

  supportsOrderStatusPolling: boolean;
}

export interface ExchangePriceRules {
  minimumPrice: number | null;

  maximumPrice: number | null;

  priceStep: number | null;

  pricePrecision: number | null;
}

export interface ExchangeQuantityRules {
  minimumQuantity: number | null;

  maximumQuantity: number | null;

  quantityStep: number | null;

  quantityPrecision: number | null;
}

export interface ExchangeNotionalRules {
  minimumNotional: number | null;

  maximumNotional: number | null;
}

export interface ExchangeFeeCapability {
  makerFeeRate: number | null;

  takerFeeRate: number | null;

  feeAsset: string | null;
}

export interface ExchangeMarketCapability {
  exchange: string;

  market: string;

  baseAsset: string;

  quoteAsset: string;

  product: ExchangeTradingProduct;

  tradingEnabled: boolean;

  maintenanceMode: boolean;

  order:
    ExchangeOrderCapabilities;

  price:
    ExchangePriceRules;

  quantity:
    ExchangeQuantityRules;

  notional:
    ExchangeNotionalRules;

  fees:
    ExchangeFeeCapability;

  sourceUpdatedAt: number | null;

  synchronizedAt: number;
}

export function createExchangeCapabilityKey(
  exchange: string,
  market: string,
  product: ExchangeTradingProduct = "spot",
): string {
  const normalizedExchange =
    exchange
      .trim()
      .toLowerCase();

  const normalizedMarket =
    canonicalizeExchangeCapabilityMarket(
      market,
    );

  if (!normalizedExchange) {
    throw new Error(
      "Exchange capability key requires an exchange.",
    );
  }

  if (!normalizedMarket) {
    throw new Error(
      "Exchange capability key requires a market.",
    );
  }

  return `${normalizedExchange}:${product}:${normalizedMarket}`;
}

/**
 * Exchange APIs use several spellings for the same spot market
 * (for example USDC_INR, USDC-INR and USDCINR). Capability storage
 * keeps the venue spelling for audit output, while identity checks
 * use this separator-insensitive representation.
 */
export function canonicalizeExchangeCapabilityMarket(
  market: string,
): string {
  return market
    .trim()
    .toUpperCase()
    .replace(
      /[\s_\-/]+/g,
      "",
    );
}
