import type { OpportunityDto } from "../dto/OpportunityDto";
import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";

export class OpportunityMapper {
  toDto(
    opportunity: ArbitrageOpportunity,
  ): OpportunityDto {
    return {
      id: opportunity.id,

      market:
        opportunity.pair.market,

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

      requestedCapitalInr:
        opportunity.requestedCapitalInr,

      quoteAsset:
        opportunity.quoteAsset,

      requestedQuoteCapital:
        opportunity.requestedQuoteCapital,

      executableQuoteCapital:
        opportunity.executableQuoteCapital,

      executableCapitalInr:
        opportunity.executableCapitalInr,

      requiredQty:
        opportunity.requiredQty,

      availableExecutableQty:
        opportunity.availableExecutableQty,

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

      liquidityScore:
        opportunity.liquidityScore,

      freshnessScore:
        opportunity.freshnessScore,

      feeScore:
        opportunity.feeScore,

      spreadScore:
        opportunity.spreadScore,

      overallScore:
        opportunity.score,

      decision:
        opportunity.decision,

      analysisSummary:
        opportunity.analysisSummary,

      enoughLiquidity:
        opportunity.enoughLiquidity,

      usedLastPriceFallback:
        opportunity.usedLastPriceFallback,

      quotesAreFresh:
        opportunity.quotesAreFresh,

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
