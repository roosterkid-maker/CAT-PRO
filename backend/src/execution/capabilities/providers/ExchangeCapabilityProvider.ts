import type {
  ExchangeMarketCapability,
  ExchangeTradingProduct,
} from "../models/ExchangeCapability";

export interface ExchangeCapabilityQuery {
  product?: ExchangeTradingProduct;

  markets?: readonly string[];

  forceRefresh?: boolean;
}

export interface ExchangeCapabilityProvider {
  /**
   * Exchange identifier.
   *
   * Example:
   * coindcx
   * binance
   * bybit
   */
  readonly exchange: string;

  /**
   * Returns every supported market capability
   * normalized into the common model.
   */
  getCapabilities(
    query?: ExchangeCapabilityQuery,
  ): Promise<
    readonly ExchangeMarketCapability[]
  >;

  /**
   * Returns a single market capability.
   */
  getCapability(
    market: string,
    product?: ExchangeTradingProduct,
  ): Promise<
    ExchangeMarketCapability | null
  >;

  /**
   * Clears any provider cache.
   */
  invalidateCache(): void;

  /**
   * Last successful synchronization timestamp.
   */
  getLastSynchronizationTime():
    number | null;

  /**
   * Whether cached capabilities are currently available.
   */
  isSynchronized(): boolean;
}