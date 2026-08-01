import type { ArbitrageOpportunity } from "./models/ArbitrageOpportunity";
import type { ExchangePair } from "./models/ExchangePair";

export class SpreadEngine {
  calculate(
    pair: ExchangePair,
  ): ArbitrageOpportunity | null {
    const buyPrice =
      pair.buy.bestAskPrice;

    const sellPrice =
      pair.sell.bestBidPrice;

    const buyAvailableQty =
      pair.buy.bestAskQty;

    const sellAvailableQty =
      pair.sell.bestBidQty;

    if (
      !pair.buy.executable ||
      !pair.sell.executable ||
      buyPrice === null ||
      sellPrice === null ||
      buyAvailableQty === null ||
      sellAvailableQty === null ||
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      !Number.isFinite(buyAvailableQty) ||
      !Number.isFinite(sellAvailableQty) ||
      buyPrice <= 0 ||
      sellPrice <= 0 ||
      buyAvailableQty <= 0 ||
      sellAvailableQty <= 0
    ) {
      return null;
    }

    const rawSpread =
      sellPrice - buyPrice;

    if (rawSpread <= 0) {
      return null;
    }

    const rawSpreadPercent =
      (rawSpread / buyPrice) * 100;

    const executableQty =
      Math.min(
        buyAvailableQty,
        sellAvailableQty,
      );

    if (
      !Number.isFinite(executableQty) ||
      executableQty <= 0
    ) {
      return null;
    }

    return {
      pair,

      buyPrice,
      sellPrice,

      buyAvailableQty,
      sellAvailableQty,

      executableQty,

      rawSpread,
      rawSpreadPercent,

      estimatedFees: 0,

      netProfit: rawSpread,
      netProfitPercent:
        rawSpreadPercent,

      usedLastPriceFallback: false,

      quotesAreFresh: true,

      score: 0,

      timestamp: Math.max(
        pair.buy.timestamp,
        pair.sell.timestamp,
      ),
    };
  }
}

export const spreadEngine =
  new SpreadEngine();