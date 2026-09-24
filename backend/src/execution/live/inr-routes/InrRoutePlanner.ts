import type {
  OrderBookLevel,
} from "../../../orderbook/models/OrderBookLevel";

/*
 * Action-time sizing for one INR route, from fresh books, balances and
 * exchange rules. Pure: no I/O, no clock.
 *
 * Prices are in each leg's own quote (INR or USDT); `buyToInr` and
 * `sellToInr` convert them for the edge, exactly as the scanner priced the
 * route. `feesPercent` is the scanner's total for the route (every taker
 * fee with surcharges, plus the USDT/INR conversion fee on INR_USDT).
 *
 * The quantity is the largest that
 *   - keeps every marginal unit at or above the net threshold,
 *   - stays inside the capital target and hard cap,
 *   - the buy venue's quote balance can pay for at the buy limit plus fee,
 *   - the sell venue's coin balance covers,
 *   - is a whole multiple of both venues' lot steps,
 * and it must still clear both venues' minimum order and the capital floor.
 */
export interface InrRouteLegRules {
  readonly quantityStep: number | null;
  readonly minimumQuantity: number | null;
  /** In the leg's quote currency. */
  readonly minimumNotional: number | null;
}

export interface InrRoutePlanInput {
  readonly asks: readonly OrderBookLevel[];
  readonly bids: readonly OrderBookLevel[];
  readonly buyToInr: number;
  readonly sellToInr: number;
  readonly feesPercent: number;
  readonly buyFeePercent: number;
  readonly minimumNetPercent: number;
  readonly buyRules: InrRouteLegRules;
  readonly sellRules: InrRouteLegRules;
  /** Free balance of the buy market's quote asset on the buy venue. */
  readonly buyQuoteAvailable: number;
  /** Free balance of the coin on the sell venue. */
  readonly sellBaseAvailable: number;
  readonly minimumCapitalInr: number;
  readonly targetCapitalInr: number;
  readonly maximumCapitalInr: number;
}

export interface InrRoutePlan {
  readonly quantity: number;
  readonly buyLimitPrice: number;
  readonly sellLimitPrice: number;
  readonly buyAveragePrice: number;
  readonly sellAveragePrice: number;
  readonly notionalInr: number;
  readonly expectedNetPercent: number;
  readonly expectedNetInr: number;
}

export type InrRoutePlanResult =
  | {readonly ok: true; readonly plan: InrRoutePlan}
  | {readonly ok: false; readonly reason: string};

const EPSILON = 1e-9;

export function planInrRoute(input: InrRoutePlanInput): InrRoutePlanResult {
  const asks = [...input.asks].filter(validLevel).sort((a, b) => a.price - b.price);
  const bids = [...input.bids].filter(validLevel).sort((a, b) => b.price - a.price);
  if (asks.length === 0 || bids.length === 0) return blocked("BOOK_EMPTY: a fresh book side is empty.");
  if (!(input.buyToInr > 0) || !(input.sellToInr > 0)) return blocked("CONVERSION_UNAVAILABLE: no USDT/INR rate.");

  const step = commonStep(input.buyRules.quantityStep, input.sellRules.quantityStep);
  if (step === null) return blocked("LOT_STEP_INCOMPATIBLE: the two venues' lot steps are unknown or not multiples of each other.");

  const depthQuantity = quantityAtThreshold(asks, bids, input.buyToInr, input.sellToInr, input.feesPercent, input.minimumNetPercent);
  if (depthQuantity <= 0) return blocked(`EDGE_GONE: the fresh books no longer clear ${input.minimumNetPercent}% net.`);

  const bestAskInr = asks[0].price * input.buyToInr;
  let quantity = Math.min(
    depthQuantity,
    input.targetCapitalInr / bestAskInr,
    input.sellBaseAvailable,
  );

  // Fit the buy leg's cash (limit price plus fee) and the hard cap, walking
  // down because the limit price itself depends on the quantity.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    quantity = floorToStep(quantity, step);
    if (quantity <= 0) break;
    const buyLimit = worstPrice(asks, quantity);
    if (buyLimit === null) return blocked("BOOK_TOO_THIN: asks do not cover the sized quantity.");
    const cashNeeded = quantity * buyLimit * (1 + input.buyFeePercent / 100);
    const capInr = quantity * buyLimit * input.buyToInr;
    if (cashNeeded <= input.buyQuoteAvailable + EPSILON && capInr <= input.maximumCapitalInr + EPSILON) break;
    quantity = Math.min(
      quantity - step,
      (input.buyQuoteAvailable / (buyLimit * (1 + input.buyFeePercent / 100))),
      input.maximumCapitalInr / (buyLimit * input.buyToInr),
    );
  }
  quantity = floorToStep(quantity, step);
  if (quantity <= 0) {
    return blocked(
      input.sellBaseAvailable < step
        ? "NO_SELL_INVENTORY: the sell venue holds none of this coin."
        : input.buyQuoteAvailable <= 0
          ? "NO_BUY_FUNDS: the buy venue has no free quote balance."
          : "SIZE_ZERO: balances and lot steps leave no tradable quantity.",
    );
  }

  const buyLimitPrice = worstPrice(asks, quantity);
  const sellLimitPrice = worstPrice(bids, quantity);
  if (buyLimitPrice === null || sellLimitPrice === null) return blocked("BOOK_TOO_THIN: a book side does not cover the sized quantity.");
  const buyAveragePrice = averagePrice(asks, quantity);
  const sellAveragePrice = averagePrice(bids, quantity);

  const costInr = quantity * buyAveragePrice * input.buyToInr;
  const proceedsInr = quantity * sellAveragePrice * input.sellToInr;
  const expectedNetPercent = ((proceedsInr - costInr) / costInr) * 100 - input.feesPercent;
  if (expectedNetPercent < input.minimumNetPercent - EPSILON) {
    return blocked(`EDGE_GONE: sized net ${expectedNetPercent.toFixed(3)}% is below ${input.minimumNetPercent}%.`);
  }
  if (costInr < input.minimumCapitalInr - EPSILON) {
    return blocked(`BELOW_CAPITAL_FLOOR: fundable size ₹${costInr.toFixed(0)} is below the ₹${input.minimumCapitalInr} floor.`);
  }

  for (const [label, rules, price] of [
    ["BUY", input.buyRules, buyLimitPrice],
    ["SELL", input.sellRules, sellLimitPrice],
  ] as const) {
    if (rules.minimumQuantity !== null && quantity < rules.minimumQuantity - EPSILON) {
      return blocked(`BELOW_MINIMUM_ORDER: ${label} quantity ${quantity} is below the venue minimum ${rules.minimumQuantity}.`);
    }
    if (rules.minimumNotional !== null && quantity * price < rules.minimumNotional - EPSILON) {
      return blocked(`BELOW_MINIMUM_ORDER: ${label} notional ${(quantity * price).toFixed(4)} is below the venue minimum ${rules.minimumNotional}.`);
    }
  }

  return {
    ok: true,
    plan: {
      quantity,
      buyLimitPrice,
      sellLimitPrice,
      buyAveragePrice,
      sellAveragePrice,
      notionalInr: costInr,
      expectedNetPercent,
      expectedNetInr: costInr * (expectedNetPercent / 100),
    },
  };
}

/** Quantity matchable while each marginal unit's net stays >= the threshold. */
export function quantityAtThreshold(
  asks: readonly OrderBookLevel[],
  bids: readonly OrderBookLevel[],
  buyToInr: number,
  sellToInr: number,
  feesPercent: number,
  minimumNetPercent: number,
): number {
  let askIndex = 0;
  let bidIndex = 0;
  let askLeft = asks[0]?.quantity ?? 0;
  let bidLeft = bids[0]?.quantity ?? 0;
  let quantity = 0;

  while (askIndex < asks.length && bidIndex < bids.length) {
    const askInr = asks[askIndex].price * buyToInr;
    const bidInr = bids[bidIndex].price * sellToInr;
    if (((bidInr - askInr) / askInr) * 100 - feesPercent < minimumNetPercent) break;
    const take = Math.min(askLeft, bidLeft);
    quantity += take;
    askLeft -= take;
    bidLeft -= take;
    if (askLeft <= EPSILON) askLeft = asks[++askIndex]?.quantity ?? 0;
    if (bidLeft <= EPSILON) bidLeft = bids[++bidIndex]?.quantity ?? 0;
  }

  return quantity;
}

/** Price of the last level needed to fill `quantity` (the limit that crosses it all). */
export function worstPrice(levels: readonly OrderBookLevel[], quantity: number): number | null {
  let remaining = quantity;
  for (const level of levels) {
    remaining -= level.quantity;
    if (remaining <= EPSILON) return level.price;
  }
  return null;
}

export function averagePrice(levels: readonly OrderBookLevel[], quantity: number): number {
  let remaining = quantity;
  let notional = 0;
  for (const level of levels) {
    const take = Math.min(remaining, level.quantity);
    notional += take * level.price;
    remaining -= take;
    if (remaining <= EPSILON) break;
  }
  return notional / quantity;
}

/** The coarser of two lot steps, if it is a whole multiple of the finer one. */
export function commonStep(first: number | null, second: number | null): number | null {
  if (!(first !== null && first > 0) || !(second !== null && second > 0)) return null;
  const coarse = Math.max(first, second);
  const fine = Math.min(first, second);
  const ratio = coarse / fine;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6 ? coarse : null;
}

export function floorToStep(value: number, step: number): number {
  if (!(value > 0)) return 0;
  const units = Math.floor(value / step + 1e-9);
  return roundToStepPrecision(units * step, step);
}

function roundToStepPrecision(value: number, step: number): number {
  const decimals = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 2));
  return Number(value.toFixed(decimals));
}

function validLevel(level: OrderBookLevel): boolean {
  return Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.quantity) && level.quantity > 0;
}

function blocked(reason: string): InrRoutePlanResult {
  return {ok: false, reason};
}
