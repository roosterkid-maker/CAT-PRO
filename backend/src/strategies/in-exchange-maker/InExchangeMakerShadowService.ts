import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

/*
 * IN-EXCHANGE MAKER (IXM) - SHADOW.
 *
 * One coin, one exchange, two markets: the coin's thin INR book and its
 * liquid USDT book. A resting maker order on the INR book is priced from
 * the USDT book (valued through the exchange's own USDT/INR) so that, if
 * it fills, taking the opposite side on the USDT book right away locks in
 * a margin after every fee:
 *
 *   maker BID on COIN/INR  <= USDT bid x USDT/INR bid x (1 - USDT fee)
 *                              / ((1 + INR fee) x (1 + edge))
 *   maker ASK on COIN/INR  >= USDT ask x USDT/INR ask x (1 + USDT fee)
 *                              / ((1 - INR fee) x (1 - edge))
 *
 * A quote is placed one tick inside the INR spread (first in the queue)
 * only when it respects that bound. The USDT/INR leg is not paid per fill:
 * bid and ask fills net out, and only a lasting imbalance is converted.
 *
 * Shadow only: quotes are computed from live CoinDCX quotes and "filled"
 * against the exchange's real public INR trades (a seller-aggressor trade
 * at or below our bid, a buyer-aggressor trade at or above our ask, while
 * our quote stood). The hedge is priced from the USDT book as it was when
 * the quote stood. No order is ever sent.
 */

export interface MakerQuoteInput {
  /** null: that side of the INR book is empty (UnoCoin books are often one-sided). */
  readonly inrBid: number | null;
  readonly inrAsk: number | null;
  readonly usdtBid: number;
  readonly usdtAsk: number;
  readonly usdtInrBid: number;
  readonly usdtInrAsk: number;
  readonly inrFeePercent: number;
  readonly usdtFeePercent: number;
  readonly targetEdgePercent: number;
  readonly tick: number;
}

export interface MakerQuotes {
  /** Highest bid that still clears every fee and the target edge. */
  readonly maximumBid: number;
  /** Lowest ask that still clears every fee and the target edge. */
  readonly minimumAsk: number;
  /** One tick inside the spread when that respects the bound; else null. */
  readonly bid: number | null;
  readonly ask: number | null;
}

const roundDown = (value: number, tick: number) => Math.floor(value / tick + 1e-9) * tick;
const roundUp = (value: number, tick: number) => Math.ceil(value / tick - 1e-9) * tick;

/** Pure: the maker quotes for one coin from its INR book and its USDT book. */
export function computeMakerQuotes(input: MakerQuoteInput): MakerQuotes {
  const inr = input.inrFeePercent / 100;
  const usdt = input.usdtFeePercent / 100;
  const edge = input.targetEdgePercent / 100;
  const maximumBid = (input.usdtBid * input.usdtInrBid * (1 - usdt)) / ((1 + inr) * (1 + edge));
  const minimumAsk = (input.usdtAsk * input.usdtInrAsk * (1 + usdt)) / ((1 - inr) * (1 - edge));
  const decimals = Math.max(0, Math.ceil(-Math.log10(input.tick)) + 2);
  const fix = (value: number) => Number(value.toFixed(decimals));
  // One tick inside the book; alone on an empty side, at the bound itself.
  const improvedBid = input.inrBid === null ? fix(roundDown(maximumBid, input.tick)) : fix(input.inrBid + input.tick);
  const improvedAsk = input.inrAsk === null ? fix(roundUp(minimumAsk, input.tick)) : fix(input.inrAsk - input.tick);
  const bid = improvedBid > 0 && improvedBid < (input.inrAsk ?? Number.POSITIVE_INFINITY) &&
    improvedBid <= roundDown(maximumBid, input.tick) + 1e-12 ? improvedBid : null;
  const ask = improvedAsk > (input.inrBid ?? 0) && improvedAsk >= roundUp(minimumAsk, input.tick) - 1e-12 ? improvedAsk : null;
  return {maximumBid, minimumAsk, bid, ask};
}

export interface PublicTrade {
  readonly price: number;
  readonly quantity: number;
  readonly at: number;
  /** true: the buyer rested (a seller hit the bid). */
  readonly buyerMaker: boolean;
}

interface QuoteSnapshot {
  readonly at: number;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly usdtBid: number;
  readonly usdtAsk: number;
  readonly usdtInrBid: number;
  readonly usdtInrAsk: number;
  readonly hedgeVenue?: string;
}

export interface ShadowFill {
  readonly coin: string;
  readonly side: "BUY" | "SELL";
  readonly at: number;
  readonly price: number;
  readonly quantity: number;
  readonly notionalInr: number;
  /** INR kept after the INR fee, the hedge at the USDT book and its fee. */
  readonly edgeInr: number;
  readonly edgePercent: number;
  /* The hedge leg and the costs, for the detailed fill view. */
  readonly hedgeVenue?: string;
  readonly hedgePriceUsdt?: number;
  readonly hedgeUsdt?: number;
  readonly usdtInr?: number;
  readonly inrFeeInr?: number;
  readonly hedgeFeeInr?: number;
}

/**
 * Pure: our resting quote fills against a public trade when the trade went
 * through our price on the side we rested, while our quote stood.
 */
export function simulateFill(input: {
  readonly coin: string;
  readonly trade: PublicTrade;
  readonly quote: QuoteSnapshot;
  readonly quoteSizeInr: number;
  readonly inrFeePercent: number;
  readonly usdtFeePercent: number;
  /** Units of this standing quote already filled (a quote fills once, then is re-placed). */
  readonly alreadyFilled?: {readonly bid: number; readonly ask: number};
}): ShadowFill | null {
  const inr = input.inrFeePercent / 100;
  const usdt = input.usdtFeePercent / 100;
  const {trade, quote} = input;
  if (trade.buyerMaker && quote.bid !== null && trade.price <= quote.bid) {
    const quantity = Math.min(trade.quantity, input.quoteSizeInr / quote.bid - (input.alreadyFilled?.bid ?? 0));
    if (!(quantity > 1e-12)) return null;
    const cost = quantity * quote.bid * (1 + inr);
    const hedgeUsdt = quantity * quote.usdtBid;
    const hedge = hedgeUsdt * (1 - usdt) * quote.usdtInrBid;
    return {coin: input.coin, side: "BUY", at: trade.at, price: quote.bid, quantity, notionalInr: quantity * quote.bid,
      edgeInr: hedge - cost, edgePercent: ((hedge - cost) / cost) * 100,
      hedgeVenue: quote.hedgeVenue, hedgePriceUsdt: quote.usdtBid, hedgeUsdt, usdtInr: quote.usdtInrBid,
      inrFeeInr: quantity * quote.bid * inr, hedgeFeeInr: hedgeUsdt * usdt * quote.usdtInrBid};
  }
  if (!trade.buyerMaker && quote.ask !== null && trade.price >= quote.ask) {
    const quantity = Math.min(trade.quantity, input.quoteSizeInr / quote.ask - (input.alreadyFilled?.ask ?? 0));
    if (!(quantity > 1e-12)) return null;
    const proceeds = quantity * quote.ask * (1 - inr);
    const hedgeUsdt = quantity * quote.usdtAsk;
    const hedge = hedgeUsdt * (1 + usdt) * quote.usdtInrAsk;
    return {coin: input.coin, side: "SELL", at: trade.at, price: quote.ask, quantity, notionalInr: quantity * quote.ask,
      edgeInr: proceeds - hedge, edgePercent: ((proceeds - hedge) / hedge) * 100,
      hedgeVenue: quote.hedgeVenue, hedgePriceUsdt: quote.usdtAsk, hedgeUsdt, usdtInr: quote.usdtInrAsk,
      inrFeeInr: quantity * quote.ask * inr, hedgeFeeInr: hedgeUsdt * usdt * quote.usdtInrAsk};
  }
  return null;
}

export interface MarketDetail {
  readonly pair: string;
  readonly tick: number;
  readonly minimumNotional: number;
  readonly active: boolean;
}

export interface TopOfBook {
  readonly bid: number;
  readonly ask: number;
}

/** An INR book's top, either side possibly empty. */
export interface InrTop {
  readonly bid: number | null;
  readonly ask: number | null;
}

/**
 * Pure: profit actually realized on the maker exchange. Buys and sells of
 * the same coin are matched first in, first out; each matched unit earns
 * the sell price less the buy price, after the INR fee on both. Hedge legs
 * of a matched pair offset each other, so only matched quantity counts:
 * where coins cannot be moved (UnoCoin), unmatched stock is not profit
 * until the other side fills.
 */
export function roundTrips(fills: readonly ShadowFill[], inrFeePercent: number): {realizedInr: number; matchedQuantity: number; openQuantity: number} {
  const fee = inrFeePercent / 100;
  const buys: {quantity: number; price: number}[] = [];
  const sells: {quantity: number; price: number}[] = [];
  let realizedInr = 0;
  let matchedQuantity = 0;
  for (const fill of [...fills].sort((a, b) => a.at - b.at)) {
    const same = fill.side === "BUY" ? buys : sells;
    const other = fill.side === "BUY" ? sells : buys;
    let remaining = fill.quantity;
    while (remaining > 1e-12 && other.length > 0) {
      const head = other[0]!;
      const quantity = Math.min(remaining, head.quantity);
      const buyPrice = fill.side === "BUY" ? fill.price : head.price;
      const sellPrice = fill.side === "BUY" ? head.price : fill.price;
      realizedInr += quantity * (sellPrice * (1 - fee) - buyPrice * (1 + fee));
      matchedQuantity += quantity;
      remaining -= quantity;
      head.quantity -= quantity;
      if (head.quantity <= 1e-12) other.shift();
    }
    if (remaining > 1e-12) same.push({quantity: remaining, price: fill.price});
  }
  const openQuantity = buys.reduce((sum, lot) => sum + lot.quantity, 0) - sells.reduce((sum, lot) => sum + lot.quantity, 0);
  return {realizedInr, matchedQuantity, openQuantity};
}

/**
 * Everything venue-specific. CoinDCX: maker on its INR book, hedge on its
 * own USDT book. UnoCoin: maker on its INR book, hedge on Binance/Bybit
 * (UnoCoin's USDT books are too thin to hedge on).
 */
export interface InExchangeMakerDependencies {
  /** Canonical INR markets on the maker exchange ("ALEXINR"). */
  readonly listInrMarkets: () => readonly string[];
  /** Fresh INR top of book on the maker exchange (a side may be empty), or null. */
  readonly getInrBook: (market: string) => InrTop | null;
  /** Fresh two-sided top of book of the coin's USDT hedge market, or null. */
  readonly getHedgeBook: (coin: string) => (TopOfBook & {venue: string}) | null;
  /** USDT/INR used to value the hedge. */
  readonly getConversion: () => TopOfBook | null;
  readonly inrFeePercent: () => number;
  readonly hedgeFeePercent: () => number;
  readonly fetchMarketDetails: () => Promise<ReadonlyMap<string, MarketDetail>>;
  readonly fetchTrades: (coin: string, detail: MarketDetail | undefined) => Promise<readonly PublicTrade[]>;
  /** 24 h traded value per INR market, in INR. */
  readonly fetchVolumes: () => Promise<ReadonlyMap<string, number>>;
  /** Polled venues: refresh these INR books before quoting (optional). */
  readonly refreshBooks?: (markets: readonly string[]) => Promise<void>;
  /** Streamed venues: keep these books subscribed (called every quoting pass). */
  readonly subscribeBooks?: (markets: readonly string[]) => void;
  /** Streamed venues: called with a market whenever its book changes; returns an unsubscribe. */
  readonly onBookUpdate?: (listener: (market: string) => void) => () => void;
  readonly now: () => number;
}

export interface InExchangeMakerConfig {
  readonly venue: string;
  readonly targetEdgePercent: number;
  readonly quoteSizeInr: number;
  readonly maximumTrackedCoins: number;
  readonly quoteIntervalMs: number;
  readonly tradePollIntervalMs: number;
  /** INR books trading less than this a day are too quiet to fill a maker. */
  readonly minimumDailyVolumeInr: number;
  /** A coin's net position (fills bought minus sold) beyond this stops that side. */
  readonly maximumInventoryInr: number;
  /** Polled venues: how many busiest INR books to refresh each trade pass. */
  readonly bookRefreshCandidates: number;
  /** Books wider than this are ignored (a thin venue's books can be far wider). */
  readonly maximumSpreadPercent: number;
}

export const DEFAULT_IN_EXCHANGE_MAKER_CONFIG: InExchangeMakerConfig = {
  venue: "coindcx",
  targetEdgePercent: 0.3,
  quoteSizeInr: 1_500,
  maximumTrackedCoins: 15,
  quoteIntervalMs: 5_000,
  tradePollIntervalMs: 15_000,
  minimumDailyVolumeInr: 20_000,
  maximumInventoryInr: 4_500,
  bookRefreshCandidates: 10,
  maximumSpreadPercent: 25,
};

/* Stablecoins track USDT: an INR/USDT spread on them is conversion, not a coin edge. */
const STABLE_COINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDP"]);

interface CoinState {
  snapshots: QuoteSnapshot[];
  /** Units filled per standing quote (keyed by its time), so one quote cannot fill twice. */
  filledByQuote: Map<number, {bid: number; ask: number}>;
  seen: Set<string>;
  lastTradeAt: number;
  tradesSeen: number;
  lastQuote: (MakerQuotes & {at: number; inrBid: number | null; inrAsk: number | null; spreadPercent: number | null; hedgeVenue: string}) | null;
}

interface PersistedState {
  readonly schemaVersion: "1.0";
  startedAt: number;
  fills: ShadowFill[];
}

function isPersisted(value: unknown): value is PersistedState {
  const state = value as Partial<PersistedState> | null;
  return !!state && state.schemaVersion === "1.0" && Array.isArray(state.fills);
}

const SNAPSHOT_RETENTION_MS = 10 * 60_000;
/* Book updates arrive in bursts: one re-price per coin per this window. */
const REQUOTE_DEBOUNCE_MS = 100;
const MAXIMUM_FILLS = 2_000;
const DETAILS_REFRESH_MS = 60 * 60_000;

export class InExchangeMakerShadowService {
  private readonly coins = new Map<string, CoinState>();
  private tracked: string[] = [];
  private details: ReadonlyMap<string, MarketDetail> = new Map();
  private detailsAt = 0;
  private volumes: ReadonlyMap<string, number> = new Map();
  private volumesAt = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private readonly store: JsonlSnapshotStore<PersistedState>;
  private state: PersistedState;
  private polling = false;
  private readonly config: InExchangeMakerConfig;
  private trackedSet = new Set<string>();
  private readonly pendingRequotes = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribeBooks: (() => void) | null = null;
  private bookUpdates = 0;
  private requotes = 0;

  constructor(
    private readonly dependencies: InExchangeMakerDependencies,
    config: Partial<InExchangeMakerConfig> = {},
    filePath?: string,
  ) {
    this.config = {...DEFAULT_IN_EXCHANGE_MAKER_CONFIG, ...config};
    // v2: fills from before one standing quote could fill only once are
    // left untouched in the v1 files and not counted.
    const defaultFile = `in-exchange-maker-shadow-${this.config.venue}-v2.jsonl`;
    this.store = new JsonlSnapshotStore({filePath: filePath ?? resolve(process.cwd(), "logs", "live", defaultFile), isPayload: isPersisted});
    this.state = this.store.readLatest() ?? {schemaVersion: "1.0", startedAt: dependencies.now(), fills: []};
  }

  start(): void {
    if (this.timers.length > 0) return;
    this.timers.push(setInterval(() => this.quoteCycle(), this.config.quoteIntervalMs));
    this.timers.push(setInterval(() => void this.tradeCycle(), this.config.tradePollIntervalMs));
    for (const timer of this.timers) timer.unref?.();
    // Event-driven: re-price a coin shortly after any book it depends on moves.
    this.unsubscribeBooks = this.dependencies.onBookUpdate?.((market) => this.onBook(market)) ?? null;
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    for (const timer of this.pendingRequotes.values()) clearTimeout(timer);
    this.pendingRequotes.clear();
    this.unsubscribeBooks?.();
    this.unsubscribeBooks = null;
    this.persist();
  }

  private onBook(marketValue: string): void {
    const market = marketValue.toUpperCase().replace(/[^A-Z0-9]/gu, "");
    this.bookUpdates += 1;
    const coins = market === "USDTINR"
      ? this.tracked
      : [market.endsWith("USDT") ? market.slice(0, -4) : market.endsWith("INR") ? market.slice(0, -3) : ""].filter((coin) => this.trackedSet.has(coin));
    for (const coin of coins) {
      if (this.pendingRequotes.has(coin)) continue;
      const timer = setTimeout(() => {
        this.pendingRequotes.delete(coin);
        this.requote(coin);
      }, REQUOTE_DEBOUNCE_MS);
      timer.unref?.();
      this.pendingRequotes.set(coin, timer);
    }
  }

  /** Net position per coin from the simulated fills (units bought minus sold). */
  private netQuantity(coin: string): number {
    return this.state.fills.reduce((sum, fill) => (fill.coin === coin ? sum + (fill.side === "BUY" ? fill.quantity : -fill.quantity) : sum), 0);
  }

  /** One quoting pass: choose the coins worth watching and price their quotes. */
  quoteCycle(): void {
    const now = this.dependencies.now();
    const conversion = this.dependencies.getConversion();
    if (!conversion) return;
    const inrFee = this.dependencies.inrFeePercent();
    const hedgeFee = this.dependencies.hedgeFeePercent();

    // Coins with an INR book and a hedge book whose INR spread leaves room
    // for the fees and edge, ranked by that room times the book's traffic:
    // a wide spread nobody trades never fills.
    const room = inrFee + hedgeFee + this.config.targetEdgePercent;
    const ranked: {coin: string; score: number}[] = [];
    for (const market of this.dependencies.listInrMarkets()) {
      const coin = market.slice(0, -3);
      if (!coin || STABLE_COINS.has(coin)) continue;
      const inr = this.dependencies.getInrBook(market);
      const hedge = this.dependencies.getHedgeBook(coin);
      if (!inr || !hedge) continue;
      const detail = this.details.get(market);
      if (detail && !detail.active) continue;
      if (inr.bid === null && inr.ask === null) continue;
      // A one-sided book leaves the empty side entirely to us.
      const spreadPercent = inr.bid !== null && inr.ask !== null ? (inr.ask / inr.bid - 1) * 100 : this.config.maximumSpreadPercent;
      if (spreadPercent < room || spreadPercent > this.config.maximumSpreadPercent) continue;
      const volumeInr = this.volumes.get(market) ?? 0;
      if (this.volumes.size > 0 && volumeInr < this.config.minimumDailyVolumeInr) continue;
      ranked.push({coin, score: (spreadPercent - room) * Math.sqrt(Math.max(1, volumeInr))});
    }
    ranked.sort((a, b) => b.score - a.score);
    this.tracked = ranked.slice(0, this.config.maximumTrackedCoins).map((entry) => entry.coin);
    this.trackedSet = new Set(this.tracked);

    for (const coin of this.tracked) this.quoteCoin(coin, now, conversion, inrFee, hedgeFee);
    // Streamed venues: keep the tracked coins' INR and USDT books open.
    this.dependencies.subscribeBooks?.(this.tracked.flatMap((coin) => [`${coin}INR`, `${coin}USDT`]));
  }

  /** Re-prices one tracked coin now (a book it depends on just changed). */
  requote(coin: string): void {
    if (!this.trackedSet.has(coin)) return;
    const conversion = this.dependencies.getConversion();
    if (!conversion) return;
    this.requotes += 1;
    this.quoteCoin(coin, this.dependencies.now(), conversion, this.dependencies.inrFeePercent(), this.dependencies.hedgeFeePercent());
  }

  private quoteCoin(coin: string, now: number, conversion: TopOfBook, inrFee: number, hedgeFee: number): void {
    const inr = this.dependencies.getInrBook(`${coin}INR`);
    const hedge = this.dependencies.getHedgeBook(coin);
    const state = this.coin(coin);
    if (!inr || !hedge) {
      // The book went stale: our quote is withdrawn until it is fresh again.
      if (state.lastQuote && (state.lastQuote.bid !== null || state.lastQuote.ask !== null)) {
        state.lastQuote = {...state.lastQuote, bid: null, ask: null, at: now};
        state.snapshots.push({...(state.snapshots.at(-1) ?? {usdtBid: 0, usdtAsk: 0, usdtInrBid: 0, usdtInrAsk: 0}), at: now, bid: null, ask: null});
      }
      return;
    }
    const tick = this.details.get(`${coin}INR`)?.tick ?? tickFromPrice(inr.bid ?? inr.ask ?? hedge.bid * conversion.bid);
    const quotes = computeMakerQuotes({
      inrBid: inr.bid, inrAsk: inr.ask, usdtBid: hedge.bid, usdtAsk: hedge.ask,
      usdtInrBid: conversion.bid, usdtInrAsk: conversion.ask,
      inrFeePercent: inrFee, usdtFeePercent: hedgeFee, targetEdgePercent: this.config.targetEdgePercent, tick,
    });
    // Inventory limit: a side that would push the net position further
    // past the limit stops quoting until fills on the other side bring
    // it back (no transfer ever rebalances it).
    const netInr = this.netQuantity(coin) * hedge.bid * conversion.bid;
    const bid = netInr >= this.config.maximumInventoryInr ? null : quotes.bid;
    const ask = netInr <= -this.config.maximumInventoryInr ? null : quotes.ask;
    state.lastQuote = {...quotes, bid, ask, at: now, inrBid: inr.bid, inrAsk: inr.ask,
      spreadPercent: inr.bid !== null && inr.ask !== null ? (inr.ask / inr.bid - 1) * 100 : null, hedgeVenue: hedge.venue};
    // Keep a snapshot when our prices or the hedge moved, or once a second.
    const last = state.snapshots.at(-1);
    if (!last || last.bid !== bid || last.ask !== ask || last.usdtBid !== hedge.bid || last.usdtAsk !== hedge.ask || now - last.at >= 1_000) {
      state.snapshots.push({at: now, bid, ask, usdtBid: hedge.bid, usdtAsk: hedge.ask, usdtInrBid: conversion.bid, usdtInrAsk: conversion.ask, hedgeVenue: hedge.venue});
    }
    if (state.snapshots.length > 0 && now - state.snapshots[0]!.at > SNAPSHOT_RETENTION_MS) {
      state.snapshots = state.snapshots.filter((snapshot) => now - snapshot.at <= SNAPSHOT_RETENTION_MS);
    }
    for (const at of state.filledByQuote.keys()) if (now - at > SNAPSHOT_RETENTION_MS) state.filledByQuote.delete(at);
  }

  /** One trade pass: read each tracked coin's public INR trades and fill our standing quotes. */
  async tradeCycle(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const now = this.dependencies.now();
      if (now - this.volumesAt > 60_000) {
        try {
          this.volumes = await this.dependencies.fetchVolumes();
          this.volumesAt = now;
        } catch {
          // Ranking falls back to spread alone until the next try.
        }
      }
      if (now - this.detailsAt > DETAILS_REFRESH_MS) {
        try {
          this.details = await this.dependencies.fetchMarketDetails();
          this.detailsAt = now;
        } catch {
          // Tick sizes fall back to price-derived steps until the next try.
        }
      }
      if (this.dependencies.refreshBooks) {
        // Polled venues: refresh the busiest INR books that have a hedge.
        const busiest = this.dependencies.listInrMarkets()
          .filter((market) => this.dependencies.getHedgeBook(market.slice(0, -3)) !== null)
          .filter((market) => (this.volumes.get(market) ?? 0) >= this.config.minimumDailyVolumeInr)
          .sort((a, b) => (this.volumes.get(b) ?? 0) - (this.volumes.get(a) ?? 0))
          .slice(0, this.config.bookRefreshCandidates);
        try {
          await this.dependencies.refreshBooks(busiest);
        } catch {
          // Stale books simply drop out of the next quoting pass.
        }
      }
      const inrFee = this.dependencies.inrFeePercent();
      const hedgeFee = this.dependencies.hedgeFeePercent();
      for (const coin of this.tracked) {
        let trades: readonly PublicTrade[];
        try {
          trades = await this.dependencies.fetchTrades(coin, this.details.get(`${coin}INR`));
        } catch {
          continue;
        }
        const state = this.coin(coin);
        for (const trade of [...trades].sort((a, b) => a.at - b.at)) {
          const key = `${trade.at}|${trade.price}|${trade.quantity}|${trade.buyerMaker}`;
          if (state.seen.has(key)) continue;
          state.seen.add(key);
          // Only trades while our quote stood can meet it.
          const standing = [...state.snapshots].reverse().find((snapshot) => snapshot.at <= trade.at);
          if (!standing || trade.at - standing.at > 2 * this.config.quoteIntervalMs) continue;
          state.tradesSeen += 1;
          state.lastTradeAt = Math.max(state.lastTradeAt, trade.at);
          const filled = state.filledByQuote.get(standing.at) ?? {bid: 0, ask: 0};
          const fill = simulateFill({coin, trade, quote: standing, quoteSizeInr: this.config.quoteSizeInr, inrFeePercent: inrFee, usdtFeePercent: hedgeFee, alreadyFilled: filled});
          if (fill) {
            state.filledByQuote.set(standing.at, fill.side === "BUY" ? {...filled, bid: filled.bid + fill.quantity} : {...filled, ask: filled.ask + fill.quantity});
            this.state.fills.push(fill);
            if (this.state.fills.length > MAXIMUM_FILLS) this.state.fills = this.state.fills.slice(-MAXIMUM_FILLS);
          }
        }
        if (state.seen.size > 500) state.seen = new Set([...state.seen].slice(-300));
      }
      this.persist();
    } finally {
      this.polling = false;
    }
  }

  getReport(now = this.dependencies.now()) {
    const perCoin = new Map<string, {fills: number; edgeInr: number; volumeInr: number; buys: number; sells: number}>();
    for (const fill of this.state.fills) {
      const entry = perCoin.get(fill.coin) ?? {fills: 0, edgeInr: 0, volumeInr: 0, buys: 0, sells: 0};
      entry.fills += 1;
      entry.edgeInr += fill.edgeInr;
      entry.volumeInr += fill.notionalInr;
      if (fill.side === "BUY") entry.buys += 1;
      else entry.sells += 1;
      perCoin.set(fill.coin, entry);
    }
    const hours = Math.max(1 / 60, (now - this.state.startedAt) / 3_600_000);
    const totalEdge = this.state.fills.reduce((sum, fill) => sum + fill.edgeInr, 0);
    const inrFee = this.dependencies.inrFeePercent();
    const trips = new Map<string, ReturnType<typeof roundTrips>>();
    for (const coin of perCoin.keys()) trips.set(coin, roundTrips(this.state.fills.filter((fill) => fill.coin === coin), inrFee));
    const realizedInr = [...trips.values()].reduce((sum, trip) => sum + trip.realizedInr, 0);
    return {
      schemaVersion: "1.0" as const,
      generatedAt: now,
      venue: this.config.venue,
      mode: "SHADOW" as const,
      startedAt: this.state.startedAt,
      hoursObserved: hours,
      config: this.config,
      speed: {bookUpdates: this.bookUpdates, requotes: this.requotes, streamed: Boolean(this.dependencies.onBookUpdate)},
      totals: {
        fills: this.state.fills.length,
        edgeInr: totalEdge,
        edgeInrPerDay: (totalEdge / hours) * 24,
        volumeInr: this.state.fills.reduce((sum, fill) => sum + fill.notionalInr, 0),
        /** Profit from buys and sells of the same coin matched on this exchange. */
        roundTripInr: realizedInr,
        roundTripInrPerDay: (realizedInr / hours) * 24,
      },
      coins: [...perCoin.entries()]
        .map(([coin, entry]) => ({coin, ...entry, netQuantity: this.netQuantity(coin), roundTripInr: trips.get(coin)?.realizedInr ?? 0}))
        .sort((a, b) => b.edgeInr - a.edgeInr),
      tracked: this.tracked.map((coin) => {
        const state = this.coins.get(coin);
        return {coin, tradesSeen: state?.tradesSeen ?? 0, dailyVolumeInr: this.volumes.get(`${coin}INR`) ?? null, quote: state?.lastQuote ?? null,
          quoteAgeMs: state?.lastQuote ? now - state.lastQuote.at : null};
      }),
      recentFills: [...this.state.fills].reverse().slice(0, 200),
      safety: {orderSubmissionAllowed: false, note: "Shadow simulation: quotes and fills are computed, never sent."},
    };
  }

  private coin(coin: string): CoinState {
    let state = this.coins.get(coin);
    if (!state) {
      state = {snapshots: [], filledByQuote: new Map(), seen: new Set(), lastTradeAt: 0, tradesSeen: 0, lastQuote: null};
      this.coins.set(coin, state);
    }
    return state;
  }

  private persist(): void {
    try {
      this.store.replaceAllAtomically([this.state]);
    } catch (error: unknown) {
      console.warn(`[IXM-Shadow ${this.config.venue}] Persist failed:`, error instanceof Error ? error.message : error);
    }
  }
}

/** A conservative price step when the exchange's is not loaded: 5 significant digits. */
export function tickFromPrice(price: number): number {
  if (!(price > 0)) return 0.0001;
  // Number("1e-5") is exact; 10 ** -5 is 0.000009999999999999999.
  return Number(`1e${Math.floor(Math.log10(price)) - 4}`);
}

const shared = new Map<string, InExchangeMakerShadowService>();

export function registerInExchangeMakerShadow(venue: string, service: InExchangeMakerShadowService): void {
  shared.set(venue, service);
}

export function getInExchangeMakerShadow(venue = "coindcx"): InExchangeMakerShadowService | null {
  return shared.get(venue) ?? null;
}
