import {orderBookService} from "../../orderbook/services/OrderBookService";
import {marketCache} from "../../services/cache.service";
import type {ExchangeAdapter} from "../core/ExchangeAdapter";
import type {NormalizedTicker} from "../coindcx/types";
import {GIOTTUS} from "./constants";
import {
  GiottusPublicRateLimitError,
  giottusPublicApi,
  type GiottusPublicMarketApi,
} from "./GiottusPublicApi";
import {
  canonicalizeGiottusMarket,
  isGiottusObservationMarket,
  normalizeGiottusOrderBook,
  normalizeGiottusSymbol,
  normalizeGiottusTicker,
  tickerFromGiottusBook,
} from "./normalize";

export interface GiottusObservationDiagnostics {
  catalogMarkets: number;
  requestedMarkets: number;
  executableMarkets: number;
  successfulTickerReads: number;
  failedTickerReads: number;
  successfulBookReads: number;
  failedBookReads: number;
  rejectedBooks: number;
  rateLimitResponses: number;
  rateLimitSkippedRefreshes: number;
  rateLimitCooldownUntil: number | null;
  lastSuccessfulTickerReadAt: number | null;
  lastSuccessfulBookReadAt: number | null;
  lastError: string | null;
  executionEligible: false;
  blocker: "RULE_FEE_CLOCK_AND_DETERMINISTIC_ORDER_LIFECYCLE_REQUIRED";
}

export interface GiottusObservationAdapterOptions {
  api?: GiottusPublicMarketApi;
  now?: () => number;
  scheduleTimers?: boolean;
}

export class GiottusObservationAdapter implements ExchangeAdapter {
  readonly name = GIOTTUS.NAME;
  private readonly api: GiottusPublicMarketApi;
  private readonly now: () => number;
  private readonly scheduleTimers: boolean;
  private readonly availableByCanonical = new Map<string, string>();
  private readonly requestedByCanonical = new Map<string, string>();
  private readonly publishedMarkets = new Set<string>();
  private connected = false;
  private lastUpdate = 0;
  private tickerRefreshInProgress = false;
  private bookRefreshInProgress = false;
  private nextBookIndex = 0;
  private tickerTimer: NodeJS.Timeout | null = null;
  private bookTimer: NodeJS.Timeout | null = null;
  private tickerCallback: ((ticker: NormalizedTicker) => void) | null = null;
  private readonly diagnostics: GiottusObservationDiagnostics = {
    catalogMarkets: 0,
    requestedMarkets: 0,
    executableMarkets: 0,
    successfulTickerReads: 0,
    failedTickerReads: 0,
    successfulBookReads: 0,
    failedBookReads: 0,
    rejectedBooks: 0,
    rateLimitResponses: 0,
    rateLimitSkippedRefreshes: 0,
    rateLimitCooldownUntil: null,
    lastSuccessfulTickerReadAt: null,
    lastSuccessfulBookReadAt: null,
    lastError: null,
    executionEligible: false,
    blocker: "RULE_FEE_CLOCK_AND_DETERMINISTIC_ORDER_LIFECYCLE_REQUIRED",
  };

  constructor(options: GiottusObservationAdapterOptions = {}) {
    this.api = options.api ?? giottusPublicApi;
    this.now = options.now ?? Date.now;
    this.scheduleTimers = options.scheduleTimers ?? true;
  }

  async connect(): Promise<void> {
    if (this.connected && this.isConnected()) return;
    this.stopTimers();
    this.connected = false;
    await this.refreshCatalog(true);
    if (this.availableByCanonical.size === 0) {
      throw new Error("Giottus returned no validated public Spot markets.");
    }
    this.connected = true;
    if (this.scheduleTimers) {
      this.tickerTimer = setInterval(() => void this.refreshCatalog(), GIOTTUS.MARKET_REFRESH_MS);
      this.bookTimer = setInterval(() => void this.refreshBooks(), GIOTTUS.ORDER_BOOK_REFRESH_MS);
      this.tickerTimer.unref();
      this.bookTimer.unref();
    }
    console.log(
      `[${this.name}] Public Spot discovery connected with ${this.availableByCanonical.size} markets; subscribed books remain observation-only.`,
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.stopTimers();
    for (const market of this.publishedMarkets) {
      marketCache.remove(this.name, market);
      orderBookService.remove(this.name, market);
    }
    this.availableByCanonical.clear();
    this.requestedByCanonical.clear();
    this.publishedMarkets.clear();
    this.updateCounts();
  }

  async subscribe(markets: string[]): Promise<void> {
    if (!this.connected) throw new Error("Giottus public market data is not connected.");
    const next = new Map<string, string>();
    for (const market of markets) {
      const canonical = canonicalizeGiottusMarket(toSeparatedMarket(market));
      const symbol = this.availableByCanonical.get(canonical);
      if (symbol && next.size < GIOTTUS.MAXIMUM_ACTIVE_MARKETS) next.set(canonical, symbol);
    }
    for (const previous of this.requestedByCanonical.keys()) {
      if (!next.has(previous)) {
        marketCache.invalidateExecutable(this.name, previous);
        orderBookService.remove(this.name, previous);
        this.publishedMarkets.delete(previous);
      }
    }
    this.requestedByCanonical.clear();
    for (const [market, symbol] of next) this.requestedByCanonical.set(market, symbol);
    this.updateCounts();
    await this.refreshBooks();
  }

  async unsubscribe(markets: string[]): Promise<void> {
    for (const market of markets) {
      const canonical = canonicalizeGiottusMarket(toSeparatedMarket(market));
      if (this.requestedByCanonical.delete(canonical)) {
        marketCache.invalidateExecutable(this.name, canonical);
        orderBookService.remove(this.name, canonical);
        this.publishedMarkets.delete(canonical);
      }
    }
    this.updateCounts();
  }

  isConnected(): boolean {
    const lastRead = this.diagnostics.lastSuccessfulTickerReadAt;
    return Boolean(
      this.connected &&
        lastRead !== null &&
        this.now() - lastRead <= GIOTTUS.MARKET_REFRESH_MS * GIOTTUS.CONNECTION_STALE_MULTIPLIER,
    );
  }

  getMarketCount(): number { return this.publishedMarkets.size; }
  getLastUpdate(): number { return this.lastUpdate; }
  onTicker(callback: (ticker: NormalizedTicker) => void): void { this.tickerCallback = callback; }
  getAvailableMarkets(): string[] { return [...this.availableByCanonical.values()].sort(); }
  getMaximumSubscribedMarkets(): number { return GIOTTUS.MAXIMUM_ACTIVE_MARKETS; }
  getDiagnostics(): GiottusObservationDiagnostics { this.updateCounts(); return {...this.diagnostics}; }

  private async refreshCatalog(propagateFailure = false): Promise<void> {
    if (this.tickerRefreshInProgress) return;
    this.tickerRefreshInProgress = true;
    try {
      const [symbols, tickers] = await Promise.all([this.api.getSymbols(), this.api.getTickers()]);
      const nextAvailable = new Map<string, string>();
      for (const symbolValue of symbols) {
        const symbol = normalizeGiottusSymbol(symbolValue);
        if (!symbol || !isGiottusObservationMarket(symbol)) continue;
        nextAvailable.set(canonicalizeGiottusMarket(symbol), symbol);
      }
      const receivedAt = this.now();
      for (const incoming of tickers) {
        const ticker = normalizeGiottusTicker(incoming, receivedAt);
        if (!ticker || !nextAvailable.has(ticker.market)) continue;
        marketCache.update(ticker);
        this.tickerCallback?.(ticker);
      }
      if (nextAvailable.size === 0) throw new Error("Giottus public catalog contained no supported Spot markets.");
      this.availableByCanonical.clear();
      for (const [market, symbol] of nextAvailable) this.availableByCanonical.set(market, symbol);
      for (const market of [...this.requestedByCanonical.keys()]) {
        if (!nextAvailable.has(market)) this.requestedByCanonical.delete(market);
      }
      this.diagnostics.successfulTickerReads += 1;
      this.diagnostics.lastSuccessfulTickerReadAt = receivedAt;
      this.diagnostics.lastError = null;
      this.lastUpdate = Math.max(this.lastUpdate, receivedAt);
      this.updateCounts();
    } catch (error: unknown) {
      this.diagnostics.failedTickerReads += 1;
      this.diagnostics.lastError = error instanceof Error ? error.message.slice(0, 500) : "Giottus catalog refresh failed.";
      if (propagateFailure) throw error;
    } finally {
      this.tickerRefreshInProgress = false;
    }
  }

  private async refreshBooks(): Promise<void> {
    if (this.bookRefreshInProgress || this.requestedByCanonical.size === 0) return;
    const now = this.now();
    if (
      this.diagnostics.rateLimitCooldownUntil !== null &&
      now < this.diagnostics.rateLimitCooldownUntil
    ) {
      this.diagnostics.rateLimitSkippedRefreshes += 1;
      return;
    }
    this.bookRefreshInProgress = true;
    try {
      const queue = [...this.requestedByCanonical.values()];
      const index = this.nextBookIndex % queue.length;
      this.nextBookIndex = (index + GIOTTUS.ORDER_BOOK_CONCURRENCY) % queue.length;
      const selected = queue.slice(index, index + GIOTTUS.ORDER_BOOK_CONCURRENCY);
      await Promise.all(selected.map((symbol) => this.refreshBook(symbol)));
    } finally {
      this.bookRefreshInProgress = false;
    }
  }

  private async refreshBook(symbol: string): Promise<void> {
    const canonical = canonicalizeGiottusMarket(symbol);
    try {
      const incoming = await this.api.getOrderBook(symbol, GIOTTUS.ORDER_BOOK_DEPTH);
      const receivedAt = this.now();
      const book = normalizeGiottusOrderBook(symbol, incoming, receivedAt);
      if (!book) {
        this.diagnostics.rejectedBooks += 1;
        marketCache.invalidateExecutable(this.name, canonical);
        orderBookService.remove(this.name, canonical);
        this.publishedMarkets.delete(canonical);
        return;
      }
      const replacement = orderBookService.replace(book);
      const ticker = replacement.accepted ? tickerFromGiottusBook(book) : null;
      if (!ticker) {
        this.diagnostics.rejectedBooks += 1;
        return;
      }
      marketCache.update(ticker);
      this.tickerCallback?.(ticker);
      this.publishedMarkets.add(canonical);
      this.diagnostics.successfulBookReads += 1;
      this.diagnostics.lastSuccessfulBookReadAt = receivedAt;
      this.diagnostics.lastError = null;
      this.lastUpdate = Math.max(this.lastUpdate, receivedAt);
    } catch (error: unknown) {
      this.diagnostics.failedBookReads += 1;
      if (error instanceof GiottusPublicRateLimitError) {
        this.diagnostics.rateLimitResponses += 1;
        this.diagnostics.rateLimitCooldownUntil = Math.max(
          this.diagnostics.rateLimitCooldownUntil ?? 0,
          this.now() + Math.max(error.retryAfterMs, GIOTTUS.MINIMUM_RATE_LIMIT_COOLDOWN_MS),
        );
      }
      this.diagnostics.lastError = error instanceof Error ? error.message.slice(0, 500) : "Giottus order-book refresh failed.";
    } finally {
      this.updateCounts();
    }
  }

  private stopTimers(): void {
    if (this.tickerTimer) clearInterval(this.tickerTimer);
    if (this.bookTimer) clearInterval(this.bookTimer);
    this.tickerTimer = null;
    this.bookTimer = null;
  }

  private updateCounts(): void {
    this.diagnostics.catalogMarkets = this.availableByCanonical.size;
    this.diagnostics.requestedMarkets = this.requestedByCanonical.size;
    this.diagnostics.executableMarkets = this.publishedMarkets.size;
  }
}

function toSeparatedMarket(market: string): string {
  const normalized = market.trim().toUpperCase();
  if (/[\/_-]/.test(normalized)) return normalized;
  const quote = GIOTTUS.OBSERVATION_QUOTE_ASSETS.find((asset) => normalized.endsWith(asset));
  return quote ? `${normalized.slice(0, -quote.length)}/${quote}` : "";
}
