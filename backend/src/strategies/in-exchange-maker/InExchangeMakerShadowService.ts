import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

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
  readonly inrBid: number;
  readonly inrAsk: number;
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
  const improvedBid = fix(input.inrBid + input.tick);
  const improvedAsk = fix(input.inrAsk - input.tick);
  const bid = improvedBid < input.inrAsk && improvedBid <= roundDown(maximumBid, input.tick) + 1e-12 ? improvedBid : null;
  const ask = improvedAsk > input.inrBid && improvedAsk >= roundUp(minimumAsk, input.tick) - 1e-12 ? improvedAsk : null;
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
}): ShadowFill | null {
  const inr = input.inrFeePercent / 100;
  const usdt = input.usdtFeePercent / 100;
  const {trade, quote} = input;
  if (trade.buyerMaker && quote.bid !== null && trade.price <= quote.bid) {
    const quantity = Math.min(trade.quantity, input.quoteSizeInr / quote.bid);
    const cost = quantity * quote.bid * (1 + inr);
    const hedge = quantity * quote.usdtBid * (1 - usdt) * quote.usdtInrBid;
    return {coin: input.coin, side: "BUY", at: trade.at, price: quote.bid, quantity, notionalInr: quantity * quote.bid,
      edgeInr: hedge - cost, edgePercent: ((hedge - cost) / cost) * 100};
  }
  if (!trade.buyerMaker && quote.ask !== null && trade.price >= quote.ask) {
    const quantity = Math.min(trade.quantity, input.quoteSizeInr / quote.ask);
    const proceeds = quantity * quote.ask * (1 - inr);
    const hedge = quantity * quote.usdtAsk * (1 + usdt) * quote.usdtInrAsk;
    return {coin: input.coin, side: "SELL", at: trade.at, price: quote.ask, quantity, notionalInr: quantity * quote.ask,
      edgeInr: proceeds - hedge, edgePercent: ((proceeds - hedge) / hedge) * 100};
  }
  return null;
}

export interface MarketDetail {
  readonly pair: string;
  readonly tick: number;
  readonly minimumNotional: number;
  readonly active: boolean;
}

export interface InExchangeMakerDependencies {
  readonly getQuote: (market: string) => ExecutableQuote | undefined;
  readonly listInrMarkets: () => readonly string[];
  readonly fetchMarketDetails: () => Promise<ReadonlyMap<string, MarketDetail>>;
  readonly fetchTrades: (pair: string) => Promise<readonly PublicTrade[]>;
  readonly getFeePercent: (market: string) => number;
  readonly now: () => number;
}

export interface InExchangeMakerConfig {
  readonly targetEdgePercent: number;
  readonly quoteSizeInr: number;
  readonly maximumTrackedCoins: number;
  readonly quoteIntervalMs: number;
  readonly tradePollIntervalMs: number;
  readonly maximumQuoteAgeMs: number;
}

export const DEFAULT_IN_EXCHANGE_MAKER_CONFIG: InExchangeMakerConfig = {
  targetEdgePercent: 0.3,
  quoteSizeInr: 1_500,
  maximumTrackedCoins: 15,
  quoteIntervalMs: 5_000,
  tradePollIntervalMs: 15_000,
  maximumQuoteAgeMs: 60_000,
};

interface CoinState {
  snapshots: QuoteSnapshot[];
  seen: Set<string>;
  lastTradeAt: number;
  tradesSeen: number;
  lastQuote: (MakerQuotes & {at: number; inrBid: number; inrAsk: number; spreadPercent: number}) | null;
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
const MAXIMUM_FILLS = 2_000;
const DETAILS_REFRESH_MS = 60 * 60_000;

export class InExchangeMakerShadowService {
  private readonly coins = new Map<string, CoinState>();
  private tracked: string[] = [];
  private details: ReadonlyMap<string, MarketDetail> = new Map();
  private detailsAt = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private readonly store: JsonlSnapshotStore<PersistedState>;
  private state: PersistedState;
  private polling = false;

  constructor(
    private readonly dependencies: InExchangeMakerDependencies,
    private readonly config: InExchangeMakerConfig = DEFAULT_IN_EXCHANGE_MAKER_CONFIG,
    filePath = resolve(process.cwd(), "logs", "live", "in-exchange-maker-shadow.jsonl"),
  ) {
    this.store = new JsonlSnapshotStore({filePath, isPayload: isPersisted});
    this.state = this.store.readLatest() ?? {schemaVersion: "1.0", startedAt: dependencies.now(), fills: []};
  }

  start(): void {
    if (this.timers.length > 0) return;
    this.timers.push(setInterval(() => this.quoteCycle(), this.config.quoteIntervalMs));
    this.timers.push(setInterval(() => void this.tradeCycle(), this.config.tradePollIntervalMs));
    for (const timer of this.timers) timer.unref?.();
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this.persist();
  }

  /** One quoting pass: choose the coins worth watching and price their quotes. */
  quoteCycle(): void {
    const now = this.dependencies.now();
    const fresh = (quote: ExecutableQuote | undefined) =>
      quote && quote.bestBidPrice !== null && quote.bestAskPrice !== null && quote.bestBidPrice > 0 &&
      quote.bestAskPrice > quote.bestBidPrice && now - quote.timestamp <= this.config.maximumQuoteAgeMs
        ? {bid: quote.bestBidPrice, ask: quote.bestAskPrice}
        : null;
    const conversion = fresh(this.dependencies.getQuote("USDTINR"));
    if (!conversion) return;
    const inrFee = this.dependencies.getFeePercent("XINR");
    const usdtFee = this.dependencies.getFeePercent("XUSDT");

    // Coins in both quotes whose INR spread leaves room for the fees and edge.
    const room = inrFee + usdtFee + this.config.targetEdgePercent;
    const ranked: {coin: string; spreadPercent: number}[] = [];
    for (const market of this.dependencies.listInrMarkets()) {
      const coin = market.slice(0, -3);
      if (!coin || coin === "USDT") continue;
      const inr = fresh(this.dependencies.getQuote(market));
      const usdt = fresh(this.dependencies.getQuote(`${coin}USDT`));
      if (!inr || !usdt) continue;
      const detail = this.details.get(market);
      if (detail && !detail.active) continue;
      const spreadPercent = (inr.ask / inr.bid - 1) * 100;
      if (spreadPercent >= room && spreadPercent <= 25) ranked.push({coin, spreadPercent});
    }
    ranked.sort((a, b) => b.spreadPercent - a.spreadPercent);
    this.tracked = ranked.slice(0, this.config.maximumTrackedCoins).map((entry) => entry.coin);

    for (const coin of this.tracked) {
      const inr = fresh(this.dependencies.getQuote(`${coin}INR`))!;
      const usdt = fresh(this.dependencies.getQuote(`${coin}USDT`))!;
      const tick = this.details.get(`${coin}INR`)?.tick ?? tickFromPrice(inr.bid);
      const quotes = computeMakerQuotes({
        inrBid: inr.bid, inrAsk: inr.ask, usdtBid: usdt.bid, usdtAsk: usdt.ask,
        usdtInrBid: conversion.bid, usdtInrAsk: conversion.ask,
        inrFeePercent: inrFee, usdtFeePercent: usdtFee, targetEdgePercent: this.config.targetEdgePercent, tick,
      });
      const state = this.coin(coin);
      state.lastQuote = {...quotes, at: now, inrBid: inr.bid, inrAsk: inr.ask, spreadPercent: (inr.ask / inr.bid - 1) * 100};
      state.snapshots.push({at: now, bid: quotes.bid, ask: quotes.ask, usdtBid: usdt.bid, usdtAsk: usdt.ask,
        usdtInrBid: conversion.bid, usdtInrAsk: conversion.ask});
      state.snapshots = state.snapshots.filter((snapshot) => now - snapshot.at <= SNAPSHOT_RETENTION_MS);
    }
  }

  /** One trade pass: read each tracked coin's public INR trades and fill our standing quotes. */
  async tradeCycle(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const now = this.dependencies.now();
      if (now - this.detailsAt > DETAILS_REFRESH_MS) {
        try {
          this.details = await this.dependencies.fetchMarketDetails();
          this.detailsAt = now;
        } catch {
          // Tick sizes fall back to price-derived steps until the next try.
        }
      }
      const inrFee = this.dependencies.getFeePercent("XINR");
      const usdtFee = this.dependencies.getFeePercent("XUSDT");
      for (const coin of this.tracked) {
        const pair = this.details.get(`${coin}INR`)?.pair ?? `I-${coin}_INR`;
        let trades: readonly PublicTrade[];
        try {
          trades = await this.dependencies.fetchTrades(pair);
        } catch {
          continue;
        }
        const state = this.coin(coin);
        for (const trade of [...trades].sort((a, b) => a.at - b.at)) {
          const key = `${trade.at}|${trade.price}|${trade.quantity}|${trade.buyerMaker}`;
          if (state.seen.has(key)) continue;
          state.seen.add(key);
          // Only trades after we started watching this coin can meet our quotes.
          const standing = [...state.snapshots].reverse().find((snapshot) => snapshot.at <= trade.at);
          if (!standing || trade.at - standing.at > 2 * this.config.quoteIntervalMs) continue;
          state.tradesSeen += 1;
          state.lastTradeAt = Math.max(state.lastTradeAt, trade.at);
          const fill = simulateFill({coin, trade, quote: standing, quoteSizeInr: this.config.quoteSizeInr, inrFeePercent: inrFee, usdtFeePercent: usdtFee});
          if (fill) {
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
    return {
      schemaVersion: "1.0" as const,
      generatedAt: now,
      mode: "SHADOW" as const,
      startedAt: this.state.startedAt,
      hoursObserved: hours,
      config: this.config,
      totals: {
        fills: this.state.fills.length,
        edgeInr: totalEdge,
        edgeInrPerDay: (totalEdge / hours) * 24,
        volumeInr: this.state.fills.reduce((sum, fill) => sum + fill.notionalInr, 0),
      },
      coins: [...perCoin.entries()].map(([coin, entry]) => ({coin, ...entry})).sort((a, b) => b.edgeInr - a.edgeInr),
      tracked: this.tracked.map((coin) => {
        const state = this.coins.get(coin);
        return {coin, tradesSeen: state?.tradesSeen ?? 0, quote: state?.lastQuote ?? null};
      }),
      recentFills: [...this.state.fills].reverse().slice(0, 30),
      safety: {orderSubmissionAllowed: false, note: "Shadow simulation: quotes and fills are computed, never sent."},
    };
  }

  private coin(coin: string): CoinState {
    let state = this.coins.get(coin);
    if (!state) {
      state = {snapshots: [], seen: new Set(), lastTradeAt: 0, tradesSeen: 0, lastQuote: null};
      this.coins.set(coin, state);
    }
    return state;
  }

  private persist(): void {
    try {
      this.store.replaceAllAtomically([this.state]);
    } catch (error: unknown) {
      console.warn("[IXM-Shadow] Persist failed:", error instanceof Error ? error.message : error);
    }
  }
}

/** A conservative price step when the exchange's is not loaded: 5 significant digits. */
export function tickFromPrice(price: number): number {
  if (!(price > 0)) return 0.0001;
  // Number("1e-5") is exact; 10 ** -5 is 0.000009999999999999999.
  return Number(`1e${Math.floor(Math.log10(price)) - 4}`);
}

let shared: InExchangeMakerShadowService | null = null;

export function registerInExchangeMakerShadow(service: InExchangeMakerShadowService): void {
  shared = service;
}

export function getInExchangeMakerShadow(): InExchangeMakerShadowService | null {
  return shared;
}
