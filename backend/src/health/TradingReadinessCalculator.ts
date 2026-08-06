import type { TradingReadiness } from "./models/TradingReadiness";

export class TradingReadinessCalculator {
  calculate(input: {
    connectedExchanges: number;
    totalExchanges: number;

    executableQuotes: number;

    opportunities: number;

    diagnosticsHealthy: boolean;
  }): TradingReadiness {
    const reasons: string[] = [];

    const exchangeScore =
      input.totalExchanges > 0
        ? (input.connectedExchanges /
            input.totalExchanges) *
          100
        : 0;

    const marketScore =
      Math.min(
        100,
        input.executableQuotes,
      );

    const opportunityScore =
      input.opportunities > 0
        ? 100
        : 0;

    const diagnosticsScore =
      input.diagnosticsHealthy
        ? 100
        : 0;

    const score =
      exchangeScore * 0.30 +
      marketScore * 0.25 +
      opportunityScore * 0.25 +
      diagnosticsScore * 0.20;

    if (exchangeScore < 100) {
      reasons.push(
        "One or more exchanges are disconnected.",
      );
    }

    if (marketScore < 50) {
      reasons.push(
        "Too few executable quotes.",
      );
    }

    if (opportunityScore === 0) {
      reasons.push(
        "No executable opportunities.",
      );
    }

    if (!input.diagnosticsHealthy) {
      reasons.push(
        "Engine diagnostics unhealthy.",
      );
    }

    return {
      ready:
        score >= 95 &&
        reasons.length === 0,

      score:
        Math.round(score * 100) /
        100,

      exchangeScore,

      marketScore,

      opportunityScore,

      diagnosticsScore,

      reasons,
    };
  }
}

export const tradingReadinessCalculator =
  new TradingReadinessCalculator();