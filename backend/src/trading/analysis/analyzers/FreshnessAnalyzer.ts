import type { ArbitrageOpportunity } from "../../../arbitrage/models/ArbitrageOpportunity";

export interface FreshnessAnalysis {
  buyQuoteAgeMs: number;
  sellQuoteAgeMs: number;
  oldestQuoteAgeMs: number;

  maximumQuoteAgeMs: number;

  score: number;
  fresh: boolean;

  reason: string;
}

export class FreshnessAnalyzer {
  analyze(
    opportunity: ArbitrageOpportunity,
    maximumQuoteAgeMs: number,
    now = Date.now(),
  ): FreshnessAnalysis {
    const buyQuoteAgeMs = Math.max(
      0,
      now - opportunity.pair.buy.timestamp,
    );

    const sellQuoteAgeMs = Math.max(
      0,
      now - opportunity.pair.sell.timestamp,
    );

    const oldestQuoteAgeMs = Math.max(
      buyQuoteAgeMs,
      sellQuoteAgeMs,
    );

    const validMaximumAge =
      Number.isFinite(maximumQuoteAgeMs) &&
      maximumQuoteAgeMs > 0
        ? maximumQuoteAgeMs
        : 1;

    const fresh =
      opportunity.quotesAreFresh &&
      oldestQuoteAgeMs <= validMaximumAge;

    const score = Math.max(
      0,
      Math.min(
        100,
        100 -
          (oldestQuoteAgeMs /
            validMaximumAge) *
            100,
      ),
    );

    let reason: string;

    if (!fresh) {
      reason = `Oldest quote is ${oldestQuoteAgeMs}ms old and exceeds the ${validMaximumAge}ms freshness limit.`;
    } else {
      reason = `Both quotes are fresh. Oldest quote age is ${oldestQuoteAgeMs}ms.`;
    }

    return {
      buyQuoteAgeMs,
      sellQuoteAgeMs,
      oldestQuoteAgeMs,

      maximumQuoteAgeMs:
        validMaximumAge,

      score,
      fresh,

      reason,
    };
  }
}

export const freshnessAnalyzer =
  new FreshnessAnalyzer();