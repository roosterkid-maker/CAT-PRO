/*
 * CAPITAL ALLOCATOR (capital manager v2).
 *
 * Splits the capital that actually exists across the coins whose routes are
 * producing edge, the way a desk manager would: a funded coin always gets
 * whole trades (coin stock on its sell venue AND the matching cash on its
 * buy venue), the coin with the most opportunity per extra trade gets the
 * next one, and a coin that cannot get even one full trade gets nothing
 * rather than a sliver. As capital grows, the same rule hands out more
 * trades and funds more coins.
 *
 * Money only counts where it can reach: USDT moves between Binance and
 * Bybit, but INR (and CoinDCX's USDT, which no API withdraws) stays on the
 * exchange it was deposited on, so each
 * trade draws on the cash pools its two sides live in. Stock of the coin
 * already on its sell venue covers the coin side first. Pure: no I/O.
 */
export interface AllocationCandidate {
  readonly coin: string;
  /** Relative share of opportunity (mostly the last hours, partly the 7-day study). */
  readonly weight: number;
  readonly coinVenue: string;
  readonly coinVenueQuote: "INR" | "USDT";
  readonly cashVenue: string;
  readonly cashAsset: "INR" | "USDT";
  /** INR per trade on each side (the live trade size, or less where depth is thinner). */
  readonly perTradeInr: number;
  readonly maximumTrades: number;
  readonly expectedDailyProfitInr: number;
  /** 7-day study rank, kept for display and tie-breaks. */
  readonly studyRank: number | null;
  /** INR of this coin already held on its sell venue: covers the coin side first. */
  readonly coinHeldInr?: number;
}

export interface CoinAllocation extends AllocationCandidate {
  readonly trades: number;
  readonly coinNeedInr: number;
  readonly cashNeedInr: number;
}

export interface CapitalAllocation {
  readonly budgetInr: number;
  readonly allocatedInr: number;
  readonly coins: readonly CoinAllocation[];
  /** Candidates that got no trade: not enough capital left for one full trade. */
  readonly unfunded: readonly string[];
  /** For each unfunded coin, the cash pool that could not cover one trade (e.g. "unocoin:INR"). */
  readonly unfundedBy?: Readonly<Record<string, string>>;
  /** Per-leg trade size the allocation was sized with. */
  readonly perLegInr?: number;
  /** The same capital split as if it could sit anywhere: where it SHOULD be. */
  readonly ideal?: CapitalAllocation;
}

export interface VenuePlanRow {
  readonly key: string;
  readonly venues: readonly string[];
  /** Cash the operator funds this row with. */
  readonly fundWith: "INR" | "USDT";
  /** INR the ideal split wants here: route cash plus coin stock. */
  readonly targetInr: number;
  readonly cashTargetInr: number;
  readonly stockTargetInr: number;
  /** What is here now that can serve it: cash plus coin stock (idle stock can be sold). */
  readonly haveInr: number;
  /** Positive: short by this much. Negative: holds more than its share. */
  readonly gapInr: number;
}

export interface MisplacedStock {
  readonly coin: string;
  readonly venue: string;
  readonly toVenue: string;
  readonly valueInr: number;
}

/* Rows of the venue plan: the Binance + Bybit USDT pool, then each other exchange. */
const PLAN_ROWS: readonly {key: string; venues: readonly string[]; fundWith: "INR" | "USDT"}[] = [
  {key: "binance+bybit", venues: ["binance", "bybit"], fundWith: "USDT"},
  {key: "coindcx", venues: ["coindcx"], fundWith: "INR"},
  {key: "coinswitch", venues: ["coinswitch"], fundWith: "INR"},
  {key: "unocoin", venues: ["unocoin"], fundWith: "INR"},
];

/**
 * Venue-level capital plan: how much money each exchange should hold for
 * the ideal split of the capital, whatever coins are core right now. The
 * operator only funds exchanges; which coin stock that money becomes is the
 * capital manager's call. Coin names appear only for stock sitting on the
 * wrong exchange, which has to be moved by hand. Pure.
 */
export function buildVenuePlan(input: {
  readonly ideal: CapitalAllocation;
  readonly holdingInr: (venue: string, asset: string) => number | null;
  readonly assets: (venue: string) => readonly string[];
}): {rows: VenuePlanRow[]; misplaced: MisplacedStock[]} {
  const coinVenue = new Map(input.ideal.coins.map((coin) => [coin.coin, coin.coinVenue]));
  const rowOf = (venue: string) => PLAN_ROWS.find((row) => row.venues.includes(venue));
  const rows = PLAN_ROWS.map((row) => ({...row, cashTargetInr: 0, stockTargetInr: 0, haveInr: 0, cashAssets: new Map<string, number>()}));
  const find = (venue: string) => rows.find((row) => row.key === rowOf(venue)?.key);

  for (const coin of input.ideal.coins) {
    const stockRow = find(coin.coinVenue);
    if (stockRow) stockRow.stockTargetInr += coin.coinNeedInr;
    const cashRow = find(coin.cashVenue);
    if (cashRow) {
      cashRow.cashTargetInr += coin.cashNeedInr;
      cashRow.cashAssets.set(coin.cashAsset, (cashRow.cashAssets.get(coin.cashAsset) ?? 0) + coin.cashNeedInr);
    }
  }

  const misplaced: MisplacedStock[] = [];
  for (const row of rows) {
    for (const venue of row.venues) {
      for (const asset of input.assets(venue)) {
        const value = Math.max(0, input.holdingInr(venue, asset) ?? 0);
        if (!(value > 0)) continue;
        const home = coinVenue.get(asset);
        if (asset !== "INR" && asset !== "USDT" && home !== undefined && rowOf(home)?.key !== row.key) {
          misplaced.push({coin: asset, venue, toVenue: home, valueInr: value});
          continue;
        }
        row.haveInr += value;
      }
    }
  }

  return {
    rows: rows.map((row) => {
      const targetInr = Math.round(row.cashTargetInr + row.stockTargetInr);
      const fundWith = row.key === "coindcx" && (row.cashAssets.get("USDT") ?? 0) > (row.cashAssets.get("INR") ?? 0) ? "USDT" : row.fundWith;
      return {
        key: row.key,
        venues: row.venues,
        fundWith,
        targetInr,
        cashTargetInr: Math.round(row.cashTargetInr),
        stockTargetInr: Math.round(row.stockTargetInr),
        haveInr: Math.round(row.haveInr),
        gapInr: Math.round(targetInr - row.haveInr),
      };
    }),
    misplaced: misplaced.filter((item) => item.valueInr >= 300).sort((a, b) => b.valueInr - a.valueInr),
  };
}

/**
 * Where cash can be used: the capital manager moves USDT between Binance
 * and Bybit itself, so those balances are one pool; INR never leaves the
 * exchange it sits on, and CoinDCX USDT has no automatic way out.
 */
export function cashPool(venue: string, asset: "INR" | "USDT"): string {
  if (asset === "USDT" && (venue === "binance" || venue === "bybit")) return "USDT";
  return `${venue}:${asset}`;
}

export function allocateCapital(input: {
  readonly budgetInr: number;
  readonly candidates: readonly AllocationCandidate[];
  /** INR each cash pool can supply; omitted, the whole budget is one pool. */
  readonly poolCapacityInr?: Readonly<Record<string, number>>;
}): CapitalAllocation {
  const candidates = input.candidates.filter((candidate) =>
    candidate.weight > 0 && candidate.perTradeInr > 0 && candidate.maximumTrades > 0);
  const trades = new Map<string, number>(candidates.map((candidate) => [candidate.coin, 0]));
  const held = new Map<string, number>(candidates.map((candidate) => [candidate.coin, Math.max(0, candidate.coinHeldInr ?? 0)]));
  const pools = new Map<string, number>(Object.entries(input.poolCapacityInr ?? {}));
  const usePools = input.poolCapacityInr !== undefined;
  let remaining = Math.max(0, input.budgetInr);

  const cost = (candidate: AllocationCandidate) => {
    const coinCost = Math.max(0, candidate.perTradeInr - (held.get(candidate.coin) ?? 0));
    const coinPool = cashPool(candidate.coinVenue, candidate.coinVenueQuote);
    const cashPoolKey = cashPool(candidate.cashVenue, candidate.cashAsset);
    return {coinCost, cashCost: candidate.perTradeInr, coinPool, cashPool: cashPoolKey};
  };

  /** The pool that blocks one more trade, or null when it fits. */
  const blocker = (candidate: AllocationCandidate): string | null => {
    const next = cost(candidate);
    if (next.coinCost + next.cashCost > remaining) return "budget";
    if (!usePools) return null;
    const capacity = (pool: string) => pools.get(pool) ?? 0;
    if (next.coinPool === next.cashPool) {
      return next.coinCost + next.cashCost <= capacity(next.cashPool) ? null : next.cashPool;
    }
    if (next.cashCost > capacity(next.cashPool)) return next.cashPool;
    if (next.coinCost > capacity(next.coinPool)) return next.coinPool;
    return null;
  };

  for (;;) {
    // Diminishing returns: the next trade goes to the highest weight per trade held.
    const choice = candidates
      .filter((candidate) => (trades.get(candidate.coin) ?? 0) < candidate.maximumTrades && blocker(candidate) === null)
      .sort((a, b) =>
        b.weight / ((trades.get(b.coin) ?? 0) + 1) - a.weight / ((trades.get(a.coin) ?? 0) + 1) ||
        (a.studyRank ?? 1_000) - (b.studyRank ?? 1_000) ||
        a.coin.localeCompare(b.coin))[0];
    if (!choice) break;
    const next = cost(choice);
    trades.set(choice.coin, (trades.get(choice.coin) ?? 0) + 1);
    held.set(choice.coin, Math.max(0, (held.get(choice.coin) ?? 0) - choice.perTradeInr));
    if (usePools) {
      pools.set(next.coinPool, (pools.get(next.coinPool) ?? 0) - next.coinCost);
      pools.set(next.cashPool, (pools.get(next.cashPool) ?? 0) - next.cashCost);
    }
    remaining -= next.coinCost + next.cashCost;
  }

  const coins = candidates
    .filter((candidate) => (trades.get(candidate.coin) ?? 0) > 0)
    .map((candidate) => {
      const count = trades.get(candidate.coin) ?? 0;
      const need = Math.round(count * candidate.perTradeInr);
      return {...candidate, trades: count, coinNeedInr: need, cashNeedInr: need};
    })
    .sort((a, b) => b.weight - a.weight);

  const unfunded = candidates.filter((candidate) => (trades.get(candidate.coin) ?? 0) === 0);
  return {
    budgetInr: input.budgetInr,
    allocatedInr: coins.reduce((sum, coin) => sum + coin.coinNeedInr + coin.cashNeedInr, 0),
    coins,
    unfunded: unfunded.map((candidate) => candidate.coin),
    unfundedBy: Object.fromEntries(unfunded.map((candidate) => [candidate.coin, blocker(candidate) ?? "budget"])),
  };
}
