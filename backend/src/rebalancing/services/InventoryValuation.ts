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
  /** INR value of the FREE `asset` balance on `venue` (not locked or reserved); null when unknown. */
  holdingInr(venue: string, asset: string): number | null;
  /** INR price of one unit of `asset`; null when no live quote exists. */
  priceInr(asset: string): number | null;
  /** Assets with a balance on `venue` (empty when that venue's balances are not usable). */
  assets?(venue: string): readonly string[];
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
    // Only what is free counts: a balance locked in an open order or reserved
    // for an attempt can neither be sold by a route nor moved.
    holdingInr: (venue, asset) => {
      const held = position(venue, asset);
      if (held === undefined) return null;
      if (held === null) return 0;
      const free = Math.max(0, held.availableAfterReservations);
      const upper = asset.toUpperCase();
      if (upper === "INR") return free;
      if (usdtInr === null) return null;
      if (upper === "USDT") return free * usdtInr;
      if (held.valuation.totalValueUsdt !== null && held.totalBalance > 0) {
        return held.valuation.totalValueUsdt * (free / held.totalBalance) * usdtInr;
      }
      const price = priceInr(upper);
      return price === null ? null : free * price;
    },
    priceInr,
    assets: (venue) => {
      const exchange = snapshot.exchanges.find((item) => item.exchange === venue);
      if (!exchange || !exchange.balanceUsableForDecision) return [];
      return exchange.assets.filter((item) => item.totalBalance > 0).map((item) => item.asset.toUpperCase());
    },
  };
}
