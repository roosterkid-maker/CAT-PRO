import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";
import { getExchangeFeeEvidence } from "../config/fees";

export class FeeEngine {
  apply(
    opportunity: ArbitrageOpportunity,
  ): ArbitrageOpportunity | null {
    const buyFeeConfig =
      getExchangeFeeEvidence(
        opportunity.pair.buy.exchange,
        opportunity.pair.market,
      );

    const sellFeeConfig =
      getExchangeFeeEvidence(
        opportunity.pair.sell.exchange,
        opportunity.pair.market,
      );

    if (
      !buyFeeConfig ||
      !sellFeeConfig
    ) {
      return null;
    }

    const buyPrice =
      opportunity.buyPrice;

    const sellPrice =
      opportunity.sellPrice;

    if (
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      buyPrice <= 0 ||
      sellPrice <= 0
    ) {
      return null;
    }

    const buyFeeAmount =
      buyPrice *
      (buyFeeConfig.takerPercent / 100);

    const sellFeeAmount =
      sellPrice *
      (sellFeeConfig.takerPercent / 100);

    const estimatedFees =
      buyFeeAmount + sellFeeAmount;

    const netProfit =
      opportunity.rawSpread -
      estimatedFees;

    const netProfitPercent =
      (netProfit / buyPrice) * 100;

    return {
      ...opportunity,

      estimatedFees,

      netProfit,

      netProfitPercent,
    };
  }
}

export const feeEngine =
  new FeeEngine();
