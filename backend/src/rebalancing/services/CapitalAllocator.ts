/*
 * CAPITAL ALLOCATOR (capital manager v2).
 *
 * Splits the capital that actually exists across the coins whose routes are
 * producing edge, the way a desk manager would: a funded coin always gets
 * whole trades (coin stock on its sell venue AND the matching cash on its
 * buy venue), the coin with the most opportunity per extra trade gets the
 * next one, and a coin that cannot get even one full trade gets nothing
 * rather than a sliver. As capital grows, the same rule hands out more
 * trades and funds more coins. Pure: no I/O.
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
}

export function allocateCapital(input: {
  readonly budgetInr: number;
  readonly candidates: readonly AllocationCandidate[];
}): CapitalAllocation {
  const candidates = input.candidates.filter((candidate) =>
    candidate.weight > 0 && candidate.perTradeInr > 0 && candidate.maximumTrades > 0);
  const trades = new Map<string, number>(candidates.map((candidate) => [candidate.coin, 0]));
  let remaining = Math.max(0, input.budgetInr);

  for (;;) {
    // Diminishing returns: the next trade goes to the highest weight per trade held.
    const next = candidates
      .filter((candidate) => (trades.get(candidate.coin) ?? 0) < candidate.maximumTrades && 2 * candidate.perTradeInr <= remaining)
      .sort((a, b) =>
        b.weight / ((trades.get(b.coin) ?? 0) + 1) - a.weight / ((trades.get(a.coin) ?? 0) + 1) ||
        (a.studyRank ?? 1_000) - (b.studyRank ?? 1_000) ||
        a.coin.localeCompare(b.coin))[0];
    if (!next) break;
    trades.set(next.coin, (trades.get(next.coin) ?? 0) + 1);
    remaining -= 2 * next.perTradeInr;
  }

  const coins = candidates
    .filter((candidate) => (trades.get(candidate.coin) ?? 0) > 0)
    .map((candidate) => {
      const count = trades.get(candidate.coin) ?? 0;
      const need = Math.round(count * candidate.perTradeInr);
      return {...candidate, trades: count, coinNeedInr: need, cashNeedInr: need};
    })
    .sort((a, b) => b.weight - a.weight);

  return {
    budgetInr: input.budgetInr,
    allocatedInr: coins.reduce((sum, coin) => sum + coin.coinNeedInr + coin.cashNeedInr, 0),
    coins,
    unfunded: candidates.filter((candidate) => (trades.get(candidate.coin) ?? 0) === 0).map((candidate) => candidate.coin),
  };
}

/**
 * Where freed cash can be used: USDT moves between Binance, Bybit and
 * CoinDCX automatically, so those balances are one pool; INR never leaves
 * the exchange it sits on.
 */
export function cashPool(venue: string, asset: "INR" | "USDT"): string {
  if (asset === "USDT" && (venue === "binance" || venue === "bybit" || venue === "coindcx")) return "USDT";
  return `${venue}:${asset}`;
}
