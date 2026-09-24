import {
  marketCache,
} from "../../services/cache.service";

import {
  getInrArbitrageScanner,
} from "../../strategies/inr-arbitrage/InrArbitrageScannerService";

import {
  usdtInrMid,
} from "../../execution/live/live-only/DailyLossGuard";

import {
  normalizedInventorySnapshotService,
} from "./NormalizedInventorySnapshotService";

/*
 * Rupee valuation of what each exchange holds, shared by the coin study and
 * the refill planner. A coin the venue itself cannot value (e.g. FLR on
 * CoinSwitch) is priced from any venue's live INR or USDT quote.
 */
export interface InventoryValuation {
  readonly usdtInr: number | null;
  /** Units of `asset` held on `venue`; null when that venue's balances are not usable. */
  quantity(venue: string, asset: string): number | null;
  /** INR value of `asset` held on `venue`; null when unknown. */
  holdingInr(venue: string, asset: string): number | null;
  /** INR price of one unit of `asset`; null when no live quote exists. */
  priceInr(asset: string): number | null;
}

export function createInventoryValuation(now = Date.now()): InventoryValuation {
  let usdtInr: number | null = null;
  try {
    usdtInr = usdtInrMid(getInrArbitrageScanner()?.getReport().conversion ?? []);
  } catch {
    usdtInr = null;
  }
  const snapshot = normalizedInventorySnapshotService.getSnapshot(now);

  const priceInr = (assetValue: string): number | null => {
    const asset = assetValue.toUpperCase();
    if (asset === "INR") return 1;
    if (asset === "USDT") return usdtInr;
    const inrQuote = ["coinswitch", "coindcx", "unocoin"]
      .map((venue) => marketCache.get(venue, `${asset}INR`) ?? marketCache.get(venue, `${asset}_INR`))
      .find((quote) => quote && quote.bestBidPrice !== null && quote.bestBidPrice > 0);
    if (inrQuote?.bestBidPrice) return inrQuote.bestBidPrice;
    if (usdtInr === null) return null;
    const usdtQuote = ["binance", "bybit", "coindcx"]
      .map((venue) => marketCache.get(venue, `${asset}USDT`))
      .find((quote) => quote && quote.bestBidPrice !== null && quote.bestBidPrice > 0);
    return usdtQuote?.bestBidPrice ? usdtQuote.bestBidPrice * usdtInr : null;
  };

  const position = (venue: string, asset: string) => {
    const exchange = snapshot.exchanges.find((item) => item.exchange === venue);
    if (!exchange || !exchange.balanceUsableForDecision) return undefined;
    return exchange.assets.find((item) => item.asset.toUpperCase() === asset.toUpperCase()) ?? null;
  };

  return {
    usdtInr,
    quantity: (venue, asset) => {
      const held = position(venue, asset);
      return held === undefined ? null : held === null ? 0 : held.availableAfterReservations;
    },
    holdingInr: (venue, asset) => {
      const held = position(venue, asset);
      if (held === undefined) return null;
      if (held === null) return 0;
      const upper = asset.toUpperCase();
      if (upper === "INR") return held.totalBalance;
      if (usdtInr === null) return null;
      if (upper === "USDT") return held.totalBalance * usdtInr;
      if (held.valuation.totalValueUsdt !== null) return held.valuation.totalValueUsdt * usdtInr;
      const price = priceInr(upper);
      return price === null ? null : held.totalBalance * price;
    },
    priceInr,
  };
}
