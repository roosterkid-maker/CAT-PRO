import { tickerToExecutableQuote } from "../core/mappers/tickerMapper";
import type { ExecutableQuote } from "../core/models/ExecutableQuote";
import type { NormalizedTicker } from "../exchanges/coindcx/types";
import { getIO } from "../socket/server";

type MarketCacheInput =
  | NormalizedTicker
  | ExecutableQuote;

class MarketCache {
  private readonly markets =
    new Map<string, ExecutableQuote>();

  update(input: MarketCacheInput): void {
    const quote =
      this.isExecutableQuote(input)
        ? this.normalizeExecutableQuote(input)
        : this.normalizeExecutableQuote(
            tickerToExecutableQuote(input),
          );

    if (!quote) {
      return;
    }

    const key = this.createKey(
      quote.exchange,
      quote.market,
    );

    const previousQuote =
      this.markets.get(key);

    const mergedQuote =
      this.mergeQuotes(
        previousQuote,
        quote,
      );

    this.markets.set(
      key,
      mergedQuote,
    );

    try {
      getIO().emit(
        "ticker",
        mergedQuote,
      );
    } catch {
      // Socket server may not be initialized yet.
    }
  }

  get(
    exchange: string,
    market: string,
  ): ExecutableQuote | undefined {
    return this.markets.get(
      this.createKey(
        exchange,
        market,
      ),
    );
  }

  getAll(): ExecutableQuote[] {
    return Array.from(
      this.markets.values(),
    );
  }

  getByExchange(
    exchange: string,
  ): ExecutableQuote[] {
    const normalizedExchange =
      exchange.trim().toLowerCase();

    return this.getAll().filter(
      (quote) =>
        quote.exchange ===
        normalizedExchange,
    );
  }

  getExecutable(): ExecutableQuote[] {
    return this.getAll().filter(
      (quote) => quote.executable,
    );
  }

  getExecutableByExchange(
    exchange: string,
  ): ExecutableQuote[] {
    return this.getByExchange(
      exchange,
    ).filter(
      (quote) => quote.executable,
    );
  }

  size(): number {
    return this.markets.size;
  }

  sizeByExchange(
    exchange: string,
  ): number {
    return this.getByExchange(
      exchange,
    ).length;
  }

  executableSize(): number {
    return this.getExecutable().length;
  }

  clear(): void {
    this.markets.clear();
  }

  private isExecutableQuote(
    input: MarketCacheInput,
  ): input is ExecutableQuote {
    return (
      "source" in input &&
      "executable" in input
    );
  }

  private normalizeExecutableQuote(
    incomingQuote: ExecutableQuote,
  ): ExecutableQuote | null {
    const exchange =
      incomingQuote.exchange
        .trim()
        .toLowerCase();

    const market =
      incomingQuote.market
        .trim()
        .toUpperCase();

    if (!exchange || !market) {
      return null;
    }

    const lastPrice =
      this.getValidPositiveNumber(
        incomingQuote.lastPrice,
      );

    const bestBidPrice =
      this.getValidPositiveNumber(
        incomingQuote.bestBidPrice,
      );

    const bestAskPrice =
      this.getValidPositiveNumber(
        incomingQuote.bestAskPrice,
      );

    const bestBidQty =
      this.getValidNonNegativeNumber(
        incomingQuote.bestBidQty,
      );

    const bestAskQty =
      this.getValidNonNegativeNumber(
        incomingQuote.bestAskQty,
      );

    const timestamp =
      Number.isFinite(
        incomingQuote.timestamp,
      ) &&
      incomingQuote.timestamp > 0
        ? incomingQuote.timestamp
        : Date.now();

    const spread =
      bestBidPrice !== null &&
      bestAskPrice !== null
        ? bestAskPrice -
          bestBidPrice
        : null;

    const executable =
      bestBidPrice !== null &&
      bestAskPrice !== null &&
      bestBidQty !== null &&
      bestAskQty !== null &&
      bestAskPrice >=
        bestBidPrice;

    return {
      exchange,
      market,

      lastPrice,

      bestBidPrice,
      bestBidQty,

      bestAskPrice,
      bestAskQty,

      spread,

      timestamp,

      source:
        incomingQuote.source,

      executable,
    };
  }

  private mergeQuotes(
    previousQuote:
      | ExecutableQuote
      | undefined,
    incomingQuote: ExecutableQuote,
  ): ExecutableQuote {
    if (!previousQuote) {
      return incomingQuote;
    }

    const bestBidPrice =
      incomingQuote.bestBidPrice ??
      previousQuote.bestBidPrice;

    const bestBidQty =
      incomingQuote.bestBidQty ??
      previousQuote.bestBidQty;

    const bestAskPrice =
      incomingQuote.bestAskPrice ??
      previousQuote.bestAskPrice;

    const bestAskQty =
      incomingQuote.bestAskQty ??
      previousQuote.bestAskQty;

    const spread =
      bestBidPrice !== null &&
      bestAskPrice !== null
        ? bestAskPrice -
          bestBidPrice
        : null;

    const executable =
      bestBidPrice !== null &&
      bestAskPrice !== null &&
      bestBidQty !== null &&
      bestAskQty !== null &&
      bestAskPrice >=
        bestBidPrice;

    return {
      exchange:
        incomingQuote.exchange,

      market:
        incomingQuote.market,

      lastPrice:
        incomingQuote.lastPrice ??
        previousQuote.lastPrice,

      bestBidPrice,
      bestBidQty,

      bestAskPrice,
      bestAskQty,

      spread,

      timestamp:
        incomingQuote.timestamp,

      source:
        incomingQuote.source,

      executable,
    };
  }

  private createKey(
    exchange: string,
    market: string,
  ): string {
    return `${exchange
      .trim()
      .toLowerCase()}:${market
      .trim()
      .toUpperCase()}`;
  }

  private getValidPositiveNumber(
    value: number | null,
  ): number | null {
    return value !== null &&
      Number.isFinite(value) &&
      value > 0
      ? value
      : null;
  }

  private getValidNonNegativeNumber(
    value: number | null,
  ): number | null {
    return value !== null &&
      Number.isFinite(value) &&
      value >= 0
      ? value
      : null;
  }
}

export const marketCache =
  new MarketCache();