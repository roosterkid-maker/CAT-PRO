/*
 * ROUTE INVENTORY REFILL PLANNER (capital manager, step B).
 *
 * The coin study says, per core coin, where the coin must sit (the exchange
 * it is SOLD on) and where the cash must sit (the exchange it is BOUGHT on),
 * sized in trades. Every trade drains those and piles the coin up where it
 * was bought and the cash where it was sold. This planner compares targets
 * with live holdings and emits refill actions:
 *
 *   MOVE_USDT   USDT from a venue with surplus to one below target
 *   MOVE_COIN   the coin from where it accumulated back to its sell venue
 *   BUY_COIN    the coin is nowhere to move from: buy it on the sell venue
 *   DEPOSIT_INR INR below target on an INR buy venue (bank deposit)
 *
 * An action is AUTO only when the capital manager can do it itself: USDT
 * withdrawn from Binance or Bybit to a whitelisted exchange, or (when enabled) buying
 * a core coin on its sell venue with that venue's cash. Everything else is a
 * MANUAL instruction for the operator. Pure: no I/O.
 */
export type RefillActionKind = "MOVE_USDT" | "MOVE_COIN" | "BUY_COIN" | "DEPOSIT_INR";

export interface RefillAction {
  readonly id: string;
  readonly priority: number;
  readonly kind: RefillActionKind;
  readonly coins: readonly string[];
  readonly asset: string;
  readonly fromVenue: string | null;
  readonly toVenue: string;
  readonly amountInr: number;
  /** Units of `asset` for coin moves; null for cash. */
  readonly quantity: number | null;
  readonly mode: "AUTO" | "MANUAL";
  /** BUY_COIN only: the quote the coin is bought with on its sell venue. */
  readonly buyQuote?: "INR" | "USDT";
  readonly reason: string;
  readonly howTo: string;
}

export interface RefillTarget {
  readonly coin: string;
  readonly rank: number;
  readonly coinVenue: string;
  readonly coinNeedInr: number;
  readonly cashVenue: string;
  readonly cashAsset: "INR" | "USDT";
  readonly cashNeedInr: number;
  /** Quote of the market the coin is SOLD on at its coin venue. */
  readonly coinVenueQuote?: "INR" | "USDT";
}

export interface RefillPlanInput {
  readonly targets: readonly RefillTarget[];
  readonly venues: readonly string[];
  readonly holdingInr: (venue: string, asset: string) => number | null;
  readonly priceInr: (asset: string) => number | null;
  /** Venues Binance may auto-send USDT to (whitelisted, capital manager enabled). */
  readonly autoUsdtDestinations: readonly string[];
  /** Venues Bybit may auto-send USDT to (whitelisted, Bybit withdrawals enabled). */
  readonly bybitAutoUsdtDestinations?: readonly string[];
  /** Venues where the capital manager may buy core-basket stock itself. */
  readonly autoBuyVenues?: readonly string[];
  /** Refill once holdings fall below this share of target. */
  readonly refillBelowShare: number;
  /** INR kept untouched at a USDT source beyond its own targets. */
  readonly sourceFloorInr: number;
  /** Actions smaller than this are not worth a transfer fee. */
  readonly minimumActionInr: number;
}

export interface RefillPlan {
  readonly actions: readonly RefillAction[];
  readonly covered: ReadonlyArray<{readonly venue: string; readonly asset: string; readonly haveInr: number | null; readonly targetInr: number}>;
}

const VENUE_NAME: Readonly<Record<string, string>> = {
  binance: "Binance",
  bybit: "Bybit",
  coindcx: "CoinDCX",
  coinswitch: "CoinSwitch",
  unocoin: "UnoCoin",
};

function name(venue: string): string {
  return VENUE_NAME[venue] ?? venue;
}

export function planRouteRefills(input: RefillPlanInput): RefillPlan {
  // Aggregate targets per (venue, asset): cash targets add up across coins
  // sharing a buy venue; each coin has one sell venue.
  const targets = new Map<string, {venue: string; asset: string; targetInr: number; coins: string[]; rank: number; quote?: "INR" | "USDT"}>();
  const add = (venue: string, asset: string, amount: number, coin: string, rank: number, quote?: "INR" | "USDT") => {
    if (!(amount > 0)) return;
    const key = `${venue}|${asset}`;
    const entry = targets.get(key) ?? {venue, asset, targetInr: 0, coins: [], rank, quote};
    entry.targetInr += amount;
    if (!entry.coins.includes(coin)) entry.coins.push(coin);
    entry.rank = Math.min(entry.rank, rank);
    targets.set(key, entry);
  };
  for (const target of input.targets) {
    add(target.coinVenue, target.coin, target.coinNeedInr, target.coin, target.rank, target.coinVenueQuote);
    add(target.cashVenue, target.cashAsset, target.cashNeedInr, target.coin, target.rank);
  }

  const actions: RefillAction[] = [];
  const covered: Array<{venue: string; asset: string; haveInr: number | null; targetInr: number}> = [];
  const usdtSpent = new Map<string, number>();

  const ordered = [...targets.values()].sort((a, b) => a.rank - b.rank);
  for (const target of ordered) {
    const have = input.holdingInr(target.venue, target.asset);
    covered.push({venue: target.venue, asset: target.asset, haveInr: have, targetInr: target.targetInr});
    if (have === null || have >= target.targetInr * input.refillBelowShare) continue;
    const deficit = target.targetInr - have;
    if (deficit < input.minimumActionInr) continue;
    const forCoins = target.coins.join(", ");

    if (target.asset === "USDT") {
      // Largest USDT surplus elsewhere, after that venue's own targets and a floor.
      const sources = input.venues
        .filter((venue) => venue !== target.venue)
        .map((venue) => {
          const held = input.holdingInr(venue, "USDT") ?? 0;
          const own = targets.get(`${venue}|USDT`)?.targetInr ?? 0;
          return {venue, surplus: held - own - input.sourceFloorInr - (usdtSpent.get(venue) ?? 0)};
        })
        .filter((source) => source.surplus >= input.minimumActionInr)
        .sort((a, b) => (b.venue === "binance" ? 1 : 0) - (a.venue === "binance" ? 1 : 0) || b.surplus - a.surplus);
      const source = sources[0];
      if (source) {
        const amount = Math.min(deficit, source.surplus);
        usdtSpent.set(source.venue, (usdtSpent.get(source.venue) ?? 0) + amount);
        const auto =
          (source.venue === "binance" && input.autoUsdtDestinations.includes(target.venue)) ||
          (source.venue === "bybit" && (input.bybitAutoUsdtDestinations ?? []).includes(target.venue));
        actions.push({
          id: `MOVE_USDT|${source.venue}>${target.venue}`,
          priority: target.rank,
          kind: "MOVE_USDT",
          coins: target.coins,
          asset: "USDT",
          fromVenue: source.venue,
          toVenue: target.venue,
          amountInr: amount,
          quantity: null,
          mode: auto ? "AUTO" : "MANUAL",
          reason: `${name(target.venue)} USDT buys ${forCoins}: holds ₹${Math.round(have)} of ₹${Math.round(target.targetInr)} target.`,
          howTo: auto
            ? `Capital manager withdraws USDT from ${name(source.venue)} to the whitelisted ${name(target.venue)} address (per-transfer and daily caps apply).`
            : `Withdraw ≈₹${Math.round(amount)} of USDT from ${name(source.venue)} to your ${name(target.venue)} USDT deposit address.`,
        });
      } else {
        actions.push({
          id: `DEPOSIT_USDT|${target.venue}`,
          priority: target.rank,
          kind: "MOVE_USDT",
          coins: target.coins,
          asset: "USDT",
          fromVenue: null,
          toVenue: target.venue,
          amountInr: deficit,
          quantity: null,
          mode: "MANUAL",
          reason: `${name(target.venue)} USDT buys ${forCoins}: holds ₹${Math.round(have)} of ₹${Math.round(target.targetInr)}; no other exchange has spare USDT.`,
          howTo: `Add ≈₹${Math.round(deficit)} of USDT to ${name(target.venue)}.`,
        });
      }
      continue;
    }

    if (target.asset === "INR") {
      const usdtThere = input.holdingInr(target.venue, "USDT") ?? 0;
      const convertible = (target.venue === "coindcx" || target.venue === "coinswitch") && usdtThere >= input.minimumActionInr;
      actions.push({
        id: `DEPOSIT_INR|${target.venue}`,
        priority: target.rank,
        kind: "DEPOSIT_INR",
        coins: target.coins,
        asset: "INR",
        fromVenue: null,
        toVenue: target.venue,
        amountInr: deficit,
        quantity: null,
        mode: "MANUAL",
        reason: `${name(target.venue)} INR buys ${forCoins}: holds ₹${Math.round(have)} of ₹${Math.round(target.targetInr)} target.`,
        howTo: convertible
          ? `Deposit ≈₹${Math.round(deficit)} INR to ${name(target.venue)}, or sell up to ₹${Math.round(Math.min(usdtThere, deficit))} of the USDT already there for INR.`
          : `Deposit ≈₹${Math.round(deficit)} INR to ${name(target.venue)}.`,
      });
      continue;
    }

    // A coin below target on its sell venue: move it back from where it piled up.
    const price = input.priceInr(target.asset);
    const best = input.venues
      .filter((venue) => venue !== target.venue)
      .map((venue) => ({venue, held: input.holdingInr(venue, target.asset) ?? 0}))
      .sort((a, b) => b.held - a.held)[0];
    if (best && best.held >= input.minimumActionInr) {
      const amount = Math.min(deficit, best.held);
      actions.push({
        id: `MOVE_COIN|${target.asset}|${best.venue}>${target.venue}`,
        priority: target.rank,
        kind: "MOVE_COIN",
        coins: target.coins,
        asset: target.asset,
        fromVenue: best.venue,
        toVenue: target.venue,
        amountInr: amount,
        quantity: price ? amount / price : null,
        mode: "MANUAL",
        reason: `${target.asset} sells on ${name(target.venue)}: holds ₹${Math.round(have)} of ₹${Math.round(target.targetInr)}; ₹${Math.round(best.held)} sits on ${name(best.venue)}.`,
        howTo: `Withdraw ${price ? `≈${formatQuantity(amount / price)} ` : ""}${target.asset} from ${name(best.venue)} to your ${name(target.venue)} ${target.asset} deposit address (check the network both sides support).`,
      });
    } else {
      const autoBuy = target.quote !== undefined && (input.autoBuyVenues ?? []).includes(target.venue);
      actions.push({
        id: `BUY_COIN|${target.asset}|${target.venue}`,
        priority: target.rank,
        kind: "BUY_COIN",
        coins: target.coins,
        asset: target.asset,
        fromVenue: null,
        toVenue: target.venue,
        amountInr: deficit,
        quantity: price ? deficit / price : null,
        mode: autoBuy ? "AUTO" : "MANUAL",
        ...(target.quote ? {buyQuote: target.quote} : {}),
        reason: `${target.asset} sells on ${name(target.venue)}: holds ₹${Math.round(have)} of ₹${Math.round(target.targetInr)} and no other exchange holds it.`,
        howTo: autoBuy
          ? `Capital manager buys ${target.asset} on ${name(target.venue)} with its ${target.quote} (daily buy cap, cash floor and no-premium check apply).`
          : `Buy ${price ? `≈${formatQuantity(deficit / price)} ` : ""}${target.asset} (≈₹${Math.round(deficit)}) on ${name(target.venue)}, or deposit it there.`,
      });
    }
  }

  actions.sort((a, b) => a.priority - b.priority || (a.mode === "AUTO" ? -1 : 1));
  return {actions, covered};
}

function formatQuantity(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 1 ? value.toFixed(2) : value.toPrecision(3);
}
