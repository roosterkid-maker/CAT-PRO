import assert
  from "node:assert/strict";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import type {
  StrategyAttribution,
} from "../models/StrategyAttribution";

import {
  StrategyIntentService,
} from "../services/StrategyIntentService";

function main(): void {
  const service =
    new StrategyIntentService({
      maximumIntents:
        10,
    });

  const paperTradesBefore =
    paperTradingService
      .getTrades()
      .length;

  const reservationsBefore =
    capitalReservationService
      .getActive()
      .length;

  const legacy:
    StrategyAttribution = {
    attributionStatus:
      "UNATTRIBUTED_LEGACY",
    strategyId:
      null,
    signalId:
      null,
    intentId:
      null,
  };

  const common = {
    sourceOpportunityId:
      "opportunity-1",
    candidateGeneration:
      "candidate|1000|0",
    market:
      "BTC-USDT",
    buyExchange:
      "binance",
    sellExchange:
      "coindcx",
    proposedCapital:
      100,
    createdAt:
      1_000,
    expiresAt:
      2_000,
  } as const;

  const legacyResult =
    service.proposePaper({
      ...common,
      strategyAttribution:
        legacy,
    });

  assert.equal(
    legacyResult.intent,
    null,
    "Legacy evidence must not receive a fabricated intent.",
  );
  assert.equal(
    legacyResult
      .strategyAttribution
      .attributionStatus,
    "UNATTRIBUTED_LEGACY",
  );

  const attributed:
    StrategyAttribution = {
    attributionStatus:
      "ATTRIBUTED",
    strategyId:
      "cross-exchange-arbitrage",
    signalId:
      "strategy-signal-1",
    intentId:
      null,
  };

  const first =
    service.proposePaper({
      ...common,
      strategyAttribution:
        attributed,
    });

  const duplicate =
    service.proposePaper({
      ...common,
      strategyAttribution:
        attributed,
    });

  assert.ok(
    first.intent,
  );
  assert.equal(
    duplicate.intent?.id,
    first.intent.id,
    "The same genuine proposal evidence must produce a stable intent ID.",
  );
  assert.equal(
    first.intent.executionAuthorized,
    false,
  );
  assert.equal(
    first.intent.automaticExecutionAllowed,
    false,
  );
  assert.equal(
    first.intent.proposedMode,
    "PAPER",
  );
  assert.equal(
    first
      .strategyAttribution
      .intentId,
    first.intent.id,
  );
  assert.equal(
    Object.isFrozen(
      first.intent,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      first.intent.evidence,
    ),
    true,
  );
  assert.equal(
    service.getIntents(
      "cross-exchange-arbitrage",
    ).length,
    1,
    "Deterministic duplicate proposals must not create duplicate intent records.",
  );
  assert.equal(
    "execute" in service,
    false,
  );
  assert.equal(
    "submit" in service,
    false,
  );
  assert.equal(
    "authorize" in service,
    false,
  );

  assert.equal(
    paperTradingService
      .getTrades()
      .length,
    paperTradesBefore,
    "Intent proposal evidence must not create a PAPER trade.",
  );
  assert.equal(
    capitalReservationService
      .getActive()
      .length,
    reservationsBefore,
    "Intent proposal evidence must not reserve capital.",
  );

  console.log(
    "StrategyIntent service deterministic test passed.",
  );
  console.log(
    "Intent evidence was stable and immutable; no PAPER trade, capital reservation, execution authorization, or order submission occurred.",
  );
}

main();
