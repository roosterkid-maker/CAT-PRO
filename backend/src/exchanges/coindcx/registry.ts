import type { LoadedCoinDCXMarket } from "./marketLoader";

 export interface MarketInfo {
  symbol: string;
  pair: string;

  base: string;
  quote: string;

  minimumQuantity: number;
  maximumQuantity: number | null;

  minimumPrice: number;
  maximumPrice: number | null;

  minimumNotional: number;

  quantityStep: number;

  quantityPrecision: number;

  pricePrecision: number;

  orderTypes: string[];
}

class MarketRegistry {
  private readonly markets =
    new Map<string, MarketInfo>();

  private readonly pairs =
    new Map<string, MarketInfo>();

  register(
    market: LoadedCoinDCXMarket,
  ): void {
    const symbol =
      market.symbol.trim().toUpperCase();

    const pair =
      market.pair.trim().toUpperCase();

    const base =
      market.baseCurrency
        .trim()
        .toUpperCase();

    const quote =
      market.quoteCurrency
        .trim()
        .toUpperCase();

    if (
      !symbol ||
      !pair ||
      !base ||
      !quote
    ) {
      return;
    }

      const marketInfo: MarketInfo = {
  symbol,
  pair,

  base,
  quote,

  minimumQuantity:
    market.minimumQuantity,

  maximumQuantity:
    market.maximumQuantity,

  minimumPrice:
    market.minimumPrice,

  maximumPrice:
    market.maximumPrice,

  minimumNotional:
    market.minimumNotional,

  quantityStep:
    market.quantityStep,

  quantityPrecision:
    market.quantityPrecision,

  pricePrecision:
    market.pricePrecision,

  orderTypes:
    market.orderTypes,
};

    this.markets.set(
      symbol,
      marketInfo,
    );

    this.pairs.set(
      pair,
      marketInfo,
    );
  }

  registerMany(
    markets: LoadedCoinDCXMarket[],
  ): void {
    for (const market of markets) {
      this.register(market);
    }
  }

  get(
    symbol: string,
  ): MarketInfo | undefined {
    return this.markets.get(
      symbol.trim().toUpperCase(),
    );
  }

  getByPair(
    pair: string,
  ): MarketInfo | undefined {
    return this.pairs.get(
      pair.trim().toUpperCase(),
    );
  }

  getAll(): MarketInfo[] {
    return Array.from(
      this.markets.values(),
    );
  }

  getByQuote(
    quoteCurrency: string,
  ): MarketInfo[] {
    const normalizedQuote =
      quoteCurrency
        .trim()
        .toUpperCase();

    return this.getAll().filter(
      (market) =>
        market.quote ===
        normalizedQuote,
    );
  }

  has(
    symbol: string,
  ): boolean {
    return this.markets.has(
      symbol.trim().toUpperCase(),
    );
  }

  size(): number {
    return this.markets.size;
  }

  clear(): void {
    this.markets.clear();
    this.pairs.clear();
  }
}

export const marketRegistry =
  new MarketRegistry();