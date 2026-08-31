import type {
  DerivativeMarketEvidence,
  DerivativeVenuePublicSnapshot,
} from "../models/DerivativeMarketEvidence";

import type {
  DerivativePublicProvider,
} from "./DerivativePublicProvider";

import {
  binanceUsdMHttpClient,
  type BinanceUsdMHttpClient,
} from "../../exchanges/binance/api/BinanceUsdMHttpClient";

interface BinanceDerivativeFilter {
  filterType?: string;
  minPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  notional?: string;
}

interface BinanceDerivativeSymbol {
  symbol?: string;
  contractType?: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  marginAsset?: string;
  orderTypes?: string[];
  filters?: BinanceDerivativeFilter[];
}

interface BinanceExchangeInfoResponse {
  symbols?: BinanceDerivativeSymbol[];
}

interface BinancePremiumIndex {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  lastFundingRate?: string;
  nextFundingTime?: number;
  time?: number;
}

interface BinanceBookTicker {
  symbol?: string;
  bidPrice?: string;
  bidQty?: string;
  askPrice?: string;
  askQty?: string;
  time?: number;
}

const METADATA_TTL_MS = 15 * 60 * 1_000;

export class BinanceUsdMPerpetualPublicProvider
implements DerivativePublicProvider {
  readonly exchange = "binance";

  private metadata: BinanceDerivativeSymbol[] = [];
  private metadataLoadedAt = 0;

  constructor(
    private readonly client: BinanceUsdMHttpClient = binanceUsdMHttpClient,
  ) {}

  async fetchSnapshot(now = Date.now()): Promise<DerivativeVenuePublicSnapshot> {
    const metadataPromise =
      this.metadata.length === 0 || now - this.metadataLoadedAt >= METADATA_TTL_MS
        ? this.loadMetadata(now)
        : Promise.resolve(this.metadata);

    const [symbols, premium, books] = await Promise.all([
      metadataPromise,
      this.fetchJson<BinancePremiumIndex[]>("/fapi/v1/premiumIndex"),
      this.fetchJson<BinanceBookTicker[]>("/fapi/v1/ticker/bookTicker"),
    ]);

    if (!Array.isArray(premium) || !Array.isArray(books)) {
      throw new Error("Binance USD-M market response is not an array.");
    }

    const premiumBySymbol = new Map(
      premium.map((item) => [this.symbol(item.symbol), item]),
    );
    const bookBySymbol = new Map(
      books.map((item) => [this.symbol(item.symbol), item]),
    );

    const markets: DerivativeMarketEvidence[] = [];

    for (const instrument of symbols) {
      const market = this.symbol(instrument.symbol);

      if (
        !market ||
        instrument.contractType !== "PERPETUAL" ||
        instrument.status !== "TRADING" ||
        !instrument.orderTypes?.includes("MARKET")
      ) {
        continue;
      }

      const price = premiumBySymbol.get(market);
      const book = bookBySymbol.get(market);

      if (!price || !book) {
        continue;
      }

      const priceFilter = this.filter(instrument, "PRICE_FILTER");
      const lotFilter = this.filter(instrument, "MARKET_LOT_SIZE") ??
        this.filter(instrument, "LOT_SIZE");
      const notionalFilter = this.filter(instrument, "MIN_NOTIONAL");
      const sourceTimestamp = Math.min(
        this.positiveInteger(price.time) ?? now,
        this.positiveInteger(book.time) ?? now,
      );

      const normalized = this.market({
        market,
        baseAsset: instrument.baseAsset,
        quoteAsset: instrument.quoteAsset,
        settleAsset: instrument.marginAsset,
        bidPrice: book.bidPrice,
        bidQuantity: book.bidQty,
        askPrice: book.askPrice,
        askQuantity: book.askQty,
        markPrice: price.markPrice,
        indexPrice: price.indexPrice,
        fundingRate: price.lastFundingRate,
        nextFundingTime: price.nextFundingTime,
        fundingIntervalMinutes: 480,
        priceStep: priceFilter?.tickSize,
        quantityStep: lotFilter?.stepSize,
        minimumQuantity: lotFilter?.minQty,
        maximumMarketQuantity: lotFilter?.maxQty,
        minimumNotional: notionalFilter?.notional,
        maximumLeverage: null,
        openInterest: null,
        sourceTimestamp,
        observedAt: now,
      });

      if (normalized) {
        markets.push(normalized);
      }
    }

    if (markets.length === 0) {
      throw new Error("Binance USD-M returned no complete perpetual market evidence.");
    }

    return {
      exchange: this.exchange,
      generatedAt: now,
      markets,
    };
  }

  private async loadMetadata(now: number): Promise<BinanceDerivativeSymbol[]> {
    const response =
      await this.fetchJson<BinanceExchangeInfoResponse>("/fapi/v1/exchangeInfo");

    if (!Array.isArray(response.symbols)) {
      throw new Error("Invalid Binance USD-M exchangeInfo response.");
    }

    this.metadata = structuredClone(response.symbols);
    this.metadataLoadedAt = now;
    return this.metadata;
  }

  private filter(
    instrument: BinanceDerivativeSymbol,
    filterType: string,
  ): BinanceDerivativeFilter | null {
    return instrument.filters?.find((item) => item.filterType === filterType) ?? null;
  }

  private market(input: {
    market: string;
    baseAsset?: string;
    quoteAsset?: string;
    settleAsset?: string;
    bidPrice?: string;
    bidQuantity?: string;
    askPrice?: string;
    askQuantity?: string;
    markPrice?: string;
    indexPrice?: string;
    fundingRate?: string;
    nextFundingTime?: number;
    fundingIntervalMinutes: number;
    priceStep?: string;
    quantityStep?: string;
    minimumQuantity?: string;
    maximumMarketQuantity?: string;
    minimumNotional?: string;
    maximumLeverage: number | null;
    openInterest: number | null;
    sourceTimestamp: number;
    observedAt: number;
  }): DerivativeMarketEvidence | null {
    const baseAsset = this.symbol(input.baseAsset);
    const quoteAsset = this.symbol(input.quoteAsset);
    const settleAsset = this.symbol(input.settleAsset);
    const numbers = {
      bidPrice: Number(input.bidPrice),
      bidQuantity: Number(input.bidQuantity),
      askPrice: Number(input.askPrice),
      askQuantity: Number(input.askQuantity),
      markPrice: Number(input.markPrice),
      indexPrice: Number(input.indexPrice),
      fundingRate: Number(input.fundingRate),
      nextFundingTime: Number(input.nextFundingTime),
      priceStep: Number(input.priceStep),
      quantityStep: Number(input.quantityStep),
      minimumQuantity: Number(input.minimumQuantity),
      maximumMarketQuantity: Number(input.maximumMarketQuantity),
      minimumNotional: Number(input.minimumNotional),
    };

    if (
      !baseAsset || !quoteAsset || !settleAsset ||
      !this.allPositive([
        numbers.bidPrice, numbers.bidQuantity, numbers.askPrice, numbers.askQuantity,
        numbers.markPrice, numbers.indexPrice, numbers.nextFundingTime,
        numbers.priceStep, numbers.quantityStep, numbers.minimumQuantity,
        numbers.maximumMarketQuantity, numbers.minimumNotional,
      ]) ||
      !Number.isFinite(numbers.fundingRate) ||
      numbers.bidPrice >= numbers.askPrice
    ) {
      return null;
    }

    return this.evidence({
      exchange: this.exchange,
      market: input.market,
      baseAsset,
      quoteAsset,
      settleAsset,
      bidPrice: numbers.bidPrice,
      bidQuantity: numbers.bidQuantity,
      askPrice: numbers.askPrice,
      askQuantity: numbers.askQuantity,
      markPrice: numbers.markPrice,
      indexPrice: numbers.indexPrice,
      fundingRate: numbers.fundingRate,
      nextFundingTime: numbers.nextFundingTime,
      fundingIntervalMinutes: input.fundingIntervalMinutes,
      openInterest: input.openInterest,
      rules: {
        priceStep: numbers.priceStep,
        quantityStep: numbers.quantityStep,
        minimumQuantity: numbers.minimumQuantity,
        maximumMarketQuantity: numbers.maximumMarketQuantity,
        minimumNotional: numbers.minimumNotional,
        maximumLeverage: input.maximumLeverage,
      },
      sourceTimestamp: input.sourceTimestamp,
      observedAt: input.observedAt,
    });
  }

  private evidence(
    input: Omit<DerivativeMarketEvidence, "product" | "tradingEnabled" | "sources" | "execution">,
  ): DerivativeMarketEvidence {
    return {
      ...input,
      product: "LINEAR_PERPETUAL",
      tradingEnabled: true,
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
    return this.client.getPublic<T>(path, {}, 12_000);
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
