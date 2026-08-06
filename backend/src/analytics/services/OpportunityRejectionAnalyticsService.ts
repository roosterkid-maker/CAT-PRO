import { opportunityService } from "../../arbitrage/services/OpportunityService";
import { opportunityEngine } from "../../arbitrage/engines/OpportunityEngine";

export interface OpportunityRejectionAnalytics {
  generatedAt: number;

  cachedQuotes: number;

  marketSnapshots: number;

  exchangePairs: number;

  evaluatedPairs: number;

  acceptedOpportunities: number;

  rejectedOpportunities: number;

  rejections: {
    evaluator: number;
    invalidMarketData: number;
    spread: number;
    netProfit: number;
    quantity: number;
    liquidity: number;
    freshness: number;
    fees: number;
    spreadAnalysis: number;
  };

  evaluatorRejections: {
    staleBuyQuote: number;
    staleSellQuote: number;
    staleBothQuotes: number;
    priceResolutionFailed: number;
    buyFeeMissing: number;
    sellFeeMissing: number;
    invalidBuyPrice: number;
    invalidSellPrice: number;
  };
}

export class OpportunityRejectionAnalyticsService {
  generate(): OpportunityRejectionAnalytics {
    const opportunities =
      opportunityService.getOpportunities();

    const diagnostics =
      opportunityEngine.getDiagnostics();

    const engine =
      diagnostics.engine;

    const evaluator =
      diagnostics.evaluator;

    const rejectedOpportunities =
      engine.evaluatorRejected +
      engine.invalidMarketData +
      engine.spreadRejected +
      engine.netProfitRejected +
      engine.quantityRejected +
      engine.liquidityRejected +
      engine.freshnessRejected +
      engine.feeRejected +
      engine.spreadAnalysisRejected;

    return {
      generatedAt: Date.now(),

      cachedQuotes: 0,

      marketSnapshots: 0,

      exchangePairs:
        engine.evaluated,

      evaluatedPairs:
        engine.evaluated,

      acceptedOpportunities:
        opportunities.length,

      rejectedOpportunities,

      rejections: {
        evaluator:
          engine.evaluatorRejected,

        invalidMarketData:
          engine.invalidMarketData,

        spread:
          engine.spreadRejected,

        netProfit:
          engine.netProfitRejected,

        quantity:
          engine.quantityRejected,

        liquidity:
          engine.liquidityRejected,

        freshness:
          engine.freshnessRejected,

        fees:
          engine.feeRejected,

        spreadAnalysis:
          engine.spreadAnalysisRejected,
      },

      evaluatorRejections: {
        staleBuyQuote:
          evaluator.staleBuyQuote,

        staleSellQuote:
          evaluator.staleSellQuote,

        staleBothQuotes:
          evaluator.staleBothQuotes,

        priceResolutionFailed:
          evaluator.priceResolutionFailed,

        buyFeeMissing:
          evaluator.buyFeeMissing,

        sellFeeMissing:
          evaluator.sellFeeMissing,

        invalidBuyPrice:
          evaluator.invalidBuyPrice,

        invalidSellPrice:
          evaluator.invalidSellPrice,
      },
    };
  }
}

export const opportunityRejectionAnalyticsService =
  new OpportunityRejectionAnalyticsService();