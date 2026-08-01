import { comparisonEngine } from "../ComparisonEngine";
import { exchangePairGenerator } from "../engines/ExchangePairGenerator";
import { opportunityEngine } from "../engines/OpportunityEngine";
import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";

import { marketCache } from "../../services/cache.service";

export class OpportunityService {
  getOpportunities(): ArbitrageOpportunity[] {
    const snapshots = comparisonEngine.groupByMarket(
      marketCache.getAll(),
    );

    return snapshots
      .flatMap((snapshot) =>
        exchangePairGenerator.generate(snapshot),
      )
      .map((pair) => opportunityEngine.evaluate(pair))
      .filter(
        (
          opportunity,
        ): opportunity is ArbitrageOpportunity =>
          opportunity !== null,
      )
      .sort(
        (first, second) =>
          second.netProfitPercent - first.netProfitPercent,
      );
  }
}

export const opportunityService =
  new OpportunityService();