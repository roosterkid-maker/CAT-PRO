import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  derivativeMarketDataService,
} from "../../derivatives/services/DerivativeMarketDataService";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  CentralStrategyExecutionPlan,
} from "../models/CentralStrategyExecutionPlan";

export interface CentralPaperAssetConversionEvidence {
  readonly id: string;
  readonly sourceAsset: string;
  readonly targetAsset: string;
  readonly sourceQuantity: number;
  readonly targetQuantity: number;
  readonly path: readonly {
    readonly exchange: string;
    readonly market: string;
    readonly direction: "SELL_BASE" | "BUY_BASE";
    readonly sourceTimestamp: number;
    readonly inputAsset: string;
    readonly outputAsset: string;
    readonly inputQuantity: number;
    readonly outputQuantity: number;
  }[];
  readonly generatedAt: number;
  readonly expiresAt: number;
  readonly valuationOnly: true;
  readonly orderSubmissionAllowed: false;
}

export interface CentralPaperCapitalValuation {
  readonly planId: string;
  readonly generatedAt: number;
  readonly currency: "INR";
  readonly amount: number | null;
  readonly sourceRequirements: readonly {readonly asset: string; readonly amount: number}[];
  readonly conversions: readonly CentralPaperAssetConversionEvidence[];
  readonly blockers: readonly string[];
  readonly balanceMutationPerformed: false;
  readonly liveExecutionAllowed: false;
  readonly orderSubmissionAllowed: false;
}

export interface CentralPaperCapitalValuationPort {
  getSpotAsset(
    exchange: string,
    market: string,
  ): {readonly baseAsset: string; readonly quoteAsset: string} | null;
  getPerpetualSettleAsset(exchange: string, market: string, now: number): string | null;
  getConversionBooks(now: number): readonly {
    readonly book: OrderBook;
    readonly baseAsset: string;
    readonly quoteAsset: string;
  }[];

  getConversionBooksRevision?(): number;
}

export class CentralPaperCapitalValuationService {
  private cachedConversionBooks:
    ReturnType<CentralPaperCapitalValuationPort["getConversionBooks"]> | null = null;

  private cachedConversionBooksAt: number | null = null;

  private cachedConversionBooksRevision: number | null = null;

  constructor(
    private readonly port: CentralPaperCapitalValuationPort = new DefaultCentralPaperCapitalValuationPort(),
    private readonly maximumBookAgeMs = 15_000,
    private readonly maximumPathHops = 2,
  ) {
    if (!Number.isSafeInteger(maximumBookAgeMs) || maximumBookAgeMs <= 0) throw new Error("Capital valuation book age must be positive.");
    if (!Number.isSafeInteger(maximumPathHops) || maximumPathHops < 1 || maximumPathHops > 3) throw new Error("Capital valuation path hops must be 1-3.");
  }

  value(plan: CentralStrategyExecutionPlan, now = Date.now()): CentralPaperCapitalValuation {
    const blockers: string[] = [];
    const requirements = this.requirements(plan, now, blockers);
    const books = this.getFreshConversionBooks(now);
    const conversions: CentralPaperAssetConversionEvidence[] = [];

    for (const requirement of requirements) {
      if (requirement.asset === "INR") {
        conversions.push(freeze({
          id: `capital-conversion:${plan.id}:INR:identity`, sourceAsset: "INR", targetAsset: "INR",
          sourceQuantity: requirement.amount, targetQuantity: requirement.amount, path: [], generatedAt: now,
          expiresAt: Math.min(plan.expiresAt, now + this.maximumBookAgeMs), valuationOnly: true,
          orderSubmissionAllowed: false,
        }));
        continue;
      }
      const conversion = findBestConversion(requirement.asset, requirement.amount, "INR", books, now, plan.id, this.maximumPathHops, this.maximumBookAgeMs);
      if (!conversion) blockers.push(`INR_CONVERSION_EVIDENCE_UNAVAILABLE:${requirement.asset}`);
      else conversions.push(conversion);
    }

    const amount = blockers.length === 0 && conversions.length === requirements.length
      ? normalize(conversions.reduce((sum, item) => sum + item.targetQuantity, 0))
      : null;
    return freeze({
      planId: plan.id,
      generatedAt: now,
      currency: "INR",
      amount,
      sourceRequirements: requirements,
      conversions,
      blockers: Array.from(new Set(blockers)),
      balanceMutationPerformed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    });
  }

  convertAssetToInr(
    sourceAsset: string,
    sourceQuantity: number,
    contextId: string,
    now = Date.now(),
  ): CentralPaperAssetConversionEvidence | null {
    const asset = normalizeAsset(sourceAsset);
    if (!asset || !Number.isFinite(sourceQuantity) || sourceQuantity < 0 || !contextId.trim()) return null;
    if (asset === "INR") {
      return freeze({id: `asset-conversion:${contextId}:INR:identity`, sourceAsset: "INR", targetAsset: "INR",
        sourceQuantity, targetQuantity: sourceQuantity, path: [], generatedAt: now,
        expiresAt: now + this.maximumBookAgeMs, valuationOnly: true, orderSubmissionAllowed: false});
    }
    const books = this.getFreshConversionBooks(now);
    return findBestConversion(asset, sourceQuantity, "INR", books, now, contextId, this.maximumPathHops, this.maximumBookAgeMs);
  }

  convertInrToAsset(
    targetAsset: string,
    inrQuantity: number,
    contextId: string,
    now = Date.now(),
  ): CentralPaperAssetConversionEvidence | null {
    const asset = normalizeAsset(targetAsset);
    if (!asset || !Number.isFinite(inrQuantity) || inrQuantity < 0 || !contextId.trim()) return null;
    if (asset === "INR") {
      return freeze({id: `asset-conversion:${contextId}:INR:identity`, sourceAsset: "INR", targetAsset: "INR",
        sourceQuantity: inrQuantity, targetQuantity: inrQuantity, path: [], generatedAt: now,
        expiresAt: now + this.maximumBookAgeMs, valuationOnly: true, orderSubmissionAllowed: false});
    }
    const books = this.getFreshConversionBooks(now);
    return findBestConversion("INR", inrQuantity, asset, books, now, contextId, this.maximumPathHops, this.maximumBookAgeMs);
  }

  private getFreshConversionBooks(
    now: number,
  ): ReturnType<CentralPaperCapitalValuationPort["getConversionBooks"]> {
    const revision =
      this.port.getConversionBooksRevision?.() ?? null;

    if (
      revision !== null &&
      this.cachedConversionBooks !== null &&
      this.cachedConversionBooksAt === now &&
      this.cachedConversionBooksRevision === revision
    ) {
      return this.cachedConversionBooks;
    }

    const books = this.port.getConversionBooks(now).filter((item) =>
      item.book.timestamp <= now && now - item.book.timestamp <= this.maximumBookAgeMs,
    );

    if (revision !== null) {
      this.cachedConversionBooks = books;
      this.cachedConversionBooksAt = now;
      this.cachedConversionBooksRevision = revision;
    }

    return books;
  }

  private requirements(
    plan: CentralStrategyExecutionPlan,
    now: number,
    blockers: string[],
  ): {asset: string; amount: number}[] {
    if (plan.settlementPolicy.kind === "IMMEDIATE_CONVERSION_CYCLE") {
      return [{asset: normalizeAsset(plan.settlementPolicy.startAsset), amount: plan.settlementPolicy.initialQuantity}];
    }
    const byAsset = new Map<string, number>();
    for (const leg of plan.legs) {
      if (leg.quantity === null) { blockers.push(`CAPITAL_QUANTITY_UNAVAILABLE:${leg.id}`); continue; }
      let asset: string | null = null;
      let amount = leg.quantity * leg.referencePrice;
      if (leg.product === "SPOT") {
        const market = this.port.getSpotAsset(leg.exchange, leg.market);
        if (market) {
          asset = leg.side === "BUY" ? market.quoteAsset : market.baseAsset;
          amount = leg.side === "BUY" ? amount : leg.quantity;
        }
      } else {
        asset = this.port.getPerpetualSettleAsset(leg.exchange, leg.market, now);
      }
      asset = asset ? normalizeAsset(asset) : null;
      if (!asset || !Number.isFinite(amount) || amount <= 0) { blockers.push(`CAPITAL_ASSET_EVIDENCE_UNAVAILABLE:${leg.id}`); continue; }
      byAsset.set(asset, (byAsset.get(asset) ?? 0) + amount);
    }
    return [...byAsset.entries()].map(([asset, amount]) => ({asset, amount: normalize(amount)})).sort((a, b) => a.asset.localeCompare(b.asset));
  }
}

class DefaultCentralPaperCapitalValuationPort implements CentralPaperCapitalValuationPort {
  getSpotAsset(exchange: string, market: string) {
    const capability = exchangeCapabilityService.getCachedCapability(exchange, market, "spot");
    return capability ? {baseAsset: capability.baseAsset, quoteAsset: capability.quoteAsset} : null;
  }
  getPerpetualSettleAsset(exchange: string, market: string, now: number): string | null {
    return derivativeMarketDataService.getSnapshot(now).markets.find((item) => item.exchange === exchange && item.market === market)?.settleAsset ?? null;
  }
  getConversionBooks(now: number) {
    return orderBookService.getAll().flatMap((book) => {
      const capability = exchangeCapabilityService.getCachedCapability(book.exchange, book.market, "spot");
      if (!capability || capability.synchronizedAt > now || now - capability.synchronizedAt > 300_000) return [];
      return [{book, baseAsset: normalizeAsset(capability.baseAsset), quoteAsset: normalizeAsset(capability.quoteAsset)}];
    });
  }
  getConversionBooksRevision() { return orderBookService.getRevision(); }
}

function findBestConversion(
  sourceAsset: string,
  sourceQuantity: number,
  targetAsset: string,
  books: readonly {readonly book: OrderBook; readonly baseAsset: string; readonly quoteAsset: string}[],
  now: number,
  planId: string,
  maximumHops: number,
  maximumBookAgeMs: number,
): CentralPaperAssetConversionEvidence | null {
  type State = {asset: string; quantity: number; path: CentralPaperAssetConversionEvidence["path"]; used: Set<string>};
  /*
   * Conversion is a sparse asset graph. Iterating every order book for every
   * frontier state made a two-hop lookup O(frontier x allBooks), even though
   * almost every book is unrelated to the asset being converted. Build one
   * adjacency index and visit only books that can consume the current asset.
   * The candidate set and final ranking are unchanged.
   */
  const booksByAsset = new Map<string, typeof books[number][]>();
  for (const item of books) {
    const baseBooks = booksByAsset.get(item.baseAsset);
    if (baseBooks) baseBooks.push(item);
    else booksByAsset.set(item.baseAsset, [item]);

    if (item.quoteAsset !== item.baseAsset) {
      const quoteBooks = booksByAsset.get(item.quoteAsset);
      if (quoteBooks) quoteBooks.push(item);
      else booksByAsset.set(item.quoteAsset, [item]);
    }
  }

  let frontier: State[] = [{asset: sourceAsset, quantity: sourceQuantity, path: [], used: new Set()}];
  const completed: State[] = [];
  for (let hop = 0; hop < maximumHops; hop += 1) {
    const next: State[] = [];
    for (const state of frontier) {
      for (const item of booksByAsset.get(state.asset) ?? []) {
        const key = `${item.book.exchange}:${item.book.market}`;
        if (state.used.has(key)) continue;
        let output: {asset: string; quantity: number; direction: "SELL_BASE" | "BUY_BASE"} | null = null;
        if (state.asset === item.baseAsset) {
          const quantity = sellBase(item.book, state.quantity);
          if (quantity !== null) output = {asset: item.quoteAsset, quantity, direction: "SELL_BASE"};
        } else if (state.asset === item.quoteAsset) {
          const quantity = buyBase(item.book, state.quantity);
          if (quantity !== null) output = {asset: item.baseAsset, quantity, direction: "BUY_BASE"};
        }
        if (!output) continue;
        const step = freeze({exchange: item.book.exchange, market: item.book.market, direction: output.direction,
          sourceTimestamp: item.book.timestamp, inputAsset: state.asset, outputAsset: output.asset,
          inputQuantity: state.quantity, outputQuantity: output.quantity});
        const candidate: State = {asset: output.asset, quantity: output.quantity, path: [...state.path, step], used: new Set([...state.used, key])};
        if (candidate.asset === targetAsset) completed.push(candidate); else next.push(candidate);
      }
    }

    /*
     * Final ranking always prefers fewer hops before output quantity. Once a
     * path is found at the current breadth-first depth, every later path is
     * strictly worse by that first criterion and cannot win.
     */
    if (completed.length > 0) break;

    frontier = next;
  }
  /*
   * Account valuation prefers the shortest executable conversion path.
   * A direct quote/INR book must not be displaced by a temporarily richer
   * two-hop alt-asset detour, because that would inflate PAPER capital or P&L
   * with unrelated cross-market risk.
   */
  const best = completed.sort((a, b) =>
    a.path.length - b.path.length ||
    b.quantity - a.quantity ||
    pathKey(a.path).localeCompare(pathKey(b.path))
  )[0];
  if (!best) return null;
  const oldest = Math.min(...best.path.map((item) => item.sourceTimestamp));
  return freeze({
    id: `capital-conversion:${planId}:${sourceAsset}:${pathKey(best.path)}`,
    sourceAsset,
    targetAsset,
    sourceQuantity,
    targetQuantity: normalize(best.quantity),
    path: best.path,
    generatedAt: now,
    expiresAt: oldest + maximumBookAgeMs,
    valuationOnly: true,
    orderSubmissionAllowed: false,
  });
}

function sellBase(book: OrderBook, quantity: number): number | null {
  let remaining = quantity; let output = 0;
  for (const level of book.bids) { const fill = Math.min(remaining, level.quantity); output += fill * level.price; remaining -= fill; if (remaining <= 1e-12) break; }
  return remaining <= 1e-12 ? output : null;
}
function buyBase(book: OrderBook, quoteQuantity: number): number | null {
  let remaining = quoteQuantity; let output = 0;
  for (const level of book.asks) { const levelCost = level.price * level.quantity; const spend = Math.min(remaining, levelCost); output += spend / level.price; remaining -= spend; if (remaining <= 1e-8) break; }
  return remaining <= 1e-8 ? output : null;
}
function pathKey(path: CentralPaperAssetConversionEvidence["path"]): string { return path.map((item) => `${item.exchange}-${item.market}-${item.direction}`).join("_"); }
function normalizeAsset(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normalize(value: number): number { return Number(value.toFixed(12)); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const nested of Object.values(value)) freeze(nested); return Object.freeze(value); }

export const centralPaperCapitalValuationService = new CentralPaperCapitalValuationService();
