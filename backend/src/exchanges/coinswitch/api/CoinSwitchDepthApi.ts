import {
  COINSWITCH,
  type CoinSwitchPublicVenue,
} from "../constants";

import {
  canonicalizeCoinSwitchMarket,
  normalizeCoinSwitchOrderBook,
  normalizeCoinSwitchSymbol,
  type NormalizedCoinSwitchOrderBook,
} from "../normalize";

import type {
  CoinSwitchMarketDescriptor,
  CoinSwitchTicker,
} from "../types";

import type {
  CoinSwitchCredentials,
} from "./CoinSwitchCredentialsProvider";

import {
  coinSwitchReadOnlyHttpClient,
} from "./CoinSwitchReadOnlyHttpClient";

export interface CoinSwitchDepthRequest {
  venue: CoinSwitchPublicVenue;
  market: string;
}

export interface CoinSwitchSignedDepthSnapshot
extends NormalizedCoinSwitchOrderBook {
  venue: CoinSwitchPublicVenue;
}

interface CoinSwitchSignedDepthClient {
  getSigned<T>(
    path: string,
    parameters?: Readonly<Record<string, string>>,
    credentials?: CoinSwitchCredentials,
  ): Promise<T>;
}

interface CoinSwitchDepthEnvelope {
  data?: unknown;
}

export class CoinSwitchDepthApi {
  constructor(
    private readonly client:
      CoinSwitchSignedDepthClient = coinSwitchReadOnlyHttpClient,
  ) {}

  async getDepth(
    request: CoinSwitchDepthRequest,
    credentials?: CoinSwitchCredentials,
    receivedAt: number = Date.now(),
  ): Promise<CoinSwitchSignedDepthSnapshot> {
    const descriptor = this.buildDescriptor(request);
    const envelope = await this.client.getSigned<CoinSwitchDepthEnvelope>(
      COINSWITCH.REST.DEPTH_PATH,
      {
        exchange: descriptor.venue,
        symbol: descriptor.symbol.toLowerCase(),
      },
      credentials,
    );
    const data = this.recordOrNull(envelope.data);

    if (!data) {
      throw new Error("CoinSwitch depth response data is missing.");
    }

    if (
      !this.levelsAreStrictlyValid(data.bids, "bid") ||
      !this.levelsAreStrictlyValid(data.asks, "ask")
    ) {
      throw new Error("CoinSwitch depth response contains invalid or unsorted levels.");
    }

    const normalized = normalizeCoinSwitchOrderBook(
      {
        s: data.symbol,
        timestamp: data.timestamp,
        bids: data.bids,
        asks: data.asks,
      },
      descriptor,
      receivedAt,
    );

    if (!normalized) {
      throw new Error("CoinSwitch depth response failed market, clock, or book integrity validation.");
    }

    return {
      venue: descriptor.venue,
      ...normalized,
    };
  }

  private buildDescriptor(
    request: CoinSwitchDepthRequest,
  ): CoinSwitchMarketDescriptor {
    const symbol = normalizeCoinSwitchSymbol(request.market);
    const [baseAsset, quoteAsset] = symbol.split("/");
    const expectedQuote = request.venue === "coinswitchx" ? "INR" : "USDT";

    if (!baseAsset || quoteAsset !== expectedQuote) {
      throw new Error(
        `CoinSwitch venue ${request.venue} does not support requested market ${request.market}.`,
      );
    }

    const market = `${baseAsset}_${quoteAsset}`;
    const ticker: CoinSwitchTicker = {};

    return {
      venue: request.venue,
      symbol,
      market,
      canonicalMarket: canonicalizeCoinSwitchMarket(market),
      baseAsset,
      quoteAsset,
      ticker,
    };
  }

  private levelsAreStrictlyValid(
    levels: unknown,
    side: "bid" | "ask",
  ): boolean {
    if (!Array.isArray(levels) || levels.length === 0) {
      return false;
    }

    let previousPrice: number | null = null;

    for (const level of levels) {
      if (!Array.isArray(level) || level.length < 2) {
        return false;
      }

      const price = Number(level[0]);
      const quantity = Number(level[1]);

      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        return false;
      }

      if (
        previousPrice !== null &&
        (side === "bid" ? price > previousPrice : price < previousPrice)
      ) {
        return false;
      }

      previousPrice = price;
    }

    return true;
  }

  private recordOrNull(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
}
