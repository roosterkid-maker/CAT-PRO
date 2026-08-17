import type {
  DerivativeMarketEvidence,
  DerivativeVenuePublicSnapshot,
} from "../models/DerivativeMarketEvidence";

import type {
  DerivativePublicProvider,
} from "./DerivativePublicProvider";

interface BybitInstrument {
  symbol?: string;
  contractType?: string;
  status?: string;
  baseCoin?: string;
  quoteCoin?: string;
  settleCoin?: string;
  fundingInterval?: number;
  leverageFilter?: {
    maxLeverage?: string;
  };
  priceFilter?: {
    tickSize?: string;
  };
  lotSizeFilter?: {
    minOrderQty?: string;
    maxMktOrderQty?: string;
    qtyStep?: string;
    minNotionalValue?: string;
  };
}

interface BybitTicker {
  symbol?: string;
  bid1Price?: string;
  bid1Size?: string;
  ask1Price?: string;
  ask1Size?: string;
  markPrice?: string;
  indexPrice?: string;
  fundingRate?: string;
  nextFundingTime?: string;
  openInterest?: string;
}

interface BybitResponse<T> {
  retCode?: number;
  retMsg?: string;
  time?: number;
  result?: {
    list?: T[];
    nextPageCursor?: string;
  };
}

const BASE_URL = "https://api.bybit.com";
const METADATA_TTL_MS = 15 * 60 * 1_000;

export class BybitLinearPerpetualPublicProvider
implements DerivativePublicProvider {
  readonly exchange = "bybit";

  private metadata: BybitInstrument[] = [];
  private metadataLoadedAt = 0;

  async fetchSnapshot(now = Date.now()): Promise<DerivativeVenuePublicSnapshot> {
    const metadataPromise =
      this.metadata.length === 0 || now - this.metadataLoadedAt >= METADATA_TTL_MS
        ? this.loadMetadata(now)
        : Promise.resolve(this.metadata);

    const [instruments, tickerResponse] = await Promise.all([
      metadataPromise,
      this.fetchJson<BybitResponse<BybitTicker>>(
        "/v5/market/tickers?category=linear",
      ),
    ]);

    if (
      tickerResponse.retCode !== 0 ||
      !Array.isArray(tickerResponse.result?.list)
    ) {
      throw new Error(`Bybit linear tickers failed: ${tickerResponse.retMsg ?? "invalid response"}.`);
    }

    const sourceTimestamp =
      this.positiveInteger(tickerResponse.time) ?? now;
    const tickerBySymbol = new Map(
      tickerResponse.result.list.map((item) => [this.symbol(item.symbol), item]),
    );
    const markets: DerivativeMarketEvidence[] = [];

    for (const instrument of instruments) {
      const market = this.symbol(instrument.symbol);

      if (
        !market ||
        instrument.contractType !== "LinearPerpetual" ||
        instrument.status !== "Trading"
      ) {
        continue;
      }

      const ticker = tickerBySymbol.get(market);

      if (!ticker) {
        continue;
      }

      const normalized = this.market(instrument, ticker, sourceTimestamp, now);

      if (normalized) {
        markets.push(normalized);
      }
    }

    if (markets.length === 0) {
      throw new Error("Bybit returned no complete linear perpetual market evidence.");
    }

    return {
      exchange: this.exchange,
      generatedAt: now,
      markets,
    };
  }

  private async loadMetadata(now: number): Promise<BybitInstrument[]> {
    const all: BybitInstrument[] = [];
    let cursor = "";

    for (let page = 0; page < 5; page += 1) {
      const query = cursor
        ? `&cursor=${encodeURIComponent(cursor)}`
        : "";
      const response = await this.fetchJson<BybitResponse<BybitInstrument>>(
        `/v5/market/instruments-info?category=linear&limit=1000${query}`,
      );

      if (response.retCode !== 0 || !Array.isArray(response.result?.list)) {
        throw new Error(`Bybit linear instruments failed: ${response.retMsg ?? "invalid response"}.`);
      }

      all.push(...response.result.list);
      cursor = response.result.nextPageCursor?.trim() ?? "";

      if (!cursor) {
        break;
      }
    }

    if (all.length === 0) {
      throw new Error("Bybit returned no linear instruments.");
    }

    this.metadata = structuredClone(all);
    this.metadataLoadedAt = now;
    return this.metadata;
  }

  private market(
    instrument: BybitInstrument,
    ticker: BybitTicker,
    sourceTimestamp: number,
    observedAt: number,
  ): DerivativeMarketEvidence | null {
    const market = this.symbol(instrument.symbol);
    const baseAsset = this.symbol(instrument.baseCoin);
    const quoteAsset = this.symbol(instrument.quoteCoin);
    const settleAsset = this.symbol(instrument.settleCoin);
    const numbers = {
      bidPrice: Number(ticker.bid1Price),
      bidQuantity: Number(ticker.bid1Size),
      askPrice: Number(ticker.ask1Price),
      askQuantity: Number(ticker.ask1Size),
      markPrice: Number(ticker.markPrice),
      indexPrice: Number(ticker.indexPrice),
      fundingRate: Number(ticker.fundingRate),
      nextFundingTime: Number(ticker.nextFundingTime),
      fundingIntervalMinutes: Number(instrument.fundingInterval),
      openInterest: Number(ticker.openInterest),
      priceStep: Number(instrument.priceFilter?.tickSize),
      quantityStep: Number(instrument.lotSizeFilter?.qtyStep),
      minimumQuantity: Number(instrument.lotSizeFilter?.minOrderQty),
      maximumMarketQuantity: Number(instrument.lotSizeFilter?.maxMktOrderQty),
      minimumNotional: Number(instrument.lotSizeFilter?.minNotionalValue),
      maximumLeverage: Number(instrument.leverageFilter?.maxLeverage),
    };

    if (
      !market || !baseAsset || !quoteAsset || !settleAsset ||
      !this.allPositive([
        numbers.bidPrice, numbers.bidQuantity, numbers.askPrice, numbers.askQuantity,
        numbers.markPrice, numbers.indexPrice, numbers.nextFundingTime,
        numbers.fundingIntervalMinutes, numbers.priceStep, numbers.quantityStep,
        numbers.minimumQuantity, numbers.maximumMarketQuantity,
        numbers.minimumNotional, numbers.maximumLeverage,
      ]) ||
      !Number.isFinite(numbers.fundingRate) ||
      numbers.bidPrice >= numbers.askPrice
    ) {
      return null;
    }

    return {
      exchange: this.exchange,
      market,
      baseAsset,
      quoteAsset,
      settleAsset,
      product: "LINEAR_PERPETUAL",
      tradingEnabled: true,
      bidPrice: numbers.bidPrice,
      bidQuantity: numbers.bidQuantity,
      askPrice: numbers.askPrice,
      askQuantity: numbers.askQuantity,
      markPrice: numbers.markPrice,
      indexPrice: numbers.indexPrice,
      fundingRate: numbers.fundingRate,
      nextFundingTime: numbers.nextFundingTime,
      fundingIntervalMinutes: numbers.fundingIntervalMinutes,
      openInterest:
        Number.isFinite(numbers.openInterest) && numbers.openInterest >= 0
          ? numbers.openInterest
          : null,
      rules: {
        priceStep: numbers.priceStep,
        quantityStep: numbers.quantityStep,
        minimumQuantity: numbers.minimumQuantity,
        maximumMarketQuantity: numbers.maximumMarketQuantity,
        minimumNotional: numbers.minimumNotional,
        maximumLeverage: numbers.maximumLeverage,
      },
      sourceTimestamp,
      observedAt,
      sources: {
        instrument: "PUBLIC_REST",
        ticker: "PUBLIC_REST",
        position: "NO_DATA",
        margin: "NO_DATA",
        liquidation: "NO_DATA",
      },
      execution: {
        derivativeAdapterRegistered: false,
        authenticatedReadVerified: false,
        reduceOnlyVerified: false,
        orderSubmissionAllowed: false,
        liveExecutionAllowed: false,
      },
    };
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error(`Bybit linear ${path} failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  }

  private symbol(value: unknown): string {
    return typeof value === "string"
      ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
      : "";
  }

  private positiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private allPositive(values: readonly number[]): boolean {
    return values.every((value) => Number.isFinite(value) && value > 0);
  }
}
