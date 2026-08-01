import type { ArbitragePolicy } from "../models/ArbitragePolicy";

export const defaultArbitragePolicy: ArbitragePolicy = {
  minimumSpreadPercent: 0.2,
  minimumNetProfitPercent: 0.05,
  maximumQuoteAgeMs: 5_000,
  minimumExchangeCount: 2,

  /*
   * Development mode:
   * CoinDCX/Binance feeds me abhi bid/ask null hain,
   * isliye lastPrice fallback temporarily allowed hai.
   *
   * Real execution mode me ise false karna hoga.
   */
  allowLastPriceFallback: true,
};