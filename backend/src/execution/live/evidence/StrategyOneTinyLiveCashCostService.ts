export type StrategyOneTinyLiveSide = "BUY" | "SELL";

export interface StrategyOneTinyLiveCashCostProfile {
  readonly exchange: string;
  readonly market: string;
  readonly side: StrategyOneTinyLiveSide;
  /** Multiplier applied to the authenticated/published trading fee; 0.18 means 18% GST on that fee. */
  readonly tradingFeeSurchargeMultiplier: number;
  /** Immediate statutory withholding as a percent of consideration. */
  readonly withholdingPercent: number;
  readonly evidenceId: string;
}

/**
 * Account/jurisdiction cost overlay used only by the Strategy #1 Tiny-LIVE
 * last-look. It is intentionally separate from PAPER tax-credit accounting.
 *
 * Bybit's signed SANDUSDT execution on this account returned a 1% IND_TDS
 * component and IND_GST equal to 18% of the trading fee. CoinDCX documents
 * 1% withholding on both sides of crypto-to-crypto Spot trades; its existing
 * CAT PRO fee resolver already includes GST in the quoted fee percentage.
 */
export function getStrategyOneTinyLiveCashCostProfile(
  exchangeValue: string,
  marketValue: string,
  side: StrategyOneTinyLiveSide,
): StrategyOneTinyLiveCashCostProfile {
  const exchange = exchangeValue.trim().toLowerCase();
  const market = marketValue.trim().toUpperCase().replace(/[\s_,\-/]+/gu, "");
  if (!/^[a-z0-9_-]{2,30}$/u.test(exchange) || !/^[A-Z0-9]{2,30}$/u.test(market)) {
    throw new Error("Tiny-LIVE cash-cost profile input is invalid.");
  }
  const quoteAsset = ["USDT", "USDC", "FDUSD", "TUSD", "INR", "BTC", "ETH"]
    .find((asset) => market.endsWith(asset) && market.length > asset.length);
  if (!quoteAsset) throw new Error(`Tiny-LIVE cash-cost quote asset is unavailable: ${market}.`);
  const cryptoToCrypto = quoteAsset !== "INR";

  if (exchange === "bybit" && cryptoToCrypto) {
    return freeze({exchange, market, side, tradingFeeSurchargeMultiplier: 0.18, withholdingPercent: 1,
      evidenceId: "BYBIT_SIGNED_EXECUTION_IND_GST_IND_TDS_V1"});
  }
  if (exchange === "coindcx") {
    return freeze({exchange, market, side, tradingFeeSurchargeMultiplier: 0,
      withholdingPercent: cryptoToCrypto || side === "SELL" ? 1 : 0,
      evidenceId: "COINDCX_PUBLISHED_SECTION_194S_V1"});
  }
  return freeze({exchange, market, side, tradingFeeSurchargeMultiplier: 0, withholdingPercent: 0,
    evidenceId: "NO_VENUE_CASH_WITHHOLDING_OVERLAY"});
}

function freeze<T>(value: T): T { return Object.freeze(value); }
