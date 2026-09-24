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
