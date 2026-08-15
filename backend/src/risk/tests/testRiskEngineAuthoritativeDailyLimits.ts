import assert from "node:assert/strict";

import {
  RiskEngine,
} from "../services/RiskEngine";

const baseRequest = {
  capital: 100,
  confidence: 100,
  fillPercent: 100,
  netProfit: 10,
  executionTimeMs: 10,
  liquidityScore: 100,
  quoteAgeMs: 10,
  exchangeConnected: true,
  balanceAvailable: true,
  dailyLoss: 0,
  dailyTradeCount: 56,
  quotesFresh: true,
  pairSynchronized: true,
};

function main(): void {
  const engine =
    new RiskEngine({
      getDailyLimits:
        () => ({
          maximumDailyLoss: 10_000,
          maximumDailyTrades: 500,
        }),
    });

  const withinBudget =
    engine.assess(
      baseRequest,
    );

  assert.ok(
    !withinBudget.reasons.some(
      (
        reason,
      ) =>
        reason.includes(
          "Daily trade limit",
        ),
    ),
    "56 PAPER trades must remain inside the authoritative 500-trade account policy.",
  );

  const exhausted =
    engine.assess({
      ...baseRequest,
      dailyTradeCount:
        500,
    });

  assert.ok(
    exhausted.reasons.includes(
      "Daily trade limit of 500 has been reached.",
    ),
  );
  assert.equal(
    exhausted.checks.dailyLimitsAllowed,
    false,
  );

  console.log(
    "RISK ENGINE AUTHORITATIVE DAILY LIMITS TEST PASSED.",
  );
  console.log(
    "The unified risk decision consumes the trading-account policy and no longer enforces a conflicting hard-coded 50-trade ceiling.",
  );
}

main();
