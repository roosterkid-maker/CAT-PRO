import type {
  DerivativeDepthEvidence,
  DerivativeDepthProviderStatus,
  DerivativeDepthSnapshot,
  DerivativeDepthVenueResult,
} from "../models/DerivativeDepthEvidence";
import {CoinSwitchReadOnlyHttpClient} from "../../exchanges/coinswitch/api/CoinSwitchReadOnlyHttpClient";
import {DERIVATIVE_CANDIDATE_MARKETS} from "../providers/DerivativeProviderUtilities";
import {
  binanceUsdMHttpClient,
  type BinanceUsdMHttpClient,
} from "../../exchanges/binance/api/BinanceUsdMHttpClient";

export interface DerivativeDepthFetcher {
  readonly exchange: string;

  fetch(markets: readonly string[], now?: number): Promise<DerivativeDepthVenueResult>;
}

export interface DerivativeDepthServiceConfiguration {
  readonly markets: readonly string[];
  readonly refreshIntervalMs: number;
  readonly freshnessThresholdMs: number;
  readonly retentionMs: number;
}

const DEFAULT_MARKETS = DERIVATIVE_CANDIDATE_MARKETS;

const DEFAULT_CONFIGURATION: DerivativeDepthServiceConfiguration = {
  markets: DEFAULT_MARKETS,
  refreshIntervalMs: 5_000,
  freshnessThresholdMs: 15_000,
  retentionMs: 60_000,
};

class BinanceDerivativeDepthFetcher implements DerivativeDepthFetcher {
  readonly exchange = "binance";

  constructor(
    private readonly client: BinanceUsdMHttpClient = binanceUsdMHttpClient,
  ) {}

  async fetch(
    markets: readonly string[],
    now = Date.now(),
  ): Promise<DerivativeDepthVenueResult> {
    const responses = await Promise.all(
      markets.map(async (market) => {
        const payload = await this.client.getPublic<{
          E?: unknown;
          T?: unknown;
          bids?: unknown;
          asks?: unknown;
        }>(
          "/fapi/v1/depth",
          {symbol: market, limit: 100},
          10_000,
        );

        return normalizeBook(
          this.exchange,
          market,
          payload.bids,
          payload.asks,
          positiveTimestamp(payload.T) ?? positiveTimestamp(payload.E) ?? now,
          Date.now(),
        );
      }),
    );

    return {
      exchange: this.exchange,
      generatedAt: now,
      books: responses,
    };
  }
}

class BybitDerivativeDepthFetcher implements DerivativeDepthFetcher {
  readonly exchange = "bybit";

  async fetch(
    markets: readonly string[],
    now = Date.now(),
  ): Promise<DerivativeDepthVenueResult> {
    const responses = await Promise.all(
      markets.map(async (market) => {
        const response = await fetch(
          `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${encodeURIComponent(market)}&limit=200`,
          {signal: AbortSignal.timeout(10_000)},
        );

        if (!response.ok) {
          throw new Error(`Bybit linear depth ${market} failed with HTTP ${response.status}.`);
        }

        const payload = await response.json() as {
          retCode?: unknown;
          retMsg?: unknown;
          time?: unknown;
          result?: {
            ts?: unknown;
            b?: unknown;
            a?: unknown;
          };
        };

        if (payload.retCode !== 0) {
          throw new Error(
            `Bybit linear depth ${market} failed: ${String(payload.retMsg ?? "invalid response")}.`,
          );
        }

        return normalizeBook(
          this.exchange,
          market,
          payload.result?.b,
          payload.result?.a,
          positiveTimestamp(payload.result?.ts) ?? positiveTimestamp(payload.time) ?? now,
          Date.now(),
        );
      }),
    );

    return {
      exchange: this.exchange,
      generatedAt: now,
      books: responses,
    };
  }
}

class CoinDCXDerivativeDepthFetcher implements DerivativeDepthFetcher {
  readonly exchange = "coindcx";
  async fetch(markets: readonly string[], now = Date.now()): Promise<DerivativeDepthVenueResult> {
    const books = await Promise.all(markets.map(async (market) => {
      const base = market.endsWith("USDT") ? market.slice(0, -4) : "";
      if (!base) throw new Error(`CoinDCX derivative market ${market} is unsupported.`);
      const pair = `B-${base}_USDT`;
      const response = await fetch(
        `https://public.coindcx.com/market_data/v3/orderbook/${encodeURIComponent(pair)}-futures/50`,
        {signal: AbortSignal.timeout(10_000)},
      );
      if (!response.ok) throw new Error(`CoinDCX futures depth ${market} failed with HTTP ${response.status}.`);
      const payload = await response.json() as {bids?: unknown; asks?: unknown; timestamp?: unknown; ts?: unknown};
      return normalizeBook(this.exchange, market, payload.bids, payload.asks,
        positiveTimestamp(payload.timestamp) ?? positiveTimestamp(payload.ts) ?? now, Date.now());
    }));
    return {exchange: this.exchange, generatedAt: now, books};
  }
}

class CoinSwitchDerivativeDepthFetcher implements DerivativeDepthFetcher {
  readonly exchange = "coinswitch";
  constructor(private readonly client = new CoinSwitchReadOnlyHttpClient()) {}
  async fetch(markets: readonly string[], now = Date.now()): Promise<DerivativeDepthVenueResult> {
    const books = await Promise.all(markets.map(async (market) => {
      const payload = await this.client.getSigned<unknown>("/trade/api/v2/futures/order_book", {
        exchange: "EXCHANGE_2", symbol: market, l2Orderbook: "true",
      });
      const body = recordData(payload);
      if (!body) throw new Error(`CoinSwitch futures depth ${market} returned no data.`);
      return normalizeBook(this.exchange, market, body.bids ?? body.buy, body.asks ?? body.sell,
        positiveTimestamp(body.timestamp) ?? positiveTimestamp(body.ts) ?? now, Date.now());
    }));
    return {exchange: this.exchange, generatedAt: now, books};
  }
}

class ZebPayDerivativeDepthFetcher implements DerivativeDepthFetcher {
  readonly exchange = "zebpay";
  async fetch(markets: readonly string[], now = Date.now()): Promise<DerivativeDepthVenueResult> {
    const books = await Promise.all(markets.map(async (market) => {
      const response = await fetch(
        `https://futuresbe.zebpay.com/api/v1/market/orderBook?symbol=${encodeURIComponent(market)}`,
        {signal: AbortSignal.timeout(10_000)},
      );
      if (!response.ok) throw new Error(`ZebPay futures depth ${market} failed with HTTP ${response.status}.`);
      const payload = await response.json() as unknown;
      const body = recordData(payload);
      if (!body) throw new Error(`ZebPay futures depth ${market} returned no data.`);
      return normalizeBook(this.exchange, market, body.bids ?? body.buy, body.asks ?? body.sell,
        positiveTimestamp(body.timestamp) ?? positiveTimestamp(body.ts) ?? now, Date.now());
    }));
    return {exchange: this.exchange, generatedAt: now, books};
  }
}

export class DerivativeDepthService {
  private readonly fetchers: readonly DerivativeDepthFetcher[];
  private readonly configuration: DerivativeDepthServiceConfiguration;
  private readonly books = new Map<string, DerivativeDepthEvidence>();
  private readonly statuses = new Map<string, DerivativeDepthProviderStatus>();
  private timer: NodeJS.Timeout | null = null;
  private refreshing = false;

  constructor(
    fetchers: readonly DerivativeDepthFetcher[] = [
      new BinanceDerivativeDepthFetcher(),
      new BybitDerivativeDepthFetcher(),
      new CoinDCXDerivativeDepthFetcher(),
      new CoinSwitchDerivativeDepthFetcher(),
      new ZebPayDerivativeDepthFetcher(),
    ],
    configuration: Partial<DerivativeDepthServiceConfiguration> = {},
  ) {
    this.fetchers = [...fetchers];
    this.configuration = {
      ...DEFAULT_CONFIGURATION,
      ...configuration,
      markets: normalizeMarkets(configuration.markets ?? DEFAULT_MARKETS),
    };

    if (this.configuration.markets.length === 0 || this.configuration.markets.length > 20) {
      throw new Error("Derivative depth requires between one and twenty bounded markets.");
    }

    for (const value of [
      this.configuration.refreshIntervalMs,
      this.configuration.freshnessThresholdMs,
      this.configuration.retentionMs,
    ]) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error("Derivative depth timing values must be positive integers.");
      }
    }

    for (const fetcher of this.fetchers) {
      this.statuses.set(fetcher.exchange, {
        exchange: fetcher.exchange,
        state: "NO_DATA",
        configuredMarkets: this.configuration.markets.length,
        retainedBooks: 0,
        freshBooks: 0,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null,
      });
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.configuration.refreshIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refresh(now = Date.now()): Promise<DerivativeDepthSnapshot> {
    if (this.refreshing) {
      return this.getSnapshot(now);
    }

    this.refreshing = true;

    try {
      const results = await Promise.allSettled(
        this.fetchers.map((fetcher) => fetcher.fetch(this.configuration.markets, now)),
      );
      const completedAt = Math.max(now, Date.now());

      results.forEach((result, index) => {
        const fetcher = this.fetchers[index];

        if (!fetcher) {
          return;
        }

        const previous = this.statuses.get(fetcher.exchange);

        if (result.status === "fulfilled") {
          for (const book of result.value.books) {
            this.books.set(this.key(book.exchange, book.market), immutableClone(book));
          }

          this.statuses.set(fetcher.exchange, {
            exchange: fetcher.exchange,
            state: "READY",
            configuredMarkets: this.configuration.markets.length,
            retainedBooks: result.value.books.length,
            freshBooks: result.value.books.filter((book) => this.isFresh(book, completedAt)).length,
            lastAttemptAt: completedAt,
            lastSuccessAt: completedAt,
            lastError: null,
          });
        } else {
          const retained = this.venueBooks(fetcher.exchange, completedAt);
          this.statuses.set(fetcher.exchange, {
            exchange: fetcher.exchange,
            state: retained.length > 0 ? "DEGRADED" : "NO_DATA",
            configuredMarkets: this.configuration.markets.length,
            retainedBooks: retained.length,
            freshBooks: retained.filter((book) => this.isFresh(book, completedAt)).length,
            lastAttemptAt: completedAt,
            lastSuccessAt: previous?.lastSuccessAt ?? null,
            lastError: result.reason instanceof Error
              ? result.reason.message
              : "Unknown derivative depth failure.",
          });
        }
      });

      this.evict(completedAt);
      return this.getSnapshot(completedAt);
    } finally {
      this.refreshing = false;
    }
  }

  getBook(exchange: string, market: string, now = Date.now()): DerivativeDepthEvidence | null {
    const book = this.books.get(this.key(exchange, market));
    return book && this.isFresh(book, now)
      ? immutableClone(book)
      : null;
  }

  getSnapshot(now = Date.now()): DerivativeDepthSnapshot {
    const books = [...this.books.values()]
      .filter((book) => now >= book.observedAt && now - book.observedAt <= this.configuration.retentionMs)
      .sort((first, second) =>
        first.exchange.localeCompare(second.exchange) || first.market.localeCompare(second.market),
      );
    const providers = [...this.statuses.values()]
      .map((status) => {
        const retained = books.filter((book) => book.exchange === status.exchange);
        return {
          ...status,
          retainedBooks: retained.length,
          freshBooks: retained.filter((book) => this.isFresh(book, now)).length,
        };
      })
      .sort((first, second) => first.exchange.localeCompare(second.exchange));

    return immutableClone({
      generatedAt: now,
      version: "27.0",
      mode: "BOUNDED_PUBLIC_FULL_DEPTH",
      freshnessThresholdMs: this.configuration.freshnessThresholdMs,
      configuredMarkets: [...this.configuration.markets],
      providers,
      books,
      summary: {
        providerCount: providers.length,
        readyProviders: providers.filter((provider) => provider.state === "READY").length,
        retainedBooks: books.length,
        freshBooks: books.filter((book) => this.isFresh(book, now)).length,
      },
      safety: {
        boundedAllowlistOnly: true,
        publicReadOnly: true,
        accountReadAllowed: false,
        paperExecutionAllowed: false,
        liveExecutionAllowed: false,
        orderSubmissionAllowed: false,
      },
    });
  }

  private isFresh(book: DerivativeDepthEvidence, now: number): boolean {
    /*
     * Exchange event clocks are evidence, but they are not our freshness
     * clock. A small positive venue-clock skew must not make a book vanish
     * immediately after a successful local observation. Keep the raw source
     * timestamp for audit and bound its absolute skew/age by the same strict
     * freshness window.
     */
    return book.observedAt <= now &&
      now - book.observedAt <= this.configuration.freshnessThresholdMs &&
      Number.isFinite(book.sourceTimestamp) &&
      Math.abs(now - book.sourceTimestamp) <= this.configuration.freshnessThresholdMs;
  }

  private venueBooks(exchange: string, now: number): DerivativeDepthEvidence[] {
    return [...this.books.values()].filter((book) =>
      book.exchange === exchange && now >= book.observedAt &&
      now - book.observedAt <= this.configuration.retentionMs,
    );
  }

  private evict(now: number): void {
    for (const [key, book] of this.books) {
      if (book.observedAt > now || now - book.observedAt > this.configuration.retentionMs) {
        this.books.delete(key);
      }
    }
  }

  private key(exchange: string, market: string): string {
    return `${exchange.trim().toLowerCase()}:${market.trim().toUpperCase()}`;
  }
}

function normalizeBook(
  exchange: string,
  market: string,
  rawBids: unknown,
  rawAsks: unknown,
  sourceTimestamp: number,
  observedAt: number,
): DerivativeDepthEvidence {
  const bids = normalizeLevels(rawBids, true);
  const asks = normalizeLevels(rawAsks, false);

  if (bids.length === 0 || asks.length === 0 || bids[0]!.price >= asks[0]!.price) {
    throw new Error(`${exchange} derivative depth ${market} is empty, invalid, or crossed.`);
  }

  return {
    exchange,
    market,
    product: "LINEAR_PERPETUAL",
    bids,
    asks,
    sourceTimestamp,
    observedAt,
    source: "PUBLIC_REST_FULL_DEPTH",
    executionAuthorized: false,
    orderSubmissionAllowed: false,
  };
}

function normalizeLevels(raw: unknown, descending: boolean): Array<{price: number; quantity: number}> {
  const levels: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.entries(raw as Record<string, unknown>)
      : [];
  return levels
    .map((level) => {
      if (!Array.isArray(level) || level.length < 2) {
        return null;
      }
      const price = Number(level[0]);
      const quantity = Number(level[1]);
      return Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity > 0
        ? {price, quantity}
        : null;
    })
    .filter((level): level is {price: number; quantity: number} => level !== null)
    .sort((first, second) => descending ? second.price - first.price : first.price - second.price);
}

function recordData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    return record.data as Record<string, unknown>;
  }
  return record;
}

function normalizeMarkets(markets: readonly string[]): string[] {
  return Array.from(new Set(markets.map((market) =>
    market.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""),
  ).filter(Boolean))).sort();
}

function positiveTimestamp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

export const derivativeDepthService = new DerivativeDepthService();
