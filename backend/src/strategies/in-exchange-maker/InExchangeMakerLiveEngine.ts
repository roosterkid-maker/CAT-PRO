import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  HEDGE_BELOW_MINIMUM,
  type InrRouteExecuteInput,
  type InrRouteSession,
} from "../../execution/live/inr-routes/InrRouteSessionExecutor";

import {
  commonStep,
  floorToStep,
} from "../../execution/live/inr-routes/InrRoutePlanner";

import {
  computeMakerQuotes,
  type LiveMakerQuote,
} from "./InExchangeMakerShadowService";

/*
 * IN-EXCHANGE MAKER - LIVE (CoinDCX).
 *
 * For each allowlisted coin, a bid worker and an ask worker keep a short
 * maker order resting on the coin's INR book at the shadow's price, and
 * hedge any fill at once on the coin's USDT book - both on CoinDCX. Each
 * order is one INR-route session (the audited executor the INR routes use):
 * the INR leg goes first as a bounded GTC limit (it rests up to
 * primaryTimeoutMs, then is cancelled), and whatever it filled is hedged on
 * the USDT book with widening buffers. An unfilled order is simply
 * re-placed at the next price.
 *
 * Prices are re-derived at order time from fresh INR and USDT books (the
 * stream when it is fresh, else a REST snapshot), so a quiet or
 * unsubscribed book never blocks or misprices an order; the hedge reads a
 * fresh book the same way.
 *
 * Guards: live only with CAT_PRO_IXM_MODE=live, its confirmation phrase and
 * the LIVE-only runtime; allowlisted coins only; a fixed small quote; a
 * never-crossing price check against a fresh INR book; balances; a net
 * inventory cap per coin; an IXM daily loss stop; and any session that does
 * not end cleanly (possible exposure, unhedged residual) halts every worker
 * until the operator releases it. Other runners' exposure halts pause IXM.
 */

export const IXM_LIVE_CONFIRMATION = "ENABLE_CAT_PRO_IXM_LIVE";
export const IXM_HALT_RELEASE_CONFIRMATION = "CONFIRM_IXM_HALT_RELEASE";

export interface IxmLiveConfig {
  readonly mode: "off" | "live";
  readonly coins: readonly string[];
  readonly quoteInr: number;
  readonly maximumInventoryInr: number;
  readonly dailyLossLimitInr: number;
  readonly primaryTimeoutMs: number;
}

export function loadIxmLiveConfig(environment: NodeJS.ProcessEnv = process.env, liveRuntimeEnabled = false): IxmLiveConfig {
  const number = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(environment[name]?.trim() || fallback);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const live =
    environment.CAT_PRO_IXM_MODE?.trim().toLowerCase() === "live" &&
    environment.CAT_PRO_IXM_LIVE_CONFIRMATION?.trim() === IXM_LIVE_CONFIRMATION &&
    liveRuntimeEnabled;
  return {
    mode: live ? "live" : "off",
    coins: (environment.CAT_PRO_IXM_COINS ?? "")
      .split(",")
      .map((coin) => coin.trim().toUpperCase())
      .filter((coin) => /^[A-Z0-9]{1,15}$/u.test(coin))
      .slice(0, 5),
    quoteInr: number("CAT_PRO_IXM_QUOTE_INR", 600, 150, 5_000),
    maximumInventoryInr: number("CAT_PRO_IXM_MAX_INVENTORY_INR", 2_000, 300, 20_000),
    dailyLossLimitInr: number("CAT_PRO_IXM_DAILY_LOSS_INR", 200, 50, 5_000),
    // CoinDCX's audited GTC contract allows at most 10 s.
    primaryTimeoutMs: number("CAT_PRO_IXM_ORDER_LIFE_MS", 8_000, 1_000, 10_000),
  };
}

export interface IxmMarketRules {
  readonly quantityStep: number | null;
  readonly priceStep: number | null;
  readonly minimumQuantity: number | null;
  readonly minimumNotional: number | null;
}

export interface IxmLiveDependencies {
  readonly getQuote: (coin: string) => LiveMakerQuote | null;
  readonly getBook: (market: string) => OrderBook | null;
  /** A REST snapshot when the streamed book is stale (optional). */
  readonly fetchBook?: (market: string) => Promise<OrderBook | null>;
  readonly getRules: (market: string) => IxmMarketRules | null;
  readonly getBalance: (asset: string) => number | null;
  readonly execute: (input: InrRouteExecuteInput) => Promise<InrRouteSession>;
  readonly inrFeePercent: () => number;
  readonly usdtFeePercent: () => number;
  /** Another runner's exposure halt pauses IXM; IXM's own halt is published here. */
  readonly otherExposureHalted: () => boolean;
  readonly publishHalt: (reason: string | null) => void;
  readonly now: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

export interface IxmLiveFill {
  readonly at: number;
  readonly coin: string;
  readonly side: "BUY" | "SELL";
  readonly sessionId: string;
  readonly quantity: number;
  readonly inrPrice: number;
  readonly hedgePriceUsdt: number | null;
  readonly usdtInr: number;
  readonly realizedInr: number;
  /** Units the hedge could not cover (dust). */
  readonly residualQuantity: number;
  readonly state: string;
  /** Units hedged on the USDT book (can exceed the fill when carried inventory joins the hedge). */
  readonly hedgedQuantity?: number;
  /** IXM's position in the coin after this fill. */
  readonly positionAfter?: number;
}

/** IXM's own position in a coin: signed units at an average fee-inclusive INR cost. */
export interface IxmPosition {
  quantity: number;
  averageInr: number;
}

/** Average-cost accounting: applies a trade of `delta` units at `priceInr`; returns realized INR. */
export function applyToPosition(position: IxmPosition, delta: number, priceInr: number): number {
  if (!(Math.abs(delta) > 1e-12)) return 0;
  if (Math.abs(position.quantity) <= 1e-12 || Math.sign(position.quantity) === Math.sign(delta)) {
    const total = Math.abs(position.quantity) + Math.abs(delta);
    position.averageInr = (Math.abs(position.quantity) * position.averageInr + Math.abs(delta) * priceInr) / total;
    position.quantity += delta;
    return 0;
  }
  const closed = Math.min(Math.abs(position.quantity), Math.abs(delta));
  const realized = closed * (position.quantity > 0 ? priceInr - position.averageInr : position.averageInr - priceInr);
  position.quantity += delta;
  if (Math.abs(position.quantity) <= 1e-9) position.quantity = 0;
  // Crossing through flat opens the rest at this trade's price.
  else if (Math.sign(position.quantity) === Math.sign(delta)) position.averageInr = priceInr;
  return realized;
}

interface LiveState {
  readonly schemaVersion: "1.0";
  haltedReason: string | null;
  fills: IxmLiveFill[];
  /** coin -> IXM's position (below-minimum fills carried until a hedge can take them). */
  positions?: Record<string, IxmPosition>;
  /** IST day -> realized INR. */
  daily: Record<string, number>;
  counts: Record<string, number>;
}

function isLiveState(value: unknown): value is LiveState {
  const state = value as Partial<LiveState> | null;
  return !!state && state.schemaVersion === "1.0" && Array.isArray(state.fills) && typeof state.daily === "object";
}

const IST_OFFSET_MS = 330 * 60_000;
/* The shadow quote only says the coin is tracked and carries USDT/INR; prices come from fresh books. */
const QUOTE_MAX_AGE_MS = 10_000;
const BOOK_MAX_AGE_MS = 1_500;
/* Same edge the shadow quotes with. */
const TARGET_EDGE_PERCENT = 0.3;
/* CoinDCX's price band (around the last trade), learned from a rejection. */
const BAND_MEMORY_MS = 60_000;
const BAND_PATTERN = /Price should be within ([0-9.]+) and ([0-9.]+)/u;

function bestOf(book: OrderBook): {bid: number | null; ask: number | null} {
  const bid = book.bids.reduce<number | null>((best, level) => (level.quantity > 0 && (best === null || level.price > best) ? level.price : best), null);
  const ask = book.asks.reduce<number | null>((best, level) => (level.quantity > 0 && (best === null || level.price < best) ? level.price : best), null);
  return {bid, ask};
}
const DAILY_LOSS_PREFIX = "IXM_DAILY_LOSS[";
const MAXIMUM_FILLS = 500;

export function istDay(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export class InExchangeMakerLiveEngine {
  private state: LiveState;
  private readonly store: JsonlSnapshotStore<LiveState>;
  private running = false;
  private readonly workers: Promise<void>[] = [];
  private lastBlock: Record<string, string> = {};
  private readonly bands = new Map<string, {minimum: number; maximum: number; at: number}>();

  constructor(
    private readonly config: IxmLiveConfig,
    private readonly dependencies: IxmLiveDependencies,
    filePath = resolve(process.cwd(), "logs", "live", "in-exchange-maker-live.jsonl"),
  ) {
    this.store = new JsonlSnapshotStore({filePath, isPayload: isLiveState});
    this.state = this.store.readLatest() ?? {schemaVersion: "1.0", haltedReason: null, fills: [], daily: {}, counts: {}};
    if (!this.state.positions) {
      // Earlier state: rebuild each coin's position from its unhedged residuals.
      const positions: Record<string, IxmPosition> = {};
      for (const fill of this.state.fills) {
        const position = positions[fill.coin] ?? (positions[fill.coin] = {quantity: 0, averageInr: 0});
        applyToPosition(position, (fill.side === "BUY" ? 1 : -1) * fill.residualQuantity, fill.inrPrice);
      }
      this.state.positions = positions;
    }
    if (this.state.haltedReason && !this.state.haltedReason.startsWith(DAILY_LOSS_PREFIX)) {
      this.dependencies.publishHalt(this.state.haltedReason);
    }
  }

  start(): void {
    if (this.running || this.config.mode !== "live" || this.config.coins.length === 0) return;
    this.running = true;
    for (const coin of this.config.coins) {
      for (const side of ["BUY", "SELL"] as const) this.workers.push(this.work(coin, side));
    }
    console.log(`[IXM-Live] Started: coins=${this.config.coins.join(",")} quote=₹${this.config.quoteInr} life=${this.config.primaryTimeoutMs}ms.`);
  }

  async stop(): Promise<void> {
    this.running = false;
    await Promise.allSettled(this.workers);
  }

  /**
   * Operator release of a halt (the daily-loss halt lifts on its own at IST
   * midnight). `flattened`: the operator closed IXM's open positions by hand,
   * so they are cleared.
   */
  releaseHalt(confirmation: string, options: {readonly flattened?: boolean} = {}): boolean {
    if (confirmation !== IXM_HALT_RELEASE_CONFIRMATION || !this.state.haltedReason) return false;
    this.state.haltedReason = null;
    if (options.flattened) this.state.positions = {};
    this.dependencies.publishHalt(null);
    this.persist();
    return true;
  }

  realizedTodayInr(now = this.dependencies.now()): number {
    return this.state.daily[istDay(now)] ?? 0;
  }

  getDiagnostics(now = this.dependencies.now()) {
    return {
      schemaVersion: "1.0" as const,
      mode: this.config.mode,
      running: this.running,
      config: this.config,
      haltedReason: this.haltedNow(now),
      realizedTodayInr: this.realizedTodayInr(now),
      counts: {...this.state.counts},
      lastBlock: {...this.lastBlock},
      inventory: Object.fromEntries(this.config.coins.map((coin) => [coin, this.netQuantity(coin)])),
      positions: Object.fromEntries(this.config.coins.map((coin) => [coin, {...(this.state.positions?.[coin] ?? {quantity: 0, averageInr: 0})}])),
      recentFills: [...this.state.fills].reverse().slice(0, 50),
    };
  }

  /** Runs one attempt for (coin, side); exposed for tests. */
  async attempt(coin: string, side: "BUY" | "SELL"): Promise<string> {
    const now = this.dependencies.now();
    const key = `${coin}|${side}`;
    const block = (reason: string) => {
      this.lastBlock[key] = reason;
      return reason;
    };
    const halted = this.haltedNow(now);
    if (halted) return block(`HALTED: ${halted}`);
    if (this.dependencies.otherExposureHalted()) return block("PAUSED: another runner has an exposure halt.");

    const shadow = this.dependencies.getQuote(coin);
    if (!shadow || now - shadow.at > QUOTE_MAX_AGE_MS) return block("NO_QUOTE: the shadow is not tracking this coin now.");

    const inrMarket = `${coin}INR`;
    const usdtMarket = `${coin}USDT`;
    const inrRules = this.dependencies.getRules(inrMarket);
    const usdtRules = this.dependencies.getRules(usdtMarket);
    if (!inrRules || !usdtRules) return block("RULES_MISSING: market rules are not loaded.");
    if (side === "SELL" && (this.dependencies.getBalance(coin) ?? 0) <= 0) return block(`NO_STOCK: 0 ${coin} on CoinDCX.`);

    // Re-price from fresh books: one tick inside the INR book, bounded by
    // the fresh USDT hedge price, fees and the target edge.
    const book = await this.freshBook(inrMarket);
    if (!book) return block("BOOK_STALE: no fresh INR book.");
    const hedgeBook = await this.freshBook(usdtMarket);
    if (!hedgeBook) return block("BOOK_STALE: no fresh USDT book.");
    const {bid: bestBid, ask: bestAsk} = bestOf(book);
    const hedgeTop = bestOf(hedgeBook);
    if (hedgeTop.bid === null || hedgeTop.ask === null) return block("BOOK_STALE: the USDT book is one-sided.");
    const tick = inrRules.priceStep;
    if (!(tick !== null && tick > 0)) return block("RULES_MISSING: no INR price step.");
    const fresh = computeMakerQuotes({
      inrBid: bestBid, inrAsk: bestAsk, usdtBid: hedgeTop.bid, usdtAsk: hedgeTop.ask,
      usdtInrBid: shadow.usdtInrBid, usdtInrAsk: shadow.usdtInrAsk,
      inrFeePercent: this.dependencies.inrFeePercent(), usdtFeePercent: this.dependencies.usdtFeePercent(),
      targetEdgePercent: TARGET_EDGE_PERCENT, tick,
    });
    const quote = {...shadow, bid: fresh.bid, ask: fresh.ask, usdtBid: hedgeTop.bid, usdtAsk: hedgeTop.ask};
    let price = side === "BUY" ? quote.bid : quote.ask;
    if (price === null) return block("NO_EDGE: the fresh books leave no room for this side.");
    // Stay inside the exchange's price band: move to its edge when the fee
    // bound still allows it, else wait (an out-of-band order is refused).
    const band = this.bands.get(inrMarket);
    if (band && now - band.at <= BAND_MEMORY_MS) {
      if (side === "BUY" && price < band.minimum) {
        const lifted = Math.ceil(band.minimum / tick - 1e-9) * tick;
        if (lifted > fresh.maximumBid || (bestAsk !== null && lifted >= bestAsk)) return block(`OUTSIDE_BAND: the exchange accepts ${band.minimum}-${band.maximum}; the edge allows at most ${fresh.maximumBid.toFixed(6)}.`);
        price = Number(lifted.toFixed(12));
      }
      if (side === "SELL" && price > band.maximum) {
        const lowered = Math.floor(band.maximum / tick + 1e-9) * tick;
        if (lowered < fresh.minimumAsk || (bestBid !== null && lowered <= bestBid)) return block(`OUTSIDE_BAND: the exchange accepts ${band.minimum}-${band.maximum}; the edge needs at least ${fresh.minimumAsk.toFixed(6)}.`);
        price = Number(lowered.toFixed(12));
      }
      if (price < band.minimum || price > band.maximum) return block(`OUTSIDE_BAND: ${price} is outside ${band.minimum}-${band.maximum}.`);
    }
    quote.bid = side === "BUY" ? price : quote.bid;
    quote.ask = side === "SELL" ? price : quote.ask;
    // Never cross: a maker bid must stay below the best ask (and an ask
    // above the best bid) of the fresh INR book, or it would trade as taker.
    if (side === "BUY" && bestAsk !== null && price >= bestAsk) return block("WOULD_CROSS: bid at or above the best ask.");
    if (side === "SELL" && bestBid !== null && price <= bestBid) return block("WOULD_CROSS: ask at or below the best bid.");
    const step = commonStep(inrRules.quantityStep, usdtRules.quantityStep) ?? Math.max(inrRules.quantityStep ?? 0, usdtRules.quantityStep ?? 0);
    if (!(step > 0)) return block("RULES_MISSING: no common lot step.");
    const quantity = floorToStep(this.config.quoteInr / price, step);
    const hedgePrice = side === "BUY" ? quote.usdtBid : quote.usdtAsk;
    if (!(quantity > 0)) return block("SIZE_ZERO: quote rounds to zero.");
    for (const [rules, notional] of [[inrRules, quantity * price], [usdtRules, quantity * hedgePrice]] as const) {
      if (rules.minimumQuantity !== null && quantity < rules.minimumQuantity) return block("BELOW_MINIMUM: under a market's minimum quantity.");
      if (rules.minimumNotional !== null && notional < rules.minimumNotional) return block("BELOW_MINIMUM: under a market's minimum order value.");
    }

    // Inventory: fills are hedged, but a hedge can fall short (dust); keep
    // the coin's net position bounded either way.
    const netInr = this.netQuantity(coin) * price;
    if (side === "BUY" && netInr >= this.config.maximumInventoryInr) return block("INVENTORY_LIMIT: long past the limit.");
    if (side === "SELL" && netInr <= -this.config.maximumInventoryInr) return block("INVENTORY_LIMIT: short past the limit.");

    // Balances: a bid spends INR and its hedge sells the coin just bought;
    // an ask sells coin held here and its hedge buys it back with USDT.
    if (side === "BUY") {
      const inr = this.dependencies.getBalance("INR") ?? 0;
      if (inr < quantity * price * 1.01) return block(`NO_FUNDS: ₹${inr.toFixed(0)} INR on CoinDCX.`);
    } else {
      const held = this.dependencies.getBalance(coin) ?? 0;
      const usdt = this.dependencies.getBalance("USDT") ?? 0;
      if (held < quantity) return block(`NO_STOCK: ${held} ${coin} on CoinDCX.`);
      if (usdt < quantity * quote.usdtAsk * 1.02) return block(`NO_FUNDS: ${usdt.toFixed(2)} USDT on CoinDCX.`);
    }

    const feesPercent = this.dependencies.inrFeePercent() + this.dependencies.usdtFeePercent();
    const buyInr = side === "BUY";
    // Carried inventory joins this fill's hedge: flatten as far as the fill allows.
    const carried = this.netQuantity(coin);
    const hedgeQuantityAdjustment = buyInr ? Math.max(-quantity, carried) : Math.max(-quantity, -carried);
    const session = await this.dependencies.execute({
      route: {
        routeKey: `IXM|${coin}|coindcx|${buyInr ? inrMarket : usdtMarket}|coindcx|${buyInr ? usdtMarket : inrMarket}`,
        kind: "IXM",
        coin,
        buyVenue: "coindcx",
        buyMarket: buyInr ? inrMarket : usdtMarket,
        sellVenue: "coindcx",
        sellMarket: buyInr ? usdtMarket : inrMarket,
        buyVenueMarket: buyInr ? inrMarket : usdtMarket,
        sellVenueMarket: buyInr ? usdtMarket : inrMarket,
        buyToInr: buyInr ? 1 : quote.usdtInrAsk,
        sellToInr: buyInr ? quote.usdtInrBid : 1,
        feesPercent,
      },
      plan: {
        quantity,
        buyLimitPrice: buyInr ? price : quote.usdtAsk,
        sellLimitPrice: buyInr ? quote.usdtBid : price,
        buyAveragePrice: buyInr ? price : quote.usdtAsk,
        sellAveragePrice: buyInr ? quote.usdtBid : price,
        notionalInr: quantity * price,
        expectedNetPercent: 0,
        expectedNetInr: 0,
      },
      primaryTimeoutMs: this.config.primaryTimeoutMs,
      hedgeQuantityAdjustment,
      hedgeBufferPercents: [0.15, 0.5, 1],
      dustToleranceInr: 150,
      hedgeRules: {
        quantityStep: usdtRules.quantityStep ?? step,
        minimumQuantity: usdtRules.minimumQuantity,
        minimumNotional: usdtRules.minimumNotional,
        priceStep: usdtRules.priceStep,
      },
      getHedgeLevels: async () => {
        const levels = await this.freshBook(usdtMarket);
        if (!levels) return null;
        return buyInr
          ? [...levels.bids].sort((a, b) => b.price - a.price)
          : [...levels.asks].sort((a, b) => a.price - b.price);
      },
    });

    this.state.counts[session.state] = (this.state.counts[session.state] ?? 0) + 1;
    if (session.state === "NO_FILL") {
      this.persist();
      // The exchange refused the order (price band, funds, rules): back off, do not hammer it.
      if (session.primary?.status === "FAILED") {
        const reason = session.primary.reasons.join(" ");
        const match = BAND_PATTERN.exec(reason);
        if (match) this.bands.set(inrMarket, {minimum: Number(match[1]), maximum: Number(match[2]), at: now});
        return block(`REJECTED: ${reason || "the exchange refused the order."}`);
      }
      return block("NO_FILL");
    }
    const filled = session.primary?.filledQuantity ?? 0;
    let carriedBelowMinimum = false;
    if (filled > 0) {
      // P&L from IXM's position: the INR leg and the hedge at fee-inclusive INR prices.
      const inrFee = this.dependencies.inrFeePercent() / 100;
      const usdtFee = this.dependencies.usdtFeePercent() / 100;
      const positions = this.state.positions ?? (this.state.positions = {});
      const position = positions[coin] ?? (positions[coin] = {quantity: 0, averageInr: 0});
      const inrPrice = session.primary?.averagePrice ?? price;
      let realized = applyToPosition(position, (buyInr ? 1 : -1) * filled, inrPrice * (buyInr ? 1 + inrFee : 1 - inrFee));
      const usdtInr = buyInr ? quote.usdtInrBid : quote.usdtInrAsk;
      for (const hedge of session.hedges) {
        const units = hedge.filledQuantity ?? 0;
        if (!(units > 0) || !hedge.averagePrice) continue;
        realized += applyToPosition(position, (buyInr ? -1 : 1) * units, hedge.averagePrice * usdtInr * (buyInr ? 1 - usdtFee : 1 + usdtFee));
      }
      // Under the hedge minimum is carried (not an exposure) while within the inventory limit.
      carriedBelowMinimum = session.state === "RECOVERY_REQUIRED" &&
        session.reasons.some((reason) => reason.startsWith(HEDGE_BELOW_MINIMUM)) &&
        Math.abs(position.quantity) * inrPrice <= this.config.maximumInventoryInr;
      const hedgeFill = session.hedges.find((hedge) => (hedge.filledQuantity ?? 0) > 0);
      this.state.fills.push({
        at: session.updatedAt,
        coin,
        side,
        sessionId: session.sessionId,
        quantity: filled,
        inrPrice: session.primary?.averagePrice ?? price,
        hedgePriceUsdt: hedgeFill?.averagePrice ?? null,
        usdtInr: buyInr ? quote.usdtInrBid : quote.usdtInrAsk,
        realizedInr: realized,
        residualQuantity: session.residualQuantity,
        state: carriedBelowMinimum ? "CARRIED" : session.state,
        hedgedQuantity: session.hedgedQuantity,
        positionAfter: position.quantity,
      });
      if (this.state.fills.length > MAXIMUM_FILLS) this.state.fills = this.state.fills.slice(-MAXIMUM_FILLS);
      const day = istDay(now);
      this.state.daily[day] = (this.state.daily[day] ?? 0) + realized;
      if (this.state.daily[day]! <= -this.config.dailyLossLimitInr) {
        this.state.haltedReason = `${DAILY_LOSS_PREFIX}${day}]: IXM realized ₹${this.state.daily[day]!.toFixed(2)} today reached the -₹${this.config.dailyLossLimitInr} stop.`;
      }
    }
    if (session.state !== "COMPLETED" && session.state !== "DUST_RESIDUAL" && !carriedBelowMinimum) {
      // Possible exposure, unhedged residual, or any state we do not expect.
      this.state.haltedReason = `IXM ${session.state}: session ${session.sessionId} on ${coin} ${side}. ${session.reasons.join(" ")}`.trim();
      this.dependencies.publishHalt(this.state.haltedReason);
    }
    this.persist();
    return block(session.state);
  }

  private async work(coin: string, side: "BUY" | "SELL"): Promise<void> {
    while (this.running) {
      let outcome: string;
      try {
        outcome = await this.attempt(coin, side);
      } catch (error: unknown) {
        // An exception mid-session is treated as possible exposure.
        this.state.haltedReason = `IXM ERROR on ${coin} ${side}: ${error instanceof Error ? error.message : String(error)}`;
        this.dependencies.publishHalt(this.state.haltedReason);
        this.persist();
        outcome = "ERROR";
      }
      // Busy states retry quickly; blocks and halts back off.
      const pause = outcome === "NO_FILL" || outcome === "COMPLETED" || outcome === "DUST_RESIDUAL" ? 100
        : outcome.startsWith("REJECTED") ? 15_000 : outcome.startsWith("HALTED") ? 5_000 : 1_000;
      await this.dependencies.sleep(pause);
    }
  }

  /** The streamed book when fresh, else a REST snapshot; null when neither is fresh. */
  private async freshBook(market: string): Promise<OrderBook | null> {
    const streamed = this.dependencies.getBook(market);
    if (streamed && this.dependencies.now() - streamed.timestamp <= BOOK_MAX_AGE_MS) return streamed;
    const fetched = await (this.dependencies.fetchBook?.(market) ?? Promise.resolve(null)).catch(() => null);
    return fetched && this.dependencies.now() - fetched.timestamp <= BOOK_MAX_AGE_MS ? fetched : null;
  }

  private haltedNow(now: number): string | null {
    const reason = this.state.haltedReason;
    if (!reason) return null;
    // The daily-loss halt lifts at the next IST midnight.
    if (reason.startsWith(DAILY_LOSS_PREFIX) && !reason.startsWith(`${DAILY_LOSS_PREFIX}${istDay(now)}]`)) {
      this.state.haltedReason = null;
      this.persist();
      return null;
    }
    return reason;
  }

  /** IXM's open position in the coin (carried, unhedged units). */
  private netQuantity(coin: string): number {
    return this.state.positions?.[coin]?.quantity ?? 0;
  }

  private persist(): void {
    try {
      this.store.replaceAllAtomically([this.state]);
    } catch (error: unknown) {
      console.warn("[IXM-Live] Persist failed:", error instanceof Error ? error.message : error);
    }
  }
}

