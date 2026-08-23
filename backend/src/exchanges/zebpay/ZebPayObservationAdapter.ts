import WebSocket from "ws";

import {marketCache} from "../../services/cache.service";
import type {ExchangeAdapter} from "../core/ExchangeAdapter";
import type {NormalizedTicker} from "../coindcx/types";
import {ZEBPAY} from "./constants";
import {
  canonicalizeZebPayMarket,
  isZebPaySpotObservation,
  normalizeZebPayAtomicOrderBookTicker,
  normalizeZebPayMarket,
  normalizeZebPayOrderBookTicker,
  normalizeZebPayTicker,
} from "./normalize";
import {zebPayPublicApi, type ZebPayPublicMarketApi} from "./ZebPayPublicApi";
import type {ZebPayOrderBook} from "./types";

export interface ZebPayObservationDiagnostics {
  catalogEntries: number;
  spotObservationMarkets: number;
  requestedMarkets: number;
  executableMarkets: number;
  successfulPublicReads: number;
  failedPublicReads: number;
  successfulMetadataReads: number;
  failedMetadataReads: number;
  websocketConnected: boolean;
  websocketMessages: number;
  websocketBookMessages: number;
  reconnects: number;
  lastSuccessfulReadAt: number | null;
  lastSuccessfulMetadataReadAt: number | null;
  lastDepthUpdateAt: number | null;
  lastError: string | null;
  lastMetadataError: string | null;
  executionEligible: boolean;
  blocker: "NONE" | "QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED";
}

export interface ZebPayObservationAdapterOptions {
  api?: ZebPayPublicMarketApi;
  now?: () => number;
  scheduleTimers?: boolean;
  websocketFactory?: (url: string) => WebSocket;
}

/** V162: discovery plus bounded, genuine quantity-bearing Spot depth. */
export class ZebPayObservationAdapter implements ExchangeAdapter {
  readonly name = ZEBPAY.NAME;

  private readonly api: ZebPayPublicMarketApi;
  private readonly now: () => number;
  private readonly scheduleTimers: boolean;
  private readonly websocketFactory: (url: string) => WebSocket;
  private readonly publishedMarkets = new Set<string>();
  private readonly availableMarkets = new Set<string>();
  private readonly requestedMarkets = new Set<string>();
  private readonly executableMarkets = new Set<string>();
  private readonly volumePrecisionByMarket = new Map<string, number>();
  private connected = false;
  private intentionallyClosed = false;
  private lastUpdate = 0;
  private refreshInProgress = false;
  private socket: WebSocket | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private tickerCallback: ((ticker: NormalizedTicker) => void) | null = null;
  private readonly diagnostics: ZebPayObservationDiagnostics = {
    catalogEntries: 0,
    spotObservationMarkets: 0,
    requestedMarkets: 0,
    executableMarkets: 0,
    successfulPublicReads: 0,
    failedPublicReads: 0,
    successfulMetadataReads: 0,
    failedMetadataReads: 0,
    websocketConnected: false,
    websocketMessages: 0,
    websocketBookMessages: 0,
    reconnects: 0,
    lastSuccessfulReadAt: null,
    lastSuccessfulMetadataReadAt: null,
    lastDepthUpdateAt: null,
    lastError: null,
    lastMetadataError: null,
    executionEligible: false,
    blocker: "QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED",
  };

  constructor(options: ZebPayObservationAdapterOptions = {}) {
    this.api = options.api ?? zebPayPublicApi;
    this.now = options.now ?? Date.now;
    this.scheduleTimers = options.scheduleTimers ?? true;
    this.websocketFactory = options.websocketFactory ?? ((url) => new WebSocket(url));
  }

  async connect(): Promise<void> {
    if (this.connected && this.isConnected()) return;
    this.stopTimers();
    this.closeSocket();
    this.connected = false;
    this.intentionallyClosed = false;
    await this.refreshCatalog(true);
    if (this.availableMarkets.size === 0) {
      throw new Error("ZebPay returned no validated public Spot markets.");
    }
    this.connected = true;
    this.startCatalogTimer();
    if (this.scheduleTimers) this.openSocket();
    console.log(`[${this.name}] Public Spot discovery connected with ${this.availableMarkets.size} markets; bounded quantity-bearing depth is enabled for subscribed markets.`);
  }

  async disconnect(): Promise<void> {
    this.intentionallyClosed = true;
    this.connected = false;
    this.stopTimers();
    this.closeSocket();
    for (const market of this.publishedMarkets) marketCache.remove(this.name, market);
    this.publishedMarkets.clear();
    this.availableMarkets.clear();
    this.requestedMarkets.clear();
    this.executableMarkets.clear();
    this.volumePrecisionByMarket.clear();
    this.updateDiagnosticState();
  }

  async subscribe(markets: string[]): Promise<void> {
    if (!this.connected) throw new Error("ZebPay public market data is not connected.");
    const accepted: string[] = [];
    for (const market of markets) {
      const canonical = canonicalizeZebPayMarket(market);
      if (this.availableMarkets.has(canonical) &&
          (this.requestedMarkets.has(canonical) || this.requestedMarkets.size < ZEBPAY.WEBSOCKET.MAXIMUM_ACTIVE_MARKETS)) {
        this.requestedMarkets.add(canonical);
        accepted.push(canonical);
      }
    }
    this.updateDiagnosticState();
    this.sendSubscriptions(accepted, true);
    await this.bootstrapRestDepth(accepted);
  }

  async unsubscribe(markets: string[]): Promise<void> {
    const removed: string[] = [];
    for (const market of markets) {
      const canonical = canonicalizeZebPayMarket(market);
      if (this.requestedMarkets.delete(canonical)) removed.push(canonical);
    }
    this.sendSubscriptions(removed, false);
    this.updateDiagnosticState();
  }

  isConnected(): boolean {
    const lastRead = this.diagnostics.lastSuccessfulReadAt;
    return this.connected && lastRead !== null &&
      this.now() - lastRead <= ZEBPAY.MARKET_REFRESH_MS * ZEBPAY.CONNECTION_STALE_MULTIPLIER;
  }

  getMarketCount(): number { return this.publishedMarkets.size; }
  getLastUpdate(): number { return this.lastUpdate; }
  onTicker(callback: (ticker: NormalizedTicker) => void): void { this.tickerCallback = callback; }
  getAvailableMarkets(): string[] { return [...this.availableMarkets].sort(); }
  getMaximumSubscribedMarkets(): number { return ZEBPAY.WEBSOCKET.MAXIMUM_ACTIVE_MARKETS; }
  getDiagnostics(): ZebPayObservationDiagnostics {
    this.updateDiagnosticState();
    return {...this.diagnostics};
  }

  /** Testable parser boundary; price-only events can never pass it. */
  ingestPublicMessage(payload: unknown): boolean {
    this.diagnostics.websocketMessages += 1;
    const message = parseSocketMessage(payload);
    if (!message) return false;
    const canonical = canonicalizeZebPayMarket(message.market);
    const precision = this.volumePrecisionByMarket.get(canonical);
    if (!this.requestedMarkets.has(canonical) || precision === undefined) return false;
    const receivedAt = this.now();
    const ticker = normalizeZebPayAtomicOrderBookTicker(
      message.market, message.book, precision, receivedAt,
    );
    if (!ticker) return false;
    this.publishExecutable(ticker, canonical, receivedAt);
    this.diagnostics.websocketBookMessages += 1;
    return true;
  }

  private async refreshCatalog(propagateFailure = false): Promise<void> {
    if (this.refreshInProgress) return;
    this.refreshInProgress = true;
    const tradePairsRead = this.api.getTradePairs()
      .then((tradePairs) => ({ok: true as const, tradePairs}))
      .catch((error: unknown) => ({ok: false as const, error}));
    try {
      const markets = await this.api.getMarkets();
      const receivedAt = this.now();
      const nextPublished = new Set<string>();
      const nextAvailable = new Set<string>();
      for (const market of markets) {
        if (!isZebPaySpotObservation(market)) continue;
        const normalized = normalizeZebPayTicker(market, receivedAt);
        if (!normalized) continue;
        marketCache.update(normalized.ticker);
        this.tickerCallback?.(normalized.ticker);
        nextPublished.add(normalized.ticker.market);
        nextAvailable.add(normalized.canonicalMarket);
      }
      if (nextPublished.size === 0) throw new Error("ZebPay public catalog contained no validated Spot prices.");
      for (const previous of this.publishedMarkets) {
        if (!nextPublished.has(previous)) marketCache.remove(this.name, previous);
      }
      replaceSet(this.publishedMarkets, nextPublished);
      replaceSet(this.availableMarkets, nextAvailable);
      for (const requested of [...this.requestedMarkets]) {
        if (!nextAvailable.has(requested)) this.requestedMarkets.delete(requested);
      }
      for (const market of [...this.volumePrecisionByMarket.keys()]) {
        if (!nextAvailable.has(market)) this.volumePrecisionByMarket.delete(market);
      }
      this.lastUpdate = receivedAt;
      this.diagnostics.catalogEntries = markets.length;
      this.diagnostics.spotObservationMarkets = nextPublished.size;
      this.diagnostics.successfulPublicReads += 1;
      this.diagnostics.lastSuccessfulReadAt = receivedAt;
      this.diagnostics.lastError = null;
      this.updateDiagnosticState();

      const metadata = await tradePairsRead;
      if (metadata.ok) {
        const nextPrecision = new Map<string, number>();
        for (const pair of metadata.tradePairs) {
          const canonical = canonicalizeZebPayMarket(pair.tradePairName);
          const precision = Number(pair.volumeCurrencyDecimalPlaces);
          if (canonical && Number.isSafeInteger(precision) && precision >= 0 && precision <= 18) {
            nextPrecision.set(canonical, precision);
          }
        }
        this.volumePrecisionByMarket.clear();
        for (const [market, precision] of nextPrecision) {
          if (nextAvailable.has(market)) this.volumePrecisionByMarket.set(market, precision);
        }
        this.diagnostics.successfulMetadataReads += 1;
        this.diagnostics.lastSuccessfulMetadataReadAt = this.now();
        this.diagnostics.lastMetadataError = null;
      } else {
        this.diagnostics.failedMetadataReads += 1;
        this.diagnostics.lastMetadataError = metadata.error instanceof Error
          ? metadata.error.message
          : "ZebPay trade-pair metadata refresh failed.";
      }
    } catch (error: unknown) {
      this.diagnostics.failedPublicReads += 1;
      this.diagnostics.lastError = error instanceof Error ? error.message : "ZebPay public refresh failed.";
      if (propagateFailure) throw error;
    } finally {
      this.refreshInProgress = false;
    }
  }

  private async bootstrapRestDepth(markets: readonly string[]): Promise<void> {
    const queue = [...new Set(markets)];
    const count = Math.min(queue.length, ZEBPAY.ORDER_BOOK_BOOTSTRAP_CONCURRENCY);
    await Promise.all(Array.from({length: count}, async () => {
      while (queue.length > 0) {
        const canonical = queue.shift();
        if (!canonical) return;
        try {
          const market = toVenueMarket(canonical);
          const book = await this.api.getOrderBook(market);
          const receivedAt = this.now();
          const ticker = normalizeZebPayOrderBookTicker(market, book, receivedAt);
          if (ticker) this.publishExecutable(ticker, canonical, receivedAt);
        } catch (error: unknown) {
          this.diagnostics.lastError = error instanceof Error ? error.message : "ZebPay depth bootstrap failed.";
        }
      }
    }));
  }

  private publishExecutable(ticker: NormalizedTicker, canonical: string, receivedAt: number): void {
    marketCache.update(ticker);
    this.tickerCallback?.(ticker);
    this.executableMarkets.add(canonical);
    this.publishedMarkets.add(ticker.market);
    this.lastUpdate = receivedAt;
    this.diagnostics.lastDepthUpdateAt = receivedAt;
    this.diagnostics.lastError = null;
    this.updateDiagnosticState();
  }

  private openSocket(): void {
    if (this.intentionallyClosed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const socket = this.websocketFactory(ZEBPAY.WEBSOCKET.PUBLIC_URL);
    this.socket = socket;
    socket.on("open", () => {
      if (this.socket !== socket) return;
      this.diagnostics.websocketConnected = true;
      this.sendSubscriptions([...this.requestedMarkets], true);
      this.startPingTimer();
    });
    socket.on("message", (data) => {
      try { this.ingestPublicMessage(JSON.parse(data.toString()) as unknown); } catch { /* ignore heartbeat */ }
    });
    socket.on("error", (error) => { this.diagnostics.lastError = `ZebPay WebSocket error: ${error.message}`; });
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      this.diagnostics.websocketConnected = false;
      this.stopPingTimer();
      if (!this.intentionallyClosed && this.connected) this.scheduleReconnect();
    });
  }

  private sendSubscriptions(markets: readonly string[], subscribe: boolean): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (const market of markets) {
      this.socket.send(JSON.stringify({request: `exchange/${toVenueMarket(market)}`, subscribe}));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.diagnostics.reconnects += 1;
      this.openSocket();
    }, ZEBPAY.WEBSOCKET.RECONNECT_DELAY_MS);
    this.reconnectTimer.unref();
  }

  private startCatalogTimer(): void {
    if (!this.scheduleTimers || this.refreshTimer) return;
    this.refreshTimer = setInterval(() => { void this.refreshCatalog(); }, ZEBPAY.MARKET_REFRESH_MS);
    this.refreshTimer.unref();
  }

  private startPingTimer(): void {
    this.stopPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            request:
              "PING",
          }),
        );
      }
    }, ZEBPAY.WEBSOCKET.PING_INTERVAL_MS);
    this.pingTimer.unref();
  }

  private stopTimers(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.refreshTimer = null;
    this.reconnectTimer = null;
    this.stopPingTimer();
  }

  private stopPingTimer(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            request:
              "STOP",
          }),
        );
      }
      socket.close();
    } catch { socket.terminate(); }
    this.diagnostics.websocketConnected = false;
  }

  private updateDiagnosticState(): void {
    this.diagnostics.requestedMarkets = this.requestedMarkets.size;
    this.diagnostics.executableMarkets = this.executableMarkets.size;
    this.diagnostics.executionEligible = this.executableMarkets.size > 0;
    this.diagnostics.blocker = this.diagnostics.executionEligible ? "NONE" : "QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED";
  }
}

function replaceSet<T>(target: Set<T>, source: ReadonlySet<T>): void {
  target.clear();
  for (const value of source) target.add(value);
}

function toVenueMarket(market: string): string {
  const normalized = normalizeZebPayMarket(market);
  if (normalized.includes("_")) return normalized.replace(/_/gu, "-");
  const quote = ZEBPAY.OBSERVATION_QUOTE_ASSETS.find((asset) => normalized.endsWith(asset));
  return quote ? `${normalized.slice(0, -quote.length)}-${quote}` : normalized;
}

function parseSocketMessage(payload: unknown): {market: string; book: ZebPayOrderBook} | null {
  if (!isRecord(payload)) return null;
  const nested = [payload.data, payload.payload, payload.message].find(isRecord) ?? payload;
  const event = [payload.event, payload.type, nested.event, nested.type].find((value) => typeof value === "string");
  if (typeof event === "string" && !event.toLowerCase().includes("book")) return null;
  /*
   * The production public socket identifies the subscribed book with
   * `requestType` while the actual bids/asks live under `data`. Older
   * fixtures and some acknowledgements use pair/market/request instead.
   */
  const market = [nested.pair, nested.market, payload.pair, payload.market, payload.requestType, payload.request]
    .find((value) => typeof value === "string" && value.length > 0);
  const bids = nested.bids ?? nested.buy;
  const asks = nested.asks ?? nested.sell;
  if (typeof market !== "string" || !Array.isArray(bids) || !Array.isArray(asks)) return null;
  return {
    market: market.replace(/^exchange\//u, ""),
    book: {pair: market, bids: normalizeSocketLevels(bids), asks: normalizeSocketLevels(asks)},
  };
}

function normalizeSocketLevels(levels: readonly unknown[]): ZebPayOrderBook["bids"] {
  const normalized: NonNullable<
    ZebPayOrderBook["bids"]
  > = [];

  for (const level of levels) {
    if (Array.isArray(level)) {
      normalized.push({
        price:
          level[0] as
            string | number,
        amount:
          level[1] as
            string | number,
      });
    } else if (isRecord(level)) {
      normalized.push({
        price:
          level.price as
            string | number,
        amount:
          (
            level.amount ??
            level.quantity ??
            level.qty
          ) as
            string | number,
      });
    }
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
