import { defaultArbitragePolicy } from "../config/policy";
import { comparisonEngine } from "../ComparisonEngine";
import { exchangePairGenerator } from "../engines/ExchangePairGenerator";
import { opportunityEngine } from "../engines/OpportunityEngine";
import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";

import { marketCache } from "../../services/cache.service";

export class OpportunityService {
  private readonly opportunitySnapshots =
    new Map<string, ArbitrageOpportunity>();

  getOpportunities(): ArbitrageOpportunity[] {
    this.removeExpiredSnapshots();

    const snapshots =
      comparisonEngine.groupByMarket(
        marketCache.getAll(),
      );

    const opportunities = snapshots
      .flatMap((snapshot) =>
        exchangePairGenerator.generate(
          snapshot,
        ),
      )
      .map((pair) =>
        opportunityEngine.evaluate(pair),
      )
      .filter(
        (
          opportunity,
        ): opportunity is ArbitrageOpportunity =>
          opportunity !== null,
      )
      .sort(
        (first, second) =>
          second.netProfitPercent -
          first.netProfitPercent,
      );

    for (const opportunity of opportunities) {
      this.opportunitySnapshots.set(
        opportunity.id,
        opportunity,
      );
    }

    return opportunities;
  }

  getOpportunityById(
    opportunityId: string,
  ): ArbitrageOpportunity | null {
    this.removeExpiredSnapshots();

    const opportunity =
      this.opportunitySnapshots.get(
        opportunityId,
      );

    if (!opportunity) {
      return null;
    }

    if (!this.isSnapshotFresh(opportunity)) {
      this.opportunitySnapshots.delete(
        opportunityId,
      );

      return null;
    }

    return opportunity;
  }

  private removeExpiredSnapshots(): void {
    for (const [
      opportunityId,
      opportunity,
    ] of this.opportunitySnapshots) {
      if (!this.isSnapshotFresh(opportunity)) {
        this.opportunitySnapshots.delete(
          opportunityId,
        );
      }
    }
  }

  private isSnapshotFresh(
    opportunity: ArbitrageOpportunity,
  ): boolean {
    const ageMs = Math.max(
      0,
      Date.now() - opportunity.timestamp,
    );

    return (
      opportunity.quotesAreFresh &&
      ageMs <=
        defaultArbitragePolicy
          .maximumQuoteAgeMs
    );
  }
}

export const opportunityService =
  new OpportunityService();