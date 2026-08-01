import type { OpportunityDto } from "../dto/OpportunityDto";
import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";

export class OpportunityMapper {
  toDto(
    opportunity: ArbitrageOpportunity,
  ): OpportunityDto {
    return {
      market: opportunity.pair.market,

      buyExchange:
        opportunity.pair.buy.exchange,

      buyPrice:
        opportunity.buyPrice,

      buyAvailableQty:
        opportunity.buyAvailableQty,

      sellExchange:
        opportunity.pair.sell.exchange,

      sellPrice:
        opportunity.sellPrice,

      sellAvailableQty:
        opportunity.sellAvailableQty,

      executableQty:
        opportunity.executableQty,

      rawSpread:
        opportunity.rawSpread,

      rawSpreadPercent:
        opportunity.rawSpreadPercent,

      estimatedFees:
        opportunity.estimatedFees,

      netProfit:
        opportunity.netProfit,

      netProfitPercent:
        opportunity.netProfitPercent,

      usedLastPriceFallback: false,

      quotesAreFresh:
        opportunity.quotesAreFresh,

      score:
        opportunity.score,

      timestamp:
        opportunity.timestamp,
    };
  }

  toDtoList(
    opportunities: ArbitrageOpportunity[],
  ): OpportunityDto[] {
    return opportunities.map(
      (opportunity) =>
        this.toDto(opportunity),
    );
  }
}

export const opportunityMapper =
  new OpportunityMapper();